---
name: supabase-setup
description: 專案改用 Supabase 後的檢查要點（base 是 main、prettier 會掃到 supabase/.temp、doc 同步）
metadata:
  type: project
---

此 repo 沒有 dev 分支，base 用 main。2026-10-13 起加入 Supabase（ADR 0007，雲端 project、不跑 Docker）。

- `npx prettier --check .` 會掃到被 supabase/.gitignore 忽略的 `supabase/.temp/*.json`（prettier 不讀巢狀 .gitignore），需在 .prettierignore 加 `supabase/.temp`。
- `.env.local` 由根 .gitignore 的 `*.local` 排除；檢查 staged diff 是否含 project ref。
- `src/types/database.ts` 是 `npm run db:types` 產生、已在 .prettierignore。
- 切換到 Supabase 的 PR 要同步 CLAUDE.md / CONTEXT.md / ADR 0005、0006 內仍寫 localStorage/IndexedDB 的敘述。
- vite-env.d.ts 的 ImportMetaEnv 擴充已實測有效（tsc 會抓到 string|undefined）。

**Why:** 避免下次重複摸索。 **How to apply:** 審 Supabase 相關 PR 時優先檢查上述項目。
