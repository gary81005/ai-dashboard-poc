// 一張元件卡片要顯示的內容：用哪張資料表、篩選摘要、略過的儀表板篩選、圖表結果。
//
// WidgetCard 每次 render 當場算；分享結果（utils/shareSnapshot.ts）用同一個函式算好存起來（ADR 0012），
// 兩邊顯示的內容才會一致。查詢用的篩選 = widget 自己的篩選 + 儀表板篩選裡這張資料表有對應欄位的部分（ADR 0008）。

import type {
  DashboardFilter,
  Dataset,
  DatasetRows,
  DataTable,
  Row,
  Widget,
} from '../types/index.ts';
import { computeWidget } from './computeWidget.ts';
import type { WidgetResult } from './computeWidget.ts';
import { filtersForTable } from './dashboardFilters.ts';
import type { SelectedValues } from './dashboardFilters.ts';
import { findTable, resolveField } from './fields.ts';
import { labelOf, withRawValues } from './valueLabels.ts';
import { activeFilters, hasAnyField } from './widgetEditing.ts';

export type WidgetView = {
  // 套用「顯示原始值」之後的資料表與它的資料列；資料表不在資料集中時是 undefined。
  table?: DataTable;
  tableRows?: Row[];
  // 元件篩選的摘要，例如「門市：A、B」；沒有生效中的篩選時是空字串。
  filterSummary: string;
  // 這張資料表沒有對應欄位、因此沒套用的儀表板篩選。
  skipped: string[];
  // 文字元件不查詢資料，是 null。
  result: WidgetResult | null;
};

export function widgetView(
  widget: Widget,
  dataset: Dataset,
  rows: DatasetRows,
  options: {
    dashboardFilters?: readonly DashboardFilter[];
    filterValues?: SelectedValues;
    editing?: boolean;
  } = {},
): WidgetView {
  const { dashboardFilters = [], filterValues = {}, editing = false } = options;
  const sourceTable = findTable(dataset, widget.table);
  // 選了「顯示原始值」的元件：整張表停用值標籤後再查詢、篩選與顯示（ADR 0011）。
  const table = sourceTable && widget.rawValues ? withRawValues(sourceTable) : sourceTable;
  const tableRows = table ? rows[table.key] : undefined;

  const filterSummary = activeFilters(widget)
    .map((f) => {
      const field = table && resolveField(table, f.field);
      const values = f.values.map((v) => (field ? labelOf(field, String(v)) : String(v)));
      return `${f.field.header}：${values.join('、')}`;
    })
    .join('・');
  const { applied, skipped } = table
    ? filtersForTable(table, dashboardFilters, filterValues)
    : { applied: [], skipped: [] };

  let result: WidgetResult | null;
  if (widget.type === 'text') {
    result = null;
  } else if (!hasAnyField(widget)) {
    result = {
      status: 'message',
      tone: 'muted',
      message: editing ? '把右側欄位清單的欄位拖到元件設定的放置區' : '尚未設定欄位',
    };
  } else if (table && tableRows) {
    result = computeWidget(widget, {
      table,
      rows: tableRows,
      filters: [...widget.filters, ...applied],
    });
  } else {
    result = {
      status: 'message',
      tone: 'error',
      message: `資料表「${widget.table}」不在目前的資料集中，請重新指定`,
    };
  }
  return { table, tableRows, filterSummary, skipped, result };
}
