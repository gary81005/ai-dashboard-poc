// Supabase client 的唯一實例。其他 service 從這裡 import，UI 不直接碰它（ADR 0007）。

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// VITE_ 變數在 build 時寫入，缺少時在這裡就報錯，不要等到第一次請求才失敗。
if (!url || !publishableKey) {
  throw new Error(
    '缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY：本機請參考 .env.example 建立 .env.local，部署請在 Vercel 設定環境變數。',
  );
}

export const supabase = createClient<Database>(url, publishableKey);
