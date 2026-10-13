// 啟動失敗頁：App 載入時就出錯（最常見是缺少 Supabase 環境變數）時，main.tsx 改顯示這一頁，
// 不要讓使用者只看到一片空白、錯誤只出現在 console。

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';

export function StartupErrorPage({ error }: { error: unknown }) {
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
      <Alert severity='error' variant='outlined' sx={{ width: '100%', maxWidth: 560 }}>
        <AlertTitle>無法啟動應用程式</AlertTitle>
        {error instanceof Error ? error.message : String(error)}
      </Alert>
    </Box>
  );
}
