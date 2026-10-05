// 欄位角色（維度／量值）與比率的自動判斷規則（docs/adr/0004）。
//
// 解析 Excel 時呼叫（services/parseWorkbook.ts）；使用者可以在資料集頁手動覆寫，結果記在 Field.userOverride。

import type { DataType, Role } from '../types/index.ts';

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const DIMENSION_HEADERS = new Set(['年', '月']);
// 只比對結尾：若用「包含」比對，年營業額、月租金這類量值會被誤判成維度。
const DIMENSION_SUFFIXES = ['月份', '排名', '代號', '編號'];

// 欄位定義工作表的中文型別 → 程式內部的 DataType。
export const DICTIONARY_TYPES: Record<string, DataType> = {
  文字: 'text',
  整數: 'integer',
  數值: 'number',
  百分比: 'percent',
  日期: 'date',
};

export function isPeriodValue(value: unknown): boolean {
  return typeof value === 'string' && PERIOD_PATTERN.test(value);
}

// 依序套用規則，第一條符合的就採用：文字／日期 → 維度；值全是 YYYY-MM → 維度；
// 標頭為「年」「月」或以 月份／排名／代號／編號 結尾 → 維度；其餘數值 → 量值。
export function inferRole(header: string, dataType: DataType, values: readonly unknown[]): Role {
  if (dataType === 'text' || dataType === 'date') return 'dimension';
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (present.length > 0 && present.every(isPeriodValue)) return 'dimension';
  if (DIMENSION_HEADERS.has(header)) return 'dimension';
  if (DIMENSION_SUFFIXES.some((suffix) => header.endsWith(suffix))) return 'dimension';
  return 'measure';
}

// 型別是百分比、或 Excel 格式含 %，就視為比率（不可加總）。
// 平均客單價這類「數值」型別的比率無法自動判斷，只能靠使用者手動標記。
export function inferRatio(dataType: DataType, numFmt: string | undefined): boolean {
  return dataType === 'percent' || (numFmt?.includes('%') ?? false);
}
