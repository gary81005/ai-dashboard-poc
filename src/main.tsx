// 應用程式進入點：套上 MUI 主題（含深淺色、繁中語系）與 CssBaseline，再渲染 <App />。
//
// 建議的閱讀順序：
//   types/（設定 JSON 的形狀）→ store/appStore.ts（狀態與 localStorage）
//   → services/parseWorkbook.ts（Excel 怎麼變成資料）→ utils/query.ts（資料怎麼變成圖表數字）
//   → pages/（三個畫面）→ components/（畫面上的各個區塊）。
// 設計決策記在 docs/adr/，名詞定義在 CONTEXT.md。

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import './index.css';
import App from './App.tsx';
import { theme } from './theme.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
