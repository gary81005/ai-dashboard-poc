// 使用者資料的載入與清空：登入後一次載入資料集、儀表板與分享連結，登出時清掉記憶體裡的所有資料（ADR 0007）。
//
// 由 services/auth.ts 在換人時呼叫；載入失敗時 App 的「重試」按鈕也呼叫 loadUserData。

import { fetchDashboards } from './dashboardService.ts';
import { fetchDatasets } from './datasetService.ts';
import { fetchShares } from './shareService.ts';
import { invalidateSession, sessionGuard } from './session.ts';
import { useAppStore } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';
import { useUiStore } from '../store/uiStore.ts';

export async function loadUserData(): Promise<void> {
  const isCurrent = sessionGuard();
  const { setDatasets, setDashboards, setShares, setLoadStatus } = useAppStore.getState();
  setLoadStatus({ status: 'loading' });
  try {
    const [datasets, dashboards, shares] = await Promise.all([
      fetchDatasets(),
      fetchDashboards(),
      fetchShares(),
    ]);
    if (!isCurrent()) return;
    setDatasets(datasets);
    setDashboards(dashboards);
    setShares(shares);
    setLoadStatus({ status: 'ready' });
  } catch (error) {
    if (!isCurrent()) return;
    setLoadStatus({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// 清掉上一位使用者的資料集、儀表板（含未儲存的變更）、資料列與畫面狀態，並讓他還在進行中的請求作廢。
export function resetUserData(): void {
  invalidateSession();
  const { draftBase, setDatasets, setDashboards, setShares, setLoadStatus } =
    useAppStore.getState();
  setDatasets([]);
  setDashboards([]);
  setShares([]);
  setLoadStatus({ status: 'idle' });
  useRowsStore.getState().clear();
  useUiStore.setState({
    view: 'dashboards',
    editing: false,
    selectedWidgetId: null,
    pendingLeave: null,
  });
  // 在 App 裡按「登出」會先經過 uiStore.leave，到這裡時已經沒有未儲存的變更；
  // 還有的話就是 session 過期或在別的分頁登出，變更來不及問就被丟掉了，要告訴使用者。
  if (draftBase) {
    useUiStore
      .getState()
      .notify({ severity: 'warning', message: '登入已失效，未儲存的變更已捨棄' });
  }
}
