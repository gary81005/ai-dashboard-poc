import { describe, expect, it } from 'vitest';
import {
  classifyField,
  groupOf,
  levelOf,
  profileTable,
  profilesOf,
} from '../src/utils/fieldKinds.ts';
import type { FieldKind } from '../src/utils/fieldKinds.ts';
import { isInferredRatio } from '../src/utils/inference.ts';
import type { Field, Row } from '../src/types/index.ts';
import { loadTable } from './workbooks.ts';
import type { WorkbookName } from './workbooks.ts';

const dim = (header: string, extra: Partial<Field> = {}): Field => ({
  header,
  dataType: 'text',
  role: 'dimension',
  ...extra,
});
const measure = (header: string, extra: Partial<Field> = {}): Field => ({
  header,
  dataType: 'number',
  role: 'measure',
  ...extra,
});
const rowsOf = (header: string, values: unknown[]): Row[] =>
  values.map((v) => ({ [header]: v as Row[string] }));

describe('levelOf', () => {
  it.each([
    [1, 'single'],
    [2, 'few'],
    [6, 'few'],
    [7, 'some'],
    [12, 'some'],
    [13, 'many'],
    [30, 'many'],
    [31, 'many'],
  ])('%i 種值 → %s', (distinct, level) => {
    expect(levelOf(distinct)).toBe(level);
  });
});

describe('isInferredRatio', () => {
  it.each(['上壘率', '三振保送比', '整體攻擊指數', '場均', '平均客單價', '每九局三振'])(
    '%s 是推測比率',
    (header) => expect(isInferredRatio(header)).toBe(true),
  );
  it.each(['營業額', '勝場', '得失分差', '實際減預期'])('%s 不是', (header) =>
    expect(isInferredRatio(header)).toBe(false),
  );
});

describe('classifyField 規則邊界', () => {
  it('YYYY-MM 的值是時間序列', () => {
    const field = dim('期間起');
    expect(classifyField(field, rowsOf('期間起', ['2025-01', '2025-02'])).kind).toEqual({
      kind: 'time',
      time: 'sequence',
    });
  });

  it('月、季別是時間週期', () => {
    const field = dim('月', { dataType: 'integer' });
    expect(classifyField(field, rowsOf('月', [1, 2, 3])).kind).toEqual({
      kind: 'time',
      time: 'cycle',
    });
  });

  it('量值角色的「年度」仍是量值（角色由使用者或解析規則決定）', () => {
    const field = measure('年度', { dataType: 'integer' });
    expect(classifyField(field, rowsOf('年度', [2024, 2025])).kind.kind).toBe('measure');
  });

  it('名稱結尾、超過 6 種值是識別', () => {
    const values = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].flatMap((v) => [v, v, v]);
    expect(classifyField(dim('門市名稱'), rowsOf('門市名稱', values)).kind).toEqual({
      kind: 'identifier',
    });
  });

  it('名稱結尾但只有 6 種以內的值仍是分類', () => {
    const values = ['內用', '外帶', '外送'].flatMap((v) => [v, v]);
    expect(classifyField(dim('通路名稱'), rowsOf('通路名稱', values)).kind).toEqual({
      kind: 'category',
      level: 'few',
      flag: false,
    });
  });

  it('超過 30 種值的維度是識別，即使標頭不像', () => {
    const values = Array.from({ length: 31 }, (_, i) => `醫院${i}`).flatMap((v) => [v, v, v]);
    expect(classifyField(dim('醫院'), rowsOf('醫院', values)).kind).toEqual({ kind: 'identifier' });
  });

  it('剛好 30 種值、標頭不像識別，仍是「多」級分類', () => {
    const values = Array.from({ length: 30 }, (_, i) => `產品${i}`).flatMap((v) => [v, v, v]);
    expect(classifyField(dim('產品'), rowsOf('產品', values)).kind).toEqual({
      kind: 'category',
      level: 'many',
      flag: false,
    });
  });

  it('不同值達列數一半以上是識別', () => {
    const values = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'g', 'h', 'i'];
    expect(classifyField(dim('備註'), rowsOf('備註', values)).kind.kind).toBe('identifier');
  });

  it('0/1 旗標不論角色都是分類', () => {
    const field = measure('是否合格', { dataType: 'integer' });
    expect(classifyField(field, rowsOf('是否合格', [0, 1, 1])).kind).toEqual({
      kind: 'category',
      level: 'few',
      flag: true,
    });
  });

  it('值不只 0/1 的「是否」欄位不是旗標', () => {
    const field = measure('是否評分', { dataType: 'integer' });
    expect(classifyField(field, rowsOf('是否評分', [0, 1, 2])).kind.kind).toBe('measure');
  });

  it('比率依序是加權、非加權、推測', () => {
    const rows = rowsOf('x', [0.1]);
    const weighted = measure('利益率', {
      ratio: true,
      ratioOf: { numerator: 'a', denominator: 'b' },
    });
    expect(classifyField(weighted, rows).kind).toEqual({ kind: 'ratio', ratio: 'weighted' });
    expect(classifyField(measure('抽成率', { ratio: true }), rows).kind).toEqual({
      kind: 'ratio',
      ratio: 'unweighted',
    });
    expect(classifyField(measure('防禦率'), rows).kind).toEqual({
      kind: 'ratio',
      ratio: 'inferred',
    });
  });

  it('樣本與範圍', () => {
    const profile = classifyField(dim('區域'), rowsOf('區域', ['北', '中', '北', null, '南']));
    expect(profile.distinct).toBe(3);
    expect(profile.samples).toEqual(['北', '中', '南']);
    const m = classifyField(measure('營業額'), rowsOf('營業額', [5, null, -2, 9]));
    expect(m.range).toEqual({ min: -2, max: 9 });
    expect(m.samples).toEqual([]);
  });
});

// 三份模擬活頁簿與範例檔的實際分類：規則改動時，這裡會指出哪些欄位的類別跟著變了。
const expected: Array<[WorkbookName, string, Record<string, FieldKind>]> = [
  [
    'restaurant',
    'tbl_fact_monthly',
    {
      年月: { kind: 'time', time: 'sequence' },
      年: { kind: 'time', time: 'sequence' },
      月: { kind: 'time', time: 'cycle' },
      門市代號: { kind: 'identifier' },
      門市名稱: { kind: 'identifier' },
      區域: { kind: 'category', level: 'few', flag: false },
      店型: { kind: 'category', level: 'few', flag: false },
      營業額: { kind: 'measure' },
      營業利益率: { kind: 'ratio', ratio: 'weighted' },
      平均客單價: { kind: 'ratio', ratio: 'weighted' },
    },
  ],
  [
    'restaurant',
    'tbl_fact_channel',
    {
      通路名稱: { kind: 'category', level: 'few', flag: false },
      平台抽成率: { kind: 'ratio', ratio: 'unweighted' },
    },
  ],
  [
    'restaurant',
    'tbl_dim_calendar',
    { 是否春節月: { kind: 'category', level: 'few', flag: true } },
  ],
  [
    'mlb',
    'tbl_fact_batting',
    {
      球員姓名: { kind: 'identifier' },
      聯盟: { kind: 'category', level: 'few', flag: false },
      該季守備位置: { kind: 'category', level: 'some', flag: false },
      全壘打: { kind: 'measure' },
      打擊率: { kind: 'ratio', ratio: 'weighted' },
      上壘率: { kind: 'ratio', ratio: 'inferred' },
      整體攻擊指數: { kind: 'ratio', ratio: 'inferred' },
      是否合格打者: { kind: 'category', level: 'few', flag: true },
    },
  ],
  [
    'mlb',
    'tbl_fact_pitching',
    {
      防禦率: { kind: 'ratio', ratio: 'inferred' },
      每九局三振: { kind: 'ratio', ratio: 'inferred' },
      三振保送比: { kind: 'ratio', ratio: 'weighted' },
    },
  ],
  [
    'performance',
    'tbl_fact_monthly',
    {
      月份: { kind: 'time', time: 'sequence' },
      // 標頭沒有名稱／姓名結尾、也不到列數一半，但超過 30 種值，所以是識別。
      人員: { kind: 'identifier' },
      期間: { kind: 'category', level: 'few', flag: false },
      業績達成率: { kind: 'ratio', ratio: 'weighted' },
    },
  ],
  [
    'sample',
    'tbl_fact_monthly',
    {
      年月: { kind: 'time', time: 'sequence' },
      門市代號: { kind: 'identifier' },
      營業額: { kind: 'measure' },
      營業利益率: { kind: 'ratio', ratio: 'weighted' },
    },
  ],
];

describe.each(expected)('%s %s', (workbook, key, kinds) => {
  it.each(Object.entries(kinds))('%s', async (header, kind) => {
    const { table, rows } = await loadTable(workbook, key);
    const profile = profileTable(table, rows).find((p) => p.field.header === header);
    expect(profile?.kind).toEqual(kind);
  });
});

describe('groupOf', () => {
  it('量值角色的旗標放在量值組，維度依類別分組', async () => {
    const { table, rows } = await loadTable('mlb', 'tbl_fact_batting');
    const groups = Object.fromEntries(
      profileTable(table, rows).map((p) => [p.field.header, groupOf(p)]),
    );
    expect(groups['是否合格打者']).toBe('measure');
    expect(groups['球員姓名']).toBe('identifier');
    expect(groups['聯盟']).toBe('category');
    expect(groups['上壘率']).toBe('ratio');
    expect(groups['全壘打']).toBe('measure');
  });
});

describe('profilesOf', () => {
  it('同一份資料列與資料表只分類一次', async () => {
    const { table, rows } = await loadTable('mlb', 'tbl_fact_batting');
    const first = profilesOf(table, rows);
    expect(profilesOf(table, rows)).toBe(first);
    expect(first).toEqual(profileTable(table, rows));
  });

  it('資料表物件換新（例如改了欄位角色）時重新分類', async () => {
    const { table, rows } = await loadTable('mlb', 'tbl_fact_batting');
    const before = profilesOf(table, rows);
    const fields = table.fields.map((f) =>
      f.header === '是否合格打者' ? { ...f, role: 'dimension' as const } : f,
    );
    const after = profilesOf({ ...table, fields }, rows);
    expect(after).not.toBe(before);
    expect(after.find((p) => p.field.header === '是否合格打者')?.field.role).toBe('dimension');
  });
});

describe('classifyField 的數值範圍', () => {
  it('20 萬筆也不會超過呼叫堆疊上限', () => {
    const values = Array.from({ length: 200_000 }, (_, i) => i - 1000);
    const profile = classifyField(measure('營業額'), rowsOf('營業額', values));
    expect(profile.range).toEqual({ min: -1000, max: 198_999 });
  });
});
