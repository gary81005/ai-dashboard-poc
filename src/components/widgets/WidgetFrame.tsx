// 元件卡片的外框：標題列、說明、篩選摘要、略過的儀表板篩選，以及圖表本體（children）。
//
// 只負責顯示：擁有者的 WidgetCard 和分享頁的卡片共用（ADR 0012），要顯示的內容由呼叫端算好傳進來。
// 編輯模式下標題是 react-grid-layout 的拖曳把手（.widget-drag-handle），點擊卡片會選取這個元件；
// 有警告時標題旁加 ⚠（ADR 0010 §7 ⑤，內容與「改用建議」在元件設定面板）。

import type { ReactNode } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

type Props = {
  title: string;
  description?: string;
  // 元件篩選的摘要；空字串代表沒有生效中的篩選。
  filterSummary: string;
  // 這張資料表沒有對應欄位、因此沒套用的儀表板篩選。
  skipped?: string[];
  warnings?: string[];
  // 標題列右側的按鈕（篩選、刪除）。
  actions?: ReactNode;
  editing?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  children: ReactNode;
};

export function WidgetFrame({
  title,
  description,
  filterSummary,
  skipped = [],
  warnings = [],
  actions,
  editing,
  selected,
  onSelect,
  children,
}: Props) {
  return (
    <Paper
      variant='outlined'
      onClick={editing ? onSelect : undefined}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        gap: 1,
        overflow: 'hidden',
        borderColor: selected ? 'primary.main' : undefined,
        borderWidth: selected ? 2 : undefined,
        cursor: editing ? 'pointer' : undefined,
      }}
    >
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <Typography
          className='widget-drag-handle'
          variant='subtitle1'
          component='h3'
          noWrap
          title={editing ? '拖動標題可移動元件' : undefined}
          sx={{ fontWeight: 600, flex: 1, cursor: editing ? 'move' : undefined }}
        >
          {title || '未命名'}
        </Typography>
        {warnings.length > 0 && (
          <Typography
            color='warning'
            title={warnings.join('\n')}
            aria-label={`${warnings.length} 個警告`}
          >
            ⚠
          </Typography>
        )}
        {actions}
      </Stack>
      {description && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ mt: -1, whiteSpace: 'pre-line', lineHeight: 1.5 }}
        >
          {description}
        </Typography>
      )}
      {filterSummary && (
        <Typography
          variant='caption'
          color='text.accent'
          noWrap
          title={filterSummary}
          sx={{ mt: -1 }}
        >
          篩選：{filterSummary}
        </Typography>
      )}
      {skipped.length > 0 && (
        <Typography variant='caption' color='warning' noWrap sx={{ mt: -1 }}>
          未套用儀表板篩選：{skipped.join('、')}（這張資料表沒有這個欄位）
        </Typography>
      )}
      {children}
    </Paper>
  );
}
