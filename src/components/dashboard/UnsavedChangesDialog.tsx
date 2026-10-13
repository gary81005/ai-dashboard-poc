// 離開有未儲存變更的儀表板前的確認對話框（換頁、登出時由 uiStore.leave 觸發）。
//
// 儲存失敗時留在原畫面並跳出提示，不會丟掉變更。

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { saveActiveDashboard } from '../../services/dashboardService.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';

export function UnsavedChangesDialog() {
  const pendingLeave = useUiStore((s) => s.pendingLeave);
  const setPendingLeave = useUiStore((s) => s.setPendingLeave);
  const notify = useUiStore((s) => s.notify);
  const discardChanges = useAppStore((s) => s.discardChanges);
  const saving = useAppStore((s) => s.saving);

  const close = () => setPendingLeave(null);

  const handleDiscard = () => {
    discardChanges();
    close();
    pendingLeave?.();
  };

  const handleSave = async () => {
    try {
      await saveActiveDashboard();
      close();
      pendingLeave?.();
    } catch (error) {
      close();
      notify({
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog open={pendingLeave !== null} onClose={saving ? undefined : close}>
      <DialogTitle>儀表板有未儲存的變更</DialogTitle>
      <DialogContent>
        <DialogContentText>離開前要先儲存嗎？捨棄後會回到上次儲存的版本。</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={saving}>
          取消
        </Button>
        <Button color='error' onClick={handleDiscard} disabled={saving}>
          捨棄變更
        </Button>
        <Button variant='contained' loading={saving} onClick={() => void handleSave()}>
          儲存並離開
        </Button>
      </DialogActions>
    </Dialog>
  );
}
