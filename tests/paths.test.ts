import { describe, expect, it } from 'vitest';
import { DASHBOARDS_PATH, dashboardPath } from '../src/utils/paths.ts';

describe('paths', () => {
  it('儀表板網址在清單網址底下', () => {
    expect(dashboardPath('db_abc123')).toBe(`${DASHBOARDS_PATH}/db_abc123`);
  });

  it('id 裡的特殊字元會編碼，不會跑出別的路徑', () => {
    expect(dashboardPath('a/b?c')).toBe(`${DASHBOARDS_PATH}/a%2Fb%3Fc`);
  });
});
