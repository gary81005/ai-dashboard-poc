---
name: agent-memory-in-vcs
description: 使用者選擇把 .claude/agent-memory 納入版控，並用 gitignore negation pattern 排除其他 .claude 內容
metadata:
  type: project
---

2026-09-21 第二輪自檢時，使用者在 `.gitignore` 新增兩行：

```
**/.claude/*
!**/.claude/agent-memory/
```

意圖是：`.claude/` 底下大部分內容（例如 `settings.local.json`）不進版控，但 `agent-memory/` 這個子目錄要進版控（讓 pre-PR checker 這類 agent 的記憶可以跨 clone／跨開發者共享）。

實測驗證（`git check-ignore -v`）：

- `.claude/settings.local.json` → 被 `.gitignore:25:**/.claude/*` 忽略（符合預期）。
- `.claude/agent-memory/front-end-reviewer-pre-pr-checker/MEMORY.md` → 不被忽略（exit 1），可以正常 `git add`。
- `.claude` 目錄本身沒有被任何規則忽略（只有它的內容 `.claude/*` 被排除），所以 git 會遞迴進去檢查，negation 對 `agent-memory/` 才生效——這是這個 pattern 能work 的關鍵，如果改成排除 `.claude/` 本身（而不是 `.claude/*`），底下的 negation 就會失效（git 不會遞迴進已被忽略的目錄）。

這個 pattern 目前是**正確且有效**的，不是 Blocker。但「把 AI agent 的自檢記憶檔案提交進團隊共用的 git repo」本身是一個產品/流程決策（不是純技術正確性問題），值得在 PR 描述講清楚意圖，避免 reviewer 看到不熟悉的 `.claude/` 路徑時感到困惑或誤以為是誤加的檔案。

**Why:** gitignore 的目錄排除規則有個常見陷阱——排除父目錄本身會讓子目錄的 negation 完全失效，這不是一看就懂的行為，容易踩雷，所以值得記錄「這個 repo 用的寫法是對的」，下次不用重新驗證。
**How to apply:** 之後如果 `.claude/agent-memory/` 底下的檔案在自檢時看起來沒被 track 到，先用 `git check-ignore -v <path>` 確認是不是 `.gitignore` 規則被改動過（例如有人把 `**/.claude/*` 改成 `**/.claude/` 導致 negation 失效）。PR 描述草稿裡繼續提醒使用者說明「為何 agent memory 要進版控」，屬於 Nitpick／建議說明，不是 Blocker。
