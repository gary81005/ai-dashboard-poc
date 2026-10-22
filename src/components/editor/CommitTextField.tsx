// 不會每個字都寫回的文字欄位：打字只改本地的草稿，停止輸入一下（COMMIT_DELAY）、離開輸入框、
// 單行欄位按 Enter，或元件被卸載時，才呼叫 onCommit。例外是聚焦後的第一次修改：馬上寫回，
// 讓未儲存提醒（含重新整理、關閉分頁時的 beforeunload）從第一個字就生效，不必等停頓或失焦。
// 按 Esc 還原成這次聚焦前的值。
//
// 元件設定的每次修改都會更新 store、讓整個儀表板頁重新渲染；標題、說明這類自由輸入若每個字都寫回，
// 打字會卡。卸載時寫回，是因為縮窄視窗、收合面板等情況卸載元件時不會觸發 onBlur。
// 輸入法組字中（注音、拼音選字）的 Enter 與 Esc 屬於輸入法，不處理。

import { useEffect, useEffectEvent, useState } from 'react';
import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

const COMMIT_DELAY = 400;

type Props = Omit<TextFieldProps, 'value' | 'defaultValue' | 'onChange' | 'onFocus' | 'onBlur'> & {
  value: string;
  onCommit: (value: string) => void;
};

export function CommitTextField({ value, onCommit, onKeyDown, ...props }: Props) {
  const [draft, setDraft] = useState(value);
  // 值從外面被改掉時（例如「改用建議」換了標題）同步到輸入框。
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  // 用最新的 draft、value 與 onCommit：計時器與卸載時呼叫，不能拿到舊的 widget。
  const commit = useEffectEvent(() => {
    if (draft !== value) onCommit(draft);
  });
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(commit, COMMIT_DELAY);
    return () => clearTimeout(timer);
  }, [draft, value]);
  useEffect(() => () => commit(), []);
  // 這次聚焦前的值：store 還是這個值時，代表還沒寫回過，下一次修改要馬上寫回；Esc 也還原成它。
  const [base, setBase] = useState<string | null>(null);

  return (
    <TextField
      {...props}
      value={draft}
      onFocus={() => setBase(value)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (value === base && next !== base) onCommit(next);
      }}
      onBlur={() => {
        setBase(null);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') {
          const original = base ?? value;
          setDraft(original);
          if (value !== original) onCommit(original);
        } else if (e.key === 'Enter' && !props.multiline) (e.target as HTMLElement).blur();
      }}
    />
  );
}
