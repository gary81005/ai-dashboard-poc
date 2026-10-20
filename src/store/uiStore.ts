// 不持久化的 UI 狀態：目前畫面、是否在編輯模式、選取中的 widget、儀表板篩選選取的值、
// 全域提示、離開前的確認。
//
// 沒有 router（ADR 0001），三個畫面用 view 切換；重新整理後會回到儀表板清單。

import { create } from 'zustand';
import { useAppStore } from './appStore.ts';

export type View = 'dashboards' | 'datasets' | 'dashboard';

// 由 App 統一用 Snackbar 顯示；service 背景寫入失敗時也從這裡通知。
export type Notice = { severity: 'success' | 'warning' | 'error'; message: string };

// 儀表板篩選選取的值（欄位標頭 → 值）。只在當次瀏覽有效、不存進設定（ADR 0008），
// 記下所屬的儀表板，換頁時清空。
export type FilterValues = { dashboardId: string; values: Record<string, string[]> };

type UiState = {
  view: View;
  editing: boolean;
  selectedWidgetId: string | null;
  filterValues: FilterValues | null;
  notice: Notice | null;
  // 資料集頁要自動展開的卡片，讓使用者先看到欄位健檢（ADR 0010 §7 ③）：
  // 剛上傳的資料集，或從編輯模式欄位清單的「到資料集頁處理」過來的資料集。
  expandDatasetId: string | null;
  // 有未儲存的變更時，被擋下來的離開動作；App 的 UnsavedChangesDialog 決定儲存、捨棄或取消。
  pendingLeave: (() => void) | null;
  navigate: (view: View) => void;
  leave: (proceed: () => void) => void;
  setPendingLeave: (proceed: (() => void) | null) => void;
  setEditing: (editing: boolean) => void;
  selectWidget: (widgetId: string | null) => void;
  setFilterValue: (dashboardId: string, header: string, values: string[]) => void;
  clearFilterValues: () => void;
  notify: (notice: Notice | null) => void;
  setExpandDatasetId: (datasetId: string | null) => void;
};

export const useUiStore = create<UiState>()((set, get) => ({
  view: 'dashboards',
  editing: false,
  selectedWidgetId: null,
  filterValues: null,
  notice: null,
  expandDatasetId: null,
  pendingLeave: null,
  // 換頁時一律離開編輯模式、取消選取並清空儀表板篩選，避免帶著舊的狀態進到別的儀表板。
  navigate: (view) =>
    get().leave(() => set({ view, editing: false, selectedWidgetId: null, filterValues: null })),
  // 離開目前儀表板的動作（換頁、登出）都經過這裡：沒有未儲存的變更就直接執行，否則先問使用者。
  leave: (proceed) => {
    if (useAppStore.getState().draftBase) set({ pendingLeave: proceed });
    else proceed();
  },
  setPendingLeave: (pendingLeave) => set({ pendingLeave }),
  setEditing: (editing) => set({ editing, selectedWidgetId: null }),
  selectWidget: (widgetId) => set({ selectedWidgetId: widgetId }),
  setFilterValue: (dashboardId, header, values) =>
    set((s) => {
      const current = s.filterValues?.dashboardId === dashboardId ? s.filterValues.values : {};
      const next = { ...current };
      if (values.length > 0) next[header] = values;
      else delete next[header];
      return { filterValues: { dashboardId, values: next } };
    }),
  clearFilterValues: () => set({ filterValues: null }),
  notify: (notice) => set({ notice }),
  setExpandDatasetId: (expandDatasetId) => set({ expandDatasetId }),
}));
