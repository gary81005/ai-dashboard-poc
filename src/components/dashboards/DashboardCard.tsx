// 儀表板清單上的一張卡片：點擊開啟，另有複製、匯出 JSON、刪除（需確認）。

import { useState } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { downloadJson } from '../../services/download.ts';
import { useAppStore } from '../../store/appStore.ts';
import type { Dashboard, Dataset } from '../../types/index.ts';
import { buildExport, cloneDashboard } from '../../utils/dashboardTransfer.ts';

type Props = { dashboard: Dashboard; dataset: Dataset | undefined; onOpen: () => void };

export function DashboardCard({ dashboard, dataset, onOpen }: Props) {
  const [confirming, setConfirming] = useState(false);
  const addDashboard = useAppStore((s) => s.addDashboard);
  const removeDashboard = useAppStore((s) => s.removeDashboard);

  const handleDuplicate = () =>
    addDashboard(cloneDashboard(dashboard, { name: `${dashboard.name}（複本）` }));
  const handleExport = () =>
    downloadJson(`${dashboard.name}.dashboard.json`, buildExport(dashboard, dataset));

  return (
    <Card variant='outlined' sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={onOpen} sx={{ flex: 1 }}>
        <CardContent>
          <Typography variant='h6' component='h3' gutterBottom noWrap>
            {dashboard.name}
          </Typography>
          <Typography variant='body2' color={dataset ? 'text.secondary' : 'error'}>
            {dataset ? `資料集：${dataset.name}` : '資料集遺失'}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {dashboard.widgets.length} 個元件・更新於{' '}
            {dayjs(dashboard.updatedAt).format('YYYY-MM-DD HH:mm')}
          </Typography>
        </CardContent>
      </CardActionArea>
      <CardActions>
        <Button size='small' onClick={handleDuplicate}>
          複製
        </Button>
        <Button size='small' onClick={handleExport}>
          匯出 JSON
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size='small' color='error' onClick={() => setConfirming(true)}>
          刪除
        </Button>
      </CardActions>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>刪除「{dashboard.name}」？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            儀表板設定會從這個瀏覽器移除，資料集不受影響。若需要保留，請先匯出 JSON。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>取消</Button>
          <Button
            color='error'
            variant='contained'
            onClick={() => {
              setConfirming(false);
              removeDashboard(dashboard.id);
            }}
          >
            刪除
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
