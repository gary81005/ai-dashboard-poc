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
import { createDashboard } from '../../services/dashboardService.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { DashboardExport } from '../../utils/dashboardTransfer.ts';
import { instantiateImport } from '../../utils/dashboardTransfer.ts';
import { findIssues, findMissingFilters, rebindDashboard } from '../../utils/rebind.ts';
import { WorkbookActions } from '../datasets/WorkbookActions.tsx';
import { IssueList } from './IssueList.tsx';

type Props = { data: DashboardExport | null; onClose: () => void };

export function ImportDashboardDialog({ data, onClose }: Props) {
  const datasets = useAppStore((s) => s.datasets);
  const setActiveDashboard = useAppStore((s) => s.setActiveDashboard);
  const navigate = useUiStore((s) => s.navigate);
  const notify = useUiStore((s) => s.notify);
  const [importing, setImporting] = useState(false);
  const [datasetId, setDatasetId] = useState('');
  const selectedId = datasetId || datasets.at(-1)?.id || '';
  const dataset = datasets.find((d) => d.id === selectedId);
  // 預覽只做比對、不產生新 id；id 在按下「匯入」時才產生，避免在 render 中產生亂數。
  const preview = data && dataset ? rebindDashboard(data.dashboard, dataset) : undefined;

  const handleImport = async () => {
    if (!data || !dataset) return;
    const dashboard = instantiateImport(data, dataset);
    setImporting(true);
    try {
      await createDashboard(dashboard);
    } catch (error) {
      notify({
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    } finally {
      setImporting(false);
    }
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
          {preview && dataset && (
            <IssueList
              issues={findIssues(preview, dataset)}
              missingFilters={findMissingFilters(preview, dataset)}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant='contained'
          disabled={!dataset}
          loading={importing}
          onClick={() => void handleImport()}
        >
          匯入
        </Button>
      </DialogActions>
    </Dialog>
  );
}
