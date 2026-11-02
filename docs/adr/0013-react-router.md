# 0013. 導入 React Router：每個畫面有自己的網址

- 狀態：已採納（取代 [0001](0001-frontend-only-storage.md) §5「不引入 router」），實作中
- 日期：2026-11-02

## 背景

[0001](0001-frontend-only-storage.md) §5 決定不用 router：三個畫面（儀表板清單、資料集庫、單一儀表板）由 `uiStore.view` 切換，開著哪個儀表板記在 `appStore.activeDashboardId`。當時只有三個畫面，這樣最省事。

專案變大之後，這個做法的缺點越來越明顯：

- **重新整理一定回到儀表板清單。** 網址永遠是 `/`，打開到一半的儀表板沒辦法用網址直接打開，也沒辦法存成書籤或傳給自己。
- **瀏覽器的上一頁／下一頁沒有作用。** 按上一頁會直接離開網站，有未儲存的變更也攔不住，只剩 `beforeunload` 的瀏覽器提示。
- **不能開新分頁。** 清單裡的儀表板、頂部的分頁都是按鈕，Cmd／中鍵點擊沒有效果。
- 畫面切換散在 8 個 `navigate(view)` 呼叫點，換頁時要清哪些狀態也寫在 `uiStore` 裡，加畫面時容易漏掉。

## 決策

### 1. 套件與模式

- **使用 React Router v8**（`react-router`，v8 起沒有 `react-router-dom`）的 **data mode**：`createBrowserRouter` + `RouterProvider`。
- 只用路由表、`useBlocker`、`<ScrollRestoration />`。**不用 loader／action 抓資料**：資料仍由 `services/` 載入、存在 Zustand store（[0007](0007-supabase-storage.md)），登入後一次載入的流程不變。
- 不用 framework mode：它要求 Vite plugin、檔案路由與伺服器端的設定，對沒有後端的專案改動太大。
- declarative mode（`<BrowserRouter>`）沒有 `useBlocker`，攔不住瀏覽器的上一頁，所以不採用。

### 2. 網址

| 網址                       | 畫面                                                 |
| -------------------------- | ---------------------------------------------------- |
| `/`                        | 轉到 `/dashboards`                                   |
| `/dashboards`              | 儀表板清單                                           |
| `/dashboards/:dashboardId` | 單一儀表板（檢視／編輯）                             |
| `/datasets`                | 資料集庫                                             |
| 其他路徑                   | 轉到 `/dashboards`                                   |
| `/?share=<token>`          | 分享頁（[0012](0012-share-links.md)），不經過 router |

- **一般路徑，不用 hash。** 部署端要把所有路徑都回傳 `index.html`：Vercel 用 `vercel.json` 的 rewrite；`vite dev`／`vite preview` 本來就會。hash 路由還會和 Supabase 登入失敗時帶回來的 `#error=…` 衝突。
- 儀表板 id 不存在（被刪除或打錯）時，沿用現在的「找不到這個儀表板」與「回到清單」。
- 資料集沒有自己的頁面，資料集庫的卡片展開就夠了。要自動展開哪張卡片（`expandDatasetId`）仍放在 `uiStore`，它是一次性的提示，不是位置。
- **分享連結維持 `?share=<token>`。** `main.tsx` 在建立 router、開始監聽登入之前就分流，分享頁的行為與 [0012](0012-share-links.md) 相同，已經發出去的連結也不受影響。

### 3. 狀態的歸屬

- **網址是「目前在哪個畫面、開著哪個儀表板」的唯一來源。** 拿掉 `uiStore.view`、`uiStore.navigate` 與 `appStore.activeDashboardId`。儀表板頁用 `useParams` 取得 id，`services/dashboardService.ts` 等需要 id 的地方改成由參數傳入。`draftBase` 本身就帶著 id，判斷「這份未儲存的變更屬於哪個儀表板」不受影響。
- **編輯模式不放進網址**，仍是 `uiStore.editing`。編輯是同一個畫面的模式；未儲存的變更只在記憶體裡，重新整理本來就會回到檢視模式。放進網址還得處理窄螢幕不能編輯（[0009](0009-responsive-layout.md)）時的導回，以及上一頁的行為。
- `selectedWidgetId`、`filterValues`、面板寬度等仍在 `uiStore`。離開儀表板時一樣清掉編輯模式、選取與篩選，避免帶進下一個儀表板。

### 4. 未儲存的變更

- **換網址一律經過 `useBlocker`**：點分頁、連結、瀏覽器的上一頁／下一頁都算。條件是「有未儲存的變更（`appStore.draftBase` 不是 null），而且路徑要離開這個儀表板」；只改 query 或 hash 不算離開。
- **登出不是換網址，照舊經過 `uiStore.leave`。**
- 兩個來源共用同一個 `UnsavedChangesDialog`：都把「繼續」交給 `uiStore.pendingLeave`。使用者選擇取消時，blocker 呼叫 `reset()`，網址留在原處。
- 關閉或重新整理分頁仍由 `beforeunload` 提醒，不變。

### 5. 登入與登出

- **不另開 `/login` 路由。** 未登入時在原網址直接顯示登入頁，登入後原網址的畫面就出現。
- **登入後回到原本的網址。** 寄出登入連結時，`emailRedirectTo` 帶上目前的 origin + 路徑（不含 query 與 hash）。Supabase 後台的 Redirect URLs 要允許這些路徑：開發用 `http://localhost:5173/**`，正式網址也要加上 `/**`。
- **主動按「登出」**：換到 `/dashboards`，用 replace，不留在上一位使用者的 `/dashboards/<id>`。
- **登入失效**（session 過期、在別的分頁登出）：網址不動，重新登入後回到原畫面。

### 6. 導覽元素與細節

- 頂部的「儀表板／資料集」分頁、清單裡的儀表板卡片、「← 儀表板清單」都是**真正的連結**（`<a href>`），可以 Cmd／中鍵點擊開新分頁，滑鼠移上去也看得到網址。卡片上的選單按鈕要擋掉點擊冒泡，避免觸發連結。
- 「← 儀表板清單」一律到 `/dashboards`，不用 `navigate(-1)`：直接打開網址的人沒有上一頁可以回。
- 每頁設定自己的 `document.title`：`儀表板｜個人化儀表板`、`資料集｜個人化儀表板`、`<儀表板名稱>｜個人化儀表板`、`登入｜個人化儀表板`。
- 加上 `<ScrollRestoration />`：上一頁回到清單時回到原本的捲動位置，進到新頁面時捲到最上方。
- **這次不做頁面拆包（lazy load）。** 先把路由換好、行為不變；拆包是獨立的效能議題，之後量過 bundle 再決定。

### 實作順序

1. 這份 ADR。
2. 換上 router：路由表、根版面（登入／載入中／錯誤的判斷 + `<Outlet />`）、拿掉 `uiStore.view` 與 `appStore.activeDashboardId`、`vercel.json`。換頁暫時仍經過 `uiStore.leave`，行為和現在一樣。
3. 未儲存的變更改用 `useBlocker` 攔截。
4. 導覽細節：連結、登出、登入後回原網址、`document.title`、`<ScrollRestoration />`。
5. 文件同步（CLAUDE.md、README）。

## 影響

- 每個畫面都能用網址直接打開、重新整理、存成書籤；上一頁／下一頁照一般網站的方式運作，未儲存的變更也攔得住。
- 部署端多一份 `vercel.json`。換到其他平台時，也要設定「所有路徑都回傳 `index.html`」，否則直接打開 `/dashboards/<id>` 會 404。
- Supabase Auth 的 Redirect URLs 要加上 `/**`，否則登入連結會被擋下來或導回首頁。
- 多一個執行期依賴（`react-router`）。它要求 Node ≥ 22.22，只影響 `npm install` 時的 engines 警告；router 只在瀏覽器執行，建置與測試不受影響。
- 換頁的副作用（清掉編輯模式、選取、篩選）從 `uiStore.navigate` 搬到儀表板頁本身，加畫面時不用再改 `uiStore`。

## 考慮過的其他方案

- **維持 `uiStore.view`，自己同步 `history.pushState`**：不用加套件，但上一頁、攔截離開、捲動位置都要自己寫，等於重做一個簡化版的 router。
- **hash 路由**（`/#/dashboards/<id>`）：不用改部署設定，但網址比較醜，也會和 Supabase 帶回來的 `#error=…` 衝突。
- **declarative mode**：最簡單，但沒有 `useBlocker`，瀏覽器上一頁攔不住未儲存的變更。
- **用 loader 載入資料**：資料改成每頁進入時抓，和現在「登入後一次載入、存在 store」的做法重疊，改動範圍太大，也沒有明顯的好處。
- **編輯模式放進網址**（`/dashboards/<id>/edit`）：重新整理會留在編輯模式，但窄螢幕要導回、上一頁會跳出編輯模式，邊角情況多。
- **保留 `activeDashboardId`，由路由頁面同步寫入**：改動最小，但「開著哪個儀表板」會有網址和 store 兩個來源，切換時可能有一瞬間不一致。
- **分享連結改成 `/share/<token>`**：網址比較一致，但已經發出去的連結要做相容，分享頁也刻意不經過登入與 router，換網址只有成本沒有好處。
- **另開 `/login` 路由**：要多處理「登入後導回」與「已登入時打開 /login」，在原網址直接顯示登入頁比較簡單。
