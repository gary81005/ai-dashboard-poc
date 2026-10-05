---
name: prettierrc-mismatch
description: .prettierrc 曾經從其他 Clinico 專案複製過來造成設定不符——2026-09-21 第二輪自檢已確認修好
metadata:
  type: project
---

**狀態：已解決（2026-09-21 第二輪自檢確認）。** 使用者移除了 `plugins: ["prettier-plugin-tailwindcss"]` 與四個 `importOrder*` 鍵，`semi: true` 維持不變。實測 `npx prettier --check .` 現在通過（`All matched files use Prettier code style!`），`npm run build`／`npm run lint` 也都乾淨。`src/App.tsx` 等檔案已因 `semi: true` 補上分號、單引號，純格式化、無行為變更（用 `npm run build` 產物與 `eslint .` 零錯誤確認過）。以下是原始問題記錄，供對照：

原始（2026-09-21 首次自檢時發現，當時還是全部 staged 未 commit 的初始 scaffold）有兩個跟本專案不符的地方：

1. `"plugins": ["prettier-plugin-tailwindcss"]`，但 `package.json` 完全沒裝這個套件，也沒裝 tailwindcss 本身。實際跑 `npx prettier --check .` 會直接報錯 `Cannot find package 'prettier-plugin-tailwindcss'`，整個 prettier 沒辦法用。
2. `importOrder` 規則指向 `^@/page`、`^@/components`、`^@/hook|^@/utils` 這種 `@/*` path alias，但 `tsconfig.app.json` / `tsconfig.node.json` 都沒有設定任何 `paths`/`baseUrl`，`src/` 底下 grep 不到任何 `@/` 用法。
3. `"semi": true`，但目前 `src/App.tsx`、`src/main.tsx` 全部都是無 semicolon 風格（`grep -c ";$"` 結果是 0）。如果 prettier plugin 問題被修好後直接 `--write`，會對整個 codebase 補上大量 semicolon，造成不必要的格式化雜訊。

**Why:** 這些設定值在此專案裡沒有任何依據（沒有 tailwind、沒有 path alias、現有程式碼原本是 no-semi 風格），最合理的解釋是從另一個用 Tailwind + `@/*` alias 慣例的 Clinico 專案複製過來、忘記調整。CLAUDE.md 沒提到 Tailwind，反而明確說明用 CSS custom properties（`src/index.css` 的 `:root` + dark mode block）。
**How to apply:** 已解決，不用再標成 Warning。之後若 `.prettierrc` 又出現 `plugins`/`importOrder*`/其他跟現有慣例（無 tailwind、無 `@/*` alias）不符的鍵，才需要重新檢查；否則每次自檢只需快速確認 `npx prettier --check .` 仍通過即可，不必重新讀整份設定。
