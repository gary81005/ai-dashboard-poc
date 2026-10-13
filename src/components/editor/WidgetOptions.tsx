// 元件設定中的「樣式」區：各圖表類型的變化型開關（面積、堆疊、橫式、甜甜圈），儀表圖的範圍，
// 以及排序、前 N 名、門檻上色、合計（ADR 0008）。
//
// 變化型是同一類型的選項，不是獨立的類型（ADR 0005），所以切換時不必重新拖欄位。

import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { DataTable, Field, SortOrder, Thresholds, Widget } from '../../types/index.ts';
import { resolveField } from '../../utils/fields.ts';
import { isPercent } from '../../utils/format.ts';
import { defaultThresholds } from '../../utils/thresholds.ts';

type Props = { widget: Widget; table: DataTable | undefined; onChange: (widget: Widget) => void };

type Toggle = { key: string; label: string };

// 各類型可用的開關；沒有列出的類型沒有開關。
const TOGGLES: Partial<Record<Widget['type'], Toggle[]>> = {
  line: [
    { key: 'area', label: '面積' },
    { key: 'stacked', label: '堆疊' },
  ],
  bar: [
    { key: 'stacked', label: '堆疊' },
    { key: 'horizontal', label: '橫式' },
  ],
  combo: [{ key: 'stacked', label: '長條堆疊' }],
  pie: [{ key: 'donut', label: '甜甜圈' }],
  table: [
    { key: 'totals', label: '顯示合計' },
    { key: 'highlightRows', label: '未達門檻整列標色' },
  ],
};

// 數字輸入框：空白代表使用預設值（undefined）。
function parseNumber(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

// 門檻要對照哪個欄位的格式：長條圖與 KPI 是第一個數值，表格是第一個比率欄位。
function thresholdField(widget: Widget, table: DataTable | undefined): Field | undefined {
  if (!table) return undefined;
  switch (widget.type) {
    case 'bar':
      return widget.encoding.y[0] && resolveField(table, widget.encoding.y[0].field);
    case 'kpi':
      return widget.encoding.value && resolveField(table, widget.encoding.value.field);
    case 'table':
      return widget.encoding.columns.map((c) => resolveField(table, c.field)).find((f) => f?.ratio);
    default:
      return undefined;
  }
}

export function WidgetOptions({ widget, table, onChange }: Props) {
  const toggles = TOGGLES[widget.type];
  const options = ('options' in widget ? widget.options : undefined) as
    Record<string, unknown> | undefined;

  // 關閉的開關從 options 移除，而不是存成 false，讓設定 JSON 保持精簡。
  const setOption = (key: string, value: unknown) => {
    const next: Record<string, unknown> = { ...options };
    if (value === undefined || value === false) delete next[key];
    else next[key] = value;
    onChange({ ...widget, options: next } as Widget);
  };

  if (widget.type === 'gauge') {
    return (
      <Stack spacing={1}>
        <Typography variant='caption' sx={{ fontWeight: 600 }}>
          範圍
        </Typography>
        <Typography variant='caption' color='text.secondary'>
          留空時：比率欄位為 0～100%，其他為 0 到目前值 × 1.5
        </Typography>
        <Stack direction='row' spacing={1}>
          <TextField
            size='small'
            label='最小值'
            type='number'
            value={widget.options?.min ?? ''}
            onChange={(e) => setOption('min', parseNumber(e.target.value))}
          />
          <TextField
            size='small'
            label='最大值'
            type='number'
            value={widget.options?.max ?? ''}
            onChange={(e) => setOption('max', parseNumber(e.target.value))}
          />
        </Stack>
      </Stack>
    );
  }

  const sortable = widget.type === 'bar' || widget.type === 'table';
  const thresholdable = widget.type === 'bar' || widget.type === 'kpi' || widget.type === 'table';
  if (!toggles && !sortable && !thresholdable) return null;

  const field = thresholdField(widget, table);
  const percent = field ? isPercent(field) : false;

  return (
    <Stack spacing={1.5}>
      <Typography variant='caption' sx={{ fontWeight: 600 }}>
        樣式
      </Typography>
      {toggles && (
        <Stack direction='row' sx={{ flexWrap: 'wrap' }}>
          {toggles.map((toggle) => (
            <FormControlLabel
              key={toggle.key}
              label={toggle.label}
              control={
                <Switch
                  size='small'
                  checked={options?.[toggle.key] === true}
                  onChange={(_, checked) => setOption(toggle.key, checked)}
                />
              }
            />
          ))}
        </Stack>
      )}
      {sortable && (
        <Stack direction='row' spacing={1}>
          <TextField
            select
            size='small'
            label='排序'
            value={(options?.sort as SortOrder | undefined) ?? ''}
            onChange={(e) => setOption('sort', e.target.value || undefined)}
            sx={{ flex: 1 }}
          >
            <MenuItem value=''>資料順序</MenuItem>
            <MenuItem value='desc'>依第一個數值由大到小</MenuItem>
            <MenuItem value='asc'>依第一個數值由小到大</MenuItem>
          </TextField>
          {widget.type === 'bar' && (
            <TextField
              size='small'
              label='只顯示前 N 個'
              type='number'
              value={widget.options?.limit ?? ''}
              onChange={(e) => {
                const limit = parseNumber(e.target.value);
                setOption('limit', limit && limit > 0 ? Math.floor(limit) : undefined);
              }}
              sx={{ width: 120 }}
            />
          )}
        </Stack>
      )}
      {thresholdable && (
        <ThresholdEditor
          thresholds={options?.thresholds as Thresholds | undefined}
          percent={percent}
          hint={
            widget.type === 'table'
              ? '套用在比率欄位（達成率、覆蓋率等）'
              : widget.type === 'bar'
                ? '長條依數值變色'
                : '數字依值變色並顯示狀態'
          }
          onChange={(thresholds) => setOption('thresholds', thresholds)}
        />
      )}
    </Stack>
  );
}

type ThresholdEditorProps = {
  thresholds: Thresholds | undefined;
  percent: boolean;
  hint: string;
  onChange: (thresholds: Thresholds | undefined) => void;
};

// 門檻設定：開關 + 黃、綠兩個起點。比率欄位以百分比輸入，存成小數（80 → 0.8）。
function ThresholdEditor({ thresholds, percent, hint, onChange }: ThresholdEditorProps) {
  const scale = percent ? 100 : 1;
  const show = (v: number) => String(Number((v * scale).toFixed(4)));
  const update = (key: keyof Thresholds, text: string) => {
    const value = parseNumber(text);
    if (thresholds && value !== undefined) onChange({ ...thresholds, [key]: value / scale });
  };
  const adornment = percent
    ? { input: { endAdornment: <InputAdornment position='end'>%</InputAdornment> } }
    : undefined;

  return (
    <Stack spacing={1}>
      <FormControlLabel
        label='依門檻上色'
        control={
          <Switch
            size='small'
            checked={thresholds !== undefined}
            onChange={(_, checked) => onChange(checked ? defaultThresholds(percent) : undefined)}
          />
        }
      />
      {thresholds && (
        <>
          <Typography variant='caption' color='text.secondary'>
            {hint}：低於黃色起點為紅，達到綠色起點為綠
          </Typography>
          <Stack direction='row' spacing={1}>
            <TextField
              size='small'
              label='黃色起點'
              type='number'
              defaultValue={show(thresholds.warning)}
              onChange={(e) => update('warning', e.target.value)}
              slotProps={adornment}
            />
            <TextField
              size='small'
              label='綠色起點'
              type='number'
              defaultValue={show(thresholds.success)}
              onChange={(e) => update('success', e.target.value)}
              slotProps={adornment}
            />
          </Stack>
        </>
      )}
    </Stack>
  );
}
