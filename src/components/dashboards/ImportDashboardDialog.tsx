// 「匯入儀表板」對話框（ADR 0005 匯入流程）：選擇要套用的資料集（也可以當場上傳新的 Excel），
// 預覽欄位遺失狀況，確認後以新的 id 建立儀表板並開啟。

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { DashboardExport } from '../../utils/dashboardTransfer.ts';
import { instantiateImport } from '../../utils/dashboardTransfer.ts';
import { findIssues, rebindDashboard } from '../../utils/rebind.ts';
import { WorkbookActions } from '../datasets/WorkbookActions.tsx';
import { IssueList } from './IssueList.tsx';

type Props = { data: DashboardExport | null; onClose: () => void };

export function ImportDashboardDialog({ data, onClose }: Props) {
  const datasets = useAppStore((s) => s.datasets);
  const addDashboard = useAppStore((s) => s.addDashboard);
  const setActiveDashboard = useAppStore((s) => s.setActiveDashboard);
  const navigate = useUiStore((s) => s.navigate);
  const [datasetId, setDatasetId] = useState('');
  const selectedId = datasetId || datasets.at(-1)?.id || '';
  const dataset = datasets.find((d) => d.id === selectedId);
  // 預覽只做比對、不產生新 id；id 在按下「匯入」時才產生，避免在 render 中產生亂數。
  const issues =
    data && dataset ? findIssues(rebindDashboard(data.dashboard, dataset), dataset) : [];

  const handleImport = () => {
    if (!data || !dataset) return;
    const dashboard = instantiateImport(data, dataset);
    addDashboard(dashboard);
    setActiveDashboard(dashboard.id);
    setDatasetId('');
    onClose();
    navigate('dashboard');
  };

  return (
    <Dialog open={data !== null} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>匯入儀表板「{data?.dashboard.name}」</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            匯出檔只包含設定，不含資料。請選擇要套用的資料集，系統會檢查欄位是否齊全。
          </DialogContentText>
          {datasets.length === 0 ? (
            <Alert severity='info'>目前沒有資料集，請先上傳相符的 Excel。</Alert>
          ) : (
            <TextField
              select
              label='套用到資料集'
              value={selectedId}
              onChange={(e) => setDatasetId(e.target.value)}
            >
              {datasets.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}（{d.fileName}）
                </MenuItem>
              ))}
            </TextField>
          )}
          <WorkbookActions showSample={false} stayOnPage />
          {data && dataset && <IssueList issues={issues} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant='contained' disabled={!dataset} onClick={handleImport}>
          匯入
        </Button>
      </DialogActions>
    </Dialog>
  );
}
