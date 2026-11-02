// 各畫面的網址（ADR 0013）。路由表在 router.tsx；換頁與連結都用這裡的常數和函式，網址格式只寫在一個地方。

export const DASHBOARDS_PATH = '/dashboards';
export const DATASETS_PATH = '/datasets';

export function dashboardPath(dashboardId: string): string {
  return `${DASHBOARDS_PATH}/${encodeURIComponent(dashboardId)}`;
}
