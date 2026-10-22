// 欄位角色（維度／量值）與比率的自動判斷規則（docs/adr/0004）。
//
// 解析 Excel 時呼叫（services/parseWorkbook.ts）；使用者可以在資料集頁手動覆寫，結果記在 Field.userOverride。

import type { DataType, Field, Role } from '../types/index.ts';

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

// 時間標頭（ADR 0010）：序列會一直往後走（趨勢的 X 軸），週期每年重複（同期比較的 X 軸）。
export const SEQUENCE_HEADERS = new Set(['年', '年月', '年度', '年份', '球季', '賽季']);
export const CYCLE_HEADERS = new Set(['月', '季別']);
// 規則 3：標頭完全等於任一個時間標頭就是維度（ADR 0010 修訂 0004，原本只有「年」「月」）。
const DIMENSION_HEADERS = new Set([...SEQUENCE_HEADERS, ...CYCLE_HEADERS]);
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
// 標頭完全等於時間標頭（年、月、年月、年度、年份、季別、球季、賽季）或以 月份／排名／代號／編號 結尾
// → 維度；其餘數值 → 量值。
export function inferRole(header: string, dataType: DataType, values: readonly unknown[]): Role {
  if (dataType === 'text' || dataType === 'date') return 'dimension';
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (present.length > 0 && present.every(isPeriodValue)) return 'dimension';
  if (DIMENSION_HEADERS.has(header)) return 'dimension';
  if (DIMENSION_SUFFIXES.some((suffix) => header.endsWith(suffix))) return 'dimension';
  return 'measure';
}

const INFERRED_RATIO_SUFFIX = /(率|比|指數|均)$/;

// 推測比率（ADR 0010 §2）：沒被標成比率，但標頭像比率，例如 上壘率、防禦率、整體攻擊指數、
// 每九局三振。只影響推薦、預設彙總與合計，不改欄位的中繼資料。
export function isInferredRatio(header: string): boolean {
  return INFERRED_RATIO_SUFFIX.test(header) || header.includes('平均') || header.includes('每');
}

// 這個欄位要不要當成推測比率：標頭像比率、還沒標成比率，而且使用者沒有手動決定過比率標記。
// 在欄位健檢按「忽略」或手動取消比率，會記成 userOverride 'ratio'（ratio 不設定），
// 代表「不是比率」，例如「平均金額」「平均月薪」：之後一律當成一般量值，預設加總、顯示合計。
export function isInferredRatioField(field: Field): boolean {
  return !field.ratio && !field.userOverride?.includes('ratio') && isInferredRatio(field.header);
}

// 型別是百分比、或 Excel 格式含 %，就視為比率（不可加總）。
// 平均客單價這類「數值」型別的比率無法自動判斷，只能靠使用者手動標記。
export function inferRatio(dataType: DataType, numFmt: string | undefined): boolean {
  return dataType === 'percent' || (numFmt?.includes('%') ?? false);
}
