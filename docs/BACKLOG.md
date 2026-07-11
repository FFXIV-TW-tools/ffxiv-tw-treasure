# BACKLOG

> 排序即優先序（上=先做）。條目由 agent 提、Owner 排序/否決；Owner 也可直接加。
> 完成打勾保留原句、尾巴追加 `✓ 完成於 cycle <id>`；否決用刪除線並留一行原因。格式見 DEVLOOP §4.2。
> 全項均 confirmed low/info（非缺陷）——2026-07-04 健檢「須修改」已全清並上線，此處為留觀察／低 ROI 硬化的單一佇列。
> 2026-07-11 R2 複檢建議（worker origin/連線上限、前端 ➕/✓·移焦·播報·進度、drift token 邊界、room-pure 抽測）亦全批清（見 CHANGELOG）；B-001~003 R2 複檢確認不變。

- [ ] **B-001** (P3, perf) route-list 就地 diff 取代整清單重建 — `js/app.js` `renderRoute` 每次廣播整份重畫 → 活躍組隊時 checkbox 閃動 / 焦點丟失。依 key 就地 diff。ROI 低、留觀察，回報卡頓再議。來源: 健檢 2026-07-04 建議（延續）
- [ ] **B-002** (P3, quality) styles.css 2 處裸色值改 `var(--token, fallback)` — `.tre-dig__co` 的 `color:#fff`（styles.css:201）、grade badge 的 `background:rgba(230,192,104,.12)`（styles.css:102）未走全站 token+fallback 模式（其餘 40+ 處已守）。低視覺風險、下次接觸 styles.css 順手改。來源: delta 稽核 2026-07-11
- [ ] **B-003** (P3, a11y) 挖掘卡 2048² 背景層行動端記憶體 — 大圖背景層在低階手機峰值記憶體偏高（~推測值、未實測）。觀察項，回報卡頓/崩頁再議。來源: 健檢 2026-07-04 建議（延續）

---

## 已決策不做（記錄，勿再開）

- ~~CSP `script-src` `'unsafe-inline'`→sha256 hash（`_headers`）~~ — ❌ 2026-07-04（Owner）：跨工具共享 portal bootstrap 都用 `unsafe-inline`，單改 treasure 不一致且 bootstrap 一改即失效（finding 本身認可保留）。
- ~~打錯房號進空房提示~~ — ❌ 2026-07-04（Owner）：已由「空房送 op 被 `!st` 拒」間接改善；純 client 猜測式提示易誤報。
- ~~單人本地暫存清單（localStorage）開房一鍵灌入~~ — ❌ 2026-07-04：enhancement 非缺陷，對話未要求。
