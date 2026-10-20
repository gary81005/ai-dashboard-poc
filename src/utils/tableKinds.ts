// 資料表種類與「一列代表什麼」（ADR 0010 §3）：讓欄位清單與資料集頁可以依種類分組，
// 並在每張表旁邊顯示「一列 = 門市名稱 × 年月」，使用者才知道該用哪張表。
//
// 全部即時計算，不存進設定，也不開放手動指定。資料列還沒載入時傳入空陣列：
// 前綴規則照樣有效，只是推測規則與 grain 會判斷不出來。

import type { DataTable, Field, Row } from '../types/index.ts';
import { profilesOf } from './fieldKinds.ts';
import type { FieldProfile } from './fieldKinds.ts';
import { categoryKey } from './query.ts';

export type TableKind = 'fact' | 'aggregate' | 'dimension' | 'parameter' | 'other';

export const TABLE_KIND_LABELS: Record<TableKind, string> = {
  fact: '明細',
  aggregate: '彙總',
  dimension: '主檔',
  parameter: '參數',
  other: '未分類',
};

export const TABLE_KIND_ORDER: TableKind[] = [
  'fact',
  'aggregate',
  'dimension',
  'other',
  'parameter',
];

const PARAMETER_NAME = /params|參數/i;
const PREFIXES: Array<[string, TableKind]> = [
  ['tbl_fact_', 'fact'],
  ['tbl_agg_', 'aggregate'],
  ['tbl_dim_', 'dimension'],
];
const PARAMETER_MAX_ROWS = 12;

export function tableKindOf(
  table: DataTable,
  profiles: readonly FieldProfile[],
  rowCount: number,
): TableKind {
  // 前綴優先：例如工作表叫「月曆參數」但表格是 tbl_dim_calendar，仍是主檔。
  const key = table.key.toLowerCase();
  const prefixed = PREFIXES.find(([prefix]) => key.startsWith(prefix));
  if (prefixed) return prefixed[1];
  if (PARAMETER_NAME.test(table.key) || PARAMETER_NAME.test(table.sheetName)) return 'parameter';

  // 沒有前綴時用推測；資料列還沒載入（rowCount 為 0）時無法推測。
  if (rowCount === 0) return 'other';
  const hasSequence = profiles.some((p) => p.kind.kind === 'time' && p.kind.time === 'sequence');
  const hasTime = profiles.some((p) => p.kind.kind === 'time');
  if (rowCount <= PARAMETER_MAX_ROWS && !hasSequence) return 'parameter';
  const uniqueId = profiles.some((p) => p.kind.kind === 'identifier' && p.distinct === rowCount);
  if (uniqueId && !hasTime) return 'dimension';
  if (profiles.some((p) => p.field.role === 'measure')) return 'fact';
  return 'other';
}

const GRAIN_MAX_SIZE = 3;
// 候選欄位太多時只取前幾個，避免組合數爆增（12 取 3 = 220 種組合）。
const GRAIN_MAX_CANDIDATES = 12;

// grain 的候選順序：識別 → 時間 → 分類，同類依欄位順序；識別與分類裡，
// 名稱、姓名結尾的優先於代號、編號，因為顯示「門市名稱 × 年月」比「門市代號 × 年月」好讀。
const READABLE_NAME = /(名稱|姓名|名)$/;

function candidateRank(profile: FieldProfile): number | undefined {
  const { kind, field } = profile;
  if (field.role !== 'dimension') return undefined;
  const named = READABLE_NAME.test(field.header) ? 0 : 1;
  if (kind.kind === 'identifier') return named;
  if (kind.kind === 'time') return 2;
  if (kind.kind === 'category') return 3 + named;
  return undefined;
}

function* combinations<T>(items: readonly T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - size; i += 1) {
    for (const rest of combinations(items, size - 1, i + 1)) yield [items[i], ...rest];
  }
}

function isUnique(rows: readonly Row[], fields: readonly Field[]): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = fields.map((f) => categoryKey(row[f.header])).join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

// 一列代表什麼：在每一列都不重複的最小欄位組合（1～3 個），找不到時回傳 null。
export function grainOf(rows: readonly Row[], profiles: readonly FieldProfile[]): Field[] | null {
  if (rows.length === 0) return null;
  const candidates = profiles
    .map((profile, index) => ({ profile, index, rank: candidateRank(profile) }))
    .filter(
      (c): c is { profile: FieldProfile; index: number; rank: number } => c.rank !== undefined,
    )
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, GRAIN_MAX_CANDIDATES)
    .map((c) => c.profile.field);
  for (let size = 1; size <= GRAIN_MAX_SIZE; size += 1) {
    for (const combo of combinations(candidates, size)) {
      if (isUnique(rows, combo)) return combo;
    }
  }
  return null;
}

export type TableDescription = {
  table: DataTable;
  profiles: readonly FieldProfile[];
  kind: TableKind;
  // 資料列還沒載入或找不到時是 null。
  grain: Field[] | null;
};

// 欄位清單與資料集頁共用：一張表的欄位分類、種類與 grain。
export function describeTable(table: DataTable, rows: readonly Row[]): TableDescription {
  const profiles = profilesOf(table, rows);
  return {
    table,
    profiles,
    kind: tableKindOf(table, profiles, rows.length),
    grain: grainOf(rows, profiles),
  };
}

// 依 TABLE_KIND_ORDER 分組，空的組不列出。
export function groupByKind<T extends { kind: TableKind }>(
  items: readonly T[],
): Array<{ kind: TableKind; items: T[] }> {
  return TABLE_KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((i) => i.kind === kind),
  })).filter((g) => g.items.length > 0);
}

// 「一列 = 門市名稱 × 年月・642 列」；grain 判斷不出來時只顯示列數。
export function grainText(description: TableDescription): string {
  const count = `${description.table.rowCount.toLocaleString('zh-TW')} 列`;
  const { grain } = description;
  return grain ? `一列 = ${grain.map((f) => f.header).join(' × ')}・${count}` : count;
}
