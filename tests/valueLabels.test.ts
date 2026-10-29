import { describe, expect, it } from 'vitest';
import type { Dataset, DataTable, Field, Row } from '../src/types/index.ts';
import { autoLabeledFields } from '../src/utils/fieldHealth.ts';
import { carryOverrides } from '../src/utils/rebind.ts';
import { queryCategorical, queryPie, queryTable, queryValue } from '../src/utils/query.ts';
import {
  activeLabels,
  detectValueLabels,
  isBinaryLabeled,
  labelOf,
  labelsOf,
  parseUnitLabels,
  withRawValues,
} from '../src/utils/valueLabels.ts';
import { loadWorkbook } from './workbooks.ts';

const YES_NO = { '1': '是', '0': '否' };

const flag: Field = {
  header: '是否回診',
  dataType: 'integer',
  role: 'measure',
  valueLabels: YES_NO,
};
const gender: Field = {
  header: '性別',
  dataType: 'text',
  role: 'dimension',
  valueLabels: { M: '男', F: '女' },
};
const table: DataTable = {
  key: 't',
  sheetName: 't',
  hidden: false,
  rowCount: 4,
  fields: [gender, flag, { ...flag, header: '是否回診（維度）', role: 'dimension' }],
};
const rows: Row[] = [
  { 性別: 'M', 是否回診: 1, '是否回診（維度）': 1 },
  { 性別: 'F', 是否回診: 0, '是否回診（維度）': 0 },
  { 性別: 'F', 是否回診: 1, '是否回診（維度）': 1 },
  { 性別: 'X', 是否回診: 1, '是否回診（維度）': 1 },
];

describe('detectValueLabels', () => {
  it('整數欄位只有 0 和 1：套用 是／否', () => {
    expect(detectValueLabels('integer', [0, 1, 1], undefined, false)).toEqual(YES_NO);
  });

  it('只出現一種值的欄位不套用（例如全是 1 的件數），TRUE/FALSE 例外', () => {
    expect(detectValueLabels('integer', [1, 1], undefined, false)).toBeUndefined();
    expect(detectValueLabels('integer', [1, 1], undefined, true)).toEqual(YES_NO);
  });

  it('有其他值、或不是整數的欄位不套用', () => {
    expect(detectValueLabels('integer', [0, 1, 2], undefined, false)).toBeUndefined();
    expect(detectValueLabels('number', [0, 1], undefined, false)).toBeUndefined();
    expect(detectValueLabels('integer', [], undefined, false)).toBeUndefined();
  });

  it('單位寫了對照時用單位的文字', () => {
    expect(detectValueLabels('integer', [0, 1], '1=有,0=無', false)).toEqual({
      '1': '有',
      '0': '無',
    });
  });
});

describe('parseUnitLabels', () => {
  it('只寫 1 的標籤時，0 用反義詞或加「非」', () => {
    expect(parseUnitLabels('1=是')).toEqual(YES_NO);
    expect(parseUnitLabels("1='合格'")).toEqual({ '1': '合格', '0': '非合格' });
  });

  it('全形符號與多種分隔符號', () => {
    expect(parseUnitLabels('1＝已完成；0＝未完成')).toEqual({ '1': '已完成', '0': '未完成' });
  });

  it('不是對照格式的單位', () => {
    expect(parseUnitLabels('元')).toBeUndefined();
    expect(parseUnitLabels('YYYY-MM')).toBeUndefined();
    expect(parseUnitLabels(undefined)).toBeUndefined();
  });
});

describe('labelOf／activeLabels', () => {
  it('有對照的值顯示標籤，沒有的顯示原始值', () => {
    expect(labelOf(gender, 'M')).toBe('男');
    expect(labelOf(gender, 'X')).toBe('X');
  });

  it('欄位層級停用時保留對照但不套用', () => {
    const off = { ...gender, showValueLabels: false };
    expect(activeLabels(off)).toBeUndefined();
    expect(labelOf(off, 'M')).toBe('M');
  });

  it('withRawValues 停用整張表的標籤，同一張表回傳同一個物件', () => {
    const raw = withRawValues(table);
    expect(raw.fields.every((f) => activeLabels(f) === undefined)).toBe(true);
    expect(withRawValues(table)).toBe(raw);
  });

  it('兩個值設成同一個標籤時補上原始值區分', () => {
    const merged = { ...gender, valueLabels: { M: '其他', F: '其他' } };
    expect(labelsOf(merged, ['M', 'F', 'X'])).toEqual(['其他（M）', '其他（F）', 'X']);
  });

  it('isBinaryLabeled：數值欄位、對照只有 0/1', () => {
    expect(isBinaryLabeled(flag)).toBe(true);
    expect(isBinaryLabeled(gender)).toBe(false);
    expect(isBinaryLabeled({ ...flag, showValueLabels: false })).toBe(false);
    expect(isBinaryLabeled({ ...flag, valueLabels: { '0': '否', '1': '是', '2': '不明' } })).toBe(
      false,
    );
  });
});

describe('查詢結果套用值標籤', () => {
  const ctx = { table, rows, filters: [] };

  it('分類：分組鍵是原始值，顯示名稱是標籤', () => {
    const result = queryCategorical(ctx, { header: '性別' }, [
      { field: { header: '是否回診' }, agg: 'sum' },
    ]);
    expect(result.categories).toEqual(['M', 'F', 'X']);
    expect(result.categoryLabels).toEqual(['男', '女', 'X']);
  });

  it('分組系列名稱用標籤', () => {
    const result = queryCategorical(
      ctx,
      { header: '性別' },
      [{ field: { header: '是否回診' }, agg: 'count' }],
      { header: '是否回診（維度）' },
    );
    expect(result.series.map((s) => s.label)).toEqual(['否', '是']);
  });

  it('篩選比對原始值', () => {
    const result = queryValue(
      { ...ctx, filters: [{ field: { header: '性別' }, op: 'in', values: ['F'] }] },
      { field: { header: '是否回診' }, agg: 'sum' },
    );
    expect(result.value).toBe(1);
  });

  it('圓餅圖：id 是原始值、label 是標籤', () => {
    const result = queryPie(
      ctx,
      { header: '性別' },
      { field: { header: '是否回診' }, agg: 'count' },
    );
    expect(result.items.map((i) => [i.id, i.label])).toEqual([
      ['M', '男'],
      ['F', '女'],
      ['X', 'X'],
    ]);
  });

  it('KPI 趨勢的標籤', () => {
    const result = queryValue(
      ctx,
      { field: { header: '是否回診' }, agg: 'avg' },
      { header: '性別' },
    );
    expect(result.trend?.labels).toEqual(['男', '女', 'X']);
  });

  it('顯示原始值的元件', () => {
    const result = queryCategorical({ ...ctx, table: withRawValues(table) }, { header: '性別' }, [
      { field: { header: '是否回診' }, agg: 'sum' },
    ]);
    expect(result.categoryLabels).toEqual(['M', 'F', 'X']);
  });

  it('資料表格回傳原始值（由畫面依欄位轉成標籤）', () => {
    const result = queryTable(ctx, [{ field: { header: '性別' } }]);
    expect(result.rows.map((r) => r.c0)).toEqual(['M', 'F', 'F', 'X']);
  });
});

describe('carryOverrides 沿用值標籤', () => {
  const dataset = (fields: Field[]): Dataset => ({
    id: 'd',
    name: 'd',
    fileName: 'd.xlsx',
    uploadedAt: '2026-01-01',
    tables: [{ ...table, fields }],
  });

  it('使用者修改或停用過的對照沿用到新資料集', () => {
    const edited: Field = {
      ...gender,
      valueLabels: { M: '男性' },
      showValueLabels: false,
      userOverride: ['valueLabels'],
    };
    const next = carryOverrides(dataset([edited]), dataset([gender]));
    const field = next.tables[0].fields[0];
    expect(field.valueLabels).toEqual({ M: '男性' });
    expect(field.showValueLabels).toBe(false);
  });

  it('清除過的對照在新資料集也清除', () => {
    const cleared: Field = { ...flag, valueLabels: undefined, userOverride: ['valueLabels'] };
    const next = carryOverrides(dataset([cleared]), dataset([flag]));
    expect(next.tables[0].fields[0].valueLabels).toBeUndefined();
  });
});

describe('autoLabeledFields', () => {
  it('列出自動套用、使用者還沒確認的欄位；隱藏的資料表不列', () => {
    const confirmed: Field = { ...flag, header: '已確認', userOverride: ['valueLabels'] };
    const data: Dataset = {
      id: 'd',
      name: 'd',
      fileName: 'd.xlsx',
      uploadedAt: '2026-01-01',
      tables: [
        { ...table, fields: [flag, confirmed] },
        { ...table, key: 'h', hidden: true, fields: [flag] },
      ],
    };
    expect(autoLabeledFields(data).map((f) => [f.header, f.labels])).toEqual([
      ['是否回診', '0 → 否、1 → 是'],
    ]);
  });
});

describe('實際活頁簿', () => {
  it('「是否…」0/1 欄位上傳時自動套用 是／否，角色維持量值', async () => {
    const labeled = [];
    for (const name of ['restaurant', 'mlb'] as const) {
      const parsed = await loadWorkbook(name);
      for (const t of parsed.tables) {
        for (const f of t.fields)
          if (f.valueLabels) labeled.push([f.header, f.role, f.valueLabels]);
      }
    }
    expect(labeled).toEqual([
      ['是否春節月', 'measure', YES_NO],
      ['是否平台抽成', 'measure', YES_NO],
      ['是否合格打者', 'measure', YES_NO],
      ['是否合格投手', 'measure', YES_NO],
    ]);
  });

  it('範例與業績活頁簿沒有 0/1 欄位', async () => {
    for (const name of ['sample', 'performance'] as const) {
      const parsed = await loadWorkbook(name);
      expect(parsed.tables.flatMap((t) => t.fields).filter((f) => f.valueLabels)).toEqual([]);
    }
  });
});
