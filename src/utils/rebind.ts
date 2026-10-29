// 切換資料來源（例如換成下個月的報表）與相關檢查，規則見 docs/adr/0003。
//
// 匯入功能（utils/dashboardTransfer.ts）也重用這裡：匯入 = 複製一份儀表板 + 綁到選定的資料集。

import { WIDGET_SLOTS } from '../constants/widgetTypes.ts';
import type { Dashboard, Dataset, Field, FieldRef, Widget } from '../types/index.ts';
import { tablesWithField } from './dashboardFilters.ts';
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

// 儀表板篩選在指定資料集裡，所有看得到的資料表都找不到的欄位（篩選時會被略過）。
export function findMissingFilters(dashboard: Dashboard, dataset: Dataset): FieldRef[] {
  return (dashboard.filters ?? [])
    .filter((filter) => tablesWithField(dataset, filter).length === 0)
    .map((filter) => filter.field);
}

// 儀表板篩選不屬於任何一張資料表，所以在看得到的資料表裡找：有任何一張表的標頭對得上就不動；
// 只靠欄位代碼對上時改寫成新的標頭，因為篩選的選值以標頭當 key。完全對不上的保持原樣。
function rebindFilterRef(dataset: Dataset, ref: FieldRef): FieldRef {
  const tables = dataset.tables.filter((t) => !t.hidden);
  if (tables.some((t) => t.fields.some((f) => f.header === ref.header))) return ref;
  for (const table of tables) {
    const field = resolveField(table, ref);
    if (field) return toFieldRef(field);
  }
  return ref;
}

// 把儀表板綁到新的資料集：資料表改用新資料集的 key；只靠欄位代碼對上的參照（含儀表板篩選），改寫成新的標頭。
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
  const filters = dashboard.filters?.map((f) => ({
    ...f,
    field: rebindFilterRef(dataset, f.field),
  }));
  return { ...dashboard, datasetId: dataset.id, widgets, ...(filters ? { filters } : {}) };
}

// ADR 0003 決策 5：手動調整過的角色／比率標記／分子分母／值標籤，沿用到新資料集裡對應的欄位；
// 新資料集裡已經被使用者調整過的欄位則不覆蓋。沒有任何變更時回傳原物件。
// 分子分母要兩欄在新資料表裡都還在才沿用。
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
      if (previous.userOverride.includes('ratioOf')) {
        const headers = new Set(table.fields.map((f) => f.header));
        const ratioOf = previous.ratioOf;
        if (ratioOf && headers.has(ratioOf.numerator) && headers.has(ratioOf.denominator)) {
          next.ratioOf = ratioOf;
          next.ratio = true;
        } else delete next.ratioOf;
      }
      // 值標籤（ADR 0011）：沿用上一份的對照與開關，包括「清除」和「停用」。
      if (previous.userOverride.includes('valueLabels')) {
        if (previous.valueLabels) next.valueLabels = previous.valueLabels;
        else delete next.valueLabels;
        if (previous.showValueLabels === false) next.showValueLabels = false;
        else delete next.showValueLabels;
      }
      if (next.role === 'dimension' || !next.ratio) delete next.ratioOf;
      if (next.role === 'dimension') delete next.ratio;
      return next;
    });
    return { ...table, fields };
  });
  return changed ? { ...to, tables } : to;
}
