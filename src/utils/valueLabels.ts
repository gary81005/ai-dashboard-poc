// 值標籤（ADR 0011）：把欄位的原始值換成好讀的文字顯示，例如 1 → 是、0 → 否、M → 男。
//
// 只改顯示、不改資料：分組、排序、篩選都用原始值（query.ts 的 categoryKey），
// 只有輸出到畫面的那一步才換成標籤，所以關掉標籤或修改標籤文字，已設好的篩選都不會失效。
// 停用有兩層：欄位的 showValueLabels = false（所有儀表板），或 widget 的 rawValues（單一元件，
// 由 withRawValues 把整張表的標籤拿掉後再查詢）。

import type { DataTable, DataType, Field } from '../types/index.ts';

export type ValueLabels = Record<string, string>;

// 不同值超過這個數量的欄位不提供值標籤設定（代碼型欄位通常只有十幾種值）。
export const MAX_LABELED_VALUES = 50;

const DEFAULT_BINARY: ValueLabels = { '1': '是', '0': '否' };
// 單位只寫了 1 的標籤時，0 用對應的反義詞；沒有對應的就加「非」。
const OPPOSITES: Record<string, string> = { 是: '否', 有: '無', 對: '錯', 已: '未' };

// 目前生效的對照；欄位層級關掉時是 undefined。
export function activeLabels(field: Field): ValueLabels | undefined {
  if (field.showValueLabels === false) return undefined;
  const labels = field.valueLabels;
  return labels && Object.keys(labels).length > 0 ? labels : undefined;
}

// 原始值（categoryKey 轉好的字串）要顯示的文字；沒有對照的值照常顯示原始值。
export function labelOf(field: Field, key: string): string {
  return activeLabels(field)?.[key] ?? key;
}

// 一串分類的顯示名稱。座標軸以名稱當刻度（band scale 會把重複的名稱合併成一格），
// 所以兩個值被設成同一個標籤時，在後面補上原始值區分，例如「其他（3）」「其他（4）」。
export function labelsOf(field: Field, keys: readonly string[]): string[] {
  const labels = keys.map((key) => labelOf(field, key));
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return labels.map((label, i) =>
    (counts.get(label) ?? 0) > 1 && label !== keys[i] ? `${label}（${keys[i]}）` : label,
  );
}

// 0/1 二元欄位：數值欄位，而且對照只有 0、1 兩個值（至少有 1）。量值的彙總結果以 1 的標籤顯示
// （平均 → 「是 35%」、加總 → 「是 120 筆」，見 format.ts）。
export function isBinaryLabeled(field: Field): boolean {
  const labels = activeLabels(field);
  if (!labels || (field.dataType !== 'integer' && field.dataType !== 'number')) return false;
  const keys = Object.keys(labels);
  return keys.includes('1') && keys.every((k) => k === '0' || k === '1');
}

// 單一 widget 選擇「顯示原始值」：把這張表所有欄位的標籤停用後再查詢與格式化。
// 同一張表回傳同一個物件，profilesOf 等以資料表為鍵的快取才不會每次重算。
const rawTables = new WeakMap<DataTable, DataTable>();

export function withRawValues(table: DataTable): DataTable {
  let raw = rawTables.get(table);
  if (!raw) {
    raw = { ...table, fields: table.fields.map((f) => ({ ...f, showValueLabels: false })) };
    rawTables.set(table, raw);
  }
  return raw;
}

// 欄位定義的單位寫成「1=是」「1=有,0=無」「1='合格'」這類格式時，取出對照。
export function parseUnitLabels(unit: string | undefined): ValueLabels | undefined {
  if (!unit) return undefined;
  const labels: ValueLabels = {};
  for (const part of unit.split(/[,，;；、/]/)) {
    const match = /^\s*([01])\s*[=＝:：]\s*['"「]?([^'"」]+?)['"」]?\s*$/.exec(part);
    if (match) labels[match[1]] = match[2];
  }
  if (!labels['1']) return undefined;
  labels['0'] ??= OPPOSITES[labels['1']] ?? `非${labels['1']}`;
  return labels;
}

// 上傳時自動套用（ADR 0011）：整數欄位的值只有 0 和 1，就加上「1 → 是、0 → 否」
// （單位有寫對照時用單位的文字）。只出現其中一個值的欄位通常不是旗標（例如全是 1 的「件數」），
// 不套用；例外是 Excel 的 TRUE/FALSE，解析時已轉成 1/0（fromBoolean），一定是二元。
export function detectValueLabels(
  dataType: DataType,
  values: readonly unknown[],
  unit: string | undefined,
  fromBoolean: boolean,
): ValueLabels | undefined {
  if (dataType !== 'integer' || values.length === 0) return undefined;
  if (!values.every((v) => v === 0 || v === 1)) return undefined;
  if (!fromBoolean && !(values.includes(0) && values.includes(1))) return undefined;
  return parseUnitLabels(unit) ?? { ...DEFAULT_BINARY };
}

// 自動套用、使用者還沒確認過的欄位（資料集頁的欄位健檢會提示「已自動套用」）。
export function isAutoLabeled(field: Field): boolean {
  return field.valueLabels !== undefined && !(field.userOverride?.includes('valueLabels') ?? false);
}

// 對照的簡短說明，例如「1 → 是、0 → 否」。
export function describeLabels(labels: ValueLabels): string {
  return Object.entries(labels)
    .map(([value, label]) => `${value} → ${label}`)
    .join('、');
}
