@AGENTS.md

# Claude 專屬

- 全域行為原則（Plan／強制驗證＋證據回報／不用提問收尾／Karpathy 4 大）與模型分工（tier→型號、複審層級判定）：見 global `~/.claude/CLAUDE.md`＋monorepo `../../AGENTS.md`（規則本體；同層 `CLAUDE.md` 只是 `@AGENTS.md` adapter）。此處不重複。
- 定位與規模／架構鐵則／VERIFY 基線／架構索引／開發循環：見 `@AGENTS.md`（本檔只放 Claude 工具專屬對照）。
- Phase 對照（superpowers 已於 2026-07-17 退役，勿再引用其 skill）：Brainstorm／Plan→DEVLOOP 模板 `~/.claude/process/templates/`（spec 存 `docs/specs/<cycle>-design.md`＋front-matter（**已建**，首份＝`2026-07-30-aetheryte-on-map-design.md`）、plan 存 `docs/plans/<cycle>-plan.md`（尚未建，需要時照此契約））／Build→TDD（`karpathy-guidelines`）／Verify→AGENTS.md「VERIFY」段／Review→`/code-review`（難回頭 commit 加 `adversarial-review`）。
- 改 UI/CSS 前：先 Read `../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md`（AGENTS.md「改 UI / CSS 前」段）。
- Git 邊界：測綠即 commit（先知會）、**不主動 push**、**不主動 deploy worker**——push 由 Owner 跑 `bash ~/.claude/skills/process/tools/safe-push.sh --repo C:/FFXIVProject/external/ffxiv-tw-treasure --reason "<原因>"`（canonicalTest 綠才推＋JSONL 留痕，2026-07-21 裁示；**裸 `git push` 被 hook 硬擋、不得繞**，也不要改列 `!git push` 代跑。401 ＝ Credential Manager 只在 cmd／git-bash 抓得到，改在 git-bash 重跑）、worker deploy 是 STOP。external skill 流程一律止於 commit。
- 定期審計分流：輕量 delta 維護按需；深度 project-health-review 僅 Owner 手動 opt-in（重、多 agent，不掛排程）。
