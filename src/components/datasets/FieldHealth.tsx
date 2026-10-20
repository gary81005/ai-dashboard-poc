// 欄位健檢的建議清單（ADR 0010 §7 ③）：每條附「套用」，另有「全部套用」。
// 套用後記成使用者覆寫（store 的 patchField），該欄位不再出現在清單上；不想套用的建議，
// 可以到下方的欄位表格手動切換一次角色或比率，同樣會記成覆寫。

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { updateField, updateFields } from '../../services/datasetService.ts';
import type { HealthSuggestion } from '../../utils/fieldHealth.ts';

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
            <Button
              size='small'
              color='inherit'
              onClick={() => updateField(datasetId, s.tableKey, s.header, s.patch)}
            >
              套用
            </Button>
          </Stack>
        ))}
      </Stack>
    </Alert>
  );
}
