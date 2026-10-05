# Memory Index

- [驗證指令與專案基本設定](verification_commands.md) — build/lint/prettier 三件套指令、無測試/無 changesets、node 版本綁定
- [.prettierrc 曾跨專案複製留下錯誤設定](prettierrc_mismatch.md) — 已解決（2026-09-21 第二輪確認 prettier --check 通過）
- [專案 commit 狀態](project_state_2026-09-21.md) — 整包起始模板 + agent memory 仍全部停在 staged，尚未 commit
- [package.json 內未使用的相依套件](unused_dependencies.md) — MUI/emotion/dayjs/xlsx 仍完全沒被引用；prettier 位置已修正
- [agent memory 納入版控的 gitignore 寫法](agent_memory_in_vcs.md) — `**/.claude/*` + negation 排除模式，實測有效
