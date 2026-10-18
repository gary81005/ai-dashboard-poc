// 測試用的活頁簿：public/samples 的範例檔，以及 tests/fixtures 的三份模擬資料（ADR 0010 §8）。
// 解析結果快取起來，同一個檔案在整個測試執行期間只解析一次。

import { readFile } from 'node:fs/promises';
import { parseWorkbook } from '../src/services/parseWorkbook.ts';
import type { ParsedWorkbook } from '../src/services/parseWorkbook.ts';
import type { DataTable, Row } from '../src/types/index.ts';

const FILES = {
  sample: '../public/samples/連鎖門市年度營運績效表_2025_v2_標準化.xlsx',
  performance: './fixtures/崗位業績_模擬資料.xlsx',
  restaurant: './fixtures/連鎖餐飲_2024-2026_多年度營運資料庫_模擬資料.xlsx',
  mlb: './fixtures/MLB_2024-2026_三季球員數據統計表_模擬資料.xlsx',
} as const;

export type WorkbookName = keyof typeof FILES;

const cache = new Map<WorkbookName, Promise<ParsedWorkbook>>();

export function loadWorkbook(name: WorkbookName): Promise<ParsedWorkbook> {
  let parsed = cache.get(name);
  if (!parsed) {
    parsed = readFile(new URL(FILES[name], import.meta.url)).then((buffer) =>
      parseWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
    );
    cache.set(name, parsed);
  }
  return parsed;
}

// 取出一張資料表與它的資料列；找不到就丟錯，讓測試直接失敗。
export async function loadTable(
  name: WorkbookName,
  key: string,
): Promise<{ table: DataTable; rows: Row[] }> {
  const parsed = await loadWorkbook(name);
  const table = parsed.tables.find((t) => t.key === key);
  if (!table) throw new Error(`${name} 沒有資料表 ${key}`);
  return { table, rows: parsed.rows[key] };
}
