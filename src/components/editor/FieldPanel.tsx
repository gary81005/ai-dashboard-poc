// 編輯模式的欄位清單：依資料表列出欄位，每個欄位都能用 react-dnd 拖到元件設定的槽位，
// 也能點選勾選，右側面板會依勾選的欄位推薦圖表（ADR 0010 §7 ④，RecommendPanel）。
//
// 資料表依種類分組（明細／彙總／主檔／未分類，參數表預設收起來），每張表顯示「一列 = …」與列數
// （ADR 0010 §3）。搜尋時參數表也會一起搜尋。
// 欄位依 ADR 0010 的類別分組（時間／分類／識別／量值／比率），滑鼠移到欄位上會顯示提示卡：
// 類別、型別、單位、算法、不同值的數量與樣本值。最上方的搜尋框可以跨資料表找欄位。
// 選取中的 widget 已經綁定資料表時，其他資料表會變淡，提示無法拖入。
// 資料集有欄位健檢的建議時（ADR 0010 §7 ③），最上方提示並連到資料集頁、展開該資料集的卡片。

import { useState } from 'react';
import { useDrag } from 'react-dnd';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { FIELD_DND_TYPE } from '../../constants/dnd.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { Dataset, DatasetRows, Widget } from '../../types/index.ts';
import { checkFields } from '../../utils/fieldHealth.ts';
import { DATA_TYPE_LABELS } from '../../utils/fields.ts';
import { GROUP_LABELS, GROUP_ORDER, LEVEL_LABELS, groupOf } from '../../utils/fieldKinds.ts';
import type { FieldProfile } from '../../utils/fieldKinds.ts';
import { displayUnit, formatValue } from '../../utils/format.ts';
import {
  TABLE_KIND_LABELS,
  describeTable,
  grainText,
  groupByKind,
} from '../../utils/tableKinds.ts';
import type { TableDescription } from '../../utils/tableKinds.ts';
import { hasAnyField } from '../../utils/widgetEditing.ts';
import { activeLabels, describeLabels, isBinaryLabeled, labelOf } from '../../utils/valueLabels.ts';
import type { CheckedFields } from './RecommendPanel.tsx';

type Props = {
  dataset: Dataset;
  rows: DatasetRows;
  selectedWidget: Widget | undefined;
  checked: CheckedFields | null;
  onToggle: (table: string, header: string) => void;
};

export function FieldPanel({ dataset, rows, selectedWidget, checked, onToggle }: Props) {
  const [query, setQuery] = useState('');
  const [showParameters, setShowParameters] = useState(false);
  const navigate = useUiStore((s) => s.navigate);
  const setExpandDatasetId = useUiStore((s) => s.setExpandDatasetId);
  const suggestionCount = checkFields(dataset, rows).length;
  const descriptions = dataset.tables
    .filter((t) => !t.hidden)
    .map((table) => describeTable(table, rows[table.key] ?? []));
  // 選取中的 widget 已有欄位時，只能使用它的資料表。
  const lockedTable =
    selectedWidget && hasAnyField(selectedWidget) ? selectedWidget.table : undefined;
  const needle = query.trim().toLowerCase();
  const matches = (profile: FieldProfile) =>
    !needle ||
    profile.field.header.toLowerCase().includes(needle) ||
    (profile.field.code?.toLowerCase().includes(needle) ?? false);

  const sections = descriptions
    .map((description) => ({
      description,
      kind: description.kind,
      profiles: description.profiles.filter(matches),
    }))
    .filter((s) => s.profiles.length > 0);
  const groups = groupByKind(sections);

  return (
    <Paper variant='outlined' sx={{ p: 2 }}>
      <Typography variant='subtitle1' component='h3' sx={{ fontWeight: 600 }}>
        欄位清單
      </Typography>
      <Typography variant='caption' color='text.secondary' component='p' sx={{ mb: 1 }}>
        把欄位拖到右側元件設定的槽位上，或點選幾個欄位看推薦的圖表；滑鼠移到欄位上可以看說明
      </Typography>
      {suggestionCount > 0 && (
        <Alert
          severity='info'
          sx={{ mb: 1.5 }}
          action={
            <Button
              color='inherit'
              size='small'
              onClick={() => {
                setExpandDatasetId(dataset.id);
                navigate('datasets');
              }}
            >
              去處理
            </Button>
          }
        >
          這個資料集有 {suggestionCount} 項欄位建議：有些欄位的角色或比率標記可能不對
        </Alert>
      )}
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
        {groups.map(({ kind, items }) => {
          // 參數表預設收起來；搜尋時一律展開，才找得到參數表的欄位。
          const collapsed = kind === 'parameter' && !showParameters && !needle;
          return (
            <Stack key={kind} spacing={1.5}>
              <Typography
                variant='overline'
                color='text.secondary'
                sx={{ lineHeight: 1.5, borderBottom: 1, borderColor: 'divider' }}
              >
                {TABLE_KIND_LABELS[kind]}表
              </Typography>
              {collapsed ? (
                <Button
                  size='small'
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => setShowParameters(true)}
                >
                  顯示 {items.length} 張參數表
                </Button>
              ) : (
                items.map(({ description, profiles }) => (
                  <TableSection
                    key={description.table.key}
                    description={description}
                    profiles={profiles}
                    disabled={lockedTable !== undefined && lockedTable !== description.table.key}
                    checked={checked?.table === description.table.key ? checked.headers : []}
                    onToggle={(header) => onToggle(description.table.key, header)}
                  />
                ))
              )}
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

type TableSectionProps = {
  description: TableDescription;
  profiles: FieldProfile[];
  disabled: boolean;
  checked: readonly string[];
  onToggle: (header: string) => void;
};

function TableSection({ description, profiles, disabled, checked, onToggle }: TableSectionProps) {
  const { table } = description;
  return (
    <section style={{ opacity: disabled ? 0.45 : 1 }}>
      <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
        {table.sheetName}
      </Typography>
      <Typography variant='caption' color='text.secondary' component='p'>
        {grainText(description)}
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
                <FieldChip
                  key={profile.field.header}
                  tableKey={table.key}
                  profile={profile}
                  checked={checked.includes(profile.field.header)}
                  onToggle={() => onToggle(profile.field.header)}
                />
              ))}
            </Stack>
          </div>
        );
      })}
    </section>
  );
}

type FieldChipProps = {
  tableKey: string;
  profile: FieldProfile;
  checked: boolean;
  onToggle: () => void;
};

// 可拖曳的欄位標籤。藍色 = 維度、綠色 = 量值，名稱後的 ％ 代表比率欄位。
// 點一下勾選（拖曳結束不會觸發點擊）；勾選框只是顯示，點擊由整個標籤處理。
function FieldChip({ tableKey, profile, checked, onToggle }: FieldChipProps) {
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
        variant={checked ? 'filled' : 'outlined'}
        color={field.role === 'dimension' ? 'info' : 'success'}
        label={field.ratio ? `${field.header} ％` : field.header}
        onClick={onToggle}
        aria-pressed={checked}
        icon={
          <Checkbox
            size='small'
            checked={checked}
            tabIndex={-1}
            disableRipple
            sx={{
              p: 0,
              color: 'inherit',
              pointerEvents: 'none',
              '&.Mui-checked': { color: 'inherit' },
            }}
          />
        }
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
    return '標頭看起來像比率，預設用平均；可到資料集頁正式標記，不是比率的話在欄位健檢忽略';
  }
  if (kind.kind === 'category' && kind.flag) {
    return '放進數值槽位時加總，代表符合的筆數';
  }
  return undefined;
}

// 提示卡上的「值」一行：維度列出前幾個值，量值顯示範圍。
function valuesText(profile: FieldProfile): string {
  const { field, samples, distinct, range } = profile;
  if (field.role === 'dimension' || samples.length > 0) {
    if (distinct === 0) return '（沒有值）';
    const shown = samples.map((sample) => labelOf(field, sample));
    return `${shown.join('、')}${distinct > samples.length ? ` …共 ${distinct} 種` : ''}`;
  }
  // 套用值標籤的 0/1 量值：列出對照，而不是「是 0 筆 ～ 是 1 筆」。
  const labels = isBinaryLabeled(field) ? activeLabels(field) : undefined;
  if (labels) return describeLabels(labels);
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
