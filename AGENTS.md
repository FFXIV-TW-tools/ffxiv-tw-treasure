# AGENTS.md — ffxiv-tw-treasure

FFXIV 繁中服（陸行鳥 DC）藏寶圖工具：選等級→選地圖→比對謎題圖找挖掘座標（單人純查詢）；多人＝房間共享路線（op-based DO，即時同步、自動排最省動線）。FFXIV-TW-tools portal 之一。

- **線上**：https://ffxiv-tw-treasure.pages.dev/（Cloudflare Pages · private repo `FFXIV-TW-tools/ffxiv-tw-treasure`）
- **協作後端**：`ffxiv-tw-treasure-room.ffxiv-tw-tools.workers.dev`（Worker + Durable Object + WebSocket）
- **本機預覽**：`py -m http.server 8799` → 127.0.0.1:8799（需 portal CDN：`svc start portal`，否則 codex 樣式/FFXIVToast 不載）

---

## 定位與規模

- **規模級別：M（中型，DEVLOOP §5）**——單一產品目的、單 repo 心智可含（~1.8k 行源碼），但含**兩個鬆耦合子系統**：① 純靜態前端查詢（挖掘點資料打包站內、零後端依賴）② Cloudflare Durable Object 房間後端（WebSocket 即時協作、op-based 協定）＋golden 測試閘。行數接近 S/M 邊界但因有獨立後端子系統與並發協定判 M；預設完整循環、可逆單檔小修走旁路。**非 L**（無需分解層、無 Gate 0）。
- external 公開工具，獨立 git repo（自帶 `.git`），與 monorepo 解耦；本 repo 自帶 DEVLOOP 工件（本檔＋`CHANGELOG.md`＋`docs/BACKLOG.md`）。
- 規則層級：改動前先讀本檔鐵則；衝突時 **本 repo > external > monorepo project > global**。

---

## 架構鐵則（違反易壞）

- **協作後端用 Durable Object，不用 KV**：presence 靠 `getWebSockets().length`（0 storage 寫）；op-based＝client 送操作、DO 單執行緒序列套 `applyOp` 再廣播 → **並發加點不互蓋**（勿改回「整份覆蓋」，那正是 mit 早期並發掉點的坑）。
- **不要樂觀 toast 假成功**（2026-07-04 健檢）：斷線/重連視窗內 `room.js send()` 會靜默丟棄 op（`ws.readyState!==1`）。送任何 op（add/remove/done/order/clear）前**必先 `ensureConnected()`**（兩層 gate：`isInRoom()`→`isConnected()`），未連上給「連線中」提示、**不可**先跳「已加入」成功 toast → 否則使用者無感掉點，正面違反工具核心承諾「多人清單不掉點」。
- **破壞性操作對全隊權威清單生效、DO 無 undo**（2026-07-04 健檢）：清空 / 清除已完成 / 移除**隊友的**點，一律過 `confirmModal(...)` 二次確認 + 成功 toast。刪**自己的**點一鍵即可（不擋正當協作）。
- **確認框依 portal codex-modal，不用原生 `confirm()`**：用 `js/app.js` 的 `confirmModal()`（`.codex-modal-overlay/.codex-modal` + `.codex-btn--danger` + `FFXIVA11y.trapFocus`，回 Promise<boolean>）。設計系統要求 ESC + overlay 點擊關閉。
- **root `package.json` 不可設 `"type":"module"`**（2026-07-04 踩過）：`treasure-core.js` 是 UMD（`module.exports`），設了會把它當 ESM → `.mjs` 測試的 `import TC from` default-import 失效。root 保持 CJS；`.mjs` 測試本就 ESM 不受影響。`worker/` 自帶 `"type":"module"`（worker code 是 ESM）不衝突。
- **`DIG_W/DIG_H`(app.js) ↔ `--dig-w/--dig-h`(styles.css) 雙寫必須同值**：裁切卡偏移用 JS 常數、卡片視窗尺寸用 CSS，漂移 → pin 偏離挖掘點。`tests/drift.test.mjs` 機械守（改動後跑 `npm test`）。
- **`improve2Opt`（2-opt）是閉環假設**（尾端 `(k+1)%length` 幻邊）：本工具是**開放路徑**（`calcTotalDistance` 只累加 n-1 段）。目前 `use2Opt` 預設關、無產品呼叫者；啟用前先修尾端幻邊，且測試用**固定 golden `deepEqual`**釘行為，**勿用**「≤ 非2opt」單調斷言（開放路徑下會 flaky）。
- **繁中至上 / 繁中名走本地權威源**：物品名 = `item_lookup.name_sc → OpenCC s2twp`（`name_tc` 對藏寶圖是通用「地圖Gxx」錯名）；地名 = `place_names.json`（map-id keyed）。**禁自建對照表**。座標公式 = FFXIV 官方 datamining；路線演算法移植自 cycleapple/xiv-tc-treasure-finder（移植時對 reference 跑過 parity）。
- **前端零 HTML sink**：全程 `createElement`+`textContent`、事件委派、無 inline handler（CSP friendly）— 維持此姿態，勿引入 `innerHTML`。
- **檔案 ≤ 500 行（新檔）/ 遇授權牆不靜默跳過**：目前最大 `app.js` 466 行（近 500 門檻、尚未觸發；下次實質接觸時 review 職責），其餘各檔偏小；維持職責清楚。

---

## 改 UI / CSS 前

先 Read `../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md`（codex 元件 / token / modal / `.codex-tablet` padding 鐵則）— 設計權威單一來源，不憑記憶寫。色值一律走 `var(--token, fallback)` 模式（token 優先、CDN 失效時 fallback 兜底），勿裸寫 hex/rgba。

---

## VERIFY（改動後必跑）

> 測試基線 **4 套全綠 · 73 assert 呼叫**（core 11 / room-pure 12 / drift 5 / worker 45；`npm test` exit 0；**只准升不准降**；2026-07-11 R2 修復後實測）。

```bash
npm test   # 串三套：core（座標/路線 golden）+ drift（DIG常數/maps image/死CSS）+ worker（op-based 並發不互蓋）
# 或個別跑：
node tests/core.test.mjs           # 座標換算 + 路線優化 golden（含 dormant 2-opt 固定 golden）
node tests/room-pure.test.mjs      # room client 純輔助：backoffDelay 退避上限 + sanitizeJoinCode 房號淨化
node tests/drift.test.mjs          # DIG_W/DIG_H↔CSS 同步 + maps.json image 安全 + 無死 CSS（token 邊界比對）
node worker/tests/worker.test.mjs  # 房間 applyOp/validate/originAllowed/roomFull（含「並發加點不互蓋」證明）

py -3.11 tools/build-data.py       # 改資料源後重建 data/{grades,maps,treasures}.json（需 opencc；有缺涵蓋率 exit 1）
cd worker && pnpm cf:deploy:dry    # worker 改動後部署前驗（0 error 才 STOP 交 shawn 正式 deploy）
```

- 無 lint / typecheck（純 JS，無 TS 設定）。無 cachebust 腳本——本地 `.js/.css` 引用未帶 `?v=`（CF Pages `must-revalidate` 傳播；改 js/css 無額外步驟）。
- UI smoke（改前端後）：`py -m http.server 8799`（先 `svc start portal` 載 CDN）→ 三步精靈流程 + 多人房間建/加入/加點/清空確認框。

---

## 架構索引

| 檔案 | 職責 |
|------|------|
| `index.html` | shell（portal CDN document.write 注入 header/tokens）+ 三步精靈 DOM |
| `styles.css` | 工具樣式（用 portal codex token/元件；色值走 `var(--token, fallback)`）|
| `js/treasure-core.js` | 純函式（UMD）：座標換算 `(coord-1)*SizeFactor/40.96` + 路線優化（map 分組 greedy 最近鄰 + optional 2-opt）|
| `js/app.js` | 三步狀態機 + 裁切卡/全圖渲染 + 房間 UI + 共享路線面板 + `confirmModal`（最大檔 454 行）|
| `js/room.js` | 多人房間 client（WebSocket、op-based、自動重連 backoff、6h 自動重連）— 基於 mit-planner `app-room.js` 改 |
| `js/room-pure.js` | room client 純輔助（UMD、無環境依賴、可單元測試）：重連退避 `backoffDelay` + 房號淨化 `sanitizeJoinCode` |
| `worker/src/index.js` | 房間 API：**Durable Object**（`Room` class，op-based `applyOp` 純函式、SQLite storage、6h alarm 過期）— 獨立 wrangler，**Pages 不 build 它** |
| `data/{grades,maps,treasures}.json` | 生成資料（`tools/build-data.py` 從 Teamcraft + 本地 item_dict 產）|
| `tests/`、`worker/tests/` | golden / drift / op-based 並發正確性 |

---

## 開發注意（commit / push / deploy）

- **commit**：通則見 `../CLAUDE.md`「commit / push 通則」；動手前先列「要 commit `<檔案>`、訊息 `<message>`」知會，無反對才執行（不把 stage+commit 塞同一連鎖命令）。**繁中 Conventional Commits，不加 Co-Authored-By**。
- **push = STOP**：本 repo 獨立 `.git`；push 走 **cmd.exe**（Windows Credential Manager 在 cmd/git-bash 才抓得到），由 shawn 自跑。push `main` → Cloudflare Pages 自動 build **前端**。
- **worker deploy = STOP**：`worker/` 改動才需 `pnpm -C worker cf:deploy`（前端 push 不觸發 worker 部署）；先 `pnpm cf:deploy:dry` 驗 0 error。deploy 防呆見 monorepo `docs/runbooks/deploy-runbook.md`。
  - 部署狀態查證（read-only，需 wrangler 已登入）：`cd worker && npx wrangler deployments list`（列 UTC 時間戳，對比 worker/ 最新 commit 判是否已上線）。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`；本 repo 工件：`CHANGELOG.md`、`docs/BACKLOG.md`（本 repo 目前無 `docs/specs/`——小工具多走旁路，需 spec 時建）。摘要（對齊 DEVLOOP v1.6；正典不可得時以此為準）：

1. 循環：Intake→Brainstorm→[Gate1 Owner 拍板 spec]→Plan→Build(TDD，適用可測行為變更；純文件走 lint/smoke)→Verify→Review→Record(changelog)→Close+Propose→[Gate2 驗收＋排序]→回 BACKLOG。
2. 小修旁路可跳 spec/plan；**Verify 與 Record 永不可跳**（測試綠＋changelog 一行）；資料模型／對外契約／刪除遷移／安全類**即使單檔不可旁路**。
3. 複審者能力階 ≥ 實作者；未驗證不算完成；能跑≠完成。
4. spec 放 `docs/specs/`（front-matter `status/type/cycle/date`；`draft→approved` 僅 Owner 拍板）；行文引用其他 cycle＝markdown link 指向其 spec 檔（LEDGER 自動建關聯，裸 id 不成關聯）。
5. 提案進 `docs/BACKLOG.md`（B-NNN 條目）；變更記 `CHANGELOG.md`（含為什麼）。
6. 測試基線只准升（合理下降須 Record 說明＋複審核可，不得靜默降；VERIFY 段基線數）；教訓優先固化成測試（已有先例：drift.test.mjs 把健檢驗過的不變量機械化）。
7. 不經 Owner 核可不得自主實作 backlog 項目（排序≠開工授權；Owner 標 `[go]`＝授權）。
8. 旁路（無 spec）cycle id＝`YYYY-MM-DD-<BACKLOG 編號>`，供 CHANGELOG 段標題／BACKLOG 完成式共用。
9. 除錯先根因：動手修 bug 前必先根因調查；一次一假設；同 bug 修 2 次不過升能力階、3 次不過停手質疑架構回 Owner。
10. 查歷史脈絡：先讀 `docs/LEDGER.md`（若有；生成檔勿手改）挑 cycle，**依決策實作前必開該 cycle spec 全文**並檢查更新的相關 cycle。

本 repo 補充（非 DEVLOOP 摘要條目）：健檢報告在 `docs/health-reviews/`（`_INDEX.md` 索引）。深度 project-health-review 僅 Owner 手動 opt-in；輕量 delta 維護按需。
