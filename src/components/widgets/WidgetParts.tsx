// widget 共用的小元件：提示訊息（WidgetMessage）、圖表容器（ChartArea）。
// 查詢失敗的訊息文字由 utils/computeWidget.ts 產生，同樣用 WidgetMessage 顯示。

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export function WidgetMessage({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'error';
}) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 2, textAlign: 'center' }}>
      <Typography variant='body2' color={tone === 'error' ? 'error' : 'text.secondary'}>
        {children}
      </Typography>
    </Box>
  );
}

// 圖表依父元素大小繪製，所以繪圖區用絕對定位的 Box 給出明確尺寸；
// 需要時在上方另起一列顯示「⚠ 直接平均，僅供參考」，不蓋住圖表內容。
export function ChartArea({
  children,
  unweightedRatio = false,
}: {
  children: ReactNode;
  unweightedRatio?: boolean;
}) {
  return (
    <>
      {unweightedRatio && (
        <Tooltip title='這個比率是把各列的百分比直接平均。各列份量不同時會失真，例如小門市的 50% 和大門市的 100% 會平均成 75%。到資料集頁指定分子、分母後，會改用「分子加總 ÷ 分母加總」重算。'>
          <Chip
            size='small'
            color='warning'
            variant='outlined'
            label='⚠ 直接平均，僅供參考'
            sx={{ alignSelf: 'flex-end' }}
          />
        </Tooltip>
      )}
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <Box sx={{ position: 'absolute', inset: 0 }}>{children}</Box>
      </Box>
    </>
  );
}
