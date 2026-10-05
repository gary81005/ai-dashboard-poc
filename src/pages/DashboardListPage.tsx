// 儀表板清單頁（首頁）：列出所有儀表板卡片，提供新增、匯入 JSON。
//
// 沒有任何儀表板時顯示空狀態，引導使用者載入範例或上傳 Excel。

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CreateDashboardDialog } from '../components/dashboards/CreateDashboardDialog.tsx';
import { DashboardCard } from '../components/dashboards/DashboardCard.tsx';
import { ImportDashboardDialog } from '../components/dashboards/ImportDashboardDialog.tsx';
import { WorkbookActions } from '../components/datasets/WorkbookActions.tsx';
import { useAppStore } from '../store/appStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { parseExport } from '../utils/dashboardTransfer.ts';
import type { DashboardExport } from '../utils/dashboardTransfer.ts';

export function DashboardListPage() {
  const dashboards = useAppStore((s) => s.dashboards);
  const datasets = useAppStore((s) => s.datasets);
  const setActiveDashboard = useAppStore((s) => s.setActiveDashboard);
  const navigate = useUiStore((s) => s.navigate);
  const importRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState<DashboardExport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (dashboardId: string) => {
    setActiveDashboard(dashboardId);
    navigate('dashboard');
  };

  // 先解析匯入檔；成功後交給 ImportDashboardDialog 選擇資料集並確認。
  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setImporting(parseExport(await file.text()));
    } catch (e) {
      setError(`無法匯入：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography variant='h5' component='h2' sx={{ flex: 1 }}>
          儀表板
        </Typography>
        <input
          ref={importRef}
          type='file'
          accept='.json,application/json'
          hidden
          onChange={handleImportFile}
        />
        <Button onClick={() => importRef.current?.click()}>匯入 JSON</Button>
        {datasets.length > 0 && (
          <Button variant='contained' onClick={() => setCreating(true)}>
            ＋ 新增儀表板
          </Button>
        )}
      </Stack>

      {dashboards.length === 0 ? (
        <Paper variant='outlined' sx={{ p: 6 }}>
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Typography variant='h6'>還沒有任何儀表板</Typography>
            <Typography color='text.secondary'>
              先載入範例資料看看完成的樣子，或上傳你自己的 Excel 報表後新增儀表板。
            </Typography>
            <WorkbookActions />
          </Stack>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          }}
        >
          {dashboards.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              dataset={datasets.find((d) => d.id === dashboard.datasetId)}
              onOpen={() => open(dashboard.id)}
            />
          ))}
        </Box>
      )}

      <CreateDashboardDialog open={creating} onClose={() => setCreating(false)} />
      <ImportDashboardDialog data={importing} onClose={() => setImporting(null)} />
      <Snackbar open={error !== null} autoHideDuration={6000} onClose={() => setError(null)}>
        {error ? (
          <Alert severity='error' variant='filled' onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}
