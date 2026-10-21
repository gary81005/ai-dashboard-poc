// 空白儀表板上的「產生建議內容」（ADR 0010 §6 ⑦）：選主資料表後產生元件、版面與儀表板篩選。
// 和其他修改一樣只存在記憶體，按「儲存」才寫入，不滿意可以「捨棄變更」。
// 儀表板已經設定了篩選時保留原本的，不換成建議的。

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { useAppStore } from '../../store/appStore.ts';
import type { Dashboard, Dataset, DatasetRows } from '../../types/index.ts';
import { mainTableOptions, suggestDashboard } from '../../utils/suggestDashboard.ts';
import { MainTableField } from '../dashboards/MainTableField.tsx';

type Props = { dashboard: Dashboard; dataset: Dataset; rows: DatasetRows };

export function SuggestDashboardButton({ dashboard, dataset, rows }: Props) {
  const replaceDashboard = useAppStore((s) => s.replaceDashboard);
  const [open, setOpen] = useState(false);
  const [tableKey, setTableKey] = useState('');
  const options = mainTableOptions(dataset, rows);
  const selected = options.find((o) => o.table.key === tableKey) ?? options[0];

  const generate = () => {
    if (!selected) return;
    const { widgets, layout, filters } = suggestDashboard(dataset, rows, selected.table.key);
    replaceDashboard({
      ...dashboard,
      widgets,
      layout,
      filters: dashboard.filters?.length ? dashboard.filters : filters,
    });
    setOpen(false);
  };

  return (
    <>
      <Button color='inherit' size='small' onClick={() => setOpen(true)}>
        產生建議內容
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth='xs'>
        <DialogTitle>產生建議內容</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              依主資料表的欄位，自動產生 KPI 卡、趨勢、長條、排行與明細表等元件（最多 12
              個）和儀表板篩選。產生後可以再調整，按「儲存」才會寫入。
            </DialogContentText>
            {selected ? (
              <MainTableField options={options} value={selected.table.key} onChange={setTableKey} />
            ) : (
              <DialogContentText>
                這個資料集沒有含數值欄位的資料表，無法產生建議內容。
              </DialogContentText>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant='contained' disabled={!selected} onClick={generate}>
            產生
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
