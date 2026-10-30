import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  expiryFrom,
  isShareActive,
  isShareToken,
  shareTokenOf,
  shareUrl,
} from '../src/utils/shareLink.ts';

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

describe('到期日', () => {
  const now = new Date('2026-10-30T09:00:00.000Z');

  it('從今天起算天數，永不過期是 null', () => {
    expect(expiryFrom(30, now)).toBe('2026-11-29T09:00:00.000Z');
    expect(expiryFrom(null, now)).toBeNull();
    expect(EXPIRY_OPTIONS.map((o) => o.days)).toContain(DEFAULT_EXPIRY_DAYS);
  });

  it('過了到期時間就不算分享中', () => {
    expect(isShareActive({ expiresAt: null }, now)).toBe(true);
    expect(isShareActive({ expiresAt: '2026-10-31T00:00:00.000Z' }, now)).toBe(true);
    expect(isShareActive({ expiresAt: '2026-10-30T09:00:00.000Z' }, now)).toBe(false);
  });
});
