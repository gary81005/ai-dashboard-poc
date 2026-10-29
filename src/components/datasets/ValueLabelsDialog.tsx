// 一個欄位的值標籤設定（ADR 0011）：列出欄位實際出現的每個值，各自輸入要顯示的文字。
//
// 只改顯示、不改資料；留空的值照常顯示原始值。「顯示值標籤」關掉時保留對照但不套用，
// 所有儀表板都改回原始值；單一元件要顯示原始值，在元件設定的樣式區切換。

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { FieldPatch } from '../../store/appStore.ts';
import type { Field } from '../../types/index.ts';

type Props = {
  field: Field;
  // 依 orderCategories 順序的原始值（不含空白）。
  values: readonly string[];
  onClose: () => void;
  onSave: (patch: FieldPatch) => void;
};

export function ValueLabelsDialog({ field, values, onClose, onSave }: Props) {
  // 資料裡已經沒有、但對照裡還有的值（例如自動套用的 0 → 否，而資料只有 1）也列出來。
  const keys = [
    ...values,
    ...Object.keys(field.valueLabels ?? {}).filter((key) => !values.includes(key)),
  ];
  const [labels, setLabels] = useState<Record<string, string>>(field.valueLabels ?? {});
  const [enabled, setEnabled] = useState(field.showValueLabels !== false);

  const handleSave = () => {
    const filled = Object.fromEntries(
      Object.entries(labels)
        .map(([key, label]) => [key, label.trim()] as const)
        .filter(([key, label]) => label !== '' && label !== key),
    );
    const empty = Object.keys(filled).length === 0;
    onSave({ valueLabels: empty ? null : filled, ...(empty ? {} : { showValueLabels: enabled }) });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth='xs'>
      <DialogTitle>「{field.header}」的值標籤</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant='body2' color='text.secondary'>
            只改變圖表、篩選和表格上顯示的文字，資料本身、排序與篩選條件都不變。留空的值顯示原始值。
          </Typography>
          <FormControlLabel
            label='顯示值標籤'
            control={<Switch checked={enabled} onChange={(_, checked) => setEnabled(checked)} />}
          />
          <Stack spacing={1}>
            {keys.map((key) => (
              <Stack key={key} direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography
                  sx={{ fontFamily: 'monospace', minWidth: 72, textAlign: 'right' }}
                  noWrap
                  title={key}
                >
                  {key}
                </Typography>
                <Typography color='text.secondary' aria-hidden='true'>
                  →
                </Typography>
                <TextField
                  size='small'
                  fullWidth
                  disabled={!enabled}
                  placeholder={key}
                  aria-label={`${key} 的標籤`}
                  value={labels[key] ?? ''}
                  onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                />
              </Stack>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color='error' onClick={() => setLabels({})} sx={{ mr: 'auto' }}>
          全部清除
        </Button>
        <Button onClick={onClose}>取消</Button>
        <Button variant='contained' onClick={handleSave}>
          儲存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
