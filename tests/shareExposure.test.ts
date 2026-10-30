import { describe, expect, it } from 'vitest';
import type { Dataset, DatasetRows, Widget } from '../src/types/index.ts';
import { exposedWidgets } from '../src/utils/shareExposure.ts';

// 40 位客戶（每筆不同，是「代號／名稱」）分在 2 個區域（分類）。
const rows: DatasetRows = {
  sales: Array.from({ length: 40 }, (_, i) => ({
    客戶: `客戶${String(i).padStart(2, '0')}`,
    區域: i % 2 === 0 ? '北區' : '南區',
    營業額: 100 + i,
    來客數: i,
  })),
};
const dataset: Dataset = {
  id: 'ds',
  name: '業績',
  fileName: '業績.xlsx',
  uploadedAt: '2026-10-30T00:00:00.000Z',
  tables: [
    {
      key: 'sales',
      sheetName: '業績',
      hidden: false,
      rowCount: 40,
      fields: [
        { header: '客戶', dataType: 'text', role: 'dimension' },
        { header: '區域', dataType: 'text', role: 'dimension' },
        { header: '營業額', dataType: 'number', role: 'measure' },
        { header: '來客數', dataType: 'integer', role: 'measure' },
      ],
    },
  ],
};

const base = { title: '', table: 'sales', filters: [] };
const revenue = { field: { header: '營業額' }, agg: 'sum' as const };
const reasons = (widgets: Widget[]) =>
  exposedWidgets(widgets, dataset, rows).map((e) => [e.widget.id, e.reason]);

describe('exposedWidgets', () => {
  it('明細表、依客戶分組的表格、散佈圖、客戶排行會露出逐筆資料', () => {
    expect(
      reasons([
        {
          ...base,
          id: 'detail',
          type: 'table',
          encoding: { columns: [{ field: { header: '客戶' } }] },
        },
        {
          ...base,
          id: 'byCustomer',
          type: 'table',
          encoding: { columns: [{ field: { header: '客戶' } }, revenue] },
        },
        {
          ...base,
          id: 'scatter',
          type: 'scatter',
          encoding: { x: revenue, y: { field: { header: '來客數' }, agg: 'sum' } },
        },
        {
          ...base,
          id: 'ranking',
          type: 'bar',
          encoding: { x: { field: { header: '客戶' } }, y: [revenue] },
        },
      ]),
    ).toEqual([
      ['detail', '列出每一筆資料'],
      ['byCustomer', '依「客戶」逐一列出'],
      ['scatter', '每一筆資料一個點'],
      ['ranking', '每個「客戶」各一個值'],
    ]);
  });

  it('依分類彙總、KPI 與文字元件不算', () => {
    expect(
      reasons([
        {
          ...base,
          id: 'byRegion',
          type: 'bar',
          encoding: { x: { field: { header: '區域' } }, y: [revenue] },
        },
        {
          ...base,
          id: 'regionTable',
          type: 'table',
          encoding: { columns: [{ field: { header: '區域' } }, revenue] },
        },
        { ...base, id: 'kpi', type: 'kpi', encoding: { value: revenue } },
        { ...base, id: 'note', type: 'text', table: '', encoding: {}, content: '說明' },
      ]),
    ).toEqual([]);
  });
});
