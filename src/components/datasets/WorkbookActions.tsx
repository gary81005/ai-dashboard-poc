// 「上傳 Excel」與「載入範例資料」兩個按鈕，含處理中狀態與結果提示（Snackbar）。
//
// 用在儀表板清單的空狀態、資料集頁，以及匯入儀表板的對話框。

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import { importWorkbook } from '../../services/datasetService.ts';
import { loadSample } from '../../services/sampleService.ts';
import { useUiStore } from '../../store/uiStore.ts';

type Busy = 'upload' | 'sample' | null;
type Notice = { severity: 'success' | 'warning' | 'error'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Props = {
  showSample?: boolean;
  // 在對話框裡上傳時，不要跳離目前畫面到資料集頁。
  stayOnPage?: boolean;
};

export function WorkbookActions({ showSample = true, stayOnPage = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const navigate = useUiStore((s) => s.navigate);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 input，讓使用者再次選同一個檔案時也會觸發 onChange。
    event.target.value = '';
    if (!file) return;
    setBusy('upload');
    try {
      const dataset = await importWorkbook(await file.arrayBuffer(), file.name);
      const skipped = dataset.skippedSheets?.length ?? 0;
      setNotice(
        skipped > 0
          ? {
              severity: 'warning',
              message: `已匯入「${dataset.name}」，跳過 ${skipped} 張不符合規範的工作表`,
            }
          : { severity: 'success', message: `已匯入「${dataset.name}」` },
      );
      if (!stayOnPage) navigate('datasets');
    } catch (error) {
      setNotice({ severity: 'error', message: `匯入失敗：${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleSample = async () => {
    setBusy('sample');
    try {
      await loadSample();
      navigate('dashboard');
    } catch (error) {
      setNotice({ severity: 'error', message: `載入範例失敗：${errorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack direction='row' spacing={1.5}>
      <input
        ref={inputRef}
        type='file'
        accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        hidden
        onChange={handleFile}
      />
      <Button
        variant='contained'
        disabled={busy !== null}
        startIcon={busy === 'upload' ? <CircularProgress size={16} color='inherit' /> : undefined}
        onClick={() => inputRef.current?.click()}
      >
        上傳 Excel
      </Button>
      {showSample && (
        <Button
          variant='outlined'
          disabled={busy !== null}
          startIcon={busy === 'sample' ? <CircularProgress size={16} color='inherit' /> : undefined}
          onClick={handleSample}
        >
          載入範例資料
        </Button>
      )}
      <Snackbar
        open={notice !== null}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {notice ? (
          <Alert severity={notice.severity} variant='filled' onClose={() => setNotice(null)}>
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}
