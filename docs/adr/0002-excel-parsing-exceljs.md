# 0002. Excel 解析採用 ExcelJS

- 狀態：已採納
- 日期：2026-10-05

## 背景

這個系統的核心功能就是解析使用者上傳的檔案，所以解析套件的安全性和正確性都很重要。2026-10-05 用範例檔 `public/samples/連鎖門市年度營運績效表_2025_v2_標準化.xlsx` 實測了兩個套件。

**`xlsx@0.18.5`（npm 上的 SheetJS，當時已經裝在專案裡）**

- 🔴 `npm audit` 回報兩個 high 等級漏洞，而且在 npm 上沒有修補版：原型污染 [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)、ReDoS [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)。SheetJS 從 0.18.5 之後就不再發布到 npm，修補版只放在官方 CDN。
- ❌ 讀不到 `tbl_` 表格物件。
- ⚠️ 設定 `cellDates` 時，日期會被當成本地時間的午夜。例如 `2025-01-01` 讀出來是 `2024-12-31T16:00Z`。

**`exceljs@4.4.0`**

- ✅ 讀得到表格物件：`worksheet.getTables()` 會回傳 `tbl_fact_monthly` 等名稱。
- ✅ 公式儲存格同時拿得到公式和計算結果。例如 `{ formula: "IF(G2=0,0,N2/G2)", result: 0.2454 }`。
- ✅ 讀得到數字格式（`numFmt`），例如 `0.0%`、`#,##0`。
- ✅ 日期以 UTC 表示：`2025-01-01` 讀出來是 `2025-01-01T00:00Z`。

## 決策

1. **改用 ExcelJS，從 `package.json` 移除 `xlsx`。**
2. **用動態 `import('exceljs')` 載入**，只在使用者上傳檔案時才下載，不影響首頁載入速度。
3. **公式儲存格一律取 `result`**，同時保留公式文字，供日後計算加權比率使用（見 [0004](0004-field-roles-and-aggregation.md)）。
4. **日期一律用 UTC 格式化**（dayjs 的 `utc` plugin）。如果用本地時區顯示，在負時區的電腦上會差一天。
5. **以資料表為單位驗證上傳的活頁簿**，有問題的資料表跳過，其他照常匯入：
   - 檢查項目：第 1 列的標頭不可空白、不可重複；不可有合併儲存格；至少要有一列資料。
   - 上傳完成時，列出被跳過的資料表和原因。
   - 不自動幫空白標頭命名（例如「欄位 3」），因為這種名字在換新檔時會讓欄位對不上（見 [0003](0003-field-identity-and-rebinding.md)）。
6. **自動隱藏的資料表**：`使用說明`；`欄位定義`，用它的標頭組合（工作表 / 欄位代碼 / 中文欄名 / 資料型別…）辨識，不看工作表名稱；沒有資料列的工作表，例如 `圖表預覽`。使用者可以手動取消隱藏。
7. **讀到 `欄位定義` 時**，把每個欄位的 `code`、`dataType`、`unit` 補進對應欄位。對應依據是「工作表名稱 + 中文欄名」。

## 影響與風險

- ⚠️ **ExcelJS 已停止維護**：最後一個正式版 4.4.0 發布於 2023-10，之後只有一個 2024-12 的 prerelease。遇到 bug 只能自己繞過或 fork。
- ⚠️ **體積大**：壓縮後的 bundle 約 928KB。所以必須用動態 import（決策 2）。
- ⚠️ `npm audit` 回報 2 個 moderate：來自它依賴的 `uuid`（[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)），只在呼叫時傳入 buffer 參數才會觸發，ExcelJS 讀檔的路徑不會走到。`npm audit fix --force` 會把 ExcelJS 降到 3.4.0，**不要執行**。安裝時也會出現 `glob`、`fstream`、`uuid` 的 deprecated 警告，同樣來自 ExcelJS 的依賴。
- **打包已驗證（2026-10-05）**：ExcelJS 的 `browser` 欄位指向預先打包好的 `dist/exceljs.min.js`。用動態 import 時，Vite 8 會把它切成獨立的 chunk（約 929KB，gzip 後 256KB），沒有 Node 內建模組相關的錯誤。**還沒驗證的是在瀏覽器裡實際讀檔**，實作上傳功能時要用範例檔確認。
- 解析在主執行緒上進行。範例檔很小，沒有問題；如果之後要處理大檔案，再考慮移到 Web Worker。

## 考慮過的其他方案

- **維持 `xlsx@0.18.5`**：漏洞在 npm 上沒有修補版，而上傳檔案正好是它的攻擊面。
- **改裝 SheetJS 官方 CDN 版**（0.20.2 以上已修補漏洞）：API 和現有程式相同，但 `package.json` 會出現一個 tarball 網址，而且新版能不能讀表格物件沒有驗證。最後沒有採用。
