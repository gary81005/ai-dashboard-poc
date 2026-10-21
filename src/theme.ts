import { createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type {} from '@mui/x-charts/themeAugmentation';
import { zhTW } from '@mui/material/locale';
import { zhTW as dataGridZhTW } from '@mui/x-data-grid/locales';

// 顏色一律由 MUI theme 管理（以 --mui-* CSS 變數輸出），深淺色跟隨作業系統設定（ADR 0006）。
// 後面兩個參數套用 MUI 與 Data Grid 的繁中語系，讓內建文字（分頁、排序選單等）顯示中文。
//
// 配色沿用科林官網（corporation-official-web 的 global.css）的色票：
//   主色 = 品牌黃 clinico-primary，次要色 = 暖灰 clinico-secondary，文字與底色取 link／fill 系列，
//   資訊藍、成功綠取 clinico-theme 的 blue、green。
// 品牌黃當文字放在白底上對比不到 2:1，所以淺色模式下：填色的元件（實心按鈕、Chip、Badge）用黃底深字，
// 以主色當文字的地方（文字／外框按鈕、聚焦中的輸入框標籤、選取的分頁）改用 text.accent 的深琥珀色。
// 警告色維持 MUI 預設的橘色，不用官網的 #faad14，以免和主色的黃分不出來。
//
// 另外兩組自訂色：
//   chart  — 圖表系列的配色（品牌黃、深灰、藍、綠…），所有圖表經由 MuiChartsDataProvider 套用。
//   header — 頂部列：官網頁尾的深色漸層（clinico-fill-dark），配白字與品牌黃的選取標示。

const CHART_SERIES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;
type ChartPalette = Record<(typeof CHART_SERIES)[number], string>;
type HeaderPalette = { background: string; text: string; muted: string; accent: string };

declare module '@mui/material/styles' {
  interface TypeText {
    // 以主色當文字時用的顏色：淺色模式是深琥珀，深色模式直接用品牌黃。
    accent: string;
  }
  interface Palette {
    chart: ChartPalette;
    header: HeaderPalette;
  }
  interface PaletteOptions {
    chart?: ChartPalette;
    header?: HeaderPalette;
  }
}

const accent = (theme: Theme) => (theme.vars ?? theme).palette.text.accent;

// 圖表的系列顏色寫成 CSS 變數，切換深淺色時不必重新渲染圖表就會換色。
const chartColors = CHART_SERIES.map((key) => `var(--mui-palette-chart-${key})`);

const header: HeaderPalette = {
  background: 'linear-gradient(180deg, #4c4948 0%, #2a2523 100%)',
  text: '#ffffff',
  muted: '#d9d9d9',
  accent: '#fabe00',
};

export const theme = createTheme(
  {
    cssVariables: true,
    colorSchemes: {
      light: {
        palette: {
          primary: { main: '#fabe00', light: '#fcd24d', dark: '#e59100', contrastText: '#2a2523' },
          secondary: {
            main: '#4c4948',
            light: '#797472',
            dark: '#2a2523',
            contrastText: '#ffffff',
          },
          info: { main: '#0079fb' },
          success: { main: '#00a785', contrastText: '#ffffff' },
          text: { primary: '#2a2523', secondary: '#5a5a5a', accent: '#9a6200' },
          background: { default: '#f9f9f9', paper: '#ffffff' },
          divider: '#e5e5e5',
          chart: {
            s1: '#fabe00',
            s2: '#4c4948',
            s3: '#0079fb',
            s4: '#00a785',
            s5: '#e59100',
            s6: '#f27c6e',
            s7: '#7fbcff',
            s8: '#a8a3a1',
          },
          header,
        },
      },
      dark: {
        palette: {
          primary: { main: '#fabe00', light: '#ffe285', dark: '#e59100', contrastText: '#2a2523' },
          secondary: {
            main: '#c4c4c4',
            light: '#d9d9d9',
            dark: '#797472',
            contrastText: '#2a2523',
          },
          info: { main: '#4da3fc' },
          success: { main: '#2ec4a5' },
          text: { primary: '#f2f2f2', secondary: '#c4c4c4', accent: '#fcd24d' },
          background: { default: '#1f1b1a', paper: '#2a2523' },
          divider: '#3e3b3a',
          chart: {
            s1: '#fabe00',
            s2: '#d9d9d9',
            s3: '#4da3fc',
            s4: '#2ec4a5',
            s5: '#ffae00',
            s6: '#ff9e94',
            s7: '#9fceff',
            s8: '#8a8582',
          },
          header,
        },
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", sans-serif',
    },
    components: {
      MuiChartsDataProvider: { defaultProps: { colors: chartColors } },
      MuiButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            variants: [
              { props: { color: 'primary', variant: 'text' }, style: { color: accent(theme) } },
              { props: { color: 'primary', variant: 'outlined' }, style: { color: accent(theme) } },
            ],
          }),
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: ({ theme }) => ({ '&.Mui-focused': { color: accent(theme) } }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: (theme.vars ?? theme).palette.primary.dark,
            },
          }),
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme }) => ({ '&.Mui-selected': { color: accent(theme) } }),
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({ '&.Mui-selected': { color: accent(theme) } }),
        },
      },
      // 勾選框的勾是鏤空的（透出白底），黃底白勾看不清楚，改用較深的琥珀。
      MuiCheckbox: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&.Mui-checked': { color: (theme.vars ?? theme).palette.primary.dark },
          }),
        },
      },
    },
  },
  zhTW,
  dataGridZhTW,
);
