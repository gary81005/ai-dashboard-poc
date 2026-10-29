// 數字顯示格式：優先用 Excel 儲存格的數字格式（numFmt），其次參考欄位定義的單位（ADR 0004）。
//
// formatValue 用在 tooltip 與表格（完整數字）；formatCompact 用在座標軸與 KPI 大字（萬／億縮寫）。
// 套用值標籤的 0/1 欄位另有規則（formatBinary，ADR 0011）。

import type { Agg, Field } from '../types/index.ts';
import { isBinaryLabeled, labelOf } from './valueLabels.ts';

// 從 '#,##0.0'、'0.0%' 這類格式取出小數位數。
function decimalsOf(numFmt: string): number {
  const match = /\.(0+)/.exec(numFmt);
  return match ? match[1].length : 0;
}

// 比率欄位且格式是百分比時，以百分比顯示（資料以小數儲存，0.227 → 22.7%）。
export function isPercent(field: Field): boolean {
  return (
    field.ratio === true && (field.dataType === 'percent' || (field.numFmt?.includes('%') ?? false))
  );
}

const compactFormatter = new Intl.NumberFormat('zh-TW', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

// 套用值標籤的 0/1 欄位（ADR 0011），以 1 的標籤為計數對象：
//   平均 → 「是 35%」（值為 1 的比例）、加總 → 「是 120 筆」（值為 1 的筆數）、
//   最小／最大 → 結果一定是 0 或 1，直接顯示標籤。count 和其他情況回傳 undefined，照一般規則。
// compact（座標軸、KPI 大字）空間不夠，平均只顯示百分比、加總只顯示數字。
function formatBinary(field: Field, agg: Agg, value: number, compact: boolean): string | undefined {
  if (!isBinaryLabeled(field)) return undefined;
  const yes = labelOf(field, '1');
  switch (agg) {
    case 'avg': {
      const percent = `${(value * 100).toFixed(1)}%`;
      return compact ? percent : `${yes} ${percent}`;
    }
    case 'sum':
      return compact
        ? compactFormatter.format(value)
        : `${yes} ${value.toLocaleString('zh-TW')} 筆`;
    case 'min':
    case 'max':
      return value === 0 || value === 1 ? labelOf(field, String(value)) : undefined;
    case 'count':
      return undefined;
  }
}

export function formatValue(field: Field, agg: Agg, value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  if (agg === 'count') return value.toLocaleString('zh-TW');
  const binary = formatBinary(field, agg, value, false);
  if (binary !== undefined) return binary;
  if (isPercent(field)) {
    const digits = field.numFmt?.includes('%') ? decimalsOf(field.numFmt) : 1;
    return `${(value * 100).toFixed(digits)}%`;
  }
  const digits = field.numFmt ? decimalsOf(field.numFmt) : 2;
  return value.toLocaleString('zh-TW', { maximumFractionDigits: digits });
}

// 欄位定義的「單位」欄也混了格式說明（YYYY-MM、1-12、小數、見單位欄），只有真正的單位才顯示。
// 套用值標籤的 0/1 欄位已經顯示成「是 120 筆」，不再加單位。
export function displayUnit(field: Field): string | undefined {
  const unit = field.unit;
  if (!unit || isPercent(field) || isBinaryLabeled(field) || /\d|YYYY|小數|見/.test(unit)) {
    return undefined;
  }
  return unit;
}

export function formatCompact(field: Field, agg: Agg, value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const binary = formatBinary(field, agg, value, true);
  if (binary !== undefined) return binary;
  if (agg !== 'count' && isPercent(field)) return formatValue(field, agg, value);
  return compactFormatter.format(value);
}
