# ai-dashboard-poc

個人化儀表板產生器（POC）。上傳一份制式化的 Excel 活頁簿，把欄位拖進圖表的槽位，或讓系統依欄位推薦圖表，在格線上自由排出自己的儀表板。

沒有自建的後端：瀏覽器直接連 [Supabase](https://supabase.com/)（Auth、Postgres、Storage）。資料集、資料列、原始檔和儀表板設定都存在 Supabase，每位使用者只看得到自己的資料。

## 功能

- **登入**：用 email 登入連結（magic link），沒有密碼。
- **資料集**
  - 上傳 `.xlsx`，以 Excel 表格物件（沒有的話以工作表）為單位解析成資料表。不符合規範的資料表會跳過並列出原因。
  - 自動推斷欄位的角色（維度／量值）和比率，可以在資料集頁手動覆寫。
  - 依 `分子/分母` 的公式自動認出加權比率。
  - 「欄位健檢」列出角色或比率標記可能不對的欄位，可以逐條套用或忽略。
  - 「資料標準化」把系統直接匯出的原始檔（目前支援 CRM 匯出檔）轉成符合規範的活頁簿：補齊缺值、轉換型別、拆出維度表與彙總表，並列出資料品質問題；轉換後可以下載或直接匯入。
- **儀表板**
  - 10 種元件：折線、長條、組合、圓餅、散佈、雷達、儀表圖、KPI 卡、資料表格、文字。
  - 元件可以在 12 欄格線上拖動、縮放；畫面窄的時候自動重排成 2 欄或 1 欄。
  - 編輯時把欄位拖進槽位，或勾選幾個欄位看推薦的圖表；設定不適合時會即時提醒。
  - 建立儀表板時可以依資料一鍵產生建議內容：KPI、趨勢、占比、排行、明細表等。
  - 有儀表板篩選、元件篩選、門檻上色、排序、前 N 名、表格合計。
  - 修改先存在記憶體，按「儲存」才寫入；離開前會提醒未儲存的變更。
- **切換資料來源**：把儀表板改接到另一個資料集（例如下個月的報表），依欄位重新對應。
- **匯出／匯入**：匯出成 JSON 檔，在別的帳號匯入時會檢查欄位是否齊全。
- **範例資料**：首頁的「載入範例資料」會匯入 `public/samples/` 的範例活頁簿和範例儀表板。

## 技術架構

| 類別       | 套件                                                  |
| ---------- | ----------------------------------------------------- |
| 框架       | Vite 8、React 19（開啟 React Compiler）、TypeScript 6 |
| UI         | MUI 9、MUI X Charts、MUI X Data Grid                  |
| 版面與拖放 | react-grid-layout（格線）、react-dnd（欄位拖放）      |
| 狀態       | Zustand（全部不持久化，資料以 Supabase 為準）         |
| Excel 解析 | ExcelJS（動態載入）                                   |
| 後端服務   | Supabase：Auth、Postgres（RLS）、Storage              |
| 測試       | Vitest（只測純邏輯）                                  |

## 開始使用

### 1. 環境

需要 `.nvmrc` 指定的 Node 版本（目前是 24）：

```bash
nvm use
npm install
```

### 2. 準備 Supabase

1. 在 Supabase 建立一個 project。
2. 把 `.env.example` 複製成 `.env.local`，填入 project 的網址和 publishable key（後台的 **Project Settings → API Keys**）：

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   少了這兩個值，app 一啟動就會顯示錯誤頁。

3. 連結 project 並套用資料庫 schema。Supabase CLI 已經是 devDependency，不需要另外安裝，也不需要在本機跑 Docker：

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npm run db:push    # 套用 supabase/migrations/：資料表、RLS policy、source-files bucket
   ```

4. 在後台的 **Authentication → URL Configuration** 把開發網址（`http://localhost:5173`）加進 redirect 允許清單，否則登入連結會導回錯的網址。部署後也要把正式網址加進去。

### 3. 啟動

```bash
npm run dev
```

開啟 `http://localhost:5173`，輸入 email 收登入連結，登入後按「載入範例資料」就能直接試用。

### 常用指令

```bash
npm run dev      # 開發伺服器（HMR）
npm run build    # tsc -b 型別檢查後 vite build
npm run lint     # eslint
npm test         # vitest：tests/ 裡的純邏輯測試
npm run preview  # 預覽 dist/ 的正式版
npm run standardize -- <原始檔.xlsx>  # 把系統匯出檔轉成標準化活頁簿（Node 24，見 scripts/standardize/）
npm run db:push  # 把 supabase/migrations/ 套用到連結的 project
npm run db:types # 依連結的 project 重新產生 src/types/database.ts
```

改完程式後，`build`、`lint`、`test` 都要通過。`tsc -b` 會抓到 ESLint 抓不到的型別錯誤。

## Excel 格式

上傳的活頁簿要符合結構規範，範例檔的「使用說明」工作表有完整說明：

- 每個工作表的第 1 列是標頭，第 2 列起是資料。
- 不能有合併儲存格，也不能有小計列。標頭不能空白或重複。
- 建議把資料範圍設成 Excel 表格物件（插入 → 表格），系統以表格名稱識別資料表，沒有表格物件時改用工作表名稱。
- 表格名稱的前綴代表資料表種類：`tbl_fact_` 明細、`tbl_agg_` 彙總、`tbl_dim_` 主檔，例如 `tbl_fact_monthly`。名稱含「參數」或 `params` 的是參數表；沒有前綴時由資料推測。
- 可以另外放一張「欄位定義」工作表，提供欄位的英文代碼、型別和單位。沒有的話系統會從資料推斷。

欄位以**中文標頭**識別，換新一期的檔案時標頭不變，儀表板就能直接沿用。

系統直接匯出的原始檔（例如 CRM 匯出檔）通常不符合規範，可以先在資料集頁按「資料標準化」轉換，再下載或直接匯入，說明見 [`scripts/standardize/`](scripts/standardize/README.md)。

## 專案結構

```
src/
  types/        持久化的設定格式（資料集、儀表板 JSON 的唯一來源）
  utils/        純邏輯，不依賴 React：欄位推斷、彙總引擎、圖表推薦、版面計算、標準化引擎…
  services/     I/O：Supabase、登入、Excel 解析、資料集與儀表板的讀寫
  store/        Zustand：appStore（資料集與儀表板）、rowsStore、authStore、uiStore
  components/   widgets/（各元件）、editor/（編輯模式）、dashboard/、dashboards/、datasets/
  pages/        每個畫面一個元件（沒有 router，用 uiStore 切換）
  constants/    範例儀表板、各元件的槽位定義
supabase/migrations/  資料庫 schema 與 RLS
public/samples/       範例活頁簿
scripts/standardize/  npm run standardize 的進入點與說明（引擎與各來源的設定在 src/utils/standardize/）
tests/                Vitest 測試；fixtures/ 是模擬資料的活頁簿
docs/adr/             架構決策紀錄
```

## 文件

- [`CONTEXT.md`](CONTEXT.md)：名詞表（資料集、資料表、欄位、槽位、比率欄位…）。程式碼、文件、issue 都用這裡的名詞。
- [`docs/adr/`](docs/adr/)：架構決策紀錄。
  - [0001](docs/adr/0001-frontend-only-storage.md) 純前端儲存（已由 0007 取代）
  - [0002](docs/adr/0002-excel-parsing-exceljs.md) Excel 解析採用 ExcelJS
  - [0003](docs/adr/0003-field-identity-and-rebinding.md) 欄位識別與切換資料來源
  - [0004](docs/adr/0004-field-roles-and-aggregation.md) 欄位角色與彙總規則
  - [0005](docs/adr/0005-dashboard-config-schema-v1.md) 儀表板設定 JSON 格式
  - [0006](docs/adr/0006-ui-and-interaction-libraries.md) UI 與互動套件
  - [0007](docs/adr/0007-supabase-storage.md) 改用 Supabase 儲存
  - [0008](docs/adr/0008-dashboard-filters-weighted-ratios.md) 儀表板篩選、加權比率（schema v2）
  - [0009](docs/adr/0009-responsive-layout.md) 響應式版面
  - [0010](docs/adr/0010-chart-recommendation-rules.md) 欄位組合與圖表推薦規則
- [`CLAUDE.md`](CLAUDE.md)：開發規範與工具鏈限制。

## 開發注意事項

細節見 `CLAUDE.md`，以下幾條最容易踩到：

- **React Compiler 已開啟**：不要手寫 `useMemo`、`useCallback`、`React.memo`。違反 React 規則的元件會被編譯器略過，而且不會報錯。
- **ExcelJS 只能動態載入**：一律用 `import('exceljs')`，它壓縮後約 930 KB。ExcelJS 和 react-dnd 都已停止維護，不用找新版升級。
- **改動持久化的格式**：要提高 `SCHEMA_VERSION`，並在 `utils/schema.ts` 加轉換步驟。動手前先讀 ADR 0005。
- **顏色一律用 theme token**（`src/theme.ts`，科林品牌配色）：主色黃當文字要用 `text.accent`；圖表的系列顏色由 theme 統一套用。
- **TypeScript 設定**：`verbatimModuleSyntax`、`erasableSyntaxOnly`、`noUnusedLocals` 都開著。型別要用 `import type`，不能用 `enum`；沒用到的變數會讓 build 失敗。
