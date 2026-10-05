// 格線上的一格：標題列（標題、篩選按鈕、編輯模式的刪除）、生效中的篩選摘要、圖表本體。
//
// 也負責處理「還沒設定欄位」和「資料表不在資料集中」兩種狀況。
// 編輯模式下標題是 react-grid-layout 的拖曳把手（.widget-drag-handle），點擊卡片會選取這個元件。

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Dataset, DatasetRows, Widget } from '../../types/index.ts';
import { findTable } from '../../utils/fields.ts';
import { activeFilters, hasAnyField } from '../../utils/widgetEditing.ts';
import { WidgetBody } from './WidgetBody.tsx';
import { WidgetFilterControl } from './WidgetFilterControl.tsx';
import { WidgetMessage } from './WidgetParts.tsx';

type Props = {
  widget: Widget;
  dataset: Dataset;
  rows: DatasetRows;
  editing?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  onChange?: (widget: Widget) => void;
};

export function WidgetCard({
  widget,
  dataset,
  rows,
  editing,
  selected,
  onSelect,
  onRemove,
  onChange,
}: Props) {
  const table = findTable(dataset, widget.table);
  const tableRows = table ? rows[table.key] : undefined;

  const filterSummary = activeFilters(widget)
    .map((f) => `${f.field.header}：${f.values.join('、')}`)
    .join('・');

  let body;
  if (!hasAnyField(widget)) {
    body = (
      <WidgetMessage>
        {editing ? '把右側欄位清單的欄位拖到元件設定的槽位' : '尚未設定欄位'}
      </WidgetMessage>
    );
  } else if (table && tableRows) {
    body = <WidgetBody widget={widget} ctx={{ table, rows: tableRows, filters: widget.filters }} />;
  } else {
    body = (
      <WidgetMessage tone='error'>
        資料表「{widget.table}」不在目前的資料集中，請重新指定
      </WidgetMessage>
    );
  }

  return (
    <Paper
      variant='outlined'
      onClick={editing ? onSelect : undefined}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        gap: 1,
        overflow: 'hidden',
        borderColor: selected ? 'primary.main' : undefined,
        borderWidth: selected ? 2 : undefined,
        cursor: editing ? 'pointer' : undefined,
      }}
    >
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <Typography
          className='widget-drag-handle'
          variant='subtitle1'
          component='h3'
          noWrap
          title={editing ? '拖動標題可移動元件' : undefined}
          sx={{ fontWeight: 600, flex: 1, cursor: editing ? 'move' : undefined }}
        >
          {widget.title || '未命名'}
        </Typography>
        {table && tableRows && hasAnyField(widget) && onChange && (
          <WidgetFilterControl widget={widget} table={table} rows={tableRows} onChange={onChange} />
        )}
        {editing && (
          <Button
            size='small'
            color='error'
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
          >
            刪除
          </Button>
        )}
      </Stack>
      {filterSummary && (
        <Typography variant='caption' color='primary' noWrap title={filterSummary} sx={{ mt: -1 }}>
          篩選：{filterSummary}
        </Typography>
      )}
      {body}
    </Paper>
  );
}
