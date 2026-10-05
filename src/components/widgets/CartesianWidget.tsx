// 折線圖與長條圖（含面積、堆疊、橫式）。資料來自 queryCategorical，每個系列對應一個量值（× 分組值）。

import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { formatCompact, formatValue } from '../../utils/format.ts';
import { queryCategorical } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { BarWidget, LineWidget } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: LineWidget | BarWidget; ctx: QueryContext };

export function CartesianWidget({ widget, ctx }: Props) {
  const { x, y, group } = widget.encoding;
  if (!x || y.length === 0)
    return <WidgetMessage>請設定 X 軸，並放入至少一個數值欄位</WidgetMessage>;

  const outcome = runQuery(() => queryCategorical(ctx, x.field, y, group?.field));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  if (result.categories.length === 0) return <WidgetMessage>沒有符合條件的資料</WidgetMessage>;

  // 座標軸大小用 'auto'：MUI 預設的軸寬高（25px／45px）放不下中文標籤，
  // 超出的文字會被截成空白。
  const axisMeasure = result.series[0].measure;
  const formatAxis = (v: number) => formatCompact(axisMeasure.field, axisMeasure.agg, v);
  const valueX = { valueFormatter: formatAxis, height: 'auto' as const };
  const valueY = { valueFormatter: formatAxis, width: 'auto' as const };
  const categoryX = {
    scaleType: 'band' as const,
    data: result.categories,
    height: 'auto' as const,
  };
  const categoryY = { scaleType: 'band' as const, data: result.categories, width: 'auto' as const };
  const stacked = widget.options?.stacked === true;
  const series = result.series.map((s) => ({
    id: s.id,
    label: s.label,
    data: s.data,
    valueFormatter: (v: number | null) => formatValue(s.measure.field, s.measure.agg, v),
    ...(stacked ? { stack: 'total' } : {}),
  }));

  if (widget.type === 'line') {
    return (
      <ChartArea unweightedRatio={result.unweightedRatio}>
        <LineChart
          margin={{ right: 24 }}
          xAxis={[{ scaleType: 'point', data: result.categories, height: 'auto' }]}
          yAxis={[valueY]}
          series={series.map((s) => ({
            ...s,
            area: widget.options?.area === true,
            showMark: result.categories.length <= 24,
            connectNulls: true,
          }))}
        />
      </ChartArea>
    );
  }

  const horizontal = widget.options?.horizontal === true;
  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <BarChart
        margin={{ right: 24 }}
        layout={horizontal ? 'horizontal' : 'vertical'}
        xAxis={[horizontal ? valueX : categoryX]}
        yAxis={[horizontal ? categoryY : valueY]}
        series={series}
      />
    </ChartArea>
  );
}
