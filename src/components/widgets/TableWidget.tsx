// 資料表格（MUI X Data Grid）：明細或分組摘要由 queryTable 決定；數字欄位依欄位格式顯示並靠右對齊。

import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { formatValue } from '../../utils/format.ts';
import { queryTable } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { CellValue, TableWidget as TableWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: TableWidgetConfig; ctx: QueryContext };

export function TableWidget({ widget, ctx }: Props) {
  const { columns } = widget.encoding;
  if (columns.length === 0) return <WidgetMessage>請放入至少一個欄位</WidgetMessage>;

  const outcome = runQuery(() => queryTable(ctx, columns));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;

  const gridColumns: GridColDef[] = result.columns.map((c) => {
    const numeric = c.agg !== undefined || c.field.role === 'measure';
    return {
      field: c.key,
      headerName: c.label,
      flex: 1,
      minWidth: 110,
      type: numeric ? 'number' : 'string',
      valueFormatter: (value: CellValue) =>
        typeof value === 'number' ? formatValue(c.field, c.agg ?? 'sum', value) : value,
    };
  });
  const rows = result.rows.map((row, index) => ({ id: index, ...row }));

  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <DataGrid
        rows={rows}
        columns={gridColumns}
        density='compact'
        disableRowSelectionOnClick
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        sx={{ height: '100%', border: 0 }}
      />
    </ChartArea>
  );
}
