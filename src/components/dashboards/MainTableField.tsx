// 一鍵產生建議內容的「主資料表」下拉選單（ADR 0010 §6）：新增儀表板對話框與空白儀表板的
// 「產生建議內容」共用。選項由 utils/suggestDashboard.ts 的 mainTableOptions 排好，第一個是預設值。

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import type { MainTableOption } from '../../utils/suggestDashboard.ts';
import { TABLE_KIND_LABELS } from '../../utils/tableKinds.ts';

type Props = {
  options: readonly MainTableOption[];
  value: string;
  onChange: (tableKey: string) => void;
};

export function MainTableField({ options, value, onChange }: Props) {
  return (
    <TextField
      select
      label='主資料表'
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText='元件都用這張表的欄位產生，之後可以再調整'
    >
      {options.map(({ table, kind, measures }) => (
        <MenuItem key={table.key} value={table.key}>
          {table.sheetName}（{TABLE_KIND_LABELS[kind]}・{measures} 個數值）
        </MenuItem>
      ))}
    </TextField>
  );
}
