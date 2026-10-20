// 欄位組合 → 圖表推薦（ADR 0010 §4 組合對照表）。
//
// 輸入同一張資料表裡選取的欄位，依欄位分類計數後，從對照表由上往下找第一列符合的組合，
// 產生 1～4 個候選 widget，表格永遠附在最後。推薦卡片（④）、警告的「改用建議」（⑤）、
// 一鍵產生（⑦）共用這份規則。
//
// 代號沿用 ADR：Ts 序列時間、Tc 週期時間、C 分類、I 識別、M 可加總量值、R 比率；「量值」泛指 M 或 R。

import type {
  BarWidget,
  ComboMeasure,
  DataTable,
  DimensionSlot,
  Measure,
  Row,
  TableColumn,
  Widget,
} from '../types/index.ts';
import type { CategoryLevel, FieldProfile } from './fieldKinds.ts';
import { toFieldRef } from './fields.ts';
import { createId } from './ids.ts';
import { categoryKey } from './query.ts';
import { defaultAgg } from './widgetEditing.ts';

export type Recommendation = {
  widget: Widget;
  // 一句推薦理由，例如「區域只有 4 種，適合看占比」。
  reason: string;
  // 第一個候選標示「最推薦」。
  best: boolean;
};

export type RecommendResult = {
  recommendations: Recommendation[];
  // 只推薦表格時的原因，例如勾太多欄位。
  notice?: string;
};

type Code = 'Ts' | 'Tc' | 'C' | 'I' | 'M' | 'R';
type Pick = { profile: FieldProfile; code: Code; level?: CategoryLevel };

// 勾選上限（ADR 0010 §4 共通規則）。
const MAX_DIMENSIONS = 2;
const MAX_MEASURES = 4;
const MAX_FIELDS = 5;
const TOP_N = 10;
const MANY_VALUES = 30;
const SCATTER_MIN_POINTS = 5;
const SCATTER_MAX_ROWS = 2000;

function codeOf(profile: FieldProfile): Pick {
  const { kind } = profile;
  switch (kind.kind) {
    case 'time':
      return { profile, code: kind.time === 'sequence' ? 'Ts' : 'Tc' };
    case 'category':
      // 旗標推薦時當成「少」級的分類。
      return { profile, code: 'C', level: kind.flag ? 'few' : kind.level };
    case 'identifier':
      return { profile, code: 'I' };
    case 'measure':
      return { profile, code: 'M' };
    case 'ratio':
      return { profile, code: 'R' };
  }
}

// 單位群組：單位字串相同（或都沒有單位）、或都是比率，就能放在同一條 Y 軸（ADR 0010 §2）。
export function unitGroup(profile: FieldProfile): string {
  return profile.kind.kind === 'ratio' ? '\u0000ratio' : (profile.field.unit ?? '');
}

function unitGroups(picks: readonly Pick[]): Pick[][] {
  const groups = new Map<string, Pick[]>();
  for (const pick of picks) {
    const key = unitGroup(pick.profile);
    groups.set(key, [...(groups.get(key) ?? []), pick]);
  }
  return [...groups.values()];
}

const header = (pick: Pick) => pick.profile.field.header;
const headers = (picks: readonly Pick[]) => picks.map(header).join('、');
const dim = (pick: Pick): DimensionSlot => ({ field: toFieldRef(pick.profile.field) });
const measure = (pick: Pick): Measure => ({
  field: toFieldRef(pick.profile.field),
  agg: defaultAgg(pick.profile.field),
});

type Builder = { table: DataTable; rows: readonly Row[]; profiles: readonly FieldProfile[] };

function base(builder: Builder, title: string) {
  return { id: createId('w'), title, table: builder.table.key, filters: [] };
}

// 長條的 X 軸是「多」級分類時橫式、由大到小；超過 30 種值時再只留前 10（ADR 0010 §4）。
function barOptions(x: Pick, sort: boolean): BarWidget['options'] {
  const options: NonNullable<BarWidget['options']> = {};
  if (x.code === 'C' && x.level === 'many') {
    options.horizontal = true;
    options.sort = 'desc';
  }
  if (sort) options.sort = 'desc';
  if (x.profile.distinct > MANY_VALUES) options.limit = TOP_N;
  return Object.keys(options).length > 0 ? options : undefined;
}

function comboOf(builder: Builder, x: Pick, groups: Pick[][], title: string): Widget {
  const [left, right] = groups;
  const y: ComboMeasure[] = [
    ...left.map((p): ComboMeasure => ({ ...measure(p), mark: 'bar', axis: 'left' })),
    ...right.map((p): ComboMeasure => ({ ...measure(p), mark: 'line', axis: 'right' })),
  ];
  return { ...base(builder, title), type: 'combo', encoding: { x: dim(x), y } };
}

// 依分類彙總後的值是否全為正數（圓餅圖的條件）。
function allPositive(rows: readonly Row[], category: Pick, value: Pick): boolean {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const v = row[value.profile.field.header];
    if (typeof v !== 'number') continue;
    const key = categoryKey(row[category.profile.field.header]);
    totals.set(key, (totals.get(key) ?? 0) + v);
  }
  return totals.size > 0 && [...totals.values()].every((v) => v > 0);
}

// KPI 卡的趨勢：資料表裡不同值最多的序列時間欄位。
function trendField(profiles: readonly FieldProfile[]): FieldProfile | undefined {
  return profiles
    .filter((p) => p.kind.kind === 'time' && p.kind.time === 'sequence' && p.distinct >= 2)
    .reduce<FieldProfile | undefined>(
      (best, p) => (!best || p.distinct > best.distinct ? p : best),
      undefined,
    );
}

type Candidate = { widget: Widget; reason: string };

// 表格：有維度時依維度分組彙總量值、顯示合計；只有量值時列出明細。
function tableCandidate(builder: Builder, dims: Pick[], measures: Pick[]): Candidate {
  const columns: TableColumn[] = [
    ...dims.map(dim),
    ...measures.map((p) => (dims.length > 0 ? measure(p) : { field: toFieldRef(p.profile.field) })),
  ];
  const grouped = dims.length > 0 && measures.length > 0;
  return {
    widget: {
      ...base(builder, '明細'),
      type: 'table',
      encoding: { columns },
      ...(measures.length > 0 && { options: { totals: true } }),
    },
    reason: grouped
      ? `依${headers(dims)}分組列出${headers(measures)}`
      : '列出勾選欄位的明細，任何組合都適用',
  };
}

// 對照表第 1～12 列；都不符合時回傳空陣列（只剩表格）。
function chartCandidates(builder: Builder, picks: Pick[]): Candidate[] {
  const dims = picks.filter((p) => p.code !== 'M' && p.code !== 'R');
  const measures = picks.filter((p) => p.code === 'M' || p.code === 'R');
  const ts = dims.filter((p) => p.code === 'Ts');
  const tc = dims.filter((p) => p.code === 'Tc');
  const cs = dims.filter((p) => p.code === 'C');
  const is = dims.filter((p) => p.code === 'I');
  const groups = unitGroups(measures);
  const out: Candidate[] = [];

  // 1. 1 個量值：KPI 卡；比率另外推薦儀表圖。
  if (dims.length === 0 && measures.length === 1) {
    const [m] = measures;
    const trend = trendField(builder.profiles);
    out.push({
      widget: {
        ...base(builder, header(m)),
        type: 'kpi',
        encoding: {
          value: measure(m),
          ...(trend && { trend: { field: toFieldRef(trend.field) } }),
        },
      },
      reason: trend
        ? `只選了 1 個數值，用 KPI 卡突顯，並依「${trend.field.header}」畫走勢線`
        : '只選了 1 個數值，用 KPI 卡突顯',
    });
    if (m.code === 'R') {
      out.push({
        widget: { ...base(builder, header(m)), type: 'gauge', encoding: { value: measure(m) } },
        reason: '比率可以用儀表圖看落在範圍的哪裡',
      });
    }
    return out;
  }

  // 12. 2 個量值、沒有維度：每列一點的散佈圖。
  if (dims.length === 0 && measures.length === 2) {
    if (builder.rows.length > SCATTER_MAX_ROWS) return out;
    const [a, b] = measures;
    out.push({
      widget: {
        ...base(builder, `${header(a)} vs ${header(b)}`),
        type: 'scatter',
        encoding: { x: measure(a), y: measure(b) },
      },
      reason: `每一列一個點，看「${header(a)}」與「${header(b)}」的關係`,
    });
    return out;
  }

  // 2、3. 序列時間 ＋ 1～3 個量值：同一單位群組畫折線；兩個群組畫組合圖（左軸長條、右軸折線）。
  if (dims.length === 1 && ts.length === 1 && measures.length >= 1 && measures.length <= 3) {
    const [t] = ts;
    if (t.profile.distinct < 3 || groups.length > 2) return out;
    if (groups.length === 2) {
      out.push({
        widget: comboOf(builder, t, groups, `${headers(measures)}趨勢`),
        reason: `${headers(groups[0])}與${headers(groups[1])}單位不同，分成左右兩軸`,
      });
      return out;
    }
    const y = measures.map(measure);
    const title = `${headers(measures)}趨勢`;
    out.push(
      {
        widget: { ...base(builder, title), type: 'line', encoding: { x: dim(t), y } },
        reason: `「${header(t)}」有 ${t.profile.distinct} 個時間點，適合看趨勢`,
      },
      {
        widget: { ...base(builder, title), type: 'bar', encoding: { x: dim(t), y } },
        reason: '也可以用長條比較各期的大小',
      },
    );
    return out;
  }

  if (measures.length === 1) {
    const [m] = measures;
    const isRatio = m.code === 'R';

    // 4. 序列時間 ＋「少」級分類 ＋ 1 個量值：依分類分線；可加總量值另外推薦堆疊長條。
    if (ts.length === 1 && cs.length === 1 && cs[0].level === 'few' && dims.length === 2) {
      const [t] = ts;
      const [c] = cs;
      const title = `各${header(c)}${header(m)}趨勢`;
      out.push({
        widget: {
          ...base(builder, title),
          type: 'line',
          encoding: { x: dim(t), y: [measure(m)], group: dim(c) },
        },
        reason: `依「${header(c)}」分線，比較各${header(c)}的趨勢`,
      });
      if (!isRatio) {
        out.push({
          widget: {
            ...base(builder, title),
            type: 'bar',
            encoding: { x: dim(t), y: [measure(m)], group: dim(c) },
            options: { stacked: true },
          },
          reason: `堆疊看各${header(c)}占總量的變化`,
        });
      }
      return out;
    }

    // 5. 週期時間 ＋ 序列時間 ＋ 1 個量值：同期比較（X＝週期、分線＝序列）。
    if (tc.length === 1 && ts.length === 1 && dims.length === 2) {
      const [cycle] = tc;
      const [t] = ts;
      if (t.profile.distinct > 6) return out;
      const encoding = { x: dim(cycle), y: [measure(m)], group: dim(t) };
      const title = `${header(m)}同期比較`;
      out.push(
        {
          widget: { ...base(builder, title), type: 'line', encoding },
          reason: `把各${header(t)}疊在同一條「${header(cycle)}」軸上，做同期比較`,
        },
        {
          widget: { ...base(builder, title), type: 'bar', encoding },
          reason: '分組長條逐期比較差異',
        },
      );
      return out;
    }
  }

  // 週期時間沒有搭配序列時間時，當成「中」級分類（ADR 0010 §2）。
  const categories = [...cs, ...tc.map((p): Pick => ({ ...p, code: 'C', level: 'some' }))];

  if (categories.length === 1 && dims.length === 1) {
    const [c] = categories;

    // 6、7. 分類 ＋ 1 個量值：長條；可加總量值在「少」級且全為正時另外推薦圓餅；比率由大到小。
    if (measures.length === 1) {
      const [m] = measures;
      const title = `各${header(c)}${header(m)}`;
      if (m.code === 'R') {
        out.push({
          widget: {
            ...base(builder, title),
            type: 'bar',
            encoding: { x: dim(c), y: [measure(m)] },
            options: barOptions(c, true),
          },
          reason: '比率依大小排序，一眼看出高低',
        });
        return out;
      }
      out.push({
        widget: {
          ...base(builder, title),
          type: 'bar',
          encoding: { x: dim(c), y: [measure(m)] },
          options: barOptions(c, false),
        },
        reason: `比較各${header(c)}的${header(m)}`,
      });
      if (c.level === 'few' && allPositive(builder.rows, c, m)) {
        out.push({
          widget: {
            ...base(builder, `${header(m)}占比（${header(c)}）`),
            type: 'pie',
            encoding: { category: dim(c), value: measure(m) },
          },
          reason: `「${header(c)}」只有 ${c.profile.distinct} 種，適合看占比`,
        });
      }
      return out;
    }

    // 8.「少／中」級分類 ＋ 2～4 個量值：分組長條；同一單位群組、3～12 種值時另外推薦雷達。
    if (measures.length >= 2 && (c.level === 'few' || c.level === 'some')) {
      if (groups.length > 2) return out;
      const title = `各${header(c)}${headers(measures)}`;
      if (groups.length === 2) {
        out.push({
          widget: comboOf(builder, c, groups, title),
          reason: `${headers(groups[0])}與${headers(groups[1])}單位不同，分成左右兩軸`,
        });
        return out;
      }
      const y = measures.map(measure);
      out.push({
        widget: { ...base(builder, title), type: 'bar', encoding: { x: dim(c), y } },
        reason: `同時比較各${header(c)}的 ${measures.length} 個數值`,
      });
      if (c.profile.distinct >= 3 && c.profile.distinct <= 12) {
        out.push({
          widget: { ...base(builder, title), type: 'radar', encoding: { x: dim(c), y } },
          reason: `「${header(c)}」有 ${c.profile.distinct} 種，可以用雷達比較各項特性`,
        });
      }
      return out;
    }
  }

  // 9. 分類 ＋「少」級分類 ＋ 1 個量值：X＝值較多的分類、分組＝值較少的分類；比率不堆疊。
  if (categories.length === 2 && dims.length === 2 && measures.length === 1) {
    const [x, group] = [...categories].sort((a, b) => b.profile.distinct - a.profile.distinct);
    if (group.level !== 'few') return out;
    const [m] = measures;
    const title = `各${header(x)}${header(m)}（依${header(group)}）`;
    const encoding = { x: dim(x), y: [measure(m)], group: dim(group) };
    const grouped: Candidate = {
      widget: {
        ...base(builder, title),
        type: 'bar',
        encoding,
        options: barOptions(x, false),
      },
      reason: `分組比較各${header(group)}`,
    };
    if (m.code === 'R')
      return [{ ...grouped, reason: `比率不能堆疊，依「${header(group)}」分組比較` }];
    out.push(
      {
        widget: {
          ...base(builder, title),
          type: 'bar',
          encoding,
          options: { ...barOptions(x, false), stacked: true },
        },
        reason: `依「${header(group)}」堆疊，看各${header(x)}的組成`,
      },
      grouped,
    );
    return out;
  }

  if (is.length === 1) {
    const [i] = is;

    // 10. 識別 ＋ 1 個量值：排行（橫式、由大到小、前 10）。
    if (dims.length === 1 && measures.length === 1) {
      const [m] = measures;
      out.push({
        widget: {
          ...base(builder, `${header(m)}排行 Top ${TOP_N}（${header(i)}）`),
          type: 'bar',
          encoding: { x: dim(i), y: [measure(m)] },
          options: { horizontal: true, sort: 'desc', limit: TOP_N },
        },
        reason: `「${header(i)}」有 ${i.profile.distinct} 種，排出前 ${TOP_N} 名`,
      });
      return out;
    }

    // 11. 識別 ＋ 2 個量值（＋ 0～1 個「少」級分類）：散佈圖，明細＝識別、顏色＝分類。
    const color = dims.length === 2 && categories.length === 1 ? categories[0] : undefined;
    const fits = dims.length === 1 || (color !== undefined && color.level === 'few');
    if (measures.length === 2 && fits && i.profile.distinct >= SCATTER_MIN_POINTS) {
      const [a, b] = measures;
      out.push({
        widget: {
          ...base(builder, `${header(a)} vs ${header(b)}`),
          type: 'scatter',
          encoding: {
            x: measure(a),
            y: measure(b),
            detail: dim(i),
            ...(color && { color: dim(color) }),
          },
        },
        reason: color
          ? `每個${header(i)}一個點、依「${header(color)}」上色，看「${header(a)}」與「${header(b)}」的關係`
          : `每個${header(i)}一個點，看「${header(a)}」與「${header(b)}」的關係`,
      });
    }
  }
  return out;
}

// 依 headers 選取的欄位推薦圖表。欄位依 Excel 的欄位順序排列（越左邊越優先），不在資料表裡的忽略。
// profiles 是整張表的欄位分類（profileTable），rows 是整張表的資料列（不套用篩選）。
export function recommend(
  table: DataTable,
  rows: readonly Row[],
  profiles: readonly FieldProfile[],
  selected: readonly string[],
): RecommendResult {
  const builder: Builder = { table, rows, profiles };
  const wanted = new Set(selected);
  const picks = profiles.filter((p) => wanted.has(p.field.header)).map(codeOf);
  const dims = picks.filter((p) => p.code !== 'M' && p.code !== 'R');
  const measures = picks.filter((p) => p.code === 'M' || p.code === 'R');
  const finish = (candidates: Candidate[], notice?: string): RecommendResult => ({
    recommendations: [...candidates, tableCandidate(builder, dims, measures)].map((c, i) => ({
      ...c,
      best: i === 0,
    })),
    notice,
  });

  if (picks.length === 0) return { recommendations: [] };
  if (dims.length > MAX_DIMENSIONS || measures.length > MAX_MEASURES || picks.length > MAX_FIELDS) {
    return finish([], '勾太多了，建議 2～4 個欄位；目前只能用表格呈現');
  }
  const single = picks.find((p) => p.code === 'C' && p.level === 'single');
  if (single) return finish([], `「${header(single)}」只有 1 種值，不適合畫圖`);
  return finish(chartCandidates(builder, picks));
}
