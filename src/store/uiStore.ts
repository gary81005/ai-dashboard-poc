// 不持久化的 UI 狀態：是否在編輯模式、選取中的 widget、儀表板篩選選取的值、
// 全域提示、離開前的確認、編輯模式面板的寬度。
//
// 目前在哪個畫面、開著哪個儀表板由網址決定（React Router，ADR 0013），不在這裡。

import { create } from 'zustand';
import { useAppStore } from './appStore.ts';

// 由 App 統一用 Snackbar 顯示；service 背景寫入失敗時也從這裡通知。
export type Notice = { severity: 'success' | 'warning' | 'error'; message: string };

// 儀表板篩選選取的值（欄位標頭 → 值）。只在當次瀏覽有效、不存進設定（ADR 0008），
// 記下所屬的儀表板，換頁時清空。
export type FilterValues = { dashboardId: string; values: Record<string, string[]> };

// 編輯模式右側兩個面板的寬度（px），由欄位之間的拖曳把手調整。只存在記憶體，重新整理後回到預設。
export type PanelWidths = { fields: number; editor: number };
// 被擋下來的離開動作：proceed 繼續離開，cancel 留在原處。換網址時由 useBlocker 提供，
// cancel 會把網址放回原處；登出時由 leave 提供，cancel 不用做任何事。
export type PendingLeave = { proceed: () => void; cancel: () => void };

export const DEFAULT_PANEL_WIDTHS: PanelWidths = { fields: 220, editor: 340 };
// 向右收合的面板：收合後只剩一條窄條，讓儀表板區域變大。同樣只存在記憶體。
export type CollapsedPanels = Record<keyof PanelWidths, boolean>;

type UiState = {
  editing: boolean;
  selectedWidgetId: string | null;
  filterValues: FilterValues | null;
  notice: Notice | null;
  // 資料集頁要自動展開的卡片，讓使用者先看到欄位健檢（ADR 0010 §7 ③）：
  // 剛上傳的資料集，或從編輯模式欄位清單的「到資料集頁處理」過來的資料集。
  expandDatasetId: string | null;
  panelWidths: PanelWidths;
  collapsedPanels: CollapsedPanels;
  // 有未儲存的變更時，被擋下來的離開動作；App 的 UnsavedChangesDialog 決定儲存、捨棄或取消。
  pendingLeave: PendingLeave | null;
  leave: (proceed: () => void) => void;
  setPendingLeave: (pendingLeave: PendingLeave | null) => void;
  resetDashboardUi: () => void;
  setEditing: (editing: boolean) => void;
  selectWidget: (widgetId: string | null) => void;
  setFilterValue: (dashboardId: string, header: string, values: string[]) => void;
  clearFilterValues: () => void;
  notify: (notice: Notice | null) => void;
  setExpandDatasetId: (datasetId: string | null) => void;
  setPanelWidth: (panel: keyof PanelWidths, width: number) => void;
  setPanelCollapsed: (panel: keyof PanelWidths, collapsed: boolean) => void;
};

export const useUiStore = create<UiState>()((set) => ({
  editing: false,
  selectedWidgetId: null,
  filterValues: null,
  notice: null,
  expandDatasetId: null,
  panelWidths: DEFAULT_PANEL_WIDTHS,
  collapsedPanels: { fields: false, editor: false },
  pendingLeave: null,
  // 不是換網址的離開動作（登出）經過這裡：沒有未儲存的變更就直接執行，否則先問使用者。
  // 換網址由儀表板頁的 useBlocker 攔截。
  leave: (proceed) => {
    if (useAppStore.getState().draftBase) set({ pendingLeave: { proceed, cancel: () => {} } });
    else proceed();
  },
  setPendingLeave: (pendingLeave) => set({ pendingLeave }),
  // 換到另一個畫面時由 router.tsx 呼叫：離開編輯模式、取消選取並清空儀表板篩選，
  // 避免帶著舊的狀態進到別的儀表板。
  resetDashboardUi: () => set({ editing: false, selectedWidgetId: null, filterValues: null }),
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
  setPanelWidth: (panel, width) =>
    set((s) => ({ panelWidths: { ...s.panelWidths, [panel]: width } })),
  setPanelCollapsed: (panel, collapsed) =>
    set((s) => ({ collapsedPanels: { ...s.collapsedPanels, [panel]: collapsed } })),
}));
