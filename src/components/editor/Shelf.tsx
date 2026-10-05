// 元件設定中的拖放槽：
//   - Shelf：一般槽位（X 軸、Y 軸、分組…），依 constants/widgetTypes.ts 的定義產生
//   - DropZone：所有槽位共用的拖放區外框（篩選槽位也使用），負責判斷能不能放
//   - SlotChip：槽位裡的欄位標籤，點擊可改彙總方式；組合圖另可切換長條／折線與左右軸

import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useDrop } from 'react-dnd';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { FIELD_DND_TYPE } from '../../constants/dnd.ts';
import type { SlotDef } from '../../constants/widgetTypes.ts';
import type { FieldDragItem } from '../../types/dnd.ts';
import type { Agg, Dataset, Widget } from '../../types/index.ts';
import { AGG_LABELS, findTable, resolveField } from '../../utils/fields.ts';
import {
  addToSlot,
  hasAnyField,
  readSlot,
  slotAccepts,
  writeSlot,
} from '../../utils/widgetEditing.ts';
import type { SlotEntry } from '../../utils/widgetEditing.ts';

const AGGS = Object.keys(AGG_LABELS) as Agg[];

type Props = {
  widget: Widget;
  slot: SlotDef;
  dataset: Dataset;
  onChange: (widget: Widget) => void;
};

export function Shelf({ widget, slot, dataset, onChange }: Props) {
  const entries = readSlot(widget, slot);
  const table = findTable(dataset, widget.table);

  const handleDrop = (item: FieldDragItem) => {
    // 空白 widget 收到第一個欄位時，以該欄位所屬的資料表作為 widget 的資料表。
    const target = hasAnyField(widget) ? widget : { ...widget, table: item.tableKey };
    onChange(addToSlot(target, slot, item.field));
  };

  const updateEntry = (index: number, patch: Partial<SlotEntry>) =>
    onChange(
      writeSlot(
        widget,
        slot,
        entries.map((e, i) => (i === index ? { ...e, ...patch } : e)),
      ),
    );
  const removeEntry = (index: number) =>
    onChange(
      writeSlot(
        widget,
        slot,
        entries.filter((_, i) => i !== index),
      ),
    );

  return (
    <DropZone
      widget={widget}
      accepts={(item) => slotAccepts(slot, item.field)}
      onDrop={handleDrop}
      label={slot.label}
      hint={slot.hint}
      placeholder={slot.kind === 'dimension' ? '拖入維度欄位' : '拖入欄位'}
    >
      {entries.map((entry, index) => (
        <SlotChip
          key={`${entry.field.header}-${index}`}
          entry={entry}
          slot={slot}
          isCombo={widget.type === 'combo'}
          missing={!table || !resolveField(table, entry.field)}
          onChange={(patch) => updateEntry(index, patch)}
          onDelete={() => removeEntry(index)}
        />
      ))}
    </DropZone>
  );
}

type DropZoneProps = {
  widget: Widget;
  accepts: (item: FieldDragItem) => boolean;
  onDrop: (item: FieldDragItem) => void;
  label: string;
  hint?: string;
  placeholder: string;
  children: ReactNode;
};

// 一個 widget 只讀一張資料表（ADR 0005），所以已有欄位後只接受同一張表的欄位。
// 框線顏色：拖曳中且可放 = 淺藍、懸停且可放 = 藍、懸停但不可放 = 紅。
export function DropZone({
  widget,
  accepts,
  onDrop,
  label,
  hint,
  placeholder,
  children,
}: DropZoneProps) {
  const [{ isOver, canDrop }, drop] = useDrop<
    FieldDragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: FIELD_DND_TYPE,
    canDrop: (item) => accepts(item) && (!hasAnyField(widget) || item.tableKey === widget.table),
    drop: onDrop,
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <Box>
      <Typography variant='caption' sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      {hint && (
        <Typography variant='caption' color='text.secondary' sx={{ ml: 1 }}>
          {hint}
        </Typography>
      )}
      <Box
        ref={(node: HTMLDivElement | null) => {
          drop(node);
        }}
        sx={{
          mt: 0.5,
          minHeight: 40,
          p: 0.75,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.75,
          alignItems: 'center',
          borderRadius: 1,
          border: '1px dashed',
          borderColor: isOver
            ? canDrop
              ? 'primary.main'
              : 'error.main'
            : canDrop
              ? 'primary.light'
              : 'divider',
          bgcolor: isOver && canDrop ? 'action.hover' : 'transparent',
        }}
      >
        {hasChildren ? (
          children
        ) : (
          <Typography variant='caption' color='text.disabled' sx={{ px: 0.5 }}>
            {placeholder}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

type SlotChipProps = {
  entry: SlotEntry;
  slot: SlotDef;
  isCombo: boolean;
  missing: boolean;
  onChange: (patch: Partial<SlotEntry>) => void;
  onDelete: () => void;
};

// 槽位裡的一個欄位。欄位在目前資料表找不到時顯示紅色的「欄位遺失」。
function SlotChip({ entry, slot, isCombo, missing, onChange, onDelete }: SlotChipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const hasMenu = slot.kind !== 'dimension';
  const parts = [entry.field.header];
  if (entry.agg) parts.push(AGG_LABELS[entry.agg]);
  if (isCombo && slot.kind === 'measures') {
    parts.push(entry.mark === 'line' ? '折線' : '長條', entry.axis === 'right' ? '右軸' : '左軸');
  }

  const choose = (patch: Partial<SlotEntry>) => {
    onChange(patch);
    setAnchor(null);
  };

  return (
    <>
      <Chip
        size='small'
        color={missing ? 'error' : 'default'}
        label={missing ? `${parts.join('・')}（欄位遺失）` : parts.join('・')}
        onClick={hasMenu ? (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget) : undefined}
        onDelete={onDelete}
      />
      {hasMenu && (
        <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
          <ListSubheader>彙總方式</ListSubheader>
          {slot.kind === 'columns' && (
            <MenuItem selected={!entry.agg} onClick={() => choose({ agg: undefined })}>
              不彙總（顯示明細）
            </MenuItem>
          )}
          {AGGS.map((agg) => (
            <MenuItem key={agg} selected={entry.agg === agg} onClick={() => choose({ agg })}>
              {AGG_LABELS[agg]}
            </MenuItem>
          ))}
          {isCombo &&
            slot.kind === 'measures' && [
              <Divider key='d1' />,
              <ListSubheader key='mark'>圖形</ListSubheader>,
              <MenuItem
                key='bar'
                selected={entry.mark !== 'line'}
                onClick={() => choose({ mark: 'bar' })}
              >
                長條
              </MenuItem>,
              <MenuItem
                key='line'
                selected={entry.mark === 'line'}
                onClick={() => choose({ mark: 'line' })}
              >
                折線
              </MenuItem>,
              <Divider key='d2' />,
              <ListSubheader key='axis'>Y 軸</ListSubheader>,
              <MenuItem
                key='left'
                selected={entry.axis !== 'right'}
                onClick={() => choose({ axis: 'left' })}
              >
                左軸
              </MenuItem>,
              <MenuItem
                key='right'
                selected={entry.axis === 'right'}
                onClick={() => choose({ axis: 'right' })}
              >
                右軸
              </MenuItem>,
            ]}
        </Menu>
      )}
    </>
  );
}
