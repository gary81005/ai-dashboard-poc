// CRM 匯出檔（crm_export_YYYYMMDD.xlsx：客戶、拜訪、商機三張工作表）的標準化設定。
//
// 產出星狀結構：事實表 拜訪紀錄、商機；維度表 客戶、業務員、組織（大區）、事業部、廠牌、產品、日曆；
// 彙總表 業務員月彙總、月度彙總；以及資料品質檢核 DQ01–DQ15。
// 這裡只有欄位名稱與轉換規則，不含任何資料。原始檔與產出檔都是真實資料，放在 docs/poc/，不要 commit。

import { add, countIfs, countRows, gt, ratio, ref, sameRow, sub, sumIfs } from '../formula.ts';
import type { Condition, Expr } from '../formula.ts';
import { aggregateTable, rowTable } from '../types.ts';
import type {
  Cell,
  Column,
  ColumnType,
  Context,
  RawRow,
  RawValue,
  StandardizeSpec,
} from '../types.ts';
import {
  MISSING,
  bracketPrefix,
  calendarMonths,
  cleanText,
  datePart,
  distinctKeys,
  flag,
  isMissing,
  keep,
  leadingNonDigits,
  mostCommon,
  sheetRows,
  sourcesOf,
  splitFirst,
  text,
  toDate,
  toNumber,
  toRatio,
} from '../values.ts';
import type { DatePart, KeyEntry, MonthRow } from '../values.ts';

// ── 欄位的簡寫 ───────────────────────────────────────────────────────

type Meta = { source: string; width: number; unit?: string };

function col<R>(
  header: string,
  code: string,
  type: ColumnType,
  meta: Meta,
  value: (row: R, ctx: Context) => Cell,
): Column<R> {
  return { header, code, type, ...meta, value };
}

// 資料來源的寫法（欄位定義的「資料來源」欄）。
const RAW = '原樣匯入';
const NORMALIZED = '正規化';
const DERIVED = '衍生';
const SPLIT = '衍生（拆解原始字串）';
const TO_DATE = '正規化（文字→日期）';
const TO_NUMBER = '正規化（文字→數字）';
const YES = '1=是';

// 2025 年組織調整前的名稱帶這個字尾，例如「华东区(2025旧版)」：保留原始值，另開旗標欄。
const LEGACY = /\(2025旧版\)$/;
const isLegacy = (value: RawValue) => typeof value === 'string' && LEGACY.test(value);
const stripLegacy = (value: string) => value.replace(LEGACY, '');

// 產品欄位：清除不換行空白；缺值不列入產品主檔。
const productKey = (value: RawValue) => (isMissing(value) ? null : cleanText(String(value)));

// 日期欄位展開成 年／月／年月／季別。
function dateColumns(
  from: string,
  parts: Array<
    [header: string, code: string, part: DatePart, width: number, unit?: string, source?: string]
  >,
): Column<RawRow>[] {
  return parts.map(([header, code, part, width, unit, source]) =>
    col<RawRow>(
      header,
      code,
      part === 'year' || part === 'month' ? '整數' : '文字',
      { source: source ?? DERIVED, width, ...(unit && { unit }) },
      (r) => datePart(toDate(r[from] ?? null), part),
    ),
  );
}

// 階段狀態「0% - 丢单」「100% - 签约（赢单）」→ 贏單／丟單；空白是還在進行中。
function stageOf(value: RawValue): '贏單' | '丟單' | '進行中' {
  const s = typeof value === 'string' ? value : '';
  if (s.includes('赢单')) return '贏單';
  if (s.includes('丢单')) return '丟單';
  return '進行中';
}

// 輸單原因「延迟采购 - 客户因素」：後段是大類、前段是細項。
function loseReason(value: RawValue, part: 'main' | 'sub'): string {
  if (isMissing(value)) return MISSING;
  const [sub, main] = splitFirst(String(value), ' - ');
  return (part === 'main' ? main : sub) ?? MISSING;
}

// 成交商品「[ZO]Cornea 手术包」的廠牌；「[null]」或沒有前綴時是未提供。
function brandOf(value: RawValue): string {
  if (isMissing(value)) return MISSING;
  const { code } = bracketPrefix(String(value));
  return code && code !== 'null' ? code : MISSING;
}

// ── 維度表的屬性 ─────────────────────────────────────────────────────

// 業務員在各列出現過的姓名（移除舊版字尾），依出現次數由多到少。
function repNames(entry: KeyEntry): string[] {
  const names = entry.hits
    .map((h) => h.row['業務姓名'])
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .map(stripLegacy);
  const main = mostCommon(names);
  return main === undefined ? [] : [main, ...new Set(names.filter((n) => n !== main))];
}

// 拜訪的客戶名稱與客戶主檔不一致的筆數（給使用說明）。
function nameMismatches(ctx: Context): number {
  const master = new Map((ctx.raw['客戶'] ?? []).map((r) => [r['客戶編號'], r['客戶名稱']]));
  return (ctx.raw['拜訪'] ?? []).filter((r) => master.get(r['客戶編號']) !== r['客戶名稱']).length;
}

function dateRange(ctx: Context, sheet: string, header: string): [string, string] {
  const dates = (ctx.raw[sheet] ?? [])
    .map((r) => toDate(r[header] ?? null))
    .filter((d): d is Date => d !== null)
    .map((d) => d.toISOString().slice(0, 10))
    .sort();
  return [dates[0] ?? '', dates.at(-1) ?? ''];
}

const tenThousands = (n: number) => `${(n / 10000).toFixed(1)} 萬`;

// ── 彙總公式的條件 ───────────────────────────────────────────────────

const byPeriod = ['年月', sameRow('年月')] as const;
const byRep = ['業務員編', sameRow('業務員編')] as const;
const visitsWhere = (...where: Condition[]): Expr =>
  countIfs('拜訪紀錄', byPeriod, byRep, ...where);
const oppsWhere = (...where: Condition[]): Expr => countIfs('商機', byPeriod, byRep, ...where);

// ── 設定 ─────────────────────────────────────────────────────────────

export const spec: StandardizeSpec = {
  readme: [
    [
      '本檔用途',
      (ctx) =>
        `將 ${ctx.sourceName} 重整為與前述各份資料庫一致的標準化結構，供自動化萃取與 BI 串接使用。`,
    ],
    [
      '本檔用途',
      '★ 原始資料一筆未刪、一值未改：所有調整僅限型別正規化與新增衍生欄位，原始值均保留於「原始值」欄。',
    ],
    [
      '本檔用途',
      '★ 資料品質問題一律不私自修補，改為標記旗標並列入「資料品質檢核」，由業務單位判斷如何處理。',
    ],
    [
      '結構規範',
      '每張資料工作表第 1 列為欄位標題，第 2 列起為資料，無空列、無小計或合計列、無合併儲存格。',
    ],
    [
      '結構規範',
      '每張工作表皆已定義為 Excel 表格物件（tbl_ 開頭），可直接以 pandas.read_excel(header=0) 或 BI 工具讀取。',
    ],
    [
      '結構規範',
      (ctx) =>
        `★ 拜訪紀錄 ${tenThousands(ctx.raw['拜訪']?.length ?? 0)}列、客戶主檔 ${tenThousands(ctx.raw['客戶']?.length ?? 0)}列，衍生欄位一律於 ETL 階段算好存為數值，不放 Excel 公式。`,
    ],
    [
      '結構規範',
      '★ 公式只出現在彙總層（業務員月彙總、月度彙總）與檢核層，開檔不會因十萬條公式而卡住。',
    ],
    [
      '星狀結構',
      '維度表：客戶主檔、業務員主檔、組織主檔、事業部主檔、廠牌主檔、產品主檔、日曆參數。',
    ],
    ['星狀結構', '事實表：拜訪紀錄（主鍵 拜訪編號）、商機（主鍵 商機編號）。'],
    [
      '星狀結構',
      (ctx) =>
        `★ 事實表已移除冗餘的「客戶名稱」「業務姓名」，改以代號 join 維度表；原檔有 ${nameMismatches(ctx)} 筆拜訪的客戶名稱與主檔不一致，正是冗餘造成的。`,
    ],
    [
      '欄位更名',
      '★ 原檔「大區」在兩張表意義不同：拜訪表的「大區」實為事業部，拜訪表的「地區」才是大區。',
    ],
    [
      '欄位更名',
      '★ 已統一更名為 事業部 / 大區，兩張事實表的「大區」現在指同一件事，可直接合併分析。',
    ],
    [
      '欄位更名',
      '大區原始字串同時塞了大區名稱與涵蓋省份（如「中原区 河南陕西安徽」），已在組織主檔拆為兩欄。',
    ],
    ['型別正規化', '成單機率由文字「50%」轉為小數 0.5；報價金額、欲購買數量由文字轉為數字。'],
    ['型別正規化', '拜訪日期、預計結束日期由文字轉為真實日期，並衍生 年／月／年月／季別。'],
    ['型別正規化', '空白與「-」一律正規化為「未提供」，不留空值，避免匯入時產生 NaN。'],
    [
      '型別正規化',
      '階段狀態「0% - 丢单」拆為 階段分類（贏單/丟單/進行中）與 是否已結案／是否贏單 旗標。',
    ],
    ['型別正規化', '輸單原因「延迟采购 - 客户因素」拆為 大類（客户因素）與 細項（延迟采购）。'],
    ['型別正規化', '產品與成交商品的「[廠牌]」前綴已抽出為廠牌代碼；不斷行空白（\\xa0）已清除。'],
    [
      '已知限制',
      (ctx) => {
        const years = [
          ...new Set(
            (ctx.raw['商機'] ?? []).map((r) => toDate(r['預計結束日期'] ?? null)?.getUTCFullYear()),
          ),
        ]
          .filter((y) => y !== undefined)
          .sort();
        return `★ 拜訪表引用的商機編號有大量無法對應到商機表，因商機表僅含預計結束日期在 ${years.join('、')} 年的案件，詳見資料品質檢核 DQ01。`;
      },
    ],
    [
      '已知限制',
      (ctx) => {
        const [from, to] = dateRange(ctx, '拜訪', '拜訪日期');
        return `拜訪日期僅涵蓋 ${from} 至 ${to}，不足一年，年增率等同期比較指標尚無法計算。`;
      },
    ],
    [
      '已知限制',
      '原檔無實際成交日期與成交金額，只有報價金額與預計結束日期，故無法計算真實營收，僅能做商機管道分析。',
    ],
    ['顏色規則', '藍色字＝原始或 ETL 產生的資料值；黑色字＝同表公式；綠色字＝跨工作表連結。'],
    [
      '後續建議',
      '若要接自動化，建議由 CRM API 或資料庫直接取數，本檔的欄位代碼與表結構可直接作為目標 schema。',
    ],
    ['後續建議', '涉及商品的多品項字串建議在來源端改為一對多明細，否則產品別分析永遠會有誤差。'],
  ],

  tables: [
    rowTable<MonthRow>({
      sheet: '日曆參數',
      table: 'tbl_dim_calendar',
      rows: calendarMonths([
        { sheet: '拜訪', header: '拜訪日期' },
        { sheet: '商機', header: '預計結束日期' },
      ]),
      columns: [
        col('年月', 'period', '文字', { unit: 'YYYY-MM', source: DERIVED, width: 11 }, (m) =>
          datePart(m.date, 'period'),
        ),
        col('年', 'year', '整數', { source: DERIVED, width: 7 }, (m) => datePart(m.date, 'year')),
        col('月', 'month', '整數', { unit: '1-12', source: DERIVED, width: 6 }, (m) =>
          datePart(m.date, 'month'),
        ),
        col('月初日期', 'month_start', '日期', { source: DERIVED, width: 13 }, (m) => m.date),
        col('季別', 'quarter', '文字', { unit: 'Q1-Q4', source: DERIVED, width: 9 }, (m) =>
          datePart(m.date, 'quarter'),
        ),
      ],
    }),

    rowTable<RawRow>({
      sheet: '客戶主檔',
      table: 'tbl_dim_customer',
      rows: sheetRows('客戶'),
      columns: [
        col('客戶編號', 'customer_id', '文字', { source: RAW, width: 14 }, (r) =>
          keep(r['客戶編號']),
        ),
        col('客戶名稱', 'customer_name', '文字', { source: RAW, width: 42 }, (r) =>
          keep(r['客戶名稱']),
        ),
        col(
          '客戶類型',
          'customer_type',
          '文字',
          { source: '正規化（空白與「-」→未提供）', width: 12 },
          (r) => text(r['客戶類型']),
        ),
        col('客戶分類', 'customer_class', '文字', { source: NORMALIZED, width: 14 }, (r) =>
          text(r['客戶分類']),
        ),
        col('客戶分級', 'customer_grade', '文字', { source: NORMALIZED, width: 12 }, (r) =>
          text(r['客戶分級']),
        ),
        col('省份', 'province', '文字', { source: NORMALIZED, width: 10 }, (r) => text(r['省份'])),
        col('縣市', 'city', '文字', { source: NORMALIZED, width: 11 }, (r) => text(r['縣市'])),
        col('縣區', 'district', '文字', { source: NORMALIZED, width: 11 }, (r) => text(r['縣區'])),
        // 「-」代表匯出系統有這筆但沒填，只有全部真的空白才算沒有屬性資料。
        col(
          '屬性資料是否完整',
          'has_attributes',
          '整數',
          { unit: YES, source: DERIVED, width: 16 },
          (r) =>
            flag(
              !['客戶類型', '客戶分類', '客戶分級', '省份', '縣市', '縣區'].every(
                (h) => r[h] === null || r[h] === '',
              ),
            ),
        ),
        col(
          '客戶名稱是否重複',
          'name_duplicated',
          '整數',
          { unit: YES, source: DERIVED, width: 16 },
          (r, ctx) => flag(ctx.countOf('客戶', '客戶名稱', r['客戶名稱'] ?? null) > 1),
        ),
      ],
    }),

    rowTable<KeyEntry>({
      sheet: '業務員主檔',
      table: 'tbl_dim_rep',
      rows: distinctKeys([
        {
          sheet: '拜訪',
          label: '拜訪',
          key: (r) => (isMissing(r['業務員編']) ? null : String(r['業務員編'])),
        },
        {
          sheet: '商機',
          label: '商機',
          key: (r) => (isMissing(r['業務員編']) ? null : String(r['業務員編'])),
        },
      ]),
      columns: [
        col('業務員編', 'rep_id', '文字', { source: RAW, width: 12 }, (e) => e.key),
        col(
          '業務姓名',
          'rep_name',
          '文字',
          { source: '正規化（移除「(2025旧版)」字尾）', width: 16 },
          (e) => repNames(e)[0] ?? MISSING,
        ),
        col('其他出現過的姓名', 'rep_name_alt', '文字', { source: DERIVED, width: 22 }, (e) =>
          repNames(e).length > 1 ? repNames(e).slice(1).join(' / ') : MISSING,
        ),
        col('一編多名', 'name_conflict', '整數', { unit: YES, source: DERIVED, width: 11 }, (e) =>
          flag(repNames(e).length > 1),
        ),
        col(
          '是否為未指派代碼',
          'is_unassigned',
          '整數',
          { unit: '1=是(TBH)', source: DERIVED, width: 16 },
          (e) => flag(e.key === 'TBH'),
        ),
        col(
          '是否僅見於舊組織版本',
          'legacy_only',
          '整數',
          { unit: YES, source: DERIVED, width: 20 },
          (e) => flag(e.hits.every((h) => isLegacy(h.row['業務姓名'] ?? null))),
        ),
      ],
    }),

    rowTable<KeyEntry>({
      sheet: '組織主檔',
      table: 'tbl_dim_region',
      rows: distinctKeys([
        {
          sheet: '拜訪',
          label: '拜訪',
          key: (r) => (isMissing(r['地區']) ? null : String(r['地區'])),
        },
        {
          sheet: '商機',
          label: '商機',
          key: (r) => (isMissing(r['大區']) ? null : String(r['大區'])),
        },
      ]),
      columns: [
        col(
          '大區原始值',
          'region_raw',
          '文字',
          { unit: '作為 join 鍵', source: RAW, width: 24 },
          (e) => e.key,
        ),
        col(
          '大區名稱',
          'region_name',
          '文字',
          { source: SPLIT, width: 16 },
          (e) => splitFirst(stripLegacy(e.key), ' ')[0],
        ),
        col('涵蓋省份', 'provinces', '文字', { source: SPLIT, width: 20 }, (e) =>
          text(splitFirst(stripLegacy(e.key), ' ')[1]),
        ),
        col('是否舊組織版本', 'is_legacy', '整數', { unit: YES, source: DERIVED, width: 16 }, (e) =>
          flag(isLegacy(e.key)),
        ),
      ],
    }),

    rowTable<KeyEntry>({
      sheet: '事業部主檔',
      table: 'tbl_dim_bu',
      rows: distinctKeys([
        {
          sheet: '拜訪',
          label: '拜訪',
          key: (r) => (isMissing(r['大區']) ? null : String(r['大區'])),
        },
      ]),
      columns: [
        col(
          '事業部原始值',
          'bu_raw',
          '文字',
          { unit: '作為 join 鍵', source: RAW, width: 26 },
          (e) => e.key,
        ),
        col('事業部名稱', 'bu_name', '文字', { source: DERIVED, width: 20 }, (e) =>
          stripLegacy(e.key),
        ),
        col('是否舊組織版本', 'is_legacy', '整數', { unit: YES, source: DERIVED, width: 16 }, (e) =>
          flag(isLegacy(e.key)),
        ),
      ],
    }),

    rowTable<KeyEntry>({
      sheet: '廠牌主檔',
      table: 'tbl_dim_brand',
      rows: distinctKeys([
        {
          sheet: '商機',
          label: '欲購買廠牌',
          key: (r) => (isMissing(r['欲購買廠牌']) ? null : String(r['欲購買廠牌'])),
        },
        {
          sheet: '商機',
          label: '成交商品',
          key: (r) => {
            const brand = brandOf(r['成交商品'] ?? null);
            return brand === MISSING ? null : brand;
          },
        },
      ]),
      columns: [col('廠牌代碼', 'brand_code', '文字', { source: RAW, width: 12 }, (e) => e.key)],
    }),

    rowTable<KeyEntry>({
      sheet: '產品主檔',
      table: 'tbl_dim_product',
      rows: distinctKeys([
        { sheet: '商機', label: '商機欲購買商品', key: (r) => productKey(r['欲購買商品'] ?? null) },
        { sheet: '商機', label: '商機成交商品', key: (r) => productKey(r['成交商品'] ?? null) },
        { sheet: '拜訪', label: '拜訪涉及商品', key: (r) => productKey(r['涉及商品'] ?? null) },
      ]),
      columns: [
        col(
          '產品原始值',
          'product_raw',
          '文字',
          { unit: '作為 join 鍵', source: RAW, width: 34 },
          (e) => e.key,
        ),
        col(
          '產品名稱',
          'product_name',
          '文字',
          { source: '衍生（移除 [廠牌] 前綴）', width: 30 },
          (e) => bracketPrefix(e.key).rest,
        ),
        col(
          '廠牌代碼',
          'brand_code',
          '文字',
          { source: '衍生（取自 [廠牌] 前綴）', width: 12 },
          (e) => brandOf(e.key),
        ),
        col(
          '是否為多品項字串',
          'is_multi',
          '整數',
          { unit: YES, source: DERIVED, width: 16 },
          (e) => flag(e.key.includes('/')),
        ),
        col('出現於哪些欄位', 'source_fields', '文字', { source: DERIVED, width: 26 }, (e) =>
          sourcesOf(e).join(' / '),
        ),
      ],
    }),

    rowTable<RawRow>({
      sheet: '拜訪紀錄',
      table: 'tbl_fact_visit',
      rows: sheetRows('拜訪'),
      columns: [
        col('拜訪編號', 'visit_id', '文字', { unit: '主鍵', source: RAW, width: 11 }, (r) =>
          keep(r['拜訪編號']),
        ),
        col('拜訪日期', 'visit_date', '日期', { source: TO_DATE, width: 12 }, (r) =>
          toDate(r['拜訪日期'] ?? null),
        ),
        ...dateColumns('拜訪日期', [
          ['年', 'year', 'year', 7],
          ['月', 'month', 'month', 6, '1-12'],
          ['年月', 'period', 'period', 11, 'YYYY-MM'],
          ['季別', 'quarter', 'quarter', 8, 'Q1-Q4'],
        ]),
        col(
          '拜訪狀態',
          'visit_status',
          '文字',
          { unit: '全檔單一值', source: RAW, width: 11 },
          (r) => keep(r['拜訪狀態']),
        ),
        col('拜訪類型', 'visit_type', '文字', { source: RAW, width: 12 }, (r) =>
          keep(r['拜訪類型']),
        ),
        col(
          '是否商機拜訪',
          'is_opp_visit',
          '整數',
          { unit: YES, source: DERIVED, width: 13 },
          (r) => flag(r['拜訪類型'] === '商机拜访'),
        ),
        col(
          '商機編號',
          'opportunity_id',
          '文字',
          { source: '正規化（空白→未提供）', width: 18 },
          (r) => text(r['商機編號']),
        ),
        col(
          '商機編號可否對應',
          'opp_id_resolvable',
          '整數',
          { unit: '1=可 0=不可 -1=無商機', source: DERIVED, width: 20 },
          (r, ctx) => {
            const id = r['商機編號'] ?? null;
            if (isMissing(id)) return -1;
            return flag(ctx.valuesOf('商機', '商機編號').has(id));
          },
        ),
        col(
          '客戶編號',
          'customer_id',
          '文字',
          { unit: 'join 客戶主檔', source: RAW, width: 13 },
          (r) => keep(r['客戶編號']),
        ),
        // 原檔拜訪表的「大區」其實是事業部、「地區」才是大區，更名後兩張事實表的「大區」意思一致。
        col(
          '事業部',
          'bu_raw',
          '文字',
          { unit: '原欄名為「大區」', source: '原樣匯入（欄位更名）', width: 20 },
          (r) => keep(r['大區']),
        ),
        col(
          '事業部是否舊版',
          'bu_is_legacy',
          '整數',
          { unit: YES, source: DERIVED, width: 14 },
          (r) => flag(isLegacy(r['大區'] ?? null)),
        ),
        col(
          '大區',
          'region_raw',
          '文字',
          { unit: '原欄名為「地區」', source: '原樣匯入（欄位更名）', width: 24 },
          (r) => keep(r['地區']),
        ),
        col(
          '大區是否舊版',
          'region_is_legacy',
          '整數',
          { unit: YES, source: DERIVED, width: 14 },
          (r) => flag(isLegacy(r['地區'] ?? null)),
        ),
        col(
          '業務員編',
          'rep_id',
          '文字',
          { unit: 'join 業務員主檔', source: RAW, width: 12 },
          (r) => keep(r['業務員編']),
        ),
        col('銷售拜訪類型', 'sales_visit_type', '文字', { source: RAW, width: 24 }, (r) =>
          keep(r['銷售拜訪類型']),
        ),
        col(
          '涉及商品',
          'product_raw',
          '文字',
          { unit: 'join 產品主檔', source: RAW, width: 22 },
          (r) => productKey(r['涉及商品'] ?? null) ?? MISSING,
        ),
        col(
          '涉及商品是否多品項',
          'product_is_multi',
          '整數',
          { unit: YES, source: DERIVED, width: 20 },
          (r) => flag(String(r['涉及商品'] ?? '').includes('/')),
        ),
        col('場所方式', 'venue', '文字', { source: RAW, width: 14 }, (r) => keep(r['場所方式'])),
        col('是否面對面', 'is_facetoface', '整數', { unit: YES, source: DERIVED, width: 12 }, (r) =>
          flag(r['場所方式'] === '面对面'),
        ),
        col('拜訪結果', 'visit_note', '文字', { unit: '自由文字', source: RAW, width: 60 }, (r) =>
          keep(r['拜訪結果']),
        ),
      ],
    }),

    rowTable<RawRow>({
      sheet: '商機',
      table: 'tbl_fact_opportunity',
      rows: sheetRows('商機'),
      columns: [
        col('商機編號', 'opportunity_id', '文字', { unit: '主鍵', source: RAW, width: 17 }, (r) =>
          keep(r['商機編號']),
        ),
        col('商機編號前綴', 'opp_id_prefix', '文字', { source: DERIVED, width: 14 }, (r) =>
          leadingNonDigits(String(r['商機編號'] ?? '')),
        ),
        col(
          '客戶編號',
          'customer_id',
          '文字',
          { unit: 'join 客戶主檔', source: RAW, width: 13 },
          (r) => keep(r['客戶編號']),
        ),
        col(
          '業務員編',
          'rep_id',
          '文字',
          { unit: 'join 業務員主檔', source: RAW, width: 12 },
          (r) => keep(r['業務員編']),
        ),
        col(
          '大區',
          'region_raw',
          '文字',
          { unit: 'join 組織主檔', source: NORMALIZED, width: 22 },
          (r) => text(r['大區']),
        ),
        col(
          '大區是否舊版',
          'region_is_legacy',
          '整數',
          { unit: YES, source: DERIVED, width: 14 },
          (r) => flag(isLegacy(r['大區'] ?? null)),
        ),
        col('商機類別', 'opp_category', '文字', { source: RAW, width: 20 }, (r) =>
          keep(r['商機類別']),
        ),
        col(
          '商機內容',
          'opp_desc',
          '文字',
          { unit: '自由文字', source: NORMALIZED, width: 26 },
          (r) => text(r['商機內容'], { clean: true }),
        ),
        col(
          '成單機率',
          'win_probability',
          '百分比',
          { unit: '小數', source: '正規化（「50%」文字→0.5）', width: 11 },
          (r) => toRatio(r['成單機率'] ?? null),
        ),
        col('階段狀態原始值', 'stage_raw', '文字', { source: NORMALIZED, width: 20 }, (r) =>
          text(r['階段狀態']),
        ),
        col(
          '階段分類',
          'stage_category',
          '文字',
          { unit: '贏單/丟單/進行中', source: SPLIT, width: 12 },
          (r) => stageOf(r['階段狀態'] ?? null),
        ),
        col('是否已結案', 'is_closed', '整數', { unit: YES, source: DERIVED, width: 12 }, (r) =>
          flag(stageOf(r['階段狀態'] ?? null) !== '進行中'),
        ),
        col('是否贏單', 'is_won', '整數', { unit: YES, source: DERIVED, width: 11 }, (r) =>
          flag(stageOf(r['階段狀態'] ?? null) === '贏單'),
        ),
        col('輸單原因原始值', 'lose_reason_raw', '文字', { source: NORMALIZED, width: 22 }, (r) =>
          text(r['輸單原因']),
        ),
        col('輸單原因大類', 'lose_reason_main', '文字', { source: SPLIT, width: 16 }, (r) =>
          loseReason(r['輸單原因'] ?? null, 'main'),
        ),
        col('輸單原因細項', 'lose_reason_sub', '文字', { source: SPLIT, width: 16 }, (r) =>
          loseReason(r['輸單原因'] ?? null, 'sub'),
        ),
        col(
          '欲購買廠牌',
          'brand_code',
          '文字',
          { unit: 'join 廠牌主檔', source: NORMALIZED, width: 13 },
          (r) => text(r['欲購買廠牌']),
        ),
        col(
          '欲購買商品',
          'product_raw',
          '文字',
          { unit: 'join 產品主檔', source: RAW, width: 20 },
          (r) => productKey(r['欲購買商品'] ?? null) ?? MISSING,
        ),
        col('欲購買數量', 'qty', '整數', { unit: '台', source: TO_NUMBER, width: 12 }, (r) =>
          toNumber(r['欲購買數量'] ?? null),
        ),
        col('預計結束日期', 'expected_close', '日期', { source: TO_DATE, width: 14 }, (r) =>
          toDate(r['預計結束日期'] ?? null),
        ),
        ...dateColumns('預計結束日期', [
          ['預計成單年', 'year', 'year', 12, undefined, '衍生（原檔另有同名欄，與日期一致）'],
          ['預計成單月', 'month', 'month', 12, '1-12'],
          ['年月', 'period', 'period', 11, 'YYYY-MM'],
        ]),
        col('報價金額', 'quote_amount', '數值', { unit: '元', source: TO_NUMBER, width: 14 }, (r) =>
          toNumber(r['報價金額(元)'] ?? null),
        ),
        // 預算範圍的「0」是沒填，不是零預算。
        col(
          '預算範圍',
          'budget_range',
          '文字',
          { source: '正規化（「0」→未填）', width: 12 },
          (r) => text(r['預算範圍'], { replace: { '0': '未填' } }),
        ),
        col(
          '成交商品',
          'deal_product_raw',
          '文字',
          { unit: 'join 產品主檔', source: NORMALIZED, width: 26 },
          (r) => productKey(r['成交商品'] ?? null) ?? MISSING,
        ),
        col('成交商品廠牌', 'deal_brand', '文字', { source: DERIVED, width: 14 }, (r) =>
          brandOf(r['成交商品'] ?? null),
        ),
        col(
          '贏單但無成交商品',
          'won_without_product',
          '整數',
          { unit: YES, source: DERIVED, width: 18 },
          (r) =>
            flag(stageOf(r['階段狀態'] ?? null) === '贏單' && isMissing(r['成交商品'] ?? null)),
        ),
        col(
          '客戶備註',
          'customer_note',
          '文字',
          { unit: '自由文字', source: NORMALIZED, width: 30 },
          (r) => text(r['客戶備註'], { clean: true }),
        ),
      ],
    }),

    aggregateTable({
      sheet: '業務員月彙總',
      table: 'tbl_agg_rep_month',
      rows: {
        keys: [
          { table: '拜訪紀錄', columns: ['年月', '業務員編'] },
          { table: '商機', columns: ['年月', '業務員編'] },
        ],
      },
      columns: [
        {
          header: '年月',
          code: 'period',
          type: '文字',
          unit: 'YYYY-MM',
          source: '手動輸入',
          width: 11,
          key: true,
        },
        {
          header: '業務員編',
          code: 'rep_id',
          type: '文字',
          source: '手動輸入',
          width: 12,
          key: true,
        },
        {
          header: '業務姓名',
          code: 'rep_name',
          type: '文字',
          source: '連結 業務員主檔',
          width: 16,
          formula: {
            op: 'lookup',
            sheet: '業務員主檔',
            match: '業務員編',
            value: '業務姓名',
            by: '業務員編',
          },
        },
        {
          header: '拜訪筆數',
          code: 'visits',
          type: '整數',
          unit: '筆',
          source: '公式',
          width: 11,
          formula: visitsWhere(),
        },
        {
          header: '商機拜訪筆數',
          code: 'opp_visits',
          type: '整數',
          unit: '筆',
          source: '公式',
          width: 14,
          formula: visitsWhere(['是否商機拜訪', 1]),
        },
        {
          header: '面對面拜訪筆數',
          code: 'f2f_visits',
          type: '整數',
          unit: '筆',
          source: '公式',
          width: 16,
          formula: visitsWhere(['是否面對面', 1]),
        },
        {
          header: '面對面比率',
          code: 'f2f_rate',
          type: '百分比',
          unit: '小數',
          source: '公式',
          width: 13,
          formula: ratio(ref('面對面拜訪筆數'), ref('拜訪筆數')),
        },
        {
          header: '當月預計結案商機數',
          code: 'opps_due',
          type: '整數',
          unit: '件',
          source: '公式',
          width: 20,
          formula: oppsWhere(),
        },
        {
          header: '預計結案商機報價金額',
          code: 'quote_amount',
          type: '數值',
          unit: '元',
          source: '公式',
          width: 22,
          formula: sumIfs('商機', '報價金額', byPeriod, byRep),
        },
        {
          header: '贏單件數',
          code: 'won',
          type: '整數',
          unit: '件',
          source: '公式',
          width: 12,
          formula: oppsWhere(['是否贏單', 1]),
        },
        {
          header: '結案贏單率',
          code: 'win_rate',
          type: '百分比',
          unit: '小數',
          source: '公式',
          width: 14,
          formula: ratio(ref('贏單件數'), oppsWhere(['是否已結案', 1])),
        },
      ],
    }),

    aggregateTable({
      sheet: '月度彙總',
      table: 'tbl_agg_month',
      rows: { link: { table: '日曆參數', column: '年月' } },
      columns: [
        {
          header: '年月',
          code: 'period',
          type: '文字',
          unit: 'YYYY-MM',
          source: '連結 日曆參數',
          width: 11,
          link: { table: '日曆參數', column: '年月' },
        },
        {
          header: '拜訪筆數',
          code: 'visits',
          type: '整數',
          unit: '筆',
          source: '公式',
          width: 11,
          formula: countIfs('拜訪紀錄', byPeriod),
        },
        {
          header: '商機拜訪筆數',
          code: 'opp_visits',
          type: '整數',
          unit: '筆',
          source: '公式',
          width: 14,
          formula: countIfs('拜訪紀錄', byPeriod, ['是否商機拜訪', 1]),
        },
        {
          header: '面對面比率',
          code: 'f2f_rate',
          type: '百分比',
          unit: '小數',
          source: '公式',
          width: 13,
          formula: ratio(countIfs('拜訪紀錄', byPeriod, ['是否面對面', 1]), ref('拜訪筆數')),
        },
        {
          header: '有拜訪的業務員數',
          code: 'active_reps',
          type: '整數',
          unit: '人',
          source: '公式',
          width: 18,
          formula: countRows('業務員月彙總', byPeriod, ['拜訪筆數', gt(0)]),
        },
        {
          header: '預計結案商機數',
          code: 'opps_due',
          type: '整數',
          unit: '件',
          source: '公式',
          width: 16,
          formula: countIfs('商機', byPeriod),
        },
        {
          header: '商機報價金額',
          code: 'quote_amount',
          type: '數值',
          unit: '元',
          source: '公式',
          width: 16,
          formula: sumIfs('商機', '報價金額', byPeriod),
        },
        {
          header: '贏單件數',
          code: 'won',
          type: '整數',
          unit: '件',
          source: '公式',
          width: 12,
          formula: countIfs('商機', byPeriod, ['是否贏單', 1]),
        },
        {
          header: '丟單件數',
          code: 'lost',
          type: '整數',
          unit: '件',
          source: '公式',
          width: 12,
          formula: countIfs('商機', byPeriod, ['階段分類', '丟單']),
        },
        {
          header: '進行中件數',
          code: 'open',
          type: '整數',
          unit: '件',
          source: '公式',
          width: 14,
          formula: countIfs('商機', byPeriod, ['階段分類', '進行中']),
        },
        {
          header: '結案贏單率',
          code: 'win_rate',
          type: '百分比',
          unit: '小數',
          source: '公式',
          width: 14,
          formula: ratio(ref('贏單件數'), add(ref('贏單件數'), ref('丟單件數'))),
        },
      ],
    }),
  ],

  checks: [
    {
      id: 'DQ01',
      severity: '高',
      name: '拜訪的商機編號無法對應到商機表',
      affected: countIfs('拜訪紀錄', ['商機編號可否對應', 0]),
      base: ['拜訪紀錄'],
      note: '商機表似乎只匯出「預計結束日期落在 2026 年」的案件，舊商機被排除。請重新匯出完整商機，或接受此為已知匯出範圍限制。',
    },
    {
      id: 'DQ02',
      severity: '高',
      name: '業務姓名／大區帶有「(2025旧版)」組織版本字尾',
      affected: add(
        countIfs('商機', ['大區是否舊版', 1]),
        countIfs('拜訪紀錄', ['事業部是否舊版', 1]),
        countIfs('拜訪紀錄', ['大區是否舊版', 1]),
      ),
      base: ['商機', '拜訪紀錄'],
      note: '新舊組織並存會讓同一人被拆成兩列。已移除字尾並另開旗標欄；請確認是否要把舊版組織對應到新組織。',
    },
    {
      id: 'DQ03',
      severity: '高',
      name: '同一業務員編對應到多個姓名',
      affected: countIfs('業務員主檔', ['一編多名', 1]),
      base: ['業務員主檔'],
      note: '移除舊版字尾後仍有一編多名者，代表人員異動或資料輸入不一致，需人工確認以誰為準。',
    },
    {
      id: 'DQ04',
      severity: '中',
      name: '客戶主檔屬性全為空白',
      affected: countIfs('客戶主檔', ['屬性資料是否完整', 0]),
      base: ['客戶主檔'],
      note: '客戶類型、分級、地區全部空白，無法做任何客戶結構分析。建議補齊或標記為待建檔。',
    },
    {
      id: 'DQ05',
      severity: '中',
      name: '同一客戶名稱對應到多個客戶編號',
      affected: countIfs('客戶主檔', ['客戶名稱是否重複', 1]),
      base: ['客戶主檔'],
      note: '可能是重複建檔或院所合併。合併前請先確認拜訪與商機要掛到哪一個編號。',
    },
    {
      id: 'DQ06',
      severity: '中',
      name: '成單機率與階段狀態矛盾（機率 99% 卻已丟單）',
      affected: countIfs('商機', ['成單機率', 0.99], ['階段分類', '丟單']),
      base: ['商機'],
      note: '成單機率未隨結案更新。建議結案時強制同步機率，或分析時只採用階段分類欄。',
    },
    {
      id: 'DQ07',
      severity: '中',
      name: '已贏單但成交商品空白',
      affected: countIfs('商機', ['贏單但無成交商品', 1]),
      base: ['商機'],
      note: '贏單案件無法歸屬到產品，會低估該產品的成交表現。建議結案流程加上必填。',
    },
    {
      id: 'DQ08',
      severity: '中',
      name: '預算範圍填「0」但報價金額大於零',
      affected: countIfs('商機', ['預算範圍', '未填'], ['報價金額', gt(0)]),
      base: ['商機'],
      note: '預算範圍的「0」實為未填而非零預算，已正規化為「未填」。建議改為下拉選單並禁止空值。',
    },
    {
      id: 'DQ09',
      severity: '低',
      name: '報價金額為零',
      affected: countIfs('商機', ['報價金額', 0]),
      base: ['商機'],
      note: '報價為零的商機無法納入金額分析，請確認是未報價或資料遺漏。',
    },
    {
      id: 'DQ10',
      severity: '低',
      name: '欲購買數量為零',
      affected: countIfs('商機', ['欲購買數量', 0]),
      base: ['商機'],
      note: '數量為零但有報價金額，數量欄可能未填。',
    },
    {
      id: 'DQ11',
      severity: '低',
      name: '涉及商品欄一格內包含多個品項',
      affected: countIfs('拜訪紀錄', ['涉及商品是否多品項', 1]),
      base: ['拜訪紀錄'],
      note: '以「/」分隔多個產品，無法直接依產品彙總。建議改為一筆拜訪對多筆產品的明細表。',
    },
    {
      id: 'DQ12',
      severity: '低',
      name: '成交商品含「[null]」廠牌前綴',
      affected: sub(
        countIfs('商機', ['成交商品廠牌', MISSING]),
        countIfs('商機', ['成交商品', MISSING]),
      ),
      base: ['商機'],
      note: '有成交商品但廠牌標記為 null，廠牌維度會出現缺口。',
    },
    {
      id: 'DQ13',
      severity: '低',
      name: '拜訪狀態為全檔單一值',
      affected: countIfs('拜訪紀錄', ['拜訪狀態', 'Visited']),
      base: ['拜訪紀錄'],
      note: '全部都是 Visited，此欄不帶任何資訊。若匯出時可包含未完成拜訪，建議一併匯出以計算達成率。',
    },
    {
      id: 'DQ14',
      severity: '低',
      name: '未指派業務員代碼 TBH',
      affected: add(
        countIfs('拜訪紀錄', ['業務員編', 'TBH']),
        countIfs('商機', ['業務員編', 'TBH']),
      ),
      base: ['拜訪紀錄', '商機'],
      note: 'TBH 代表尚未指派人員，做人均產值時必須排除，否則會稀釋分母。',
    },
    {
      id: 'DQ15',
      severity: '低',
      name: '客戶主檔中從未出現在拜訪或商機的客戶',
      affected: {
        op: 'unreferenced',
        sheet: '客戶主檔',
        key: '客戶編號',
        refs: [
          ['拜訪紀錄', '客戶編號'],
          ['商機', '客戶編號'],
        ],
      },
      base: ['客戶主檔'],
      note: '休眠客戶佔主檔多數，建議匯出時加上「近 N 年有往來」篩選以縮小檔案。',
    },
  ],
};
