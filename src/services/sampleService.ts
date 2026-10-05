// 「載入範例資料」：下載 public/samples/ 的範例活頁簿，照一般上傳流程匯入，
// 再依 constants/sampleDashboard.ts 建立範例儀表板，並設為目前開啟的儀表板。

import { importWorkbook } from './datasetService.ts';
import type { Dashboard } from '../types/index.ts';
import { useAppStore } from '../store/appStore.ts';
import {
  SAMPLE_DATASET_NAME,
  SAMPLE_FILE,
  createSampleDashboard,
} from '../constants/sampleDashboard.ts';

export async function loadSample(): Promise<Dashboard> {
  // 檔名含中文所以要編碼；BASE_URL 讓部署在子路徑時也找得到檔案。
  const url = `${import.meta.env.BASE_URL}samples/${encodeURIComponent(SAMPLE_FILE)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`無法下載範例檔（HTTP ${response.status}）`);
  const dataset = await importWorkbook(
    await response.arrayBuffer(),
    SAMPLE_FILE,
    SAMPLE_DATASET_NAME,
  );
  const dashboard = createSampleDashboard(dataset.id);
  const { addDashboard, setActiveDashboard } = useAppStore.getState();
  addDashboard(dashboard);
  setActiveDashboard(dashboard.id);
  return dashboard;
}
