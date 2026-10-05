// IndexedDB 存取層：每個資料集的資料列存成一筆，key 為 dataset-rows:<datasetId>（ADR 0001）。
//
// 這裡只放資料列，設定 JSON 在 localStorage。之後要接後端，只需替換這個檔案。

import { del, get, set } from 'idb-keyval';
import type { DatasetRows } from '../types/index.ts';

const key = (datasetId: string) => `dataset-rows:${datasetId}`;

export function saveDatasetRows(datasetId: string, rows: DatasetRows): Promise<void> {
  return set(key(datasetId), rows);
}

export function loadDatasetRows(datasetId: string): Promise<DatasetRows | undefined> {
  return get<DatasetRows>(key(datasetId));
}

export function deleteDatasetRows(datasetId: string): Promise<void> {
  return del(key(datasetId));
}
