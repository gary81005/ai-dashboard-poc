import { describe, expect, it } from 'vitest';
import { profileTable } from '../src/utils/fieldKinds.ts';
import { grainOf, tableKindOf } from '../src/utils/tableKinds.ts';
import type { TableKind } from '../src/utils/tableKinds.ts';
import { loadWorkbook } from './workbooks.ts';
import type { WorkbookName } from './workbooks.ts';

async function describeAll(name: WorkbookName) {
  const parsed = await loadWorkbook(name);
  return Object.fromEntries(
    parsed.tables
      .filter((t) => !t.hidden)
      .map((table) => {
        const rows = parsed.rows[table.key];
        const profiles = profileTable(table, rows);
        return [
          table.key,
          {
            kind: tableKindOf(table, profiles, rows.length),
            grain: grainOf(rows, profiles)?.map((f) => f.header) ?? null,
          },
        ];
      }),
  );
}

const expected: Array<
  [WorkbookName, Record<string, { kind: TableKind; grain?: string[] | null }>]
> = [
  [
    'restaurant',
    {
      tbl_year_params: { kind: 'parameter' },
      // 工作表叫「月曆參數」，但前綴是 tbl_dim_，所以是主檔。
      tbl_dim_calendar: { kind: 'dimension', grain: ['年月'] },
      tbl_dim_store: { kind: 'dimension', grain: ['門市名稱'] },
      tbl_fact_monthly: { kind: 'fact', grain: ['門市名稱', '年月'] },
      tbl_fact_channel: { kind: 'fact', grain: ['門市名稱', '年月', '通路名稱'] },
      tbl_fact_item: { kind: 'fact', grain: ['品項名稱', '門市代號', '年月'] },
      // 「年度」依 0010 修訂的規則 3 是維度。
      tbl_store_year_config: { kind: 'fact', grain: ['門市名稱', '年度'] },
      tbl_agg_month: { kind: 'aggregate', grain: ['年月'] },
      tbl_kpi: { kind: 'fact' },
    },
  ],
  [
    'mlb',
    {
      // 「球季」依 0010 修訂的規則 3 是維度，所以球員、球隊的表都找得到 grain。
      tbl_season_params: { kind: 'parameter', grain: ['球季'] },
      tbl_dim_team: { kind: 'dimension', grain: ['球隊英文名'] },
      tbl_agg_team_season: { kind: 'aggregate', grain: ['球隊代號', '球季'] },
      tbl_dim_player: { kind: 'dimension', grain: ['球員姓名'] },
      tbl_standings: { kind: 'fact', grain: ['球隊代號', '球季'] },
      tbl_fact_batting: { kind: 'fact', grain: ['球員姓名', '球季'] },
      tbl_fact_pitching: { kind: 'fact', grain: ['球員姓名', '球季'] },
    },
  ],
  [
    'performance',
    {
      // 崗位、人員都是識別（超過 30 種值），崗位在前面；姓名有重複（TBH），不能當 grain。
      tbl_fact_monthly: { kind: 'fact', grain: ['崗位', '月份'] },
      tbl_dim_rep: { kind: 'dimension', grain: ['崗位'] },
      tbl_fact_pipeline: { kind: 'fact', grain: ['商機編號'] },
      tbl_agg_visit: { kind: 'aggregate', grain: null },
    },
  ],
  [
    'sample',
    {
      tbl_dim_store: { kind: 'dimension', grain: ['門市名稱'] },
      tbl_fact_monthly: { kind: 'fact', grain: ['門市名稱', '年月'] },
      tbl_agg_month: { kind: 'aggregate', grain: ['年月'] },
    },
  ],
];

describe.each(expected)('%s', (name, tables) => {
  it.each(Object.entries(tables))('%s', async (key, want) => {
    const got = (await describeAll(name))[key];
    expect(got.kind).toBe(want.kind);
    if (want.grain !== undefined) expect(got.grain).toEqual(want.grain);
  });
});

describe('沒有資料列時', () => {
  it('前綴規則仍有效，推測與 grain 判斷不出來', async () => {
    const parsed = await loadWorkbook('mlb');
    const standings = parsed.tables.find((t) => t.key === 'tbl_standings')!;
    const fact = parsed.tables.find((t) => t.key === 'tbl_fact_batting')!;
    expect(tableKindOf(standings, profileTable(standings, []), 0)).toBe('other');
    expect(tableKindOf(fact, profileTable(fact, []), 0)).toBe('fact');
    expect(grainOf([], profileTable(fact, []))).toBeNull();
  });
});
