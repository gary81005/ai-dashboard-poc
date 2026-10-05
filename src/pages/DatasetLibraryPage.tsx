// 資料集庫頁：上傳 Excel／載入範例，並列出每個資料集（最新的在最上面）。
//
// 每個資料集可以檢視欄位、調整角色與比率標記、隱藏資料表、刪除（見 components/datasets/）。

import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useAppStore } from '../store/appStore.ts';
import { DatasetCard } from '../components/datasets/DatasetCard.tsx';
import { WorkbookActions } from '../components/datasets/WorkbookActions.tsx';

export function DatasetLibraryPage() {
  const datasets = useAppStore((s) => s.datasets);

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant='h5' component='h2'>
          資料集
        </Typography>
        <WorkbookActions />
      </Stack>
      {datasets.length === 0 ? (
        <Paper variant='outlined' sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant='h6' gutterBottom>
            還沒有任何資料集
          </Typography>
          <Typography color='text.secondary'>
            上傳符合結構規範的 Excel，或先載入範例資料試試看。
          </Typography>
        </Paper>
      ) : (
        [...datasets].reverse().map((dataset) => <DatasetCard key={dataset.id} dataset={dataset} />)
      )}
    </Stack>
  );
}
