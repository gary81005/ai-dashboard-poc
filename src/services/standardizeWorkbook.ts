// 資料標準化（引擎見 utils/standardize/）：讀取系統匯出的原始活頁簿 → 依來源設定轉換 → 寫成標準化活頁簿。
// 資料集頁的「資料標準化」與 npm run standardize（scripts/standardize/cli.ts）共用，輸入輸出都是 ArrayBuffer。
//
// 讀取用 ExcelJS 的完整讀取器。串流讀取器（WorkbookReader）在資料切塊時會把多位元組的中文字切斷，
// 讀出「��」亂碼，不能用。另外 worksheet.columnCount 每次存取都會掃過整張表，
// 不能放在迴圈條件裡，否則幾萬列的檔案會慢到幾十分鐘。
//
// 轉換在主執行緒進行，幾萬列的檔案約需數秒；每個階段之間讓出一次，讓畫面更新進度文字。

import type { CellValue, Workbook, Worksheet } from 'exceljs';
import { NUMBER_FORMATS, standardize } from '../utils/standardize/engine.ts';
import { plain } from '../utils/standardize/formula.ts';
import { detectSpec, missingColumns, specById, SPECS } from '../utils/standardize/specs/index.ts';
import type { SpecEntry } from '../utils/standardize/specs/index.ts';
import type {
  Cell,
  OutputTable,
  RawRow,
  RawValue,
  RawWorkbook,
} from '../utils/standardize/types.ts';

// ExcelJS 壓縮後約 930KB，只在真的要用時才下載（動態 import 會被切成獨立的 chunk）。
async function loadExcelJS() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
}

// ── 讀取 ─────────────────────────────────────────────────────────────

function rawValue(value: unknown): RawValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === 'object') {
    if ('result' in value) return rawValue(value.result);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: string }) => part.text ?? '').join('');
    }
    if ('text' in value) return String(value.text);
  }
  return null;
}

type RawSheets = { raw: RawWorkbook; headers: Record<string, string[]> };

function readSheet(ws: Worksheet): { headers: string[]; rows: RawRow[] } {
  const columns = ws.columnCount;
  const header = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= columns; c++)
    headers.push(String(rawValue(header.getCell(c).value) ?? '').trim());
  const rows: RawRow[] = [];
  ws.eachRow((row, number) => {
    if (number === 1) return;
    const out: RawRow = {};
    headers.forEach((h, i) => {
      if (h === '') return;
      // 公式取 cell.result：cell.value 只複製 truthy 的屬性，結果是 0 的公式會變成空白。
      const cell = row.getCell(i + 1);
      out[h] = rawValue(cell.formula ? cell.result : cell.value);
    });
    rows.push(out);
  });
  return { headers: headers.filter((h) => h !== ''), rows };
}

export async function readRawWorkbook(buffer: ArrayBuffer): Promise<RawSheets> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.map((ws) => [ws.name, readSheet(ws)] as const);
  return {
    raw: Object.fromEntries(sheets.map(([name, s]) => [name, s.rows])),
    headers: Object.fromEntries(sheets.map(([name, s]) => [name, s.headers])),
  };
}

// ── 寫出 ─────────────────────────────────────────────────────────────

const HEADER_FILL = 'FF2F4858';
// 字色與使用說明的顏色規則一致：資料值藍字、同表公式黑字、跨工作表連結綠字。
const FONT_COLORS = { value: 'FF0000FF', formula: 'FF000000', link: 'FF008000' } as const;

function excelValue(cell: Cell): CellValue {
  if (cell !== null && typeof cell === 'object' && 'formula' in cell) {
    return cell.result === null
      ? { formula: cell.formula }
      : { formula: cell.formula, result: cell.result };
  }
  return cell;
}

function addTable(workbook: Workbook, table: OutputTable): void {
  const ws = workbook.addWorksheet(table.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addTable({
    name: table.table,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleLight9', showRowStripes: true },
    columns: table.columns.map((c) => ({ name: c.header, filterButton: true })),
    // 沒有資料列時 ExcelJS 無法建立表格物件，補一列空白。
    rows:
      table.rows.length > 0
        ? table.rows.map((row) => row.map(excelValue))
        : [table.columns.map(() => null)],
  });
  const header = ws.getRow(1);
  table.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    column.width = c.width ?? Math.max(10, [...c.header].length * 2 + 4);
    const format = NUMBER_FORMATS[c.type];
    if (format) column.numFmt = format;
    column.font = { color: { argb: FONT_COLORS[c.style ?? 'value'] } };
    const cell = header.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

export async function writeStandardWorkbook(tables: readonly OutputTable[]): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  for (const table of tables) addTable(workbook, table);
  const data = await workbook.xlsx.writeBuffer();
  // Node 回傳 Buffer、瀏覽器回傳 ArrayBuffer，統一成剛好大小的 ArrayBuffer。
  const bytes = new Uint8Array(data as ArrayBuffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ── 整個流程 ─────────────────────────────────────────────────────────

export type StandardizeStage = 'read' | 'transform' | 'write';

export type QualityIssue = {
  id: string;
  severity: string;
  name: string;
  affected: number;
  base: number;
};

export type StandardizeResult = {
  source: SpecEntry;
  fileName: string;
  buffer: ArrayBuffer;
  tables: Array<{ sheet: string; rows: number }>;
  // 資料品質檢核裡影響筆數大於 0 的項目，依設定的順序（嚴重度高的在前）。
  issues: QualityIssue[];
};

// 讓出主執行緒一次，讓畫面有機會更新進度文字。
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function issuesOf(tables: readonly OutputTable[]): QualityIssue[] {
  const checks = tables.find((t) => t.table === 'tbl_data_quality');
  if (!checks) return [];
  return checks.rows
    .map((row) => ({
      id: String(row[0]),
      severity: String(row[1]),
      name: String(row[2]),
      affected: Number(plain(row[3]) ?? 0),
      base: Number(plain(row[4]) ?? 0),
    }))
    .filter((issue) => issue.affected > 0);
}

export function standardizedName(fileName: string): string {
  return `${fileName.replace(/\.xlsx$/i, '')}_標準化.xlsx`;
}

// specId 沒給時依工作表名稱自動辨識來源；辨識不出來、或缺少必要欄位時丟出說明原因的錯誤。
export async function standardizeWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  options: { specId?: string; onStage?: (stage: StandardizeStage) => void } = {},
): Promise<StandardizeResult> {
  options.onStage?.('read');
  await yieldToBrowser();
  const { raw, headers } = await readRawWorkbook(buffer);

  const source = options.specId ? specById(options.specId) : detectSpec(Object.keys(raw));
  if (!source) {
    const supported = SPECS.map((s) => `${s.label}`).join('、');
    throw new Error(`無法辨識這份檔案的來源。目前支援：${supported}`);
  }
  const missing = missingColumns(source, headers);
  if (missing.length > 0) throw new Error(`原始檔的欄位不齊全：${missing.join('；')}`);

  options.onStage?.('transform');
  await yieldToBrowser();
  const tables = standardize(source.spec, raw, fileName);

  options.onStage?.('write');
  await yieldToBrowser();
  return {
    source,
    fileName: standardizedName(fileName),
    buffer: await writeStandardWorkbook(tables),
    tables: tables.map((t) => ({ sheet: t.sheet, rows: t.rows.length })),
    issues: issuesOf(tables),
  };
}
