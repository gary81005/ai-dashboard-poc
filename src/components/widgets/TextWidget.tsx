// 文字元件：區塊說明、計算口徑、指標定義（ADR 0008）。保留換行，內容太長時可捲動。

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { TextWidget as TextWidgetConfig } from '../../types/index.ts';
import { WidgetMessage } from './WidgetParts.tsx';

export function TextWidget({ widget, editing }: { widget: TextWidgetConfig; editing?: boolean }) {
  if (!widget.content.trim()) {
    return <WidgetMessage>{editing ? '在右側元件設定輸入文字' : '（沒有內容）'}</WidgetMessage>;
  }
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
        {widget.content}
      </Typography>
    </Box>
  );
}
