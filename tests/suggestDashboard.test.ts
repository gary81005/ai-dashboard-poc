import { describe, expect, it } from 'vitest';
import type { DataTable, Dataset, DatasetRows, Field, LayoutItem } from '../src/types/index.ts';
import { profileTable } from '../src/utils/fieldKinds.ts';
import { mainTableOptions, suggestDashboard } from '../src/utils/suggestDashboard.ts';
import { checkWidget } from '../src/utils/widgetChecks.ts';
import { loadWorkbook } from './workbooks.ts';
import type { WorkbookName } from './workbooks.ts';

const WORKBOOKS: WorkbookName[] = ['sample', 'performance', 'restaurant', 'mlb'];

function datasetOf(tables: DataTable[]): Dataset {
  return { id: 'd', name: 'd', fileName: 'd.xlsx', uploadedAt: '', tables };
}

async function workbook(name: WorkbookName) {
  const parsed = await loadWorkbook(name);
  return { dataset: datasetOf(parsed.tables), rows: parsed.rows };
}

const overlaps = (a: LayoutItem, b: LayoutItem) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('mainTableOptions', () => {
  it('明細表優先，再依量值欄位數、列數排序', async () => {
    const { dataset, rows } = await workbook('sample');
    const options = mainTableOptions(dataset, rows);
    expect(options[0].table.key).toBe('tbl_fact_monthly');
    expect(options[0].kind).toBe('fact');
    const facts = options.filter((o) => o.kind === 'fact');
    expect(options.slice(0, facts.length)).toEqual(facts);
  });

  it('不列出隱藏的表、主檔與參數表', async () => {
    const { dataset, rows } = await workbook('restaurant');
    const hidden = {
      ...dataset,
      tables: dataset.tables.map((t) =>
        t.key === 'tbl_fact_monthly' ? { ...t, hidden: true } : t,
      ),
    };
    const options = mainTableOptions(hidden, rows);
    expect(options.map((o) => o.table.key)).not.toContain('tbl_fact_monthly');
    for (const o of options) expect(['dimension', 'parameter']).not.toContain(o.kind);
  });
});

describe('suggestDashboard', () => {
  it('範例活頁簿：依 ADR 0010 §6 的順序產生', async () => {
    const { dataset, rows } = await workbook('sample');
    const { widgets, layout, filters } = suggestDashboard(dataset, rows, 'tbl_fact_monthly');
    expect(widgets.map((w) => w.type)).toEqual([
      'kpi',
      'kpi',
      'kpi',
      'kpi',
      'combo',
      'pie',
      'bar',
      'bar',
      'scatter',
      'table',
    ]);
    expect(widgets.map((w) => w.title)).toContain('營業額、營業利益率趨勢');
    expect(widgets.map((w) => w.title)).toContain('營業利益率排行 Top 10（門市名稱）');
    // KPI 卡一列 4 張、每張 3 × 3。
    expect(layout.slice(0, 4).map(({ x, y, w, h }) => [x, y, w, h])).toEqual([
      [0, 0, 3, 3],
      [3, 0, 3, 3],
      [6, 0, 3, 3],
      [9, 0, 3, 3],
    ]);
    expect(filters.map((f) => f.field.header)).toEqual(['區域']);
  });

  it.each(WORKBOOKS)('%s：元件、版面與篩選都合理', async (name) => {
    const { dataset, rows } = await workbook(name);
    const [main] = mainTableOptions(dataset, rows);
    const { widgets, layout, filters } = suggestDashboard(dataset, rows, main.table.key);
    const profiles = profileTable(main.table, rows[main.table.key]);

    expect(widgets.length).toBeGreaterThan(0);
    expect(widgets.length).toBeLessThanOrEqual(12);
    expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
    expect(layout.map((l) => l.i)).toEqual(widgets.map((w) => w.id));
    for (const item of layout) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x + item.w).toBeLessThanOrEqual(12);
    }
    for (const [i, a] of layout.entries()) {
      for (const b of layout.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
    for (const widget of widgets) {
      expect(widget.table).toBe(main.table.key);
      expect(widget.description).toBeTruthy();
      const { warnings } = checkWidget(widget, main.table, rows[main.table.key], profiles);
      expect(warnings.filter((w) => w.level === 'warning')).toEqual([]);
    }

    expect(filters.length).toBeLessThanOrEqual(3);
    for (const filter of filters) {
      const field = main.table.fields.find((f) => f.header === filter.field.header);
      expect(field?.role).toBe('dimension');
    }
  });

  it('週期時間搭配值少的序列時間時加入同期比較，篩選加上序列時間', async () => {
    const { dataset, rows } = await workbook('restaurant');
    const { widgets, filters } = suggestDashboard(dataset, rows, 'tbl_fact_monthly');
    expect(widgets.some((w) => w.title.endsWith('同期比較'))).toBe(true);
    expect(filters.at(-1)?.field.header).toBe('年');
  });

  describe('小資料表', () => {
    const field = (header: string, extra: Partial<Field> = {}): Field => ({
      header,
      dataType: 'integer',
      role: 'measure',
      ...extra,
    });
    const table: DataTable = {
      key: 'tbl_fact_t',
      sheetName: '明細',
      hidden: false,
      rowCount: 6,
      fields: [field('年月', { dataType: 'text', role: 'dimension' }), field('營業額')],
    };
    const rows: DatasetRows = {
      tbl_fact_t: ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'].map(
        (month, i) => ({ 年月: month, 營業額: 100 + i }),
      ),
    };

    it('一列只有一個元件時撐滿整列寬度', () => {
      const { widgets, layout } = suggestDashboard(datasetOf([table]), rows, 'tbl_fact_t');
      expect(widgets.map((w) => w.type)).toEqual(['kpi', 'line']);
      expect(layout.map((l) => l.w)).toEqual([12, 12]);
    });

    it('年月值再少也不當篩選', () => {
      const { filters } = suggestDashboard(datasetOf([table]), rows, 'tbl_fact_t');
      expect(filters).toEqual([]);
    });

    it('識別值很多、但兩個數值都有的不到 5 個時不放散佈圖', () => {
      const people: DataTable = {
        ...table,
        rowCount: 8,
        fields: [
          field('姓名', { dataType: 'text', role: 'dimension' }),
          field('月薪'),
          field('年資'),
        ],
      };
      const peopleRows: DatasetRows = {
        tbl_fact_t: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
          姓名: `員工${n}`,
          月薪: n * 1000,
          年資: n <= 2 ? n : null,
        })),
      };
      const { widgets } = suggestDashboard(datasetOf([people]), peopleRows, 'tbl_fact_t');
      expect(widgets.length).toBeGreaterThan(0);
      expect(widgets.map((w) => w.type)).not.toContain('scatter');
    });

    it('沒有量值、或找不到資料表時是空的建議', () => {
      const empty = { widgets: [], layout: [], filters: [] };
      const dims: DataTable = { ...table, fields: [table.fields[0]] };
      expect(suggestDashboard(datasetOf([dims]), rows, 'tbl_fact_t')).toEqual(empty);
      expect(suggestDashboard(datasetOf([table]), rows, 'tbl_missing')).toEqual(empty);
      expect(mainTableOptions(datasetOf([dims]), rows)).toEqual([]);
    });
  });
});
