// 儀表板篩選（ADR 0008）：一個篩選欄位以欄位參照比對每張資料表（ADR 0003），
// 有這個欄位的資料表就套用、沒有的略過，所以同一組篩選可以同時作用在多張表的 widget 上。
// 選取的值只在當次瀏覽有效（uiStore），這裡只負責把它們轉成每個 widget 的 Filter。

import type { DashboardFilter, Dataset, DatasetRows, DataTable, Filter } from '../types/index.ts';
import { resolveField, toFieldRef } from './fields.ts';
import { categoryKey, orderCategories } from './query.ts';
import { labelOf } from './valueLabels.ts';

export type SelectedValues = Record<string, string[]>;

// 有選值的篩選才算生效。
function active(filters: readonly DashboardFilter[], values: SelectedValues): DashboardFilter[] {
  return filters.filter((f) => (values[f.field.header]?.length ?? 0) > 0);
}

// 套用到某張資料表的篩選：applied 是轉好的 Filter（欄位參照改成這張表的欄位），
// skipped 是這張表沒有對應欄位、因此略過的篩選標頭（卡片上會提示）。
export function filtersForTable(
  table: DataTable,
  filters: readonly DashboardFilter[],
  values: SelectedValues,
): { applied: Filter[]; skipped: string[] } {
  const applied: Filter[] = [];
  const skipped: string[] = [];
  for (const filter of active(filters, values)) {
    const field = resolveField(table, filter.field);
    if (field) {
      applied.push({ field: toFieldRef(field), op: 'in', values: values[filter.field.header] });
    } else skipped.push(filter.field.header);
  }
  return { applied, skipped };
}

// 某個篩選欄位可以選的值：所有看得到的資料表裡這一欄出現過的值，
// 並先套用「其他」生效中的篩選，所以選了區域之後，人員清單只剩該區域的人。
export function filterOptions(
  dataset: Dataset,
  rows: DatasetRows,
  filters: readonly DashboardFilter[],
  values: SelectedValues,
  target: DashboardFilter,
): string[] {
  const others = active(filters, values).filter((f) => f.field.header !== target.field.header);
  const options: string[] = [];
  const seen = new Set<string>();
  for (const table of dataset.tables) {
    if (table.hidden) continue;
    const field = resolveField(table, target.field);
    if (!field) continue;
    const conditions = others.flatMap((f) => {
      const other = resolveField(table, f.field);
      return other ? [{ header: other.header, values: new Set(values[f.field.header]) }] : [];
    });
    const tableRows = (rows[table.key] ?? []).filter((row) =>
      conditions.every((c) => c.values.has(categoryKey(row[c.header]))),
    );
    for (const option of orderCategories(tableRows, field)) {
      if (!seen.has(option)) {
        seen.add(option);
        options.push(option);
      }
    }
  }
  return options;
}

// 篩選選項的顯示文字：用第一張有這個欄位、而且有設值標籤的資料表的對照（ADR 0011），
// 沒有任何對照就顯示原始值。選取與比對仍用原始值。
export function filterOptionLabel(
  dataset: Dataset,
  target: DashboardFilter,
  option: string,
): string {
  for (const table of dataset.tables) {
    if (table.hidden) continue;
    const field = resolveField(table, target.field);
    if (!field) continue;
    const label = labelOf(field, option);
    if (label !== option) return label;
  }
  return option;
}

// 看得到的資料表裡有沒有這個欄位（編輯模式新增篩選時用來提示）。
export function tablesWithField(dataset: Dataset, filter: DashboardFilter): DataTable[] {
  return dataset.tables.filter((t) => !t.hidden && resolveField(t, filter.field) !== undefined);
}
