import { useEffect } from 'react';
import { useRowsStore } from '../store/rowsStore.ts';
import type { RowsEntry } from '../store/rowsStore.ts';

// 取得某個資料集的資料列：第一次使用時從 IndexedDB 載入，之後直接讀 rowsStore 的記憶體快取。
// 回傳的 status 讓頁面分別處理 loading／ready／missing（IndexedDB 找不到）／error。
export function useDatasetRows(datasetId: string): RowsEntry {
  const entry = useRowsStore((s) => s.byDataset[datasetId]);
  const load = useRowsStore((s) => s.load);
  useEffect(() => {
    void load(datasetId);
  }, [datasetId, load]);
  return entry ?? { status: 'loading' };
}
