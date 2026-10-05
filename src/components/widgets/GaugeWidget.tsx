// 儀表圖：顯示一個彙總值落在最小值～最大值之間的位置。

import { Gauge } from '@mui/x-charts/Gauge';
import { formatValue } from '../../utils/format.ts';
import { queryValue } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { GaugeWidget as GaugeWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: GaugeWidgetConfig; ctx: QueryContext };

export function GaugeWidget({ widget, ctx }: Props) {
  const { value } = widget.encoding;
  if (!value) return <WidgetMessage>請放入一個數值欄位</WidgetMessage>;

  const outcome = runQuery(() => queryValue(ctx, value));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  if (result.value === null) return <WidgetMessage>沒有可以顯示的數值</WidgetMessage>;

  // 預設範圍（ADR 0005）：比率以小數儲存，所以是 0～1；其他是 0 到目前值的 1.5 倍。
  const isRatio = result.measure.field.ratio === true && result.measure.agg !== 'count';
  const min = widget.options?.min ?? 0;
  const max = widget.options?.max ?? (isRatio ? 1 : Math.max(result.value * 1.5, min + 1));

  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <Gauge
        value={result.value}
        valueMin={min}
        valueMax={max}
        startAngle={-110}
        endAngle={110}
        innerRadius='72%'
        text={formatValue(result.measure.field, result.measure.agg, result.value)}
      />
    </ChartArea>
  );
}
