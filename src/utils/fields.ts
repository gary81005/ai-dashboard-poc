// 欄位與資料表的查找工具，以及彙總方式的顯示文字。
//
// 比對規則見 docs/adr/0003：資料表先比 tbl_ 名稱再比工作表名稱；欄位先比中文標頭再比欄位代碼。

import type { Agg, DataTable, Dataset, Field, FieldRef } from '../types/index.ts';

export function findTable(dataset: Dataset, key: string): DataTable | undefined {
  return (
    dataset.tables.find((t) => t.key === key) ?? dataset.tables.find((t) => t.sheetName === key)
  );
}

export function resolveField(table: DataTable, ref: FieldRef): Field | undefined {
  const byHeader = table.fields.find((f) => f.header === ref.header);
  if (byHeader) return byHeader;
  if (!ref.code) return undefined;
  return table.fields.find((f) => f.code !== undefined && f.code === ref.code);
}

// 由欄位產生要存進設定的參照（有代碼才帶代碼）。
export function toFieldRef(field: Field): FieldRef {
  return field.code ? { header: field.header, code: field.code } : { header: field.header };
}

export const AGG_LABELS: Record<Agg, string> = {
  sum: '加總',
  avg: '平均',
  count: '計數',
  min: '最小',
  max: '最大',
};

// 圖例與欄名用的標籤：加總是預設，所以不另外標示；其他彙總方式加上括號說明。
export function measureLabel(field: Field, agg: Agg): string {
  return agg === 'sum' ? field.header : `${field.header}（${AGG_LABELS[agg]}）`;
}
