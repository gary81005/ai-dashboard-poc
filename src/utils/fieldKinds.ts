// 欄位分類（ADR 0010 §2）：把「維度／量值」再細分成 時間、分類、識別、可加總量值、比率 五類，
// 並算出不同值的數量、樣本值、數值範圍，供欄位提示卡、欄位健檢、推薦與警告共用。
//
// 全部從中繼資料與資料列即時計算，不存進設定。分類尊重欄位目前的角色：
// 維度才可能是時間／分類／識別，量值才可能是比率／可加總量值；唯一的例外是 0/1 旗標，
// 不論角色都歸為分類（量值角色的旗標被放進數值槽位時才加總，代表「符合的筆數」）。

import type { DataTable, Field, Row } from '../types/index.ts';
import { CYCLE_HEADERS, SEQUENCE_HEADERS, isInferredRatio, isPeriodValue } from './inference.ts';
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

export function levelOf(distinct: number): CategoryLevel {
  if (distinct <= 1) return 'single';
  if (distinct <= 6) return 'few';
  if (distinct <= 12) return 'some';
  return 'many';
}

// 只看中繼資料的旗標判斷：整數，而且標頭以「是否／有無」開頭或單位是「1=是」。
// 沒有資料列可看時（例如拖曳欄位決定預設彙總）用這條。
export function looksLikeFlag(field: Field): boolean {
  return field.dataType === 'integer' && (FLAG_PREFIX.test(field.header) || field.unit === '1=是');
}

// 0/1 旗標：looksLikeFlag，而且值只有 0 和 1。
export function isFlag(field: Field, values: readonly unknown[]): boolean {
  if (!looksLikeFlag(field)) return false;
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

// 用迴圈而不是 Math.min(...numbers)：展開成參數在十幾萬筆時會超過呼叫堆疊上限（RangeError）。
function rangeOf(numbers: readonly number[]): FieldProfile['range'] {
  if (numbers.length === 0) return null;
  let min = numbers[0];
  let max = numbers[0];
  for (const n of numbers) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { min, max };
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
    range: rangeOf(numbers),
  };
}

// 一張資料表所有欄位的分類，順序與 table.fields 相同。
export function profileTable(table: DataTable, rows: readonly Row[]): FieldProfile[] {
  return table.fields.map((field) => classifyField(field, rows));
}

// 同一份資料列與資料表只分類一次：欄位清單、元件設定面板、每張卡片的警告都會用到，
// 而元件每次修改（例如打標題的每個字）都會重新渲染。鍵是物件本身：資料列陣列來自
// rowsStore，重新載入才會換；修改欄位角色時 store 會產生新的資料表物件，舊結果自然用不到。
// WeakMap 不阻止回收，登出清空 rowsStore 後快取跟著消失，不需要另外清除。
const profileCache = new WeakMap<readonly Row[], WeakMap<DataTable, readonly FieldProfile[]>>();

export function profilesOf(table: DataTable, rows: readonly Row[]): readonly FieldProfile[] {
  let byTable = profileCache.get(rows);
  if (!byTable) {
    byTable = new WeakMap();
    profileCache.set(rows, byTable);
  }
  let profiles = byTable.get(table);
  if (!profiles) {
    profiles = profileTable(table, rows);
    byTable.set(table, profiles);
  }
  return profiles;
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
