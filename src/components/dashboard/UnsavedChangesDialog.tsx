// 離開有未儲存變更的儀表板前的確認對話框：換網址時由儀表板頁的 useBlocker 觸發，登出時由 uiStore.leave 觸發。
//
// 儲存失敗時留在原畫面並跳出提示，不會丟掉變更。

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { saveDashboardChanges } from '../../services/dashboardService.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';

export function UnsavedChangesDialog() {
  const pendingLeave = useUiStore((s) => s.pendingLeave);
  const setPendingLeave = useUiStore((s) => s.setPendingLeave);
  const notify = useUiStore((s) => s.notify);
  const discardChanges = useAppStore((s) => s.discardChanges);
  const saving = useAppStore((s) => s.saving);

  // 取消：留在原畫面（換網址時把網址放回原處）。
  const close = () => {
    setPendingLeave(null);
    pendingLeave?.cancel();
  };

  const handleDiscard = () => {
    discardChanges();
    setPendingLeave(null);
    pendingLeave?.proceed();
  };

  // try 裡只放 await：React Compiler 不支援 try 裡的條件運算式（含 ?.），寫了整個元件就不做記憶化。
  const handleSave = async () => {
    let failure: unknown;
    try {
      await saveDashboardChanges();
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined) {
      close();
      notify({
        severity: 'error',
        message: failure instanceof Error ? failure.message : String(failure),
      });
      return;
    }
    setPendingLeave(null);
    pendingLeave?.proceed();
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
