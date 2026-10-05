# 0001. 純前端架構與儲存分層

- 狀態：已採納
- 日期：2026-10-05

## 背景

這個專案是純展示用的 POC：不限使用者、沒有期限，也沒有後端。Repo 目前只有 Vite + React 前端。

使用者的「個人化」設定（用了哪些圖、版面位置、綁定哪些欄位）必須在重新整理後保留下來。成功的展示流程是：上傳範例檔 → 拖出幾張圖 → 重新整理 → 儀表板還在，**圖表也有資料**。

## 決策

1. **不建後端、不做登入。** Excel 在瀏覽器內解析（見 [0002](0002-excel-parsing-exceljs.md)）。
2. **設定存 localStorage，資料存 IndexedDB，兩邊分開放。**
   - **設定**：整份設定是一個 JSON，存在 localStorage 的單一 key `ai-dashboard-poc`，用 Zustand 的 `persist` middleware 讀寫。最外層的 `version` 由 persist 管理，格式改版時用 `migrate` 把舊格式轉成新格式。格式內容見 [0005](0005-dashboard-config-schema-v1.md)。
   - **資料列**：用 `idb-keyval` 存進 IndexedDB，key 是 `dataset-rows:<datasetId>`，value 是 `Record<tableKey, Row[]>`。
3. **可以建立多個儀表板**，有清單可以切換、複製、刪除。
4. **提供匯出 / 匯入 JSON**，只包含設定和欄位簽章，不包含資料（見 [0005](0005-dashboard-config-schema-v1.md)）。
5. **不引入 router。** 三個畫面（資料集庫、儀表板清單、儀表板）用 state 切換。
6. **只支援桌機瀏覽器**（滑鼠操作），不支援觸控。

## 影響

- 設定和資料都綁在單一瀏覽器上。清除網站資料、換電腦或用無痕視窗，設定都會消失。**匯出 JSON 是唯一的備份方式**，UI 上要讓使用者容易找到。
- localStorage 每個網域大約只有 5MB，只放設定。資料列一律放 IndexedDB，否則真實資料（例如日粒度、門市多）很容易超過上限。
- 存取 localStorage / IndexedDB 時可能拋錯，例如容量滿了或瀏覽器封鎖儲存。程式要能處理這些錯誤並提示使用者，不能直接讓畫面壞掉。
- 之後要接後端時，只需要替換 Zustand persist 的 `storage`，以及資料集的讀寫模組，UI 不用改。所以這兩個模組必須維持很薄、和 UI 隔開。

## 考慮過的其他方案

- **只存設定，每次開啟都重新上傳 Excel**：重新整理後只剩空殼，達不到展示的成功標準。
- **設定和資料都放 localStorage**：容量上限太低，換成真實資料就會爆掉。
- **後端加帳號**：可以跨裝置同步、分享，但對 POC 來說成本太高，會拖慢進度。
