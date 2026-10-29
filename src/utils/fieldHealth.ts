// 欄位健檢（ADR 0010 §7 ③）：找出角色或比率標記可能不對的欄位，列成建議讓使用者逐條或全部套用，
// 判斷錯的可以忽略。套用或忽略都由 store 記成 userOverride，所以使用者決定過的項目不再提出建議。
// 忽略比率建議代表「不是比率」：之後不再當成推測比率（inference.ts 的 isInferredRatioField）。
//
// 三種建議：
//   - role：依目前的角色規則（例如 0010 擴充的時間標頭）應該是維度，但存成了量值。
//     規則修訂前上傳的資料集會遇到，例如「球季」「年度」。只建議量值改維度：規則修訂只會
//     讓更多欄位變成維度，反方向的差異通常是使用者刻意的（例如套用了旗標建議）。
//   - flag：0/1 旗標是量值，改成維度才能用來分組或篩選；放進數值槽位時仍然加總。
//   - ratio：標頭看起來像比率（推測比率），但沒有標成比率。
// 隱藏的資料表不檢查。
//
// 另外列出上傳時自動套用值標籤、使用者還沒確認的欄位（autoLabeledFields，ADR 0011）。
// 這些不是「建議」而是告知：標籤已經生效，使用者可以保留或改回原始值。

import type { Dataset, DatasetRows, Field, Role } from '../types/index.ts';
import { isFlag } from './fieldKinds.ts';
import { CYCLE_HEADERS, SEQUENCE_HEADERS, inferRole, isInferredRatioField } from './inference.ts';
import { describeLabels, isAutoLabeled } from './valueLabels.ts';

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
  // 忽略：維持目前的值，只記成使用者覆寫。
  dismiss: { role?: Role; ratio?: boolean };
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
): Omit<HealthSuggestion, 'id' | 'tableKey' | 'sheetName' | 'header' | 'dismiss'> | undefined {
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
  if (field.role === 'measure' && !isFlag(field, values) && isInferredRatioField(field)) {
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
        dismiss: suggestion.kind === 'ratio' ? { ratio: false } : { role: field.role },
        id: `${table.key}\u0000${field.header}`,
        tableKey: table.key,
        sheetName: table.sheetName,
        header: field.header,
      });
    }
  }
  return suggestions;
}

export type AutoLabeled = {
  id: string;
  tableKey: string;
  sheetName: string;
  header: string;
  // 對照的說明，例如「0 → 否、1 → 是」。
  labels: string;
};

// 自動套用值標籤、還沒被使用者確認（保留、修改或改回原始值）的欄位，依資料表與欄位的順序。
export function autoLabeledFields(dataset: Dataset): AutoLabeled[] {
  return dataset.tables.flatMap((table) =>
    table.hidden
      ? []
      : table.fields.filter(isAutoLabeled).map((field) => ({
          id: `${table.key}\u0000${field.header}`,
          tableKey: table.key,
          sheetName: table.sheetName,
          header: field.header,
          labels: describeLabels(field.valueLabels ?? {}),
        })),
  );
}
