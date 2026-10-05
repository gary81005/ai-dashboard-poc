import type { Field } from './index.ts';

// 從欄位清單拖到槽位時，react-dnd 傳遞的資料：欄位本身加上它所屬的資料表。
// 槽位用 tableKey 判斷能不能接受（一個 widget 只能用一張表）。
export type FieldDragItem = { tableKey: string; field: Field };
