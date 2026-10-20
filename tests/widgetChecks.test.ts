import { describe, expect, it } from 'vitest';
import type { Measure, Widget } from '../src/types/index.ts';
import { profileTable } from '../src/utils/fieldKinds.ts';
import { checkWidget, nextStep } from '../src/utils/widgetChecks.ts';
import { createWidget } from '../src/utils/widgetEditing.ts';
import { loadTable } from './workbooks.ts';
import type { WorkbookName } from './workbooks.ts';

const ref = (header: string) => ({ field: { header } });
const m = (header: string, agg: Measure['agg'] = 'sum'): Measure => ({ field: { header }, agg });
const base = (table: string) => ({ id: 'w1', title: '我的圖', table, filters: [] });

async function check(workbook: WorkbookName, widget: Widget) {
  const { table, rows } = await loadTable(workbook, widget.table);
  return checkWidget(widget, table, rows, profileTable(table, rows));
}

const MONTHLY = 'tbl_fact_monthly';
const levels = (result: Awaited<ReturnType<typeof check>>) => result.warnings.map((w) => w.level);

describe('nextStep', () => {
  it('依槽位順序提示第一個還沒放的必要槽位', () => {
    const line = createWidget('line');
    expect(nextStep(line)).toBe('下一步：把一個時間欄位拖到「X 軸」');
    expect(nextStep({ ...line, encoding: { x: ref('年月'), y: [] } } as Widget)).toBe(
      '下一步：把一個數值欄位拖到「Y 軸數值」',
    );
    expect(nextStep(createWidget('gauge'))).toBe('下一步：把一個比率欄位拖到「數值」');
    expect(nextStep(createWidget('table'))).toBe('下一步：把要列出的欄位拖到「欄位」');
  });

  it('組合圖只有一個數值時提示再放一個', () => {
    const combo: Widget = {
      ...base(MONTHLY),
      type: 'combo',
      encoding: { x: ref('年月'), y: [{ ...m('營業額'), mark: 'bar', axis: 'left' }] },
    };
    expect(nextStep(combo)).toContain('右軸折線');
  });

  it('必要槽位都放好時沒有提示；文字元件沒有槽位', () => {
    const line: Widget = {
      ...base(MONTHLY),
      type: 'line',
      encoding: { x: ref('年月'), y: [m('營業額')] },
    };
    expect(nextStep(line)).toBeUndefined();
    expect(nextStep(createWidget('text'))).toBeUndefined();
  });
});

describe('違反條件', () => {
  it('圓餅超過 6 類：警告並改用排行，保留自訂標題與篩選', async () => {
    const pie: Widget = {
      ...base(MONTHLY),
      filters: [{ field: { header: '區域' }, op: 'in', values: ['北區'] }],
      type: 'pie',
      encoding: { category: ref('門市名稱'), value: m('營業額') },
    };
    const result = await check('restaurant', pie);
    expect(result.warnings[0].message).toContain('24 種');
    expect(result.fix?.type).toBe('bar');
    expect(result.fix).toMatchObject({ id: 'w1', title: '我的圖', filters: pie.filters });
  });

  it('預設標題會換成推薦的標題', async () => {
    const pie: Widget = {
      ...base(MONTHLY),
      title: '圓餅圖',
      type: 'pie',
      encoding: { category: ref('門市名稱'), value: m('營業額') },
    };
    expect((await check('restaurant', pie)).fix?.title).toBe('營業額排行 Top 10（門市名稱）');
  });

  it('圓餅的量值是比率', async () => {
    const pie: Widget = {
      ...base(MONTHLY),
      type: 'pie',
      encoding: { category: ref('區域'), value: m('營業利益率', 'avg') },
    };
    const result = await check('restaurant', pie);
    expect(result.warnings.map((w) => w.message).join()).toContain('不適合圓餅圖');
  });

  it('折線的 X 軸不是時間：改用長條', async () => {
    const line: Widget = {
      ...base(MONTHLY),
      type: 'line',
      encoding: { x: ref('區域'), y: [m('營業額')] },
    };
    const result = await check('restaurant', line);
    expect(result.warnings[0].message).toContain('不是時間');
    expect(result.fix?.type).toBe('bar');
  });

  it('折線的時間點少於 3 個', async () => {
    const line: Widget = {
      ...base(MONTHLY),
      type: 'line',
      encoding: { x: ref('年'), y: [m('營業額')] },
    };
    expect((await check('sample', line)).warnings[0].message).toContain('只有 1 個時間點');
  });

  it('比率堆疊', async () => {
    const bar: Widget = {
      ...base(MONTHLY),
      type: 'bar',
      encoding: { x: ref('年月'), y: [m('營業利益率', 'avg')], group: ref('區域') },
      options: { stacked: true },
    };
    expect((await check('restaurant', bar)).warnings[0].message).toContain('堆疊');
  });

  it('雷達的軸超過 12 個', async () => {
    const radar: Widget = {
      ...base(MONTHLY),
      type: 'radar',
      encoding: { x: ref('門市名稱'), y: [m('營業額')] },
    };
    expect((await check('restaurant', radar)).warnings[0].message).toContain('24 個');
  });

  it('散佈圖少於 5 個點', async () => {
    const scatter: Widget = {
      ...base(MONTHLY),
      type: 'scatter',
      encoding: { x: m('營業額'), y: m('來客數'), detail: ref('區域') },
    };
    expect((await check('restaurant', scatter)).warnings[0].message).toContain('只有 4 個點');
  });
});

describe('通用檢查', () => {
  it('沒有分子分母的比率用了加總：警告，改用建議取平均', async () => {
    const kpi: Widget = {
      ...base('tbl_fact_batting'),
      type: 'kpi',
      encoding: { value: m('上壘率') },
    };
    const result = await check('mlb', kpi);
    expect(levels(result)).toEqual(['warning']);
    expect(result.fix?.type === 'kpi' && result.fix.encoding.value?.agg).toBe('avg');
  });

  it('推測比率做平均：只是提示，附「到資料集頁標記」，沒有改用建議', async () => {
    const kpi: Widget = {
      ...base('tbl_fact_batting'),
      type: 'kpi',
      encoding: { value: m('上壘率', 'avg') },
    };
    const result = await check('mlb', kpi);
    expect(result.warnings).toMatchObject([{ level: 'tip', markRatio: true }]);
    expect(result.fix).toBeUndefined();
  });

  it('加權比率不提醒', async () => {
    const kpi: Widget = {
      ...base('tbl_fact_batting'),
      type: 'kpi',
      encoding: { value: m('打擊率', 'avg') },
    };
    expect((await check('mlb', kpi)).warnings).toEqual([]);
  });

  it('同一條 Y 軸混了不同單位：改用組合圖', async () => {
    const line: Widget = {
      ...base(MONTHLY),
      type: 'line',
      encoding: { x: ref('年月'), y: [m('營業額'), m('來客數')] },
    };
    const result = await check('restaurant', line);
    expect(result.warnings[0].message).toContain('營業額、來客數');
    expect(result.fix?.type).toBe('combo');
  });

  it('組合圖的左右軸分開算', async () => {
    const combo: Widget = {
      ...base(MONTHLY),
      type: 'combo',
      encoding: {
        x: ref('年月'),
        y: [
          { ...m('營業額'), mark: 'bar', axis: 'left' },
          { ...m('來客數'), mark: 'line', axis: 'right' },
        ],
      },
    };
    expect((await check('restaurant', combo)).warnings).toEqual([]);
  });

  it('長條 X 軸超過 30 種值卻沒排序：改用排行', async () => {
    const bar: Widget = {
      ...base('tbl_fact_batting'),
      type: 'bar',
      encoding: { x: ref('球員姓名'), y: [m('全壘打')] },
    };
    const result = await check('mlb', bar);
    expect(result.warnings[0].message).toContain('376 種');
    expect(result.fix?.type === 'bar' && result.fix.options?.limit).toBe(10);
    const sorted: Widget = { ...bar, options: { sort: 'desc', limit: 10 } };
    expect((await check('mlb', sorted)).warnings).toEqual([]);
  });
});

describe('其他', () => {
  it('設定正確的元件沒有警告', async () => {
    const bar: Widget = {
      ...base(MONTHLY),
      type: 'bar',
      encoding: { x: ref('區域'), y: [m('營業額')] },
    };
    expect(await check('restaurant', bar)).toEqual({
      nextStep: undefined,
      warnings: [],
      fix: undefined,
    });
  });

  it('欄位不在資料表裡時不檢查', async () => {
    const pie: Widget = {
      ...base(MONTHLY),
      type: 'pie',
      encoding: { category: ref('不存在'), value: m('營業額') },
    };
    expect((await check('restaurant', pie)).warnings).toEqual([]);
  });
});
