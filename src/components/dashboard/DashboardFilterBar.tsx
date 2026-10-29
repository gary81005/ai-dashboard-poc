// 儀表板篩選列：格線上方一排可打字搜尋的多選下拉，選的值套用到所有有對應欄位的 widget（ADR 0008）。
//
// 用哪些欄位篩選是儀表板設定（dashboard.filters，要儲存）；選了哪些值只在當次瀏覽有效（uiStore）。
// 編輯模式下把維度欄位從欄位清單拖到這裡新增篩選；DropZone 用到 react-dnd，只能在編輯模式渲染。
// 手機上每個下拉佔滿整列（ADR 0009）。

import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useDashboardFilterValues } from '../../hooks/useDashboardFilterValues.ts';
import { useAppStore } from '../../store/appStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { FieldDragItem } from '../../types/dnd.ts';
import type { DashboardFilter, Dashboard, Dataset, DatasetRows } from '../../types/index.ts';
import { filterOptionLabel, filterOptions, tablesWithField } from '../../utils/dashboardFilters.ts';
import { toFieldRef } from '../../utils/fields.ts';
import { DropZone } from '../editor/Shelf.tsx';

type Props = { dashboard: Dashboard; dataset: Dataset; rows: DatasetRows; editing: boolean };

export function DashboardFilterBar({ dashboard, dataset, rows, editing }: Props) {
  const filters = dashboard.filters ?? [];
  const values = useDashboardFilterValues(dashboard.id);
  const setFilterValue = useUiStore((s) => s.setFilterValue);
  const clearFilterValues = useUiStore((s) => s.clearFilterValues);
  const setDashboardFilters = useAppStore((s) => s.setDashboardFilters);

  if (!editing && filters.length === 0) return null;

  const handleDrop = (item: FieldDragItem) => {
    if (filters.some((f) => f.field.header === item.field.header)) return;
    setDashboardFilters(dashboard.id, [...filters, { field: toFieldRef(item.field) }]);
  };
  const handleRemove = (filter: DashboardFilter) => {
    setDashboardFilters(
      dashboard.id,
      filters.filter((f) => f.field.header !== filter.field.header),
    );
    setFilterValue(dashboard.id, filter.field.header, []);
  };

  const selects =
    filters.length === 0 ? null : (
      <Stack direction='row' sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center', flex: 1 }}>
        {filters.map((filter) => (
          <FilterSelect
            key={filter.field.header}
            filter={filter}
            options={filterOptions(dataset, rows, filters, values, filter)}
            getLabel={(option) => filterOptionLabel(dataset, filter, option)}
            value={values[filter.field.header] ?? []}
            missing={tablesWithField(dataset, filter).length === 0}
            onChange={(next) => setFilterValue(dashboard.id, filter.field.header, next)}
            onRemove={editing ? () => handleRemove(filter) : undefined}
          />
        ))}
        {Object.keys(values).length > 0 && (
          <Button size='small' onClick={clearFilterValues}>
            清除篩選
          </Button>
        )}
      </Stack>
    );

  return (
    <Paper variant='outlined' sx={{ p: 1.5 }}>
      {editing ? (
        <DropZone
          accepts={(item) => item.field.role === 'dimension'}
          onDrop={handleDrop}
          label='儀表板篩選'
          hint='套用到所有有這個欄位的元件；選的值只在這次瀏覽有效'
          placeholder='把分類欄位拖到這裡，例如區域、人員'
        >
          {selects}
        </DropZone>
      ) : (
        selects
      )}
    </Paper>
  );
}

type FilterSelectProps = {
  filter: DashboardFilter;
  options: string[];
  getLabel: (option: string) => string;
  value: string[];
  missing: boolean;
  onChange: (values: string[]) => void;
  onRemove?: () => void;
};

// 一個篩選欄位：可以打字搜尋的多選下拉。資料集裡沒有任何資料表有這個欄位時標成錯誤。
// 其他篩選改變後，已選的值可能不在新的選項裡（例如先選人員、再選別的區域），
// 仍保留在選項中，讓使用者看得到、也能取消。
function FilterSelect({
  filter,
  options,
  getLabel,
  value,
  missing,
  onChange,
  onRemove,
}: FilterSelectProps) {
  const choices = [...value.filter((v) => !options.includes(v)), ...options];
  return (
    <Stack direction='row' sx={{ alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
      <Autocomplete
        multiple
        size='small'
        limitTags={2}
        disableCloseOnSelect
        options={choices}
        getOptionLabel={getLabel}
        value={value}
        onChange={(_, next) => onChange(next)}
        noOptionsText='沒有可選的值'
        sx={{ width: { xs: '100%', sm: 280 }, flex: { xs: 1, sm: 'none' } }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={filter.field.header}
            placeholder={value.length === 0 ? '全部' : undefined}
            error={missing}
            helperText={missing ? '資料集裡沒有這個欄位' : undefined}
          />
        )}
      />
      {onRemove && (
        <IconButton size='small' aria-label={`移除篩選 ${filter.field.header}`} onClick={onRemove}>
          <Typography component='span' variant='body2' aria-hidden='true'>
            ✕
          </Typography>
        </IconButton>
      )}
    </Stack>
  );
}
