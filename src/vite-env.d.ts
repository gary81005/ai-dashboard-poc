/// <reference types="vite/client" />

// 宣告成可能是 undefined：.env.local 或 Vercel 沒設定時，services/supabase.ts 要能檢查出來。
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
