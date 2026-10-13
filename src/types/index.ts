// 持久化設定的型別：Supabase 的 datasets.body／dashboards.body 與匯出的 JSON 都是這個形狀
// （詳見 docs/adr/0005、0007）。
// 這裡是格式的「正本」。修改任何欄位的意義，都必須調高 SCHEMA_VERSION，
// 並在 utils/schema.ts 的 migrateRecord 補上舊格式的轉換。

export const SCHEMA_VERSION = 2;

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
  ratioOf?: RatioOf;
  userOverride?: Array<'role' | 'ratio' | 'ratioOf'>;
};

// 加權比率的分子與分母（同一張資料表的欄位標頭）。有設定時，分組彙總改算
// 「分子加總 ÷ 分母加總」，不再是非加權平均（ADR 0008）。
// 來源：Excel 公式是 分子/分母 或 IF(分母=0,…,分子/分母) 時自動帶入，也可以手動指定。
export type RatioOf = { numerator: string; denominator: string };

// 一張可以畫圖的資料表。key 是 tbl_ 表格名稱，活頁簿沒有表格物件時改用工作表名稱。
export type DataTable = {
  key: string;
  sheetName: string;
  hidden: boolean;
  rowCount: number;
  fields: Field[];
};

export type SkippedSheet = { sheetName: string; reason: string };

// 一次上傳的結果。這裡只有中繼資料（存在 Supabase 的 datasets.body），資料列存在 dataset_rows 表。
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

// 依門檻上色：值 < warning 為紅、warning ≤ 值 < success 為黃、值 ≥ success 為綠（ADR 0008）。
// 比率欄位的門檻也以小數儲存（80% → 0.8）。
export type Thresholds = { warning: number; success: number };
export type SortOrder = 'asc' | 'desc';

// 所有 widget 共用的欄位。table 為空字串代表還沒拖入任何欄位（由第一個欄位決定）。
// description 是標題下方的說明文字（例如指標的計算口徑）。
type WidgetBase = {
  id: string;
  title: string;
  description?: string;
  table: string;
  filters: Filter[];
};

export type LineWidget = WidgetBase & {
  type: 'line';
  encoding: { x?: DimensionSlot; y: Measure[]; group?: DimensionSlot };
  options?: { area?: boolean; stacked?: boolean };
};
export type BarWidget = WidgetBase & {
  type: 'bar';
  encoding: { x?: DimensionSlot; y: Measure[]; group?: DimensionSlot };
  // sort／limit：依第一個數值排序分類並只留前 N 個；thresholds：依值為長條上色。
  options?: {
    stacked?: boolean;
    horizontal?: boolean;
    sort?: SortOrder;
    limit?: number;
    thresholds?: Thresholds;
  };
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
  options?: { thresholds?: Thresholds };
};
// thresholds 套用在比率欄位的欄；highlightRows 把有欄位低於 warning 的整列標色；
// sort 依第一個數值欄排序；totals 在表格下方顯示合計。
export type TableWidget = WidgetBase & {
  type: 'table';
  encoding: { columns: TableColumn[] };
  options?: {
    thresholds?: Thresholds;
    highlightRows?: boolean;
    sort?: SortOrder;
    totals?: boolean;
  };
};
// 文字元件：區塊標題、計算口徑、指標定義等說明，不綁資料表（table 一律是空字串）。
export type TextWidget = WidgetBase & {
  type: 'text';
  encoding: Record<string, never>;
  content: string;
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
  | TableWidget
  | TextWidget;

export type WidgetType = Widget['type'];

// react-grid-layout 的原生格式，i 對應 Widget.id；單位是格線欄數與列數。
export type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

// 儀表板篩選的一個欄位，以欄位參照比對每張資料表（ADR 0003），所以可以同時篩選多張表。
export type DashboardFilter = { field: FieldRef };

// 一個儀表板 = 一組 widget + 它們在格線上的位置，只指向一個資料集。
export type Dashboard = {
  id: string;
  name: string;
  datasetId: string;
  updatedAt: string;
  layout: LayoutItem[];
  widgets: Widget[];
  // 儀表板篩選：只記錄用哪些欄位；選取的值只在當次瀏覽有效，存在 uiStore（ADR 0008）。
  filters?: DashboardFilter[];
};

// 資料列存在 Supabase 的 dataset_rows 表（services/datasetRows.ts），不放進上面的設定。
// 一列是「中文標頭 → 值」的物件；日期已轉成 YYYY-MM-DD 字串。
export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;
export type DatasetRows = Record<string, Row[]>;
