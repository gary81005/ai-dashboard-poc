// 元件的「下一步」提示與警告（ADR 0010 §5），只在編輯模式顯示。
//
// 警告只提醒、不阻止存檔，分兩級：
//   - warning：對照表的條件被違反（圓餅超過 6 類、折線 X 軸不是時間…），或通用檢查
//     （比率用了加總、同一條 Y 軸混了不同單位、長條 X 軸太多值卻沒排序）。卡片標題旁加 ⚠。
//   - tip：非加權或推測比率做了平均。結果只能參考，但不算錯，所以不加 ⚠，只附「到資料集頁標記」。
// 有 warning 時附「改用建議」：用元件目前的欄位跑 utils/recommend.ts，套用第一推薦。
//
// 值的數量、點數都從整張表（不套用篩選）計算，與推薦一致。

import { WIDGET_SLOTS, WIDGET_TYPE_LABELS } from '../constants/widgetTypes.ts';
import type { DataTable, Measure, Row, Widget } from '../types/index.ts';
import type { FieldProfile } from './fieldKinds.ts';
import { resolveField } from './fields.ts';
import { queryCategorical, queryScatter } from './query.ts';
import { recommend, unitGroup } from './recommend.ts';
import { readSlot } from './widgetEditing.ts';
import type { SlotEntry } from './widgetEditing.ts';

export type WidgetWarning = {
  id: string;
  level: 'warning' | 'tip';
  message: string;
  // 附「到資料集頁標記」：比率要在資料集頁標記或指定分子分母。
  markRatio?: boolean;
};

export type WidgetCheck = {
  nextStep?: string;
  warnings: WidgetWarning[];
  // 「改用建議」要套用的 widget（保留原本的 id 與篩選）；和目前設定相同時不提供。
  fix?: Widget;
};

const PIE_MAX = 6;
const LINE_MIN = 3;
const RADAR_MIN = 3;
const RADAR_MAX = 12;
const SCATTER_MIN = 5;
const BAR_MANY = 30;

// 第一個還沒放欄位的必要槽位；組合圖只有一個數值時，提示再放一個畫成右軸折線。
export function nextStep(widget: Widget): string | undefined {
  for (const slot of WIDGET_SLOTS[widget.type]) {
    if (slot.required && readSlot(widget, slot).length === 0) {
      return `下一步：把${slot.kind === 'columns' ? '' : '一個'}${slot.required}欄位拖到「${slot.label}」`;
    }
  }
  if (widget.type === 'combo' && widget.encoding.y.length === 1) {
    return '下一步：再拖一個單位不同的數值到「數值」，會畫成右軸折線';
  }
  return undefined;
}

type Context = {
  table: DataTable;
  rows: readonly Row[];
  profileOf: (header: string) => FieldProfile | undefined;
};

function isRatio(profile: FieldProfile | undefined): boolean {
  return profile?.kind.kind === 'ratio';
}

// 對照表的條件（ADR 0010 §5-1）。
function violations(widget: Widget, ctx: Context): string[] {
  const out: string[] = [];
  const distinct = (header: string) => ctx.profileOf(header)?.distinct ?? 0;
  const queryCtx = { table: ctx.table, rows: [...ctx.rows], filters: [] };
  switch (widget.type) {
    case 'pie': {
      const { category, value } = widget.encoding;
      if (!category || !value) break;
      const n = distinct(category.field.header);
      if (n > PIE_MAX) out.push(`圓餅圖的分類有 ${n} 種，超過 ${PIE_MAX} 種就很難比較`);
      if (isRatio(ctx.profileOf(value.field.header))) {
        out.push(`「${value.field.header}」是比率，各塊加起來沒有意義，不適合圓餅圖`);
      } else {
        const data = queryCategorical(queryCtx, category.field, [value]).series[0]?.data ?? [];
        if (data.some((v) => v !== null && v <= 0)) {
          out.push('有分類的值是 0 或負數，圓餅圖畫不出來');
        }
      }
      break;
    }
    case 'line': {
      const x = widget.encoding.x;
      if (!x) break;
      if (ctx.profileOf(x.field.header)?.kind.kind !== 'time') {
        out.push(`折線圖的 X 軸「${x.field.header}」不是時間，各點之間的連線沒有意義`);
      } else if (distinct(x.field.header) < LINE_MIN) {
        out.push(`「${x.field.header}」只有 ${distinct(x.field.header)} 個時間點，看不出趨勢`);
      }
      break;
    }
    case 'radar': {
      const x = widget.encoding.x;
      if (!x) break;
      const n = distinct(x.field.header);
      if (n < RADAR_MIN || n > RADAR_MAX) {
        out.push(`雷達圖的軸有 ${n} 個，${RADAR_MIN}～${RADAR_MAX} 個才好讀`);
      }
      break;
    }
    case 'scatter': {
      const { x, y, color, detail } = widget.encoding;
      if (!x || !y) break;
      const result = queryScatter(queryCtx, x, y, color?.field, detail?.field);
      const points = result.series.reduce((sum, s) => sum + s.points.length, 0);
      if (points < SCATTER_MIN) out.push(`散佈圖只有 ${points} 個點，看不出關係`);
      break;
    }
    default:
      break;
  }
  const stacked =
    (widget.type === 'bar' || widget.type === 'line' || widget.type === 'combo') &&
    widget.options?.stacked === true;
  if (stacked) {
    const ratios = widget.encoding.y.filter((m) => isRatio(ctx.profileOf(m.field.header)));
    if (ratios.length > 0) {
      out.push(`「${ratios.map((m) => m.field.header).join('、')}」是比率，堆疊起來沒有意義`);
    }
  }
  return out;
}

// 元件裡所有量值槽位的項目。
function measureEntries(widget: Widget): Measure[] {
  return WIDGET_SLOTS[widget.type]
    .filter(
      (slot) => slot.kind === 'measure' || slot.kind === 'measures' || slot.kind === 'columns',
    )
    .flatMap((slot) => readSlot(widget, slot))
    .filter((e): e is SlotEntry & Measure => e.agg !== undefined);
}

// 同一條 Y 軸上的量值橫跨的單位群組（組合圖左右軸分開算）。
function mixedAxes(widget: Widget, ctx: Context): string[][] {
  let axes: Measure[][] = [];
  if (widget.type === 'line' || widget.type === 'bar' || widget.type === 'radar') {
    axes = [widget.encoding.y];
  } else if (widget.type === 'combo') {
    axes = [
      widget.encoding.y.filter((m) => m.axis === 'left'),
      widget.encoding.y.filter((m) => m.axis === 'right'),
    ];
  }
  return axes.flatMap((measures) => {
    const groups = new Set(
      measures.flatMap((m) => {
        const profile = ctx.profileOf(m.field.header);
        return profile ? [unitGroup(profile)] : [];
      }),
    );
    return groups.size > 1 ? [measures.map((m) => m.field.header)] : [];
  });
}

// 通用檢查（ADR 0010 §5-2）。
function generalChecks(widget: Widget, ctx: Context): WidgetWarning[] {
  const out: WidgetWarning[] = [];
  const seen = new Set<string>();
  for (const m of measureEntries(widget)) {
    const profile = ctx.profileOf(m.field.header);
    if (profile?.kind.kind !== 'ratio' || profile.kind.ratio === 'weighted') continue;
    const key = `${m.field.header}:${m.agg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inferred = profile.kind.ratio === 'inferred';
    const what = inferred ? '看起來是比率' : '是比率';
    if (m.agg === 'sum') {
      out.push({
        id: `sum:${key}`,
        level: 'warning',
        message: `「${m.field.header}」${what}，加總沒有意義，建議改用平均`,
      });
    } else if (m.agg === 'avg') {
      out.push({
        id: `avg:${key}`,
        level: 'tip',
        message: inferred
          ? `「${m.field.header}」看起來是比率但還沒標記，目前的平均是非加權平均；到資料集頁標記並指定分子分母會更準`
          : `「${m.field.header}」沒有分子分母，合併多列時是非加權平均，只能參考；可到資料集頁指定分子分母`,
        markRatio: true,
      });
    }
  }
  for (const headers of mixedAxes(widget, ctx)) {
    out.push({
      id: `units:${headers.join(',')}`,
      level: 'warning',
      message: `同一條 Y 軸上有不同單位的數值（${headers.join('、')}），建議改用組合圖分左右軸`,
    });
  }
  // 時間軸不檢查：時間要照先後排，不能依大小排序或只取前 N 名。
  const barX = widget.type === 'bar' ? widget.encoding.x : undefined;
  if (widget.type === 'bar' && barX && ctx.profileOf(barX.field.header)?.kind.kind !== 'time') {
    const n = ctx.profileOf(barX.field.header)?.distinct ?? 0;
    if (n > BAR_MANY && !widget.options?.sort && !widget.options?.limit) {
      out.push({
        id: 'bar-many',
        level: 'warning',
        message: `X 軸有 ${n} 種值，建議由大到小排序並只顯示前 10 名`,
      });
    }
  }
  return out;
}

// 元件用到的所有欄位標頭（依槽位順序、不重複）。
function usedHeaders(widget: Widget): string[] {
  const headers = WIDGET_SLOTS[widget.type].flatMap((slot) =>
    readSlot(widget, slot).map((e) => e.field.header),
  );
  return [...new Set(headers)];
}

function sameConfig(a: Widget, b: Widget): boolean {
  const config = (w: Widget) =>
    JSON.stringify({
      type: w.type,
      encoding: w.encoding,
      options: 'options' in w ? w.options : undefined,
    });
  return config(a) === config(b);
}

// 一個元件的下一步提示、警告與改用建議。profiles 是整張表的欄位分類（profileTable），
// rows 是整張表的資料列。欄位不在資料表裡時不檢查（卡片已經顯示「欄位遺失」）。
export function checkWidget(
  widget: Widget,
  table: DataTable,
  rows: readonly Row[],
  profiles: readonly FieldProfile[],
): WidgetCheck {
  if (widget.type === 'text') return { warnings: [] };
  const step = nextStep(widget);
  const headers = usedHeaders(widget);
  const fields = headers.map((h) => resolveField(table, { header: h }));
  if (fields.some((f) => f === undefined)) return { nextStep: step, warnings: [] };
  const byHeader = new Map(profiles.map((p) => [p.field.header, p]));
  const ctx: Context = { table, rows, profileOf: (h) => byHeader.get(h) };

  const warnings: WidgetWarning[] = [
    ...violations(widget, ctx).map((message, i): WidgetWarning => ({
      id: `rule:${i}`,
      level: 'warning',
      message,
    })),
    ...generalChecks(widget, ctx),
  ];
  let fix: Widget | undefined;
  if (warnings.some((w) => w.level === 'warning')) {
    const best = recommend(table, rows, profiles, headers).recommendations[0]?.widget;
    if (best && !sameConfig(best, widget)) {
      // 使用者自己取的標題與說明保留；還是預設名稱（例如「圓餅圖」）時才換成推薦的標題。
      const defaultTitle = !widget.title || widget.title === WIDGET_TYPE_LABELS[widget.type];
      fix = {
        ...best,
        id: widget.id,
        title: defaultTitle ? best.title : widget.title,
        description: widget.description,
        filters: widget.filters,
      };
      if (fix.description === undefined) delete fix.description;
    }
  }
  return { nextStep: step, warnings, fix };
}
