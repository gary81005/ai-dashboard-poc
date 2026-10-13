// 把上傳的 .xlsx 轉成「資料表中繼資料 + 資料列」（規則見 docs/adr/0002）。
//
// 流程（parseWorkbook）：
//   1. 動態載入 ExcelJS 並讀檔
//   2. readSheet：逐張工作表驗證（合併儲存格、標頭空白／重複、沒有資料列 → 跳過並記錄原因），
//      讀出資料列，同時統計每欄的值型別
//   3. readDictionary：若有「欄位定義」工作表，取出欄位代碼、型別、單位
//   4. buildField：決定每個欄位的 dataType、role（維度／量值）、ratio（規則在 utils/inference.ts），
//      以及加權比率的分子分母（ratioOf，從公式認出來，ADR 0008）

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { Cell, Worksheet } from 'exceljs';
import { DICTIONARY_TYPES, inferRatio, inferRole } from '../utils/inference.ts';
import type {
  CellValue,
  DataTable,
  DataType,
  DatasetRows,
  Field,
  RatioOf,
  Row,
  SkippedSheet,
} from '../types/index.ts';

dayjs.extend(utc);

export type ParsedWorkbook = {
  tables: DataTable[];
  rows: DatasetRows;
  skippedSheets: SkippedSheet[];
};

const README_SHEET = '使用說明';
const DICTIONARY_HEADERS = ['工作表', '中文欄名', '欄位代碼', '資料型別'];

type Primitive = string | number | boolean | Date | null;

// 公式「分子/分母」指到的兩欄，以資料表內的欄位順序（從 0 起算）表示。
type RatioColumns = { numerator: number; denominator: number };

// 讀取資料列時順便統計每欄各種值的數量，供沒有欄位定義時推斷型別。
// ratio：這一欄的公式都是同一組「分子/分母」時記下來；undefined = 沒有公式，null = 公式不一致。
type ColumnStats = {
  dates: number;
  numbers: number;
  integers: number;
  others: number;
  numFmt?: string;
  values: CellValue[];
  ratio?: RatioColumns | null;
};

// 通過驗證、還沒套用欄位定義的資料表。
type PendingTable = {
  key: string;
  sheetName: string;
  hidden: boolean;
  headers: string[];
  rows: Row[];
  stats: ColumnStats[];
};

type DictionaryEntry = { code?: string; dataType?: DataType; unit?: string };

type Range = { top: number; left: number; bottom: number; right: number };

// ExcelJS 壓縮後約 930KB，只在真的要解析檔案時才下載（動態 import 會被切成獨立的 chunk）。
async function loadExcelJS() {
  const mod = await import('exceljs');
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
}

// 把 ExcelJS 的各種儲存格值攤平成單純的值：公式取快取的計算結果 result、
// 富文字合併成字串、超連結取顯示文字；錯誤值和沒有快取結果的公式視為空白。
function unwrap(value: unknown): Primitive {
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
    if ('result' in value) return unwrap(value.result);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: string }) => part.text ?? '').join('');
    }
    if ('text' in value) return String(value.text);
  }
  return null;
}

// 資料儲存格的值；公式取快取的計算結果。不能用 cell.value 再取 result：
// ExcelJS 的 cell.value 只複製 truthy 的屬性，結果是 0 的公式會被當成沒有結果（空白），cell.result 才保留 0。
function cellValue(cell: Cell): Primitive {
  return unwrap(cell.formula ? cell.result : cell.value);
}

// 轉成要存進資料庫的值：日期以 UTC 格式化成字串（避免時區偏移一天，ADR 0002），字串去頭尾空白。
function toCellValue(value: Primitive): CellValue {
  if (value instanceof Date) {
    const date = dayjs.utc(value);
    return date.format(date.hour() || date.minute() ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD');
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

// Excel 欄位字母與數字互轉（A=1、Z=26、AA=27），用來解析表格範圍和組錯誤訊息。
function columnIndex(letters: string): number {
  return [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function columnLetters(index: number): string {
  let letters = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

const REF = String.raw`\$?([A-Z]{1,3})\$?(\d+)`;
const DIVIDE = new RegExp(String.raw`^${REF}\s*/\s*${REF}$`, 'i');
const GUARDED_DIVIDE = new RegExp(
  String.raw`^IF\(\s*${REF}\s*=\s*0\s*,\s*(?:0|"")\s*,\s*${REF}\s*/\s*${REF}\s*\)$`,
  'i',
);

// 認出「分子/分母」與「IF(分母=0, 0 或 "", 分子/分母)」兩種寫法，而且都指向同一列的儲存格。
// 回傳兩欄在資料表內的位置；其他公式（跨工作表、SUM、差額等）不處理。
function ratioColumns(formula: string, row: number, left: number): RatioColumns | undefined {
  const text = formula.replace(/^=/, '').trim();
  let refs: Array<[string, string]>;
  const guarded = GUARDED_DIVIDE.exec(text);
  const plain = guarded ? null : DIVIDE.exec(text);
  if (guarded) {
    const [, guardCol, guardRow, numCol, numRow, denCol, denRow] = guarded;
    if (guardCol.toUpperCase() !== denCol.toUpperCase() || guardRow !== denRow) return undefined;
    refs = [
      [numCol, numRow],
      [denCol, denRow],
    ];
  } else if (plain) {
    refs = [
      [plain[1], plain[2]],
      [plain[3], plain[4]],
    ];
  } else {
    return undefined;
  }
  if (refs.some(([, r]) => Number(r) !== row)) return undefined;
  return {
    numerator: columnIndex(refs[0][0]) - left,
    denominator: columnIndex(refs[1][0]) - left,
  };
}

// 同一欄的每個公式都要指向同一組分子分母，否則視為不一致（null），不做加權。
function mergeRatio(
  current: RatioColumns | null | undefined,
  found: RatioColumns | undefined,
): RatioColumns | null {
  if (!found) return null;
  if (current === undefined) return found;
  if (current === null) return null;
  return current.numerator === found.numerator && current.denominator === found.denominator
    ? current
    : null;
}

// 解析 'A1:T97' 這種範圍字串。
function parseRange(ref: string): Range | undefined {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(ref);
  if (!match) return undefined;
  return {
    left: columnIndex(match[1]),
    top: Number(match[2]),
    right: columnIndex(match[3]),
    bottom: Number(match[4]),
  };
}

// 讀取工作表上的 Excel 表格物件（tbl_ 名稱與範圍）。
// 注意：getTables() 實際回傳的是 { table } 包裝，和 ExcelJS 自己的型別定義不同。
function readTableObject(ws: Worksheet): { name: string; range: Range } | undefined {
  const entries = ws.getTables() as unknown as Array<{
    table?: { name?: string; tableRef?: string; ref?: string };
  }>;
  const table = entries[0]?.table;
  const ref = table?.tableRef ?? table?.ref;
  const range = ref ? parseRange(ref) : undefined;
  return table?.name && range ? { name: table.name, range } : undefined;
}

// 沒有表格物件時的退路：以第 1 列為標頭，範圍到最後一個非空白標頭為止。
function sheetRange(ws: Worksheet): Range {
  const header = ws.getRow(1);
  let right = 0;
  for (let c = 1; c <= ws.columnCount; c += 1) {
    if (toCellValue(unwrap(header.getCell(c).value)) !== null) right = c;
  }
  return { top: 1, left: 1, bottom: ws.rowCount, right };
}

// 驗證並讀取一張工作表。回傳 PendingTable 代表成功；回傳 { sheetName, reason } 代表跳過。
function readSheet(ws: Worksheet): PendingTable | SkippedSheet {
  const sheetName = ws.name;
  if (ws.model.merges && ws.model.merges.length > 0) {
    return { sheetName, reason: '含有合併儲存格' };
  }

  const tableObject = readTableObject(ws);
  const range = tableObject?.range ?? sheetRange(ws);
  if (range.right < range.left) return { sheetName, reason: '第 1 列沒有標頭' };

  const headerRow = ws.getRow(range.top);
  const headers: string[] = [];
  for (let c = range.left; c <= range.right; c += 1) {
    const header = toCellValue(unwrap(headerRow.getCell(c).value));
    if (header === null || header === '') {
      return { sheetName, reason: `${columnLetters(c)} 欄的標頭空白` };
    }
    const text = String(header);
    if (headers.includes(text)) return { sheetName, reason: `標頭「${text}」重複` };
    headers.push(text);
  }

  const stats: ColumnStats[] = headers.map(() => ({
    dates: 0,
    numbers: 0,
    integers: 0,
    others: 0,
    values: [],
  }));
  const rows: Row[] = [];
  for (let r = range.top + 1; r <= range.bottom; r += 1) {
    const excelRow = ws.getRow(r);
    const row: Row = {};
    let empty = true;
    headers.forEach((header, i) => {
      const cell = excelRow.getCell(range.left + i);
      const raw = cellValue(cell);
      const value = toCellValue(raw);
      row[header] = value;
      const stat = stats[i];
      // 分母為 0 時公式結果是空白，但公式本身仍要檢查。
      if (cell.formula)
        stat.ratio = mergeRatio(stat.ratio, ratioColumns(cell.formula, r, range.left));
      if (value === null || value === '') return;
      empty = false;
      stat.values.push(value);
      if (raw instanceof Date) stat.dates += 1;
      else if (typeof raw === 'number') {
        stat.numbers += 1;
        if (Number.isInteger(raw)) stat.integers += 1;
      } else stat.others += 1;
      if (stat.numFmt === undefined && cell.numFmt && cell.numFmt !== 'General') {
        stat.numFmt = cell.numFmt;
      }
    });
    if (!empty) rows.push(row);
  }
  if (rows.length === 0) return { sheetName, reason: '沒有資料列' };

  const isDictionary = DICTIONARY_HEADERS.every((h) => headers.includes(h));
  return {
    key: tableObject?.name ?? sheetName,
    sheetName,
    hidden: isDictionary || sheetName === README_SHEET || ws.state !== 'visible',
    headers,
    rows,
    stats,
  };
}

function dictionaryKey(sheetName: string, header: string): string {
  return `${sheetName}\u0000${header}`;
}

// 找出「欄位定義」工作表（以標頭組合辨識，不看名稱），
// 建立「工作表名稱 + 中文欄名 → 代碼／型別／單位」的對照表。
function readDictionary(tables: readonly PendingTable[]): Map<string, DictionaryEntry> {
  const entries = new Map<string, DictionaryEntry>();
  const dictionary = tables.find((t) => DICTIONARY_HEADERS.every((h) => t.headers.includes(h)));
  if (!dictionary) return entries;
  for (const row of dictionary.rows) {
    const sheetName = row['工作表'];
    const header = row['中文欄名'];
    if (typeof sheetName !== 'string' || typeof header !== 'string') continue;
    const code = row['欄位代碼'];
    const type = row['資料型別'];
    const unit = row['單位'];
    entries.set(dictionaryKey(sheetName, header), {
      code: typeof code === 'string' && code ? code : undefined,
      dataType: typeof type === 'string' ? DICTIONARY_TYPES[type] : undefined,
      unit: typeof unit === 'string' && unit ? unit : undefined,
    });
  }
  return entries;
}

// 沒有欄位定義時，從實際的值推斷型別：
// 全是日期 → date；全是數字 → percent／integer／number；其他 → text。
function inferDataType(stat: ColumnStats): DataType {
  if (stat.dates > 0 && stat.numbers === 0 && stat.others === 0) return 'date';
  if (stat.numbers > 0 && stat.dates === 0 && stat.others === 0) {
    if (stat.numFmt?.includes('%')) return 'percent';
    return stat.integers === stat.numbers ? 'integer' : 'number';
  }
  return 'text';
}

// 公式指到的分子分母欄位，必須在同一張資料表內、不是自己，而且兩欄都是數值欄位。
function ratioOf(
  index: number,
  ratio: RatioColumns | null | undefined,
  headers: readonly string[],
  stats: readonly ColumnStats[],
): RatioOf | undefined {
  if (!ratio) return undefined;
  const { numerator, denominator } = ratio;
  const valid = [numerator, denominator].every(
    (i) => i >= 0 && i < headers.length && i !== index && stats[i].others === 0,
  );
  return valid ? { numerator: headers[numerator], denominator: headers[denominator] } : undefined;
}

// 組出最終的欄位中繼資料：欄位定義優先，其次推斷；角色與比率規則見 utils/inference.ts。
// 認得出分子分母的公式欄位一定是比率（ADR 0008），即使格式不是百分比（例如「個/台」）。
function buildField(table: PendingTable, index: number, entry: DictionaryEntry | undefined): Field {
  const header = table.headers[index];
  const stat = table.stats[index];
  const dataType = entry?.dataType ?? inferDataType(stat);
  const role = inferRole(header, dataType, stat.values);
  const weighted =
    role === 'measure' ? ratioOf(index, stat.ratio, table.headers, table.stats) : undefined;
  const ratio = weighted !== undefined || (role === 'measure' && inferRatio(dataType, stat.numFmt));
  return {
    header,
    ...(entry?.code ? { code: entry.code } : {}),
    dataType,
    ...(entry?.unit ? { unit: entry.unit } : {}),
    ...(stat.numFmt ? { numFmt: stat.numFmt } : {}),
    role,
    ...(ratio ? { ratio: true } : {}),
    ...(weighted ? { ratioOf: weighted } : {}),
  };
}

// 對外的唯一入口，由 services/datasetService.ts 呼叫。
// 欄位定義要等所有工作表讀完才套用，因為它可能排在活頁簿的任何位置。
export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const pending: PendingTable[] = [];
  const skippedSheets: SkippedSheet[] = [];
  for (const ws of workbook.worksheets) {
    const result = readSheet(ws);
    if ('reason' in result) skippedSheets.push(result);
    else pending.push(result);
  }

  const dictionary = readDictionary(pending);
  const rows: DatasetRows = {};
  const tables = pending.map((t): DataTable => {
    rows[t.key] = t.rows;
    return {
      key: t.key,
      sheetName: t.sheetName,
      hidden: t.hidden,
      rowCount: t.rows.length,
      fields: t.headers.map((header, i) =>
        buildField(t, i, dictionary.get(dictionaryKey(t.sheetName, header))),
      ),
    };
  });
  return { tables, rows, skippedSheets };
}
