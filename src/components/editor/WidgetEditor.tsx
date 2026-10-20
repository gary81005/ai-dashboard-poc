// 編輯模式的「元件設定」面板：標題、說明、圖表類型（選單附用途說明）、資料表資訊、各槽位、篩選、樣式選項、刪除。
// 文字元件不綁資料表，只有內容輸入框（ADR 0008）。
//
// 每次修改都立即寫回 store（updateWidget），格線上的圖表會同步更新。

import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  WIDGET_SLOTS,
  WIDGET_TYPE_LABELS,
  WIDGET_TYPES,
  widgetTypeGuideText,
} from '../../constants/widgetTypes.ts';
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
          size='small'
          label='說明（顯示在標題下方）'
          placeholder='例如：業績預估 ÷ 業績目標'
          multiline
          minRows={1}
          maxRows={4}
          value={widget.description ?? ''}
          onChange={(e) => {
            // 清空時移除欄位，而不是存成空字串，讓設定 JSON 保持精簡。
            const next: Widget = { ...widget };
            if (e.target.value) next.description = e.target.value;
            else delete next.description;
            save(next);
          }}
        />
        <TextField
          select
          size='small'
          label='圖表類型'
          value={widget.type}
          onChange={(e) => save(convertWidget(widget, e.target.value as WidgetType))}
          // 選單裡附用途說明，選定後欄位裡只顯示名稱。
          slotProps={{
            select: { renderValue: (value) => WIDGET_TYPE_LABELS[value as WidgetType] },
          }}
        >
          {WIDGET_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              <ListItemText
                primary={WIDGET_TYPE_LABELS[type]}
                secondary={widgetTypeGuideText(type)}
              />
            </MenuItem>
          ))}
        </TextField>

        {widget.type === 'text' ? (
          <TextField
            label='內容'
            placeholder='區塊說明、計算口徑、指標定義…'
            multiline
            minRows={6}
            value={widget.content}
            onChange={(e) => save({ ...widget, content: e.target.value })}
          />
        ) : (
          <DataSettings widget={widget} dataset={dataset} rows={rows} onChange={save} />
        )}

        <Divider />
        <Button color='error' onClick={handleRemove}>
          刪除這個元件
        </Button>
      </Stack>
    </Paper>
  );
}

type DataSettingsProps = {
  widget: Widget;
  dataset: Dataset;
  rows: DatasetRows;
  onChange: (widget: Widget) => void;
};

// 圖表類元件的資料設定：資料表、槽位、篩選、樣式。
function DataSettings({ widget, dataset, rows, onChange: save }: DataSettingsProps) {
  const table = findTable(dataset, widget.table);
  return (
    <>
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
      <WidgetOptions widget={widget} table={table} onChange={save} />
    </>
  );
}
