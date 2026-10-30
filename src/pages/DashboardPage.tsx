// 單一儀表板頁，分成兩種模式：
//   - 檢視模式：只顯示格線上的 widget（DashboardGrid），可切換資料來源、匯出 JSON、分享（ADR 0012）
//   - 編輯模式：EditWorkspace 三欄版面 = 格線｜欄位清單｜元件設定，可拖拉欄位、新增與移動元件
//
// 兩種模式下的修改（含檢視模式的篩選、切換資料來源）都先只存在記憶體，按「儲存」才寫進 Supabase
// （ADR 0007）。換頁、登出時的提醒由 uiStore.leave 處理，關閉或重新整理分頁時用 beforeunload 提醒。
//
// 結構：DashboardPage（標題列與對話框）→ DashboardContent（等資料列載入）→ DashboardGrid 或 EditWorkspace。
//
// 響應式（ADR 0009）：編輯模式需要寬度 1200px 以上（lg），更窄時「編輯」按鈕停用，編輯中變窄就自動回到
// 檢視模式（未儲存的變更仍保留）。md 以下，標題列換行，「分享」「切換資料來源」「匯出 JSON」收進「更多」選單。

import { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useContainerWidth } from 'react-grid-layout';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';
import { DashboardFilterBar } from '../components/dashboard/DashboardFilterBar.tsx';
import { DashboardGrid } from '../components/dashboard/DashboardGrid.tsx';
import { RebindDialog } from '../components/dashboard/RebindDialog.tsx';
import { ShareDialog } from '../components/dashboard/ShareDialog.tsx';
import { SuggestDashboardButton } from '../components/dashboard/SuggestDashboardButton.tsx';
import { AddWidgetButton } from '../components/editor/AddWidgetButton.tsx';
import { FieldPanel } from '../components/editor/FieldPanel.tsx';
import { PanelResizer } from '../components/editor/PanelResizer.tsx';
import { RecommendPanel } from '../components/editor/RecommendPanel.tsx';
import type { CheckedFields } from '../components/editor/RecommendPanel.tsx';
import { WidgetEditor } from '../components/editor/WidgetEditor.tsx';
import { useDatasetRows } from '../hooks/useDatasetRows.ts';
import { saveActiveDashboard } from '../services/dashboardService.ts';
import { downloadJson } from '../services/download.ts';
import { useAppStore } from '../store/appStore.ts';
import { useRowsStore } from '../store/rowsStore.ts';
import { DEFAULT_PANEL_WIDTHS, useUiStore } from '../store/uiStore.ts';
import type { Dashboard, Dataset, DatasetRows } from '../types/index.ts';
import { buildExport } from '../utils/dashboardTransfer.ts';
import { PANEL_MIN, RESIZER_WIDTH, fitPanels, maxPanelWidth } from '../utils/panelLayout.ts';

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
  const [sharing, setSharing] = useState(false);
  const saving = useAppStore((s) => s.saving);
  const wide = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'), { noSsr: true });
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'), { noSsr: true });

  // 編輯中把視窗縮窄（或平板轉成直向）時回到檢視模式；修改仍在 draftBase，不會遺失。
  useEffect(() => {
    if (editing && !wide) setEditing(false);
  }, [editing, wide, setEditing]);

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

  const exportJson = () =>
    downloadJson(`${dashboard.name}.dashboard.json`, buildExport(dashboard, dataset));

  return (
    <Stack spacing={2}>
      <Stack
        direction='row'
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap', gap: { xs: 1, md: 2 } }}
      >
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
          <Typography
            variant='h5'
            component='h2'
            noWrap
            title={dashboard.name}
            sx={{ flex: '1 1 160px', minWidth: 0, fontSize: { xs: '1.25rem', sm: undefined } }}
          >
            {dashboard.name}
          </Typography>
        )}
        {dataset && (
          <Chip
            variant='outlined'
            label={`資料集：${dataset.name}`}
            sx={{ display: { xs: 'none', md: 'inline-flex' }, maxWidth: 280 }}
          />
        )}
        {!editing &&
          (compact ? (
            <MoreMenu
              items={[
                { label: '分享', onClick: () => setSharing(true) },
                { label: '切換資料來源', onClick: () => setRebinding(true) },
                { label: '匯出 JSON', onClick: exportJson },
              ]}
            />
          ) : (
            <>
              <Button onClick={() => setSharing(true)}>分享</Button>
              <Button onClick={() => setRebinding(true)}>切換資料來源</Button>
              <Button onClick={exportJson}>匯出 JSON</Button>
            </>
          ))}
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
        {dataset &&
          (editing || wide ? (
            <Button
              variant={editing ? 'contained' : 'outlined'}
              onClick={() => setEditing(!editing)}
            >
              {editing ? '完成編輯' : '編輯'}
            </Button>
          ) : (
            <Tooltip title='編輯需要寬度 1200px 以上的螢幕，請放大視窗或改用電腦'>
              {/* 停用的按鈕不會觸發滑鼠事件，Tooltip 要包一層 span 才會顯示。 */}
              <span>
                <Button variant='outlined' disabled>
                  編輯
                </Button>
              </span>
            </Tooltip>
          ))}
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
      {sharing && (
        <ShareDialog dashboard={dashboard} dataset={dataset} onClose={() => setSharing(false)} />
      )}
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
        <Alert
          severity='info'
          action={
            <SuggestDashboardButton dashboard={dashboard} dataset={dataset} rows={entry.rows} />
          }
        >
          這個儀表板還沒有元件，點右上角的「編輯」開始新增，或依資料自動產生建議內容。
        </Alert>
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
// 欄位清單與元件設定的寬度可以用中間的把手調整（PanelResizer），也可以向右收合成窄條，
// 讓儀表板區域變大（格線寬度不到 900px 時元件不能移動，見 ADR 0009）。寬度與收合狀態記在 uiStore，
// 實際顯示的寬度再依工作區目前的寬度限制（utils/panelLayout.ts），縮小視窗時不會把儀表板擠到零寬。
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
  const panelWidths = useUiStore((s) => s.panelWidths);
  const setPanelWidth = useUiStore((s) => s.setPanelWidth);
  const collapsed = useUiStore((s) => s.collapsedPanels);
  const setPanelCollapsed = useUiStore((s) => s.setPanelCollapsed);
  // 工作區的寬度（跟著視窗與側邊欄變化）；量到之前先不限制。
  const { width: workspaceWidth, containerRef, mounted } = useContainerWidth();
  const widths = fitPanels(panelWidths, collapsed, mounted ? workspaceWidth : Infinity);
  // 欄位清單上勾選的欄位（ADR 0010 §7 ④）：只能來自同一張資料表，勾了別張表的欄位就重新開始。
  const [checked, setChecked] = useState<CheckedFields | null>(null);
  // 勾選時右側面板顯示推薦；在格線上點選另一個元件時清除勾選，右側面板改回元件設定。
  const [lastSelectedId, setLastSelectedId] = useState(selectedWidgetId);
  if (selectedWidgetId !== lastSelectedId) {
    setLastSelectedId(selectedWidgetId);
    if (selectedWidgetId) setChecked(null);
  }
  const toggleField = (table: string, header: string) => {
    // 推薦卡片顯示在元件設定的位置，收合著就看不到。
    if (collapsed.editor) setPanelCollapsed('editor', false);
    if (checked?.table !== table) {
      setChecked({ table, headers: [header] });
      return;
    }
    const headers = checked.headers.includes(header)
      ? checked.headers.filter((h) => h !== header)
      : [...checked.headers, header];
    setChecked(headers.length > 0 ? { table, headers } : null);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Box
        ref={containerRef}
        sx={{
          display: 'grid',
          rowGap: 2,
          // 欄位清單緊貼在元件設定旁邊，拖拉距離最短。兩個窄欄是調整寬度的把手，同時當作間距。
          gridTemplateColumns: `minmax(0, 1fr) ${RESIZER_WIDTH}px ${widths.fields}px ${RESIZER_WIDTH}px ${widths.editor}px`,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <DashboardFilterBar dashboard={dashboard} dataset={dataset} rows={rows} editing />
          {dashboard.widgets.length === 0 ? (
            <Alert
              severity='info'
              action={
                <SuggestDashboardButton dashboard={dashboard} dataset={dataset} rows={rows} />
              }
            >
              點右上角的「＋ 新增元件」加入第一個元件，或依資料自動產生建議內容。
            </Alert>
          ) : (
            <DashboardGrid dashboard={dashboard} dataset={dataset} rows={rows} />
          )}
        </Stack>
        {collapsed.fields ? (
          <Box />
        ) : (
          <PanelResizer
            label='調整欄位清單寬度'
            width={widths.fields}
            min={PANEL_MIN.fields}
            defaultWidth={DEFAULT_PANEL_WIDTHS.fields}
            maxWidth={() => maxPanelWidth(workspaceWidth, widths.editor)}
            onChange={(width) => setPanelWidth('fields', width)}
            collapseLabel='收合欄位清單'
            onCollapse={() => setPanelCollapsed('fields', true)}
          />
        )}
        {collapsed.fields ? (
          <CollapsedPanel label='欄位清單' onExpand={() => setPanelCollapsed('fields', false)} />
        ) : (
          <Box sx={sidePanel}>
            <FieldPanel
              dataset={dataset}
              rows={rows}
              selectedWidget={selectedWidget}
              checked={checked}
              onToggle={toggleField}
            />
          </Box>
        )}
        {collapsed.editor ? (
          <Box />
        ) : (
          <PanelResizer
            label='調整元件設定寬度'
            width={widths.editor}
            min={PANEL_MIN.editor}
            defaultWidth={DEFAULT_PANEL_WIDTHS.editor}
            maxWidth={() => maxPanelWidth(workspaceWidth, widths.fields)}
            onChange={(width) => setPanelWidth('editor', width)}
            collapseLabel='收合元件設定'
            onCollapse={() => setPanelCollapsed('editor', true)}
          />
        )}
        {collapsed.editor ? (
          <CollapsedPanel label='元件設定' onExpand={() => setPanelCollapsed('editor', false)} />
        ) : (
          <Box sx={sidePanel}>
            {checked ? (
              <RecommendPanel
                dashboard={dashboard}
                dataset={dataset}
                rows={rows}
                checked={checked}
                onClear={() => setChecked(null)}
              />
            ) : selectedWidget ? (
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
                  新增元件」加入新的元件。也可以在欄位清單點選幾個欄位，看推薦的圖表。
                  拖動元件標題可以移動位置，拖動右下角可以調整大小。
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </DndProvider>
  );
}

// 向右收合後的面板：一條直書標題的窄條，點一下展開。收合時面板內容卸載，
// 元件設定裡還沒寫回的輸入會在卸載時寫回（CommitTextField）。
function CollapsedPanel({ label, onExpand }: { label: string; onExpand: () => void }) {
  return (
    <ButtonBase
      onClick={onExpand}
      aria-label={`展開${label}`}
      title={`展開${label}`}
      sx={{
        position: 'sticky',
        top: 88,
        height: 'calc(100svh - 104px)',
        width: '100%',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: 1,
        pt: 1,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        color: 'text.secondary',
        '&:hover, &.Mui-focusVisible': { color: 'text.primary', borderColor: 'primary.main' },
      }}
    >
      <span aria-hidden='true'>«</span>
      <Box component='span' sx={{ writingMode: 'vertical-rl', letterSpacing: 2, fontSize: 14 }}>
        {label}
      </Box>
    </ButtonBase>
  );
}

type MoreItem = { label: string; onClick: () => void };

// 窄螢幕的「更多」選單：放次要的動作，讓標題列不會擠成好幾行。
function MoreMenu({ items }: { items: MoreItem[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button onClick={(e) => setAnchor(e.currentTarget)}>更多 ▾</Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              setAnchor(null);
              item.onClick();
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
