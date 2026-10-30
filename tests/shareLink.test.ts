import { describe, expect, it } from 'vitest';
import { isShareToken, shareTokenOf, shareUrl } from '../src/utils/shareLink.ts';

const token = '3f2b8c1e-9a4d-4c7e-8b21-6d5f0a9e1c34';

describe('shareLink', () => {
  it('沒有 share 參數時是一般的 app', () => {
    expect(shareTokenOf('')).toBeNull();
    expect(shareTokenOf('?foo=1')).toBeNull();
  });

  it('讀出 share 參數，格式不對也照樣回傳，交給分享頁顯示失效', () => {
    expect(shareTokenOf(`?share=${token}`)).toBe(token);
    expect(shareTokenOf('?share=abc')).toBe('abc');
    expect(isShareToken(token)).toBe(true);
    expect(isShareToken('abc')).toBe(false);
    expect(isShareToken('')).toBe(false);
  });

  it('組出的網址可以再讀回 token', () => {
    const url = new URL(shareUrl('https://example.com', token));
    expect(shareTokenOf(url.search)).toBe(token);
  });
});
