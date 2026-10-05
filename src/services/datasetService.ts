// 資料集的匯入與刪除流程，串起解析（parseWorkbook）、IndexedDB（datasetRows）與兩個 store。
//
// UI（WorkbookActions、DatasetCard）只呼叫這裡，不直接碰儲存層。

import { createId } from '../utils/ids.ts';
import type { Dataset } from '../types/index.ts';
import { parseWorkbook } from './parseWorkbook.ts';
import { deleteDatasetRows, saveDatasetRows } from './datasetRows.ts';
import { useAppStore } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';

// 解析 → 存資料列 → 放進快取 → 寫入設定。
// 全部工作表都不合格時直接丟錯，訊息附上每張表被跳過的原因。
export async function importWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  name = fileName.replace(/\.xlsx$/i, ''),
): Promise<Dataset> {
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
  // 先存資料列再寫設定：若順序相反而中途失敗，設定裡會出現一個找不到資料的資料集。
  await saveDatasetRows(dataset.id, parsed.rows);
  useRowsStore.getState().put(dataset.id, parsed.rows);
  useAppStore.getState().addDataset(dataset);
  return dataset;
}

// 刪除資料集的設定、快取與 IndexedDB 資料。指向它的儀表板會保留，畫面上顯示「資料集遺失」。
export async function deleteDataset(datasetId: string): Promise<void> {
  useAppStore.getState().removeDataset(datasetId);
  useRowsStore.getState().drop(datasetId);
  await deleteDatasetRows(datasetId);
}
