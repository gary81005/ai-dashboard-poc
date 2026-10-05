// 元件設定中的「篩選」槽位：拖入維度欄位建立篩選，點擊標籤勾選要保留的值（widget 層級，ADR 0004）。
//
// 和每張圖右上角的漏斗按鈕（components/widgets/WidgetFilterControl.tsx）改的是同一份 widget.filters。

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import type { FieldDragItem } from '../../types/dnd.ts';
import type { Dataset, DatasetRows, Filter, Widget } from '../../types/index.ts';
import { findTable, resolveField, toFieldRef } from '../../utils/fields.ts';
import { orderCategories } from '../../utils/query.ts';
import { hasAnyField } from '../../utils/widgetEditing.ts';
import { DropZone } from './Shelf.tsx';

type Props = {
  widget: Widget;
  dataset: Dataset;
  rows: DatasetRows;
  onChange: (widget: Widget) => void;
};

export function FilterShelf({ widget, dataset, rows, onChange }: Props) {
  const setFilters = (filters: Filter[]) => onChange({ ...widget, filters });

  const handleDrop = (item: FieldDragItem) => {
    if (widget.filters.some((f) => f.field.header === item.field.header)) return;
    onChange({
      ...widget,
      table: hasAnyField(widget) ? widget.table : item.tableKey,
      filters: [...widget.filters, { field: toFieldRef(item.field), op: 'in', values: [] }],
    });
  };

  return (
    <DropZone
      widget={widget}
      accepts={(item) => item.field.role === 'dimension'}
      onDrop={handleDrop}
      label='篩選'
      hint='點欄位選擇要保留的值'
      placeholder='拖入維度欄位'
    >
      {widget.filters.map((filter, index) => (
        <FilterChip
          key={filter.field.header}
          filter={filter}
          widget={widget}
          dataset={dataset}
          rows={rows}
          onChange={(next) => setFilters(widget.filters.map((f, i) => (i === index ? next : f)))}
          onDelete={() => setFilters(widget.filters.filter((_, i) => i !== index))}
        />
      ))}
    </DropZone>
  );
}

type FilterChipProps = {
  filter: Filter;
  widget: Widget;
  dataset: Dataset;
  rows: DatasetRows;
  onChange: (filter: Filter) => void;
  onDelete: () => void;
};

// 一個篩選條件的標籤；點擊後彈出可勾選的值清單（值來自目前資料表的實際資料）。
function FilterChip({ filter, widget, dataset, rows, onChange, onDelete }: FilterChipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const table = findTable(dataset, widget.table);
  const field = table ? resolveField(table, filter.field) : undefined;
  const options = table && field ? orderCategories(rows[table.key] ?? [], field) : [];
  const selected = new Set(filter.values.map(String));

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...filter, values: options.filter((o) => next.has(o)) });
  };

  const summary =
    filter.values.length === 0
      ? '全部'
      : filter.values.length <= 2
        ? filter.values.join('、')
        : `${filter.values.length} 項`;

  return (
    <>
      <Chip
        size='small'
        color={field ? 'default' : 'error'}
        label={`${filter.field.header}：${field ? summary : '欄位遺失'}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        onDelete={onDelete}
      />
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, maxHeight: 360, overflowY: 'auto', minWidth: 200 }}>
          <Stack direction='row' spacing={1} sx={{ mb: 1 }}>
            <Button size='small' onClick={() => onChange({ ...filter, values: options })}>
              全選
            </Button>
            <Button size='small' onClick={() => onChange({ ...filter, values: [] })}>
              清除（不篩選）
            </Button>
          </Stack>
          <Stack>
            {options.map((option) => (
              <FormControlLabel
                key={option}
                label={option}
                control={
                  <Checkbox
                    size='small'
                    checked={selected.has(option)}
                    onChange={() => toggle(option)}
                  />
                }
              />
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}
