// 最外層版面：頂部 AppBar（「儀表板」「資料集」兩個分頁）＋ 主內容區。
//
// 專案沒有 router（ADR 0001），顯示哪個畫面由 uiStore.view 決定：
//   dashboards → 儀表板清單、datasets → 資料集庫、dashboard → 單一儀表板（檢視／編輯）。

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { DashboardListPage } from './pages/DashboardListPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DatasetLibraryPage } from './pages/DatasetLibraryPage.tsx';
import { useUiStore } from './store/uiStore.ts';

function App() {
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  // 單一儀表板頁沒有自己的分頁，沿用「儀表板」分頁的反白。
  const tab = view === 'datasets' ? 'datasets' : 'dashboards';

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
        </Toolbar>
      </AppBar>
      <Box component='main' sx={{ p: 3 }}>
        {view === 'dashboards' && <DashboardListPage />}
        {view === 'datasets' && <DatasetLibraryPage />}
        {view === 'dashboard' && <DashboardPage />}
      </Box>
    </Box>
  );
}

export default App;
