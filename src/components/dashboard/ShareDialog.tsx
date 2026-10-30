// 分享對話框（ADR 0012）：建立、複製、撤銷分享連結，以及修改到期日。
//
// 拿到連結的人不用登入就能看，但只拿到算好的結果；分享的是最後一次儲存的版本，之後每次儲存都會更新。
// 會露出逐筆資料的元件（明細表、散佈圖、排行…）列在這裡，讓擁有者決定要不要分享（ADR 0012 §3）。
// 只在開啟時掛上（父元件條件渲染），每次打開都重新取「現在」來判斷連結是否過期。

import { useState } from 'react';
import dayjs from 'dayjs';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { createShare, revokeShare, updateShareExpiry } from '../../services/shareService.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useRowsStore } from '../../store/rowsStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dashboard, Dataset } from '../../types/index.ts';
import { exposedWidgets } from '../../utils/shareExposure.ts';
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  expiryFrom,
  isShareActive,
  shareUrl,
} from '../../utils/shareLink.ts';

type Props = { dashboard: Dashboard; dataset: Dataset | undefined; onClose: () => void };

// 到期日選單的值：天數，或 'never'（永不過期）。
type ExpiryChoice = number | 'never';
const toDays = (choice: ExpiryChoice) => (choice === 'never' ? null : choice);
const formatTime = (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm');

export function ShareDialog({ dashboard, dataset, onClose }: Props) {
  const share = useAppStore((s) => s.shares[dashboard.id]);
  // 分享的是最後一次儲存的版本：有未儲存的變更時是 draftBase。
  const draftBase = useAppStore((s) => (s.draftBase?.id === dashboard.id ? s.draftBase : null));
  const rowsEntry = useRowsStore((s) => (dataset ? s.byDataset[dataset.id] : undefined));
  const notify = useUiStore((s) => s.notify);
  const [expiry, setExpiry] = useState<ExpiryChoice>(DEFAULT_EXPIRY_DAYS);
  const [busy, setBusy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  // 開啟對話框的時間，判斷連結是否已過期。
  const [now] = useState(() => new Date());

  const saved = draftBase ?? dashboard;
  const rowsReady = rowsEntry?.status === 'ready';
  const exposures =
    dataset && rowsEntry?.status === 'ready'
      ? exposedWidgets(saved.widgets, dataset, rowsEntry.rows)
      : [];
  const url = share ? shareUrl(window.location.origin, share.token) : '';

  // 失敗時跳提示；不用 finally，React Compiler 不支援 try…finally。
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    let failure: unknown = null;
    try {
      await action();
    } catch (error) {
      failure = error;
    }
    setBusy(false);
    if (failure) {
      notify({
        severity: 'error',
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(url).then(
      () => notify({ severity: 'success', message: '已複製分享連結' }),
      () => notify({ severity: 'error', message: '無法複製，請直接選取網址複製' }),
    );
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>分享「{dashboard.name}」</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            拿到連結的人不用登入就能看這個儀表板，只看得到圖表上的結果，拿不到原始資料，也不能篩選或匯出。
            之後每次按「儲存」，分享的內容會跟著更新。
          </DialogContentText>

          {draftBase && (
            <Alert severity='warning'>目前有未儲存的變更，分享出去的是上次儲存的版本。</Alert>
          )}

          {exposures.length > 0 && (
            <Alert severity='warning'>
              <AlertTitle>這些元件會顯示逐筆資料</AlertTitle>
              <Typography variant='body2' sx={{ mb: 0.5 }}>
                看的人可以看到每一筆的名稱與數字，請確認可以公開：
              </Typography>
              {exposures.map(({ widget, reason }) => (
                <Typography key={widget.id} variant='body2'>
                  ・{widget.title || '未命名'}：{reason}
                </Typography>
              ))}
            </Alert>
          )}

          {!dataset ? (
            <Alert severity='error'>資料集遺失，無法分享。請先切換資料來源。</Alert>
          ) : share ? (
            <Stack spacing={1.5}>
              <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                  size='small'
                  label='分享連結'
                  value={url}
                  fullWidth
                  slotProps={{ htmlInput: { readOnly: true } }}
                  onFocus={(e) => e.target.select()}
                />
                <Button variant='contained' onClick={copy} sx={{ flexShrink: 0 }}>
                  複製
                </Button>
              </Stack>
              <Typography variant='body2' color='text.secondary'>
                最後更新於 {formatTime(share.snapshotAt)}
              </Typography>
              {isShareActive(share, now) ? (
                <Typography variant='body2' color='text.secondary'>
                  {share.expiresAt ? `到期：${formatTime(share.expiresAt)}` : '永不過期'}
                </Typography>
              ) : (
                <Typography variant='body2' color='error'>
                  已於 {formatTime(share.expiresAt ?? '')} 過期，目前打不開；可以重新設定到期日。
                </Typography>
              )}
              <TextField
                select
                size='small'
                label='重新設定到期日（從今天起算）'
                value=''
                disabled={busy}
                onChange={(e) => {
                  const choice: ExpiryChoice =
                    e.target.value === 'never' ? 'never' : Number(e.target.value);
                  void run(() =>
                    updateShareExpiry(dashboard.id, expiryFrom(toDays(choice), new Date())),
                  );
                }}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <MenuItem key={o.label} value={o.days ?? 'never'}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          ) : (
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                select
                size='small'
                label='有效期限'
                value={expiry}
                onChange={(e) =>
                  setExpiry(e.target.value === 'never' ? 'never' : Number(e.target.value))
                }
                sx={{ minWidth: 140 }}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <MenuItem key={o.label} value={o.days ?? 'never'}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant='contained'
                loading={busy}
                disabled={!rowsReady}
                onClick={() =>
                  void run(() => createShare(dashboard.id, expiryFrom(toDays(expiry), new Date())))
                }
              >
                {rowsReady ? '建立分享連結' : '資料載入中…'}
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {share &&
          (confirmingRevoke ? (
            <>
              <Typography variant='body2' color='error' sx={{ mr: 'auto', pl: 2 }}>
                撤銷後連結立刻失效，重新建立時網址會換掉。
              </Typography>
              <Button color='inherit' onClick={() => setConfirmingRevoke(false)}>
                取消
              </Button>
              <Button
                color='error'
                variant='contained'
                loading={busy}
                onClick={() =>
                  void run(async () => {
                    await revokeShare(dashboard.id);
                    setConfirmingRevoke(false);
                  })
                }
              >
                確定撤銷
              </Button>
            </>
          ) : (
            <Button color='error' onClick={() => setConfirmingRevoke(true)} sx={{ mr: 'auto' }}>
              撤銷連結
            </Button>
          ))}
        {!confirmingRevoke && <Button onClick={onClose}>關閉</Button>}
      </DialogActions>
    </Dialog>
  );
}
