// 資料列的記憶體快取（不持久化）。從 Supabase 分頁讀取很慢，快取後切換頁面不必重讀。
//
// 上傳時由 services/datasetService.ts 直接 put；開啟儀表板時由 hooks/useDatasetRows.ts 觸發 load；
// 登出時 clear。

import { create } from 'zustand';
import type { Dataset, DatasetRows } from '../types/index.ts';
import { loadDatasetRows } from '../services/datasetRows.ts';
import { sessionGuard } from '../services/session.ts';

export type RowsEntry =
  | { status: 'loading' }
  | { status: 'ready'; rows: DatasetRows }
  | { status: 'error'; message: string };

type RowsState = {
  byDataset: Record<string, RowsEntry>;
  put: (datasetId: string, rows: DatasetRows) => void;
  drop: (datasetId: string) => void;
  clear: () => void;
  load: (dataset: Dataset) => Promise<void>;
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
  clear: () => set({ byDataset: {} }),
  // 已經在快取中（或正在載入）就不重複讀取；上次讀取失敗的可以重讀。
  // 讀取期間登出或換了帳號，結果直接丟掉，不寫回剛清空的快取。
  load: async (dataset) => {
    const existing = get().byDataset[dataset.id];
    if (existing && existing.status !== 'error') return;
    const isCurrent = sessionGuard();
    const setEntry = (entry: RowsEntry) =>
      set((s) => ({ byDataset: { ...s.byDataset, [dataset.id]: entry } }));
    setEntry({ status: 'loading' });
    try {
      const rows = await loadDatasetRows(dataset);
      if (isCurrent()) setEntry({ status: 'ready', rows });
    } catch (error) {
      if (!isCurrent()) return;
      setEntry({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));
