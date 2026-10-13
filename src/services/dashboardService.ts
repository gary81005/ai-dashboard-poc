// 儀表板的讀取、新增、刪除與儲存流程：dashboards 表（ADR 0007）。
//
// 清單層級的操作（新增、複製、匯入、刪除）等資料庫寫入成功才更新畫面；
// 儀表板內容的修改先只存在記憶體（appStore.draftBase 標記未儲存），按「儲存」才由 saveActiveDashboard 寫入。

import { migrateRecord } from '../utils/schema.ts';
import type { Json } from '../types/database.ts';
import type { Dashboard } from '../types/index.ts';
import { SCHEMA_VERSION } from '../types/index.ts';
import { sessionGuard } from './session.ts';
import { supabase } from './supabase.ts';
import { useAppStore } from '../store/appStore.ts';

function toDashboard(record: { body: Json; schema_version: number }): Dashboard {
  return migrateRecord<Dashboard>(record.body, record.schema_version, '儀表板');
}

// 登入後由 services/userData.ts 載入，舊的在前。
export async function fetchDashboards(): Promise<Dashboard[]> {
  const { data, error } = await supabase
    .from('dashboards')
    .select('body, schema_version')
    .order('created_at');
  if (error) throw new Error(`載入儀表板失敗：${error.message}`);
  return data.map(toDashboard);
}

// 新增、複製、匯入、範例都走這裡。
export async function createDashboard(dashboard: Dashboard): Promise<void> {
  const isCurrent = sessionGuard();
  const { error } = await supabase
    .from('dashboards')
    .insert({ id: dashboard.id, schema_version: SCHEMA_VERSION, body: dashboard });
  if (error) throw new Error(`建立儀表板失敗：${error.message}`);
  if (isCurrent()) useAppStore.getState().addDashboard(dashboard);
}

export async function deleteDashboard(dashboardId: string): Promise<void> {
  const isCurrent = sessionGuard();
  const { error } = await supabase.from('dashboards').delete().eq('id', dashboardId);
  if (error) throw new Error(`刪除儀表板失敗：${error.message}`);
  if (isCurrent()) useAppStore.getState().removeDashboard(dashboardId);
}

// 進行中的存檔。頁面的「儲存」和對話框的「儲存並離開」可能同時觸發，共用同一次請求。
let inFlight: Promise<void> | null = null;

// 把目前開啟的儀表板寫進資料庫。失敗時丟錯，畫面維持「未儲存」，再按一次就重試。
export function saveActiveDashboard(): Promise<void> {
  inFlight ??= writeActiveDashboard().finally(() => {
    inFlight = null;
    useAppStore.getState().setSaving(false);
  });
  return inFlight;
}

async function writeActiveDashboard(): Promise<void> {
  const isCurrent = sessionGuard();
  const { dashboards, activeDashboardId, draftBase, setSaving } = useAppStore.getState();
  const dashboard = dashboards.find((d) => d.id === activeDashboardId);
  if (!dashboard || !draftBase) return;
  setSaving(true);
  const { data, error } = await supabase
    .from('dashboards')
    .update({ body: dashboard, schema_version: SCHEMA_VERSION })
    .eq('id', dashboard.id)
    .select('id');
  if (error) throw new Error(`儲存失敗：${error.message}`);
  if (data.length === 0)
    throw new Error('儲存失敗：資料庫裡找不到這個儀表板，可能已在其他地方刪除');
  if (!isCurrent()) return;
  const state = useAppStore.getState();
  // 換頁一定先經過 uiStore.leave，存檔期間不會換到別的儀表板；這裡只是保險，不要把基準記到別的儀表板上。
  if (state.activeDashboardId !== dashboard.id) return;
  // 存檔期間又有新的修改：剛存的版本成為新的基準，畫面維持「未儲存」。
  const latest = state.dashboards.find((d) => d.id === dashboard.id);
  state.setDraftBase(latest === dashboard ? null : dashboard);
}
