// 瀏覽器分頁的標題：「<頁面>｜個人化儀表板」，瀏覽紀錄與分頁列比較好認（ADR 0013 §6）。
// title 是 undefined 時（例如還在載入）只顯示產品名稱。

import { useEffect } from 'react';

const APP_TITLE = '個人化儀表板';

export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title}｜${APP_TITLE}` : APP_TITLE;
  }, [title]);
}
