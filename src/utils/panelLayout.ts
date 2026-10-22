// 編輯模式右側兩個面板（欄位清單、元件設定）實際顯示的寬度。
//
// uiStore.panelWidths 記的是使用者拖出來的寬度，畫面另外依工作區目前的寬度限制：儀表板區域至少保留
// GRID_MIN_WIDTH，放不下時先縮元件設定、再縮欄位清單，都不小於最小寬度。只在渲染時計算、不寫回 store，
// 所以大螢幕調寬後把視窗縮小，圖表不會被擠到零寬；視窗再放大時回到原本拖出來的寬度。
// 收合的面板固定是窄條的寬度。

export type PanelKey = 'fields' | 'editor';
export type PanelSizes = Record<PanelKey, number>;

// 把手寬度（同時是間距）、面板的最小寬度、收合後窄條的寬度，以及儀表板區域至少保留的寬度。
export const RESIZER_WIDTH = 16;
export const PANEL_MIN: PanelSizes = { fields: 180, editor: 280 };
export const COLLAPSED_WIDTH = 32;
export const GRID_MIN_WIDTH = 400;

// 工作區裡兩個面板合計可以用的寬度。
function panelSpace(workspace: number): number {
  return workspace - 2 * RESIZER_WIDTH - GRID_MIN_WIDTH;
}

export function fitPanels(
  widths: PanelSizes,
  collapsed: Record<PanelKey, boolean>,
  workspace: number,
): PanelSizes {
  const fitted: PanelSizes = {
    fields: collapsed.fields ? COLLAPSED_WIDTH : widths.fields,
    editor: collapsed.editor ? COLLAPSED_WIDTH : widths.editor,
  };
  let over = fitted.fields + fitted.editor - panelSpace(workspace);
  for (const panel of ['editor', 'fields'] as const) {
    if (over <= 0 || collapsed[panel]) continue;
    const next = Math.max(PANEL_MIN[panel], fitted[panel] - over);
    over -= fitted[panel] - next;
    fitted[panel] = next;
  }
  return fitted;
}

// 拖曳把手時，一個面板最多能多寬：扣掉另一個面板目前實際的寬度。
export function maxPanelWidth(workspace: number, other: number): number {
  return panelSpace(workspace) - other;
}
