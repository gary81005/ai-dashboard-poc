// 「切換資料來源」對話框（ADR 0003）：選一個新的資料集，先預覽哪些元件會欄位遺失，
// 確認後把儀表板綁到新資料集，並把舊資料集上手動調整過的欄位角色沿用過去。

import { useState } from 'react';
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
import type { Dashboard } from '../../types/index.ts';
import { carryOverrides, findIssues, rebindDashboard } from '../../utils/rebind.ts';
import { IssueList } from '../dashboards/IssueList.tsx';

type Props = { dashboard: Dashboard; open: boolean; onClose: () => void };

export function RebindDialog({ dashboard, open, onClose }: Props) {
  const datasets = useAppStore((s) => s.datasets);
  const replaceDashboard = useAppStore((s) => s.replaceDashboard);
  const replaceDataset = useAppStore((s) => s.replaceDataset);
  const candidates = datasets.filter((d) => d.id !== dashboard.datasetId);
  const [targetId, setTargetId] = useState('');
  const target = candidates.find((d) => d.id === targetId);
  const current = datasets.find((d) => d.id === dashboard.datasetId);

  const handleConfirm = () => {
    if (!target) return;
    const next = current ? carryOverrides(current, target) : target;
    if (next !== target) replaceDataset(next);
    replaceDashboard(rebindDashboard(dashboard, next));
    setTargetId('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>切換資料來源</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            例如換成下個月的報表。系統會依資料表名稱與欄位名稱（或欄位代碼）重新對應，資料集上手動調整過的欄位角色也會一併沿用。
          </DialogContentText>
          {candidates.length === 0 ? (
            <DialogContentText color='warning.main'>
              目前沒有其他資料集。請先到「資料集」頁上傳新的 Excel。
            </DialogContentText>
          ) : (
            <TextField
              select
              label='新的資料集'
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {candidates.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}（{d.fileName}）
                </MenuItem>
              ))}
            </TextField>
          )}
          {target && <IssueList issues={findIssues(dashboard, target)} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant='contained' disabled={!target} onClick={handleConfirm}>
          切換
        </Button>
      </DialogActions>
    </Dialog>
  );
}
