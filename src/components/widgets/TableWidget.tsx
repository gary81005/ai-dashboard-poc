// 資料表格（MUI X Data Grid）：明細或分組摘要由 queryTable 決定；數字欄位依欄位格式顯示並靠右對齊。
//
// 樣式選項（ADR 0008）：比率欄位依門檻變色、低於門檻的整列標色、預設依第一個數值欄排序、
// 在表格底部顯示合計（合計列和分組用同一套彙總規則，比率欄位是加權比率）。

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataGrid, GridFooterContainer, GridPagination } from '@mui/x-data-grid';
import type { GridColDef, GridSlotProps } from '@mui/x-data-grid';
import { formatValue } from '../../utils/format.ts';
import { queryTable } from '../../utils/query.ts';
import type { QueryContext, TableResultColumn } from '../../utils/query.ts';
import type { CellValue, TableWidget as TableWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { toneOf } from '../../utils/thresholds.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

declare module '@mui/x-data-grid' {
  interface FooterPropsOverrides {
    totals?: string;
  }
}

type Props = { widget: TableWidgetConfig; ctx: QueryContext };

const isNumeric = (c: TableResultColumn) => c.agg !== undefined || c.field.role === 'measure';
const format = (c: TableResultColumn, value: number | null) =>
  formatValue(c.field, c.agg ?? 'sum', value);

export function TableWidget({ widget, ctx }: Props) {
  const { columns } = widget.encoding;
  if (columns.length === 0) return <WidgetMessage>請放入至少一個欄位</WidgetMessage>;

  const outcome = runQuery(() => queryTable(ctx, columns));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  const options = widget.options;
  const thresholds = options?.thresholds;
  // 門檻只套用在比率欄位（達成率、覆蓋率、健康度…）。
  const toned = new Set(
    thresholds ? result.columns.filter((c) => c.field.ratio).map((c) => c.key) : [],
  );

  const gridColumns: GridColDef[] = result.columns.map((c) => ({
    field: c.key,
    headerName: c.label,
    flex: 1,
    minWidth: 110,
    type: isNumeric(c) ? 'number' : 'string',
    valueFormatter: (value: CellValue) => (typeof value === 'number' ? format(c, value) : value),
    ...(toned.has(c.key)
      ? {
          renderCell: ({ value, formattedValue }) => {
            const tone = toneOf(numberOrNull(value), thresholds);
            return (
              <Box
                component='span'
                sx={{ color: tone ? `${tone}.main` : 'inherit', fontWeight: 600 }}
              >
                {formattedValue}
              </Box>
            );
          },
        }
      : {}),
  }));
  const rows = result.rows.map((row, index) => ({ id: index, ...row }));

  const sortKey = options?.sort ? result.columns.find(isNumeric)?.key : undefined;
  const totals = options?.totals
    ? result.columns
        .filter((c) => result.totals[c.key] !== null)
        .map((c) => `${c.label} ${format(c, result.totals[c.key])}`)
        .join('・')
    : undefined;

  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <DataGrid
        rows={rows}
        columns={gridColumns}
        density='compact'
        disableRowSelectionOnClick
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          ...(sortKey && options?.sort
            ? { sorting: { sortModel: [{ field: sortKey, sort: options.sort }] } }
            : {}),
        }}
        getRowClassName={({ row }) =>
          options?.highlightRows &&
          [...toned].some((key) => toneOf(numberOrNull(row[key]), thresholds) === 'error')
            ? 'row-warn'
            : ''
        }
        slots={totals !== undefined ? { footer: TotalsFooter } : undefined}
        slotProps={totals !== undefined ? { footer: { totals } } : undefined}
        sx={{
          height: '100%',
          border: 0,
          '& .row-warn': { bgcolor: 'rgba(var(--mui-palette-error-mainChannel) / 0.08)' },
        }}
      />
    </ChartArea>
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

// 取代預設頁尾：左邊是合計，右邊保留分頁。
function TotalsFooter({ totals, ...props }: GridSlotProps['footer']) {
  return (
    <GridFooterContainer {...props}>
      <Typography
        variant='body2'
        noWrap
        title={totals}
        sx={{ px: 1.5, fontWeight: 600, minWidth: 0, flex: 1 }}
      >
        合計：{totals || '—'}
      </Typography>
      <GridPagination />
    </GridFooterContainer>
  );
}
