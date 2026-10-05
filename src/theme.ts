import { createTheme } from '@mui/material/styles';
import { zhTW } from '@mui/material/locale';
import { zhTW as dataGridZhTW } from '@mui/x-data-grid/locales';

// 顏色一律由 MUI theme 管理（以 --mui-* CSS 變數輸出），深淺色跟隨作業系統設定（ADR 0006）。
// 後面兩個參數套用 MUI 與 Data Grid 的繁中語系，讓內建文字（分頁、排序選單等）顯示中文。
export const theme = createTheme(
  {
    cssVariables: true,
    colorSchemes: { light: true, dark: true },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", sans-serif',
    },
  },
  zhTW,
  dataGridZhTW,
);
