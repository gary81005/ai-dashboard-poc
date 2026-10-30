// 推薦圖表（ADR 0010 §7 ④）：欄位清單勾選欄位後，在右側面板列出 1～4 個候選，
// 每張卡片有用實際資料畫的縮圖、推薦理由，第一張標示「最推薦」。
// 點卡片新增這個元件，放在版面最下方並選取它，接著可以在元件設定面板微調。
//
// 規則在 utils/recommend.ts；縮圖直接用 computeWidget + WidgetBody 畫整張表的資料（不套用篩選）。

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { WIDGET_TYPE_LABELS } from '../../constants/widgetTypes.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard, Dataset, DatasetRows, Widget } from '../../types/index.ts';
import { computeWidget } from '../../utils/computeWidget.ts';
import { profilesOf } from '../../utils/fieldKinds.ts';
import { findTable } from '../../utils/fields.ts';
import { createId } from '../../utils/ids.ts';
import { recommend } from '../../utils/recommend.ts';
import { nextLayoutItem } from '../../utils/widgetEditing.ts';
import { WidgetBody } from '../widgets/WidgetBody.tsx';

// 欄位清單上勾選的欄位：只能來自同一張資料表。
export type CheckedFields = { table: string; headers: string[] };

type Props = {
  dashboard: Dashboard;
  dataset: Dataset;
  rows: DatasetRows;
  checked: CheckedFields;
  onClear: () => void;
};

export function RecommendPanel({ dashboard, dataset, rows, checked, onClear }: Props) {
  const addWidget = useAppStore((s) => s.addWidget);
  const selectWidget = useUiStore((s) => s.selectWidget);
  const table = findTable(dataset, checked.table);
  const tableRows = table ? rows[table.key] : undefined;
  const result =
    table && tableRows
      ? recommend(table, tableRows, profilesOf(table, tableRows), checked.headers)
      : undefined;

  const add = (widget: Widget) => {
    const next = { ...widget, id: createId('w') };
    addWidget(dashboard.id, next, nextLayoutItem(dashboard.layout, next));
    selectWidget(next.id);
    onClear();
  };

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction='row' sx={{ alignItems: 'center' }}>
          <Typography variant='subtitle1' component='h3' sx={{ fontWeight: 600, flex: 1 }}>
            推薦圖表
          </Typography>
          <Button size='small' onClick={onClear}>
            清除勾選
          </Button>
        </Stack>
        <Typography variant='caption' color='text.secondary'>
          {table?.sheetName}：{checked.headers.join('、')}。點卡片新增到儀表板最下方。
        </Typography>
        {result?.notice && <Alert severity='info'>{result.notice}</Alert>}
        {table &&
          tableRows &&
          result?.recommendations.map(({ widget, reason, best }, index) => (
            <Card key={index} variant='outlined'>
              <CardActionArea onClick={() => add(widget)} sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                  <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                    {best && <Chip size='small' color='primary' label='最推薦' />}
                    <Typography variant='body2' sx={{ fontWeight: 600 }}>
                      {WIDGET_TYPE_LABELS[widget.type]}
                    </Typography>
                    <Typography variant='caption' color='text.secondary' noWrap>
                      {widget.title}
                    </Typography>
                  </Stack>
                  {/* 縮圖只供預覽：不接收滑鼠事件，點擊一律交給卡片。 */}
                  <Box
                    sx={{
                      height: 150,
                      display: 'flex',
                      flexDirection: 'column',
                      pointerEvents: 'none',
                    }}
                    aria-hidden='true'
                  >
                    {/* 推薦不會產生文字元件；型別上仍要排除。 */}
                    {widget.type !== 'text' && (
                      <WidgetBody
                        widget={widget}
                        result={computeWidget(widget, { table, rows: tableRows, filters: [] })}
                      />
                    )}
                  </Box>
                  <Typography variant='caption' color='text.secondary'>
                    {reason}
                  </Typography>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
      </Stack>
    </Paper>
  );
}
