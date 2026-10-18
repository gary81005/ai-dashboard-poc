// 編輯模式的欄位清單：依資料表列出欄位，每個欄位都能用 react-dnd 拖到元件設定的槽位。
//
// 欄位依 ADR 0010 的類別分組（時間／分類／識別／量值／比率），滑鼠移到欄位上會顯示提示卡：
// 類別、型別、單位、算法、不同值的數量與樣本值。最上方的搜尋框可以跨資料表找欄位。
// 選取中的 widget 已經綁定資料表時，其他資料表會變淡，提示無法拖入。

import { useState } from 'react';
import { useDrag } from 'react-dnd';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { FIELD_DND_TYPE } from '../../constants/dnd.ts';
import type { DataTable, Dataset, DatasetRows, Widget } from '../../types/index.ts';
import { DATA_TYPE_LABELS } from '../../utils/fields.ts';
import {
  GROUP_LABELS,
  GROUP_ORDER,
  LEVEL_LABELS,
  groupOf,
  profileTable,
} from '../../utils/fieldKinds.ts';
import type { FieldProfile } from '../../utils/fieldKinds.ts';
import { displayUnit, formatValue } from '../../utils/format.ts';
import { hasAnyField } from '../../utils/widgetEditing.ts';

type Props = { dataset: Dataset; rows: DatasetRows; selectedWidget: Widget | undefined };

export function FieldPanel({ dataset, rows, selectedWidget }: Props) {
  const [query, setQuery] = useState('');
  const tables = dataset.tables.filter((t) => !t.hidden);
  // 選取中的 widget 已有欄位時，只能使用它的資料表。
  const lockedTable =
    selectedWidget && hasAnyField(selectedWidget) ? selectedWidget.table : undefined;
  const needle = query.trim().toLowerCase();
  const matches = (profile: FieldProfile) =>
    !needle ||
    profile.field.header.toLowerCase().includes(needle) ||
    (profile.field.code?.toLowerCase().includes(needle) ?? false);

  const sections = tables
    .map((table) => ({
      table,
      profiles: profileTable(table, rows[table.key] ?? []).filter(matches),
    }))
    .filter((s) => s.profiles.length > 0);

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Typography variant='subtitle1' component='h3' sx={{ fontWeight: 600 }}>
        欄位清單
      </Typography>
      <Typography variant='caption' color='text.secondary' component='p' sx={{ mb: 1 }}>
        把欄位拖到右側元件設定的槽位上；滑鼠移到欄位上可以看說明
      </Typography>
      <TextField
        size='small'
        fullWidth
        placeholder='搜尋欄位'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 1.5 }}
      />
      <Stack spacing={2.5}>
        {sections.length === 0 && (
          <Typography variant='body2' color='text.secondary'>
            找不到符合「{query}」的欄位
          </Typography>
        )}
        {sections.map(({ table, profiles }) => (
          <TableSection
            key={table.key}
            table={table}
            profiles={profiles}
            disabled={lockedTable !== undefined && lockedTable !== table.key}
          />
        ))}
      </Stack>
    </Paper>
  );
}

type TableSectionProps = { table: DataTable; profiles: FieldProfile[]; disabled: boolean };

function TableSection({ table, profiles, disabled }: TableSectionProps) {
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
      {GROUP_ORDER.map((group) => {
        const members = profiles.filter((p) => groupOf(p) === group);
        if (members.length === 0) return null;
        return (
          <div key={group}>
            <Typography
              variant='caption'
              color='text.secondary'
              component='p'
              sx={{ mt: 1, mb: 0.5 }}
            >
              {GROUP_LABELS[group]}
            </Typography>
            <Stack direction='row' sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {members.map((profile) => (
                <FieldChip key={profile.field.header} tableKey={table.key} profile={profile} />
              ))}
            </Stack>
          </div>
        );
      })}
    </section>
  );
}

// 可拖曳的欄位標籤。藍色 = 維度、綠色 = 量值，名稱後的 ％ 代表比率欄位。
function FieldChip({ tableKey, profile }: { tableKey: string; profile: FieldProfile }) {
  const { field } = profile;
  const [{ isDragging }, drag] = useDrag({
    type: FIELD_DND_TYPE,
    item: { tableKey, field },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <Tooltip
      title={<FieldHint profile={profile} />}
      placement='left-start'
      enterDelay={400}
      disableHoverListener={isDragging}
    >
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
    </Tooltip>
  );
}

// 提示卡上的「類別」一行。
function kindText(profile: FieldProfile): string {
  const { kind, distinct } = profile;
  switch (kind.kind) {
    case 'time':
      return kind.time === 'sequence'
        ? '時間（序列），適合當趨勢的 X 軸'
        : '時間（週期），適合同期比較';
    case 'category':
      return kind.flag
        ? '0/1 旗標，可當「是／否」分類'
        : `分類（${LEVEL_LABELS[kind.level]}，${distinct} 種）`;
    case 'identifier':
      return `識別（${distinct} 種），適合排行、明細、散佈圖的點`;
    case 'measure':
      return '可加總的量值';
    case 'ratio':
      return kind.ratio === 'weighted'
        ? '比率（加權）'
        : kind.ratio === 'unweighted'
          ? '比率（非加權）'
          : '比率（推測，尚未標記）';
  }
}

// 提示卡上的「算法」一行；沒有特別說明的欄位不顯示。
function formulaText(profile: FieldProfile): string | undefined {
  const { field, kind } = profile;
  if (field.ratioOf) {
    return `${field.ratioOf.numerator} ÷ ${field.ratioOf.denominator}，分組時加權計算`;
  }
  if (kind.kind === 'ratio' && kind.ratio === 'unweighted') {
    return '合併多列時是非加權平均，只能參考；可到資料集頁指定分子分母';
  }
  if (kind.kind === 'ratio' && kind.ratio === 'inferred') {
    return '標頭看起來像比率，預設用平均；可到資料集頁正式標記';
  }
  if (kind.kind === 'category' && kind.flag && field.role === 'measure') {
    return '放進數值槽位時加總，代表符合的筆數';
  }
  return undefined;
}

// 提示卡上的「值」一行：維度列出前幾個值，量值顯示範圍。
function valuesText(profile: FieldProfile): string {
  const { field, samples, distinct, range } = profile;
  if (field.role === 'dimension' || samples.length > 0) {
    if (distinct === 0) return '（沒有值）';
    return `${samples.join('、')}${distinct > samples.length ? ` …共 ${distinct} 種` : ''}`;
  }
  if (!range) return '（沒有數字）';
  return `${formatValue(field, 'sum', range.min)} ～ ${formatValue(field, 'sum', range.max)}`;
}

function FieldHint({ profile }: { profile: FieldProfile }) {
  const { field } = profile;
  const unit = displayUnit(field);
  const formula = formulaText(profile);
  const lines: Array<[string, string]> = [
    ['類別', kindText(profile)],
    ['型別', `${DATA_TYPE_LABELS[field.dataType]}${unit ? `・${unit}` : ''}`],
    ...(formula ? [['算法', formula] as [string, string]] : []),
    ['值', valuesText(profile)],
  ];
  return (
    <Stack spacing={0.5} sx={{ py: 0.5, maxWidth: 280 }}>
      <Typography variant='subtitle2' component='p'>
        {field.header}
        {field.code && (
          <Typography component='span' variant='caption' sx={{ ml: 1, opacity: 0.8 }}>
            {field.code}
          </Typography>
        )}
      </Typography>
      {lines.map(([label, text]) => (
        <Typography key={label} variant='caption' component='p'>
          <strong>{label}：</strong>
          {text}
        </Typography>
      ))}
    </Stack>
  );
}
