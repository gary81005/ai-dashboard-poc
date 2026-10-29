// 標準化轉換常用的值處理：缺值、文字清理、型別轉換、日期展開、字串拆解，以及三種列來源
// （原始工作表的每一列、從多個欄位萃取的不重複鍵、資料涵蓋年份的每個月）。全部是純函式。

import type { Cell, Context, RawRow, RawValue } from './types.ts';

// 缺值一律寫成這個字，不留空白，避免匯入 BI 或 pandas 時變成 NaN。
export const MISSING = '未提供';

// 空白：null、空字串或只有空白字元。
export function isBlank(value: RawValue): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

// 缺值：空白，或匯出系統用來表示「沒有」的記號（預設是「-」）。
export function isMissing(value: RawValue, tokens: readonly string[] = ['-']): boolean {
  return isBlank(value) || (typeof value === 'string' && tokens.includes(value.trim()));
}

// 不換行空白（\xa0，常見於從網頁複製的產品名稱）換成一般空白，其他字元不動。
export function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ');
}

// 原樣匯入：值不變，只有空白補成「未提供」，不留空值。
export function keep(value: RawValue): Cell {
  if (isBlank(value)) return MISSING;
  return typeof value === 'boolean' ? String(value) : value;
}

// 文字欄位：缺值寫成「未提供」，其餘轉成字串。replace 可以把特定值改成別的字，
// 例如預算範圍的「0」其實是未填。
export function text(
  value: RawValue,
  options: { tokens?: readonly string[]; replace?: Record<string, string>; clean?: boolean } = {},
): string {
  if (isMissing(value, options.tokens)) return MISSING;
  const s = value instanceof Date ? isoDate(value) : String(value);
  const replaced = options.replace?.[s] ?? s;
  return options.clean ? cleanText(replaced) : replaced;
}

// ── 型別轉換 ─────────────────────────────────────────────────────────

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// 文字日期（YYYY-MM-DD 或 YYYY/MM/DD）或 Excel 日期轉成 UTC 午夜的 Date；無法辨識時是 null。
export function toDate(value: RawValue): Date | null {
  if (value instanceof Date)
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(value.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

// 文字數字（可含千分位逗號）轉成數字；空白或無法辨識時是 null。
export function toNumber(value: RawValue): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

// 「50%」轉成 0.5；已經是數字的照原樣。
export function toRatio(value: RawValue): number | null {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const n = toNumber(value.trim().slice(0, -1));
    return n === null ? null : n / 100;
  }
  return toNumber(value);
}

// ── 日期展開 ─────────────────────────────────────────────────────────

export type DatePart = 'year' | 'month' | 'period' | 'quarter' | 'monthStart';

export function datePart(date: Date | null, part: DatePart): string | number | Date | null {
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  switch (part) {
    case 'year':
      return year;
    case 'month':
      return month;
    case 'period':
      return `${year}-${String(month).padStart(2, '0')}`;
    case 'quarter':
      return `Q${Math.ceil(month / 3)}`;
    case 'monthStart':
      return new Date(Date.UTC(year, month - 1, 1));
  }
}

// ── 字串拆解 ─────────────────────────────────────────────────────────

// 以第一個 separator 拆成前後兩段；沒有 separator 時後段是 null。
// 例如「中原区 河南陕西安徽」→ ['中原区', '河南陕西安徽']。
export function splitFirst(value: string, separator: string): [string, string | null] {
  const index = value.indexOf(separator);
  return index < 0 ? [value, null] : [value.slice(0, index), value.slice(index + separator.length)];
}

// 開頭的「[代碼]」，例如「[ZO]Cornea 手术包」→ { code: 'ZO', rest: 'Cornea 手术包' }。
export function bracketPrefix(value: string): { code: string | null; rest: string } {
  const match = /^\[([^\]]*)\]/.exec(value);
  return match
    ? { code: match[1], rest: value.slice(match[0].length) }
    : { code: null, rest: value };
}

// 第一個數字之前的字元，例如商機編號「CN-B23050200642」→「CN-B」。
export function leadingNonDigits(value: string): string {
  return /^\D*/.exec(value)?.[0] ?? '';
}

export const flag = (condition: boolean): number => (condition ? 1 : 0);

// 出現最多次的值；次數相同時取先出現的。
export function mostCommon<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

// ── 列來源 ───────────────────────────────────────────────────────────

// 原始工作表的每一列。
export const sheetRows =
  (sheet: string) =>
  (ctx: Context): RawRow[] =>
    ctx.raw[sheet] ?? [];

// 萃取維度表時的一個鍵：它在哪些來源欄位出現過（hits 保留原始列，屬性可以從那些列推導）。
export type KeyEntry = { key: string; hits: Array<{ source: string; row: RawRow }> };

export type KeySource = {
  sheet: string;
  // 出現於哪些欄位時顯示的名稱，例如「商機欲購買商品」。
  label: string;
  // 從原始列取出鍵；回傳 null 代表這列沒有鍵（缺值）。
  key: (row: RawRow) => string | null;
};

// 從多個來源欄位萃取不重複的鍵，依字元碼排序；缺值不列入。
export const distinctKeys =
  (sources: readonly KeySource[]) =>
  (ctx: Context): KeyEntry[] => {
    const entries = new Map<string, KeyEntry>();
    for (const source of sources) {
      for (const row of ctx.raw[source.sheet] ?? []) {
        const key = source.key(row);
        if (key === null) continue;
        const entry = entries.get(key) ?? { key, hits: [] };
        entry.hits.push({ source: source.label, row });
        entries.set(key, entry);
      }
    }
    return [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };

// 依序列出出現過的來源名稱，例如「商機欲購買商品 / 拜訪涉及商品」。
export function sourcesOf(entry: KeyEntry): string[] {
  return [...new Set(entry.hits.map((h) => h.source))];
}

export type MonthRow = { date: Date };

// 日曆：日期欄位涵蓋的每一年，各列出完整 12 個月（以月初日期表示）。
export const calendarMonths =
  (sources: ReadonlyArray<{ sheet: string; header: string }>) =>
  (ctx: Context): MonthRow[] => {
    const years = new Set<number>();
    for (const { sheet, header } of sources) {
      for (const row of ctx.raw[sheet] ?? []) {
        const date = toDate(row[header] ?? null);
        if (date) years.add(date.getUTCFullYear());
      }
    }
    return [...years]
      .sort((a, b) => a - b)
      .flatMap((year) =>
        Array.from({ length: 12 }, (_, m) => ({ date: new Date(Date.UTC(year, m, 1)) })),
      );
  };
