// 儀表板的格線版面（react-grid-layout）：總寬 12 欄、每列高 80px。
//
// 檢視模式下固定不動；編輯模式下拖動標題可移動、拖動右下角可縮放，結果寫回 dashboard.layout。
// 每一格放一個 WidgetCard；篩選、刪除、選取等操作由這裡接到 store。

import GridLayout, { useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard, Dataset, DatasetRows } from '../../types/index.ts';
import { sameLayout } from '../../utils/widgetEditing.ts';
import { WidgetCard } from '../widgets/WidgetCard.tsx';

type Props = { dashboard: Dashboard; dataset: Dataset; rows: DatasetRows };

const GRID_COLS = 12;

export function DashboardGrid({ dashboard, dataset, rows }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const editing = useUiStore((s) => s.editing);
  const selectedWidgetId = useUiStore((s) => s.selectedWidgetId);
  const selectWidget = useUiStore((s) => s.selectWidget);
  const updateLayout = useAppStore((s) => s.updateLayout);
  const removeWidget = useAppStore((s) => s.removeWidget);
  const updateWidget = useAppStore((s) => s.updateWidget);

  // react-grid-layout 初次掛載時也會回報一次（沒變動的）版面，只有真的變動才存檔。
  const handleLayoutChange = (layout: Layout) => {
    const next = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    if (editing && !sameLayout(next, dashboard.layout)) updateLayout(dashboard.id, next);
  };

  const handleRemove = (widgetId: string) => {
    if (selectedWidgetId === widgetId) selectWidget(null);
    removeWidget(dashboard.id, widgetId);
  };

  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          width={width}
          layout={dashboard.layout}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight: 80,
            margin: [16, 16],
            containerPadding: [0, 0],
          }}
          dragConfig={{ enabled: editing, handle: '.widget-drag-handle' }}
          resizeConfig={{ enabled: editing }}
          onLayoutChange={handleLayoutChange}
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard
                widget={widget}
                dataset={dataset}
                rows={rows}
                editing={editing}
                selected={editing && selectedWidgetId === widget.id}
                onSelect={() => selectWidget(widget.id)}
                onRemove={() => handleRemove(widget.id)}
                onChange={(next) => updateWidget(dashboard.id, next)}
              />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
