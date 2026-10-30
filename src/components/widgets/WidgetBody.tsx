// 依結果的類型分派到對應的圖表元件。新增圖表類型時，在這裡和 utils/computeWidget.ts 各加一個 case。
//
// 結果由 computeWidget 算好傳進來（ADR 0012）：擁有者的畫面當場算，分享頁用存好的結果，畫圖共用這裡。
// 結果和 widget 一定是同一個元件算出來的；類型對不上時（不應該發生）什麼都不畫。

import type { DataWidget, WidgetResult } from '../../utils/computeWidget.ts';
import { CartesianWidget } from './CartesianWidget.tsx';
import { ComboWidget } from './ComboWidget.tsx';
import { GaugeWidget } from './GaugeWidget.tsx';
import { KpiWidget } from './KpiWidget.tsx';
import { PieWidget } from './PieWidget.tsx';
import { RadarWidget } from './RadarWidget.tsx';
import { ScatterWidget } from './ScatterWidget.tsx';
import { TableWidget } from './TableWidget.tsx';
import { WidgetMessage } from './WidgetParts.tsx';

export function WidgetBody({ widget, result }: { widget: DataWidget; result: WidgetResult }) {
  if (result.status === 'message') {
    return <WidgetMessage tone={result.tone}>{result.message}</WidgetMessage>;
  }
  switch (result.type) {
    case 'line':
    case 'bar':
      return widget.type === 'line' || widget.type === 'bar' ? (
        <CartesianWidget widget={widget} result={result.data} />
      ) : null;
    case 'combo':
      return widget.type === 'combo' ? <ComboWidget widget={widget} result={result.data} /> : null;
    case 'radar':
      return widget.type === 'radar' ? <RadarWidget result={result.data} /> : null;
    case 'pie':
      return widget.type === 'pie' ? <PieWidget widget={widget} result={result.data} /> : null;
    case 'scatter':
      return <ScatterWidget result={result.data} />;
    case 'gauge':
      return widget.type === 'gauge' ? <GaugeWidget widget={widget} result={result.data} /> : null;
    case 'kpi':
      return widget.type === 'kpi' ? <KpiWidget widget={widget} result={result.data} /> : null;
    case 'table':
      return widget.type === 'table' ? <TableWidget widget={widget} result={result.data} /> : null;
  }
}
