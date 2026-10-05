// 顯示儀表板套用到某個資料集後，哪些元件會出現「欄位遺失」；切換資料來源與匯入時共用。

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import type { WidgetIssue } from '../../utils/rebind.ts';

export function IssueList({ issues }: { issues: WidgetIssue[] }) {
  if (issues.length === 0) {
    return <Alert severity='success'>所有元件用到的資料表和欄位都對得上。</Alert>;
  }
  return (
    <Alert severity='warning'>
      <AlertTitle>{issues.length} 個元件會顯示「欄位遺失」，之後需要重新指定欄位</AlertTitle>
      {issues.map((issue) => (
        <div key={issue.widgetId}>
          {issue.title || '未命名'}：
          {issue.missingTable
            ? '找不到它使用的資料表'
            : issue.missingFields.map((f) => `「${f.header}」`).join('、')}
        </div>
      ))}
    </Alert>
  );
}
