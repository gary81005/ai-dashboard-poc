// 「新增儀表板」對話框：輸入名稱、選資料集（預設是最新上傳的），建立後直接進入編輯模式。
//
// 「自動產生建議內容」（預設勾選，ADR 0010 §6 ⑦）：讀取資料集的資料列，依主資料表產生元件、
// 版面與儀表板篩選，和儀表板一起建立。資料列讀取失敗或沒有可用的資料表時建立空白儀表板。

import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { createDashboard } from '../../services/dashboardService.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useRowsStore } from '../../store/rowsStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard } from '../../types/index.ts';
import { createId } from '../../utils/ids.ts';
import { mainTableOptions, suggestDashboard } from '../../utils/suggestDashboard.ts';
import { MainTableField } from './MainTableField.tsx';

type Props = { open: boolean; onClose: () => void };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function CreateDashboardDialog({ open, onClose }: Props) {
  const datasets = useAppStore((s) => s.datasets);
  const setActiveDashboard = useAppStore((s) => s.setActiveDashboard);
  const navigate = useUiStore((s) => s.navigate);
  const setEditing = useUiStore((s) => s.setEditing);
  const notify = useUiStore((s) => s.notify);
  const loadRows = useRowsStore((s) => s.load);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [suggest, setSuggest] = useState(true);
  const [tableKey, setTableKey] = useState('');
  const selectedId = datasetId || datasets.at(-1)?.id || '';
  const dataset = datasets.find((d) => d.id === selectedId);
  const entry = useRowsStore((s) => (dataset ? s.byDataset[dataset.id] : undefined));
  const rows = entry?.status === 'ready' ? entry.rows : undefined;
  const options = dataset && rows ? mainTableOptions(dataset, rows) : [];
  // 換了資料集、選過的表不在新的選項裡時，回到預設的主資料表。
  const mainTable = options.find((o) => o.table.key === tableKey) ?? options[0];
  const waitingRows =
    suggest && dataset !== undefined && entry?.status !== 'ready' && entry?.status !== 'error';

  // 勾選產生建議內容時才讀取資料列；rowsStore 已經有的不會重讀。
  useEffect(() => {
    if (open && suggest && dataset) void loadRows(dataset);
  }, [open, suggest, dataset, loadRows]);

  // 勾選產生建議內容時，依資料列的讀取狀態顯示主資料表選單、讀取中或無法產生的原因。
  const suggestStatus = waitingRows ? (
    <Stack spacing={1}>
      <Typography variant='caption' color='text.secondary'>
        讀取資料中…
      </Typography>
      <LinearProgress />
    </Stack>
  ) : entry?.status === 'error' ? (
    <Typography variant='caption' color='error'>
      讀取資料失敗，會建立空白儀表板：{entry.message}
    </Typography>
  ) : mainTable ? (
    <MainTableField options={options} value={mainTable.table.key} onChange={setTableKey} />
  ) : (
    <Typography variant='caption' color='text.secondary'>
      這個資料集沒有含數值欄位的資料表，會建立空白儀表板。
    </Typography>
  );

  const handleCreate = async () => {
    const suggestion =
      suggest && dataset && rows && mainTable
        ? suggestDashboard(dataset, rows, mainTable.table.key)
        : undefined;
    const dashboard: Dashboard = {
      id: createId('db'),
      name: name.trim() || '未命名儀表板',
      datasetId: selectedId,
      updatedAt: new Date().toISOString(),
      layout: suggestion?.layout ?? [],
      widgets: suggestion?.widgets ?? [],
      ...(suggestion && suggestion.filters.length > 0 && { filters: suggestion.filters }),
    };
    // try 裡只放 await，也不用 finally：React Compiler 不支援 try 裡的條件運算式與 finally，
    // 寫了整個元件就不做記憶化。
    setCreating(true);
    let failure: unknown;
    try {
      await createDashboard(dashboard);
    } catch (error) {
      failure = error;
    }
    setCreating(false);
    if (failure !== undefined) {
      notify({ severity: 'error', message: errorMessage(failure) });
      return;
    }
    setActiveDashboard(dashboard.id);
    setName('');
    setDatasetId('');
    setTableKey('');
    setSuggest(true);
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
            <FormControlLabel
              control={
                <Checkbox checked={suggest} onChange={(e) => setSuggest(e.target.checked)} />
              }
              label='自動產生建議內容'
            />
            {suggest && suggestStatus}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant='contained'
          disabled={!selectedId || waitingRows}
          loading={creating}
          onClick={() => void handleCreate()}
        >
          建立並開始編輯
        </Button>
      </DialogActions>
    </Dialog>
  );
}
