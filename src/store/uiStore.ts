// 不持久化的 UI 狀態：目前畫面、是否在編輯模式、選取中的 widget、全域提示。
//
// 沒有 router（ADR 0001），三個畫面用 view 切換；重新整理後會回到儀表板清單。

import { create } from 'zustand';

export type View = 'dashboards' | 'datasets' | 'dashboard';

// 由 App 統一用 Snackbar 顯示；service 背景寫入失敗時也從這裡通知。
export type Notice = { severity: 'success' | 'warning' | 'error'; message: string };

type UiState = {
  view: View;
  editing: boolean;
  selectedWidgetId: string | null;
  notice: Notice | null;
  navigate: (view: View) => void;
  setEditing: (editing: boolean) => void;
  selectWidget: (widgetId: string | null) => void;
  notify: (notice: Notice | null) => void;
};

export const useUiStore = create<UiState>()((set) => ({
  view: 'dashboards',
  editing: false,
  selectedWidgetId: null,
  notice: null,
  // 換頁時一律離開編輯模式並取消選取，避免帶著舊的選取狀態進到別的儀表板。
  navigate: (view) => set({ view, editing: false, selectedWidgetId: null }),
  setEditing: (editing) => set({ editing, selectedWidgetId: null }),
  selectWidget: (widgetId) => set({ selectedWidgetId: widgetId }),
  notify: (notice) => set({ notice }),
}));
