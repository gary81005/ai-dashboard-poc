import { describe, expect, it } from 'vitest';
import type { DataTable, Row } from '../src/types/index.ts';
import { queryTable } from '../src/utils/query.ts';

const table: DataTable = {
  key: 't',
  sheetName: 't',
  hidden: false,
  rowCount: 2,
  fields: [
    { header: '門市', dataType: 'text', role: 'dimension' },
    { header: '營業額', dataType: 'number', role: 'measure' },
    { header: '平均客單價', dataType: 'number', role: 'measure' },
    { header: '毛利率', dataType: 'number', role: 'measure', ratio: true },
  ],
};
const rows: Row[] = [
  { 門市: 'A', 營業額: 1000, 平均客單價: 100, 毛利率: 0.3 },
  { 門市: 'B', 營業額: 2000, 平均客單價: 200, 毛利率: 0.4 },
];

describe('queryTable 合計', () => {
  it('明細表：可加總量值加總，比率與推測比率不合計', () => {
    const result = queryTable({ table, rows, filters: [] }, [
      { field: { header: '門市' } },
      { field: { header: '營業額' } },
      { field: { header: '平均客單價' } },
      { field: { header: '毛利率' } },
    ]);
    expect(Object.values(result.totals)).toEqual([null, 3000, null, null]);
  });

  it('忽略過比率建議的欄位照常合計', () => {
    const dismissed: DataTable = {
      ...table,
      fields: table.fields.map((f) =>
        f.header === '平均客單價' ? { ...f, userOverride: ['ratio'] } : f,
      ),
    };
    const result = queryTable({ table: dismissed, rows, filters: [] }, [
      { field: { header: '門市' } },
      { field: { header: '平均客單價' } },
    ]);
    expect(Object.values(result.totals)).toEqual([null, 300]);
  });

  it('有設彙總方式的欄位照彙總方式合計', () => {
    const result = queryTable({ table, rows, filters: [] }, [
      { field: { header: '門市' } },
      { field: { header: '平均客單價' }, agg: 'avg' },
    ]);
    expect(Object.values(result.totals)).toEqual([null, 150]);
  });
});
