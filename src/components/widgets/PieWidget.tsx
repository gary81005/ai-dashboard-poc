// 圓餅圖（甜甜圈為選項）。資料來自 queryPie，只顯示大於 0 的分類。

import { PieChart } from '@mui/x-charts/PieChart';
import { formatValue } from '../../utils/format.ts';
import { queryPie } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { PieWidget as PieWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: PieWidgetConfig; ctx: QueryContext };

export function PieWidget({ widget, ctx }: Props) {
  const { category, value } = widget.encoding;
  if (!category || !value) return <WidgetMessage>請設定分類欄位與數值欄位</WidgetMessage>;

  const outcome = runQuery(() => queryPie(ctx, category.field, value));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const { items, measure, unweightedRatio } = outcome.value;
  if (items.length === 0) return <WidgetMessage>沒有大於 0 的數值可以畫圓餅圖</WidgetMessage>;

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
