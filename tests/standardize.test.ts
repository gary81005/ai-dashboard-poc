import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseWorkbook } from '../src/services/parseWorkbook.ts';
import { standardizeWorkbook } from '../src/services/standardizeWorkbook.ts';
import { spec } from '../src/utils/standardize/specs/crm.ts';
import { detectSpec, missingColumns, SPECS } from '../src/utils/standardize/specs/index.ts';
import { standardize } from '../src/utils/standardize/engine.ts';
import {
  countIfs,
  createEvaluator,
  ratio,
  ref,
  sameRow,
  sheetName,
  sumIfs,
} from '../src/utils/standardize/formula.ts';
import type { Expr, SheetView } from '../src/utils/standardize/formula.ts';
import type {
  Cell,
  FormulaCell,
  OutputTable,
  RawRow,
  RawWorkbook,
} from '../src/utils/standardize/types.ts';
import {
  bracketPrefix,
  calendarMonths,
  distinctKeys,
  keep,
  leadingNonDigits,
  sourcesOf,
  splitFirst,
  text,
  toDate,
  toNumber,
  toRatio,
} from '../src/utils/standardize/values.ts';
import { createContext } from '../src/utils/standardize/engine.ts';

// 模擬的 CRM 匯出檔：醫院、業務員、產品都是虛構的。
const raw: RawWorkbook = {
  客戶: [
    {
      客戶編號: 'T001',
      客戶名稱: '測試醫院甲',
      客戶類型: '医疗机构',
      客戶分類: '-',
      客戶分級: '',
      省份: '甲省',
      縣市: '-',
      縣區: '-',
    },
    {
      客戶編號: 'T002',
      客戶名稱: '測試醫院乙',
      客戶類型: '',
      客戶分類: '',
      客戶分級: '',
      省份: '',
      縣市: '',
      縣區: '',
    },
    {
      客戶編號: 'T003',
      客戶名稱: '測試醫院甲',
      客戶類型: '经销商',
      客戶分類: '-',
      客戶分級: '-',
      省份: '乙省',
      縣市: '-',
      縣區: '-',
    },
    {
      客戶編號: 'T004',
      客戶名稱: '測試診所丙',
      客戶類型: '-',
      客戶分類: '-',
      客戶分級: '-',
      省份: '-',
      縣市: '-',
      縣區: '-',
    },
  ],
  拜訪: [
    visit(
      'V1',
      '2026-01-05',
      '商机拜访',
      'BF001',
      'T001',
      '測試事業部',
      '北區 甲省乙省',
      'C001',
      '業務甲',
      'ProductA\u00a0X',
      '面对面',
    ),
    visit(
      'V2',
      '2026-01-20',
      '无商机拜访',
      '',
      'T002',
      '舊事業部(2025旧版)',
      '南區(2025旧版)',
      'C002',
      '業務乙(2025旧版)',
      'ProductA X/ProductB',
      '远程（电话）',
    ),
    visit(
      'V3',
      '2026-02-03',
      '商机拜访',
      'OLD999',
      'T001',
      '測試事業部',
      '北區 甲省乙省',
      'C001',
      '業務甲',
      'ProductB',
      '面对面',
    ),
    visit(
      'V4',
      '2026-02-10',
      '无商机拜访',
      '',
      'T001',
      '測試事業部',
      '北區 甲省乙省',
      'TBH',
      'TBH',
      '-',
      '面对面',
    ),
  ],
  商機: [
    opportunity(
      'BF001',
      '50%',
      '100% - 签约（赢单）',
      '',
      '2026-01-31',
      '1000.1',
      '0',
      '[ZZ]ProductA\u00a0X',
      'C001',
      '業務甲',
      '北區 甲省乙省',
    ),
    opportunity(
      'CN-B002',
      '99%',
      '0% - 丢单',
      '延迟采购 - 客户因素',
      '2026-02-15',
      '2000.2',
      '0-25万',
      '',
      'C001',
      '業務甲',
      '北區 甲省乙省',
    ),
    opportunity(
      'M003',
      '25%',
      '',
      '',
      '2026-02-20',
      '0',
      '未知',
      '[null]其他配件',
      'C002',
      '業務乙(2025旧版)',
      '南區(2025旧版)',
    ),
  ],
};

function visit(
  id: string,
  date: string,
  type: string,
  opp: string,
  customer: string,
  bu: string,
  region: string,
  rep: string,
  repName: string,
  product: string,
  venue: string,
): RawRow {
  return {
    拜訪編號: id,
    拜訪日期: date,
    拜訪狀態: 'Visited',
    拜訪類型: type,
    商機編號: opp,
    客戶編號: customer,
    客戶名稱: customer === 'T001' ? '測試醫院甲' : '測試醫院乙',
    大區: bu,
    地區: region,
    業務員編: rep,
    業務姓名: repName,
    拜訪結果: '介紹產品',
    銷售拜訪類型: '定期回访',
    涉及商品: product,
    場所方式: venue,
  };
}

function opportunity(
  id: string,
  probability: string,
  stage: string,
  lose: string,
  close: string,
  quote: string,
  budget: string,
  deal: string,
  rep: string,
  repName: string,
  region: string,
): RawRow {
  return {
    商機編號: id,
    商機內容: '',
    商機類別: '由客户自己提出的需求',
    成單機率: probability,
    階段狀態: stage,
    輸單原因: lose,
    欲購買廠牌: 'ZZ',
    欲購買商品: 'ProductA\u00a0X',
    欲購買數量: quote === '0' ? '0' : '2',
    預計結束日期: close,
    預計成單年: 2026,
    預計成單月: Number(close.slice(5, 7)),
    '報價金額(元)': quote,
    預算範圍: budget,
    客戶編號: 'T001',
    客戶名稱: '測試醫院甲',
    客戶類型: '医疗机构',
    成交商品: deal,
    業務員編: rep,
    業務姓名: repName,
    大區: region,
    客戶備註: '',
  };
}

const output = standardize(spec, raw, 'crm_export_test.xlsx');
const table = (sheet: string): OutputTable => {
  const found = output.find((t) => t.sheet === sheet);
  if (!found) throw new Error(sheet);
  return found;
};
// 一張表轉成「標頭 → 值」的物件，方便斷言。
const records = (sheet: string): Array<Record<string, Cell>> => {
  const t = table(sheet);
  return t.rows.map((row) => Object.fromEntries(t.columns.map((c, i) => [c.header, row[i]])));
};
const formula = (cell: Cell): FormulaCell => {
  if (cell === null || typeof cell !== 'object' || !('formula' in cell))
    throw new Error('不是公式');
  return cell;
};

describe('values', () => {
  it('缺值與文字', () => {
    expect(text('')).toBe('未提供');
    expect(text('-')).toBe('未提供');
    expect(text('0', { replace: { '0': '未填' } })).toBe('未填');
    expect(text('A\u00a0B', { clean: true })).toBe('A B');
    expect(keep('-')).toBe('-');
    expect(keep('')).toBe('未提供');
  });

  it('型別轉換', () => {
    expect(toDate('2026-07-10')?.toISOString()).toBe('2026-07-10T00:00:00.000Z');
    expect(toDate('不是日期')).toBeNull();
    expect(toNumber('1,200')).toBe(1200);
    expect(toNumber('')).toBeNull();
    expect(toRatio('50%')).toBe(0.5);
    expect(toRatio(0.25)).toBe(0.25);
  });

  it('字串拆解', () => {
    expect(splitFirst('中區 甲省乙省', ' ')).toEqual(['中區', '甲省乙省']);
    expect(splitFirst('OD', ' ')).toEqual(['OD', null]);
    expect(bracketPrefix('[ZZ]Product')).toEqual({ code: 'ZZ', rest: 'Product' });
    expect(bracketPrefix('Product')).toEqual({ code: null, rest: 'Product' });
    expect(leadingNonDigits('CN-B23050200642')).toBe('CN-B');
  });

  it('萃取不重複的鍵：排序、排除缺值、記下出現的欄位', () => {
    const ctx = createContext(raw, 'x');
    const keys = distinctKeys([
      { sheet: '商機', label: '商機', key: (r) => (r['業務員編'] as string) || null },
      { sheet: '拜訪', label: '拜訪', key: (r) => (r['業務員編'] as string) || null },
    ])(ctx);
    expect(keys.map((k) => k.key)).toEqual(['C001', 'C002', 'TBH']);
    expect(sourcesOf(keys[0])).toEqual(['商機', '拜訪']);
    expect(sourcesOf(keys[2])).toEqual(['拜訪']);
  });

  it('日曆：資料涵蓋的每一年各 12 個月', () => {
    const months = calendarMonths([{ sheet: '拜訪', header: '拜訪日期' }])(createContext(raw, 'x'));
    expect(months).toHaveLength(12);
    expect(months[0].date.toISOString().slice(0, 10)).toBe('2026-01-01');
  });
});

describe('formula', () => {
  const sheets = new Map<string, SheetView>([
    [
      '明細',
      {
        sheet: '明細',
        headers: ['月', '金額', '類別'],
        rows: [
          ['1月', 0.1, 'A'],
          ['1月', 0.2, 'b'],
          ['2月', 5, 'A'],
        ],
      },
    ],
  ]);
  const scope = { headers: ['月', '筆數'], rowNumber: 2, values: ['1月', 2] as Cell[] };
  const run = (expr: Expr) => createEvaluator(sheets).evaluate(expr, scope);

  it('COUNTIFS：同一列的條件寫成 $A2，文字不分大小寫', () => {
    expect(run(countIfs('明細', ['月', sameRow('月')], ['類別', 'B']))).toEqual([
      'COUNTIFS(明細!$A$2:$A$4,$A2,明細!$C$2:$C$4,"B")',
      1,
    ]);
  });

  it('SUMIFS 的結果取 15 位有效數字，和 Excel 一致', () => {
    expect(run(sumIfs('明細', '金額', ['月', sameRow('月')]))).toEqual([
      'SUMIFS(明細!$B$2:$B$4,明細!$A$2:$A$4,$A2)',
      0.3,
    ]);
  });

  it('比率：分母為 0 時是 0', () => {
    expect(run(ratio(ref('筆數'), countIfs('明細', ['類別', '不存在'])))).toEqual([
      'IF(COUNTIFS(明細!$C$2:$C$4,"不存在")=0,0,B2/COUNTIFS(明細!$C$2:$C$4,"不存在"))',
      0,
    ]);
  });

  it('工作表名稱有空白或符號時加單引號', () => {
    expect(sheetName('拜訪紀錄')).toBe('拜訪紀錄');
    expect(sheetName('Sheet 1')).toBe("'Sheet 1'");
  });
});

describe('CRM 設定', () => {
  it('輸出順序與表格名稱', () => {
    expect(output.map((t) => `${t.sheet}:${t.table}`)).toEqual([
      '使用說明:tbl_readme',
      '資料品質檢核:tbl_data_quality',
      '欄位定義:tbl_data_dict',
      '日曆參數:tbl_dim_calendar',
      '客戶主檔:tbl_dim_customer',
      '業務員主檔:tbl_dim_rep',
      '組織主檔:tbl_dim_region',
      '事業部主檔:tbl_dim_bu',
      '廠牌主檔:tbl_dim_brand',
      '產品主檔:tbl_dim_product',
      '拜訪紀錄:tbl_fact_visit',
      '商機:tbl_fact_opportunity',
      '業務員月彙總:tbl_agg_rep_month',
      '月度彙總:tbl_agg_month',
    ]);
  });

  it('客戶主檔：缺值補成未提供、屬性是否完整只看真正的空白、名稱重複', () => {
    const [t1, t2, , t4] = records('客戶主檔');
    expect(t1['客戶分類']).toBe('未提供');
    expect(t1['屬性資料是否完整']).toBe(1);
    expect(t2['屬性資料是否完整']).toBe(0);
    expect(t4['屬性資料是否完整']).toBe(1);
    expect(records('客戶主檔').map((r) => r['客戶名稱是否重複'])).toEqual([1, 0, 1, 0]);
  });

  it('拜訪紀錄：日期展開、欄位更名、旗標、商機編號能否對應', () => {
    const [v1, v2, v3, v4] = records('拜訪紀錄');
    expect(v1['拜訪日期']).toEqual(new Date(Date.UTC(2026, 0, 5)));
    expect([v1['年'], v1['月'], v1['年月'], v1['季別']]).toEqual([2026, 1, '2026-01', 'Q1']);
    expect([v1['事業部'], v1['大區']]).toEqual(['測試事業部', '北區 甲省乙省']);
    expect(v1['涉及商品']).toBe('ProductA X');
    expect([v1['是否商機拜訪'], v1['是否面對面'], v1['商機編號可否對應']]).toEqual([1, 1, 1]);
    expect([v2['商機編號'], v2['商機編號可否對應']]).toEqual(['未提供', -1]);
    expect([v2['事業部是否舊版'], v2['大區是否舊版'], v2['涉及商品是否多品項']]).toEqual([1, 1, 1]);
    expect(v3['商機編號可否對應']).toBe(0);
    expect(v4['涉及商品']).toBe('未提供');
    expect(table('拜訪紀錄').columns.map((c) => c.header)).not.toContain('客戶名稱');
  });

  it('商機：百分比、數字、階段與輸單原因拆解、廠牌前綴', () => {
    const [o1, o2, o3] = records('商機');
    expect([o1['商機編號前綴'], o2['商機編號前綴'], o3['商機編號前綴']]).toEqual([
      'BF',
      'CN-B',
      'M',
    ]);
    expect([o1['成單機率'], o1['報價金額'], o1['欲購買數量']]).toEqual([0.5, 1000.1, 2]);
    expect([o1['階段分類'], o1['是否已結案'], o1['是否贏單']]).toEqual(['贏單', 1, 1]);
    expect([o2['階段分類'], o2['輸單原因大類'], o2['輸單原因細項']]).toEqual([
      '丟單',
      '客户因素',
      '延迟采购',
    ]);
    expect([o3['階段分類'], o3['是否已結案'], o3['階段狀態原始值']]).toEqual([
      '進行中',
      0,
      '未提供',
    ]);
    expect([o1['預算範圍'], o2['預算範圍']]).toEqual(['未填', '0-25万']);
    expect([o1['成交商品'], o1['成交商品廠牌']]).toEqual(['[ZZ]ProductA X', 'ZZ']);
    expect([o2['成交商品'], o2['成交商品廠牌'], o2['贏單但無成交商品']]).toEqual([
      '未提供',
      '未提供',
      0,
    ]);
    expect(o3['成交商品廠牌']).toBe('未提供');
  });

  it('維度表：從事實表萃取、移除舊版字尾、拆解大區', () => {
    const reps = records('業務員主檔');
    expect(
      reps.map((r) => [
        r['業務員編'],
        r['業務姓名'],
        r['是否僅見於舊組織版本'],
        r['是否為未指派代碼'],
      ]),
    ).toEqual([
      ['C001', '業務甲', 0, 0],
      ['C002', '業務乙', 1, 0],
      ['TBH', 'TBH', 0, 1],
    ]);
    expect(
      records('組織主檔').map((r) => [r['大區名稱'], r['涵蓋省份'], r['是否舊組織版本']]),
    ).toEqual([
      ['北區', '甲省乙省', 0],
      ['南區', '未提供', 1],
    ]);
    expect(records('事業部主檔').map((r) => r['事業部名稱'])).toEqual(['測試事業部', '舊事業部']);
    expect(records('廠牌主檔').map((r) => r['廠牌代碼'])).toEqual(['ZZ']);
    const products = Object.fromEntries(records('產品主檔').map((r) => [r['產品原始值'], r]));
    expect(products['ProductA X']['出現於哪些欄位']).toBe('商機欲購買商品 / 拜訪涉及商品');
    expect(products['[ZZ]ProductA X']['產品名稱']).toBe('ProductA X');
    expect(products['ProductA X/ProductB']['是否為多品項字串']).toBe(1);
  });

  it('業務員月彙總：列是事實表裡出現過的年月 × 業務員，指標寫成公式並算出結果', () => {
    const rows = records('業務員月彙總');
    expect(rows.map((r) => `${r['年月']} ${r['業務員編']}`)).toEqual([
      '2026-01 C001',
      '2026-01 C002',
      '2026-02 C001',
      '2026-02 C002',
      '2026-02 TBH',
    ]);
    const first = rows[0];
    expect(formula(first['業務姓名'])).toEqual({
      formula: 'INDEX(業務員主檔!$B$2:$B$4,MATCH($B2,業務員主檔!$A$2:$A$4,0))',
      result: '業務甲',
    });
    expect(formula(first['拜訪筆數'])).toEqual({
      formula: 'COUNTIFS(拜訪紀錄!$E$2:$E$5,$A2,拜訪紀錄!$Q$2:$Q$5,$B2)',
      result: 1,
    });
    expect(formula(first['面對面比率']).formula).toBe('IF(D2=0,0,F2/D2)');
    expect(formula(first['預計結案商機報價金額']).result).toBe(1000.1);
    expect(formula(rows[2]['結案贏單率']).result).toBe(0);
  });

  it('月度彙總：一列對應日曆的一個月，年月連結到日曆參數', () => {
    const rows = records('月度彙總');
    expect(rows).toHaveLength(12);
    expect(formula(rows[0]['年月'])).toEqual({ formula: '日曆參數!A2', result: '2026-01' });
    expect(formula(rows[0]['有拜訪的業務員數'])).toEqual({
      formula: 'SUMPRODUCT((業務員月彙總!$A$2:$A$6=$A2)*(業務員月彙總!$D$2:$D$6>0))',
      result: 2,
    });
    expect(formula(rows[1]['結案贏單率'])).toEqual({
      formula: 'IF(H3+I3=0,0,H3/(H3+I3))',
      result: 0,
    });
    expect(formula(rows[0]['結案贏單率']).result).toBe(1);
  });

  it('資料品質檢核：影響筆數、總筆數、佔比', () => {
    const checks = Object.fromEntries(records('資料品質檢核').map((r) => [r['檢核代碼'], r]));
    const affected = (id: string) => formula(checks[id]['影響筆數']).result;
    expect(affected('DQ01')).toBe(1);
    expect(affected('DQ02')).toBe(3);
    expect(checks['DQ02']['總筆數']).toBe(7);
    expect(affected('DQ12')).toBe(1);
    expect(affected('DQ14')).toBe(1);
    expect(formula(checks['DQ15']['影響筆數'])).toEqual({
      formula:
        'SUMPRODUCT((COUNTIF(拜訪紀錄!$L$2:$L$5,客戶主檔!$A$2:$A$5)=0)*(COUNTIF(商機!$C$2:$C$4,客戶主檔!$A$2:$A$5)=0))',
      result: 2,
    });
    expect(formula(checks['DQ15']['佔比'])).toEqual({
      formula: 'IF(E16=0,0,D16/E16)',
      result: 0.5,
    });
  });

  it('使用說明引用原始資料算出的數字，欄位定義列出每一欄', () => {
    const notes = records('使用說明').map((r) => r['說明']);
    expect(notes[0]).toContain('crm_export_test.xlsx');
    expect(notes.some((n) => String(n).includes('2026-01-05 至 2026-02-10'))).toBe(true);
    const dataColumns = output
      .filter((t) => t.sheet !== '欄位定義')
      .reduce((n, t) => n + t.columns.length, 0);
    expect(table('欄位定義').rows).toHaveLength(dataColumns);
  });
});

// 把模擬的原始資料寫成 xlsx（每張工作表第 1 列是標頭）。
async function xlsxOf(workbook: RawWorkbook): Promise<ArrayBuffer> {
  const out = new ExcelJS.Workbook();
  for (const [sheet, rows] of Object.entries(workbook)) {
    const ws = out.addWorksheet(sheet);
    const headers = Object.keys(rows[0] ?? {});
    ws.addRow(headers);
    for (const row of rows) ws.addRow(headers.map((h) => row[h]));
  }
  const data = await out.xlsx.writeBuffer();
  const bytes = new Uint8Array(data as ArrayBuffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('來源設定', () => {
  it('依工作表名稱辨識來源', () => {
    expect(detectSpec(['客戶', '拜訪', '商機'])?.id).toBe('crm');
    expect(detectSpec(['客戶', '拜訪'])).toBeUndefined();
  });

  it('列出缺少的工作表與欄位', () => {
    const [crm] = SPECS;
    const headers = Object.fromEntries(
      Object.entries(crm.required).map(([sheet, columns]) => [sheet, [...columns]]),
    );
    expect(missingColumns(crm, headers)).toEqual([]);
    headers['拜訪'] = headers['拜訪'].filter((h) => h !== '拜訪日期');
    delete headers['商機'];
    expect(missingColumns(crm, headers)).toEqual(['拜訪：缺少 拜訪日期', '缺少工作表「商機」']);
  });
});

describe('standardizeWorkbook', () => {
  it('讀取 → 轉換 → 寫出，產出檔可以直接用 parseWorkbook 匯入', async () => {
    const stages: string[] = [];
    const result = await standardizeWorkbook(await xlsxOf(raw), 'crm_export_test.xlsx', {
      onStage: (stage) => stages.push(stage),
    });
    expect(stages).toEqual(['read', 'transform', 'write']);
    expect(result.source.id).toBe('crm');
    expect(result.fileName).toBe('crm_export_test_標準化.xlsx');
    expect(result.tables.find((t) => t.sheet === '拜訪紀錄')?.rows).toBe(4);
    expect(result.issues.map((i) => i.id)).toContain('DQ01');
    expect(result.issues.every((i) => i.affected > 0)).toBe(true);

    const parsed = await parseWorkbook(result.buffer);
    expect(parsed.skippedSheets).toEqual([]);
    const keys = parsed.tables.map((t) => t.key);
    expect(keys).toContain('tbl_fact_visit');
    expect(keys).toContain('tbl_agg_rep_month');
    const visits = parsed.rows['tbl_fact_visit'];
    expect(visits[0]['拜訪日期']).toBe('2026-01-05');
    expect(visits[1]['商機編號']).toBe('未提供');
    // 彙總表的公式結果寫進了檔案：不必開 Excel 重算也讀得到。
    expect(parsed.rows['tbl_agg_rep_month'][0]['拜訪筆數']).toBe(1);
  });

  it('辨識不出來源，或缺少必要欄位時，說明原因', async () => {
    await expect(
      standardizeWorkbook(await xlsxOf({ 工作表1: [{ 欄位: 1 }] }), 'x.xlsx'),
    ).rejects.toThrow('無法辨識這份檔案的來源');
    const withoutDate = raw['拜訪'].map((row) => {
      const copy = { ...row };
      delete copy['拜訪日期'];
      return copy;
    });
    const partial = { ...raw, 拜訪: withoutDate };
    await expect(standardizeWorkbook(await xlsxOf(partial), 'x.xlsx')).rejects.toThrow(
      '拜訪：缺少 拜訪日期',
    );
  });
});
