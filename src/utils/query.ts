// 彙總引擎：把 widget 的槽位設定（encoding）＋ 資料列，轉成圖表可以直接使用的資料（規則見 docs/adr/0004）。
//
// 每種圖表各有一個 query 函式（queryCategorical／queryPie／queryScatter／queryValue／queryTable），
// 共同流程都是：套用篩選 → 解析欄位參照 → 分組 → 彙總。
// 找不到欄位時丟出 MissingFieldError，由 utils/runQuery.ts 轉成畫面上的「欄位遺失」提示。
// 這裡全是純函式、不依賴 React，可以直接在 Node 中執行測試。

import { measureLabel, resolveField } from './fields.ts';
import { isPeriodValue } from './inference.ts';
import type {
  Agg,
  CellValue,
  DataTable,
  Field,
  FieldRef,
  Filter,
  Measure,
  Row,
} from '../types/index.ts';

// 欄位參照在目前的資料表找不到時丟出，帶著原本的參照供畫面顯示。
export class MissingFieldError extends Error {
  readonly ref: FieldRef;

  constructor(ref: FieldRef) {
    super(`欄位遺失：${ref.header}`);
    this.name = 'MissingFieldError';
    this.ref = ref;
  }
}

// 每次查詢的輸入：widget 使用的資料表、它的資料列、widget 的篩選條件。
export type QueryContext = { table: DataTable; rows: Row[]; filters: Filter[] };

export type ResolvedMeasure = { field: Field; agg: Agg; label: string };

// 空白值在分類軸上顯示的名稱；分組與篩選都以 categoryKey() 轉成的字串比對。
export const BLANK_CATEGORY = '（空白）';

export function categoryKey(value: CellValue): string {
  return value === null || value === '' ? BLANK_CATEGORY : String(value);
}

// 解析欄位參照，找不到就丟 MissingFieldError。
function fieldOf(table: DataTable, ref: FieldRef): Field {
  const field = resolveField(table, ref);
  if (!field) throw new MissingFieldError(ref);
  return field;
}

function resolveMeasure(table: DataTable, measure: Measure): ResolvedMeasure {
  const field = fieldOf(table, measure.field);
  return { field, agg: measure.agg, label: measureLabel(field, measure.agg) };
}

// 套用 widget 層級篩選：沒選任何值的篩選視為不篩選；多個篩選之間是 AND。
function applyFilters(ctx: QueryContext): Row[] {
  const active = ctx.filters
    .filter((f) => f.values.length > 0)
    .map((f) => ({
      header: fieldOf(ctx.table, f.field).header,
      values: new Set(f.values.map(String)),
    }));
  if (active.length === 0) return ctx.rows;
  return ctx.rows.filter((row) => active.every((f) => f.values.has(categoryKey(row[f.header]))));
}

// 分類的排列順序：時間類（日期或 YYYY-MM）照時間先後、純數字由小到大，其他維持資料出現的順序。
export function orderCategories(rows: readonly Row[], field: Field): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = categoryKey(row[field.header]);
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  const present = rows.map((r) => r[field.header]).filter((v) => v !== null && v !== '');
  if (present.length === 0) return ordered;
  if (field.dataType === 'date' || present.every(isPeriodValue)) return ordered.sort();
  if (present.every((v) => typeof v === 'number')) {
    return ordered.sort((a, b) => Number(a) - Number(b));
  }
  return ordered;
}

// 彙總一組資料列：count 計算非空白的值；其他方式只計算數字（文字被忽略），
// 沒有任何數字時回傳 null（圖表上會留空）。
function aggregate(rows: readonly Row[], field: Field, agg: Agg): number | null {
  let present = 0;
  let numeric = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const value = row[field.header];
    if (value === null || value === '') continue;
    present += 1;
    if (typeof value === 'number') {
      numeric += 1;
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (agg === 'count') return present;
  if (numeric === 0) return null;
  switch (agg) {
    case 'sum':
      return sum;
    case 'avg':
      return sum / numeric;
    case 'min':
      return min;
    case 'max':
      return max;
  }
}

// 比率欄位只有在「多列被合併成一個數字」時才會算錯，用來決定是否顯示「⚠ 非加權平均」。
function mergesRatio(measure: ResolvedMeasure, rows: readonly Row[]): boolean {
  return measure.field.ratio === true && measure.agg !== 'count' && rows.length > 1;
}

// 依一個或多個欄位的值把資料列分桶；鍵值以不可見字元串接，避免值本身含分隔符號時衝突。
function bucketKey(parts: readonly string[]): string {
  return parts.join('\u0000');
}

function groupRows(rows: readonly Row[], fields: readonly Field[]): Map<string, Row[]> {
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    const key = bucketKey(fields.map((f) => categoryKey(row[f.header])));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return buckets;
}

export type CategoricalSeries = {
  id: string;
  label: string;
  measure: ResolvedMeasure;
  measureIndex: number;
  data: Array<number | null>;
};

export type CategoricalResult = {
  xField: Field;
  categories: string[];
  series: CategoricalSeries[];
  unweightedRatio: boolean;
};

// 折線、長條、組合、雷達共用：X 軸分類 × 每個量值（× 分組值）各一個系列。
// 某個分類在某組沒有資料時回傳 null，圖表上會留空。
export function queryCategorical(
  ctx: QueryContext,
  x: FieldRef,
  measures: readonly Measure[],
  group?: FieldRef,
): CategoricalResult {
  const rows = applyFilters(ctx);
  const xField = fieldOf(ctx.table, x);
  const groupField = group ? fieldOf(ctx.table, group) : undefined;
  const resolved = measures.map((m) => resolveMeasure(ctx.table, m));
  const categories = orderCategories(rows, xField);
  const groupValues = groupField ? orderCategories(rows, groupField) : [''];
  const buckets = groupRows(rows, groupField ? [xField, groupField] : [xField]);

  let unweightedRatio = false;
  const series = resolved.flatMap((measure, measureIndex) =>
    groupValues.map((groupValue) => ({
      id: `${measureIndex}:${groupValue}`,
      label: !groupField
        ? measure.label
        : resolved.length > 1
          ? `${groupValue}・${measure.label}`
          : groupValue,
      measure,
      measureIndex,
      data: categories.map((category) => {
        const bucket = buckets.get(bucketKey(groupField ? [category, groupValue] : [category]));
        if (!bucket) return null;
        if (mergesRatio(measure, bucket)) unweightedRatio = true;
        return aggregate(bucket, measure.field, measure.agg);
      }),
    })),
  );
  return { xField, categories, series, unweightedRatio };
}

export type PieResult = {
  measure: ResolvedMeasure;
  items: Array<{ id: string; label: string; value: number }>;
  unweightedRatio: boolean;
};

// 圓餅圖：依分類彙總，只保留大於 0 的值（圓餅圖無法表示 0 或負數）。
export function queryPie(ctx: QueryContext, category: FieldRef, value: Measure): PieResult {
  const rows = applyFilters(ctx);
  const categoryField = fieldOf(ctx.table, category);
  const measure = resolveMeasure(ctx.table, value);
  const buckets = groupRows(rows, [categoryField]);
  let unweightedRatio = false;
  const items = orderCategories(rows, categoryField).flatMap((label) => {
    const bucket = buckets.get(bucketKey([label])) ?? [];
    if (mergesRatio(measure, bucket)) unweightedRatio = true;
    const total = aggregate(bucket, measure.field, measure.agg);
    return total !== null && total > 0 ? [{ id: label, label, value: total }] : [];
  });
  return { measure, items, unweightedRatio };
}

export type ScatterPoint = { id: string; x: number; y: number; label?: string };

export type ScatterResult = {
  x: ResolvedMeasure;
  y: ResolvedMeasure;
  series: Array<{ id: string; label: string; points: ScatterPoint[] }>;
  unweightedRatio: boolean;
};

// 散佈圖：X、Y 都是量值；顏色欄位把點分成多個系列，明細欄位決定一個點代表什麼。
export function queryScatter(
  ctx: QueryContext,
  x: Measure,
  y: Measure,
  color?: FieldRef,
  detail?: FieldRef,
): ScatterResult {
  const rows = applyFilters(ctx);
  const xMeasure = resolveMeasure(ctx.table, x);
  const yMeasure = resolveMeasure(ctx.table, y);
  const colorField = color ? fieldOf(ctx.table, color) : undefined;
  const detailField = detail ? fieldOf(ctx.table, detail) : undefined;
  const colorValues = colorField ? orderCategories(rows, colorField) : [''];
  const byColor = colorField
    ? groupRows(rows, [colorField])
    : new Map([[bucketKey(['']), [...rows]]]);

  let unweightedRatio = false;
  const series = colorValues.map((colorValue) => {
    const colorRows = byColor.get(bucketKey([colorValue])) ?? [];
    let points: ScatterPoint[];
    if (detailField) {
      // 有明細欄位：依明細值分組彙總，一個值一個點（例如一家店一個點）。
      points = [...groupRows(colorRows, [detailField])].flatMap(([key, bucket]) => {
        if (mergesRatio(xMeasure, bucket) || mergesRatio(yMeasure, bucket)) unweightedRatio = true;
        const px = aggregate(bucket, xMeasure.field, xMeasure.agg);
        const py = aggregate(bucket, yMeasure.field, yMeasure.agg);
        return px === null || py === null
          ? []
          : [{ id: `${colorValue}:${key}`, x: px, y: py, label: key }];
      });
    } else {
      // 沒有明細欄位：每一列資料就是一個點，不做彙總。
      points = colorRows.flatMap((row, index) => {
        const px = row[xMeasure.field.header];
        const py = row[yMeasure.field.header];
        return typeof px === 'number' && typeof py === 'number'
          ? [{ id: `${colorValue}:${index}`, x: px, y: py }]
          : [];
      });
    }
    return { id: colorValue || 'all', label: colorValue || yMeasure.label, points };
  });
  return { x: xMeasure, y: yMeasure, series, unweightedRatio };
}

export type ValueResult = {
  measure: ResolvedMeasure;
  value: number | null;
  trend?: { labels: string[]; data: Array<number | null> };
  unweightedRatio: boolean;
};

// KPI 卡與儀表圖：把（篩選後的）全部資料列彙總成一個數字；KPI 卡另外依趨勢欄位算出走勢線。
export function queryValue(ctx: QueryContext, value: Measure, trend?: FieldRef): ValueResult {
  const rows = applyFilters(ctx);
  const measure = resolveMeasure(ctx.table, value);
  const result: ValueResult = {
    measure,
    value: aggregate(rows, measure.field, measure.agg),
    unweightedRatio: mergesRatio(measure, rows),
  };
  if (trend) {
    const trendField = fieldOf(ctx.table, trend);
    const buckets = groupRows(rows, [trendField]);
    const labels = orderCategories(rows, trendField);
    result.trend = {
      labels,
      data: labels.map((label) =>
        aggregate(buckets.get(bucketKey([label])) ?? [], measure.field, measure.agg),
      ),
    };
  }
  return result;
}

export type TableResultColumn = { key: string; field: Field; agg?: Agg; label: string };

export type TableResult = {
  columns: TableResultColumn[];
  rows: Array<Record<string, CellValue>>;
  unweightedRatio: boolean;
};

// 資料表格：所有欄位都不彙總時顯示明細列；只要有一欄設了彙總，就依其他欄位分組成摘要表。
export function queryTable(
  ctx: QueryContext,
  columns: ReadonlyArray<{ field: FieldRef; agg?: Agg }>,
): TableResult {
  const rows = applyFilters(ctx);
  const resolved: TableResultColumn[] = columns.map((column, index) => {
    const field = fieldOf(ctx.table, column.field);
    return {
      key: `c${index}`,
      field,
      agg: column.agg,
      label: column.agg ? measureLabel(field, column.agg) : field.header,
    };
  });

  const hasAgg = resolved.some((c) => c.agg);
  if (!hasAgg) {
    return {
      columns: resolved,
      rows: rows.map((row) =>
        Object.fromEntries(resolved.map((c) => [c.key, row[c.field.header]])),
      ),
      unweightedRatio: false,
    };
  }

  // 有任何一欄設了彙總：以沒有彙總的欄位當分組鍵，產生摘要表。
  const dimensions = resolved.filter((c) => !c.agg);
  const buckets = groupRows(
    rows,
    dimensions.map((c) => c.field),
  );
  let unweightedRatio = false;
  const summary = [...buckets.values()].map((bucket) =>
    Object.fromEntries(
      resolved.map((c) => {
        if (!c.agg) return [c.key, bucket[0][c.field.header]];
        const measure = { field: c.field, agg: c.agg, label: c.label };
        if (mergesRatio(measure, bucket)) unweightedRatio = true;
        return [c.key, aggregate(bucket, c.field, c.agg)];
      }),
    ),
  );
  return { columns: resolved, rows: summary, unweightedRatio };
}
