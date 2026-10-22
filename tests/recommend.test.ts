import { describe, expect, it } from 'vitest';
import type { DataTable, Row, Widget } from '../src/types/index.ts';
import { profileTable } from '../src/utils/fieldKinds.ts';
import { recommend } from '../src/utils/recommend.ts';
import { checkWidget } from '../src/utils/widgetChecks.ts';
import { loadTable, loadWorkbook } from './workbooks.ts';
import type { WorkbookName } from './workbooks.ts';

async function run(workbook: WorkbookName, key: string, selected: string[]) {
  const { table, rows } = await loadTable(workbook, key);
  return recommend(table, rows, profileTable(table, rows), selected);
}

const monthly = (selected: string[]) => run('restaurant', 'tbl_fact_monthly', selected);
const types = (result: Awaited<ReturnType<typeof run>>) =>
  result.recommendations.map((r) => r.widget.type);
const first = (result: Awaited<ReturnType<typeof run>>) => result.recommendations[0].widget;
const headersOf = (slot: { field: { header: string } }[] | undefined) =>
  slot?.map((e) => e.field.header);

function encoding<T extends Widget['type']>(widget: Widget, type: T) {
  expect(widget.type).toBe(type);
  const narrowed = widget as Extract<Widget, { type: T }>;
  return narrowed.encoding as Extract<Widget, { type: T }>['encoding'];
}

describe('共通規則', () => {
  it('沒有勾選時沒有推薦', async () => {
    expect((await monthly([])).recommendations).toEqual([]);
  });

  it('表格永遠在最後，第一個標示最推薦', async () => {
    const result = await monthly(['區域', '營業額']);
    expect(types(result).at(-1)).toBe('table');
    expect(result.recommendations.map((r) => r.best)).toEqual([true, false, false]);
    expect(result.recommendations.every((r) => r.reason.length > 0)).toBe(true);
  });

  it('依 Excel 的欄位順序，與勾選順序無關', async () => {
    const a = await monthly(['營業額', '年月']);
    const b = await monthly(['年月', '營業額']);
    expect(types(a)).toEqual(types(b));
  });

  it('勾太多：維度超過 2 個時只給表格', async () => {
    const result = await monthly(['年月', '區域', '店型', '營業額']);
    expect(types(result)).toEqual(['table']);
    expect(result.notice).toContain('勾太多');
  });

  it('勾太多：量值超過 4 個時只給表格', async () => {
    const result = await monthly(['區域', '營業額', '來客數', '食材成本', '人事成本', '租金']);
    expect(types(result)).toEqual(['table']);
  });

  it('只有 1 種值的分類不推薦圖表', () => {
    const table: DataTable = {
      key: 't',
      sheetName: 't',
      hidden: false,
      rowCount: 2,
      fields: [
        { header: '區域', dataType: 'text', role: 'dimension' },
        { header: '營業額', dataType: 'number', role: 'measure' },
      ],
    };
    const rows: Row[] = [
      { 區域: '北區', 營業額: 1 },
      { 區域: '北區', 營業額: 2 },
    ];
    const result = recommend(table, rows, profileTable(table, rows), ['區域', '營業額']);
    expect(result.recommendations.map((r) => r.widget.type)).toEqual(['table']);
    expect(result.notice).toContain('只有 1 種值');
  });

  it('表格：有維度時分組彙總並顯示合計', async () => {
    const table = (await monthly(['區域', '營業額'])).recommendations.at(-1)!.widget;
    expect(encoding(table, 'table').columns).toMatchObject([
      { field: { header: '區域' } },
      { field: { header: '營業額' }, agg: 'sum' },
    ]);
    expect(table.type === 'table' && table.options).toEqual({ totals: true });
  });
});

describe('組合對照表', () => {
  it('1. 1 個量值：KPI 卡，趨勢用不同值最多的序列時間', async () => {
    const result = await monthly(['營業額']);
    expect(types(result)).toEqual(['kpi', 'table']);
    expect(encoding(first(result), 'kpi').trend).toMatchObject({ field: { header: '年月' } });
  });

  it('1. 比率另外推薦儀表圖，彙總用平均', async () => {
    const result = await monthly(['營業利益率']);
    expect(types(result)).toEqual(['kpi', 'gauge', 'table']);
    expect(encoding(first(result), 'kpi').value?.agg).toBe('avg');
  });

  it('2. 序列時間 ＋ 同單位量值：折線、長條', async () => {
    const result = await monthly(['年', '營業額', '總成本']);
    expect(types(result)).toEqual(['line', 'bar', 'table']);
    expect(first(result).title).toBe('營業額、總成本趨勢');
  });

  it('2. 超過 30 個時間點時不推薦長條（時間軸不能排序取前 N）', async () => {
    expect(types(await monthly(['年月', '營業額', '總成本']))).toEqual(['line', 'table']);
  });

  it('3. 序列時間 ＋ M ＋ R：組合圖，M 長條左軸、R 折線右軸', async () => {
    const result = await monthly(['年月', '營業額', '營業利益率']);
    expect(types(result)).toEqual(['combo', 'table']);
    expect(encoding(first(result), 'combo').y).toMatchObject([
      { field: { header: '營業額' }, agg: 'sum', mark: 'bar', axis: 'left' },
      { field: { header: '營業利益率' }, agg: 'avg', mark: 'line', axis: 'right' },
    ]);
  });

  it('單位：橫跨 2 個群組時改組合圖，3 個以上只給表格', async () => {
    expect(types(await monthly(['年月', '營業額', '來客數']))).toEqual(['combo', 'table']);
    expect(types(await monthly(['年月', '營業額', '來客數', '營業利益率']))).toEqual(['table']);
  });

  it('2. 時間點少於 3 個時不畫折線', async () => {
    expect(types(await run('sample', 'tbl_fact_monthly', ['年', '營業額']))).toEqual(['table']);
  });

  it('4. 序列時間 ＋「少」級分類 ＋ M：依分類分線、堆疊長條', async () => {
    const result = await monthly(['年', '區域', '營業額']);
    expect(types(result)).toEqual(['line', 'bar', 'table']);
    expect(encoding(first(result), 'line').group).toMatchObject({ field: { header: '區域' } });
    const bar = result.recommendations[1].widget;
    expect(bar.type === 'bar' && bar.options?.stacked).toBe(true);
  });

  it('4. 時間點少於 3 個時不畫折線', async () => {
    expect(types(await run('sample', 'tbl_fact_monthly', ['年', '區域', '營業額']))).toEqual([
      'table',
    ]);
  });

  it('4. 比率不推薦堆疊', async () => {
    expect(types(await monthly(['年月', '區域', '營業利益率']))).toEqual(['line', 'table']);
  });

  it('5. 週期 ＋ 序列時間 ＋ 量值：同期比較', async () => {
    const result = await monthly(['年', '月', '營業額']);
    expect(types(result)).toEqual(['line', 'bar', 'table']);
    const { x, group } = encoding(first(result), 'line');
    expect([x?.field.header, group?.field.header]).toEqual(['月', '年']);
  });

  it('6. 分類 ＋ M：長條、圓餅（「少」級、值全為正）', async () => {
    const result = await monthly(['區域', '營業額']);
    expect(types(result)).toEqual(['bar', 'pie', 'table']);
    expect(first(result).title).toBe('各區域營業額');
  });

  it('6. 週期時間單獨使用時當成「中」級分類，不推薦圓餅', async () => {
    expect(types(await monthly(['月', '營業額']))).toEqual(['bar', 'table']);
  });

  it('6. 0/1 旗標當成「少」級分類', async () => {
    const result = await run('mlb', 'tbl_fact_batting', ['全壘打', '是否合格打者']);
    expect(types(result)).toEqual(['bar', 'pie', 'table']);
  });

  it('6.「多」級分類的長條改橫式、由大到小', async () => {
    const result = await run('mlb', 'tbl_fact_batting', ['球隊中文名', '全壘打']);
    const bar = first(result);
    expect(bar.type === 'bar' && bar.options).toEqual({ horizontal: true, sort: 'desc' });
  });

  it('7. 分類 ＋ R：由大到小的長條，不推薦圓餅', async () => {
    const result = await monthly(['區域', '營業利益率']);
    expect(types(result)).toEqual(['bar', 'table']);
    const bar = first(result);
    expect(bar.type === 'bar' && bar.options?.sort).toBe('desc');
  });

  it('8. 分類 ＋ 2～4 個同單位量值：分組長條、雷達', async () => {
    const result = await monthly(['區域', '營業額', '總成本']);
    expect(types(result)).toEqual(['bar', 'radar', 'table']);
    expect(headersOf(encoding(first(result), 'bar').y)).toEqual(['營業額', '總成本']);
  });

  it('8. 單位不同時改組合圖', async () => {
    expect(types(await monthly(['區域', '營業額', '來客數']))).toEqual(['combo', 'table']);
  });

  it('9. 分類 ＋「少」級分類 ＋ M：X＝值較多的分類，堆疊、分組', async () => {
    const result = await run('restaurant', 'tbl_fact_channel', ['通路類型', '通路名稱', '營業額']);
    expect(types(result)).toEqual(['bar', 'bar', 'table']);
    const { x, group } = encoding(first(result), 'bar');
    expect([x?.field.header, group?.field.header]).toEqual(['通路名稱', '通路類型']);
    const stacked = first(result);
    expect(stacked.type === 'bar' && stacked.options?.stacked).toBe(true);
  });

  it('9. 比率不堆疊，只給分組', async () => {
    const result = await run('restaurant', 'tbl_fact_channel', [
      '通路名稱',
      '通路類型',
      '平均訂單金額',
    ]);
    expect(types(result)).toEqual(['bar', 'table']);
    const bar = first(result);
    expect(bar.type === 'bar' && bar.options?.stacked).toBeFalsy();
  });

  it('10. 識別 ＋ 量值：排行（橫式、由大到小、前 10）', async () => {
    const result = await monthly(['門市名稱', '營業額']);
    expect(types(result)).toEqual(['bar', 'table']);
    const bar = first(result);
    expect(bar.type === 'bar' && bar.options).toEqual({
      horizontal: true,
      sort: 'desc',
      limit: 10,
    });
    expect(bar.title).toBe('營業額排行 Top 10（門市名稱）');
  });

  it('11. 識別 ＋ 2 個量值：散佈圖，明細＝識別', async () => {
    const result = await monthly(['門市名稱', '營業額', '來客數']);
    expect(types(result)).toEqual(['scatter', 'table']);
    expect(encoding(first(result), 'scatter').detail).toMatchObject({
      field: { header: '門市名稱' },
    });
  });

  it('11. 加上「少」級分類當顏色', async () => {
    const result = await monthly(['門市名稱', '區域', '營業額', '來客數']);
    expect(encoding(first(result), 'scatter').color).toMatchObject({ field: { header: '區域' } });
  });

  it('12. 2 個量值、沒有維度：每列一點；超過 2,000 列只給表格', async () => {
    expect(types(await monthly(['營業額', '來客數']))).toEqual(['scatter', 'table']);
    expect(types(await run('restaurant', 'tbl_fact_channel', ['營業額', '來客數']))).toEqual([
      'table',
    ]);
  });

  it('12. 少於 5 個點時不推薦散佈圖', () => {
    const table: DataTable = {
      key: 't',
      sheetName: 't',
      hidden: false,
      rowCount: 3,
      fields: [
        { header: '營業額', dataType: 'number', role: 'measure' },
        { header: '來客數', dataType: 'number', role: 'measure' },
      ],
    };
    const rows: Row[] = [1, 2, 3].map((n) => ({ 營業額: n, 來客數: n }));
    const result = recommend(table, rows, profileTable(table, rows), ['營業額', '來客數']);
    expect(result.recommendations.map((r) => r.widget.type)).toEqual(['table']);
  });

  it('11. 點數看實際畫得出來的點，不是識別值的種類', () => {
    const table: DataTable = {
      key: 't',
      sheetName: 't',
      hidden: false,
      rowCount: 8,
      fields: [
        { header: '姓名', dataType: 'text', role: 'dimension' },
        { header: '月薪', dataType: 'number', role: 'measure' },
        { header: '年資', dataType: 'number', role: 'measure' },
      ],
    };
    // 8 個人只有前 2 人兩個數值都有。
    const rows: Row[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      姓名: `員工${n}`,
      月薪: n * 1000,
      年資: n <= 2 ? n : null,
    }));
    const selected = ['姓名', '月薪', '年資'];
    const result = recommend(table, rows, profileTable(table, rows), selected);
    expect(result.recommendations.map((r) => r.widget.type)).toEqual(['table']);
  });

  it('13. 其他組合只給表格', async () => {
    expect(types(await monthly(['門市名稱', '年月', '營業額']))).toEqual(['table']);
    expect(types(await monthly(['區域']))).toEqual(['table']);
  });
});

// 推薦與警告共用同一套條件：任何推薦出來的候選，建立後都不該立刻觸發正式警告。
// 掃描四份活頁簿每張表前 14 個欄位的所有 1～3 個欄位組合。
describe('推薦與警告一致', () => {
  it.each(['restaurant', 'mlb', 'performance', 'sample'] as const)('%s', async (name) => {
    const parsed = await loadWorkbook(name);
    const violations: string[] = [];
    for (const table of parsed.tables.filter((t) => !t.hidden)) {
      const rows = parsed.rows[table.key];
      const profiles = profileTable(table, rows);
      const headers = table.fields.slice(0, 14).map((f) => f.header);
      const combos: string[][] = [];
      headers.forEach((a, i) => {
        combos.push([a]);
        headers.slice(i + 1).forEach((b, j) => {
          combos.push([a, b]);
          headers.slice(i + j + 2).forEach((c) => combos.push([a, b, c]));
        });
      });
      for (const combo of combos) {
        for (const { widget } of recommend(table, rows, profiles, combo).recommendations) {
          const warnings = checkWidget(widget, table, rows, profiles).warnings;
          for (const w of warnings.filter((x) => x.level === 'warning')) {
            violations.push(`${table.key} [${combo.join('、')}] ${widget.type}：${w.message}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
