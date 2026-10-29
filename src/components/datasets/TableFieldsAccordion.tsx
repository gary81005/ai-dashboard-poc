// 一張資料表的欄位清單（可展開）：顯示代碼、型別、單位，並讓使用者手動調整
// 角色（維度／量值）、比率標記（ADR 0004）與加權比率的分子分母（ADR 0008），
// 值標籤（ADR 0011），以及這張表要不要出現在編輯模式的欄位清單。

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
import type { DataTable, Field, RatioOf, Role, Row } from '../../types/index.ts';
import { setTableHidden, updateField } from '../../services/datasetService.ts';
import { profilesOf } from '../../utils/fieldKinds.ts';
import { DATA_TYPE_LABELS } from '../../utils/fields.ts';
import { BLANK_CATEGORY, orderCategories } from '../../utils/query.ts';
import { MAX_LABELED_VALUES, activeLabels, describeLabels } from '../../utils/valueLabels.ts';
import { ValueLabelsDialog } from './ValueLabelsDialog.tsx';

// summary：「一列 = …・642 列」（ADR 0010 §3）；資料列還沒載入時只顯示列數。
// rows：這張表的資料列，值標籤要列出實際出現的值；還沒載入時是 undefined。
type Props = { datasetId: string; table: DataTable; summary?: string; rows?: readonly Row[] };

export function TableFieldsAccordion({ datasetId, table, summary, rows }: Props) {
  const [labeling, setLabeling] = useState<Field | null>(null);
  // 不同值的數量用欄位分類的快取（以資料表與資料列為鍵），不必每次重新掃描。
  const profiles = rows ? profilesOf(table, rows) : undefined;

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
            {summary ?? `${table.rowCount} 列`}・{table.fields.length} 個欄位
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
                <TableCell>用途</TableCell>
                <TableCell>比率（不可加總）</TableCell>
                <TableCell>顯示名稱</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {table.fields.map((field, index) => (
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
                      <ToggleButton value='dimension'>分類</ToggleButton>
                      <ToggleButton value='measure'>數值</ToggleButton>
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
                  <TableCell>
                    <ValueLabelsButton
                      field={field}
                      distinct={profiles?.[index]?.distinct}
                      onOpen={() => setLabeling(field)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {labeling && rows && (
          <ValueLabelsDialog
            field={labeling}
            values={distinctValues(rows, labeling)}
            onClose={() => setLabeling(null)}
            onSave={(patch) => updateField(datasetId, table.key, labeling.header, patch)}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function distinctValues(rows: readonly Row[], field: Field): string[] {
  return orderCategories(rows, field).filter((v) => v !== BLANK_CATEGORY);
}

// distinct：不同值的數量（不含空白）；資料列還沒載入時是 undefined。
type ValueLabelsButtonProps = { field: Field; distinct: number | undefined; onOpen: () => void };

// 目前的對照（或「已停用」）；資料列還沒載入、或不同值太多的欄位不能設定。
function ValueLabelsButton({ field, distinct, onOpen }: ValueLabelsButtonProps) {
  const tooMany = distinct !== undefined && distinct > MAX_LABELED_VALUES;
  const active = activeLabels(field);
  const text = active ? describeLabels(active) : field.valueLabels ? '已停用' : '設定';
  const reason =
    distinct === undefined
      ? '資料列載入後才能設定'
      : tooMany
        ? `有 ${distinct} 種值，超過 ${MAX_LABELED_VALUES} 種的欄位不提供顯示名稱`
        : undefined;
  return (
    <Button
      size='small'
      disabled={reason !== undefined}
      title={reason ?? text}
      onClick={onOpen}
      sx={{ maxWidth: 220, justifyContent: 'flex-start' }}
    >
      <Typography component='span' variant='body2' noWrap>
        {text}
      </Typography>
    </Button>
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
          ? `分子分母：${field.ratioOf.numerator} ÷ ${field.ratioOf.denominator}`
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
            分組時改用「分子加總 ÷ 分母加總」重算，不再把各列的比率直接平均。
          </Typography>
          {fieldSelect('分子', numerator, setNumerator)}
          {fieldSelect('分母', denominator, setDenominator)}
          <Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {field.ratioOf && (
              <Button color='inherit' onClick={() => choose(null)}>
                取消分子分母
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
