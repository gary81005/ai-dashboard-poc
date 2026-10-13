// 資料列的存取層：dataset_rows 表，一個 Excel 列一筆（ADR 0007）。
//
// 寫入分批進行並回報進度；讀取時分頁撈完，因為 PostgREST 一次最多只回傳 1000 列。

import type { Dataset, DatasetRows, Row } from '../types/index.ts';
import { supabase } from './supabase.ts';

const BATCH_SIZE = 1000;
// 必須 ≤ Supabase 專案的 Max Rows 設定（預設 1000），否則每頁實際拿到的列數會少於預期。
const PAGE_SIZE = 1000;

export type Progress = (done: number, total: number) => void;

// 依序寫入所有資料表的資料列。任何一批失敗就丟錯，由呼叫端刪掉整個資料集。
export async function insertDatasetRows(
  datasetId: string,
  rows: DatasetRows,
  onProgress?: Progress,
): Promise<void> {
  const records = Object.entries(rows).flatMap(([tableKey, tableRows]) =>
    tableRows.map((data, rowIndex) => ({
      dataset_id: datasetId,
      table_key: tableKey,
      row_index: rowIndex,
      data,
    })),
  );
  onProgress?.(0, records.length);
  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const { error } = await supabase
      .from('dataset_rows')
      .insert(records.slice(start, start + BATCH_SIZE));
    if (error) throw new Error(`寫入資料列失敗：${error.message}`);
    onProgress?.(Math.min(start + BATCH_SIZE, records.length), records.length);
  }
}

// 讀回整個資料集的資料列。每張資料表都會有一個 key，沒有資料列的表是空陣列。
export async function loadDatasetRows(dataset: Dataset): Promise<DatasetRows> {
  const result: DatasetRows = Object.fromEntries(dataset.tables.map((t) => [t.key, []]));
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('dataset_rows')
      .select('table_key, data')
      .eq('dataset_id', dataset.id)
      .order('table_key')
      .order('row_index')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`讀取資料列失敗：${error.message}`);
    for (const record of data) {
      (result[record.table_key] ??= []).push(record.data as Row);
    }
    if (data.length < PAGE_SIZE) return result;
  }
}
