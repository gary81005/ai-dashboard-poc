import { describe, expect, it } from 'vitest';
import type { DataTable, Dataset, DatasetRows, Field } from '../src/types/index.ts';
import { checkFields } from '../src/utils/fieldHealth.ts';
import { loadWorkbook } from './workbooks.ts';
import type { WorkbookName } from './workbooks.ts';

const field = (header: string, extra: Partial<Field> = {}): Field => ({
  header,
  dataType: 'integer',
  role: 'measure',
  ...extra,
});

function datasetOf(tables: DataTable[]): Dataset {
  return { id: 'd', name: 'd', fileName: 'd.xlsx', uploadedAt: '', tables };
}

function tableOf(fields: Field[], extra: Partial<DataTable> = {}): DataTable {
  return { key: 'tbl_fact_t', sheetName: '明細', hidden: false, rowCount: 2, fields, ...extra };
}

// 規則修訂前上傳的資料集：「球季」被存成量值。
const rows: DatasetRows = {
  tbl_fact_t: [
    { 球季: 2024, 是否合格: 1, 上壘率: 0.3, 全壘打: 10 },
    { 球季: 2025, 是否合格: 0, 上壘率: 0.35, 全壘打: 12 },
  ],
};

describe('checkFields', () => {
  const fields = [
    field('球季'),
    field('是否合格'),
    field('上壘率', { dataType: 'number' }),
    field('全壘打'),
  ];

  it('時間欄位改維度、旗標改維度、推測比率標成比率', () => {
    const got = checkFields(datasetOf([tableOf(fields)]), rows);
    expect(got.map((s) => [s.header, s.kind, s.patch])).toEqual([
      ['球季', 'role', { role: 'dimension' }],
      ['是否合格', 'flag', { role: 'dimension' }],
      ['上壘率', 'ratio', { ratio: true }],
    ]);
  });

  it('使用者手動調整過的項目不再提出建議', () => {
    const overridden = [
      field('球季', { userOverride: ['role'] }),
      field('是否合格', { userOverride: ['role'] }),
      field('上壘率', { dataType: 'number', userOverride: ['ratio'] }),
    ];
    expect(checkFields(datasetOf([tableOf(overridden)]), rows)).toEqual([]);
  });

  it('已經是維度或比率的欄位沒有建議', () => {
    const fixed = [
      field('球季', { role: 'dimension' }),
      field('是否合格', { role: 'dimension' }),
      field('上壘率', { dataType: 'number', ratio: true }),
    ];
    expect(checkFields(datasetOf([tableOf(fixed)]), rows)).toEqual([]);
  });

  it('值不只 0/1 的「是否」欄位不是旗標', () => {
    const notFlag: DatasetRows = { tbl_fact_t: [{ 是否合格: 2 }, { 是否合格: 0 }] };
    expect(checkFields(datasetOf([tableOf([field('是否合格')])]), notFlag)).toEqual([]);
  });

  it('隱藏的資料表不檢查', () => {
    expect(checkFields(datasetOf([tableOf(fields, { hidden: true })]), rows)).toEqual([]);
  });
});

describe('實際活頁簿', () => {
  async function suggestionsOf(name: WorkbookName) {
    const parsed = await loadWorkbook(name);
    return checkFields(datasetOf(parsed.tables), parsed.rows);
  }

  it('新解析的資料集不會有角色建議（球季、年度已依新規則是維度）', async () => {
    for (const name of ['mlb', 'restaurant', 'performance', 'sample'] as const) {
      expect((await suggestionsOf(name)).filter((s) => s.kind === 'role')).toEqual([]);
    }
  });

  it('MLB：旗標與推測比率', async () => {
    const got = await suggestionsOf('mlb');
    const headers = (kind: string) => got.filter((s) => s.kind === kind).map((s) => s.header);
    expect(headers('flag')).toEqual(['是否合格打者', '是否合格投手']);
    expect(headers('ratio')).toEqual(
      expect.arrayContaining(['上壘率', '整體攻擊指數', '防禦率', '每九局三振', '勝率']),
    );
    // 已標成加權比率的欄位不再提醒。
    expect(headers('ratio')).not.toContain('打擊率');
    expect(headers('ratio')).not.toContain('三振保送比');
  });

  it('餐飲：只有旗標', async () => {
    const got = await suggestionsOf('restaurant');
    expect(got.map((s) => [s.header, s.kind])).toEqual([
      ['是否春節月', 'flag'],
      ['是否平台抽成', 'flag'],
    ]);
  });

  it('業績與範例：沒有建議', async () => {
    expect(await suggestionsOf('performance')).toEqual([]);
    expect(await suggestionsOf('sample')).toEqual([]);
  });
});
