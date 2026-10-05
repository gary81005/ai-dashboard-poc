// 執行查詢並把錯誤轉成結果物件，讓 widget 元件不必在 render 裡寫 try/catch。
//
// 這樣 React Compiler 才能正常優化元件；欄位遺失也只影響單一 widget，不會讓整頁壞掉。

import { MissingFieldError } from './query.ts';
import type { FieldRef } from '../types/index.ts';

export type QueryOutcome<T> =
  { ok: true; value: T } | { ok: false; missing?: FieldRef; message: string };

export function runQuery<T>(query: () => T): QueryOutcome<T> {
  try {
    return { ok: true, value: query() };
  } catch (error) {
    if (error instanceof MissingFieldError) {
      return { ok: false, missing: error.ref, message: error.message };
    }
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
