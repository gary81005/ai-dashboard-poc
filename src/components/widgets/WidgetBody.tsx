// 依 widget.type 分派到對應的圖表元件。新增圖表類型時，在這裡加一個 case。

import type { QueryContext } from '../../utils/query.ts';
import type { Widget } from '../../types/index.ts';
import { CartesianWidget } from './CartesianWidget.tsx';
import { ComboWidget } from './ComboWidget.tsx';
import { GaugeWidget } from './GaugeWidget.tsx';
import { KpiWidget } from './KpiWidget.tsx';
import { PieWidget } from './PieWidget.tsx';
import { RadarWidget } from './RadarWidget.tsx';
import { ScatterWidget } from './ScatterWidget.tsx';
import { TableWidget } from './TableWidget.tsx';

export function WidgetBody({ widget, ctx }: { widget: Widget; ctx: QueryContext }) {
  switch (widget.type) {
    case 'line':
    case 'bar':
      return <CartesianWidget widget={widget} ctx={ctx} />;
    case 'combo':
      return <ComboWidget widget={widget} ctx={ctx} />;
    case 'pie':
      return <PieWidget widget={widget} ctx={ctx} />;
    case 'scatter':
      return <ScatterWidget widget={widget} ctx={ctx} />;
    case 'radar':
      return <RadarWidget widget={widget} ctx={ctx} />;
    case 'gauge':
      return <GaugeWidget widget={widget} ctx={ctx} />;
    case 'kpi':
      return <KpiWidget widget={widget} ctx={ctx} />;
    case 'table':
      return <TableWidget widget={widget} ctx={ctx} />;
  }
}
