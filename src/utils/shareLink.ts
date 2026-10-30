// 分享連結的網址（ADR 0012）：`?share=<token>`。專案沒有 router，啟動時（main.tsx）讀這個參數決定要不要顯示分享頁。
// 用 query string 而不是路徑，部署時不必設定 rewrite。

export const SHARE_PARAM = 'share';

// token 是資料庫 gen_random_uuid() 產生的 UUID。
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 網址裡的分享參數；沒有這個參數時是 null（一般的 app）。
// 參數存在但格式不對時照樣回傳，分享頁會直接顯示「連結已失效」。
export function shareTokenOf(search: string): string | null {
  return new URLSearchParams(search).get(SHARE_PARAM);
}

export function isShareToken(token: string): boolean {
  return TOKEN.test(token);
}

export function shareUrl(origin: string, token: string): string {
  return `${origin}/?${SHARE_PARAM}=${token}`;
}

// 到期日的選項（ADR 0012 §4）：建立時預設 30 天；之後可以延長或縮短，都從今天起算，網址不變。
export const EXPIRY_OPTIONS: ReadonlyArray<{ days: number | null; label: string }> = [
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
  { days: 90, label: '90 天' },
  { days: null, label: '永不過期' },
];
export const DEFAULT_EXPIRY_DAYS = 30;

// days 是 null 代表永不過期，回傳 null（資料庫的 expires_at）。
export function expiryFrom(days: number | null, now: Date): string | null {
  if (days === null) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// 連結還能不能打開（撤銷的連結已經刪除，不會出現在這裡）。
export function isShareActive(share: { expiresAt: string | null }, now: Date): boolean {
  return share.expiresAt === null || new Date(share.expiresAt).getTime() > now.getTime();
}
