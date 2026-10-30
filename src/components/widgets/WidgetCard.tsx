// 格線上的一格：標題列（標題、篩選按鈕、編輯模式的刪除）、說明、生效中的篩選摘要、圖表本體。
//
// 要顯示的內容（資料表、篩選摘要、圖表結果，含「還沒設定欄位」「資料表不在資料集中」的提示）
// 由 utils/widgetView.ts 算出，分享結果也用同一個函式（ADR 0012）。
// 編輯模式下標題是 react-grid-layout 的拖曳把手（.widget-drag-handle），點擊卡片會選取這個元件；
// 有警告時標題旁加 ⚠（ADR 0010 §7 ⑤，內容與「改用建議」在元件設定面板）。

import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { DashboardFilter, Dataset, DatasetRows, Widget } from '../../types/index.ts';
import type { SelectedValues } from '../../utils/dashboardFilters.ts';
import { profilesOf } from '../../utils/fieldKinds.ts';
import { checkWidget } from '../../utils/widgetChecks.ts';
import { hasAnyField } from '../../utils/widgetEditing.ts';
import { widgetView } from '../../utils/widgetView.ts';
import { WidgetBody } from './WidgetBody.tsx';
import { WidgetFilterControl } from './WidgetFilterControl.tsx';
import { TextWidget } from './TextWidget.tsx';

type Props = {
  widget: Widget;
  dataset: Dataset;
  rows: DatasetRows;
  dashboardFilters?: DashboardFilter[];
  filterValues?: SelectedValues;
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
  dashboardFilters = [],
  filterValues = {},
  editing,
  selected,
  onSelect,
  onRemove,
  onChange,
}: Props) {
  const { table, tableRows, filterSummary, skipped, result } = widgetView(widget, dataset, rows, {
    dashboardFilters,
    filterValues,
    editing,
  });
  // 只在編輯模式檢查；檢視模式不顯示警告。
  const problems =
    editing && table && tableRows
      ? checkWidget(widget, table, tableRows, profilesOf(table, tableRows)).warnings.filter(
          (w) => w.level === 'warning',
        )
      : [];

  const body =
    widget.type === 'text' ? (
      <TextWidget widget={widget} editing={editing} />
    ) : (
      result && <WidgetBody widget={widget} result={result} />
    );

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
        {problems.length > 0 && (
          <Typography
            color='warning'
            title={problems.map((w) => w.message).join('\n')}
            aria-label={`${problems.length} 個警告`}
          >
            ⚠
          </Typography>
        )}
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
      {widget.description && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mt: -1, whiteSpace: 'pre-line', lineHeight: 1.5 }}
        >
          {widget.description}
        </Typography>
      )}
      {filterSummary && (
        <Typography
          variant='caption'
          color='text.accent'
          noWrap
          title={filterSummary}
          sx={{ mt: -1 }}
        >
          篩選：{filterSummary}
        </Typography>
      )}
      {skipped.length > 0 && widget.type !== 'text' && (
        <Typography variant='caption' color='warning' noWrap sx={{ mt: -1 }}>
          未套用儀表板篩選：{skipped.join('、')}（這張資料表沒有這個欄位）
        </Typography>
      )}
      {body}
    </Paper>
  );
}
