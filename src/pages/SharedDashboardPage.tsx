// 分享頁（ADR 0012）：網址帶 ?share=<token> 時由 main.tsx 直接顯示，不檢查登入，也不載入使用者資料。
//
// 只顯示儀表板名稱、元件與「最後更新於」（在名稱下方另起一行），不顯示擁有者的 email。只能看：
// 滑鼠移上去看數值、表格排序與捲動都可以（用的都是分享結果裡算好的資料），不能匯出或篩選。
// 連結失效時一律顯示同一句話，不說明原因。

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';
import { HeaderBar } from '../components/HeaderBar.tsx';
import { SharedDashboardGrid } from '../components/share/SharedDashboardGrid.tsx';
import { fetchSharedDashboard } from '../services/shareService.ts';
import type { SharedDashboard } from '../services/shareService.ts';

type PageState = { status: 'loading' } | { status: 'error'; message: string } | SharedDashboard;

export function SharedDashboardPage({ token }: { token: string }) {
  const [state, setState] = useState<PageState>({ status: 'loading' });
  // 每按一次「重試」加 1，重新讀取。
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSharedDashboard(token).then(
      (result) => {
        if (!cancelled) setState(result);
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const name = state.status === 'ready' ? state.snapshot.name : undefined;
  useEffect(() => {
    if (name) document.title = `${name}｜個人化儀表板`;
  }, [name]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
      <HeaderBar>
        {/* 儀表板名稱與「最後更新於」分兩行，手機上也顯示。 */}
        {state.status === 'ready' && (
          <Box sx={{ minWidth: 0, py: 0.75 }}>
            <Typography variant='subtitle1' component='h2' noWrap sx={{ fontWeight: 600 }}>
              {state.snapshot.name}
            </Typography>
            <Typography
              variant='caption'
              component='p'
              noWrap
              sx={(theme) => ({ color: (theme.vars ?? theme).palette.header.muted })}
            >
              最後更新於：{dayjs(state.snapshotAt).format('YYYY-MM-DD HH:mm')}
            </Typography>
          </Box>
        )}
      </HeaderBar>
      <Box component='main' sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
        <Content state={state} onRetry={retry} />
      </Box>
    </Box>
  );
}

function Content({ state, onRetry }: { state: PageState; onRetry: () => void }) {
  switch (state.status) {
    case 'loading':
      return (
        <Centered>
          <CircularProgress aria-label='載入中' />
        </Centered>
      );
    case 'error':
      return (
        <Centered>
          <Alert severity='error' action={<Button onClick={onRetry}>重試</Button>}>
            無法載入分享的儀表板：{state.message}
          </Alert>
        </Centered>
      );
    case 'invalid':
      return (
        <Centered>
          <Alert severity='info'>這個連結已失效，請向分享的人索取新連結。</Alert>
        </Centered>
      );
    case 'outdated':
      return (
        <Centered>
          <Alert severity='info'>這個分享連結需要更新，請分享的人開啟儀表板並儲存一次。</Alert>
        </Centered>
      );
    case 'ready':
      return state.snapshot.widgets.length === 0 ? (
        <Centered>
          <Typography color='text.secondary'>這個儀表板還沒有任何元件。</Typography>
        </Centered>
      ) : (
        <SharedDashboardGrid snapshot={state.snapshot} />
      );
  }
}

function Centered({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '50svh' }}>{children}</Box>;
}
