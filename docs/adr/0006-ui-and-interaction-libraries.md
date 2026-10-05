# 0006. UI 與互動套件選型

- 狀態：已採納
- 日期：2026-10-05

## 背景

專案環境是 React 19、Vite 8，並且開啟了 React Compiler（見 `CLAUDE.md`）。需要選定的套件有：元件庫、圖表、資料表格、可拖動與縮放的格線版面、欄位拖放、狀態管理和 IndexedDB 存取。

## 決策

2026-10-05 已全部安裝。下表是安裝時的版本，型別定義都已內建，不需要另外安裝 `@types/*`。

| 用途                | 套件                                                  | 備註                                                  |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| 元件庫              | `@mui/material` 9.4 + Emotion                         |                                                       |
| 圖表                | `@mui/x-charts` 9.14（**只用 MIT 免費版**）           |                                                       |
| 資料表格            | `@mui/x-data-grid` 9.14（MIT 免費版）                 | peer 依賴支援 MUI 9 和 React 19                       |
| 格線版面            | `react-grid-layout` 2.2.4                             | 版面格式 `{i,x,y,w,h}` 直接存進設定 JSON              |
| 欄位拖放            | `react-dnd` 16.0.1 + `react-dnd-html5-backend` 16.0.1 | 只用 hooks API（`useDrag` / `useDrop`）               |
| 狀態與 localStorage | `zustand` 5.0（含 `persist`）                         | 見 [0001](0001-frontend-only-storage.md)              |
| IndexedDB           | `idb-keyval` 6.3                                      |                                                       |
| 日期                | `dayjs` 1.11（含 `utc` plugin）                       | 見 [0002](0002-excel-parsing-exceljs.md)              |
| Excel 解析          | `exceljs` 4.4.0                                       | 取代 `xlsx`，見 [0002](0002-excel-parsing-exceljs.md) |

### 圖表類型對應的 MUI X 元件

| `type`    | 元件                                                           | 選項的實作方式                                                      |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `line`    | `LineChart`                                                    | `area` → series 的 `area: true`；`stacked` → series 的 `stack`      |
| `bar`     | `BarChart`                                                     | `stacked` → series 的 `stack`；`horizontal` → `layout="horizontal"` |
| `combo`   | `ChartsContainer` 內組合 `BarPlot` + `LinePlot`，搭配兩條 Y 軸 | 每個量值依 `mark` 和 `axis` 決定畫法與對應的軸                      |
| `pie`     | `PieChart`                                                     | `donut` → 設定 `innerRadius`                                        |
| `scatter` | `ScatterChart`                                                 | —                                                                   |
| `radar`   | `RadarChart`                                                   | —                                                                   |
| `gauge`   | `Gauge`                                                        | `min` / `max` 對應 `valueMin` / `valueMax`                          |
| `kpi`     | MUI `Card` + `SparkLineChart`                                  | 迷你走勢圖只在有 `trend` 時顯示                                     |
| `table`   | `DataGrid`（`@mui/x-data-grid`）                               | —                                                                   |

### 主題

- MUI theme 開啟 CSS 變數模式（`cssVariables`），並設定 light / dark 兩組 `colorSchemes`，跟隨系統設定。
- `CLAUDE.md` 目前規定顏色要寫成 `src/index.css` 裡的 CSS 變數。改用 MUI theme 之後，元件的顏色改由 theme 管理，`index.css` 只保留全域基礎樣式。**實作時要同步修改 `CLAUDE.md` 的這條規範。**

## 影響與風險

- ⚠️ **`react-dnd` 已停止維護**：最後一個版本 16.0.1 發布於 2022-04。peer 依賴寫的是 `react >= 16.14`，裝在 React 19 上不會報錯，但沒有官方保證。
- **`react-grid-layout` 和 `react-dnd` 搭配 React Compiler、StrictMode 已在 dev 模式驗證（2026-10-05）**：用無頭 Chrome 實際操作，欄位拖入槽位、拒絕不相容的拖放、拖動標題移動 widget 並寫回 `layout`，都正常，主控台沒有錯誤。production build（`npm run preview`）下還沒有操作驗證。
- `react-grid-layout` 拖動 widget 用的是它自己的拖動機制，`react-dnd` 只負責「欄位 → 槽位」的拖放。兩者處理的拖動範圍要分開，避免事件互相干擾。
- 程式碼開始 import MUI 之後，`vite build` 會出現大量 `[MODULE_LEVEL_DIRECTIVE]` 警告，來源是 MUI 檔案開頭的 `'use client'`。這只是雜訊，不影響執行，之後可以在 `vite.config.ts` 用 `onwarn` 過濾掉。
- MUI X Charts 的圖表會自動填滿父容器的大小，所以放在可縮放的格線格子裡時，格子本身必須有明確的高度。
- 只用 MIT 免費版，所以不會有熱力圖、漏斗圖、桑基圖、縮放平移、匯出圖片（屬於 Pro）；也不會有 K 線圖、放射狀圖、地圖（屬於 Premium）。

## 考慮過的其他方案

- **元件庫用 Ant Design 或 shadcn/ui**：最後選了 MUI，因為 MUI X Charts 和 Data Grid 都屬於同一個生態系。
- **加裝 MUI X Charts Pro / Premium**：沒有授權金鑰會顯示浮水印，展示時觀感很差；購買授權又超出 POC 的預算。
- **欄位拖放用 @dnd-kit 或瀏覽器原生拖放 API**：最後選了 react-dnd。
- **格線版面用 gridstack.js 或自己實作**：gridstack 不是 React 原生套件，需要額外包一層；自己實作成本太高。
- **狀態管理用 `useReducer` + Context 或 Redux Toolkit**：Zustand 的 `persist` 直接解決「JSON 存 localStorage + 版本轉換」這兩個需求，套件也最輕。
