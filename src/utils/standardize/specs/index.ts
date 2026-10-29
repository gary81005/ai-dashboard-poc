// 支援的來源清單：每種系統匯出檔一份設定，加上辨識用的必要工作表與欄位。
// 資料集頁的「資料標準化」與 npm run standardize 都從這裡找設定。

import type { StandardizeSpec } from '../types.ts';
import { spec as crm } from './crm.ts';

export type SpecEntry = {
  id: string;
  label: string;
  // 原始檔必須有的工作表與欄位；工作表都在就視為這種來源，再檢查欄位是否齊全。
  required: Record<string, readonly string[]>;
  spec: StandardizeSpec;
};

export const SPECS: readonly SpecEntry[] = [
  {
    id: 'crm',
    label: 'CRM 匯出檔（客戶、拜訪、商機）',
    required: {
      客戶: ['客戶編號', '客戶名稱', '客戶類型', '客戶分類', '客戶分級', '省份', '縣市', '縣區'],
      拜訪: [
        '拜訪編號',
        '拜訪日期',
        '拜訪狀態',
        '拜訪類型',
        '商機編號',
        '客戶編號',
        '客戶名稱',
        '大區',
        '地區',
        '業務員編',
        '業務姓名',
        '拜訪結果',
        '銷售拜訪類型',
        '涉及商品',
        '場所方式',
      ],
      商機: [
        '商機編號',
        '商機內容',
        '商機類別',
        '成單機率',
        '階段狀態',
        '輸單原因',
        '欲購買廠牌',
        '欲購買商品',
        '欲購買數量',
        '預計結束日期',
        '報價金額(元)',
        '預算範圍',
        '客戶編號',
        '成交商品',
        '業務員編',
        '業務姓名',
        '大區',
        '客戶備註',
      ],
    },
    spec: crm,
  },
];

export const specById = (id: string): SpecEntry | undefined => SPECS.find((s) => s.id === id);

// 依工作表名稱辨識來源：必要的工作表都在的第一份設定。
export function detectSpec(sheets: readonly string[]): SpecEntry | undefined {
  return SPECS.find((entry) =>
    Object.keys(entry.required).every((sheet) => sheets.includes(sheet)),
  );
}

// 缺少的工作表或欄位，例如「拜訪：缺少 拜訪日期、涉及商品」；全部齊全時是空陣列。
// headers 是每張工作表第 1 列的標頭（資料列是空的也能檢查）。
export function missingColumns(
  entry: SpecEntry,
  headers: Readonly<Record<string, readonly string[]>>,
): string[] {
  return Object.entries(entry.required).flatMap(([sheet, required]) => {
    const present = headers[sheet];
    if (!present) return [`缺少工作表「${sheet}」`];
    const missing = required.filter((h) => !present.includes(h));
    return missing.length > 0 ? [`${sheet}：缺少 ${missing.join('、')}`] : [];
  });
}
