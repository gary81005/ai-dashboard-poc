// 資料集庫中的一張卡片：基本資訊、被跳過的工作表與原因、每張資料表的欄位、刪除。
//
// 預設收合，只顯示一行摘要；展開後才渲染跳過原因與欄位表格（unmountOnExit），資料集多時頁面不會太長。
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
import { TableFieldsAccordion } from './TableFieldsAccordion.tsx';

export function DatasetCard({ dataset }: { dataset: Dataset }) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dashboards = useAppStore((s) => s.dashboards);
  const usedBy = dashboards.filter((d) => d.datasetId === dataset.id);
  const visibleCount = dataset.tables.filter((t) => !t.hidden).length;
  const skippedCount = dataset.skippedSheets?.length ?? 0;

  const handleDelete = async () => {
    setConfirming(false);
    await deleteDataset(dataset.id);
  };

  return (
    <Card variant='outlined'>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction='row'
            spacing={2}
            onClick={() => setExpanded(!expanded)}
            sx={{ alignItems: 'flex-start', cursor: 'pointer' }}
          >
            <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant='h6' component='h3'>
                {dataset.name}
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {dataset.fileName}・上傳於 {dayjs(dataset.uploadedAt).format('YYYY-MM-DD HH:mm')}
              </Typography>
              <Stack direction='row' spacing={1} sx={{ pt: 0.5 }}>
                <Chip size='small' label={`${visibleCount} 張可用資料表`} />
                {usedBy.length > 0 && (
                  <Chip size='small' variant='outlined' label={`${usedBy.length} 個儀表板使用中`} />
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
            <Button aria-expanded={expanded}>{expanded ? '收合 ▴' : '展開 ▾'}</Button>
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

          <Collapse in={expanded} unmountOnExit>
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

              <div>
                {dataset.tables.map((table) => (
                  <TableFieldsAccordion key={table.key} datasetId={dataset.id} table={table} />
                ))}
              </div>
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
              : '資料集和它的資料會從這個瀏覽器中移除，無法復原。'}
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
