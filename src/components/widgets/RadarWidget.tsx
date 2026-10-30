// 雷達圖：每個軸是 X 欄位的一個值（例如 12 個月），槽位和折線／長條相同（ADR 0005）。
//
// 少於 3 個軸畫不出雷達圖，computeWidget 會改成提示。

import { RadarChart } from '@mui/x-charts/RadarChart';
import { formatValue } from '../../utils/format.ts';
import type { CategoricalResult } from '../../utils/query.ts';
import { ChartArea } from './WidgetParts.tsx';

export function RadarWidget({ result }: { result: CategoricalResult }) {
  return (
    <ChartArea unweightedRatio={result.unweightedRatio}>
      <RadarChart
        radar={{ metrics: result.categoryLabels }}
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
