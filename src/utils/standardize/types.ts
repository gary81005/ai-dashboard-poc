// 標準化轉換的設定格式：把系統匯出的原始活頁簿，轉成符合本專案結構規範的標準化活頁簿。
//
// 引擎（engine.ts）只負責通用流程；每種來源（例如 CRM 匯出檔）寫一份設定，描述要產生哪些資料表、
// 每個欄位從哪裡來、怎麼轉換。設定用一般的 TypeScript 函式描述欄位的值，常用的清理與轉換
// 放在 values.ts，彙總與檢核的公式用 formula.ts 的 Expr 描述。
//
// 兩條原則：原始值不刪不改，只做型別正規化與新增衍生欄位；資料品質問題不修補，只標記旗標並列入檢核。

import type { Expr } from './formula.ts';

// 原始活頁簿：工作表名稱 → 資料列（第 1 列的標頭 → 值）。
export type RawValue = string | number | boolean | Date | null;
export type RawRow = Record<string, RawValue>;
export type RawWorkbook = Record<string, RawRow[]>;

// 公式儲存格：公式文字（不含開頭的 =）與計算結果。結果一併寫進檔案，不用開 Excel 重算也看得到。
export type FormulaCell = { formula: string; result: string | number | null };
export type Cell = string | number | Date | null | FormulaCell;

// 欄位的資料型別，與「欄位定義」工作表的寫法相同，也決定數字格式。
export type ColumnType = '文字' | '整數' | '數值' | '百分比' | '日期';

// 每個欄位都會列進「欄位定義」：代碼、型別、單位或說明、資料來源。
type ColumnMeta = {
  header: string;
  code: string;
  type: ColumnType;
  // 欄位定義的「單位／說明」，例如「元」「1=是」「join 客戶主檔」。
  unit?: string;
  // 欄位定義的「資料來源」，例如「原樣匯入」「正規化（文字→日期）」「衍生」。
  source: string;
  // 欄寬（字元數）；沒有的話依標頭長度估算。
  width?: number;
};

// 轉換時可用的資料：原始活頁簿，以及常用查詢（結果會快取）。
export type Context = {
  raw: RawWorkbook;
  // 原始檔名，給使用說明引用。
  sourceName: string;
  // 某張原始工作表某欄的所有值（排除空白），例如判斷商機編號能不能對應。
  valuesOf: (sheet: string, header: string) => Set<RawValue>;
  // 某張原始工作表某欄等於 value 的列數，例如判斷客戶名稱是否重複。
  countOf: (sheet: string, header: string, value: RawValue) => number;
};

export type Column<R> = ColumnMeta & { value: (row: R, ctx: Context) => Cell };

// 逐列產生的資料表：事實表、主檔、從事實表萃取的維度表、日曆。
// rows 決定一列代表什麼（原始工作表的一列、一個不重複的鍵、一個月），columns 決定每欄的值。
export type RowTableSpec<R> = {
  kind: 'rows';
  sheet: string;
  // Excel 表格物件名稱，前綴代表資料表種類：tbl_fact_、tbl_agg_、tbl_dim_。
  table: string;
  rows: (ctx: Context) => R[];
  columns: Column<R>[];
};

// 彙總表：每列是一組鍵，指標寫成 Excel 公式（COUNTIFS、SUMIFS…），引用其他輸出資料表。
export type AggregateColumn = ColumnMeta &
  (
    | { key: true }
    // 連結到另一張輸出資料表同一列的儲存格，例如月度彙總的年月連到日曆參數。
    | { link: { table: string; column: string } }
    | { formula: Expr }
  );

export type AggregateTableSpec = {
  kind: 'aggregate';
  sheet: string;
  table: string;
  // 列的來源：
  //   keys — 幾張輸出資料表裡出現過的鍵組合（聯集、排序），例如「年月 × 業務員編」。
  //   link — 和另一張輸出資料表一列對一列，例如日曆參數的每個月。
  rows:
    | { keys: Array<{ table: string; columns: string[] }> }
    | { link: { table: string; column: string } };
  columns: AggregateColumn[];
};

export type TableSpec = RowTableSpec<unknown> | AggregateTableSpec;

// 資料品質檢核的一條規則：影響筆數寫成公式，母數是幾張輸出資料表的列數合計。
export type CheckSpec = {
  id: string;
  severity: '高' | '中' | '低';
  name: string;
  affected: Expr;
  base: string[];
  note: string;
};

export type ReadmeLine = [category: string, note: string | ((ctx: Context) => string)];

export type StandardizeSpec = {
  readme: ReadmeLine[];
  // 依輸出順序排列；使用說明、資料品質檢核、欄位定義固定排在最前面。
  tables: TableSpec[];
  checks: CheckSpec[];
};

// ── 輸出 ──────────────────────────────────────────────────────────────

export type OutputColumn = ColumnMeta & {
  // 公式欄位的字色：同表公式黑字、跨工作表連結綠字（與使用說明的顏色規則一致）。
  style?: 'formula' | 'link';
};

export type OutputTable = {
  sheet: string;
  table: string;
  columns: OutputColumn[];
  rows: Cell[][];
};

// 讓設定檔把不同列型別的資料表放進同一個陣列。
export function rowTable<R>(spec: Omit<RowTableSpec<R>, 'kind'>): TableSpec {
  return { kind: 'rows', ...spec } as unknown as RowTableSpec<unknown>;
}

export function aggregateTable(spec: Omit<AggregateTableSpec, 'kind'>): TableSpec {
  return { kind: 'aggregate', ...spec };
}
