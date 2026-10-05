---
name: project-state-2026-09-21
description: 2026-09-21 第一次跑 pre-PR 自檢時，這個 repo 實際上還沒有真正的第一個 commit
metadata:
  type: project
---

2026-09-21 進行第一次 pre-PR 自檢時發現：`git log` 只有一個 commit `085eb25 first commit`，且這個 commit 只改了 `README.md` 一行（把 `# ai-dashboard-poc` 換成完整的 Vite 官方模板 README）。整個 Vite + React + TS 起始模板（`src/`、`public/`、所有 config 檔）全部都停在 `git status` 的 "Changes to be committed"（staged，`A` 狀態），一個都還沒 commit。`origin/main` 和本地 `main` 都指向同一個 `085eb25`，repo 目前沒有其他分支（`git ls-remote --heads origin` 只有 `main`）。

**2026-09-21 第二輪自檢重新核對：狀態沒變。** 同一個 session 內修完 `.prettierrc`／`package.json`／`.prettierignore`／`README.md`／`.gitignore` 之後，這些修正**依然全部停在 staged**，`git log` 還是只有 `085eb25`，`origin/main` 也還是同一顆。另外這輪多了 `.claude/agent-memory/front-end-reviewer-pre-pr-checker/*.md`（5 個記憶檔）也被使用者一併 staged（透過 `.gitignore` 的 `**/.claude/*` + `!**/.claude/agent-memory/` 排除規則納入版控——用 `git check-ignore -v` 實測過，這個 negation pattern 確實生效，`.claude/settings.local.json` 仍被忽略，但 `agent-memory/` 底下檔案不會）。

**Why:** 這代表「base branch」跟「HEAD」實質上還是同一個 commit，比較基準只能用 `origin/main`（= HEAD），差異全部來自 staged 內容，不是 commit 歷史的差異。CLAUDE.md 裡「app 目前還是原封不動的 Vite starter」的描述，跟這次看到的內容完全一致。
**How to apply:** 如果下次自檢時這些檔案已經被 commit 過（有多個 commit、有實際 dashboard 功能），代表這個記憶已經過時，不要再假設專案還停在「全部未 commit 的空 scaffold」狀態 —— 要重新用 `git log`/`git status` 確認目前真實狀態，而不是套用這條舊記憶。同時要留意：agent memory 檔案本身現在也是 staged 變更的一部分，審查 diff 時要把它們跟其他變更分開列（它們不需要走型別/lint/prettier 驗證，但要一起計入「尚未 commit」清單）。
