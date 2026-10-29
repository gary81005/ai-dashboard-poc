// 標準化轉換的通用流程（設定格式見 types.ts）：
//   1. 依設定的順序產生每張資料表：逐列的資料表（事實表、主檔、維度、日曆）直接算出值；
//      彙總表的指標寫成公式，引用前面已經產生的資料表，同時算出結果。
//   2. 資料品質檢核：每條規則的影響筆數寫成公式，母數是相關資料表的列數，佔比 = 影響筆數 ÷ 母數。
//   3. 使用說明：設定裡的文字，可以引用原始資料算出的數字（例如日期範圍）。
//   4. 欄位定義：依每個欄位的代碼、型別、單位、資料來源自動產生。
// 輸出順序固定是 使用說明、資料品質檢核、欄位定義，接著是設定裡的資料表。

import { columnLetter, createEvaluator, plain, ratio, ref, sheetName } from './formula.ts';
import type { RowScope, SheetView } from './formula.ts';
import type {
  AggregateTableSpec,
  Cell,
  CheckSpec,
  Column,
  ColumnType,
  Context,
  OutputColumn,
  OutputTable,
  RawRow,
  RawValue,
  RawWorkbook,
  RowTableSpec,
  StandardizeSpec,
} from './types.ts';
import { isBlank } from './values.ts';

// 各型別的 Excel 數字格式；文字欄位不設定。
export const NUMBER_FORMATS: Record<ColumnType, string | undefined> = {
  文字: undefined,
  整數: '0',
  數值: '#,##0',
  百分比: '0.0%',
  日期: 'yyyy-mm-dd',
};

export function createContext(raw: RawWorkbook, sourceName: string): Context {
  const valueSets = new Map<string, Set<RawValue>>();
  const counts = new Map<string, Map<RawValue, number>>();
  const column = (sheet: string, header: string): RawValue[] =>
    (raw[sheet] ?? []).map((row: RawRow) => row[header] ?? null);
  return {
    raw,
    sourceName,
    valuesOf: (sheet, header) => {
      const key = `${sheet}\u0000${header}`;
      let set = valueSets.get(key);
      if (!set) {
        set = new Set(column(sheet, header).filter((v) => !isBlank(v)));
        valueSets.set(key, set);
      }
      return set;
    },
    countOf: (sheet, header, value) => {
      const key = `${sheet}\u0000${header}`;
      let map = counts.get(key);
      if (!map) {
        map = new Map();
        for (const v of column(sheet, header)) map.set(v, (map.get(v) ?? 0) + 1);
        counts.set(key, map);
      }
      return map.get(value) ?? 0;
    },
  };
}

const metaOf = ({ header, code, type, unit, source, width }: OutputColumn): OutputColumn => ({
  header,
  code,
  type,
  ...(unit !== undefined && { unit }),
  source,
  ...(width !== undefined && { width }),
});

function rowTable(spec: RowTableSpec<unknown>, ctx: Context): OutputTable {
  const rows = spec
    .rows(ctx)
    .map((row) => spec.columns.map((c: Column<unknown>) => c.value(row, ctx)));
  return { sheet: spec.sheet, table: spec.table, columns: spec.columns.map(metaOf), rows };
}

function aggregateTable(spec: AggregateTableSpec, sheets: Map<string, SheetView>): OutputTable {
  const { evaluate } = createEvaluator(sheets);
  const headers = spec.columns.map((c) => c.header);
  const keyColumns = spec.columns.filter((c) => 'key' in c).map((c) => c.header);

  // 每列的鍵：幾張資料表裡出現過的鍵組合（聯集、依序排序），或和另一張資料表一列對一列。
  let keys: Array<Array<string | number | Date | null>>;
  const { rows } = spec;
  if ('keys' in rows) {
    const seen = new Map<string, Array<string | number | Date | null>>();
    for (const source of rows.keys) {
      const view = sheets.get(source.table);
      if (!view)
        throw new Error(`彙總表「${spec.sheet}」引用了還沒產生的工作表「${source.table}」`);
      const indexes = source.columns.map((c) => view.headers.indexOf(c));
      for (const row of view.rows) {
        const key = indexes.map((i) => plain(row[i]));
        seen.set(JSON.stringify(key), key);
      }
    }
    keys = [...seen.values()].sort(compareKeys);
  } else {
    const view = sheets.get(rows.link.table);
    if (!view)
      throw new Error(`彙總表「${spec.sheet}」引用了還沒產生的工作表「${rows.link.table}」`);
    keys = view.rows.map(() => []);
  }

  const out = keys.map((key, r) => {
    const values: Cell[] = [];
    const scope: RowScope = { headers, rowNumber: r + 2, values };
    for (const column of spec.columns) {
      if ('key' in column) values.push(key[keyColumns.indexOf(column.header)] ?? null);
      else if ('link' in column) {
        const view = sheets.get(column.link.table);
        const i = view?.headers.indexOf(column.link.column) ?? -1;
        if (!view || i < 0) throw new Error(`找不到 ${column.link.table}!${column.link.column}`);
        values.push({
          formula: `${sheetName(column.link.table)}!${columnLetter(i)}${r + 2}`,
          result: plain(view.rows[r][i]) as string | number | null,
        });
      } else {
        const [formula, result] = evaluate(column.formula, scope);
        values.push({ formula, result });
      }
    }
    return values;
  });

  const columns = spec.columns.map((c): OutputColumn => {
    const style =
      'link' in c || ('formula' in c && c.formula.op === 'lookup')
        ? 'link'
        : 'formula' in c
          ? 'formula'
          : undefined;
    return { ...metaOf(c), ...(style && { style }) };
  });
  return { sheet: spec.sheet, table: spec.table, columns, rows: out };
}

function compareKeys(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): number {
  for (let i = 0; i < a.length; i++) {
    const x = String(a[i] ?? '');
    const y = String(b[i] ?? '');
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ── 固定的三張表 ─────────────────────────────────────────────────────

const README_COLUMNS: OutputColumn[] = [
  { header: '類別', code: 'category', type: '文字', source: '手動輸入', width: 14 },
  { header: '說明', code: 'note', type: '文字', source: '手動輸入', width: 120 },
];

const CHECK_COLUMNS: OutputColumn[] = [
  { header: '檢核代碼', code: 'check_id', type: '文字', source: '手動輸入', width: 11 },
  {
    header: '嚴重度',
    code: 'severity',
    type: '文字',
    unit: '高/中/低',
    source: '手動輸入',
    width: 9,
  },
  { header: '檢核項目', code: 'check_name', type: '文字', source: '手動輸入', width: 38 },
  {
    header: '影響筆數',
    code: 'affected_rows',
    type: '整數',
    unit: '筆',
    source: '公式',
    width: 12,
    style: 'formula',
  },
  { header: '總筆數', code: 'base_rows', type: '整數', unit: '筆', source: '手動輸入', width: 11 },
  {
    header: '佔比',
    code: 'affected_pct',
    type: '百分比',
    unit: '小數',
    source: '公式',
    width: 10,
    style: 'formula',
  },
  { header: '說明與建議處理方式', code: 'suggestion', type: '文字', source: '手動輸入', width: 78 },
];

const DICTIONARY_COLUMNS: OutputColumn[] = [
  { header: '工作表', code: 'sheet', type: '文字', source: '手動輸入', width: 14 },
  { header: '欄位位置', code: 'position', type: '文字', source: '手動輸入', width: 10 },
  { header: '欄位代碼', code: 'code', type: '文字', source: '手動輸入', width: 20 },
  { header: '中文欄名', code: 'header', type: '文字', source: '手動輸入', width: 22 },
  { header: '資料型別', code: 'type', type: '文字', source: '手動輸入', width: 10 },
  { header: '單位／說明', code: 'unit', type: '文字', source: '手動輸入', width: 28 },
  { header: '資料來源', code: 'source', type: '文字', source: '手動輸入', width: 32 },
];

function checkTable(checks: readonly CheckSpec[], sheets: Map<string, SheetView>): OutputTable {
  const { evaluate } = createEvaluator(sheets);
  const headers = CHECK_COLUMNS.map((c) => c.header);
  const rows = checks.map((check, r) => {
    const values: Cell[] = [check.id, check.severity, check.name];
    const scope: RowScope = { headers, rowNumber: r + 2, values };
    const [formula, result] = evaluate(check.affected, scope);
    values.push({ formula, result });
    values.push(
      check.base.reduce((sum, sheet) => {
        const view = sheets.get(sheet);
        if (!view) throw new Error(`檢核 ${check.id} 的總筆數引用了不存在的工作表「${sheet}」`);
        return sum + view.rows.length;
      }, 0),
    );
    const [pctFormula, pct] = evaluate(ratio(ref('影響筆數'), ref('總筆數')), scope);
    values.push({ formula: pctFormula, result: pct });
    values.push(check.note);
    return values;
  });
  return { sheet: '資料品質檢核', table: 'tbl_data_quality', columns: CHECK_COLUMNS, rows };
}

function dictionaryTable(tables: readonly OutputTable[]): OutputTable {
  const rows = tables.flatMap((t) =>
    t.columns.map((c, i): Cell[] => [
      t.sheet,
      columnLetter(i),
      c.code,
      c.header,
      c.type,
      c.unit ?? null,
      c.source,
    ]),
  );
  return { sheet: '欄位定義', table: 'tbl_data_dict', columns: DICTIONARY_COLUMNS, rows };
}

// ── 主流程 ───────────────────────────────────────────────────────────

export function standardize(
  spec: StandardizeSpec,
  raw: RawWorkbook,
  sourceName: string,
): OutputTable[] {
  const ctx = createContext(raw, sourceName);
  const sheets = new Map<string, SheetView>();
  const tables: OutputTable[] = [];
  for (const tableSpec of spec.tables) {
    const table =
      tableSpec.kind === 'rows' ? rowTable(tableSpec, ctx) : aggregateTable(tableSpec, sheets);
    tables.push(table);
    sheets.set(table.sheet, {
      sheet: table.sheet,
      headers: table.columns.map((c) => c.header),
      rows: table.rows,
    });
  }
  const checks = checkTable(spec.checks, sheets);
  const readme: OutputTable = {
    sheet: '使用說明',
    table: 'tbl_readme',
    columns: README_COLUMNS,
    rows: spec.readme.map(([category, note]) => [
      category,
      typeof note === 'function' ? note(ctx) : note,
    ]),
  };
  // 欄位定義列出所有資料表，加上檢核與使用說明本身（不含欄位定義自己）。
  const dictionary = dictionaryTable([...tables, checks, readme]);
  return [readme, checks, dictionary, ...tables];
}
