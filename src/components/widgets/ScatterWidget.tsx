// 散佈圖：X、Y 都是量值。有明細欄位時一個明細值一個點，tooltip 會顯示該點的名稱（例如門市代號）。

import { ScatterChart } from '@mui/x-charts/ScatterChart';
import { formatCompact, formatValue } from '../../utils/format.ts';
import { queryScatter } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { ScatterWidget as ScatterWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: ScatterWidgetConfig; ctx: QueryContext };

export function ScatterWidget({ widget, ctx }: Props) {
  const { x, y, color, detail } = widget.encoding;
  if (!x || !y) return <WidgetMessage>請設定 X 軸與 Y 軸的數值欄位</WidgetMessage>;

  const outcome = runQuery(() => queryScatter(ctx, x, y, color?.field, detail?.field));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  if (result.series.every((s) => s.points.length === 0)) {
    return <WidgetMessage>沒有可以畫成點的數值資料</WidgetMessage>;
  }

  // 點的 id → 明細名稱，供 tooltip 顯示「TP01：…」。
  const labels = new Map(
    result.series.flatMap((s) => s.points.map((p) => [p.id, p.label] as const)),
  );
  const describe = (v: { id?: string | number; x: number; y: number } | null) => {
    if (!v) return '';
    const label = v.id !== undefined ? labels.get(String(v.id)) : undefined;
    const coords = `${result.x.label} ${formatValue(result.x.field, result.x.agg, v.x)}，${result.y.label} ${formatValue(result.y.field, result.y.agg, v.y)}`;
    return label ? `${label}：${coords}` : coords;
  };

  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <ScatterChart
        xAxis={[
          {
            label: result.x.label,
            // 不用 'auto'：自動計算高度時沒有扣掉軸標題，刻度文字會沒有空間顯示。
            height: 56,
            valueFormatter: (v: number) => formatCompact(result.x.field, result.x.agg, v),
          },
        ]}
        yAxis={[
          {
            label: result.y.label,
            width: 'auto',
            valueFormatter: (v: number) => formatCompact(result.y.field, result.y.agg, v),
          },
        ]}
        series={result.series.map((s) => ({
          id: s.id,
          label: s.label,
          data: s.points.map(({ id, x: px, y: py }) => ({ id, x: px, y: py })),
          valueFormatter: describe,
        }))}
      />
    </ChartArea>
  );
}
