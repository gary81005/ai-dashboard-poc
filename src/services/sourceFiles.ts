// 原始 Excel 檔的存取層：Storage 的 source-files bucket，路徑是 <user_id>/<dataset_id>.xlsx（ADR 0007）。
//
// RLS 只允許存取第一層資料夾等於自己 uid 的檔案，所以路徑一定要以目前使用者的 id 開頭。

import { useAuthStore } from '../store/authStore.ts';
import { supabase } from './supabase.ts';

const BUCKET = 'source-files';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function path(datasetId: string): string {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('尚未登入');
  return `${userId}/${datasetId}.xlsx`;
}

export async function uploadSourceFile(datasetId: string, buffer: ArrayBuffer): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path(datasetId), buffer, { contentType: XLSX_MIME });
  if (error) throw new Error(`上傳原始檔失敗：${error.message}`);
}

// 盡力刪除：檔案不存在不算錯誤，其他失敗只記錄，不擋住呼叫端的流程（留下的只是孤兒檔）。
export async function removeSourceFiles(datasetIds: string[]): Promise<void> {
  if (datasetIds.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(datasetIds.map(path));
  if (error) console.error('刪除原始檔失敗', error);
}
