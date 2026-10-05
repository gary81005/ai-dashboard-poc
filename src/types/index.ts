// 持久化設定的型別：存進 localStorage 的 JSON 就長這樣（詳見 docs/adr/0005）。
// 這裡是格式的「正本」。修改任何欄位的意義，都必須調高 SCHEMA_VERSION，
// 並在 store/appStore.ts 的 migrate 補上舊格式的轉換。

export const SCHEMA_VERSION = 1;

// ── 資料集端：上傳的 Excel 解析後的中繼資料 ─────────────────────────────

// 指向某個欄位的方式：以中文標頭為主鍵，有欄位代碼時一併記下，供標頭改名時比對（ADR 0003）。
export type FieldRef = { header: string; code?: string };

export type DataType = 'text' | 'integer' | 'number' | 'percent' | 'date';
export type Role = 'dimension' | 'measure';
export type Agg = 'sum' | 'avg' | 'count' | 'min' | 'max';

// 欄位的中繼資料。role 決定能放進哪種槽位；ratio 決定彙總時是否提示非加權平均（ADR 0004）。
export type Field = {
  header: string;
  code?: string;
  dataType: DataType;
  unit?: string;
  numFmt?: string;
  role: Role;
  ratio?: boolean;
  userOverride?: Array<'role' | 'ratio'>;
};

// 一張可以畫圖的資料表。key 是 tbl_ 表格名稱，活頁簿沒有表格物件時改用工作表名稱。
export type DataTable = {
  key: string;
  sheetName: string;
  hidden: boolean;
  rowCount: number;
  fields: Field[];
};

export type SkippedSheet = { sheetName: string; reason: string };

// 一次上傳的結果。這裡只有中繼資料，資料列存在 IndexedDB（依 id 對應）。
export type Dataset = {
  id: string;
  name: string;
  fileName: string;
  uploadedAt: string;
  tables: DataTable[];
  skippedSheets?: SkippedSheet[];
};

// ── 儀表板端：widget 與槽位（encoding）設定 ──────────────────────────────

// 量值槽位裡的一個欄位，加上彙總方式；維度槽位只有 field。
export type Measure = { field: FieldRef; agg: Agg };
export type DimensionSlot = { field: FieldRef };
export type Filter = { field: FieldRef; op: 'in'; values: Array<string | number> };

export type ComboMeasure = Measure & { mark: 'bar' | 'line'; axis: 'left' | 'right' };
export type TableColumn = { field: FieldRef; agg?: Agg };

// 所有 widget 共用的欄位。table 為空字串代表還沒拖入任何欄位（由第一個欄位決定）。
type WidgetBase = { id: string; title: string; table: string; filters: Filter[] };

export type LineWidget = WidgetBase & {
  type: 'line';
  encoding: { x?: DimensionSlot; y: Measure[]; group?: DimensionSlot };
  options?: { area?: boolean; stacked?: boolean };
};
export type BarWidget = WidgetBase & {
  type: 'bar';
  encoding: { x?: DimensionSlot; y: Measure[]; group?: DimensionSlot };
  options?: { stacked?: boolean; horizontal?: boolean };
};
export type ComboWidget = WidgetBase & {
  type: 'combo';
  encoding: { x?: DimensionSlot; y: ComboMeasure[] };
  options?: { stacked?: boolean };
};
export type PieWidget = WidgetBase & {
  type: 'pie';
  encoding: { category?: DimensionSlot; value?: Measure };
  options?: { donut?: boolean };
};
export type ScatterWidget = WidgetBase & {
  type: 'scatter';
  encoding: { x?: Measure; y?: Measure; color?: DimensionSlot; detail?: DimensionSlot };
};
export type RadarWidget = WidgetBase & {
  type: 'radar';
  encoding: { x?: DimensionSlot; y: Measure[]; group?: DimensionSlot };
};
export type GaugeWidget = WidgetBase & {
  type: 'gauge';
  encoding: { value?: Measure };
  options?: { min?: number; max?: number };
};
export type KpiWidget = WidgetBase & {
  type: 'kpi';
  encoding: { value?: Measure; trend?: DimensionSlot };
};
export type TableWidget = WidgetBase & {
  type: 'table';
  encoding: { columns: TableColumn[] };
};

// 以 type 區分的聯集型別。單一欄位的槽位都是選填，因為編輯中的 widget 可以是空的。
export type Widget =
  | LineWidget
  | BarWidget
  | ComboWidget
  | PieWidget
  | ScatterWidget
  | RadarWidget
  | GaugeWidget
  | KpiWidget
  | TableWidget;

export type WidgetType = Widget['type'];

// react-grid-layout 的原生格式，i 對應 Widget.id；單位是格線欄數與列數。
export type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

// 一個儀表板 = 一組 widget + 它們在格線上的位置，只指向一個資料集。
export type Dashboard = {
  id: string;
  name: string;
  datasetId: string;
  updatedAt: string;
  layout: LayoutItem[];
  widgets: Widget[];
};

export type PersistedState = {
  datasets: Dataset[];
  dashboards: Dashboard[];
  activeDashboardId: string | null;
};

// 資料列存在 IndexedDB（services/datasetRows.ts），不放進上面的持久化設定。
// 一列是「中文標頭 → 值」的物件；日期已轉成 YYYY-MM-DD 字串。
export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;
export type DatasetRows = Record<string, Row[]>;
