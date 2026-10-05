// 編輯模式的欄位清單：依資料表列出維度與量值欄位，每個欄位都能用 react-dnd 拖到元件設定的槽位。
//
// 選取中的 widget 已經綁定資料表時，其他資料表會變淡，提示無法拖入。

import { useDrag } from 'react-dnd';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FIELD_DND_TYPE } from '../../constants/dnd.ts';
import type { FieldDragItem } from '../../types/dnd.ts';
import type { DataTable, Dataset, Field, Widget } from '../../types/index.ts';
import { hasAnyField } from '../../utils/widgetEditing.ts';

type Props = { dataset: Dataset; selectedWidget: Widget | undefined };

export function FieldPanel({ dataset, selectedWidget }: Props) {
  const tables = dataset.tables.filter((t) => !t.hidden);
  // 選取中的 widget 已有欄位時，只能使用它的資料表。
  const lockedTable =
    selectedWidget && hasAnyField(selectedWidget) ? selectedWidget.table : undefined;

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Typography variant='subtitle1' component='h3' sx={{ fontWeight: 600 }}>
        欄位清單
      </Typography>
      <Typography variant='caption' color='text.secondary' component='p' sx={{ mb: 1.5 }}>
        把欄位拖到右側元件設定的槽位上
      </Typography>
      <Stack spacing={2.5}>
        {tables.map((table) => (
          <TableSection
            key={table.key}
            table={table}
            disabled={lockedTable !== undefined && lockedTable !== table.key}
          />
        ))}
      </Stack>
    </Paper>
  );
}

function TableSection({ table, disabled }: { table: DataTable; disabled: boolean }) {
  const dimensions = table.fields.filter((f) => f.role === 'dimension');
  const measures = table.fields.filter((f) => f.role === 'measure');

  return (
    <section style={{ opacity: disabled ? 0.45 : 1 }}>
      <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
        {table.sheetName}
      </Typography>
      {disabled && (
        <Typography variant='caption' color='text.secondary' component='p'>
          目前選取的元件使用其他資料表
        </Typography>
      )}
      <FieldGroup label='維度' tableKey={table.key} fields={dimensions} />
      <FieldGroup label='量值' tableKey={table.key} fields={measures} />
    </section>
  );
}

function FieldGroup({
  label,
  tableKey,
  fields,
}: {
  label: string;
  tableKey: string;
  fields: Field[];
}) {
  if (fields.length === 0) return null;
  return (
    <>
      <Typography variant='caption' color='text.secondary' component='p' sx={{ mt: 1, mb: 0.5 }}>
        {label}
      </Typography>
      <Stack direction='row' sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {fields.map((field) => (
          <FieldChip key={field.header} tableKey={tableKey} field={field} />
        ))}
      </Stack>
    </>
  );
}

// 可拖曳的欄位標籤。藍色 = 維度、綠色 = 量值，名稱後的 ％ 代表比率欄位。
function FieldChip({ tableKey, field }: FieldDragItem) {
  const [{ isDragging }, drag] = useDrag<FieldDragItem, unknown, { isDragging: boolean }>({
    type: FIELD_DND_TYPE,
    item: { tableKey, field },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <Chip
      ref={(node: HTMLDivElement | null) => {
        drag(node);
      }}
      size='small'
      variant='outlined'
      color={field.role === 'dimension' ? 'primary' : 'success'}
      label={field.ratio ? `${field.header} ％` : field.header}
      sx={{ cursor: 'grab', opacity: isDragging ? 0.4 : 1 }}
    />
  );
}
