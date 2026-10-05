// 「新增儀表板」對話框：輸入名稱、選資料集（預設是最新上傳的），建立後直接進入編輯模式。

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
import { useUiStore } from '../../store/uiStore.ts';
import { createId } from '../../utils/ids.ts';

type Props = { open: boolean; onClose: () => void };

export function CreateDashboardDialog({ open, onClose }: Props) {
  const datasets = useAppStore((s) => s.datasets);
  const addDashboard = useAppStore((s) => s.addDashboard);
  const setActiveDashboard = useAppStore((s) => s.setActiveDashboard);
  const navigate = useUiStore((s) => s.navigate);
  const setEditing = useUiStore((s) => s.setEditing);
  const [name, setName] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const selectedId = datasetId || datasets.at(-1)?.id || '';

  const handleCreate = () => {
    const id = createId('db');
    addDashboard({
      id,
      name: name.trim() || '未命名儀表板',
      datasetId: selectedId,
      updatedAt: new Date().toISOString(),
      layout: [],
      widgets: [],
    });
    setActiveDashboard(id);
    setName('');
    setDatasetId('');
    onClose();
    navigate('dashboard');
    setEditing(true);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='xs'>
      <DialogTitle>新增儀表板</DialogTitle>
      <DialogContent>
        {datasets.length === 0 ? (
          <DialogContentText>請先到「資料集」頁上傳 Excel，或載入範例資料。</DialogContentText>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label='名稱'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='例如：北區營運週報'
            />
            <TextField
              select
              label='資料集'
              value={selectedId}
              onChange={(e) => setDatasetId(e.target.value)}
            >
              {datasets.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant='contained' disabled={!selectedId} onClick={handleCreate}>
          建立並開始編輯
        </Button>
      </DialogActions>
    </Dialog>
  );
}
