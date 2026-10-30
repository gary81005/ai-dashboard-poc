// 儀表板清單上的一張卡片：點擊開啟，另有複製、匯出 JSON、刪除（需確認）。
// 有還沒過期的分享連結時，名稱旁顯示「分享中」，提醒這個儀表板正對外公開（ADR 0012）。

import { useState } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createDashboard, deleteDashboard } from '../../services/dashboardService.ts';
import { downloadJson } from '../../services/download.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard, Dataset } from '../../types/index.ts';
import { buildExport, cloneDashboard } from '../../utils/dashboardTransfer.ts';
import { isShareActive } from '../../utils/shareLink.ts';

type Props = { dashboard: Dashboard; dataset: Dataset | undefined; onOpen: () => void };

export function DashboardCard({ dashboard, dataset, onOpen }: Props) {
  const [confirming, setConfirming] = useState(false);
  const notify = useUiStore((s) => s.notify);
  const share = useAppStore((s) => s.shares[dashboard.id]);
  // 卡片掛上時的時間；回到清單頁會重新掛上，所以不會停在很久以前。
  const [now] = useState(() => new Date());
  const shared = share !== undefined && isShareActive(share, now);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      notify({
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const handleDuplicate = () =>
    run(() => createDashboard(cloneDashboard(dashboard, { name: `${dashboard.name}（複本）` })));
  const handleExport = () =>
    downloadJson(`${dashboard.name}.dashboard.json`, buildExport(dashboard, dataset));

  return (
    <Card variant='outlined' sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={onOpen} sx={{ flex: 1 }}>
        <CardContent>
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
            <Typography variant='h6' component='h3' noWrap sx={{ minWidth: 0 }}>
              {dashboard.name}
            </Typography>
            {shared && <Chip size='small' color='info' variant='outlined' label='分享中' />}
          </Stack>
          <Typography variant='body2' color={dataset ? 'text.secondary' : 'error'}>
            {dataset ? `資料集：${dataset.name}` : '資料集遺失'}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {dashboard.widgets.length} 個元件
          </Typography>
          {/* 更新時間另起一行，卡片窄時不會和元件數擠在一起斷開。 */}
          <Typography variant='body2' color='text.secondary'>
            更新於 ： {dayjs(dashboard.updatedAt).format('YYYY-MM-DD HH:mm')}
          </Typography>
        </CardContent>
      </CardActionArea>
      <CardActions>
        <Button size='small' onClick={() => void handleDuplicate()}>
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
            儀表板設定會從雲端刪除，資料集不受影響。若需要保留，請先匯出 JSON。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>取消</Button>
          <Button
            color='error'
            variant='contained'
            onClick={() => {
              setConfirming(false);
              void run(() => deleteDashboard(dashboard.id));
            }}
          >
            刪除
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
