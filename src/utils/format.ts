// 數字顯示格式：優先用 Excel 儲存格的數字格式（numFmt），其次參考欄位定義的單位（ADR 0004）。
//
// formatValue 用在 tooltip 與表格（完整數字）；formatCompact 用在座標軸與 KPI 大字（萬／億縮寫）。

import type { Agg, Field } from '../types/index.ts';

// 從 '#,##0.0'、'0.0%' 這類格式取出小數位數。
function decimalsOf(numFmt: string): number {
  const match = /\.(0+)/.exec(numFmt);
  return match ? match[1].length : 0;
}

// 比率欄位且格式是百分比時，以百分比顯示（資料以小數儲存，0.227 → 22.7%）。
function isPercent(field: Field): boolean {
  return (
    field.ratio === true && (field.dataType === 'percent' || (field.numFmt?.includes('%') ?? false))
  );
}

export function formatValue(field: Field, agg: Agg, value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  if (agg === 'count') return value.toLocaleString('zh-TW');
  if (isPercent(field)) {
    const digits = field.numFmt?.includes('%') ? decimalsOf(field.numFmt) : 1;
    return `${(value * 100).toFixed(digits)}%`;
  }
  const digits = field.numFmt ? decimalsOf(field.numFmt) : 2;
  return value.toLocaleString('zh-TW', { maximumFractionDigits: digits });
}

// 欄位定義的「單位」欄也混了格式說明（YYYY-MM、1-12、小數、見單位欄），只有真正的單位才顯示。
export function displayUnit(field: Field): string | undefined {
  const unit = field.unit;
  if (!unit || isPercent(field) || /\d|YYYY|小數|見/.test(unit)) return undefined;
  return unit;
}

const compactFormatter = new Intl.NumberFormat('zh-TW', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

export function formatCompact(field: Field, agg: Agg, value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  if (agg !== 'count' && isPercent(field)) return formatValue(field, agg, value);
  return compactFormatter.format(value);
}
