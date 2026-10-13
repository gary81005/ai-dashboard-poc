// 單一儀表板頁，分成兩種模式：
//   - 檢視模式：只顯示格線上的 widget（DashboardGrid），可切換資料來源、匯出 JSON
//   - 編輯模式：EditWorkspace 三欄版面 = 格線｜欄位清單｜元件設定，可拖拉欄位、新增與移動元件
//
// 兩種模式下的修改（含檢視模式的篩選、切換資料來源）都先只存在記憶體，按「儲存」才寫進 Supabase
// （ADR 0007）。換頁、登出時的提醒由 uiStore.leave 處理，關閉或重新整理分頁時用 beforeunload 提醒。
//
// 結構：DashboardPage（標題列與對話框）→ DashboardContent（等資料列載入）→ DashboardGrid 或 EditWorkspace。

import { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DashboardFilterBar } from '../components/dashboard/DashboardFilterBar.tsx';
import { DashboardGrid } from '../components/dashboard/DashboardGrid.tsx';
import { RebindDialog } from '../components/dashboard/RebindDialog.tsx';
import { AddWidgetButton } from '../components/editor/AddWidgetButton.tsx';
import { FieldPanel } from '../components/editor/FieldPanel.tsx';
import { WidgetEditor } from '../components/editor/WidgetEditor.tsx';
import { useDatasetRows } from '../hooks/useDatasetRows.ts';
import { saveActiveDashboard } from '../services/dashboardService.ts';
import { downloadJson } from '../services/download.ts';
import { useAppStore } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import type { Dashboard, Dataset, DatasetRows } from '../types/index.ts';
import { buildExport } from '../utils/dashboardTransfer.ts';

export function DashboardPage() {
  const navigate = useUiStore((s) => s.navigate);
  const editing = useUiStore((s) => s.editing);
  const setEditing = useUiStore((s) => s.setEditing);
  const renameDashboard = useAppStore((s) => s.renameDashboard);
  const dashboard = useAppStore((s) => s.dashboards.find((d) => d.id === s.activeDashboardId));
  const dataset = useAppStore((s) => s.datasets.find((d) => d.id === dashboard?.datasetId));
  const dirty = useAppStore((s) => s.draftBase !== null);
  const discardChanges = useAppStore((s) => s.discardChanges);
  const notify = useUiStore((s) => s.notify);
  const [rebinding, setRebinding] = useState(false);
  const saving = useAppStore((s) => s.saving);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const handleSave = async () => {
    try {
      await saveActiveDashboard();
    } catch (error) {
      notify({
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!dashboard) {
    return (
      <Alert
        severity='info'
        action={<Button onClick={() => navigate('dashboards')}>回到清單</Button>}
      >
        找不到這個儀表板。
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
        <Button onClick={() => navigate('dashboards')}>← 儀表板清單</Button>
        {editing ? (
          <TextField
            size='small'
            label='儀表板名稱'
            value={dashboard.name}
            onChange={(e) => renameDashboard(dashboard.id, e.target.value)}
            sx={{ flex: 1, maxWidth: 420 }}
          />
        ) : (
          <Typography variant='h5' component='h2' noWrap>
            {dashboard.name}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {dataset && <Chip variant='outlined' label={`資料集：${dataset.name}`} />}
        {!editing && <Button onClick={() => setRebinding(true)}>切換資料來源</Button>}
        {!editing && (
          <Button
            onClick={() =>
              downloadJson(`${dashboard.name}.dashboard.json`, buildExport(dashboard, dataset))
            }
          >
            匯出 JSON
          </Button>
        )}
        {dataset && editing && <AddWidgetButton dashboard={dashboard} />}
        {dirty && <Chip color='warning' variant='outlined' label='未儲存' />}
        {dirty && (
          <Button color='inherit' disabled={saving} onClick={discardChanges}>
            捨棄變更
          </Button>
        )}
        <Button
          variant='contained'
          disabled={!dirty}
          loading={saving}
          onClick={() => void handleSave()}
        >
          儲存
        </Button>
        {dataset && (
          <Button variant={editing ? 'contained' : 'outlined'} onClick={() => setEditing(!editing)}>
            {editing ? '完成編輯' : '編輯'}
          </Button>
        )}
      </Stack>
      {dataset ? (
        <DashboardContent dashboard={dashboard} dataset={dataset} editing={editing} />
      ) : (
        <Alert
          severity='error'
          action={<Button onClick={() => setRebinding(true)}>切換資料來源</Button>}
        >
          資料集遺失：這個儀表板使用的資料集已被刪除。
        </Alert>
      )}
      <RebindDialog dashboard={dashboard} open={rebinding} onClose={() => setRebinding(false)} />
    </Stack>
  );
}

type ContentProps = { dashboard: Dashboard; dataset: Dataset; editing: boolean };

// 依資料列的載入狀態顯示對應畫面；資料列從 Supabase 分頁載入，第一次開啟需要等待。
function DashboardContent({ dashboard, dataset, editing }: ContentProps) {
  const entry = useDatasetRows(dataset);
  const loadRows = useRowsStore((s) => s.load);

  switch (entry.status) {
    case 'loading':
      return (
        <Stack sx={{ alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Stack>
      );
    case 'error':
      return (
        <Alert
          severity='error'
          action={<Button onClick={() => void loadRows(dataset)}>重試</Button>}
        >
          讀取資料失敗：{entry.message}
        </Alert>
      );
    case 'ready':
      return editing ? (
        <EditWorkspace dashboard={dashboard} dataset={dataset} rows={entry.rows} />
      ) : dashboard.widgets.length === 0 ? (
        <Alert severity='info'>這個儀表板還沒有元件，點右上角的「編輯」開始新增。</Alert>
      ) : (
        <Stack spacing={2}>
          <DashboardFilterBar
            dashboard={dashboard}
            dataset={dataset}
            rows={entry.rows}
            editing={false}
          />
          <DashboardGrid dashboard={dashboard} dataset={dataset} rows={entry.rows} />
        </Stack>
      );
  }
}

// 兩側面板固定在畫面上（sticky），內容太長時各自捲動，拖拉時不必捲動整頁。
const sidePanel = {
  position: 'sticky',
  top: 88,
  maxHeight: 'calc(100svh - 104px)',
  overflowY: 'auto',
} as const;

// 編輯模式的工作區。DndProvider 只包在這裡，因為只有編輯模式需要拖放欄位。
function EditWorkspace({
  dashboard,
  dataset,
  rows,
}: {
  dashboard: Dashboard;
  dataset: Dataset;
  rows: DatasetRows;
}) {
  const selectedWidgetId = useUiStore((s) => s.selectedWidgetId);
  const selectedWidget = dashboard.widgets.find((w) => w.id === selectedWidgetId);

  return (
    <DndProvider backend={HTML5Backend}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          // 欄位清單緊貼在元件設定旁邊，拖拉距離最短。
          gridTemplateColumns: 'minmax(0, 1fr) 220px 340px',
          alignItems: 'start',
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <DashboardFilterBar dashboard={dashboard} dataset={dataset} rows={rows} editing />
          {dashboard.widgets.length === 0 ? (
            <Alert severity='info'>點右上角的「＋ 新增元件」加入第一個元件。</Alert>
          ) : (
            <DashboardGrid dashboard={dashboard} dataset={dataset} rows={rows} />
          )}
        </Stack>
        <Box sx={sidePanel}>
          <FieldPanel dataset={dataset} selectedWidget={selectedWidget} />
        </Box>
        <Box sx={sidePanel}>
          {selectedWidget ? (
            <WidgetEditor
              key={selectedWidget.id}
              dashboard={dashboard}
              widget={selectedWidget}
              dataset={dataset}
              rows={rows}
            />
          ) : (
            <Paper variant='outlined' sx={{ p: 2 }}>
              <Typography variant='body2' color='text.secondary'>
                點選一個元件來設定欄位與樣式，或用「＋
                新增元件」加入新的元件。拖動元件標題可以移動位置，拖動右下角可以調整大小。
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>
    </DndProvider>
  );
}
