// 資料集庫中的一張卡片：基本資訊、被跳過的工作表與原因、每張資料表的欄位、刪除。
//
// 預設收合，只顯示一行摘要；展開後才渲染跳過原因與欄位表格（unmountOnExit），資料集多時頁面不會太長。
// 展開時才載入資料列，用來做欄位健檢、依種類分組並判斷每張表的「一列代表什麼」（DatasetTables）。
// 資料列已在快取中時，摘要列顯示健檢建議的數量；剛上傳的資料集、或從欄位清單的提示過來時自動展開。
// 刪除前會列出還在使用這個資料集的儀表板。

import { useState } from 'react';
import dayjs from 'dayjs';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { deleteDataset } from '../../services/datasetService.ts';
import type { Dataset } from '../../types/index.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useRowsStore } from '../../store/rowsStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import { checkFields } from '../../utils/fieldHealth.ts';
import { DatasetTables } from './DatasetTables.tsx';

export function DatasetCard({ dataset }: { dataset: Dataset }) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dashboards = useAppStore((s) => s.dashboards);
  const notify = useUiStore((s) => s.notify);
  const requested = useUiStore((s) => s.expandDatasetId === dataset.id);
  const setExpandDatasetId = useUiStore((s) => s.setExpandDatasetId);
  // 只讀快取、不觸發載入：收合的卡片不必為了數量去讀整份資料列。
  const rows = useRowsStore((s) => s.byDataset[dataset.id]);
  const suggestionCount = rows?.status === 'ready' ? checkFields(dataset, rows.rows).length : 0;
  const open = expanded || requested;
  const usedBy = dashboards.filter((d) => d.datasetId === dataset.id);
  const visibleCount = dataset.tables.filter((t) => !t.hidden).length;
  const skippedCount = dataset.skippedSheets?.length ?? 0;

  const handleDelete = async () => {
    setConfirming(false);
    try {
      await deleteDataset(dataset.id);
    } catch (error) {
      notify({
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Card variant='outlined'>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction='row'
            useFlexGap
            onClick={() => {
              setExpanded(!open);
              if (open && requested) setExpandDatasetId(null);
            }}
            sx={{ alignItems: 'flex-start', cursor: 'pointer', flexWrap: 'wrap', gap: 2 }}
          >
            {/* flex-basis 讓手機上按鈕換到下一行，而不是把名稱擠成一字一行。 */}
            <Stack spacing={0.5} sx={{ flex: '1 1 240px', minWidth: 0 }}>
              <Typography variant='h6' component='h3'>
                {dataset.name}
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {dataset.fileName}・上傳於 {dayjs(dataset.uploadedAt).format('YYYY-MM-DD HH:mm')}
              </Typography>
              <Stack direction='row' useFlexGap sx={{ pt: 0.5, flexWrap: 'wrap', gap: 1 }}>
                <Chip size='small' label={`${visibleCount} 張可用資料表`} />
                {usedBy.length > 0 && (
                  <Chip size='small' variant='outlined' label={`${usedBy.length} 個儀表板使用中`} />
                )}
                {suggestionCount > 0 && (
                  <Chip
                    size='small'
                    variant='outlined'
                    color='info'
                    label={`${suggestionCount} 項欄位建議`}
                  />
                )}
                {skippedCount > 0 && (
                  <Chip
                    size='small'
                    variant='outlined'
                    color='warning'
                    label={`跳過 ${skippedCount} 張工作表`}
                  />
                )}
              </Stack>
            </Stack>
            <Button aria-expanded={open}>{open ? '收合 ▴' : '展開 ▾'}</Button>
            <Button
              color='error'
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
            >
              刪除
            </Button>
          </Stack>

          <Collapse in={open} unmountOnExit>
            <Stack spacing={2}>
              {dataset.skippedSheets && dataset.skippedSheets.length > 0 && (
                <Alert severity='warning'>
                  <AlertTitle>以下工作表不符合結構規範，已跳過</AlertTitle>
                  {dataset.skippedSheets.map((s) => (
                    <div key={s.sheetName}>
                      {s.sheetName}：{s.reason}
                    </div>
                  ))}
                </Alert>
              )}

              <DatasetTables dataset={dataset} />
            </Stack>
          </Collapse>
        </Stack>
      </CardContent>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>刪除「{dataset.name}」？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {usedBy.length > 0
              ? `以下儀表板正在使用這個資料集，刪除後它們會顯示「資料集遺失」：${usedBy
                  .map((d) => d.name)
                  .join('、')}`
              : '資料集、它的資料列和原始 Excel 檔都會從雲端刪除，無法復原。'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>取消</Button>
          <Button color='error' variant='contained' onClick={handleDelete}>
            刪除
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
