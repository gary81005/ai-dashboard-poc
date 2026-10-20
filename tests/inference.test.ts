import { describe, expect, it } from 'vitest';
import { inferRole } from '../src/utils/inference.ts';

describe('inferRole 規則 3（ADR 0010 修訂）', () => {
  it.each(['年', '月', '年月', '年度', '年份', '季別', '球季', '賽季'])(
    '數值欄位「%s」是維度',
    (header) => {
      expect(inferRole(header, 'integer', [2024, 2025])).toBe('dimension');
    },
  );

  it.each(['年營業額', '月租金', '球季勝場', '年度目標'])(
    '只是包含時間字的「%s」仍是量值',
    (header) => {
      expect(inferRole(header, 'number', [1, 2])).toBe('measure');
    },
  );

  it('結尾規則不變', () => {
    expect(inferRole('門市代號', 'integer', [1])).toBe('dimension');
    expect(inferRole('營收排名', 'integer', [1])).toBe('dimension');
  });
});
