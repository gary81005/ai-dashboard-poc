// 範例儀表板 fixture：搭配 public/samples/ 的範例活頁簿，由 services/sampleService.ts 載入。
// 內容與 docs/adr/0005「範例儀表板」一致，也是設定格式的實際驗證案例（必須通過型別檢查）。

import { createId } from '../utils/ids.ts';
import type { Dashboard, FieldRef, LayoutItem, Widget } from '../types/index.ts';

export const SAMPLE_FILE = '連鎖門市年度營運績效表_2025_v2_標準化.xlsx';
export const SAMPLE_DATASET_NAME = '範例：2025 門市營運';

const period: FieldRef = { header: '年月', code: 'period' };
const revenue: FieldRef = { header: '營業額', code: 'revenue' };

const widgets: Widget[] = [
  {
    id: 'w_kpi_revenue',
    type: 'kpi',
    title: '全年營業額',
    table: 'tbl_agg_month',
    encoding: { value: { field: revenue, agg: 'sum' }, trend: { field: period } },
    filters: [],
  },
  {
    id: 'w_combo_margin',
    type: 'combo',
    title: '月營業額與營業利益率',
    table: 'tbl_agg_month',
    encoding: {
      x: { field: period },
      y: [
        { field: revenue, agg: 'sum', mark: 'bar', axis: 'left' },
        {
          field: { header: '營業利益率', code: 'op_margin' },
          agg: 'avg',
          mark: 'line',
          axis: 'right',
        },
      ],
    },
    filters: [],
  },
  {
    id: 'w_bar_region',
    type: 'bar',
    title: '各區月營業額',
    table: 'tbl_fact_monthly',
    encoding: {
      x: { field: period },
      y: [{ field: revenue, agg: 'sum' }],
      group: { field: { header: '區域', code: 'region' } },
    },
    options: { stacked: true },
    filters: [],
  },
  {
    id: 'w_pie_items',
    type: 'pie',
    title: '人氣餐點份數佔比',
    table: 'tbl_agg_item',
    encoding: {
      category: { field: { header: '餐點名稱', code: 'item_name' } },
      value: { field: { header: '總份數', code: 'total_qty' }, agg: 'sum' },
    },
    options: { donut: true },
    filters: [],
  },
];

const layout: LayoutItem[] = [
  { i: 'w_kpi_revenue', x: 0, y: 0, w: 4, h: 3 },
  { i: 'w_combo_margin', x: 4, y: 0, w: 8, h: 4 },
  { i: 'w_pie_items', x: 0, y: 3, w: 4, h: 5 },
  { i: 'w_bar_region', x: 4, y: 4, w: 8, h: 4 },
];

// 每次載入都給新的儀表板 id，並深拷貝 widget，避免多次載入時共用同一份物件。
export function createSampleDashboard(datasetId: string): Dashboard {
  return {
    id: createId('db'),
    name: '範例：營收總覽',
    datasetId,
    updatedAt: new Date().toISOString(),
    layout: layout.map((item) => ({ ...item })),
    widgets: structuredClone(widgets),
  };
}
