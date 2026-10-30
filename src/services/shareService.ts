// 分享連結：dashboard_shares 表與分享結果（ADR 0012）。
//
// 分享結果在擁有者的瀏覽器算（utils/shareSnapshot.ts），需要儀表板目前的資料集與它已載入的資料列；
// 儲存儀表板時由 dashboardService 交給 save_dashboard，和設定在同一個 transaction 裡寫入。
// 看的人不用登入，只能透過 get_shared_dashboard 讀分享結果（fetchSharedDashboard）。

import { isShareToken } from '../utils/shareLink.ts';
import { buildSnapshot, SNAPSHOT_VERSION } from '../utils/shareSnapshot.ts';
import type { ShareSnapshot } from '../utils/shareSnapshot.ts';
import type { Dashboard } from '../types/index.ts';
import { supabase } from './supabase.ts';
import { useAppStore } from '../store/appStore.ts';
import type { ShareLink } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';

// 登入後由 services/userData.ts 載入。不讀 snapshot：分享結果可能很大，擁有者端用不到。
export async function fetchShares(): Promise<ShareLink[]> {
  const { data, error } = await supabase
    .from('dashboard_shares')
    .select('dashboard_id, token, expires_at, snapshot_at');
  if (error) throw new Error(`載入分享連結失敗：${error.message}`);
  return data.map((row) => ({
    dashboardId: row.dashboard_id,
    token: row.token,
    expiresAt: row.expires_at,
    snapshotAt: row.snapshot_at,
  }));
}

// 儲存時要一起寫入的分享結果。沒有分享連結時是 null，只存設定。
// 資料集已經不存在時也是 null：連結本來就失效了（ADR 0012 §4），沒有東西可以算。
// 資料列還沒載入完成或載入失敗時丟錯，存檔整個失敗、維持「未儲存」，稍後再按一次就好。
export function snapshotForSave(dashboard: Dashboard): ShareSnapshot | null {
  const { shares, datasets } = useAppStore.getState();
  if (!shares[dashboard.id]) return null;
  const dataset = datasets.find((d) => d.id === dashboard.datasetId);
  if (!dataset) return null;
  const entry = useRowsStore.getState().byDataset[dataset.id];
  if (entry?.status !== 'ready') {
    throw new Error('資料還沒載入完成，無法更新分享連結的內容，請稍後再儲存');
  }
  return buildSnapshot(dashboard, dataset, entry.rows);
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
