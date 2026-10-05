// 一張資料表的欄位清單（可展開）：顯示代碼、型別、單位，並讓使用者手動調整
// 角色（維度／量值）與比率標記（ADR 0004），以及這張表要不要出現在編輯模式的欄位清單。

import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { DataTable, DataType, Role } from '../../types/index.ts';
import { useAppStore } from '../../store/appStore.ts';

const DATA_TYPE_LABELS: Record<DataType, string> = {
  text: '文字',
  integer: '整數',
  number: '數值',
  percent: '百分比',
  date: '日期',
};

type Props = { datasetId: string; table: DataTable };

export function TableFieldsAccordion({ datasetId, table }: Props) {
  const setTableHidden = useAppStore((s) => s.setTableHidden);
  const updateField = useAppStore((s) => s.updateField);

  return (
    <Accordion disableGutters variant='outlined' sx={{ opacity: table.hidden ? 0.6 : 1 }}>
      <AccordionSummary>
        <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{table.sheetName}</Typography>
          <Typography variant='body2' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
            {table.key !== table.sheetName ? table.key : ''}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {table.rowCount} 列・{table.fields.length} 個欄位
          </Typography>
        </Stack>
        <FormControlLabel
          label='顯示於欄位清單'
          onClick={(e) => e.stopPropagation()}
          control={
            <Switch
              size='small'
              checked={!table.hidden}
              onChange={(_, checked) => setTableHidden(datasetId, table.key, !checked)}
            />
          }
        />
      </AccordionSummary>
      <AccordionDetails>
        <TableContainer>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>欄位</TableCell>
                <TableCell>代碼</TableCell>
                <TableCell>型別</TableCell>
                <TableCell>單位</TableCell>
                <TableCell>角色</TableCell>
                <TableCell>比率（不可加總）</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {table.fields.map((field) => (
                <TableRow key={field.header}>
                  <TableCell>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                      <span>{field.header}</span>
                      {field.userOverride && field.userOverride.length > 0 && (
                        <Chip size='small' variant='outlined' label='已手動調整' />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{field.code ?? '—'}</TableCell>
                  <TableCell>{DATA_TYPE_LABELS[field.dataType]}</TableCell>
                  <TableCell>{field.unit ?? '—'}</TableCell>
                  <TableCell>
                    <ToggleButtonGroup
                      size='small'
                      exclusive
                      value={field.role}
                      onChange={(_, role: Role | null) => {
                        if (role) updateField(datasetId, table.key, field.header, { role });
                      }}
                    >
                      <ToggleButton value='dimension'>維度</ToggleButton>
                      <ToggleButton value='measure'>量值</ToggleButton>
                    </ToggleButtonGroup>
                  </TableCell>
                  <TableCell>
                    <Switch
                      size='small'
                      checked={field.ratio === true}
                      disabled={field.role !== 'measure'}
                      onChange={(_, ratio) =>
                        updateField(datasetId, table.key, field.header, { ratio })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}
