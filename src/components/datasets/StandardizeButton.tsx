// 資料集頁的「資料標準化」：把系統匯出的原始活頁簿（例如 CRM 匯出檔）轉成符合結構規範的標準化活頁簿，
// 轉換後可以下載標準化檔，或直接匯入為資料集（走一般的上傳流程，原始檔欄位存的是標準化檔）。
//
// 依工作表名稱自動辨識來源（設定清單見 utils/standardize/specs/）。轉換在瀏覽器進行，
// 幾萬列的檔案約需數秒到十幾秒，期間畫面可能短暫沒有反應。

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { importWorkbook } from '../../services/datasetService.ts';
import { downloadFile, XLSX_TYPE } from '../../services/download.ts';
import { standardizeWorkbook } from '../../services/standardizeWorkbook.ts';
import type { StandardizeResult, StandardizeStage } from '../../services/standardizeWorkbook.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dataset } from '../../types/index.ts';
import { SPECS } from '../../utils/standardize/specs/index.ts';

type State =
  | { step: 'pick' }
  | { step: 'working'; fileName: string; stage: StandardizeStage }
  | { step: 'done'; result: StandardizeResult; percent: number | null; importing: boolean }
  | { step: 'error'; message: string };

const STAGE_LABELS: Record<StandardizeStage, string> = {
  read: '讀取原始檔…',
  transform: '轉換中…',
  write: '產生標準化檔…',
};

// 不列在摘要裡的說明用工作表。
const META_SHEETS = new Set(['使用說明', '資料品質檢核', '欄位定義']);

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'default'> = {
  高: 'error',
  中: 'warning',
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const count = (n: number) => n.toLocaleString('zh-TW');

export function StandardizeButton({ disabled = false }: { disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ step: 'pick' });
  const notify = useUiStore((s) => s.notify);
  const setExpandDatasetId = useUiStore((s) => s.setExpandDatasetId);
  const busy = state.step === 'working' || (state.step === 'done' && state.importing);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setState({ step: 'pick' });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 input，讓使用者再次選同一個檔案時也會觸發 onChange。
    event.target.value = '';
    if (!file) return;
    const fileName = file.name;
    setState({ step: 'working', fileName, stage: 'read' });
    const onStage = (stage: StandardizeStage) => setState({ step: 'working', fileName, stage });
    let result: StandardizeResult | undefined;
    let failure: unknown;
    try {
      result = await standardizeWorkbook(await file.arrayBuffer(), fileName, { onStage });
    } catch (error) {
      failure = error;
    }
    setState(
      result
        ? { step: 'done', result, percent: null, importing: false }
        : { step: 'error', message: errorMessage(failure) },
    );
  };

  const handleImport = async (result: StandardizeResult) => {
    setState({ step: 'done', result, percent: null, importing: true });
    const onProgress = (done: number, total: number) =>
      setState({
        step: 'done',
        result,
        importing: true,
        percent: total === 0 ? 100 : Math.round((done / total) * 100),
      });
    let dataset: Dataset | undefined;
    let failure: unknown;
    try {
      dataset = await importWorkbook(result.buffer, result.fileName, undefined, onProgress);
    } catch (error) {
      failure = error;
    }
    if (!dataset) {
      setState({ step: 'done', result, percent: null, importing: false });
      notify({ severity: 'error', message: `匯入失敗：${errorMessage(failure)}` });
      return;
    }
    setExpandDatasetId(dataset.id);
    notify({ severity: 'success', message: `已匯入「${dataset.name}」` });
    setOpen(false);
    setState({ step: 'pick' });
  };

  const pickFile = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        accept={`.xlsx,${XLSX_TYPE}`}
        hidden
        onChange={handleFile}
      />
      <Button variant='outlined' disabled={disabled} onClick={() => setOpen(true)}>
        資料標準化
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
        <DialogTitle>資料標準化</DialogTitle>
        <DialogContent>
          {state.step === 'pick' && (
            <Stack spacing={1.5}>
              <DialogContentText>
                把系統直接匯出的原始 Excel
                轉成符合結構規範的標準化活頁簿：空白補成「未提供」、統一格式、拆出名單與統計表，
                並列出資料品質問題。原始值不會被修改，問題只會標記、不會自動修補。
              </DialogContentText>
              <Typography variant='body2' color='text.secondary'>
                目前支援：{SPECS.map((s) => s.label).join('、')}。依工作表名稱自動辨識。
              </Typography>
            </Stack>
          )}

          {state.step === 'working' && (
            <Stack spacing={1.5} sx={{ py: 1 }}>
              <Typography variant='body2'>
                {state.fileName}：{STAGE_LABELS[state.stage]}
              </Typography>
              <LinearProgress aria-label='標準化進度' />
              <Typography variant='caption' color='text.secondary'>
                幾萬列的檔案約需十幾秒，期間畫面可能短暫沒有反應。
              </Typography>
            </Stack>
          )}

          {state.step === 'error' && <Alert severity='error'>{state.message}</Alert>}

          {state.step === 'done' && <ResultSummary result={state.result} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            關閉
          </Button>
          {state.step === 'pick' && (
            <Button variant='contained' onClick={pickFile}>
              選擇原始檔
            </Button>
          )}
          {state.step === 'error' && (
            <Button variant='contained' onClick={pickFile}>
              重新選擇
            </Button>
          )}
          {state.step === 'done' && (
            <>
              <Button disabled={busy} onClick={pickFile}>
                重新選擇
              </Button>
              <Button
                variant='outlined'
                disabled={busy}
                onClick={() => downloadFile(state.result.fileName, state.result.buffer, XLSX_TYPE)}
              >
                下載標準化檔
              </Button>
              <Button
                variant='contained'
                disabled={busy}
                startIcon={
                  state.importing ? <CircularProgress size={16} color='inherit' /> : undefined
                }
                onClick={() => handleImport(state.result)}
              >
                {state.importing
                  ? state.percent === null
                    ? '處理中…'
                    : `寫入資料 ${state.percent}%`
                  : '匯入為資料集'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}

// 轉換結果：產生的資料表與列數，以及資料品質檢核找到的問題。
function ResultSummary({ result }: { result: StandardizeResult }) {
  const tables = result.tables.filter((t) => !META_SHEETS.has(t.sheet));
  return (
    <Stack spacing={2}>
      <Alert severity='success'>
        已依「{result.source.label}」轉換為 {result.fileName}
      </Alert>
      <div>
        <Typography variant='subtitle2' gutterBottom>
          資料表
        </Typography>
        <Stack direction='row' useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {tables.map((t) => (
            <Chip
              key={t.sheet}
              size='small'
              variant='outlined'
              label={`${t.sheet} ${count(t.rows)} 列`}
            />
          ))}
        </Stack>
      </div>
      <div>
        <Typography variant='subtitle2' gutterBottom>
          資料品質檢核：{result.issues.length === 0 ? '沒有發現問題' : `${result.issues.length} 項`}
        </Typography>
        <Stack component='ul' spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {result.issues.map((issue) => (
            <Stack
              component='li'
              key={issue.id}
              direction='row'
              spacing={1}
              sx={{ alignItems: 'baseline' }}
            >
              <Chip
                size='small'
                color={SEVERITY_COLORS[issue.severity] ?? 'default'}
                label={issue.severity}
                sx={{ flexShrink: 0 }}
              />
              <Typography variant='body2' sx={{ flex: 1, minWidth: 0 }}>
                {issue.name}
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ flexShrink: 0 }}>
                {count(issue.affected)} 筆（
                {issue.base === 0 ? 0 : ((issue.affected / issue.base) * 100).toFixed(1)}%）
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1 }}>
          問題只標記、不修補；處理建議在標準化檔的「資料品質檢核」工作表。
        </Typography>
      </div>
    </Stack>
  );
}
