// 欄位健檢的建議清單（ADR 0010 §7 ③）：每條附「套用」與「忽略」，另有「全部套用」。
// 兩者都記成使用者覆寫（store 的 patchField），該欄位不再出現在清單上。忽略會維持目前的值；
// 忽略比率建議代表「不是比率」（例如「平均金額」），之後也不再當成推測比率、改回預設加總。
// 下方另列上傳時自動套用值標籤的欄位（ADR 0011）：可以逐一改回原始值，或按「知道了」全部保留。

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { updateField, updateFields } from '../../services/datasetService.ts';
import type { AutoLabeled, HealthKind, HealthSuggestion } from '../../utils/fieldHealth.ts';

const DISMISS_HINTS: Record<HealthKind, string> = {
  role: '維持數值，不再提醒',
  flag: '維持數值，不再提醒',
  ratio: '不是比率：當成一般數值，預設加總、顯示合計，不再提醒',
};

type Props = { datasetId: string; suggestions: HealthSuggestion[]; autoLabeled: AutoLabeled[] };

export function FieldHealth({ datasetId, suggestions, autoLabeled }: Props) {
  return (
    <>
      {suggestions.length === 0 ? (
        <Typography variant='caption' color='text.secondary'>
          欄位健檢：沒有需要調整的欄位
        </Typography>
      ) : (
        <Suggestions datasetId={datasetId} suggestions={suggestions} />
      )}
      {autoLabeled.length > 0 && <AutoLabeledNotice datasetId={datasetId} fields={autoLabeled} />}
    </>
  );
}

function Suggestions({ datasetId, suggestions }: Omit<Props, 'autoLabeled'>) {
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

type NoticeProps = { datasetId: string; fields: AutoLabeled[] };

// 上傳時自動套用值標籤的欄位。「改回原始值」停用這個欄位的標籤（對照保留，可在欄位的值標籤再開啟）；
// 「知道了」把全部記成使用者確認過，之後不再列出。
function AutoLabeledNotice({ datasetId, fields }: NoticeProps) {
  return (
    <Alert
      severity='success'
      action={
        <Button
          color='inherit'
          size='small'
          onClick={() =>
            updateFields(
              datasetId,
              fields.map((f) => ({
                tableKey: f.tableKey,
                header: f.header,
                patch: { showValueLabels: true },
              })),
            )
          }
        >
          知道了
        </Button>
      }
    >
      <AlertTitle>已自動套用顯示名稱：{fields.length} 個 0/1 欄位</AlertTitle>
      <Typography variant='body2' sx={{ mb: 0.75 }}>
        圖表與篩選顯示標籤，平均顯示成「是 35%」、加總顯示成「是 120 筆」；資料本身不變。
      </Typography>
      <Stack spacing={0.5}>
        {fields.map((f) => (
          <Stack
            key={f.id}
            direction='row'
            useFlexGap
            sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1 }}
          >
            <Typography variant='body2' sx={{ flex: '1 1 280px', minWidth: 0 }}>
              <Typography component='span' variant='body2' color='text.secondary'>
                {f.sheetName}・
              </Typography>
              <strong>「{f.header}」</strong>
              {f.labels}
            </Typography>
            <Button
              size='small'
              color='inherit'
              onClick={() =>
                updateField(datasetId, f.tableKey, f.header, { showValueLabels: false })
              }
            >
              改回原本的值
            </Button>
          </Stack>
        ))}
      </Stack>
    </Alert>
  );
}
