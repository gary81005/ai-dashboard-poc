// 每張圖右上角的漏斗按鈕：可同時對多個維度欄位篩選，每個欄位可多選值，徽章顯示生效中的篩選數。
//
// 和元件設定中的「篩選」槽位改的是同一份 widget.filters，所以會隨儀表板保存（widget 層級，ADR 0004）。

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { DataTable, Filter, Row, Widget } from '../../types/index.ts';
import { resolveField, toFieldRef } from '../../utils/fields.ts';
import { orderCategories } from '../../utils/query.ts';
import { activeFilters } from '../../utils/widgetEditing.ts';

type Props = {
  widget: Widget;
  table: DataTable;
  rows: Row[];
  onChange: (widget: Widget) => void;
};

export function WidgetFilterControl({ widget, table, rows, onChange }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = activeFilters(widget).length;
  const used = new Set(widget.filters.map((f) => f.field.header));
  const addable = table.fields.filter((f) => f.role === 'dimension' && !used.has(f.header));

  const setFilters = (filters: Filter[]) => onChange({ ...widget, filters });
  const updateValues = (index: number, values: string[]) =>
    setFilters(widget.filters.map((f, i) => (i === index ? { ...f, values } : f)));

  // Popover 雖然渲染在 portal，React 事件仍會冒泡到卡片；按鈕與 Popover 都要 stopPropagation，
  // 避免編輯模式下點篩選時誤選取卡片。
  return (
    <>
      <Tooltip title={active > 0 ? `已套用 ${active} 個篩選` : '篩選'}>
        <IconButton
          size='small'
          aria-label='篩選'
          color={active > 0 ? 'primary' : 'default'}
          onClick={(e) => {
            e.stopPropagation();
            setAnchor(e.currentTarget);
          }}
        >
          <Badge badgeContent={active} color='primary'>
            <svg aria-hidden='true' width={18} height={18}>
              <use href='/icons.svg#filter-icon' />
            </svg>
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack spacing={2} sx={{ p: 2, width: 320 }}>
          <Typography variant='subtitle2'>篩選「{widget.title || '未命名'}」</Typography>
          {widget.filters.length === 0 && (
            <Typography variant='body2' color='text.secondary'>
              還沒有篩選條件，從下方選一個欄位開始。
            </Typography>
          )}
          {widget.filters.map((filter, index) => {
            const field = resolveField(table, filter.field);
            const options = field ? orderCategories(rows, field) : [];
            return (
              <Stack
                key={filter.field.header}
                direction='row'
                spacing={1}
                sx={{ alignItems: 'flex-start' }}
              >
                <Autocomplete
                  multiple
                  size='small'
                  disableCloseOnSelect
                  limitTags={2}
                  options={options}
                  value={filter.values.map(String)}
                  onChange={(_, values) => updateValues(index, values)}
                  disabled={!field}
                  sx={{ flex: 1 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={field ? filter.field.header : `${filter.field.header}（欄位遺失）`}
                      placeholder={filter.values.length === 0 ? '全部' : undefined}
                    />
                  )}
                />
                <Button
                  size='small'
                  color='inherit'
                  sx={{ minWidth: 0, mt: 0.5 }}
                  onClick={() => setFilters(widget.filters.filter((_, i) => i !== index))}
                >
                  移除
                </Button>
              </Stack>
            );
          })}
          {addable.length > 0 && (
            <TextField
              select
              size='small'
              label='＋ 新增篩選欄位'
              value=''
              onChange={(e) => {
                const field = addable.find((f) => f.header === e.target.value);
                if (field) {
                  setFilters([
                    ...widget.filters,
                    { field: toFieldRef(field), op: 'in', values: [] },
                  ]);
                }
              }}
            >
              {addable.map((f) => (
                <MenuItem key={f.header} value={f.header}>
                  {f.header}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button
              size='small'
              disabled={active === 0}
              onClick={() => setFilters(widget.filters.map((f) => ({ ...f, values: [] })))}
            >
              清除所有篩選
            </Button>
            <Button size='small' variant='contained' onClick={() => setAnchor(null)}>
              完成
            </Button>
          </Box>
        </Stack>
      </Popover>
    </>
  );
}
