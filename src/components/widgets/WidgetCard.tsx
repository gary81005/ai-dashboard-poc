// 格線上的一格（擁有者的畫面）：算出要顯示的內容，交給 WidgetFrame 畫外框。
//
// 要顯示的內容（資料表、篩選摘要、圖表結果，含「還沒設定欄位」「資料表不在資料集中」的提示）
// 由 utils/widgetView.ts 算出，分享結果也用同一個函式（ADR 0012）。
// 這裡另外負責編輯模式的檢查警告、篩選按鈕與刪除按鈕。

import Button from '@mui/material/Button';
import type { DashboardFilter, Dataset, DatasetRows, Widget } from '../../types/index.ts';
import type { SelectedValues } from '../../utils/dashboardFilters.ts';
import { profilesOf } from '../../utils/fieldKinds.ts';
import { checkWidget } from '../../utils/widgetChecks.ts';
import { hasAnyField } from '../../utils/widgetEditing.ts';
import { widgetView } from '../../utils/widgetView.ts';
import { WidgetBody } from './WidgetBody.tsx';
import { WidgetFilterControl } from './WidgetFilterControl.tsx';
import { WidgetFrame } from './WidgetFrame.tsx';
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
    <WidgetFrame
      title={widget.title}
      description={widget.description}
      filterSummary={filterSummary}
      skipped={widget.type === 'text' ? [] : skipped}
      warnings={problems.map((w) => w.message)}
      editing={editing}
      selected={selected}
      onSelect={onSelect}
      actions={
        <>
          {table && tableRows && hasAnyField(widget) && onChange && (
            <WidgetFilterControl
              widget={widget}
              table={table}
              rows={tableRows}
              onChange={onChange}
            />
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
        </>
      }
    >
      {body}
    </WidgetFrame>
  );
}
