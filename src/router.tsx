// 路由表（ADR 0013）：React Router 的 data mode，只用來對應網址與畫面、攔截未儲存的變更（useBlocker），
// 不用 loader 載入資料。資料由 services/userData.ts 在登入後一次載入；登入、載入中、錯誤的判斷在根版面 App。
//
// 網址格式寫在 utils/paths.ts。分享頁（?share=，ADR 0012）不經過這裡，由 main.tsx 在建立 router 前分流。

import { Navigate, createBrowserRouter } from 'react-router';
import App from './App.tsx';
import { DashboardListPage } from './pages/DashboardListPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DatasetLibraryPage } from './pages/DatasetLibraryPage.tsx';
import { useUiStore } from './store/uiStore.ts';
import { DASHBOARDS_PATH, DATASETS_PATH } from './utils/paths.ts';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to={DASHBOARDS_PATH} replace /> },
      { path: DASHBOARDS_PATH, element: <DashboardListPage /> },
      { path: `${DASHBOARDS_PATH}/:dashboardId`, element: <DashboardPage /> },
      { path: DATASETS_PATH, element: <DatasetLibraryPage /> },
      { path: '*', element: <Navigate to={DASHBOARDS_PATH} replace /> },
    ],
  },
]);

// 換到另一個畫面時清掉編輯模式、選取與儀表板篩選。放在 router 的訂閱而不是頁面 effect 的 cleanup：
// StrictMode 開發時 effect 會多跑一次 cleanup，會把「新增儀表板」剛開啟的編輯模式關掉。
let pathname = router.state.location.pathname;
router.subscribe(({ location }) => {
  if (location.pathname === pathname) return;
  pathname = location.pathname;
  useUiStore.getState().resetDashboardUi();
});
