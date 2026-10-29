import { describe, expect, it } from 'vitest';
import type { Field } from '../src/types/index.ts';
import { displayUnit, formatCompact, formatValue } from '../src/utils/format.ts';

const revenue: Field = { header: '營業額', dataType: 'number', role: 'measure', numFmt: '#,##0' };
const margin: Field = {
  header: '毛利率',
  dataType: 'percent',
  role: 'measure',
  ratio: true,
  numFmt: '0.0%',
};
const flag: Field = {
  header: '是否回診',
  dataType: 'integer',
  role: 'measure',
  unit: '1=是',
  valueLabels: { '1': '是', '0': '否' },
};

describe('formatValue', () => {
  it('依 numFmt 的小數位數', () => {
    expect(formatValue(revenue, 'sum', 1234.56)).toBe('1,235');
  });

  it('百分比格式的比率欄位', () => {
    expect(formatValue(margin, 'avg', 0.2267)).toBe('22.7%');
  });

  it('count 一律是整數筆數；空值顯示破折號', () => {
    expect(formatValue(margin, 'count', 12)).toBe('12');
    expect(formatValue(revenue, 'sum', null)).toBe('—');
  });
});

describe('套用值標籤的 0/1 欄位', () => {
  it('平均是值為 1 的比例、加總是值為 1 的筆數', () => {
    expect(formatValue(flag, 'avg', 0.35)).toBe('是 35.0%');
    expect(formatValue(flag, 'sum', 1200)).toBe('是 1,200 筆');
  });

  it('最小、最大直接顯示標籤；count 照一般規則', () => {
    expect(formatValue(flag, 'min', 0)).toBe('否');
    expect(formatValue(flag, 'max', 1)).toBe('是');
    expect(formatValue(flag, 'count', 30)).toBe('30');
  });

  it('座標軸與 KPI 大字只顯示數值', () => {
    expect(formatCompact(flag, 'avg', 0.35)).toBe('35.0%');
    expect(formatCompact(flag, 'max', 1)).toBe('是');
  });

  it('停用值標籤時照一般數字顯示', () => {
    const raw = { ...flag, showValueLabels: false };
    expect(formatValue(raw, 'avg', 0.35)).toBe('0.35');
    expect(formatValue(raw, 'sum', 12)).toBe('12');
  });

  it('非二元的對照當量值時不套用', () => {
    const grade: Field = {
      header: '等級',
      dataType: 'integer',
      role: 'measure',
      valueLabels: { '1': '甲', '2': '乙', '3': '丙' },
    };
    expect(formatValue(grade, 'avg', 1.5)).toBe('1.5');
  });

  it('不再顯示單位（「1=是」本來就不是單位）', () => {
    expect(displayUnit({ ...flag, unit: '人' })).toBeUndefined();
    expect(displayUnit({ ...revenue, unit: '元' })).toBe('元');
  });
});
