import { describe, expect, it } from 'vitest';
import type { Field } from '../src/types/index.ts';
import { defaultAgg } from '../src/utils/widgetEditing.ts';

const field = (header: string, extra: Partial<Field> = {}): Field => ({
  header,
  dataType: 'number',
  role: 'measure',
  ...extra,
});

describe('defaultAgg', () => {
  it('一般量值加總', () => {
    expect(defaultAgg(field('營業額'))).toBe('sum');
  });

  it('比率與推測比率取平均（Q38）', () => {
    expect(defaultAgg(field('平均客單價', { ratio: true }))).toBe('avg');
    expect(defaultAgg(field('上壘率'))).toBe('avg');
    expect(defaultAgg(field('每九局三振'))).toBe('avg');
  });

  it('維度放進數值槽位就計數', () => {
    expect(defaultAgg(field('門市名稱', { dataType: 'text', role: 'dimension' }))).toBe('count');
  });

  it('0/1 旗標不論角色都加總，代表符合的筆數', () => {
    expect(defaultAgg(field('是否合格打者', { dataType: 'integer' }))).toBe('sum');
    expect(defaultAgg(field('是否春節月', { dataType: 'integer', role: 'dimension' }))).toBe('sum');
    expect(
      defaultAgg(field('促銷', { dataType: 'integer', unit: '1=是', role: 'dimension' })),
    ).toBe('sum');
  });
});
