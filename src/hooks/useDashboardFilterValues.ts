// 目前儀表板的篩選值（ADR 0008）。uiStore 只記一組，記的是別的儀表板時視為沒有選。

import { useUiStore } from '../store/uiStore.ts';
import type { SelectedValues } from '../utils/dashboardFilters.ts';

const NO_VALUES: SelectedValues = {};

export function useDashboardFilterValues(dashboardId: string): SelectedValues {
  const filterValues = useUiStore((s) => s.filterValues);
  return filterValues?.dashboardId === dashboardId ? filterValues.values : NO_VALUES;
}
