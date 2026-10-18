// 一張資料表的欄位清單（可展開）：顯示代碼、型別、單位，並讓使用者手動調整
// 角色（維度／量值）、比率標記（ADR 0004）與加權比率的分子分母（ADR 0008），
// 以及這張表要不要出現在編輯模式的欄位清單。

import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { DataTable, Field, RatioOf, Role } from '../../types/index.ts';
import { setTableHidden, updateField } from '../../services/datasetService.ts';
import { DATA_TYPE_LABELS } from '../../utils/fields.ts';

type Props = { datasetId: string; table: DataTable };

export function TableFieldsAccordion({ datasetId, table }: Props) {
  return (
    <Accordion disableGutters variant='outlined' sx={{ opacity: table.hidden ? 0.6 : 1 }}>
      <AccordionSummary>
        <Stack
          direction='row'
          useFlexGap
          sx={{ alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap', columnGap: 1.5 }}
        >
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
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                      <Switch
                        size='small'
                        checked={field.ratio === true}
                        disabled={field.role !== 'measure'}
                        onChange={(_, ratio) =>
                          updateField(datasetId, table.key, field.header, { ratio })
                        }
                      />
                      {field.ratio && (
                        <RatioOfControl
                          field={field}
                          table={table}
                          onChange={(ratioOf) =>
                            updateField(datasetId, table.key, field.header, { ratioOf })
                          }
                        />
                      )}
                    </Stack>
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

type RatioOfControlProps = {
  field: Field;
  table: DataTable;
  onChange: (ratioOf: RatioOf | null) => void;
};

// 比率欄位的分子分母：設定後分組彙總改算「分子加總 ÷ 分母加總」。
// Excel 公式認得出來時會自動帶入，這裡給沒有公式的活頁簿手動指定。
function RatioOfControl({ field, table, onChange }: RatioOfControlProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const candidates = table.fields.filter((f) => f.role === 'measure' && f.header !== field.header);
  const [numerator, setNumerator] = useState(field.ratioOf?.numerator ?? '');
  const [denominator, setDenominator] = useState(field.ratioOf?.denominator ?? '');
  const ready = numerator !== '' && denominator !== '' && numerator !== denominator;

  const choose = (ratioOf: RatioOf | null) => {
    onChange(ratioOf);
    setAnchor(null);
  };
  const fieldSelect = (label: string, value: string, set: (header: string) => void) => (
    <TextField
      select
      size='small'
      label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      sx={{ minWidth: 200 }}
    >
      {candidates.map((f) => (
        <MenuItem key={f.header} value={f.header}>
          {f.header}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <>
      <Button size='small' onClick={(e) => setAnchor(e.currentTarget)}>
        {field.ratioOf
          ? `加權：${field.ratioOf.numerator} ÷ ${field.ratioOf.denominator}`
          : '設定分子分母'}
      </Button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack spacing={1.5} sx={{ p: 2, maxWidth: 320 }}>
          <Typography variant='body2' color='text.secondary'>
            分組時改算「分子加總 ÷ 分母加總」，不再是非加權平均。
          </Typography>
          {fieldSelect('分子', numerator, setNumerator)}
          {fieldSelect('分母', denominator, setDenominator)}
          <Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {field.ratioOf && (
              <Button color='inherit' onClick={() => choose(null)}>
                取消加權
              </Button>
            )}
            <Button
              variant='contained'
              disabled={!ready}
              onClick={() => choose({ numerator, denominator })}
            >
              套用
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
