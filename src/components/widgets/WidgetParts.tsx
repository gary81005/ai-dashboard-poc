// widget 共用的小元件：提示訊息（WidgetMessage）、查詢失敗訊息（QueryFailure）、圖表容器（ChartArea）。

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { QueryOutcome } from '../../utils/runQuery.ts';

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

export function QueryFailure({
  outcome,
}: {
  outcome: Extract<QueryOutcome<unknown>, { ok: false }>;
}) {
  return (
    <WidgetMessage tone='error'>
      {outcome.missing
        ? `欄位遺失：「${outcome.missing.header}」不在目前的資料表中，請重新指定欄位`
        : `無法產生圖表：${outcome.message}`}
    </WidgetMessage>
  );
}

// 圖表依父元素大小繪製，所以繪圖區用絕對定位的 Box 給出明確尺寸；
// 需要時在上方另起一列顯示「⚠ 非加權平均」，不蓋住圖表內容。
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
        <Tooltip title='比率欄位在合併多列時取的是非加權平均，數字只能參考。精確值請改用 Excel 裡已算好的彙總表。'>
          <Chip
            size='small'
            color='warning'
            variant='outlined'
            label='⚠ 非加權平均'
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
