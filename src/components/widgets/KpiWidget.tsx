// KPI 卡：大字顯示彙總值（萬／億縮寫），下方是完整數字與單位；有趨勢欄位時再畫迷你走勢圖。

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { displayUnit, formatCompact, formatValue } from '../../utils/format.ts';
import { queryValue } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { KpiWidget as KpiWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: KpiWidgetConfig; ctx: QueryContext };

export function KpiWidget({ widget, ctx }: Props) {
  const { value, trend } = widget.encoding;
  if (!value) return <WidgetMessage>請放入一個數值欄位</WidgetMessage>;

  const outcome = runQuery(() => queryValue(ctx, value, trend?.field));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  const { field, agg } = result.measure;
  const unit = agg === 'count' ? undefined : displayUnit(field);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Typography variant='h3' component='p' sx={{ fontWeight: 600, lineHeight: 1.1 }}>
        {formatCompact(field, agg, result.value)}
      </Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
        {formatValue(field, agg, result.value)}
        {unit ? ` ${unit}` : ''}
      </Typography>
      <ChartArea unweightedRatio={result.unweightedRatio}>
        {result.trend && result.trend.labels.length > 1 ? (
          <SparkLineChart
            data={result.trend.data.map((v) => v ?? 0)}
            xAxis={{ scaleType: 'point', data: result.trend.labels }}
            area
            showHighlight
            showTooltip
            valueFormatter={(v: number | null) => formatValue(field, agg, v)}
          />
        ) : null}
      </ChartArea>
    </Box>
  );
}
