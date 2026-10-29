// 欄位與資料表的查找工具，以及彙總方式的顯示文字。
//
// 比對規則見 docs/adr/0003：資料表先比 tbl_ 名稱再比工作表名稱；欄位先比中文標頭再比欄位代碼。

import type { Agg, DataTable, DataType, Dataset, Field, FieldRef } from '../types/index.ts';

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

// 資料型別的顯示文字，和「欄位定義」工作表的中文型別一致。
export const DATA_TYPE_LABELS: Record<DataType, string> = {
  text: '文字',
  integer: '整數',
  number: '數值',
  percent: '百分比',
  date: '日期',
};

export const AGG_LABELS: Record<Agg, string> = {
  sum: '加總',
  avg: '平均',
  count: '筆數',
  min: '最小',
  max: '最大',
};

// 彙總方式的顯示文字。有分子分母的比率欄位，加總與平均都是加權比率（ADR 0008），畫面上寫成「分子÷分母」。
export function aggLabel(field: Field | undefined, agg: Agg): string {
  if (field?.ratioOf && (agg === 'sum' || agg === 'avg')) return '分子÷分母';
  return AGG_LABELS[agg];
}

// 圖例與欄名用的標籤：加總與加權比率是預設，所以不另外標示；其他彙總方式加上括號說明。
export function measureLabel(field: Field, agg: Agg): string {
  if (agg === 'sum' || (field.ratioOf && agg === 'avg')) return field.header;
  return `${field.header}（${AGG_LABELS[agg]}）`;
}
