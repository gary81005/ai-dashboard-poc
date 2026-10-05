// 資料列的記憶體快取（不持久化）。IndexedDB 讀取是非同步的，快取後切換頁面不必重讀。
//
// 上傳時由 services/datasetService.ts 直接 put；開啟儀表板時由 hooks/useDatasetRows.ts 觸發 load。

import { create } from 'zustand';
import type { DatasetRows } from '../types/index.ts';
import { loadDatasetRows } from '../services/datasetRows.ts';

export type RowsEntry =
  | { status: 'loading' }
  | { status: 'ready'; rows: DatasetRows }
  | { status: 'missing' }
  | { status: 'error'; message: string };

type RowsState = {
  byDataset: Record<string, RowsEntry>;
  put: (datasetId: string, rows: DatasetRows) => void;
  drop: (datasetId: string) => void;
  load: (datasetId: string) => Promise<void>;
};

export const useRowsStore = create<RowsState>()((set, get) => ({
  byDataset: {},
  put: (datasetId, rows) =>
    set((s) => ({ byDataset: { ...s.byDataset, [datasetId]: { status: 'ready', rows } } })),
  drop: (datasetId) =>
    set((s) => {
      const rest = { ...s.byDataset };
      delete rest[datasetId];
      return { byDataset: rest };
    }),
  // 已經在快取中（或正在載入）就不重複讀取。
  load: async (datasetId) => {
    if (get().byDataset[datasetId]) return;
    const setEntry = (entry: RowsEntry) =>
      set((s) => ({ byDataset: { ...s.byDataset, [datasetId]: entry } }));
    setEntry({ status: 'loading' });
    try {
      const rows = await loadDatasetRows(datasetId);
      setEntry(rows ? { status: 'ready', rows } : { status: 'missing' });
    } catch (error) {
      setEntry({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));
