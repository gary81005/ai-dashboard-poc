// 欄位健檢（ADR 0010 §7 ③）：找出角色或比率標記可能不對的欄位，列成建議讓使用者逐條或全部套用。
// 套用後由 store 記成 userOverride，所以使用者手動調整過的項目不再提出建議。
//
// 三種建議：
//   - role：依目前的角色規則（例如 0010 擴充的時間標頭）應該是維度，但存成了量值。
//     規則修訂前上傳的資料集會遇到，例如「球季」「年度」。只建議量值改維度：規則修訂只會
//     讓更多欄位變成維度，反方向的差異通常是使用者刻意的（例如套用了旗標建議）。
//   - flag：0/1 旗標是量值，改成維度才能用來分組或篩選；放進數值槽位時仍然加總。
//   - ratio：標頭看起來像比率（推測比率），但沒有標成比率。
// 隱藏的資料表不檢查。

import type { Dataset, DatasetRows, Field, Role } from '../types/index.ts';
import { isFlag } from './fieldKinds.ts';
import { CYCLE_HEADERS, SEQUENCE_HEADERS, inferRole, isInferredRatio } from './inference.ts';

export type HealthKind = 'role' | 'flag' | 'ratio';

export type HealthSuggestion = {
  // 在同一個資料集裡唯一，給 React key 用。
  id: string;
  kind: HealthKind;
  tableKey: string;
  sheetName: string;
  header: string;
  message: string;
  // 與 appStore 的 FieldPatch 同形狀。
  patch: { role?: Role; ratio?: boolean };
};

function overridden(field: Field, key: 'role' | 'ratio'): boolean {
  return field.userOverride?.includes(key) ?? false;
}

function roleMessage(field: Field): string {
  if (SEQUENCE_HEADERS.has(field.header) || CYCLE_HEADERS.has(field.header)) {
    return '是時間欄位，建議改成維度：才能當趨勢的 X 軸或篩選，也不會被加總';
  }
  return '依目前的判斷規則應該是維度，建議改成維度';
}

function suggestionFor(
  field: Field,
  values: readonly unknown[],
): Omit<HealthSuggestion, 'id' | 'tableKey' | 'sheetName' | 'header'> | undefined {
  if (field.role === 'measure' && !overridden(field, 'role')) {
    if (inferRole(field.header, field.dataType, values) === 'dimension') {
      return { kind: 'role', message: roleMessage(field), patch: { role: 'dimension' } };
    }
    if (isFlag(field, values)) {
      return {
        kind: 'flag',
        message:
          '是 0/1 旗標，建議改成維度：可以用來分組或篩選；放進數值槽位時仍會加總，代表符合的筆數',
        patch: { role: 'dimension' },
      };
    }
  }
  if (
    field.role === 'measure' &&
    !field.ratio &&
    !overridden(field, 'ratio') &&
    !isFlag(field, values) &&
    isInferredRatio(field.header)
  ) {
    return {
      kind: 'ratio',
      message:
        '看起來是比率，建議標成比率：合併多列時取平均、不顯示合計；之後可再指定分子分母改成加權',
      patch: { ratio: true },
    };
  }
  return undefined;
}

// 一個資料集的所有建議，依資料表與欄位的順序。
export function checkFields(dataset: Dataset, rows: DatasetRows): HealthSuggestion[] {
  const suggestions: HealthSuggestion[] = [];
  for (const table of dataset.tables) {
    if (table.hidden) continue;
    const tableRows = rows[table.key] ?? [];
    for (const field of table.fields) {
      const values = tableRows
        .map((r) => r[field.header])
        .filter((v) => v !== null && v !== undefined && v !== '');
      const suggestion = suggestionFor(field, values);
      if (!suggestion) continue;
      suggestions.push({
        ...suggestion,
        id: `${table.key}\u0000${field.header}`,
        tableKey: table.key,
        sheetName: table.sheetName,
        header: field.header,
      });
    }
  }
  return suggestions;
}
