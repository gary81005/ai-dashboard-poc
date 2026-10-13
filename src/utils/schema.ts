// 讀取資料庫記錄時的格式檢查與轉換（ADR 0007）。每筆 datasets／dashboards 都帶 schema_version，
// 取代原本 Zustand persist 外層的 version；格式規則見 ADR 0005。

import type { Json } from '../types/database.ts';
import { SCHEMA_VERSION } from '../types/index.ts';

// 把資料庫的 body 轉成目前版本的形狀。目前只有 v1，沒有舊格式要轉換；
// 之後改版時在這裡依 version 逐步轉換。遇到比程式還新的格式就丟錯，不要用舊邏輯硬讀。
export function migrateRecord<T>(body: Json, version: number, label: string): T {
  if (version > SCHEMA_VERSION) {
    throw new Error(`${label}的格式 v${version} 比目前程式支援的 v${SCHEMA_VERSION} 還新`);
  }
  return body as unknown as T;
}
