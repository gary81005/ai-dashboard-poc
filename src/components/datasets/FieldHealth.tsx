// 欄位健檢的建議清單（ADR 0010 §7 ③）：每條附「套用」與「忽略」，另有「全部套用」。
// 兩者都記成使用者覆寫（store 的 patchField），該欄位不再出現在清單上。忽略會維持目前的值；
// 忽略比率建議代表「不是比率」（例如「平均金額」），之後也不再當成推測比率、改回預設加總。

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { updateField, updateFields } from '../../services/datasetService.ts';
import type { HealthKind, HealthSuggestion } from '../../utils/fieldHealth.ts';

const DISMISS_HINTS: Record<HealthKind, string> = {
  role: '維持量值，不再提醒',
  flag: '維持量值，不再提醒',
  ratio: '不是比率：當成一般量值，預設加總、顯示合計，不再提醒',
};

type Props = { datasetId: string; suggestions: HealthSuggestion[] };

export function FieldHealth({ datasetId, suggestions }: Props) {
  if (suggestions.length === 0) {
    return (
      <Typography variant='caption' color='text.secondary'>
        欄位健檢：沒有需要調整的欄位
      </Typography>
    );
  }
  return (
    <Alert
      severity='info'
      action={
        suggestions.length > 1 && (
          <Button color='inherit' size='small' onClick={() => updateFields(datasetId, suggestions)}>
            全部套用
          </Button>
        )
      }
    >
      <AlertTitle>欄位健檢：{suggestions.length} 項建議</AlertTitle>
      <Stack spacing={0.75}>
        {suggestions.map((s) => (
          <Stack
            key={s.id}
            direction='row'
            useFlexGap
            sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}
          >
            <Typography variant='body2' sx={{ flex: '1 1 280px', minWidth: 0 }}>
              <Typography component='span' variant='body2' color='text.secondary'>
                {s.sheetName}・
              </Typography>
              <strong>「{s.header}」</strong>
              {s.message}
            </Typography>
            <Stack direction='row'>
              <Button
                size='small'
                color='inherit'
                onClick={() => updateField(datasetId, s.tableKey, s.header, s.patch)}
              >
                套用
              </Button>
              <Tooltip title={DISMISS_HINTS[s.kind]}>
                <Button
                  size='small'
                  color='inherit'
                  onClick={() => updateField(datasetId, s.tableKey, s.header, s.dismiss)}
                  sx={{ opacity: 0.7 }}
                >
                  忽略
                </Button>
              </Tooltip>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Alert>
  );
}
