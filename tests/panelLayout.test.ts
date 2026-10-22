import { describe, expect, it } from 'vitest';
import {
  COLLAPSED_WIDTH,
  GRID_MIN_WIDTH,
  PANEL_MIN,
  RESIZER_WIDTH,
  fitPanels,
  maxPanelWidth,
} from '../src/utils/panelLayout.ts';

const open = { fields: false, editor: false };
// 工作區寬度：兩個面板合計可以用 space px。
const workspaceFor = (space: number) => space + 2 * RESIZER_WIDTH + GRID_MIN_WIDTH;

describe('fitPanels', () => {
  it('放得下時照使用者拖出來的寬度', () => {
    expect(fitPanels({ fields: 300, editor: 500 }, open, workspaceFor(800))).toEqual({
      fields: 300,
      editor: 500,
    });
  });

  it('大螢幕調寬後縮小視窗：先縮元件設定，儀表板保留最小寬度', () => {
    // 2560px 螢幕拖到 600 + 900，縮到工作區 1232px（約 1280px 的視窗）。
    // 兩個面板合計只能 800px：多出的 700px 先從元件設定縮到最小（-620），剩下 80px 由欄位清單吸收。
    expect(fitPanels({ fields: 600, editor: 900 }, open, 1232)).toEqual({
      fields: 520,
      editor: PANEL_MIN.editor,
    });
  });

  it('元件設定縮到最小還不夠時再縮欄位清單，都不小於最小寬度', () => {
    expect(fitPanels({ fields: 600, editor: 900 }, open, workspaceFor(300))).toEqual(PANEL_MIN);
  });

  it('收合的面板固定是窄條寬度，只縮展開的面板', () => {
    const fitted = fitPanels(
      { fields: 600, editor: 900 },
      { fields: false, editor: true },
      workspaceFor(500),
    );
    expect(fitted).toEqual({ fields: 500 - COLLAPSED_WIDTH, editor: COLLAPSED_WIDTH });
  });

  it('還沒量到工作區寬度（Infinity）時不限制', () => {
    expect(fitPanels({ fields: 600, editor: 900 }, open, Infinity)).toEqual({
      fields: 600,
      editor: 900,
    });
  });
});

describe('maxPanelWidth', () => {
  it('扣掉另一個面板與儀表板的最小寬度', () => {
    expect(maxPanelWidth(workspaceFor(800), 300)).toBe(500);
  });
});
