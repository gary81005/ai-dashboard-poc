// 欄位分類（ADR 0010 §2）：把「維度／量值」再細分成 時間、分類、識別、可加總量值、比率 五類，
// 並算出不同值的數量、樣本值、數值範圍，供欄位提示卡、欄位健檢、推薦與警告共用。
//
// 全部從中繼資料與資料列即時計算，不存進設定。分類尊重欄位目前的角色：
// 維度才可能是時間／分類／識別，量值才可能是比率／可加總量值；唯一的例外是 0/1 旗標，
// 不論角色都歸為分類（量值角色的旗標被放進數值槽位時才加總，代表「符合的筆數」）。

import type { DataTable, Field, Row } from '../types/index.ts';
import { CYCLE_HEADERS, SEQUENCE_HEADERS, isPeriodValue } from './inference.ts';
import { BLANK_CATEGORY, orderCategories } from './query.ts';

// 分類的級別：依不同值的數量（不含空白）。single 是只有 1 種值，不推薦任何圖表。
// 超過 30 種值的維度是識別欄位，不是分類，所以沒有更高的級別（旗標只有 2 種值）。
export type CategoryLevel = 'single' | 'few' | 'some' | 'many';

export const LEVEL_LABELS: Record<CategoryLevel, string> = {
  single: '只有 1 種',
  few: '少',
  some: '中',
  many: '多',
};

export type FieldKind =
  | { kind: 'time'; time: 'sequence' | 'cycle' }
  | { kind: 'category'; level: CategoryLevel; flag: boolean }
  | { kind: 'identifier' }
  | { kind: 'measure' }
  | { kind: 'ratio'; ratio: 'weighted' | 'unweighted' | 'inferred' };

export type FieldProfile = {
  field: Field;
  kind: FieldKind;
  // 不同值的數量（不含空白）。
  distinct: number;
  // 維度：依 orderCategories 順序的前 5 個值（時間依先後）。量值：空陣列。
  samples: string[];
  // 量值的最小、最大值；沒有任何數字時是 null。
  range: { min: number; max: number } | null;
};

const SAMPLE_COUNT = 5;
// 超過這個數量的維度一律是識別欄位（ADR 0010 §2）。
const IDENTIFIER_MIN = 30;
const IDENTIFIER_SUFFIX = /(名稱|姓名|代號|編號|ID)$/i;
const FLAG_PREFIX = /^(是否|有無)/;
const INFERRED_RATIO_SUFFIX = /(率|比|指數|均)$/;

export function levelOf(distinct: number): CategoryLevel {
  if (distinct <= 1) return 'single';
  if (distinct <= 6) return 'few';
  if (distinct <= 12) return 'some';
  return 'many';
}

// 推測比率：沒被標成比率，但標頭像比率，例如 上壘率、防禦率、整體攻擊指數、每九局三振。
export function isInferredRatio(header: string): boolean {
  return INFERRED_RATIO_SUFFIX.test(header) || header.includes('平均') || header.includes('每');
}

// 0/1 旗標：整數、值只有 0 和 1，而且標頭以「是否／有無」開頭或單位是「1=是」。
function isFlag(field: Field, values: readonly unknown[]): boolean {
  if (field.dataType !== 'integer') return false;
  if (!FLAG_PREFIX.test(field.header) && field.unit !== '1=是') return false;
  return values.length > 0 && values.every((v) => v === 0 || v === 1);
}

function isTime(field: Field, values: readonly unknown[]): boolean {
  if (field.dataType === 'date') return true;
  if (SEQUENCE_HEADERS.has(field.header) || CYCLE_HEADERS.has(field.header)) return true;
  return values.length > 0 && values.every(isPeriodValue);
}

function kindOf(
  field: Field,
  values: readonly unknown[],
  distinct: number,
  rowCount: number,
): FieldKind {
  if (isFlag(field, values)) return { kind: 'category', level: levelOf(distinct), flag: true };
  if (field.role === 'dimension') {
    if (isTime(field, values)) {
      return { kind: 'time', time: CYCLE_HEADERS.has(field.header) ? 'cycle' : 'sequence' };
    }
    const looksLikeId = IDENTIFIER_SUFFIX.test(field.header) || distinct >= rowCount * 0.5;
    if (distinct > IDENTIFIER_MIN || (distinct > 6 && looksLikeId)) return { kind: 'identifier' };
    return { kind: 'category', level: levelOf(distinct), flag: false };
  }
  if (field.ratioOf) return { kind: 'ratio', ratio: 'weighted' };
  if (field.ratio) return { kind: 'ratio', ratio: 'unweighted' };
  if (isInferredRatio(field.header)) return { kind: 'ratio', ratio: 'inferred' };
  return { kind: 'measure' };
}

export function classifyField(field: Field, rows: readonly Row[]): FieldProfile {
  const values = rows.map((r) => r[field.header]).filter((v) => v !== null && v !== '');
  const ordered = orderCategories(rows, field).filter((v) => v !== BLANK_CATEGORY);
  const numbers = values.filter((v): v is number => typeof v === 'number');
  const kind = kindOf(field, values, ordered.length, rows.length);
  const dimensionLike =
    kind.kind === 'time' || kind.kind === 'category' || kind.kind === 'identifier';
  return {
    field,
    kind,
    distinct: ordered.length,
    samples: dimensionLike ? ordered.slice(0, SAMPLE_COUNT) : [],
    range: numbers.length > 0 ? { min: Math.min(...numbers), max: Math.max(...numbers) } : null,
  };
}

// 一張資料表所有欄位的分類，順序與 table.fields 相同。
export function profileTable(table: DataTable, rows: readonly Row[]): FieldProfile[] {
  return table.fields.map((field) => classifyField(field, rows));
}

// 欄位清單的分組（ADR 0010 §7 ①）：依角色分維度、量值，再依類別細分。
// 量值角色的旗標仍放在「量值」組，因為拖曳時只能進數值槽位。
export type FieldGroup = 'time' | 'category' | 'identifier' | 'measure' | 'ratio';

export const GROUP_LABELS: Record<FieldGroup, string> = {
  time: '時間',
  category: '分類',
  identifier: '識別',
  measure: '量值',
  ratio: '比率',
};

export const GROUP_ORDER: FieldGroup[] = ['time', 'category', 'identifier', 'measure', 'ratio'];

export function groupOf(profile: FieldProfile): FieldGroup {
  const { kind } = profile;
  if (profile.field.role === 'dimension') {
    return kind.kind === 'time' || kind.kind === 'identifier' ? kind.kind : 'category';
  }
  return kind.kind === 'ratio' ? 'ratio' : 'measure';
}
