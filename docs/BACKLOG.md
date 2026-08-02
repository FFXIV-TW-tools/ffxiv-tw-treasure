# BACKLOG

> 排序即優先序（上=先做）。條目由 agent 提、Owner 排序/否決；Owner 也可直接加。
> 完成打勾保留原句、尾巴追加 `✓ 完成於 cycle <id>`；否決用刪除線並留一行原因。格式見 DEVLOOP §4.2。
> 全項均 confirmed low/info（非缺陷）——2026-07-04 健檢「須修改」已全清並上線，此處為留觀察／低 ROI 硬化的單一佇列。
> 2026-07-11 R2 複檢建議（worker origin/連線上限、前端 ➕/✓·移焦·播報·進度、drift token 邊界、room-pure 抽測）亦全批清（見 CHANGELOG）；B-001~003 R2 複檢確認不變。
> **2026-08-01 R3 全維健檢**（7 維，首含 build-release）新增 B-006～B-014＝該輪「須修改」9 項（計畫見 `docs/health-reviews/2026-08-01-R3全維-fix-plan.md`）。B-001／B-002／B-003 本輪複核確認不變、不重報。
> **2026-08-02 執行**：不需 Owner 拍板的 7 項（B-006／007／008／009／010／011／014）已完成（cycle `2026-08-02-R3-fixes`，見 CHANGELOG）；B-010 拆出追蹤項 B-015。**剩 B-012／B-013 待 Owner 選做法**；B-006 已修並於 **2026-08-02T15:14:05Z deploy、線上驗證通過**（攻擊回 405、點無損）。
> **四軸快篩（DEVLOOP §4.2）**：開放條目在 `(P, type)` 後**前置** `【建議 高/中/低｜延遲風險 低/中/高｜執行風險 低/中/高｜副作用 無/一句具體】`——建議＝提案方誠實推薦；延遲風險＝不快點做的風險；執行風險＝反悔成本；副作用＝除主目標外還會動到什麼。由 `check-devloop-artifacts` **R11** 機械檢查：新條目缺軸即擋 commit。

- [x] **B-006** (P1, security)【建議 高｜延遲風險 中｜執行風險 中｜副作用 動 worker 路由層＋需一次 deploy STOP】 `POST /room/:code` 未授權即整份覆蓋房間權威清單 — `worker/src/index.js:160-162` 不分 method 原封轉發到 DO，`Room.fetch:212-223` 對任何非 WS 的 POST 一律當 seed。**2026-08-01 線上實證**（自建測試房）：無 Origin、`text/plain`、空 body 的 POST 回 200 且點被清空，且**不廣播** → client 停在舊清單直到下一個 op 才「全隊點突然消失」；並重設 6h alarm（可復活過期房）。門檻只有 6 碼房號。修法：default fetch 只轉發 GET/WS，`Room.fetch` POST 加 `pathname === '/seed'` 守衛（兩層），並抽純函式釘測試。來源: 健檢 2026-08-01 須修改 1 ✓ 完成於 cycle 2026-08-02-R3-fixes
- [x] **B-011** (P2, tests)【建議 高｜延遲風險 中｜執行風險 低｜副作用 四支測試需印可抓的 assert 數】 測試基線 86 assert 無 `TEST-BASELINE` 標記 → monorepo gate 6 對本 repo 整支跳過（實跑確認「檢查 0 項｜跳過 1 個 repo」）；13 個 external repo 已有 7 個接上。目前數字剛好正確（實測 14/17/10/45＝86），但「只准升不准降」純靠人工紀律。修法：測試印總數 + `AGENTS.md` VERIFY 段加 TEST-BASELINE 註解。來源: 健檢 2026-08-01 須修改 7 ✓ 完成於 cycle 2026-08-02-R3-fixes
- [x] **B-007** (P1, docs)【建議 高｜延遲風險 中｜執行風險 低｜副作用 無（改一行指令＋一行判讀規則）】 部署面鐵則的「部署後驗」指令會誤報紅燈 — `AGENTS.md:117` 的 `curl -sI .../AGENTS.md` 未帶 cache-bust；實測現行部署乾淨但該指令仍回 `text/markdown`（舊部署邊緣快取 `CF-Cache-Status: HIT`、`Age≈8.6h`、`s-maxage=604800`）。新鐵則段裡唯一的驗收動作照跑必得假紅燈 → 下次真外洩會被當雜訊（哨兵最怕的失效模式）。來源: 健檢 2026-08-01 須修改 2 ✓ 完成於 cycle 2026-08-02-R3-fixes
- [x] **B-008** (P2, docs)【建議 高｜延遲風險 低｜執行風險 低｜副作用 無】 AGENTS.md:94／CLAUDE.md:7 宣稱「本 repo 無 `docs/specs/`」，但 spec 自 2026-07-30 已存在且 CHANGELOG:33 已 link — 同一份 AGENTS 第 10 條又要求「實作前必開該 cycle spec 全文」，讀者被前句說服而跳過，而該 spec 正裝著翻轉過兩次的「只收 type 0 主水晶」決策。來源: 健檢 2026-08-01 須修改 3 ✓ 完成於 cycle 2026-08-02-R3-fixes
- [x] **B-009** (P2, docs)【建議 中｜延遲風險 低｜執行風險 低｜副作用 無】 README 結構區塊落後兩輪 — 缺 `js/app-modal.js`／`route-map.js`／`route-panel.js`（index.html 實載 7 支），且完全沒提 `deploy-prepare.sh`＋allow/deny＋`_headers` 這條 build pipeline。README 是給不讀 AGENTS 的人的唯一地圖，照它工作會把面板碼寫回 app.js、也不知新增站台資產要登記允許清單。來源: 健檢 2026-08-01 須修改 4 ✓ 完成於 cycle 2026-08-02-R3-fixes
- [x] **B-010** (P2, docs)【建議 中｜延遲風險 中｜執行風險 低｜副作用 無（純 Record）】 補 08-01 部署輪的 repo-local 收官段（cycle 用 root 既有的 `2026-08-01-deploy-surface`，勿另造 id）＋開一條**帶日期的快取殘留複探**（2026-08-08 後跑 `sh C:/FFXIVProject/tools/check-deploy-surface.sh` 確認 treasure 轉綠即關）。五個 `fix(deploy)` commit（含自標 `!`）未動 CHANGELOG／BACKLOG；root CHANGELOG 已有完整記錄故非「歷史不存在」，真缺口是 repo-local 工件無收官段、且殘留狀態無追蹤落點。來源: 健檢 2026-08-01 須修改 8 ✓ 完成於 cycle 2026-08-02-R3-fixes
- [ ] **B-012** (P2, perf)【建議 中｜延遲風險 低｜執行風險 中｜副作用 A 案動 build-data.py 並讓 repo 變大 ~1 MB；B 案幾乎無效於桌機】 step 2 選等級一次下載 ~4 MB 原尺寸地圖當縮圖 — 實測底圖每張 **618–760 KB**、上游 v2.xivapi.com **不支援縮圖參數**（`?w=`／`?size=`／`?format=` 皆回同一份），而 G9–G12 各 6 張圖；使用者最終只用其中一張。**需 Owner 拍板 A（建置期產 256px webp 縮圖）或 B（IntersectionObserver 延後載入）**。來源: 健檢 2026-08-01 須修改 5
- [ ] **B-013** (P2, ux)【建議 中｜延遲風險 低｜執行風險 低｜副作用 改變未入房時點卡片的行為】 單人模式沒有複製座標的路徑，且點卡片會被捲走 — 挖掘卡唯一點擊行為是 `toggleMine`，未入房時跳 toast 並 `scrollIntoView` 到頁首房間 bar（正在比對的卡片被捲走）；全站唯二複製入口都在共享路線面板內，單人使用者拿不到已寫好的 `/p 地名 ( 21.0 , 14.0 )`。卡片 `aria-label` 亦寫死「加入共享路線」。修法：未入房時改開既有 `MODAL.mapView`（已支援 `onCopy`）。來源: 健檢 2026-08-01 須修改 6
- [x] **B-014** (P3, docs)【建議 中｜延遲風險 低｜執行風險 低｜副作用 無（刪內嵌摘要，保留本 repo 差異）】 AGENTS.md 開發循環段仍是「內嵌 10 條摘要＋版本戳（對齊 DEVLOOP v1.20）」，而 **v1.21（2026-07-29）§4.4 已改 pointer-only、per-repo 版本戳整族退役**（理由：抄一份會過期的摘要＝第二真相源）；`node tools/check-devloop-artifacts.js --repo external/ffxiv-tw-treasure` 出 R18 警示（不影響 exit）。修法：刪版本戳與內嵌摘要、保留正典 pointer ＋本 repo 專屬差異（VERIFY 命令／cycle id 格式／部署面鐵則），**不要整段刪**；順帶修 R15 的 3 條 pointer 斷鏈寫法。來源: 健檢 2026-08-01 須修改 9（機械閘抓到、非 fan-out） ✓ 完成於 cycle 2026-08-02-R3-fixes
- [ ] **B-015** (P2, security)【建議 高｜延遲風險 低｜執行風險 低｜副作用 無（純探測）】 **2026-08-08 後複探邊緣快取殘留** — 08-01 改 fail-closed 前的舊部署物件仍留在 CF 邊緣（`s-maxage=604800`，最長 7 天），不帶 cache-bust 打 `/AGENTS.md` 會回 `text/markdown`。pages.dev 非自有 zone、無 Purge Everything → 只能等 TTL。屆時跑 `sh C:/FFXIVProject/tools/check-deploy-surface.sh` 確認 treasure 轉綠即打勾關閉；若仍紅，用 cache-bust 版指令確認是殘留還是真外洩。來源: 健檢 2026-08-01（B-010 拆出的追蹤項）
- [ ] **B-001** (P3, perf)【建議 低｜延遲風險 低｜執行風險 中｜副作用 動即時廣播的渲染路徑（組隊同步時序）】 route-list 就地 diff 取代整清單重建 — `js/app.js` `renderRoute` 每次廣播整份重畫 → 活躍組隊時 checkbox 閃動 / 焦點丟失。依 key 就地 diff。ROI 低、留觀察，回報卡頓再議。來源: 健檢 2026-07-04 建議（延續）
- [ ] **B-002** (P3, quality)【建議 低｜延遲風險 低｜執行風險 低｜副作用 無（2 處色值，低視覺風險）】 styles.css 2 處裸色值改 `var(--token, fallback)` — `.tre-dig__co` 的 `color:#fff`（styles.css:201）、grade badge 的 `background:rgba(230,192,104,.12)`（styles.css:102）未走全站 token+fallback 模式（其餘 40+ 處已守）。低視覺風險、下次接觸 styles.css 順手改。來源: delta 稽核 2026-07-11
- [x] **B-004** (P3, quality)【建議 低｜延遲風險 低｜執行風險 低｜副作用 無（只動 worker 測試導出方式，協定不變）】 `wrangler dev` 起不來 — `worker/src/index.js:270` 為測試導出的 `MAX_CONN`（number）被 workerd 拒收「Incorrect type for map entry 'MAX_CONN': not of type 'function or ExportedHandler'」→ 本地無法端到端 smoke 真房間（只能靠 worker.test.mjs + 線上）。修法：常數改由測試從原始碼推導、或改導出取值函式。正式 deploy 不受影響。來源: 2026-07-30 顯示名輪 smoke 實踩 ✓ 完成於 cycle 2026-07-30-aetheryte-on-map
- [ ] **B-005** (P3, feature)【建議 低｜延遲風險 低｜執行風險 中｜副作用 動 DO applyOp 協定＋需 worker deploy】 改名回溯既有點（DO `rename` op）— 顯示名是加點當下快照進每個點，改名只影響之後加的點。要全隊看到一致名稱需 DO 依 owner 批次改 ownerName 並廣播。Owner 2026-07-30 判本輪不做（多數人一進房就設好名字）；若回報「改名後舊點還是舊名很困惑」再議。來源: 2026-07-30 顯示名輪（Owner 選純前端範圍）
- [ ] **B-003** (P3, a11y)【建議 低｜延遲風險 低｜執行風險 低｜副作用 動挖掘卡視覺資產（換圖／降解析度會改觀感）】 挖掘卡 2048² 背景層行動端記憶體 — 大圖背景層在低階手機峰值記憶體偏高（~推測值、未實測）。觀察項，回報卡頓/崩頁再議。來源: 健檢 2026-07-04 建議（延續）

---

## 已決策不做（記錄，勿再開）

- ~~CSP `script-src` `'unsafe-inline'`→sha256 hash（`_headers`）~~ — ❌ 2026-07-04（Owner）：跨工具共享 portal bootstrap 都用 `unsafe-inline`，單改 treasure 不一致且 bootstrap 一改即失效（finding 本身認可保留）。
- ~~打錯房號進空房提示~~ — ❌ 2026-07-04（Owner）：已由「空房送 op 被 `!st` 拒」間接改善；純 client 猜測式提示易誤報。
- ~~單人本地暫存清單（localStorage）開房一鍵灌入~~ — ❌ 2026-07-04：enhancement 非缺陷，對話未要求。
