---
name: verification-commands
description: ai-dashboard-poc 專案實際可用的驗證指令與環境限制，供下次自檢直接套用
metadata:
  type: project
---

- 驗證指令固定兩個：`npm run build`（= `tsc -b && vite build`）與 `npm run lint`（= `eslint .`）。沒有測試 runner，也沒有 `.changeset/` 目錄或 changeset 相關 script，所以 Changesets 檢查步驟目前不適用，直接跳過即可。
- 不是 monorepo，`tsc -b` 直接跑，不需要指定 `-p` 某個子專案的 tsconfig。
- lint 設定（`eslint.config.js`）用的是 `tseslint.configs.recommended`（非 type-aware），所以 `tsc -b` 會抓到 lint 抓不到的型別問題，兩者都要跑，不能只跑一個。
- `.nvmrc` 指定 node v24.21.0，且截至 2026-09-21 本機環境與此版本一致；`node_modules` 已安裝且與 `package.json`/`package-lock.json` 一致（`npm ls --depth=0` 乾淨無 UNMET）。
- 專案有 `.prettierrc`/`.prettierignore`，但 `npm run build`/`npm run lint` 都不會跑 prettier —— 目前沒有 `format` / `format:check` script，要另外手動跑 `npx prettier --check .`。2026-09-21 第二輪自檢確認 `.prettierrc` 的 tailwind plugin／importOrder 問題已修好（見 [[prettierrc-mismatch]]），三個指令（`npm run build`、`npm run lint`、`npx prettier --check .`）目前**都通過**，可以當作這個專案的標準三件套驗證組合。
- `prettier` 已從 `dependencies` 搬到 `devDependencies`，且 `npm ls --depth=0` 乾淨無 UNMET，`package-lock.json` 已同步。

**Why:** 每次自檢都要先確認這幾點還成立（指令名稱、有沒有新增 changeset 機制、prettier 是否真的可跑），不要每次都重新摸索一遍。
**How to apply:** 之後對這個 repo 做 pre-PR 自檢，直接用 `npm run build`＋`npm run lint`＋`npx prettier --check .` 三個指令做主要驗證依據；如果 `.changeset/` 出現了或 package.json 多了 changeset script，代表流程已改變，要重新走一次 changeset 檢查步驟。
