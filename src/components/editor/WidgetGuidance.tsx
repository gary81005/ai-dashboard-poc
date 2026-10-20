// 元件設定面板最上方的「下一步」提示與警告（ADR 0010 §7 ⑤），只在編輯模式出現。
// 有警告時附「改用建議」，套用目前欄位的第一推薦（取代槽位與樣式，保留標題、說明與篩選）；
// 比率相關的提示附「到資料集頁標記」。

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { WIDGET_TYPE_LABELS } from '../../constants/widgetTypes.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Widget } from '../../types/index.ts';
import type { WidgetCheck } from '../../utils/widgetChecks.ts';

type Props = { check: WidgetCheck; onChange: (widget: Widget) => void };

export function WidgetGuidance({ check, onChange }: Props) {
  const navigate = useUiStore((s) => s.navigate);
  const { nextStep, warnings, fix } = check;
  if (!nextStep && warnings.length === 0) return null;
  const problems = warnings.filter((w) => w.level === 'warning');
  const tips = warnings.filter((w) => w.level === 'tip');

  return (
    <Stack spacing={1}>
      {nextStep && <Alert severity='info'>{nextStep}</Alert>}
      {problems.length > 0 && (
        <Alert
          severity='warning'
          action={
            fix && (
              <Button color='inherit' size='small' onClick={() => onChange(fix)}>
                改用{WIDGET_TYPE_LABELS[fix.type]}
              </Button>
            )
          }
        >
          {problems.map((w) => (
            <div key={w.id}>{w.message}</div>
          ))}
        </Alert>
      )}
      {tips.length > 0 && (
        <Alert
          severity='info'
          variant='outlined'
          action={
            tips.some((w) => w.markRatio) && (
              <Button color='inherit' size='small' onClick={() => navigate('datasets')}>
                到資料集頁標記
              </Button>
            )
          }
        >
          {tips.map((w) => (
            <div key={w.id}>{w.message}</div>
          ))}
        </Alert>
      )}
    </Stack>
  );
}
