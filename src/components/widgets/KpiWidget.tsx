// KPI 卡：大字顯示彙總值（萬／億縮寫），下方是完整數字與單位；有趨勢欄位時再畫迷你走勢圖。
// 設了門檻時，大字依值變色並加上狀態標籤（ADR 0008）。

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { displayUnit, formatCompact, formatValue } from '../../utils/format.ts';
import type { ValueResult } from '../../utils/query.ts';
import type { KpiWidget as KpiWidgetConfig } from '../../types/index.ts';
import { TONE_LABELS, toneOf } from '../../utils/thresholds.ts';
import { ChartArea } from './WidgetParts.tsx';

type Props = { widget: KpiWidgetConfig; result: ValueResult };

export function KpiWidget({ widget, result }: Props) {
  const { field, agg } = result.measure;
  const unit = agg === 'count' ? undefined : displayUnit(field);
  const tone = toneOf(result.value, widget.options?.thresholds);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <Typography
          variant='h3'
          component='p'
          color={tone}
          sx={{ fontWeight: 600, lineHeight: 1.1 }}
        >
          {formatCompact(field, agg, result.value)}
        </Typography>
        {tone && <Chip size='small' color={tone} label={TONE_LABELS[tone]} />}
      </Stack>
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
