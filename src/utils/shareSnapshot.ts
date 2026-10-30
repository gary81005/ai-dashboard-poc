// 分享結果（ADR 0012）：把整個儀表板算成看的人需要的內容，存進 dashboard_shares.snapshot。
//
// 看的人拿不到原始資料列，所以每個元件的結果都在擁有者的瀏覽器算好（utils/widgetView.ts，和卡片同一套）。
// 儀表板篩選一律算「全部」：選的值只存在 uiStore，按儲存當下剛好選了什麼不該影響分享出去的內容。
// 元件篩選照設定套用，但只留摘要文字，設定裡的篩選值不放進分享結果。

import type { Dashboard, Dataset, DatasetRows, LayoutItem, Widget } from '../types/index.ts';
import type { WidgetResult } from './computeWidget.ts';
import { widgetView } from './widgetView.ts';

// 分享結果的格式版本，和設定的 SCHEMA_VERSION 分開。每次儲存都會重算，所以不寫轉換步驟：
// 分享頁讀到不認得的版本，就請分享的人重新儲存一次。改了 WidgetResult 或這裡的形狀就要加 1。
export const SNAPSHOT_VERSION = 1;

export type SharedWidget = {
  // 畫圖用的設定（類型、標題、說明、樣式選項、文字內容）；filters 一律清空。
  widget: Widget;
  filterSummary: string;
  // 文字元件是 null。
  result: WidgetResult | null;
};

export type ShareSnapshot = {
  version: number;
  name: string;
  layout: LayoutItem[];
  widgets: SharedWidget[];
};

export function buildSnapshot(
  dashboard: Dashboard,
  dataset: Dataset,
  rows: DatasetRows,
): ShareSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    name: dashboard.name,
    layout: dashboard.layout,
    widgets: dashboard.widgets.map((widget) => {
      const { filterSummary, result } = widgetView(widget, dataset, rows);
      return { widget: { ...widget, filters: [] }, filterSummary, result };
    }),
  };
}
