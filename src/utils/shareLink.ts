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
