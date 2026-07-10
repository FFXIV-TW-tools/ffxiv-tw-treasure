@AGENTS.md

# Claude 專屬

- 全域行為原則（Plan／強制驗證＋證據回報／不用提問收尾／Karpathy 4 大）與模型分工（tier→型號、複審層級判定）：見 global `~/.claude/CLAUDE.md`＋monorepo `../../CLAUDE.md`（此處不重複）。
- 定位與規模／架構鐵則／VERIFY 基線／架構索引／開發循環：見 `@AGENTS.md`（本檔只放 Claude 工具專屬對照）。
- Phase→skill 對照：Brainstorm→superpowers:brainstorming／Plan→superpowers:writing-plans（需 spec/plan 時存 `docs/specs/<topic>-design.md`，本 repo 目前無 specs 目錄、建立時一併帶 front-matter）／Build→superpowers:test-driven-development＋executing-plans／Verify→superpowers:verification-before-completion／Review→superpowers:requesting-code-review（或 /code-review）。
- 改 UI/CSS 前：先 Read `../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md`（AGENTS.md「改 UI / CSS 前」段）。
- Git 邊界：測綠即 commit（先知會）、**不主動 push**、**不主動 deploy worker**——push 走 cmd.exe（shawn 自跑）、worker deploy 是 STOP。external skill 流程一律止於 commit。
- 定期審計分流：輕量 delta 維護按需；深度 project-health-review 僅 Owner 手動 opt-in（重、多 agent，不掛排程）。
