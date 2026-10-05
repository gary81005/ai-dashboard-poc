---
name: unused-dependencies
description: package.json 裡有一批完全沒被引用的相依套件，需要每次自檢時重新確認是否已開始使用
metadata:
  type: project
---

2026-09-21 首次自檢時，`package.json` 的 `dependencies` 有 `@emotion/react`、`@emotion/styled`、`@mui/material`、`@mui/x-charts`、`dayjs`、`xlsx`，但 `src/` 底下 grep 不到任何一個的 import（`grep -rn "mui\|emotion\|dayjs\|xlsx" src/` 沒有結果）。當時的 `src/App.tsx`/`src/main.tsx` 就是未修改的 Vite 起始模板。另外 `prettier` 被放在 `dependencies` 而不是 `devDependencies`，理論上應該是 dev 工具。

**2026-09-21 第二輪自檢重新核對：`prettier` 已修正（移到 `devDependencies`，見 [[prettierrc-mismatch]] 與 [[verification-commands]]）。MUI/emotion/dayjs/xlsx 仍然完全沒被使用**（重新跑過 `grep -rn "mui\|emotion\|dayjs\|xlsx" src/`，還是沒有結果），這條記憶對這幾個套件依然有效，繼續標 Warning。

**Why:** 這批套件的名稱（MUI charts、dayjs、xlsx）很像是為了「dashboard」這個 repo 名稱先預裝的，而不是真的裝錯或忘記清理，所以不直接判定為 Blocker，只標成 Warning 提醒使用者在 PR 描述講清楚意圖。
**How to apply:** 下次自檢時先重新 grep 一次這幾個套件在 `src/` 的使用情況 —— 如果已經開始用 MUI/dayjs/xlsx 寫功能了，這條記憶就過時了，不用再提「未使用」；如果還是完全沒用到，才繼續在報告裡問「這些是不是該移到之後真正需要時再加」。`prettier` 位置已確認修好，不用再提。
