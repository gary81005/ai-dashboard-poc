// 單一儀表板的複製、匯出與匯入（匯出格式見 docs/adr/0005）。
//
// 匯出檔只含設定與「欄位簽章」，不含資料列；匯入時一律產生新的 id。

import { SCHEMA_VERSION } from '../types/index.ts';
import type { Dashboard, Dataset, FieldRef } from '../types/index.ts';
import { findTable } from './fields.ts';
import { createId } from './ids.ts';
import { rebindDashboard, widgetFieldRefs } from './rebind.ts';

// 匯出檔的識別字串，匯入時用來確認是本系統產生的檔案。
export const EXPORT_KIND = 'ai-dashboard-poc/dashboard';

// 欄位簽章：儀表板用到哪些資料表、哪些欄位，方便人工檢查或在別台電腦比對。
export type FieldSignature = {
  tables: Array<{ key: string; sheetName: string; fields: FieldRef[] }>;
};

export type DashboardExport = {
  kind: typeof EXPORT_KIND;
  version: number;
  dashboard: Dashboard;
  signature: FieldSignature;
};

// 深拷貝儀表板並換上新的 id；layout 的 i 跟著對應的 widget 換成新 id。
export function cloneDashboard(dashboard: Dashboard, patch: Partial<Dashboard>): Dashboard {
  const idMap = new Map(dashboard.widgets.map((w) => [w.id, createId('w')]));
  return {
    ...structuredClone(dashboard),
    widgets: dashboard.widgets.map((w) => ({ ...structuredClone(w), id: idMap.get(w.id)! })),
    layout: dashboard.layout
      .filter((item) => idMap.has(item.i))
      .map((item) => ({ ...item, i: idMap.get(item.i)! })),
    id: createId('db'),
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

// 組出匯出檔：儀表板本身 + 依資料表整理的欄位簽章。
export function buildExport(dashboard: Dashboard, dataset: Dataset | undefined): DashboardExport {
  const byTable = new Map<string, Map<string, FieldRef>>();
  for (const widget of dashboard.widgets) {
    const refs = widgetFieldRefs(widget);
    if (refs.length === 0) continue;
    const fields = byTable.get(widget.table) ?? new Map<string, FieldRef>();
    for (const ref of refs) fields.set(ref.header, ref);
    byTable.set(widget.table, fields);
  }
  return {
    kind: EXPORT_KIND,
    version: SCHEMA_VERSION,
    dashboard,
    signature: {
      tables: [...byTable].map(([key, fields]) => ({
        key,
        sheetName: (dataset && findTable(dataset, key)?.sheetName) ?? key,
        fields: [...fields.values()],
      })),
    },
  };
}

// 型別守衛：確認是一般物件（排除 null 與陣列）。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 解析並驗證匯入的檔案：必須是本系統的 kind，且格式版本不能比目前程式新。只做基本的結構檢查。
export function parseExport(text: string): DashboardExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('檔案不是有效的 JSON');
  }
  if (!isRecord(data) || data.kind !== EXPORT_KIND) {
    throw new Error('這不是本系統匯出的儀表板檔案');
  }
  if (typeof data.version !== 'number' || data.version > SCHEMA_VERSION) {
    throw new Error(`檔案格式 v${String(data.version)} 比目前程式支援的 v${SCHEMA_VERSION} 還新`);
  }
  const dashboard = data.dashboard;
  if (
    !isRecord(dashboard) ||
    typeof dashboard.name !== 'string' ||
    !Array.isArray(dashboard.widgets) ||
    !Array.isArray(dashboard.layout)
  ) {
    throw new Error('檔案缺少儀表板內容');
  }
  return data as DashboardExport;
}

// 匯入：先複製出新 id 的儀表板，再像切換資料來源一樣綁到選定的資料集。
export function instantiateImport(data: DashboardExport, dataset: Dataset): Dashboard {
  return rebindDashboard(cloneDashboard(data.dashboard, { datasetId: dataset.id }), dataset);
}
