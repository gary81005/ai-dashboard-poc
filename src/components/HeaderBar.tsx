// 頂部列：theme 的 header 色（深色漸層、白字、品牌黃的底線與選取標示），深淺色模式都一樣。
// 左邊固定是產品名稱（手機隱藏），其餘內容（分頁、帳號、分享頁的儀表板名稱）由 children 決定。
// App 與分享頁（ADR 0012）共用。

import type { ReactNode } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

export function HeaderBar({ children }: { children?: ReactNode }) {
  return (
    <AppBar
      position='sticky'
      elevation={0}
      sx={(theme) => {
        const { header } = (theme.vars ?? theme).palette;
        return {
          background: header.background,
          color: header.text,
          // 底部一條品牌黃的細線（官網的 clinico-fill-golden）。
          borderBottom: `3px solid ${header.accent}`,
          '& .MuiTab-root': { color: header.muted },
          '& .MuiTab-root.Mui-selected': { color: header.accent },
          '& .MuiTabs-indicator': { bgcolor: header.accent },
        };
      }}
    >
      <Toolbar sx={{ gap: { xs: 1, sm: 3 } }}>
        <Typography
          variant='h6'
          component='h1'
          noWrap
          sx={{ fontWeight: 700, letterSpacing: 1, display: { xs: 'none', sm: 'block' } }}
        >
          個人化儀表板
        </Typography>
        {children}
      </Toolbar>
    </AppBar>
  );
}
