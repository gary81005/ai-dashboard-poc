// 分享頁的格線（ADR 0012）：和擁有者的 DashboardGrid 同一套版面與窄螢幕重排（ADR 0009），但只能看。
//
// 每一格直接畫分享結果裡算好的內容，不查詢資料、不碰任何 store；外框和圖表元件與擁有者的畫面共用。

import GridLayout, { useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import type { ShareSnapshot } from '../../utils/shareSnapshot.ts';
import { columnsFor, gridConfigFor, reflowLayout } from '../../utils/responsiveLayout.ts';
import { TextWidget } from '../widgets/TextWidget.tsx';
import { WidgetBody } from '../widgets/WidgetBody.tsx';
import { WidgetFrame } from '../widgets/WidgetFrame.tsx';

export function SharedDashboardGrid({ snapshot }: { snapshot: ShareSnapshot }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const cols = columnsFor(width);

  return (
    <div ref={containerRef}>
      {mounted && (
        <GridLayout
          width={width}
          layout={reflowLayout(snapshot.layout, cols)}
          gridConfig={gridConfigFor(cols)}
          dragConfig={{ enabled: false }}
          resizeConfig={{ enabled: false }}
        >
          {snapshot.widgets.map(({ widget, filterSummary, result }) => (
            <div key={widget.id}>
              <WidgetFrame
                title={widget.title}
                description={widget.description}
                filterSummary={filterSummary}
              >
                {widget.type === 'text' ? (
                  <TextWidget widget={widget} />
                ) : (
                  result && <WidgetBody widget={widget} result={result} />
                )}
              </WidgetFrame>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
