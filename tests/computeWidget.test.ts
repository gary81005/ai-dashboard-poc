import { describe, expect, it } from 'vitest';
import type { DataTable, Row } from '../src/types/index.ts';
import { computeWidget } from '../src/utils/computeWidget.ts';
import type { DataWidget } from '../src/utils/computeWidget.ts';
import type { QueryContext } from '../src/utils/query.ts';

const table: DataTable = {
  key: 't',
  sheetName: 't',
  hidden: false,
  rowCount: 4,
  fields: [
    { header: '門市', dataType: 'text', role: 'dimension' },
    {
      header: '是否新店',
      dataType: 'integer',
      role: 'dimension',
      valueLabels: { 1: '是', 0: '否' },
    },
    { header: '營業額', dataType: 'number', role: 'measure' },
    { header: '來客數', dataType: 'integer', role: 'measure' },
  ],
};
const rows: Row[] = [
  { 門市: 'A', 是否新店: 1, 營業額: 1000, 來客數: 10 },
  { 門市: 'B', 是否新店: 0, 營業額: 3000, 來客數: 30 },
  { 門市: 'C', 是否新店: 0, 營業額: 2000, 來客數: 20 },
  { 門市: 'D', 是否新店: 1, 營業額: 0, 來客數: 0 },
];
const ctx: QueryContext = { table, rows, filters: [] };

const base = { id: 'w', title: '', table: 't', filters: [] };
const revenue = { field: { header: '營業額' }, agg: 'sum' as const };
const visitors = { field: { header: '來客數' }, agg: 'sum' as const };

describe('computeWidget', () => {
  it('設定不完整時回傳提示，不查詢', () => {
    const widgets: DataWidget[] = [
      { ...base, type: 'line', encoding: { y: [revenue] } },
      { ...base, type: 'pie', encoding: { value: revenue } },
      { ...base, type: 'scatter', encoding: { x: revenue } },
      { ...base, type: 'gauge', encoding: {} },
      { ...base, type: 'table', encoding: { columns: [] } },
    ];
    for (const widget of widgets) {
      expect(computeWidget(widget, ctx)).toMatchObject({ status: 'message', tone: 'muted' });
    }
  });

  it('欄位遺失轉成錯誤訊息，不丟出例外', () => {
    const result = computeWidget(
      { ...base, type: 'kpi', encoding: { value: { field: { header: '毛利' }, agg: 'sum' } } },
      ctx,
    );
    expect(result).toEqual({
      status: 'message',
      tone: 'error',
      message: '欄位遺失：「毛利」不在目前的資料表中，請重新指定欄位',
    });
  });

  it('長條圖在這裡排序並只留前 N 個', () => {
    const result = computeWidget(
      {
        ...base,
        type: 'bar',
        encoding: { x: { field: { header: '門市' } }, y: [revenue] },
        options: { sort: 'desc', limit: 2 },
      },
      ctx,
    );
    expect(result.status === 'ok' && result.type === 'bar' && result.data.categories).toEqual([
      'B',
      'C',
    ]);
  });

  it('雷達圖少於 3 個軸時回傳提示', () => {
    const result = computeWidget(
      { ...base, type: 'radar', encoding: { x: { field: { header: '是否新店' } }, y: [revenue] } },
      ctx,
    );
    expect(result).toMatchObject({ status: 'message', message: expect.stringContaining('3 個軸') });
  });

  it('篩選後沒有資料時回傳提示', () => {
    const result = computeWidget(
      {
        ...base,
        type: 'line',
        encoding: { x: { field: { header: '門市' } }, y: [revenue] },
      },
      { ...ctx, filters: [{ field: { header: '門市' }, op: 'in', values: ['Z'] }] },
    );
    expect(result).toEqual({ status: 'message', tone: 'muted', message: '沒有符合條件的資料' });
  });

  // 分享連結把結果存成 JSON（ADR 0012），轉換前後必須一樣。
  it('每種圖表的結果都能轉成 JSON 再還原', () => {
    const widgets: DataWidget[] = [
      {
        ...base,
        type: 'bar',
        encoding: {
          x: { field: { header: '門市' } },
          y: [revenue],
          group: { field: { header: '是否新店' } },
        },
      },
      {
        ...base,
        type: 'combo',
        encoding: {
          x: { field: { header: '門市' } },
          y: [
            { ...revenue, mark: 'bar', axis: 'left' },
            { ...visitors, mark: 'line', axis: 'right' },
          ],
        },
      },
      { ...base, type: 'radar', encoding: { x: { field: { header: '門市' } }, y: [revenue] } },
      {
        ...base,
        type: 'pie',
        encoding: { category: { field: { header: '是否新店' } }, value: revenue },
      },
      {
        ...base,
        type: 'scatter',
        encoding: { x: revenue, y: visitors, detail: { field: { header: '門市' } } },
      },
      { ...base, type: 'gauge', encoding: { value: revenue } },
      { ...base, type: 'kpi', encoding: { value: revenue, trend: { field: { header: '門市' } } } },
      {
        ...base,
        type: 'table',
        encoding: { columns: [{ field: { header: '是否新店' } }, { ...revenue }] },
      },
    ];
    for (const widget of widgets) {
      const result = computeWidget(widget, ctx);
      expect(result, widget.type).toMatchObject({ status: 'ok', type: widget.type });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });
});
