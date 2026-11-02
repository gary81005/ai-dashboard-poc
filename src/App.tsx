// 根版面（router.tsx 的根路由）：頂部 HeaderBar（「儀表板」「資料集」兩個分頁、帳號與登出）＋ 主內容區。
// 窄螢幕（ADR 0009）：手機隱藏產品名稱、md 以下隱藏 email，主內容區的留白縮小。
// 未登入時在原網址直接顯示登入頁（ADR 0007、0013），登入並載入資料後才顯示網址對應的畫面（<Outlet />）。

import type { ReactNode } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { HeaderBar } from './components/HeaderBar.tsx';
import { UnsavedChangesDialog } from './components/dashboard/UnsavedChangesDialog.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { signOut } from './services/auth.ts';
import { loadUserData } from './services/userData.ts';
import { useAppStore } from './store/appStore.ts';
import { useAuthStore } from './store/authStore.ts';
import { useUiStore } from './store/uiStore.ts';
import { DASHBOARDS_PATH, DATASETS_PATH } from './utils/paths.ts';

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100svh', display: 'grid', placeItems: 'center', p: 2 }}>{children}</Box>
  );
}

// 全域提示（uiStore.notice）。登入頁也要顯示：session 過期時的提示是在登出之後才出現的。
function GlobalNotice() {
  const notice = useUiStore((s) => s.notice);
  const notify = useUiStore((s) => s.notify);
  return (
    <Snackbar open={notice !== null} autoHideDuration={6000} onClose={() => notify(null)}>
      {notice ? (
        <Alert severity={notice.severity} variant='filled' onClose={() => notify(null)}>
          {notice.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}

function App() {
  const authStatus = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.user?.email);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const notify = useUiStore((s) => s.notify);
  const leave = useUiStore((s) => s.leave);
  const loadStatus = useAppStore((s) => s.loadStatus);
  // 單一儀表板頁沒有自己的分頁，沿用「儀表板」分頁的反白。
  const tab = pathname.startsWith(DATASETS_PATH) ? DATASETS_PATH : DASHBOARDS_PATH;

  if (authStatus === 'signedOut') {
    return (
      <>
        <LoginPage />
        <GlobalNotice />
      </>
    );
  }
  // 登入後要等資料集與儀表板載入（services/auth.ts 觸發），否則儀表板會誤判成「資料集遺失」。
  if (authStatus === 'loading' || loadStatus.status === 'idle' || loadStatus.status === 'loading') {
    return (
      <FullScreen>
        <CircularProgress aria-label='載入中' />
      </FullScreen>
    );
  }
  if (loadStatus.status === 'error') {
    return (
      <FullScreen>
        <Alert severity='error' action={<Button onClick={() => void loadUserData()}>重試</Button>}>
          {loadStatus.message}
        </Alert>
      </FullScreen>
    );
  }

  // 登出後清空記憶體中的資料由 services/auth.ts 處理。有未儲存的變更時，leave 會先問使用者。
  const handleSignOut = async () => {
    try {
      await signOut();
      // 不停在上一位使用者的儀表板網址，下一個人登入後才不會看到「找不到這個儀表板」。
      void navigate(DASHBOARDS_PATH, { replace: true });
    } catch (error) {
      notify({
        severity: 'error',
        message: `登出失敗：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  return (
    <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
      <HeaderBar>
        {/* 分頁是連結，可以 Cmd／中鍵開新分頁（ADR 0013）。 */}
        <Tabs value={tab}>
          <Tab value={DASHBOARDS_PATH} label='儀表板' component={Link} to={DASHBOARDS_PATH} />
          <Tab value={DATASETS_PATH} label='資料集' component={Link} to={DATASETS_PATH} />
        </Tabs>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant='body2'
            noWrap
            sx={(theme) => ({
              color: (theme.vars ?? theme).palette.header.muted,
              display: { xs: 'none', md: 'block' },
            })}
          >
            {email}
          </Typography>
          <Button
            variant='outlined'
            onClick={() => leave(() => void handleSignOut())}
            sx={(theme) => {
              const { header } = (theme.vars ?? theme).palette;
              return { color: header.accent, borderColor: header.accent };
            }}
          >
            登出
          </Button>
        </Box>
      </HeaderBar>
      <Box component='main' sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
        <Outlet />
      </Box>
      <UnsavedChangesDialog />
      <GlobalNotice />
      {/* 上一頁回到原本的捲動位置，進到新頁面時捲到最上方。 */}
      <ScrollRestoration />
    </Box>
  );
}

export default App;
