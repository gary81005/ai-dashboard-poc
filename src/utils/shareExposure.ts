// 分享時會露出逐筆資料的元件（ADR 0012 §3）：分享出去的雖然只是算好的結果，
// 但這些元件的結果本身就是一筆一筆的資料，例如明細表、每位客戶一個點的散佈圖、客戶排行。
// 分享對話框列出它們，讓擁有者自己決定要不要分享；系統不會自動把它們藏起來。
//
// 「一個值一筆」的判斷用欄位類別的「代號／名稱」（identifier，ADR 0010）：每筆幾乎都不同的欄位。

import type { Dataset, DatasetRows, FieldRef, Widget } from '../types/index.ts';
import { profilesOf } from './fieldKinds.ts';
import { findTable, resolveField } from './fields.ts';

export type Exposure = { widget: Widget; reason: string };

export function exposedWidgets(
  widgets: readonly Widget[],
  dataset: Dataset,
  rows: DatasetRows,
): Exposure[] {
  return widgets.flatMap((widget) => {
    const table = findTable(dataset, widget.table);
    if (!table) return [];
    const profiles = profilesOf(table, rows[table.key] ?? []);
    // 這個欄位是「代號／名稱」的話回傳標頭，否則 undefined。
    const identifier = (ref: FieldRef | undefined): string | undefined => {
      const field = ref && resolveField(table, ref);
      const profile = field && profiles.find((p) => p.field.header === field.header);
      return profile?.kind.kind === 'identifier' ? profile.field.header : undefined;
    };
    const exposure = (reason: string | undefined) => (reason ? [{ widget, reason }] : []);

    switch (widget.type) {
      case 'table': {
        const { columns } = widget.encoding;
        if (columns.length === 0) return [];
        if (columns.every((c) => !c.agg)) return exposure('列出每一筆資料');
        const header = columns
          .filter((c) => !c.agg)
          .map((c) => identifier(c.field))
          .find(Boolean);
        return exposure(header && `依「${header}」逐一列出`);
      }
      case 'scatter': {
        const { x, y, detail } = widget.encoding;
        if (!x || !y) return [];
        return exposure(detail ? `每個「${detail.field.header}」一個點` : '每一筆資料一個點');
      }
      case 'line':
      case 'bar':
      case 'radar': {
        const header =
          identifier(widget.encoding.x?.field) ?? identifier(widget.encoding.group?.field);
        return exposure(header && `每個「${header}」各一個值`);
      }
      case 'combo': {
        const header = identifier(widget.encoding.x?.field);
        return exposure(header && `每個「${header}」各一個值`);
      }
      case 'pie': {
        const header = identifier(widget.encoding.category?.field);
        return exposure(header && `每個「${header}」各一塊`);
      }
      case 'gauge':
      case 'kpi':
      case 'text':
        return [];
    }
  });
}
