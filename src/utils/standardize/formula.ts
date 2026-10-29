// 彙總表與資料品質檢核的公式：用 Expr 描述指標，同時產生 Excel 公式文字與計算結果。
//
// 公式引用的是「輸出」的資料表（以工作表名稱指定），範圍寫成絕對位址，例如
// 拜訪紀錄!$E$2:$E$27249；「同一列」的條件寫成 $A2，同表的欄位寫成 D2。
// 計算結果依 Excel 的規則算出，寫進儲存格的快取值，所以不必開 Excel 重算也看得到數字。

import type { Cell } from './types.ts';

// COUNTIFS／SUMIFS 的條件：等於某個值、大於某個數、或等於彙總表同一列某欄的值。
export type Criterion = string | number | { gt: number } | { sameRow: string };
export type Condition = readonly [column: string, criterion: Criterion];
type Where = readonly Condition[];

export type Expr =
  // 同一列的另一欄（只能引用左邊已經算好的欄位）。
  | { op: 'ref'; column: string }
  | { op: 'countIfs'; sheet: string; where: Where }
  | { op: 'sumIfs'; sheet: string; sum: string; where: Where }
  // 符合條件的列數，寫成 SUMPRODUCT((範圍=$A2)*(範圍>0))，可以引用另一張彙總表。
  | { op: 'countRows'; sheet: string; where: Where }
  // sheet 的 key 欄位裡，有幾個值從未出現在 refs 的任何一個欄位（例如從未被拜訪或商機引用的客戶）。
  | {
      op: 'unreferenced';
      sheet: string;
      key: string;
      refs: ReadonlyArray<readonly [string, string]>;
    }
  // INDEX／MATCH：用同一列 by 欄的值，到 sheet 的 match 欄找，取同列 value 欄的值。
  | { op: 'lookup'; sheet: string; match: string; value: string; by: string }
  | { op: 'add'; terms: Expr[] }
  | { op: 'sub'; left: Expr; right: Expr }
  // 比率：IF(分母=0,0,分子/分母)。
  | { op: 'ratio'; num: Expr; den: Expr };

// ── 設定檔用的簡寫 ────────────────────────────────────────────────────

export const ref = (column: string): Expr => ({ op: 'ref', column });
export const sameRow = (column: string): Criterion => ({ sameRow: column });
export const gt = (value: number): Criterion => ({ gt: value });
export const countIfs = (sheet: string, ...where: Where): Expr => ({
  op: 'countIfs',
  sheet,
  where,
});
export const sumIfs = (sheet: string, sum: string, ...where: Where): Expr => ({
  op: 'sumIfs',
  sheet,
  sum,
  where,
});
export const countRows = (sheet: string, ...where: Where): Expr => ({
  op: 'countRows',
  sheet,
  where,
});
export const add = (...terms: Expr[]): Expr => ({ op: 'add', terms });
export const sub = (left: Expr, right: Expr): Expr => ({ op: 'sub', left, right });
export const ratio = (num: Expr, den: Expr): Expr => ({ op: 'ratio', num, den });

// ── 計算 ─────────────────────────────────────────────────────────────

// 公式可以引用的一張輸出資料表。
export type SheetView = { sheet: string; headers: readonly string[]; rows: readonly Cell[][] };

// 公式所在的那一列：所屬的資料表、Excel 列號（資料從第 2 列開始），以及已經算好的值。
export type RowScope = { headers: readonly string[]; rowNumber: number; values: readonly Cell[] };

export function columnLetter(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

// 工作表名稱只有文字、數字、底線時可以直接寫，其他要加單引號。
export function sheetName(sheet: string): string {
  return /^[\p{L}\p{N}_]+$/u.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`;
}

export const plain = (cell: Cell): string | number | Date | null =>
  cell !== null && typeof cell === 'object' && 'formula' in cell ? cell.result : cell;

// Excel 的比對規則：數字與數字字串視為相同，文字不分大小寫。
function same(value: string | number | Date | null, target: string | number): boolean {
  if (value === null || value instanceof Date) return false;
  if (typeof target === 'number') {
    return typeof value === 'number'
      ? value === target
      : value.trim() !== '' && Number(value) === target;
  }
  if (typeof value === 'number') return target.trim() !== '' && Number(target) === value;
  return value.toLowerCase() === target.toLowerCase();
}

export function createEvaluator(sheets: ReadonlyMap<string, SheetView>) {
  const view = (sheet: string): SheetView => {
    const found = sheets.get(sheet);
    if (!found) throw new Error(`公式引用了還沒產生的工作表「${sheet}」`);
    return found;
  };
  const index = (headers: readonly string[], column: string, where: string): number => {
    const i = headers.indexOf(column);
    if (i < 0) throw new Error(`${where}沒有「${column}」欄`);
    return i;
  };
  const range = (sheet: string, column: string): string => {
    const v = view(sheet);
    const letter = columnLetter(index(v.headers, column, `工作表「${sheet}」`));
    return `${sheetName(sheet)}!$${letter}$2:$${letter}$${Math.max(v.rows.length + 1, 2)}`;
  };
  const columnValues = (sheet: string, column: string) => {
    const v = view(sheet);
    const i = index(v.headers, column, `工作表「${sheet}」`);
    return v.rows.map((r) => plain(r[i]));
  };

  // 條件裡的「同一列」換成這一列的值後，用快取的索引找出符合的列，避免每列都掃一次整張表。
  const groups = new Map<string, Map<string, number[]>>();
  function matchingRows(sheet: string, where: Where, scope: RowScope): number[] {
    const literal = where.filter(([, c]) => typeof c !== 'object' || 'gt' in c);
    const byRow = where.filter(([, c]) => typeof c === 'object' && 'sameRow' in c);
    const signature = JSON.stringify([sheet, literal, byRow.map(([column]) => column)]);
    let group = groups.get(signature);
    if (!group) {
      group = new Map();
      const literalValues = literal.map(([column, c]) => [columnValues(sheet, column), c] as const);
      const keyValues = byRow.map(([column]) => columnValues(sheet, column));
      const count = view(sheet).rows.length;
      for (let r = 0; r < count; r++) {
        const ok = literalValues.every(([values, c]) => {
          const v = values[r];
          if (typeof c === 'object' && 'gt' in c) return typeof v === 'number' && v > c.gt;
          return same(v, c as string | number);
        });
        if (!ok) continue;
        const key = JSON.stringify(keyValues.map((values) => normalizeKey(values[r])));
        const list = group.get(key);
        if (list) list.push(r);
        else group.set(key, [r]);
      }
      groups.set(signature, group);
    }
    const key = JSON.stringify(
      byRow.map(([, c]) => {
        const column = (c as { sameRow: string }).sameRow;
        return normalizeKey(plain(scope.values[index(scope.headers, column, '這張彙總表')]));
      }),
    );
    return group.get(key) ?? [];
  }

  function criterionText(c: Criterion, scope: RowScope): string {
    if (typeof c === 'number') return String(c);
    if (typeof c === 'string') return `"${c.replace(/"/g, '""')}"`;
    if ('gt' in c) return `">${c.gt}"`;
    return `$${columnLetter(index(scope.headers, c.sameRow, '這張彙總表'))}${scope.rowNumber}`;
  }
  const whereText = (sheet: string, where: Where, scope: RowScope) =>
    where.map(([column, c]) => `${range(sheet, column)},${criterionText(c, scope)}`).join(',');

  // 回傳 [公式文字, 計算結果]。
  function evaluate(expr: Expr, scope: RowScope): [string, string | number | null] {
    switch (expr.op) {
      case 'ref': {
        const i = index(scope.headers, expr.column, '這張彙總表');
        if (i >= scope.values.length) throw new Error(`「${expr.column}」要排在引用它的欄位左邊`);
        const v = plain(scope.values[i]);
        return [`${columnLetter(i)}${scope.rowNumber}`, typeof v === 'number' ? v : 0];
      }
      case 'countIfs':
        return [
          `COUNTIFS(${whereText(expr.sheet, expr.where, scope)})`,
          matchingRows(expr.sheet, expr.where, scope).length,
        ];
      case 'sumIfs': {
        const values = columnValues(expr.sheet, expr.sum);
        const total = matchingRows(expr.sheet, expr.where, scope).reduce((s, r) => {
          const v = values[r];
          return typeof v === 'number' ? s + v : s;
        }, 0);
        return [
          `SUMIFS(${range(expr.sheet, expr.sum)},${whereText(expr.sheet, expr.where, scope)})`,
          excelPrecision(total),
        ];
      }
      case 'countRows': {
        const terms = expr.where.map(([column, c]) => {
          const r = range(expr.sheet, column);
          if (typeof c === 'object' && 'gt' in c) return `(${r}>${c.gt})`;
          return `(${r}=${criterionText(c, scope)})`;
        });
        return [
          `SUMPRODUCT(${terms.join('*')})`,
          matchingRows(expr.sheet, expr.where, scope).length,
        ];
      }
      case 'unreferenced': {
        const keyRange = range(expr.sheet, expr.key);
        const referenced = expr.refs.map(([sheet, column]) => {
          return new Set(columnValues(sheet, column).map(normalizeKey));
        });
        const count = columnValues(expr.sheet, expr.key).filter((v) =>
          referenced.every((set) => !set.has(normalizeKey(v))),
        ).length;
        const terms = expr.refs.map(
          ([sheet, column]) => `(COUNTIF(${range(sheet, column)},${keyRange})=0)`,
        );
        return [`SUMPRODUCT(${terms.join('*')})`, count];
      }
      case 'lookup': {
        const by = plain(scope.values[index(scope.headers, expr.by, '這張彙總表')]);
        const keys = columnValues(expr.sheet, expr.match);
        const found = keys.findIndex((k) => by !== null && !(by instanceof Date) && same(k, by));
        const values = columnValues(expr.sheet, expr.value);
        const result = found < 0 ? null : values[found];
        const by$ = `$${columnLetter(index(scope.headers, expr.by, '這張彙總表'))}${scope.rowNumber}`;
        return [
          `INDEX(${range(expr.sheet, expr.value)},MATCH(${by$},${range(expr.sheet, expr.match)},0))`,
          result instanceof Date ? null : result,
        ];
      }
      case 'add': {
        const parts = expr.terms.map((t) => evaluate(t, scope));
        return [parts.map(([f]) => f).join('+'), parts.reduce((s, [, v]) => s + number(v), 0)];
      }
      case 'sub': {
        const [lf, lv] = evaluate(expr.left, scope);
        const [rf, rv] = evaluate(expr.right, scope);
        return [`${lf}-${rf}`, number(lv) - number(rv)];
      }
      case 'ratio': {
        const [nf, nv] = evaluate(expr.num, scope);
        const [df, dv] = evaluate(expr.den, scope);
        const den = expr.den.op === 'add' || expr.den.op === 'sub' ? `(${df})` : df;
        return [`IF(${df}=0,0,${nf}/${den})`, number(dv) === 0 ? 0 : number(nv) / number(dv)];
      }
    }
  }

  return { evaluate };
}

const number = (v: string | number | null): number => (typeof v === 'number' ? v : 0);

// Excel 只保留 15 位有效數字：小數加總的浮點誤差（例如 21158999.529999997）要和 Excel 存的值一致。
const excelPrecision = (n: number): number => Number(n.toPrecision(15));

// 索引的鍵：數字與數字字串視為相同，文字不分大小寫（與 same 一致）。
function normalizeKey(value: string | number | Date | null): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return `#${value}`;
  const trimmed = value.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed))
    ? `#${Number(trimmed)}`
    : value.toLowerCase();
}
