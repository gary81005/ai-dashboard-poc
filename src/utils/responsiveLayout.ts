// 窄螢幕的版面（ADR 0009）：儀表板只存一份 12 欄的版面（dashboard.layout），
// 格線變窄時依它自動重排，不另外儲存，也不能在窄螢幕上編輯。
//
// 重排規則：依原本的位置由上而下、由左而右排成一條順序，再依欄數往下排。
// 兩欄時，原本寬度 ≤ 4 欄的小元件（KPI 卡、儀表圖）佔半寬、兩兩並排，其他佔滿整列；一欄時全部佔滿。
// 小元件湊不到伴（下一個是大元件）時改成佔滿整列，避免右半邊留白。

import type { LayoutItem } from '../types/index.ts';

export const GRID_COLS = 12;

// 格線寬度（px）→ 欄數。用格線本身的寬度而不是視窗寬度，因為編輯模式兩側還有面板。
export function columnsFor(width: number): number {
  if (width >= 900) return GRID_COLS;
  if (width >= 600) return 2;
  return 1;
}

// 格線的列高與間距（react-grid-layout 的 gridConfig），擁有者的畫面與分享頁共用（ADR 0012）。
// 重排成窄版時間距縮小一點，手機上留給圖表的寬度多一些。
export type GridConfig = {
  cols: number;
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
};

export function gridConfigFor(cols: number): GridConfig {
  const reflowed = cols !== GRID_COLS;
  return {
    cols,
    rowHeight: 80,
    margin: reflowed ? [12, 12] : [16, 16],
    containerPadding: [0, 0],
  };
}

const NARROW_WIDTH = 4;

export function reflowLayout(layout: readonly LayoutItem[], cols: number): LayoutItem[] {
  if (cols === GRID_COLS) return [...layout];
  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const narrow = ordered.map((item) => cols > 1 && item.w <= NARROW_WIDTH);
  const result: LayoutItem[] = [];
  let rowY = 0;
  let rowH = 0;
  let used = 0;
  for (const [index, item] of ordered.entries()) {
    const paired = narrow[index] && ((used > 0 && used < cols) || narrow[index + 1] === true);
    const w = paired ? 1 : cols;
    if (used + w > cols) {
      rowY += rowH;
      rowH = 0;
      used = 0;
    }
    result.push({ i: item.i, x: used, y: rowY, w, h: item.h });
    used += w;
    rowH = Math.max(rowH, item.h);
  }
  return result;
}
