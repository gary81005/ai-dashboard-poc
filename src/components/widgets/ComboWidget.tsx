// 組合圖：用 MUI X 的組合 API（ChartsDataProvider + BarPlot + LinePlot）手動拼出長條 + 折線。
//
// 長條與折線共用 X 軸，每個量值各自選擇左軸或右軸；只畫有被用到的 Y 軸。

import { BarPlot } from '@mui/x-charts/BarChart';
import { ChartsAxisHighlight } from '@mui/x-charts/ChartsAxisHighlight';
import { ChartsDataProvider } from '@mui/x-charts/ChartsDataProvider';
import { ChartsLegend } from '@mui/x-charts/ChartsLegend';
import { ChartsSurface } from '@mui/x-charts/ChartsSurface';
import { ChartsTooltip } from '@mui/x-charts/ChartsTooltip';
import { ChartsWrapper } from '@mui/x-charts/ChartsWrapper';
import { ChartsXAxis } from '@mui/x-charts/ChartsXAxis';
import { ChartsYAxis } from '@mui/x-charts/ChartsYAxis';
import { LinePlot, MarkPlot } from '@mui/x-charts/LineChart';
import { formatCompact, formatValue } from '../../utils/format.ts';
import { queryCategorical } from '../../utils/query.ts';
import type { QueryContext, ResolvedMeasure } from '../../utils/query.ts';
import type { ComboWidget as ComboWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: ComboWidgetConfig; ctx: QueryContext };

export function ComboWidget({ widget, ctx }: Props) {
  const { x, y } = widget.encoding;
  if (!x || y.length === 0)
    return <WidgetMessage>請設定 X 軸，並放入至少一個數值欄位</WidgetMessage>;

  const outcome = runQuery(() =>
    queryCategorical(
      ctx,
      x.field,
      y.map(({ field, agg }) => ({ field, agg })),
    ),
  );
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  if (result.categories.length === 0) return <WidgetMessage>沒有符合條件的資料</WidgetMessage>;

  const stacked = widget.options?.stacked === true;
  const series = result.series.map((s) => {
    const { mark, axis } = y[s.measureIndex];
    const common = {
      id: s.id,
      label: s.label,
      data: s.data,
      yAxisId: axis,
      valueFormatter: (v: number | null) => formatValue(s.measure.field, s.measure.agg, v),
    };
    return mark === 'bar'
      ? { ...common, type: 'bar' as const, ...(stacked ? { stack: 'bars' } : {}) }
      : { ...common, type: 'line' as const, connectNulls: true };
  });

  const axisMeasure = (side: 'left' | 'right'): ResolvedMeasure | undefined =>
    result.series.find((s) => y[s.measureIndex].axis === side)?.measure;
  const yAxes = (['left', 'right'] as const).flatMap((side) => {
    const measure = axisMeasure(side);
    return measure
      ? [
          {
            id: side,
            position: side,
            width: 'auto' as const,
            valueFormatter: (v: number) => formatCompact(measure.field, measure.agg, v),
          },
        ]
      : [];
  });

  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <ChartsDataProvider
        series={series}
        xAxis={[{ id: 'x', scaleType: 'band', data: result.categories, height: 'auto' }]}
        yAxis={yAxes}
      >
        <ChartsWrapper
          legendPosition={{ vertical: 'top', horizontal: 'center' }}
          sx={{ height: '100%' }}
        >
          <ChartsLegend />
          <ChartsSurface>
            <BarPlot />
            <LinePlot />
            <MarkPlot />
            <ChartsAxisHighlight x='band' />
            <ChartsXAxis axisId='x' />
            {yAxes.map((axis) => (
              <ChartsYAxis key={axis.id} axisId={axis.id} />
            ))}
          </ChartsSurface>
          <ChartsTooltip trigger='axis' />
        </ChartsWrapper>
      </ChartsDataProvider>
    </ChartArea>
  );
}
