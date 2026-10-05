// 整份持久化設定的 store：資料集中繼資料 + 儀表板，寫進 localStorage 的單一 key（ADR 0001、0005）。
//
// 由 Zustand persist 自動讀寫；partialize 只挑出 PersistedState，action 函式不會被存進去。
// 所有更新都是不可變更新（回傳新物件），React 才能正確偵測變化。
// 資料列不在這裡，而是在 IndexedDB（services/datasetRows.ts）。

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Dashboard,
  Dataset,
  DataTable,
  Field,
  LayoutItem,
  PersistedState,
  Role,
  Widget,
} from '../types/index.ts';
import { SCHEMA_VERSION } from '../types/index.ts';

export const STORAGE_KEY = 'ai-dashboard-poc';

type FieldPatch = { role?: Role; ratio?: boolean };

type AppState = PersistedState & {
  addDataset: (dataset: Dataset) => void;
  removeDataset: (datasetId: string) => void;
  renameDataset: (datasetId: string, name: string) => void;
  replaceDataset: (dataset: Dataset) => void;
  setTableHidden: (datasetId: string, tableKey: string, hidden: boolean) => void;
  updateField: (datasetId: string, tableKey: string, header: string, patch: FieldPatch) => void;
  addDashboard: (dashboard: Dashboard) => void;
  removeDashboard: (dashboardId: string) => void;
  renameDashboard: (dashboardId: string, name: string) => void;
  replaceDashboard: (dashboard: Dashboard) => void;
  setActiveDashboard: (dashboardId: string | null) => void;
  updateLayout: (dashboardId: string, layout: LayoutItem[]) => void;
  addWidget: (dashboardId: string, widget: Widget, layoutItem: LayoutItem) => void;
  updateWidget: (dashboardId: string, widget: Widget) => void;
  removeWidget: (dashboardId: string, widgetId: string) => void;
};

// 手動切換欄位角色／比率時記下 userOverride，切換資料來源時才知道要沿用（ADR 0003 決策 5）。
// 改成維度時一併拿掉比率標記，因為維度不會被彙總。
function patchField(field: Field, patch: FieldPatch): Field {
  const overrides = new Set(field.userOverride);
  const next: Field = { ...field };
  if (patch.role !== undefined) {
    next.role = patch.role;
    overrides.add('role');
    if (patch.role === 'dimension') delete next.ratio;
  }
  if (patch.ratio !== undefined) {
    if (patch.ratio) next.ratio = true;
    else delete next.ratio;
    overrides.add('ratio');
  }
  next.userOverride = [...overrides];
  return next;
}

// 只替換指定資料集裡的指定資料表，其餘維持原物件。
function mapTable(
  datasets: Dataset[],
  datasetId: string,
  tableKey: string,
  update: (table: DataTable) => DataTable,
): Dataset[] {
  return datasets.map((d) =>
    d.id !== datasetId
      ? d
      : { ...d, tables: d.tables.map((t) => (t.key === tableKey ? update(t) : t)) },
  );
}

// 只替換指定的儀表板；每次修改都更新 updatedAt（儀表板清單會顯示）。
function mapDashboard(
  dashboards: Dashboard[],
  dashboardId: string,
  update: (dashboard: Dashboard) => Partial<Dashboard>,
): Dashboard[] {
  return dashboards.map((d) =>
    d.id === dashboardId ? { ...d, ...update(d), updatedAt: new Date().toISOString() } : d,
  );
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      datasets: [],
      dashboards: [],
      activeDashboardId: null,

      addDataset: (dataset) => set((s) => ({ datasets: [...s.datasets, dataset] })),
      removeDataset: (datasetId) =>
        set((s) => ({ datasets: s.datasets.filter((d) => d.id !== datasetId) })),
      renameDataset: (datasetId, name) =>
        set((s) => ({
          datasets: s.datasets.map((d) => (d.id === datasetId ? { ...d, name } : d)),
        })),
      replaceDataset: (dataset) =>
        set((s) => ({ datasets: s.datasets.map((d) => (d.id === dataset.id ? dataset : d)) })),
      setTableHidden: (datasetId, tableKey, hidden) =>
        set((s) => ({
          datasets: mapTable(s.datasets, datasetId, tableKey, (t) => ({ ...t, hidden })),
        })),
      updateField: (datasetId, tableKey, header, patch) =>
        set((s) => ({
          datasets: mapTable(s.datasets, datasetId, tableKey, (t) => ({
            ...t,
            fields: t.fields.map((f) => (f.header === header ? patchField(f, patch) : f)),
          })),
        })),

      addDashboard: (dashboard) => set((s) => ({ dashboards: [...s.dashboards, dashboard] })),
      removeDashboard: (dashboardId) =>
        set((s) => ({
          dashboards: s.dashboards.filter((d) => d.id !== dashboardId),
          activeDashboardId: s.activeDashboardId === dashboardId ? null : s.activeDashboardId,
        })),
      renameDashboard: (dashboardId, name) =>
        set((s) => ({ dashboards: mapDashboard(s.dashboards, dashboardId, () => ({ name })) })),
      replaceDashboard: (dashboard) =>
        set((s) => ({
          dashboards: mapDashboard(s.dashboards, dashboard.id, () => dashboard),
        })),
      setActiveDashboard: (dashboardId) => set({ activeDashboardId: dashboardId }),
      updateLayout: (dashboardId, layout) =>
        set((s) => ({ dashboards: mapDashboard(s.dashboards, dashboardId, () => ({ layout })) })),
      addWidget: (dashboardId, widget, layoutItem) =>
        set((s) => ({
          dashboards: mapDashboard(s.dashboards, dashboardId, (d) => ({
            widgets: [...d.widgets, widget],
            layout: [...d.layout, layoutItem],
          })),
        })),
      updateWidget: (dashboardId, widget) =>
        set((s) => ({
          dashboards: mapDashboard(s.dashboards, dashboardId, (d) => ({
            widgets: d.widgets.map((w) => (w.id === widget.id ? widget : w)),
          })),
        })),
      removeWidget: (dashboardId, widgetId) =>
        set((s) => ({
          dashboards: mapDashboard(s.dashboards, dashboardId, (d) => ({
            widgets: d.widgets.filter((w) => w.id !== widgetId),
            layout: d.layout.filter((item) => item.i !== widgetId),
          })),
        })),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      partialize: (s): PersistedState => ({
        datasets: s.datasets,
        dashboards: s.dashboards,
        activeDashboardId: s.activeDashboardId,
      }),
      migrate: (persisted, version) => {
        // 目前只有 v1，沒有舊格式要轉換；之後改版時在這裡依 version 逐步轉換。
        // 遇到比目前程式還新的格式就丟錯，不要用舊邏輯硬讀，以免誤解欄位意義。
        if (version > SCHEMA_VERSION) {
          throw new Error(`設定格式 v${version} 比目前程式支援的 v${SCHEMA_VERSION} 還新`);
        }
        return persisted as PersistedState;
      },
    },
  ),
);
