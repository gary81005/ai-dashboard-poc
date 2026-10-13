import { useEffect } from 'react';
import { useRowsStore } from '../store/rowsStore.ts';
import type { RowsEntry } from '../store/rowsStore.ts';
import type { Dataset } from '../types/index.ts';

// 取得某個資料集的資料列：第一次使用時從 Supabase 分頁載入，之後直接讀 rowsStore 的記憶體快取。
// 回傳的 status 讓頁面分別處理 loading／ready／error。
export function useDatasetRows(dataset: Dataset): RowsEntry {
  const entry = useRowsStore((s) => s.byDataset[dataset.id]);
  const load = useRowsStore((s) => s.load);
  useEffect(() => {
    void load(dataset);
  }, [dataset, load]);
  return entry ?? { status: 'loading' };
}
