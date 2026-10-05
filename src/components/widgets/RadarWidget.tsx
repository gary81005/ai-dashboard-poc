// 雷達圖：每個軸是 X 欄位的一個值（例如 12 個月），槽位和折線／長條相同（ADR 0005）。
//
// 少於 3 個軸畫不出雷達圖，改顯示提示。

import { RadarChart } from '@mui/x-charts/RadarChart';
import { formatValue } from '../../utils/format.ts';
import { queryCategorical } from '../../utils/query.ts';
import type { QueryContext } from '../../utils/query.ts';
import type { RadarWidget as RadarWidgetConfig } from '../../types/index.ts';
import { runQuery } from '../../utils/runQuery.ts';
import { ChartArea, QueryFailure, WidgetMessage } from './WidgetParts.tsx';

type Props = { widget: RadarWidgetConfig; ctx: QueryContext };

export function RadarWidget({ widget, ctx }: Props) {
  const { x, y, group } = widget.encoding;
  if (!x || y.length === 0)
    return <WidgetMessage>請設定軸的分類欄位，並放入至少一個數值欄位</WidgetMessage>;

  const outcome = runQuery(() => queryCategorical(ctx, x.field, y, group?.field));
  if (!outcome.ok) return <QueryFailure outcome={outcome} />;
  const result = outcome.value;
  if (result.categories.length < 3) {
    return (
      <WidgetMessage>
        雷達圖至少需要 3 個軸，「{result.xField.header}」目前只有 {result.categories.length} 個值
      </WidgetMessage>
    );
  }

  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <RadarChart
        radar={{ metrics: result.categories }}
        series={result.series.map((s) => ({
          id: s.id,
          label: s.label,
          data: s.data.map((v) => v ?? 0),
          valueFormatter: (v: number | null) => formatValue(s.measure.field, s.measure.agg, v),
        }))}
      />
    </ChartArea>
  );
}
