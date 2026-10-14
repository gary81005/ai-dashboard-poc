// 最外層版面：頂部 AppBar（「儀表板」「資料集」兩個分頁、帳號與登出）＋ 主內容區。
// 窄螢幕（ADR 0009）：手機隱藏產品名稱、md 以下隱藏 email，主內容區的留白縮小。
// 未登入時只顯示登入頁（ADR 0007）。
//
// 專案沒有 router（ADR 0001），顯示哪個畫面由 uiStore.view 決定：
//   dashboards → 儀表板清單、datasets → 資料集庫、dashboard → 單一儀表板（檢視／編輯）。

import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { UnsavedChangesDialog } from './components/dashboard/UnsavedChangesDialog.tsx';
import { DashboardListPage } from './pages/DashboardListPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DatasetLibraryPage } from './pages/DatasetLibraryPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { signOut } from './services/auth.ts';
import { loadUserData } from './services/userData.ts';
import { useAppStore } from './store/appStore.ts';
import { useAuthStore } from './store/authStore.ts';
import { useUiStore } from './store/uiStore.ts';

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
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const notify = useUiStore((s) => s.notify);
  const leave = useUiStore((s) => s.leave);
  const loadStatus = useAppStore((s) => s.loadStatus);
  // 單一儀表板頁沒有自己的分頁，沿用「儀表板」分頁的反白。
  const tab = view === 'datasets' ? 'datasets' : 'dashboards';

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
      navigate('dashboards');
    } catch (error) {
      notify({
        severity: 'error',
        message: `登出失敗：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  return (
    <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
      <AppBar
        position='sticky'
        color='default'
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 3 } }}>
          <Typography
            variant='h6'
            component='h1'
            noWrap
            sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' } }}
          >
            個人化儀表板
          </Typography>
          <Tabs value={tab} onChange={(_, value: 'dashboards' | 'datasets') => navigate(value)}>
            <Tab value='dashboards' label='儀表板' />
            <Tab value='datasets' label='資料集' />
          </Tabs>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant='body2'
              color='text.secondary'
              noWrap
              sx={{ display: { xs: 'none', md: 'block' } }}
            >
              {email}
            </Typography>
            <Button onClick={() => leave(() => void handleSignOut())}>登出</Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box component='main' sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
        {view === 'dashboards' && <DashboardListPage />}
        {view === 'datasets' && <DatasetLibraryPage />}
        {view === 'dashboard' && <DashboardPage />}
      </Box>
      <UnsavedChangesDialog />
      <GlobalNotice />
    </Box>
  );
}

export default App;
