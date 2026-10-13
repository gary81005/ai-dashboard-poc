// 最外層版面：頂部 AppBar（「儀表板」「資料集」兩個分頁、帳號與登出）＋ 主內容區。
// 未登入時只顯示登入頁（ADR 0007）。
//
// 專案沒有 router（ADR 0001），顯示哪個畫面由 uiStore.view 決定：
//   dashboards → 儀表板清單、datasets → 資料集庫、dashboard → 單一儀表板（檢視／編輯）。

import { useState } from 'react';
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
import { DashboardListPage } from './pages/DashboardListPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DatasetLibraryPage } from './pages/DatasetLibraryPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { signOut } from './services/auth.ts';
import { useAuthStore } from './store/authStore.ts';
import { useUiStore } from './store/uiStore.ts';

function App() {
  const authStatus = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.user?.email);
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // 單一儀表板頁沒有自己的分頁，沿用「儀表板」分頁的反白。
  const tab = view === 'datasets' ? 'datasets' : 'dashboards';

  if (authStatus === 'loading') {
    return (
      <Box sx={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label='載入中' />
      </Box>
    );
  }
  if (authStatus === 'signedOut') return <LoginPage />;

  // 資料目前仍存在這個瀏覽器（localStorage + IndexedDB），所以登出時不清空 store；
  // 等資料改由 Supabase 載入後，登出時要一併清空 appStore 與 rowsStore。
  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('dashboards');
    } catch (error) {
      setSignOutError(`登出失敗：${error instanceof Error ? error.message : String(error)}`);
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
        <Toolbar sx={{ gap: 3 }}>
          <Typography variant='h6' component='h1' sx={{ fontWeight: 600 }}>
            個人化儀表板
          </Typography>
          <Tabs value={tab} onChange={(_, value: 'dashboards' | 'datasets') => navigate(value)}>
            <Tab value='dashboards' label='儀表板' />
            <Tab value='datasets' label='資料集' />
          </Tabs>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant='body2' color='text.secondary'>
              {email}
            </Typography>
            <Button onClick={() => void handleSignOut()}>登出</Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box component='main' sx={{ p: 3 }}>
        {view === 'dashboards' && <DashboardListPage />}
        {view === 'datasets' && <DatasetLibraryPage />}
        {view === 'dashboard' && <DashboardPage />}
      </Box>
      <Snackbar
        open={signOutError !== null}
        autoHideDuration={6000}
        onClose={() => setSignOutError(null)}
      >
        {signOutError ? (
          <Alert severity='error' variant='filled' onClose={() => setSignOutError(null)}>
            {signOutError}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export default App;
