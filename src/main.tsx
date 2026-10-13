// 應用程式進入點：套上 MUI 主題（含深淺色、繁中語系）與 CssBaseline，再渲染 <App />。
//
// 建議的閱讀順序：
//   types/（設定 JSON 的形狀）→ store/appStore.ts（記憶體裡的狀態）→ services/（Supabase 讀寫）
//   → services/parseWorkbook.ts（Excel 怎麼變成資料）→ utils/query.ts（資料怎麼變成圖表數字）
//   → pages/（三個畫面）→ components/（畫面上的各個區塊）。
// 設計決策記在 docs/adr/，名詞定義在 CONTEXT.md。

import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import './index.css';
import { StartupErrorPage } from './pages/StartupErrorPage.tsx';
import { theme } from './theme.ts';

const root = createRoot(document.getElementById('root')!);

function render(node: ReactNode) {
  root.render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {node}
      </ThemeProvider>
    </StrictMode>,
  );
}

// App 與 auth 用動態 import：services/supabase.ts 缺少環境變數時會在載入階段就 throw，
// 寫成靜態 import 的話 try/catch 接不到，畫面只會一片空白。
async function start() {
  try {
    const [{ default: App }, { startAuthListener }] = await Promise.all([
      import('./App.tsx'),
      import('./services/auth.ts'),
    ]);
    // 在第一次 render 前開始監聽登入狀態，App 才知道要顯示登入頁還是主畫面。
    startAuthListener();
    render(<App />);
  } catch (error) {
    console.error('無法啟動應用程式', error);
    render(<StartupErrorPage error={error} />);
  }
}

void start();
