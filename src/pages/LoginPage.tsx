// 登入頁：輸入 email，寄出 magic link。未登入時整個 app 只顯示這一頁（ADR 0007）。
//
// 使用者點信中的連結後會回到這個網址，supabase-js 讀到網址裡的 token 就會登入，App 自動切到主畫面。

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { sendMagicLink } from '../services/auth.ts';
import { useAuthStore } from '../store/authStore.ts';

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string };

export function LoginPage() {
  const linkError = useAuthStore((s) => s.linkError);
  const setLinkError = useAuthStore((s) => s.setLinkError);
  const [email, setEmail] = useState('');
  const [send, setSend] = useState<SendState>({ status: 'idle' });

  const handleSubmit = async () => {
    const trimmed = email.trim();
    setLinkError(null);
    setSend({ status: 'sending' });
    try {
      await sendMagicLink(trimmed);
      setSend({ status: 'sent', email: trimmed });
    } catch (error) {
      setSend({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper variant='outlined' sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Stack
          component='form'
          spacing={3}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <Stack spacing={1}>
            <Typography variant='h5' component='h1' sx={{ fontWeight: 600 }}>
              個人化儀表板
            </Typography>
            <Typography color='text.secondary'>
              輸入 email，我們會寄一封登入連結給你，不需要密碼。
            </Typography>
          </Stack>
          {linkError && <Alert severity='warning'>{linkError}</Alert>}
          {send.status === 'error' && <Alert severity='error'>{send.message}</Alert>}
          {send.status === 'sent' ? (
            <Alert severity='success'>
              登入連結已寄到 {send.email}，請到信箱點擊連結完成登入。
            </Alert>
          ) : (
            <>
              <TextField
                autoFocus
                required
                type='email'
                label='Email'
                autoComplete='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                type='submit'
                variant='contained'
                size='large'
                loading={send.status === 'sending'}
              >
                寄送登入連結
              </Button>
            </>
          )}
          {send.status === 'sent' && (
            <Button onClick={() => setSend({ status: 'idle' })}>沒收到？重新寄送</Button>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
