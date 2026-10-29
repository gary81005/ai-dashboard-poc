// 設定的 store：資料集中繼資料 + 儀表板（ADR 0005、0007）。不持久化。
//
// 兩者都存在 Supabase，登入後由 services/userData.ts 載入，這裡只是記憶體中的副本；
// 寫回資料庫由 services/datasetService.ts、services/dashboardService.ts 負責。
// 所有更新都是不可變更新（回傳新物件），React 才能正確偵測變化。
// 資料列不在這裡，而是在 rowsStore（從 Supabase 的 dataset_rows 載入）。
//
// 儀表板內容（版面、widget、名稱、資料來源）要手動儲存：第一次修改時把修改前的版本記在 draftBase，
// draftBase 不是 null 就代表目前開啟的儀表板有未儲存的變更。

import { create } from 'zustand';
import type {
  Dashboard,
  DashboardFilter,
  Dataset,
  DataTable,
  Field,
  LayoutItem,
  RatioOf,
  Role,
  Widget,
} from '../types/index.ts';

// ratioOf：設定分子分母；null 代表取消加權（ADR 0008）。
// valueLabels：設定值標籤；null 代表清除。showValueLabels：套用或停用值標籤（ADR 0011）。
export type FieldPatch = {
  role?: Role;
  ratio?: boolean;
  ratioOf?: RatioOf | null;
  valueLabels?: Record<string, string> | null;
  showValueLabels?: boolean;
};

// 資料集與儀表板的載入狀態。idle = 尚未登入或剛登出。
export type LoadStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

type AppState = {
  datasets: Dataset[];
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  // 目前開啟的儀表板最後一次儲存的版本；沒有未儲存的變更時是 null。
  draftBase: Dashboard | null;
  // 存檔進行中：頁面與離開確認對話框共用，存檔期間兩邊的「儲存」「捨棄」都不能再按。
  saving: boolean;
  loadStatus: LoadStatus;
  setLoadStatus: (status: LoadStatus) => void;
  setDatasets: (datasets: Dataset[]) => void;
  addDataset: (dataset: Dataset) => void;
  removeDataset: (datasetId: string) => void;
  renameDataset: (datasetId: string, name: string) => void;
  replaceDataset: (dataset: Dataset) => void;
  setTableHidden: (datasetId: string, tableKey: string, hidden: boolean) => void;
  updateField: (datasetId: string, tableKey: string, header: string, patch: FieldPatch) => void;
  setDashboards: (dashboards: Dashboard[]) => void;
  addDashboard: (dashboard: Dashboard) => void;
  removeDashboard: (dashboardId: string) => void;
  setActiveDashboard: (dashboardId: string | null) => void;
  setDraftBase: (dashboard: Dashboard | null) => void;
  setSaving: (saving: boolean) => void;
  discardChanges: () => void;
  // 以下都是儀表板內容的修改，會標記為未儲存。
  renameDashboard: (dashboardId: string, name: string) => void;
  replaceDashboard: (dashboard: Dashboard) => void;
  updateLayout: (dashboardId: string, layout: LayoutItem[]) => void;
  addWidget: (dashboardId: string, widget: Widget, layoutItem: LayoutItem) => void;
  updateWidget: (dashboardId: string, widget: Widget) => void;
  removeWidget: (dashboardId: string, widgetId: string) => void;
  setDashboardFilters: (dashboardId: string, filters: DashboardFilter[]) => void;
};

// 手動切換欄位角色／比率／分子分母／值標籤時記下 userOverride，切換資料來源時才知道要沿用（ADR 0003 決策 5）。
// 改成維度時一併拿掉比率標記，因為維度不會被彙總；取消比率時也一併取消加權。
function patchField(field: Field, patch: FieldPatch): Field {
  const overrides = new Set(field.userOverride);
  const next: Field = { ...field };
  const dropRatioOf = () => {
    if (next.ratioOf) overrides.add('ratioOf');
    delete next.ratioOf;
  };
  if (patch.role !== undefined) {
    next.role = patch.role;
    overrides.add('role');
    if (patch.role === 'dimension') {
      delete next.ratio;
      dropRatioOf();
    }
  }
  if (patch.ratio !== undefined) {
    if (patch.ratio) next.ratio = true;
    else {
      delete next.ratio;
      dropRatioOf();
    }
    overrides.add('ratio');
  }
  if (patch.ratioOf !== undefined) {
    if (patch.ratioOf) {
      next.ratioOf = patch.ratioOf;
      next.ratio = true;
    } else delete next.ratioOf;
    overrides.add('ratioOf');
  }
  // 值標籤的兩個屬性共用一個覆寫標記：使用者確認、修改或停用過，就不再提示「已自動套用」。
  if (patch.valueLabels !== undefined) {
    if (patch.valueLabels && Object.keys(patch.valueLabels).length > 0) {
      next.valueLabels = patch.valueLabels;
    } else {
      delete next.valueLabels;
      delete next.showValueLabels;
    }
    overrides.add('valueLabels');
  }
  if (patch.showValueLabels !== undefined) {
    if (patch.showValueLabels) delete next.showValueLabels;
    else next.showValueLabels = false;
    overrides.add('valueLabels');
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

// 修改指定儀表板的內容：每次修改都更新 updatedAt（儀表板清單會顯示），
// 第一次修改時把修改前的版本記成 draftBase。
function editDashboard(
  s: AppState,
  dashboardId: string,
  update: (dashboard: Dashboard) => Partial<Dashboard>,
): Pick<AppState, 'dashboards' | 'draftBase'> {
  const current = s.dashboards.find((d) => d.id === dashboardId);
  return {
    dashboards: s.dashboards.map((d) =>
      d.id === dashboardId ? { ...d, ...update(d), updatedAt: new Date().toISOString() } : d,
    ),
    draftBase: s.draftBase ?? current ?? null,
  };
}

export const useAppStore = create<AppState>()((set) => ({
  datasets: [],
  dashboards: [],
  activeDashboardId: null,
  draftBase: null,
  saving: false,
  loadStatus: { status: 'idle' },

  setLoadStatus: (loadStatus) => set({ loadStatus }),
  setDatasets: (datasets) => set({ datasets }),
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

  setDashboards: (dashboards) => set({ dashboards, activeDashboardId: null, draftBase: null }),
  addDashboard: (dashboard) => set((s) => ({ dashboards: [...s.dashboards, dashboard] })),
  removeDashboard: (dashboardId) =>
    set((s) => ({
      dashboards: s.dashboards.filter((d) => d.id !== dashboardId),
      activeDashboardId: s.activeDashboardId === dashboardId ? null : s.activeDashboardId,
    })),
  setActiveDashboard: (dashboardId) => set({ activeDashboardId: dashboardId, draftBase: null }),
  setDraftBase: (draftBase) => set({ draftBase }),
  setSaving: (saving) => set({ saving }),
  // 還原成最後一次儲存的版本。
  discardChanges: () =>
    set((s) =>
      s.draftBase
        ? {
            dashboards: s.dashboards.map((d) => (d.id === s.draftBase?.id ? s.draftBase : d)),
            draftBase: null,
          }
        : {},
    ),

  renameDashboard: (dashboardId, name) =>
    set((s) => editDashboard(s, dashboardId, () => ({ name }))),
  replaceDashboard: (dashboard) => set((s) => editDashboard(s, dashboard.id, () => dashboard)),
  updateLayout: (dashboardId, layout) =>
    set((s) => editDashboard(s, dashboardId, () => ({ layout }))),
  addWidget: (dashboardId, widget, layoutItem) =>
    set((s) =>
      editDashboard(s, dashboardId, (d) => ({
        widgets: [...d.widgets, widget],
        layout: [...d.layout, layoutItem],
      })),
    ),
  updateWidget: (dashboardId, widget) =>
    set((s) =>
      editDashboard(s, dashboardId, (d) => ({
        widgets: d.widgets.map((w) => (w.id === widget.id ? widget : w)),
      })),
    ),
  removeWidget: (dashboardId, widgetId) =>
    set((s) =>
      editDashboard(s, dashboardId, (d) => ({
        widgets: d.widgets.filter((w) => w.id !== widgetId),
        layout: d.layout.filter((item) => item.i !== widgetId),
      })),
    ),
  setDashboardFilters: (dashboardId, filters) =>
    set((s) => editDashboard(s, dashboardId, () => ({ filters }))),
}));
