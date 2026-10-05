// 各圖表類型的名稱、槽位目錄與預設大小（對應 docs/adr/0005「各圖表類型的槽位規則」）。
//
// 編輯器（components/editor/WidgetEditor.tsx）依這份目錄產生拖放槽，
// utils/widgetEditing.ts 依它讀寫 widget.encoding。新增圖表類型時要同步補這裡。

import type { WidgetType } from '../types/index.ts';

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  line: '折線圖',
  bar: '長條圖',
  combo: '組合圖',
  pie: '圓餅圖',
  scatter: '散佈圖',
  radar: '雷達圖',
  gauge: '儀表圖',
  kpi: 'KPI 卡',
  table: '資料表格',
};

export const WIDGET_TYPES = Object.keys(WIDGET_TYPE_LABELS) as WidgetType[];

// 槽位種類：dimension = 單一維度欄位、measure = 單一量值、measures = 多個量值、columns = 任意欄位（資料表格用）
export type SlotKind = 'dimension' | 'measure' | 'measures' | 'columns';

export type SlotDef = { key: string; label: string; kind: SlotKind; hint?: string };

const cartesian: SlotDef[] = [
  { key: 'x', label: 'X 軸', kind: 'dimension' },
  { key: 'y', label: 'Y 軸數值', kind: 'measures' },
  { key: 'group', label: '分組（顏色）', kind: 'dimension', hint: '每個值各畫一個系列' },
];

export const WIDGET_SLOTS: Record<WidgetType, SlotDef[]> = {
  line: cartesian,
  bar: cartesian,
  combo: [
    { key: 'x', label: 'X 軸', kind: 'dimension' },
    { key: 'y', label: '數值', kind: 'measures', hint: '點欄位可切換長條／折線與左右軸' },
  ],
  pie: [
    { key: 'category', label: '分類', kind: 'dimension' },
    { key: 'value', label: '數值', kind: 'measure' },
  ],
  scatter: [
    { key: 'x', label: 'X 軸數值', kind: 'measure' },
    { key: 'y', label: 'Y 軸數值', kind: 'measure' },
    { key: 'color', label: '顏色', kind: 'dimension' },
    { key: 'detail', label: '明細', kind: 'dimension', hint: '一個值一個點，例如門市代號' },
  ],
  radar: [
    { key: 'x', label: '軸', kind: 'dimension', hint: '每個值是一個軸' },
    { key: 'y', label: '數值', kind: 'measures' },
    { key: 'group', label: '分組（顏色）', kind: 'dimension' },
  ],
  gauge: [{ key: 'value', label: '數值', kind: 'measure' }],
  kpi: [
    { key: 'value', label: '數值', kind: 'measure' },
    { key: 'trend', label: '趨勢', kind: 'dimension', hint: '放時間欄位以顯示走勢線' },
  ],
  table: [
    {
      key: 'columns',
      label: '欄位',
      kind: 'columns',
      hint: '全部不彙總時顯示明細；有彙總時依其他欄位分組',
    },
  ],
};

// 新增元件時的預設大小（格線單位：總寬 12 欄、每列高 80px）。
export const DEFAULT_WIDGET_SIZE: Record<WidgetType, { w: number; h: number }> = {
  line: { w: 6, h: 4 },
  bar: { w: 6, h: 4 },
  combo: { w: 8, h: 4 },
  pie: { w: 4, h: 4 },
  scatter: { w: 6, h: 4 },
  radar: { w: 4, h: 4 },
  gauge: { w: 3, h: 3 },
  kpi: { w: 3, h: 3 },
  table: { w: 6, h: 4 },
};
