// 資料集卡片展開後的內容：最上方是欄位健檢（ADR 0010 §7 ③），接著是資料表清單，
// 依種類分組（明細／彙總／主檔／未分類，參數表預設收起來），每張表顯示「一列 = …」（ADR 0010 §3）。
// 隱藏的資料表放在最後一組。
//
// 健檢、種類與 grain 都需要資料列，所以展開卡片時才載入（和開啟儀表板共用 rowsStore 的快取）；
// 載入前只套用表格名稱前綴的規則。

import { useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useDatasetRows } from '../../hooks/useDatasetRows.ts';
import type { Dataset, DatasetRows } from '../../types/index.ts';
import { checkFields } from '../../utils/fieldHealth.ts';
import {
  TABLE_KIND_LABELS,
  describeTable,
  grainText,
  groupByKind,
} from '../../utils/tableKinds.ts';
import { FieldHealth } from './FieldHealth.tsx';
import { TableFieldsAccordion } from './TableFieldsAccordion.tsx';

const NO_ROWS: DatasetRows = {};

export function DatasetTables({ dataset }: { dataset: Dataset }) {
  const entry = useDatasetRows(dataset);
  const [showParameters, setShowParameters] = useState(false);
  const rows = entry.status === 'ready' ? entry.rows : NO_ROWS;
  const descriptions = dataset.tables
    .filter((t) => !t.hidden)
    .map((table) => describeTable(table, rows[table.key] ?? []));
  const hidden = dataset.tables.filter((t) => t.hidden);

  return (
    <Stack spacing={2}>
      {entry.status === 'loading' && (
        <Typography variant='caption' color='text.secondary'>
          讀取資料列中，完成後會顯示欄位健檢與每張表的「一列代表什麼」…
        </Typography>
      )}
      {entry.status === 'error' && (
        <Typography variant='caption' color='error'>
          讀取資料列失敗，無法做欄位健檢與判斷每張表的「一列代表什麼」：{entry.message}
        </Typography>
      )}
      {entry.status === 'ready' && (
        <FieldHealth datasetId={dataset.id} suggestions={checkFields(dataset, entry.rows)} />
      )}
      {groupByKind(descriptions).map(({ kind, items }) => (
        <Stack key={kind} spacing={1}>
          <Typography variant='subtitle2' color='text.secondary'>
            {TABLE_KIND_LABELS[kind]}表（{items.length}）
          </Typography>
          {kind === 'parameter' && !showParameters ? (
            <Button
              size='small'
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => setShowParameters(true)}
            >
              顯示參數表
            </Button>
          ) : (
            <div>
              {items.map((description) => (
                <TableFieldsAccordion
                  key={description.table.key}
                  datasetId={dataset.id}
                  table={description.table}
                  summary={entry.status === 'ready' ? grainText(description) : undefined}
                />
              ))}
            </div>
          )}
        </Stack>
      ))}
      {hidden.length > 0 && (
        <Stack spacing={1}>
          <Typography variant='subtitle2' color='text.secondary'>
            已隱藏（{hidden.length}）
          </Typography>
          <div>
            {hidden.map((table) => (
              <TableFieldsAccordion key={table.key} datasetId={dataset.id} table={table} />
            ))}
          </div>
        </Stack>
      )}
    </Stack>
  );
}
