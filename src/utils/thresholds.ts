// 依門檻上色（ADR 0008）：值 < warning 為紅、warning ≤ 值 < success 為黃、值 ≥ success 為綠。
// 顏色名稱對應 MUI theme 的 palette，元件用 `${tone}.main` 取色，不寫死色碼。

import type { Thresholds } from '../types/index.ts';

export type Tone = 'error' | 'warning' | 'success';

export const TONE_LABELS: Record<Tone, string> = {
  success: '達標',
  warning: '接近',
  error: '未達',
};

export function toneOf(value: number | null, thresholds: Thresholds | undefined): Tone | undefined {
  if (!thresholds || value === null || Number.isNaN(value)) return undefined;
  if (value < thresholds.warning) return 'error';
  if (value < thresholds.success) return 'warning';
  return 'success';
}

// 比率欄位第一次開啟門檻時的預設值：80% 以下紅、100% 以上綠；其他欄位沒有合理預設，先給 0。
export function defaultThresholds(percent: boolean): Thresholds {
  return percent ? { warning: 0.8, success: 1 } : { warning: 0, success: 0 };
}
