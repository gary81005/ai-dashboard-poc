// 切換資料來源（例如換成下個月的報表）與相關檢查，規則見 docs/adr/0003。
//
// 匯入功能（utils/dashboardTransfer.ts）也重用這裡：匯入 = 複製一份儀表板 + 綁到選定的資料集。

import { WIDGET_SLOTS } from '../constants/widgetTypes.ts';
import type { Dashboard, Dataset, Field, FieldRef, Widget } from '../types/index.ts';
import { findTable, resolveField, toFieldRef } from './fields.ts';
import { readSlot, writeSlot } from './widgetEditing.ts';

// 對 widget 用到的每個欄位參照（所有槽位 + 篩選）套用轉換，回傳新的 widget。
export function mapWidgetRefs(widget: Widget, map: (ref: FieldRef) => FieldRef): Widget {
  let next = widget;
  for (const slot of WIDGET_SLOTS[widget.type]) {
    const entries = readSlot(next, slot);
    if (entries.length > 0) {
      next = writeSlot(
        next,
        slot,
        entries.map((e) => ({ ...e, field: map(e.field) })),
      );
    }
  }
  return { ...next, filters: next.filters.map((f) => ({ ...f, field: map(f.field) })) };
}

// 列出 widget 用到的所有欄位參照（借用 mapWidgetRefs 走訪一次）。
export function widgetFieldRefs(widget: Widget): FieldRef[] {
  const refs: FieldRef[] = [];
  mapWidgetRefs(widget, (ref) => {
    refs.push(ref);
    return ref;
  });
  return refs;
}

// 預覽用：哪個 widget 會找不到資料表或哪些欄位。
export type WidgetIssue = {
  widgetId: string;
  title: string;
  missingTable: boolean;
  missingFields: FieldRef[];
};

// 檢查儀表板套用到指定資料集後的欄位遺失狀況；還沒有欄位的 widget 不列入。
export function findIssues(dashboard: Dashboard, dataset: Dataset): WidgetIssue[] {
  return dashboard.widgets.flatMap((widget) => {
    const refs = widgetFieldRefs(widget);
    if (refs.length === 0) return [];
    const table = findTable(dataset, widget.table);
    const missingFields = table ? refs.filter((ref) => !resolveField(table, ref)) : refs;
    if (table && missingFields.length === 0) return [];
    return [{ widgetId: widget.id, title: widget.title, missingTable: !table, missingFields }];
  });
}

// 把儀表板綁到新的資料集：資料表改用新資料集的 key；只靠欄位代碼對上的參照，改寫成新的標頭。
// 完全對不上的參照保持原樣，畫面上會顯示「欄位遺失」讓使用者重新指定。
export function rebindDashboard(dashboard: Dashboard, dataset: Dataset): Dashboard {
  const widgets = dashboard.widgets.map((widget) => {
    const table = findTable(dataset, widget.table);
    if (!table) return widget;
    return mapWidgetRefs({ ...widget, table: table.key }, (ref) => {
      const field = resolveField(table, ref);
      return field && field.header !== ref.header ? toFieldRef(field) : ref;
    });
  });
  return { ...dashboard, datasetId: dataset.id, widgets };
}

// ADR 0003 決策 5：手動調整過的角色／比率標記，沿用到新資料集裡對應的欄位；
// 新資料集裡已經被使用者調整過的欄位則不覆蓋。沒有任何變更時回傳原物件。
export function carryOverrides(from: Dataset, to: Dataset): Dataset {
  let changed = false;
  const tables = to.tables.map((table) => {
    const source = findTable(from, table.key) ?? findTable(from, table.sheetName);
    if (!source) return table;
    const fields = table.fields.map((field): Field => {
      if (field.userOverride?.length) return field;
      const previous = resolveField(source, toFieldRef(field));
      if (!previous?.userOverride?.length) return field;
      changed = true;
      const next: Field = { ...field, userOverride: [...previous.userOverride] };
      if (previous.userOverride.includes('role')) next.role = previous.role;
      if (previous.userOverride.includes('ratio')) {
        if (previous.ratio) next.ratio = true;
        else delete next.ratio;
      }
      if (next.role === 'dimension') delete next.ratio;
      return next;
    });
    return { ...table, fields };
  });
  return changed ? { ...to, tables } : to;
}
