# 0005. 儀表板設定 JSON 格式 v1

- 狀態：已採納
- 日期：2026-10-05

## 背景

儀表板的設定（用了哪些圖、版面位置、綁定哪些欄位、資料集的欄位中繼資料）以 JSON 存在 localStorage（見 [0001](0001-frontend-only-storage.md)），匯出、匯入也用同樣的格式。這份格式一旦有使用者存了資料，修改就必須寫 migration，所以要先定清楚。

## 決策

### 存放位置

- localStorage key：`ai-dashboard-poc`，整份設定只存這一個 key。
- 由 Zustand `persist` 寫入，外層包成 `{ "version": 1, "state": { … } }`。
- 格式有破壞性修改時，把 `version` 加 1，並在 `migrate` 裡把舊格式轉成新格式。**不可以直接修改舊格式的欄位意義。**
- 資料列**不**放在這裡，而是存在 IndexedDB 的 `dataset-rows:<datasetId>`。

### 型別定義

以下的寫法符合專案的 `erasableSyntaxOnly` 規範：只用 union type，不用 `enum`。

```ts
type FieldRef = { header: string; code?: string };

type DataType = 'text' | 'integer' | 'number' | 'percent' | 'date';
type Role = 'dimension' | 'measure';
type Agg = 'sum' | 'avg' | 'count' | 'min' | 'max';

type Field = {
  header: string;
  code?: string; // 來自「欄位定義」
  dataType: DataType;
  unit?: string; // 來自「欄位定義」，例如 "NT$"
  numFmt?: string; // 來自 Excel 儲存格，例如 "#,##0"、"0.0%"
  role: Role;
  ratio?: boolean;
  userOverride?: Array<'role' | 'ratio'>; // 列出使用者手動改過的屬性
};

type DataTable = {
  key: string; // tbl_ 表格物件名稱；沒有表格物件時用工作表名稱
  sheetName: string;
  hidden: boolean;
  rowCount: number;
  fields: Field[];
};

type Dataset = {
  id: string;
  name: string;
  fileName: string;
  uploadedAt: string; // ISO 8601
  tables: DataTable[];
  skippedSheets?: Array<{ sheetName: string; reason: string }>;
};

type Measure = { field: FieldRef; agg: Agg };
type Filter = { field: FieldRef; op: 'in'; values: Array<string | number> };

type WidgetBase = { id: string; title: string; table: string; filters: Filter[] };

type Widget = WidgetBase &
  (
    | {
        type: 'line';
        encoding: { x: { field: FieldRef }; y: Measure[]; group?: { field: FieldRef } };
        options?: { area?: boolean; stacked?: boolean };
      }
    | {
        type: 'bar';
        encoding: { x: { field: FieldRef }; y: Measure[]; group?: { field: FieldRef } };
        options?: { stacked?: boolean; horizontal?: boolean };
      }
    | {
        type: 'combo';
        encoding: {
          x: { field: FieldRef };
          y: Array<Measure & { mark: 'bar' | 'line'; axis: 'left' | 'right' }>;
        };
        options?: { stacked?: boolean };
      } // 只套用在長條的部分
    | {
        type: 'pie';
        encoding: { category: { field: FieldRef }; value: Measure };
        options?: { donut?: boolean };
      }
    | {
        type: 'scatter';
        encoding: {
          x: Measure;
          y: Measure;
          color?: { field: FieldRef };
          detail?: { field: FieldRef };
        };
      }
    | {
        type: 'radar';
        encoding: { x: { field: FieldRef }; y: Measure[]; group?: { field: FieldRef } };
      }
    | { type: 'gauge'; encoding: { value: Measure }; options?: { min?: number; max?: number } }
    | { type: 'kpi'; encoding: { value: Measure; trend?: { field: FieldRef } } }
    | { type: 'table'; encoding: { columns: Array<{ field: FieldRef; agg?: Agg }> } }
  );

type LayoutItem = { i: string; x: number; y: number; w: number; h: number }; // react-grid-layout 格式

type Dashboard = {
  id: string;
  name: string;
  datasetId: string;
  updatedAt: string;
  layout: LayoutItem[]; // LayoutItem.i 對應 Widget.id
  widgets: Widget[];
};

type PersistedState = {
  datasets: Dataset[];
  dashboards: Dashboard[];
  activeDashboardId: string | null;
};
```

### 各圖表類型的槽位規則

| 類型           | 槽位                                        | 說明                                                                                       |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `line` / `bar` | `x` 維度、`y[]` 量值、`group` 維度          | `group` 讓每個值各畫一條線或一組長條                                                       |
| `combo`        | `x` 維度、`y[]` 量值                        | 每個量值各自設定 `mark`（長條或折線）和 `axis`（左軸或右軸）                               |
| `pie`          | `category` 維度、`value` 量值               | `donut` 選項就是甜甜圈圖                                                                   |
| `scatter`      | `x`、`y` 都是量值；`color`、`detail` 是維度 | 有 `detail` 時依它分組彙總（例如一家店一個點）；沒有時，每一列資料就是一個點               |
| `radar`        | 同 `line`                                   | 每個軸是 `x` 欄位的一個值，例如 12 個月                                                    |
| `gauge`        | `value` 量值                                | `min` / `max` 由使用者輸入。預設：比率欄位 0～1（顯示為 0～100%），其他是 0 到目前值 × 1.5 |
| `kpi`          | `value` 量值、`trend` 時間類維度            | 有 `trend` 時，在大數字下方畫迷你走勢圖                                                    |
| `table`        | `columns[]`                                 | 欄位不設 `agg` 時顯示明細列；設了就依沒有 `agg` 的欄位分組彙總                             |

所有類型都可以設定 `filters[]`。比率欄位的 ⚠ 提示規則見 [0004](0004-field-roles-and-aggregation.md)。

### 範例

範例活頁簿加上一張折線圖和一張 KPI 卡：

```json
{
  "version": 1,
  "state": {
    "datasets": [
      {
        "id": "ds_8f3a",
        "name": "2025 門市營運",
        "fileName": "連鎖門市年度營運績效表_2025_v2_標準化.xlsx",
        "uploadedAt": "2026-10-05T10:00:00+08:00",
        "tables": [
          {
            "key": "tbl_fact_monthly",
            "sheetName": "月營運明細",
            "hidden": false,
            "rowCount": 96,
            "fields": [
              { "header": "年月", "code": "period", "dataType": "text", "role": "dimension" },
              { "header": "月", "code": "month", "dataType": "integer", "role": "dimension" },
              { "header": "區域", "code": "region", "dataType": "text", "role": "dimension" },
              {
                "header": "營業額",
                "code": "revenue",
                "dataType": "number",
                "unit": "NT$",
                "numFmt": "#,##0",
                "role": "measure"
              },
              {
                "header": "平均客單價",
                "code": "avg_ticket",
                "dataType": "number",
                "unit": "NT$",
                "role": "measure",
                "ratio": true,
                "userOverride": ["ratio"]
              }
            ]
          }
        ]
      }
    ],
    "dashboards": [
      {
        "id": "db_1c9e",
        "name": "營收總覽",
        "datasetId": "ds_8f3a",
        "updatedAt": "2026-10-05T10:30:00+08:00",
        "layout": [
          { "i": "w_trend", "x": 0, "y": 0, "w": 8, "h": 4 },
          { "i": "w_total", "x": 8, "y": 0, "w": 4, "h": 2 }
        ],
        "widgets": [
          {
            "id": "w_trend",
            "type": "line",
            "title": "各區月營業額",
            "table": "tbl_fact_monthly",
            "encoding": {
              "x": { "field": { "header": "年月", "code": "period" } },
              "y": [{ "field": { "header": "營業額", "code": "revenue" }, "agg": "sum" }],
              "group": { "field": { "header": "區域", "code": "region" } }
            },
            "filters": []
          },
          {
            "id": "w_total",
            "type": "kpi",
            "title": "全年營業額",
            "table": "tbl_agg_month",
            "encoding": {
              "value": { "field": { "header": "營業額", "code": "revenue" }, "agg": "sum" },
              "trend": { "field": { "header": "年月", "code": "period" } }
            },
            "filters": []
          }
        ]
      }
    ],
    "activeDashboardId": "db_1c9e"
  }
}
```

### 匯出 / 匯入格式

匯出一次只匯出**一個儀表板**，不包含資料列：

```json
{
  "kind": "ai-dashboard-poc/dashboard",
  "version": 1,
  "dashboard": { "…": "Dashboard 物件，datasetId 會在匯入時重新指定" },
  "signature": {
    "tables": [
      {
        "key": "tbl_fact_monthly",
        "sheetName": "月營運明細",
        "fields": [
          { "header": "年月", "code": "period" },
          { "header": "營業額", "code": "revenue" }
        ]
      }
    ]
  }
}
```

匯入流程：讓使用者選一個現有資料集，或者上傳新的活頁簿 → 依 `signature` 和 [0003](0003-field-identity-and-rebinding.md) 的規則比對 → 列出對不上的欄位 → 建立儀表板（每次匯入都產生新的 `id`）。

### 範例儀表板

首頁的「載入範例資料」會載入 `public/samples/` 裡的活頁簿，同時建立一個範例儀表板。這個範例儀表板以本格式寫成 fixture，內容如下：

- **KPI 卡**：全年營業額，加上月份走勢（`tbl_agg_month`）
- **組合圖**：月營業額用長條、對應左軸，營業利益率用折線、對應右軸（`tbl_agg_month`）。每月只有一列，所以利益率是精確值
- **堆疊長條圖**：各區月營業額（`tbl_fact_monthly`）
- **圓餅圖**：人氣餐點的份數佔比（`tbl_agg_item`）

fixture 必須通過與一般設定相同的型別檢查，順便當作格式的實際驗證案例。

## 影響

- `layout` 和 `widgets` 分開存放：`layout` 可以直接交給 react-grid-layout，但新增或刪除 widget 時，兩邊都要一起更新。
- 改變任何欄位的意義都需要調高 `version` 並撰寫 `migrate`。實作時要把「讀到比目前更新的 `version`」也列為錯誤情況處理。
