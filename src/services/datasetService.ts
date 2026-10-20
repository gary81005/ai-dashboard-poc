// 資料集的讀取、匯入、編輯與刪除流程，串起解析（parseWorkbook）、Supabase（datasets 表、
// datasetRows、sourceFiles）與兩個 store（ADR 0007）。
//
// UI（WorkbookActions、DatasetCard、TableFieldsAccordion…）只呼叫這裡，不直接碰儲存層。

import { createId } from '../utils/ids.ts';
import { migrateRecord } from '../utils/schema.ts';
import type { Json } from '../types/database.ts';
import type { Dataset } from '../types/index.ts';
import { SCHEMA_VERSION } from '../types/index.ts';
import { parseWorkbook } from './parseWorkbook.ts';
import { insertDatasetRows } from './datasetRows.ts';
import type { Progress } from './datasetRows.ts';
import { sessionGuard } from './session.ts';
import { removeSourceFiles, uploadSourceFile } from './sourceFiles.ts';
import { supabase } from './supabase.ts';
import { useAppStore } from '../store/appStore.ts';
import type { FieldPatch } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';
import { useUiStore } from '../store/uiStore.ts';

// 上傳到一半就關掉分頁時，資料集會一直停在 uploading；超過這個時間就視為中斷，登入時清掉。
const STALE_UPLOAD_MS = 60 * 60 * 1000;

function toDataset(record: { body: Json; schema_version: number }): Dataset {
  return migrateRecord<Dataset>(record.body, record.schema_version, '資料集');
}

// 登入後由 services/userData.ts 載入資料集清單（只有中繼資料，資料列等開啟儀表板時才載入），舊的在前。
// 順便清掉中斷的上傳。
export async function fetchDatasets(): Promise<Dataset[]> {
  await cleanUpStaleUploads();
  const { data, error } = await supabase
    .from('datasets')
    .select('body, schema_version')
    .eq('status', 'ready')
    .order('created_at');
  if (error) throw new Error(`載入資料集失敗：${error.message}`);
  return data.map(toDataset);
}

async function cleanUpStaleUploads(): Promise<void> {
  const before = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const { data, error } = await supabase
    .from('datasets')
    .delete()
    .eq('status', 'uploading')
    .lt('created_at', before)
    .select('id');
  // 清理失敗不影響使用，下次登入再試。
  if (error) console.error('清理中斷的上傳失敗', error);
  else await removeSourceFiles(data.map((d) => d.id));
}

// 解析 → 建立 uploading 記錄 → 原始檔 → 分批寫入資料列 → 改成 ready → 放進 store。
// 全部工作表都不合格時直接丟錯，訊息附上每張表被跳過的原因。
// 建立記錄之後任何一步失敗，就刪掉整個資料集（資料列由 cascade 清掉），再把錯誤往上丟。
export async function importWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  name = fileName.replace(/\.xlsx$/i, ''),
  onProgress?: Progress,
): Promise<Dataset> {
  const isCurrent = sessionGuard();
  const parsed = await parseWorkbook(buffer);
  if (parsed.tables.length === 0) {
    const reasons = parsed.skippedSheets.map((s) => `${s.sheetName}：${s.reason}`).join('；');
    throw new Error(`沒有任何符合規範的資料表${reasons ? `（${reasons}）` : ''}`);
  }
  const dataset: Dataset = {
    id: createId('ds'),
    name,
    fileName,
    uploadedAt: new Date().toISOString(),
    tables: parsed.tables,
    ...(parsed.skippedSheets.length > 0 ? { skippedSheets: parsed.skippedSheets } : {}),
  };

  const { error } = await supabase
    .from('datasets')
    .insert({ id: dataset.id, schema_version: SCHEMA_VERSION, body: dataset });
  if (error) throw new Error(`建立資料集失敗：${error.message}`);

  try {
    await uploadSourceFile(dataset.id, buffer);
    await insertDatasetRows(dataset.id, parsed.rows, onProgress);
    const { error: readyError } = await supabase
      .from('datasets')
      .update({ status: 'ready' })
      .eq('id', dataset.id);
    if (readyError) throw new Error(`完成上傳失敗：${readyError.message}`);
  } catch (error) {
    await supabase.from('datasets').delete().eq('id', dataset.id);
    await removeSourceFiles([dataset.id]);
    throw error;
  }

  // 上傳期間登出或換了帳號：資料集已經存進原帳號，但不要放進下一位使用者的 store。
  if (!isCurrent()) return dataset;
  useRowsStore.getState().put(dataset.id, parsed.rows);
  useAppStore.getState().addDataset(dataset);
  return dataset;
}

// 先刪資料庫再更新畫面：刪除失敗時資料集仍留在清單上。指向它的儀表板會保留，顯示「資料集遺失」。
export async function deleteDataset(datasetId: string): Promise<void> {
  const { error } = await supabase.from('datasets').delete().eq('id', datasetId);
  if (error) throw new Error(`刪除失敗：${error.message}`);
  useAppStore.getState().removeDataset(datasetId);
  useRowsStore.getState().drop(datasetId);
  await removeSourceFiles([datasetId]);
}

// ── 編輯中繼資料：先更新畫面，再把整份 body 寫回資料庫 ──────────────────────
// 同一個資料集的寫入排隊依序執行，每次都寫當下 store 裡最新的版本，連續切換時不會被舊的覆蓋。
// 寫入失敗就從資料庫讀回目前的版本，讓畫面和資料庫一致，並跳出提示。

const writeQueue = new Map<string, Promise<void>>();

function persist(datasetId: string): void {
  const isCurrent = sessionGuard();
  const previous = writeQueue.get(datasetId) ?? Promise.resolve();
  const next = previous.then(async () => {
    if (!isCurrent()) return;
    const dataset = useAppStore.getState().datasets.find((d) => d.id === datasetId);
    if (!dataset) return;
    const { error } = await supabase
      .from('datasets')
      .update({ body: dataset, schema_version: SCHEMA_VERSION })
      .eq('id', datasetId);
    if (error && isCurrent()) {
      useUiStore
        .getState()
        .notify({ severity: 'error', message: `儲存「${dataset.name}」失敗：${error.message}` });
      await refreshDataset(datasetId, isCurrent);
    }
  });
  // 這一次失敗（例如讀回的版本比程式新，toDataset 丟錯）不能讓佇列卡在 rejected，
  // 否則之後同一個資料集的寫入都會被跳過。
  writeQueue.set(
    datasetId,
    next.catch((error: unknown) => console.error('儲存資料集失敗', error)),
  );
}

async function refreshDataset(datasetId: string, isCurrent: () => boolean): Promise<void> {
  const { data } = await supabase
    .from('datasets')
    .select('body, schema_version')
    .eq('id', datasetId)
    .maybeSingle();
  if (data && isCurrent()) useAppStore.getState().replaceDataset(toDataset(data));
}

export function setTableHidden(datasetId: string, tableKey: string, hidden: boolean): void {
  useAppStore.getState().setTableHidden(datasetId, tableKey, hidden);
  persist(datasetId);
}

export function updateField(
  datasetId: string,
  tableKey: string,
  header: string,
  patch: FieldPatch,
): void {
  useAppStore.getState().updateField(datasetId, tableKey, header, patch);
  persist(datasetId);
}

// 一次修改多個欄位（欄位健檢的「全部套用」），只寫回資料庫一次。
export function updateFields(
  datasetId: string,
  changes: ReadonlyArray<{ tableKey: string; header: string; patch: FieldPatch }>,
): void {
  const { updateField: apply } = useAppStore.getState();
  for (const { tableKey, header, patch } of changes) apply(datasetId, tableKey, header, patch);
  persist(datasetId);
}

// 整份替換（切換資料來源時沿用欄位角色，見 RebindDialog）。
export function saveDataset(dataset: Dataset): void {
  useAppStore.getState().replaceDataset(dataset);
  persist(dataset.id);
}
