// 編輯模式的「元件設定」面板：標題、圖表類型、資料表資訊、各槽位、篩選、樣式選項、刪除。
//
// 每次修改都立即寫回 store（updateWidget），格線上的圖表會同步更新。

import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { WIDGET_SLOTS, WIDGET_TYPE_LABELS, WIDGET_TYPES } from '../../constants/widgetTypes.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard, Dataset, DatasetRows, Widget, WidgetType } from '../../types/index.ts';
import { findTable } from '../../utils/fields.ts';
import { clearWidget, convertWidget, hasAnyField } from '../../utils/widgetEditing.ts';
import { FilterShelf } from './FilterShelf.tsx';
import { Shelf } from './Shelf.tsx';
import { WidgetOptions } from './WidgetOptions.tsx';

type Props = {
  dashboard: Dashboard;
  widget: Widget;
  dataset: Dataset;
  rows: DatasetRows;
};

export function WidgetEditor({ dashboard, widget, dataset, rows }: Props) {
  const updateWidget = useAppStore((s) => s.updateWidget);
  const removeWidget = useAppStore((s) => s.removeWidget);
  const selectWidget = useUiStore((s) => s.selectWidget);
  const table = findTable(dataset, widget.table);
  const save = (next: Widget) => updateWidget(dashboard.id, next);

  const handleRemove = () => {
    selectWidget(null);
    removeWidget(dashboard.id, widget.id);
  };

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction='row' sx={{ alignItems: 'center' }}>
          <Typography variant='subtitle1' component='h3' sx={{ fontWeight: 600, flex: 1 }}>
            元件設定
          </Typography>
          <Button size='small' onClick={() => selectWidget(null)}>
            關閉
          </Button>
        </Stack>

        <TextField
          size='small'
          label='標題'
          value={widget.title}
          onChange={(e) => save({ ...widget, title: e.target.value })}
        />
        <TextField
          select
          size='small'
          label='圖表類型'
          value={widget.type}
          onChange={(e) => save(convertWidget(widget, e.target.value as WidgetType))}
        >
          {WIDGET_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {WIDGET_TYPE_LABELS[type]}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>
            資料表：
            {hasAnyField(widget)
              ? (table?.sheetName ?? `「${widget.table}」（不在目前的資料集中）`)
              : '拖入第一個欄位時決定'}
          </Typography>
          {hasAnyField(widget) && (
            <Button size='small' onClick={() => save(clearWidget(widget))}>
              清空欄位
            </Button>
          )}
        </Stack>

        <Divider />
        {WIDGET_SLOTS[widget.type].map((slot) => (
          <Shelf key={slot.key} widget={widget} slot={slot} dataset={dataset} onChange={save} />
        ))}
        <FilterShelf widget={widget} dataset={dataset} rows={rows} onChange={save} />
        <WidgetOptions widget={widget} onChange={save} />

        <Divider />
        <Button color='error' onClick={handleRemove}>
          刪除這個元件
        </Button>
      </Stack>
    </Paper>
  );
}
