// 編輯模式對 widget 的各種操作（純函式：回傳新的 widget，不修改原物件）。
//
// 依 constants/widgetTypes.ts 的槽位目錄運作：讀寫槽位、拖入欄位、切換圖表類型、清空、新增，
// 以及版面相關的小工具。對應的 UI 在 components/editor/。

import { DEFAULT_WIDGET_SIZE, WIDGET_SLOTS, WIDGET_TYPE_LABELS } from '../constants/widgetTypes.ts';
import type { SlotDef } from '../constants/widgetTypes.ts';
import type {
  Agg,
  Field,
  FieldRef,
  Filter,
  LayoutItem,
  Widget,
  WidgetType,
} from '../types/index.ts';
import { toFieldRef } from './fields.ts';
import { createId } from './ids.ts';

// 槽位裡的一個項目，統一各種槽位的形狀：維度只有 field，量值多了 agg，組合圖再多 mark／axis。
export type SlotEntry = {
  field: FieldRef;
  agg?: Agg;
  mark?: 'bar' | 'line';
  axis?: 'left' | 'right';
};

// 槽位在執行時以 key 存取（encoding.x、encoding.y…），寫回時再轉回有型別的 Widget。
type LooseEncoding = Record<string, unknown>;

// 把任何槽位讀成陣列（單一欄位的槽位會變成 0 或 1 個項目）。
export function readSlot(widget: Widget, slot: SlotDef): SlotEntry[] {
  const value = (widget.encoding as LooseEncoding)[slot.key];
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as SlotEntry[]) : [value as SlotEntry];
}

// 依槽位種類把項目寫回 encoding；清空的單一欄位槽位會被刪除，而不是存成 undefined。
export function writeSlot(widget: Widget, slot: SlotDef, entries: readonly SlotEntry[]): Widget {
  let value: unknown;
  switch (slot.kind) {
    case 'dimension':
      value = entries[0] ? { field: entries[0].field } : undefined;
      break;
    case 'measure':
      value = entries[0] ? { field: entries[0].field, agg: entries[0].agg ?? 'sum' } : undefined;
      break;
    case 'measures':
      value = entries.map((e, i) =>
        widget.type === 'combo'
          ? {
              field: e.field,
              agg: e.agg ?? 'sum',
              mark: e.mark ?? (i === 0 ? 'bar' : 'line'),
              axis: e.axis ?? (i === 0 ? 'left' : 'right'),
            }
          : { field: e.field, agg: e.agg ?? 'sum' },
      );
      break;
    case 'columns':
      value = entries.map((e) => (e.agg ? { field: e.field, agg: e.agg } : { field: e.field }));
      break;
  }
  const encoding: LooseEncoding = { ...(widget.encoding as LooseEncoding) };
  if (value === undefined) delete encoding[slot.key];
  else encoding[slot.key] = value;
  return { ...widget, encoding } as Widget;
}

// 預設彙總方式（ADR 0004）：一般量值加總、比率取平均、把維度放進數值槽位就計數。
export function defaultAgg(field: Field): Agg {
  if (field.role === 'dimension') return 'count';
  return field.ratio ? 'avg' : 'sum';
}

// 維度槽位只接受維度；數值與表格欄位槽位接受任何欄位（維度會以計數彙總）。
export function slotAccepts(slot: SlotDef, field: Field): boolean {
  return slot.kind === 'dimension' ? field.role === 'dimension' : true;
}

// 拖入欄位：單一欄位槽位直接取代；多欄位槽位附加在後面（同欄位同彙總不重複加入）。
// 組合圖的第一個量值預設為左軸長條，之後的預設為右軸折線。
export function addToSlot(widget: Widget, slot: SlotDef, field: Field): Widget {
  const existing = readSlot(widget, slot);
  const ref = toFieldRef(field);
  let entry: SlotEntry;
  if (slot.kind === 'dimension' || slot.kind === 'columns') {
    entry = { field: ref };
  } else {
    entry = { field: ref, agg: defaultAgg(field) };
    if (widget.type === 'combo') {
      const first = existing.length === 0;
      entry.mark = first ? 'bar' : 'line';
      entry.axis = first ? 'left' : 'right';
    }
  }
  if (slot.kind === 'dimension' || slot.kind === 'measure') return writeSlot(widget, slot, [entry]);
  const duplicate = existing.some(
    (e) => e.field.header === entry.field.header && e.agg === entry.agg,
  );
  return duplicate ? widget : writeSlot(widget, slot, [...existing, entry]);
}

// 有選值的篩選才算生效（沒選任何值等於不篩選，見 utils/query.ts 的 applyFilters）。
export function activeFilters(widget: Widget): Filter[] {
  return widget.filters.filter((f) => f.values.length > 0);
}

// widget 是否已經有任何欄位或篩選。有的話就鎖定資料表，只能再放同一張表的欄位。
export function hasAnyField(widget: Widget): boolean {
  return (
    widget.filters.length > 0 ||
    WIDGET_SLOTS[widget.type].some((slot) => readSlot(widget, slot).length > 0)
  );
}

type WidgetBase = Pick<Widget, 'id' | 'title' | 'table' | 'filters'>;

// 產生指定類型的空白 widget。每個 case 分開寫，TypeScript 才能正確推斷聯集型別。
function emptyWidget(base: WidgetBase, type: WidgetType): Widget {
  switch (type) {
    case 'line':
      return { ...base, type, encoding: { y: [] } };
    case 'bar':
      return { ...base, type, encoding: { y: [] } };
    case 'combo':
      return { ...base, type, encoding: { y: [] } };
    case 'radar':
      return { ...base, type, encoding: { y: [] } };
    case 'table':
      return { ...base, type, encoding: { columns: [] } };
    case 'pie':
      return { ...base, type, encoding: {} };
    case 'scatter':
      return { ...base, type, encoding: {} };
    case 'gauge':
      return { ...base, type, encoding: {} };
    case 'kpi':
      return { ...base, type, encoding: {} };
  }
}

// 新增元件：先不綁資料表（table 為空字串），由拖入的第一個欄位決定。
export function createWidget(type: WidgetType): Widget {
  return emptyWidget(
    { id: createId('w'), title: WIDGET_TYPE_LABELS[type], table: '', filters: [] },
    type,
  );
}

// 清空所有欄位與篩選，同時解除資料表鎖定，讓使用者可以改用別張表。
export function clearWidget(widget: Widget): Widget {
  return emptyWidget({ id: widget.id, title: widget.title, table: '', filters: [] }, widget.type);
}

// 切換圖表類型時盡量保留欄位：維度依序填入維度槽位、量值填入量值槽位；
// 樣式選項（options）因各類型不同而重設。標題若還是預設名稱，也一併換成新類型的名稱。
export function convertWidget(widget: Widget, type: WidgetType): Widget {
  if (widget.type === type) return widget;
  const dimensions: FieldRef[] = [];
  const measures: SlotEntry[] = [];
  for (const slot of WIDGET_SLOTS[widget.type]) {
    for (const entry of readSlot(widget, slot)) {
      const isDimension = slot.kind === 'dimension' || (slot.kind === 'columns' && !entry.agg);
      if (isDimension) dimensions.push(entry.field);
      else measures.push({ field: entry.field, agg: entry.agg ?? 'sum' });
    }
  }

  const title =
    widget.title === WIDGET_TYPE_LABELS[widget.type] ? WIDGET_TYPE_LABELS[type] : widget.title;
  let next = emptyWidget(
    { id: widget.id, title, table: widget.table, filters: widget.filters },
    type,
  );
  for (const slot of WIDGET_SLOTS[type]) {
    if (slot.kind === 'dimension' && dimensions.length > 0) {
      next = writeSlot(next, slot, [{ field: dimensions.shift()! }]);
    } else if (slot.kind === 'measure' && measures.length > 0) {
      next = writeSlot(next, slot, [measures.shift()!]);
    } else if (slot.kind === 'measures') {
      next = writeSlot(next, slot, measures.splice(0));
    } else if (slot.kind === 'columns') {
      next = writeSlot(next, slot, [
        ...dimensions.splice(0).map((field) => ({ field })),
        ...measures.splice(0),
      ]);
    }
  }
  return next;
}

// 新元件放在目前版面的最下方，大小依類型的預設值。
export function nextLayoutItem(layout: readonly LayoutItem[], widget: Widget): LayoutItem {
  const bottom = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  return { i: widget.id, x: 0, y: bottom, ...DEFAULT_WIDGET_SIZE[widget.type] };
}

// 比較兩份版面是否相同（不管順序），避免把 react-grid-layout 初次掛載時的回報當成修改。
export function sameLayout(a: readonly LayoutItem[], b: readonly LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.i, item]));
  return a.every((item) => {
    const other = byId.get(item.i);
    return (
      other !== undefined &&
      other.x === item.x &&
      other.y === item.y &&
      other.w === item.w &&
      other.h === item.h
    );
  });
}
