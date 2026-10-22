// 編輯模式欄位之間的拖曳把手：左右拖曳調整把手右側面板的寬度，儀表板區域吸收差額。
// 雙擊恢復預設寬度；鍵盤可以用 Tab 選到把手，再用 ←／→ 調整（每次 16px）。
//
// 寬度由呼叫端保存（uiStore.panelWidths），傳進來的 width 是實際顯示的寬度（utils/panelLayout.ts）。
// 最大寬度在開始拖曳時才計算，因為它取決於當下的容器寬度。
// 把手上方的「»」把右側面板向右收合（uiStore.collapsedPanels），收合後由面板的窄條展開。

import { useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';

const KEYBOARD_STEP = 16;

type Props = {
  label: string;
  width: number;
  min: number;
  defaultWidth: number;
  // 目前容器下這個面板最多能多寬（讓儀表板區域保留最小寬度）。
  maxWidth: () => number;
  onChange: (width: number) => void;
  // 收合按鈕的說明，例如「收合欄位清單」。
  collapseLabel: string;
  onCollapse: () => void;
};

export function PanelResizer({
  label,
  width,
  min,
  defaultWidth,
  maxWidth,
  onChange,
  collapseLabel,
  onCollapse,
}: Props) {
  const [drag, setDrag] = useState<{ x: number; width: number; max: number } | null>(null);
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 88,
        height: 'calc(100svh - 104px)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Box
        role='separator'
        aria-orientation='vertical'
        aria-label={label}
        aria-valuenow={width}
        aria-valuemin={min}
        tabIndex={0}
        title='拖曳調整寬度，雙擊恢復預設'
        onPointerDown={(e) => {
          // 避免拖曳時選取到文字。
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x: e.clientX, width, max: maxWidth() });
        }}
        onPointerMove={(e) => {
          // 把手在面板左側：往左拖，面板變寬。
          if (drag) onChange(clamp(drag.width - (e.clientX - drag.x), drag.max));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={() => onChange(clamp(defaultWidth, maxWidth()))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const delta = e.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP;
          onChange(clamp(width + delta, maxWidth()));
        }}
        sx={{
          width: '100%',
          height: '100%',
          cursor: 'col-resize',
          touchAction: 'none',
          display: 'flex',
          justifyContent: 'center',
          outline: 'none',
          // 中間一條細線，滑過、拖曳或鍵盤選到時變成主色。
          '&::after': {
            content: '""',
            width: 2,
            borderRadius: 1,
            bgcolor: drag ? 'primary.main' : 'divider',
            transition: 'background-color 120ms',
          },
          '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
        }}
      />
      {/* 收合按鈕疊在把手上方，和把手是兄弟元素：separator 的子元素會被輔助技術當成純展示。 */}
      <ButtonBase
        aria-label={collapseLabel}
        title={collapseLabel}
        onClick={onCollapse}
        sx={{
          position: 'absolute',
          top: 0,
          zIndex: 1,
          width: 16,
          height: 28,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.secondary',
          fontSize: 12,
          cursor: 'pointer',
          '&:hover, &.Mui-focusVisible': { color: 'text.primary', borderColor: 'primary.main' },
        }}
      >
        »
      </ButtonBase>
    </Box>
  );
}
