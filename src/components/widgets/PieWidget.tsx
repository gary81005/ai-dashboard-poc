// 圓餅圖（甜甜圈為選項）。資料來自 queryPie，只顯示大於 0 的分類。

import { PieChart } from '@mui/x-charts/PieChart';
import { formatValue } from '../../utils/format.ts';
import type { PieResult } from '../../utils/query.ts';
import type { PieWidget as PieWidgetConfig } from '../../types/index.ts';
import { ChartArea } from './WidgetParts.tsx';

type Props = { widget: PieWidgetConfig; result: PieResult };

export function PieWidget({ widget, result }: Props) {
  const { items, measure, unweightedRatio } = result;

  return (
    <ChartArea unweightedRatio={unweightedRatio}>
      <PieChart
        series={[
          {
            data: items,
            innerRadius: widget.options?.donut ? '55%' : 0,
            paddingAngle: 1,
            cornerRadius: 3,
            highlightScope: { fade: 'global', highlight: 'item' },
            valueFormatter: (item) => formatValue(measure.field, measure.agg, item.value),
          },
        ]}
      />
    </ChartArea>
  );
}
