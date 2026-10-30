// 分享連結：dashboard_shares 表與分享結果（ADR 0012）。
//
// 分享結果在擁有者的瀏覽器算（utils/shareSnapshot.ts），需要儀表板目前的資料集與它已載入的資料列；
// 建立連結時寫入一次，之後每次儲存儀表板由 dashboardService 交給 save_dashboard，和設定在同一個 transaction 裡寫入。
// 看的人不用登入，只能透過 get_shared_dashboard 讀分享結果（fetchSharedDashboard）。

import { isShareToken } from '../utils/shareLink.ts';
import { buildSnapshot, SNAPSHOT_VERSION } from '../utils/shareSnapshot.ts';
import type { ShareSnapshot } from '../utils/shareSnapshot.ts';
import type { Dashboard } from '../types/index.ts';
import { sessionGuard } from './session.ts';
import { supabase } from './supabase.ts';
import { useAppStore } from '../store/appStore.ts';
import type { ShareLink } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';

// 登入後由 services/userData.ts 載入。不讀 snapshot：分享結果可能很大，擁有者端用不到。
const SHARE_COLUMNS = 'dashboard_id, token, expires_at, snapshot_at';

function toShareLink(row: {
  dashboard_id: string;
  token: string;
  expires_at: string | null;
  snapshot_at: string;
}): ShareLink {
  return {
    dashboardId: row.dashboard_id,
    token: row.token,
    expiresAt: row.expires_at,
    snapshotAt: row.snapshot_at,
  };
}

export async function fetchShares(): Promise<ShareLink[]> {
  const { data, error } = await supabase.from('dashboard_shares').select(SHARE_COLUMNS);
  if (error) throw new Error(`載入分享連結失敗：${error.message}`);
  return data.map(toShareLink);
}

// 算出這個儀表板的分享結果。資料集已經不存在時是 null：連結本來就失效了（ADR 0012 §4），沒有東西可以算。
// 資料列還沒載入完成或載入失敗時丟錯。
function snapshotOf(dashboard: Dashboard): ShareSnapshot | null {
  const dataset = useAppStore.getState().datasets.find((d) => d.id === dashboard.datasetId);
  if (!dataset) return null;
  const entry = useRowsStore.getState().byDataset[dataset.id];
  if (entry?.status !== 'ready') {
    throw new Error('資料還沒載入完成，無法產生分享連結的內容，請稍後再試');
  }
  return buildSnapshot(dashboard, dataset, entry.rows);
}

// 儲存時要一起寫入的分享結果。沒有分享連結時是 null，只存設定。
// 丟錯時存檔整個失敗、維持「未儲存」，稍後再按一次就好。
export function snapshotForSave(dashboard: Dashboard): ShareSnapshot | null {
  return useAppStore.getState().shares[dashboard.id] ? snapshotOf(dashboard) : null;
}

// 建立分享連結。分享的是最後一次儲存的版本：有未儲存的變更時用 draftBase，對話框會提醒。
// token 由資料庫產生。expiresAt 是 null 代表永不過期。
export async function createShare(dashboardId: string, expiresAt: string | null): Promise<void> {
  const isCurrent = sessionGuard();
  const { dashboards, draftBase } = useAppStore.getState();
  const saved =
    draftBase?.id === dashboardId ? draftBase : dashboards.find((d) => d.id === dashboardId);
  if (!saved) throw new Error('建立分享連結失敗：找不到這個儀表板');
  const snapshot = snapshotOf(saved);
  if (!snapshot) throw new Error('建立分享連結失敗：這個儀表板的資料集已不存在');
  const { data, error } = await supabase
    .from('dashboard_shares')
    .insert({ dashboard_id: dashboardId, snapshot, expires_at: expiresAt })
    .select(SHARE_COLUMNS)
    .single();
  if (error) throw new Error(`建立分享連結失敗：${error.message}`);
  if (isCurrent()) useAppStore.getState().putShare(toShareLink(data));
}

// 延長或縮短到期日，網址不變（ADR 0012 §4）。
export async function updateShareExpiry(
  dashboardId: string,
  expiresAt: string | null,
): Promise<void> {
  const isCurrent = sessionGuard();
  const { data, error } = await supabase
    .from('dashboard_shares')
    .update({ expires_at: expiresAt })
    .eq('dashboard_id', dashboardId)
    .select(SHARE_COLUMNS)
    .single();
  if (error) throw new Error(`修改到期日失敗：${error.message}`);
  if (isCurrent()) useAppStore.getState().putShare(toShareLink(data));
}

// 撤銷 = 刪除這條連結和它的分享結果，連結立刻失效；重新建立時網址會換成新的。
export async function revokeShare(dashboardId: string): Promise<void> {
  const isCurrent = sessionGuard();
  const { error } = await supabase
    .from('dashboard_shares')
    .delete()
    .eq('dashboard_id', dashboardId);
  if (error) throw new Error(`撤銷分享連結失敗：${error.message}`);
  if (isCurrent()) useAppStore.getState().removeShare(dashboardId);
}

// 分享頁讀到的結果。invalid：連結不存在、已撤銷、已過期，或儀表板、資料集已刪除，一律不說明原因。
// outdated：分享結果的格式比目前的程式舊，要請分享的人重新儲存一次。
export type SharedDashboard =
  | { status: 'invalid' }
  | { status: 'outdated' }
  | { status: 'ready'; snapshot: ShareSnapshot; snapshotAt: string };

// 網路或資料庫錯誤時丟錯，分享頁顯示「重試」。
export async function fetchSharedDashboard(token: string): Promise<SharedDashboard> {
  if (!isShareToken(token)) return { status: 'invalid' };
  const { data, error } = await supabase.rpc('get_shared_dashboard', { p_token: token });
  if (error) throw new Error(error.message);
  if (data === null) return { status: 'invalid' };
  const { snapshot, snapshotAt } = data as { snapshot: ShareSnapshot; snapshotAt: string };
  if (snapshot.version !== SNAPSHOT_VERSION) return { status: 'outdated' };
  return { status: 'ready', snapshot, snapshotAt };
}
