import { describe, expect, it } from 'vitest';
import type { Dashboard, Dataset, DatasetRows, Widget } from '../src/types/index.ts';
import { buildSnapshot, SNAPSHOT_VERSION } from '../src/utils/shareSnapshot.ts';
import { widgetView } from '../src/utils/widgetView.ts';

const dataset: Dataset = {
  id: 'ds',
  name: '門市業績',
  fileName: '門市業績.xlsx',
  uploadedAt: '2026-10-30T00:00:00.000Z',
  tables: [
    {
      key: 'sales',
      sheetName: '業績',
      hidden: false,
      rowCount: 3,
      fields: [
        { header: '區域', dataType: 'text', role: 'dimension' },
        { header: '門市', dataType: 'text', role: 'dimension' },
        { header: '營業額', dataType: 'number', role: 'measure' },
      ],
    },
  ],
};
const rows: DatasetRows = {
  sales: [
    { 區域: '北區', 門市: 'A', 營業額: 100 },
    { 區域: '北區', 門市: 'B', 營業額: 200 },
    { 區域: '南區', 門市: 'C', 營業額: 300 },
  ],
};

const kpi: Widget = {
  id: 'kpi',
  type: 'kpi',
  title: '營業額',
  table: 'sales',
  filters: [{ field: { header: '門市' }, op: 'in', values: ['A', 'B'] }],
  encoding: { value: { field: { header: '營業額' }, agg: 'sum' } },
};
const text: Widget = {
  id: 'note',
  type: 'text',
  title: '說明',
  table: '',
  filters: [],
  encoding: {},
  content: '金額單位：元',
};
const dashboard: Dashboard = {
  id: 'db',
  name: '業績總覽',
  datasetId: 'ds',
  updatedAt: '2026-10-30T00:00:00.000Z',
  layout: [
    { i: 'kpi', x: 0, y: 0, w: 4, h: 2 },
    { i: 'note', x: 4, y: 0, w: 4, h: 2 },
  ],
  widgets: [kpi, text],
  filters: [{ field: { header: '區域' } }],
};

const valueOf = (result: unknown) =>
  (result as { data?: { value?: number } } | null)?.data?.value ?? null;

describe('widgetView', () => {
  it('套用元件篩選與有對應欄位的儀表板篩選', () => {
    const view = widgetView(kpi, dataset, rows, {
      dashboardFilters: [{ field: { header: '區域' } }, { field: { header: '通路' } }],
      filterValues: { 區域: ['北區'], 通路: ['門市'] },
    });
    expect(view.filterSummary).toBe('門市：A、B');
    expect(view.skipped).toEqual(['通路']);
    expect(valueOf(view.result)).toBe(300);
  });

  it('資料表不在資料集中時回傳錯誤訊息', () => {
    const view = widgetView({ ...kpi, table: 'gone' }, dataset, rows);
    expect(view.result).toMatchObject({ status: 'message', tone: 'error' });
  });

  it('沒有欄位的元件依模式顯示不同提示', () => {
    const empty: Widget = { ...kpi, filters: [], encoding: {} };
    expect(widgetView(empty, dataset, rows).result).toMatchObject({ message: '尚未設定欄位' });
    expect(widgetView(empty, dataset, rows, { editing: true }).result).toMatchObject({
      message: expect.stringContaining('放置區'),
    });
  });
});

describe('buildSnapshot', () => {
  const snapshot = buildSnapshot(dashboard, dataset, rows);

  it('帶版本、名稱與版面', () => {
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot.name).toBe('業績總覽');
    expect(snapshot.layout).toEqual(dashboard.layout);
  });

  it('元件篩選照設定套用，但只留摘要，不放篩選值', () => {
    const shared = snapshot.widgets[0];
    expect(valueOf(shared.result)).toBe(300);
    expect(shared.filterSummary).toBe('門市：A、B');
    expect(shared.widget.filters).toEqual([]);
  });

  it('儀表板篩選一律算全部，也不放篩選欄位', () => {
    expect(JSON.stringify(snapshot)).not.toContain('區域');
  });

  it('文字元件沒有結果，內容照原樣分享', () => {
    expect(snapshot.widgets[1]).toMatchObject({
      result: null,
      widget: { content: '金額單位：元' },
    });
  });

  it('不含原始資料列，可以轉成 JSON 再還原', () => {
    expect(JSON.stringify(snapshot)).not.toContain('"門市":"C"');
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
