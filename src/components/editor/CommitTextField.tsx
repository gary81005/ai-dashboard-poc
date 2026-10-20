// 離開輸入框時才寫回的文字欄位：打字只改本地的草稿，失焦時才呼叫 onCommit。
//
// 元件設定的每次修改都會更新 store、讓整個儀表板頁重新渲染；標題、說明這類自由輸入若每個字都寫回，
// 打字會卡。單行欄位按 Enter 也會寫回，按 Esc 還原成目前的值。
// 點「關閉」「儲存」或其他卡片時，瀏覽器會先讓輸入框失焦，所以草稿會在那些動作之前寫回。

import { useState } from 'react';
import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

type Props = Omit<TextFieldProps, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
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

  return (
    <TextField
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === 'Escape') setDraft(value);
        else if (e.key === 'Enter' && !props.multiline) (e.target as HTMLElement).blur();
      }}
    />
  );
}
