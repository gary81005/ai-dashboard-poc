// 一鍵產生建議儀表板（ADR 0010 §6 ⑦）：從一張主資料表依固定的組成產生最多 12 個元件、
// 排好版面，再挑最多 3 個儀表板篩選。
//
// 每個元件都由 utils/recommend.ts 的對照表產生（例如「第 1 個 M ＋第 1 個 R」就是把這兩個欄位
// 交給 recommend 取第一推薦），所以標題、彙總方式與條件和推薦卡片一致，也不會一建立就觸發警告；
// 條件不成立（recommend 只給表格）的項目直接跳過。推薦理由放進元件的說明欄。

import type {
  DashboardFilter,
  Dataset,
  DatasetRows,
  DataTable,
  LayoutItem,
  Row,
  Widget,
  WidgetType,
} from '../types/index.ts';
import { profilesOf } from './fieldKinds.ts';
import type { FieldProfile } from './fieldKinds.ts';
import { resolveField, toFieldRef } from './fields.ts';
import { isPeriodValue } from './inference.ts';
import { recommend } from './recommend.ts';
import { tableKindOf } from './tableKinds.ts';
import type { TableKind } from './tableKinds.ts';

const GRID_COLS = 12;
const MAX_WIDGETS = 12;
const MAX_FILTERS = 3;
const KPI_COUNT = 4;
const MAX_BARS = 2;
const TABLE_MEASURES = 4;
// 明細表最多依幾個分類／識別欄位分組，避免表格寬到看不完。
const TABLE_MAX_DIMENSIONS = 3;
// 同期比較的分線、篩選用的序列時間：不同值 ≤ 6 種（例如年、球季，不含年月）。
const FEW_PERIODS = 6;

// 各組成項目的寬 × 高（ADR 0010 §6）。
const SIZES = {
  kpi: { w: 3, h: 3 },
  trend: { w: 8, h: 4 },
  share: { w: 4, h: 4 },
  bar: { w: 6, h: 4 },
  cycle: { w: 6, h: 4 },
  ranking: { w: 6, h: 6 },
  scatter: { w: 6, h: 6 },
  table: { w: 12, h: 6 },
} as const;

type Size = { w: number; h: number };
type Item = { widget: Widget; size: Size };

// ── 主資料表 ─────────────────────────────────────────────────────────

export type MainTableOption = { table: DataTable; kind: TableKind; measures: number };

const isMeasure = (p: FieldProfile) => p.kind.kind === 'measure' || p.kind.kind === 'ratio';

// 以年、球季為單位、值不多的序列時間，當同期比較的分線與儀表板篩選。年月、日期這類以月或日為單位的
// 時間不算：只有 6 個月的資料時，「年月」值也很少，但拿來分線或篩選都沒有意義。
function fewPeriodsOf(ts: readonly FieldProfile[]): FieldProfile | undefined {
  const finerThanYear = (p: FieldProfile) =>
    p.field.dataType === 'date' || p.field.header === '年月' || p.samples.some(isPeriodValue);
  return ts.find((p) => p.distinct <= FEW_PERIODS && !finerThanYear(p));
}

// 可以當主資料表的表：看得到、有資料列、至少有 1 個量值，主檔與參數表除外。
// 排序：明細表優先，再依量值欄位數、列數由多到少；第一個就是預設的主資料表。
export function mainTableOptions(dataset: Dataset, rows: DatasetRows): MainTableOption[] {
  return dataset.tables
    .filter((t) => !t.hidden && (rows[t.key]?.length ?? 0) > 0)
    .map((table) => {
      const tableRows = rows[table.key];
      const profiles = profilesOf(table, tableRows);
      return {
        table,
        kind: tableKindOf(table, profiles, tableRows.length),
        measures: profiles.filter(isMeasure).length,
      };
    })
    .filter((o) => o.measures > 0 && o.kind !== 'dimension' && o.kind !== 'parameter')
    .sort(
      (a, b) =>
        Number(b.kind === 'fact') - Number(a.kind === 'fact') ||
        b.measures - a.measures ||
        b.table.rowCount - a.table.rowCount,
    );
}

// ── 組成 ─────────────────────────────────────────────────────────────

type Fields = {
  ms: FieldProfile[];
  rs: FieldProfile[];
  measures: FieldProfile[];
  cs: FieldProfile[];
  is: FieldProfile[];
  ts: FieldProfile[];
  tc: FieldProfile[];
};

// 依欄位分類分組，各組維持 Excel 的欄位順序。分類只取維度角色、2 種值以上、不是 0/1 旗標的欄位；
// 識別欄位裡，名稱、姓名結尾的排在代號、編號前面（ADR 0010 §2）。
function fieldsOf(profiles: readonly FieldProfile[]): Fields {
  const of = (test: (p: FieldProfile) => boolean) => profiles.filter(test);
  const named = (p: FieldProfile) => (/(名稱|姓名)$/.test(p.field.header) ? 0 : 1);
  return {
    ms: of((p) => p.kind.kind === 'measure'),
    rs: of((p) => p.kind.kind === 'ratio'),
    measures: of(isMeasure),
    cs: of(
      (p) =>
        p.kind.kind === 'category' &&
        !p.kind.flag &&
        p.kind.level !== 'single' &&
        p.field.role === 'dimension',
    ),
    is: of((p) => p.kind.kind === 'identifier').sort((a, b) => named(a) - named(b)),
    ts: of((p) => p.kind.kind === 'time' && p.kind.time === 'sequence' && p.distinct >= 2),
    tc: of((p) => p.kind.kind === 'time' && p.kind.time === 'cycle' && p.distinct >= 2),
  };
}

type Context = { table: DataTable; rows: readonly Row[]; profiles: readonly FieldProfile[] };

// 把欄位交給對照表，取指定類型的第一個候選；推薦理由寫進說明欄。
function pick(
  ctx: Context,
  fields: ReadonlyArray<FieldProfile | undefined>,
  types: readonly WidgetType[],
): Widget | undefined {
  const present = fields.filter((f) => f !== undefined);
  if (present.length !== fields.length) return undefined;
  const headers = present.map((f) => f.field.header);
  const found = recommend(ctx.table, ctx.rows, ctx.profiles, headers).recommendations.find((r) =>
    types.includes(r.widget.type),
  );
  return found && { ...found.widget, description: found.reason };
}

function compose(ctx: Context): Item[] {
  const { ms, rs, measures, cs, is, ts, tc } = fieldsOf(ctx.profiles);
  const items: Item[] = [];
  const add = (widget: Widget | undefined, size: Size) => {
    if (widget) items.push({ widget, size });
  };
  const firstMeasure = ms[0] ?? rs[0];

  // 1. KPI 卡 ×4：前 3 個 M ＋前 1 個 R；不足 4 個時依欄位順序用其他量值補滿。
  const kpis = [...ms.slice(0, 3), ...rs.slice(0, 1)];
  for (const p of measures) {
    if (kpis.length >= KPI_COUNT) break;
    if (!kpis.includes(p)) kpis.push(p);
  }
  kpis.sort((a, b) => measures.indexOf(a) - measures.indexOf(b));
  for (const p of kpis) add(pick(ctx, [p], ['kpi']), SIZES.kpi);

  // 2. 趨勢：不同值最多的序列時間 × 第 1 個 M ＋第 1 個 R（組合圖）；只有一種時是折線。
  const trendTime = [...ts].sort((a, b) => b.distinct - a.distinct)[0];
  const trendMeasures = [ms[0], rs[0]].filter((p) => p !== undefined);
  if (trendTime && trendMeasures.length > 0) {
    add(pick(ctx, [trendTime, ...trendMeasures], ['combo', 'line']), SIZES.trend);
  }

  // 3. 占比：第一個「少」級的分類 × 第 1 個 M，做圓餅（值要全為正，比率不做圓餅）。
  let shareCategory: FieldProfile | undefined;
  const fewCategory = cs.find((p) => p.kind.kind === 'category' && p.kind.level === 'few');
  if (fewCategory && ms[0]) {
    const pie = pick(ctx, [fewCategory, ms[0]], ['pie']);
    if (pie) shareCategory = fewCategory;
    add(pie, SIZES.share);
  }

  // 4. 各分類長條 ×最多 2：其他分類 × 第 1 個量值。沒有序列時間時，週期時間也當成分類（ADR 0010 §2）。
  const barCategories = [...cs, ...(ts.length === 0 ? tc : [])].filter((p) => p !== shareCategory);
  for (const c of barCategories.slice(0, MAX_BARS)) {
    add(pick(ctx, [c, firstMeasure], ['bar']), SIZES.bar);
  }

  // 5. 同期比較：週期時間 × 值 ≤ 6 種的序列時間（不含年月）× 第 1 個量值。
  const fewPeriods = fewPeriodsOf(ts);
  if (tc[0] && fewPeriods) {
    add(pick(ctx, [tc[0], fewPeriods, firstMeasure], ['line']), SIZES.cycle);
  }

  // 6. 排行：第 1 個識別 × 第 1 個 R（沒有 R 用第 1 個 M），橫式前 10。
  add(pick(ctx, [is[0], rs[0] ?? ms[0]], ['bar']), SIZES.ranking);

  // 7. 散佈圖：第 1 個識別 ＋前 2 個量值（至少 5 個點）。
  if (measures.length >= 2) {
    add(pick(ctx, [is[0], measures[0], measures[1]], ['scatter']), SIZES.scatter);
  }

  // 8. 明細表：分類與識別欄位 ＋前 4 個量值，依第 1 個量值由大到小、顯示合計。
  const tableFields = [...cs, ...is].slice(0, TABLE_MAX_DIMENSIONS);
  if (tableFields.length > 0 && measures.length > 0) {
    const table = pick(ctx, [...tableFields, ...measures.slice(0, TABLE_MEASURES)], ['table']);
    if (table?.type === 'table') {
      add({ ...table, options: { ...table.options, sort: 'desc' } }, SIZES.table);
    }
  }

  return items.slice(0, MAX_WIDGETS);
}

// ── 版面 ─────────────────────────────────────────────────────────────

// 依序由左到右排，放不下或高度不同（例如 KPI 卡之後的趨勢圖）就換列，所以同一列的元件一樣高。
// 每列剩下的寬度平均分給該列的元件：例如沒有圓餅時趨勢圖撐滿整列，只有 3 張 KPI 卡時每張寬 4。
function arrange(items: readonly Item[]): LayoutItem[] {
  const rows: Item[][] = [];
  for (const item of items) {
    const row = rows.at(-1);
    const width = row?.reduce((sum, i) => sum + i.size.w, 0) ?? 0;
    if (row && width + item.size.w <= GRID_COLS && row[0].size.h === item.size.h) row.push(item);
    else rows.push([item]);
  }

  const layout: LayoutItem[] = [];
  let y = 0;
  for (const row of rows) {
    const width = row.reduce((sum, item) => sum + item.size.w, 0);
    const extra = Math.floor((GRID_COLS - width) / row.length);
    const { h } = row[0].size;
    let x = 0;
    row.forEach((item, index) => {
      const w = index === row.length - 1 ? GRID_COLS - x : item.size.w + extra;
      layout.push({ i: item.widget.id, x, y, w, h });
      x += w;
    });
    y += h;
  }
  return layout;
}

// ── 儀表板篩選 ────────────────────────────────────────────────────────

// 主資料表裡「少／中」級的分類，同時出現在越多張表的越優先；另外加 1 個值 ≤ 6 種的序列時間
// （年、球季這類，不含年月）。
function suggestFilters(dataset: Dataset, fields: Fields): DashboardFilter[] {
  const visible = dataset.tables.filter((t) => !t.hidden);
  const shared = (p: FieldProfile) =>
    visible.filter((t) => resolveField(t, toFieldRef(p.field)) !== undefined).length;
  const time = fewPeriodsOf(fields.ts);
  const categories = fields.cs
    .filter(
      (p) => p.kind.kind === 'category' && (p.kind.level === 'few' || p.kind.level === 'some'),
    )
    .map((p, index) => ({ p, index, shared: shared(p) }))
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .map((c) => c.p)
    .slice(0, MAX_FILTERS - (time ? 1 : 0));
  return [...categories, ...(time ? [time] : [])].map((p) => ({ field: toFieldRef(p.field) }));
}

// ── 產生 ─────────────────────────────────────────────────────────────

export type DashboardSuggestion = {
  widgets: Widget[];
  layout: LayoutItem[];
  filters: DashboardFilter[];
};

// 以 tableKey 為主資料表產生建議內容；找不到資料表或資料列時回傳空的建議。
export function suggestDashboard(
  dataset: Dataset,
  rows: DatasetRows,
  tableKey: string,
): DashboardSuggestion {
  const table = dataset.tables.find((t) => t.key === tableKey);
  const tableRows = rows[tableKey];
  if (!table || !tableRows || tableRows.length === 0) {
    return { widgets: [], layout: [], filters: [] };
  }
  const ctx: Context = { table, rows: tableRows, profiles: profilesOf(table, tableRows) };
  const items = compose(ctx);
  return {
    widgets: items.map((item) => item.widget),
    layout: arrange(items),
    filters: items.length > 0 ? suggestFilters(dataset, fieldsOf(ctx.profiles)) : [],
  };
}
