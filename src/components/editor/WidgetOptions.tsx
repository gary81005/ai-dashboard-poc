// 元件設定中的「樣式」區：各圖表類型的變化型開關（面積、堆疊、橫式、甜甜圈），以及儀表圖的範圍。
//
// 變化型是同一類型的選項，不是獨立的類型（ADR 0005），所以切換時不必重新拖欄位。

import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Widget } from '../../types/index.ts';

type Props = { widget: Widget; onChange: (widget: Widget) => void };

type Toggle = { key: string; label: string };

// 各類型可用的開關；沒有列出的類型沒有樣式選項。
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
};

// 數字輸入框：空白代表使用預設範圍（undefined）。
function parseBound(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function WidgetOptions({ widget, onChange }: Props) {
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
            onChange={(e) => setOption('min', parseBound(e.target.value))}
          />
          <TextField
            size='small'
            label='最大值'
            type='number'
            value={widget.options?.max ?? ''}
            onChange={(e) => setOption('max', parseBound(e.target.value))}
          />
        </Stack>
      </Stack>
    );
  }

  if (!toggles) return null;
  return (
    <Stack spacing={0.5}>
      <Typography variant='caption' sx={{ fontWeight: 600 }}>
        樣式
      </Typography>
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
    </Stack>
  );
}
