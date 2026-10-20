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
  text: '文字',
};

export const WIDGET_TYPES = Object.keys(WIDGET_TYPE_LABELS) as WidgetType[];

// 新增元件選單與「圖表類型」下拉選單裡的說明（ADR 0010 §7 ⑥）：一句用途與需要的欄位。
export const WIDGET_TYPE_GUIDES: Record<WidgetType, { purpose: string; needs: string }> = {
  line: { purpose: '看隨時間的變化', needs: '時間 ＋ 數值' },
  bar: { purpose: '比較各分類的大小', needs: '分類 ＋ 數值' },
  combo: { purpose: '金額與比率放在同一張圖', needs: '時間 ＋ 金額 ＋ 比率' },
  pie: { purpose: '看占比，分類 6 種以內', needs: '分類 ＋ 1 個數值' },
  scatter: { purpose: '看兩個數值的關係', needs: '2 個數值（＋ 明細）' },
  radar: { purpose: '比較多個項目的特性', needs: '3～12 種分類 ＋ 數值' },
  gauge: { purpose: '一個比率落在範圍的哪裡', needs: '1 個比率' },
  kpi: { purpose: '一個重點數字', needs: '1 個數值' },
  table: { purpose: '列出明細或分組彙總', needs: '任意欄位' },
  text: { purpose: '說明與註記', needs: '不需要欄位' },
};

export function widgetTypeGuideText(type: WidgetType): string {
  const { purpose, needs } = WIDGET_TYPE_GUIDES[type];
  return `${purpose}｜${needs}`;
}

// 槽位種類：dimension = 單一維度欄位、measure = 單一量值、measures = 多個量值、columns = 任意欄位（資料表格用）
export type SlotKind = 'dimension' | 'measure' | 'measures' | 'columns';

// required：必要槽位要放什麼欄位，用在「下一步」提示（ADR 0010 §5）；沒有就是選填。
export type SlotDef = {
  key: string;
  label: string;
  kind: SlotKind;
  hint?: string;
  required?: string;
};

const cartesian: SlotDef[] = [
  { key: 'x', label: 'X 軸', kind: 'dimension', required: '時間或分類' },
  { key: 'y', label: 'Y 軸數值', kind: 'measures', required: '數值' },
  { key: 'group', label: '分組（顏色）', kind: 'dimension', hint: '每個值各畫一個系列' },
];

export const WIDGET_SLOTS: Record<WidgetType, SlotDef[]> = {
  line: [{ ...cartesian[0], required: '時間' }, ...cartesian.slice(1)],
  bar: cartesian,
  combo: [
    { key: 'x', label: 'X 軸', kind: 'dimension', required: '時間或分類' },
    {
      key: 'y',
      label: '數值',
      kind: 'measures',
      hint: '點欄位可切換長條／折線與左右軸',
      required: '數值',
    },
  ],
  pie: [
    { key: 'category', label: '分類', kind: 'dimension', required: '分類' },
    { key: 'value', label: '數值', kind: 'measure', required: '數值' },
  ],
  scatter: [
    { key: 'x', label: 'X 軸數值', kind: 'measure', required: '數值' },
    { key: 'y', label: 'Y 軸數值', kind: 'measure', required: '數值' },
    { key: 'color', label: '顏色', kind: 'dimension' },
    { key: 'detail', label: '明細', kind: 'dimension', hint: '一個值一個點，例如門市代號' },
  ],
  radar: [
    { key: 'x', label: '軸', kind: 'dimension', hint: '每個值是一個軸', required: '分類' },
    { key: 'y', label: '數值', kind: 'measures', required: '數值' },
    { key: 'group', label: '分組（顏色）', kind: 'dimension' },
  ],
  gauge: [{ key: 'value', label: '數值', kind: 'measure', required: '比率' }],
  kpi: [
    { key: 'value', label: '數值', kind: 'measure', required: '數值' },
    { key: 'trend', label: '趨勢', kind: 'dimension', hint: '放時間欄位以顯示走勢線' },
  ],
  table: [
    {
      key: 'columns',
      label: '欄位',
      kind: 'columns',
      hint: '全部不彙總時顯示明細；有彙總時依其他欄位分組',
      required: '要列出的',
    },
  ],
  // 文字元件不綁資料表，沒有槽位。
  text: [],
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
  text: { w: 12, h: 2 },
};
