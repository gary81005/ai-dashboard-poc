# 0007. 改用 Supabase 儲存資料與設定

- 狀態：已採納（取代 [0001](0001-frontend-only-storage.md)），分階段實作：已完成基礎建設、登入、資料集（資料集、資料列、原始檔已改存 Supabase，IndexedDB 已移除）；儀表板仍存在 localStorage，於下一階段切換
- 日期：2026-10-13

## 背景

[0001](0001-frontend-only-storage.md) 把設定放 localStorage、資料列放 IndexedDB，全部綁在單一瀏覽器上：清除網站資料、換電腦或開無痕視窗，儀表板就不見了，匯出 JSON 是唯一的備份。

專案的定位仍是 demo，同時拿來學習 Supabase。我們希望資料真正存進資料庫，而不是只暫存在瀏覽器。資料的來源不變，一樣是上傳標準化的 Excel 活頁簿。

## 決策

### 登入與資料歸屬

1. **用 Supabase Auth 的 email magic link 登入。** 未登入時整個 app 只顯示登入畫面。登入狀態由 `onAuthStateChange` 同步進 `authStore`，`App` 依狀態切換畫面，仍然不引入 router。
2. **每一列資料都屬於一位使用者。** 三張表都有 `user_id uuid default auth.uid()`，RLS policy 一律是 `user_id = auth.uid()`，而且只開放給 `authenticated`，`anon` 什麼都不能存取。
3. **主鍵是 `(user_id, id)`。** 前端產生的 id 只有 8 碼（`utils/ids.ts`），匯入 JSON 時也會沿用原本的 id，只用 `id` 當主鍵的話，兩個帳號可能撞號。

### 資料表

Schema 的正本是 `supabase/migrations/`，前端型別由 `npm run db:types` 產生到 `src/types/database.ts`。

| 表             | 一筆是                   | 主要欄位                                                      |
| -------------- | ------------------------ | ------------------------------------------------------------- |
| `datasets`     | 一個資料集（不含資料列） | `status`、`schema_version`、`body jsonb`（`Dataset`）         |
| `dataset_rows` | Excel 裡的一列           | `dataset_id`、`table_key`、`row_index`、`data jsonb`（`Row`） |
| `dashboards`   | 一個儀表板               | `schema_version`、`body jsonb`（`Dashboard`）                 |

- **設定用半正規化。** `body` 沿用 `src/types/` 的 v1 形狀（[0005](0005-dashboard-config-schema-v1.md)），不再把 widget、欄位拆成獨立的表。一個儀表板一筆，所以兩個分頁同時編輯時，互蓋的範圍只有單一儀表板。
- **一個 Excel 列存成一筆。** 彙總暫時仍在前端的 `utils/query.ts` 進行；之後如果要改成在資料庫端查詢，資料已經是可以查的形狀了。
- **`dataset_rows` 冗餘存一份 `user_id`。** 這樣 RLS 不必用子查詢去查 `datasets`。組合外鍵 `(user_id, dataset_id) → datasets (user_id, id)` 保證這份 `user_id` 和所屬資料集一致，並且 `on delete cascade`。
- **`dashboards` 不對 `datasetId` 加外鍵。** 刪除資料集時儀表板要保留，維持「資料集遺失」和重新綁定的行為（[0003](0003-field-identity-and-rebinding.md)）。
- **`schema_version` 跟著每一筆記錄。** 取代原本 Zustand persist 外層的 `version`：讀到舊版的記錄時，執行同一套 migrate（改成純函式放在 `utils/`）。

### 上傳流程

1. Excel 仍然在瀏覽器裡用 ExcelJS 解析（[0002](0002-excel-parsing-exceljs.md) 不變）。
2. 先寫入 `datasets`，`status = 'uploading'`。
3. 資料列分批 insert（大約 1000 列一批），UI 顯示進度。
4. 原始 `.xlsx` 存到 Storage 的 `source-files` bucket（private），路徑是 `<user_id>/<dataset_id>.xlsx`，policy 檢查第一層資料夾是否等於自己的 uid。
5. 全部完成後改成 `status = 'ready'`。任何一步失敗就刪掉這個資料集，已寫入的資料列由 cascade 清掉。清單只顯示 `ready` 的資料集。

讀取資料列時必須用 `.range()` 分頁撈完：PostgREST 預設一次最多回傳 1000 列，沒分頁的話圖表會在不知不覺中少掉資料。

### 前端狀態

- **Supabase 是唯一的資料來源。** 拿掉 Zustand persist（localStorage）和 `idb-keyval`（IndexedDB），不做離線快取或同步。`uiStore` 的導覽狀態不受影響。唯一留在瀏覽器的是 supabase-js 自己存在 localStorage 的登入 session。
- 登入後只載入 `datasets`、`dashboards` 的清單；開啟儀表板時才分頁撈資料列，放進記憶體裡的 `rowsStore`。登出時清空 `appStore` 和 `rowsStore`。
- **儀表板內容要手動按「儲存」。** 版面、widget、欄位綁定的變更先只存在記憶體，標示為「未儲存」；在 app 內切換畫面時提醒，關閉或重新整理分頁時用 `beforeunload` 提醒。存檔失敗時跳 Snackbar，維持「未儲存」狀態，再按一次就重試。
- 清單層級的操作立即寫入：新增、複製、刪除、改名儀表板，以及上傳、刪除資料集。
- 匯出 / 匯入 JSON 保留，格式不變（[0005](0005-dashboard-config-schema-v1.md)），匯入時寫進資料庫。「載入範例資料」走和上傳完全一樣的流程。

### 開發流程與部署

- Supabase CLI 裝成 devDependency，`supabase link` 直接連雲端 project，用 `npm run db:push` 套用 migration，不在本機跑 Docker。
- 環境變數 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`：本機放在 `.env.local`（範本是 `.env.example`），部署時在 Vercel 的 Production 和 Preview 都要設定。缺少時 `services/supabase.ts` 在載入時就會報錯。
- Supabase Auth 的 redirect 允許清單要包含 localhost、正式網址，以及 Vercel Preview 網址的 wildcard。

## 影響

- 換電腦或清除瀏覽器資料後，登入就能找回所有儀表板和資料，匯出 JSON 不再是唯一的備份。
- 每次重新整理都要從網路重新抓資料列，大的資料集載入會比讀 IndexedDB 慢。demo 規模可以接受；真的變慢時再考慮快取，或把彙總搬到資料庫端。
- 存取資料庫一定要經過 `services/`，UI 不直接 import Supabase client。0001 預留的接點（store 的儲存層和資料集讀寫模組）就是這次替換的範圍。
- 沒有網路就無法使用。
- 本機的舊資料（localStorage、IndexedDB）不搬，需要的話用匯出 / 匯入 JSON 或重新上傳。
- 分階段期間的已知限制：資料集已經按帳號隔離，儀表板卻還存在 localStorage，由同一個瀏覽器的所有帳號共用。換帳號登入會看到前一位的儀表板，而且都顯示「資料集遺失」。儀表板改存 Supabase 後就會消失。

## 考慮過的其他方案

- **不登入、所有人共用一份資料**：publishable key 本來就公開在前端，拿到網址的人都能刪掉全部資料。
- **Anonymous Sign-in**：換一台電腦就是另一個身分，沒有解決跨裝置的問題。
- **整份設定存成一筆 jsonb，只替換 persist 的 `storage`**：改動最小，但多個分頁同時編輯時，後存的會蓋掉整份設定。
- **一張資料表整包存成一筆 jsonb**：和 IndexedDB 的格式一對一，但單筆很大，也沒辦法在資料庫端查詢。
- **IndexedDB 留著當快取，或做本地優先的同步**：要處理快取失效和同步衝突，demo 用不到。
- **在 Edge Function 裡解析 Excel**：解析流程已經穩定，搬到伺服端只會增加風險。
- **自動存檔（debounce）**：最後選擇手動存檔，讓「什麼時候寫入資料庫」更明確。
