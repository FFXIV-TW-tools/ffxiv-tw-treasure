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
- **確認框依 portal codex-modal，不用原生 `confirm()`**：用 `js/app-modal.js` 的 `TreasureModal.confirm()`（app.js 以 `confirmModal()` 薄包；`.codex-modal-overlay/.codex-modal` + `.codex-btn--danger` + `FFXIVA11y.trapFocus`，回 Promise<boolean>）。設計系統要求 ESC + overlay 點擊關閉。
- **root `package.json` 不可設 `"type":"module"`**（2026-07-04 踩過）：`treasure-core.js` 是 UMD（`module.exports`），設了會把它當 ESM → `.mjs` 測試的 `import TC from` default-import 失效。root 保持 CJS；`.mjs` 測試本就 ESM 不受影響。`worker/` 自帶 `"type":"module"`（worker code 是 ESM）不衝突。
- **`DIG_W/DIG_H`(app.js) ↔ `--dig-w/--dig-h`(styles.css) 雙寫必須同值**：裁切卡偏移用 JS 常數、卡片視窗尺寸用 CSS，漂移 → pin 偏離挖掘點。`tests/drift.test.mjs` 機械守（改動後跑 `npm test`）。
- **`improve2Opt`（2-opt）是閉環假設**（尾端 `(k+1)%length` 幻邊）：本工具是**開放路徑**（`calcTotalDistance` 只累加 n-1 段）。目前 `use2Opt` 預設關、無產品呼叫者；啟用前先修尾端幻邊，且測試用**固定 golden `deepEqual`**釘行為，**勿用**「≤ 非2opt」單調斷言（開放路徑下會 flaky）。
- **外部圖片主機一律同步 `_headers` 的 CSP `img-src`**：資料重建可能讓上游換網域（2026-07-30 實踩：地圖網址換 v2.xivapi.com，CSP 沒跟 → 線上地圖全黑）。**本機 `python -m http.server` 不套 `_headers`，CSP 問題本地測不出來**；`tests/drift.test.mjs` 已機械守（圖片主機 ⊆ img-src 白名單）。
- **地圖上的傳送點沿用既有實作**：圖示＝主水晶 `060453`（22px，xivapi），與 marketboard 的 map_view 模組（external/ffxiv-tw-marketboard 下 modules 目錄）同一組（**勿自創圖示／emoji**——該檔已記「emoji 在米色地圖上幾乎看不到」）；資料＝monorepo item_dict 的 lspl 目錄下 aetherytes.json（本地權威；勿接 Teamcraft 網路檔，內容相同）；**只收 type 0 主水晶**，type 1 是以太之光＝出口／換圖點，不是傳送目的地（2026-07-30 Owner 判定）。
- **繁中至上 / 繁中名走本地權威源**：物品名 = `item_lookup.name_sc → OpenCC s2twp`（`name_tc` 對藏寶圖是通用「地圖Gxx」錯名）；地名 = `place_names.json`（map-id keyed）。**禁自建對照表**。座標公式 = FFXIV 官方 datamining；路線演算法移植自 cycleapple/xiv-tc-treasure-finder（移植時對 reference 跑過 parity）。
- **worker 只導出 function**：workerd 把 module 具名導出當 entrypoint 檢查，導出裸值（number/物件）會讓整支 worker 起不來、`wrangler dev` 直接掛（2026-07-30 B-004：`MAX_CONN` 常數導出 → 本地端到端測試斷了好幾輪都沒人發現）。測試需要常數就導出 getter（`maxConn()`）。
- **前端零 HTML sink**：全程 `createElement`+`textContent`、事件委派、無 inline handler（CSP friendly）— 維持此姿態，勿引入 `innerHTML`。
- **檔案 ≤ 500 行（新檔）/ 遇授權牆不靜默跳過**：目前最大 `js/app.js` 356 行（2026-07-30 破 500 後已拆：對話框→`app-modal.js`、區域大圖→`route-map.js`、共享路線面板→`route-panel.js`）（**下次實質接觸必須先拆**：候選＝把「共享路線面板」渲染抽成獨立檔）（2026-07-30 逼近門檻時把對話框職責抽成 `js/app-modal.js`、區域路線大圖抽成 `js/route-map.js`；再逼近 500 就繼續按職責分層，勿硬塞），其餘各檔偏小；維持職責清楚。

---

## 改 UI / CSS 前

先 Read `../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md`（codex 元件 / token / modal / `.codex-tablet` padding 鐵則）— 設計權威單一來源，不憑記憶寫。色值一律走 `var(--token, fallback)` 模式（token 優先、CDN 失效時 fallback 兜底），勿裸寫 hex/rgba。

---

## VERIFY（改動後必跑）

> 測試基線 **4 套全綠 · 86 assert 呼叫**（core 14 / room-pure 17 / drift 10 / worker 45；`npm test` exit 0；**只准升不准降**；2026-07-30 CSP hotfix 後實測）。

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
| `js/treasure-core.js` | 純函式（UMD）：座標換算 `(coord-1)*SizeFactor/40.96` + 路線優化（map 分組 greedy 最近鄰 + optional 2-opt）+ 遊戲內座標寫法 `formatGameCoord`|
| `js/app.js` | 三步狀態機 + 裁切卡/全圖渲染 + 房間 UI（含「我的名稱」）+ 對各模組注入依賴（356 行）|
| `js/app-modal.js` | 對話框元件（codex-modal）：`confirm` 破壞性操作確認 + `mapView` 挖掘點放大檢視（全圖 + 同區編號標記） |
| `js/route-map.js` | 區域路線大圖渲染器（純渲染、不碰房間狀態）：SVG 順序線 + 編號標記（done/mine 態）+ 主水晶圖示 `aethIcon` |
| `js/route-panel.js` | 共享路線面板：清單列／區域大圖／建議順序／清空・清除已完成／複製巨集（依賴由 app.js 注入）|
| `js/room.js` | 多人房間 client（WebSocket、op-based、自動重連 backoff、6h 自動重連）— 基於 mit-planner `app-room.js` 改 |
| `js/room-pure.js` | room client 純輔助（UMD、無環境依賴、可單元測試）：重連退避 `backoffDelay` + 房號淨化 `sanitizeJoinCode` + 顯示名淨化 `sanitizeDisplayName` |
| `worker/src/index.js` | 房間 API：**Durable Object**（`Room` class，op-based `applyOp` 純函式、SQLite storage、6h alarm 過期）— 獨立 wrangler，**Pages 不 build 它** |
| `data/{grades,maps,treasures}.json` | 生成資料（`tools/build-data.py` 從 Teamcraft treasures+aetherytes ＋本地 item_dict 產；`maps.json` 含各圖傳送水晶座標）|
| `tests/`、`worker/tests/` | golden / drift / op-based 並發正確性 |

---

## 開發注意（commit / push / deploy）

- **commit**：通則見 `../CLAUDE.md`「commit / push 通則」；動手前先列「要 commit `<檔案>`、訊息 `<message>`」知會，無反對才執行（不把 stage+commit 塞同一連鎖命令）。**繁中 Conventional Commits，不加 Co-Authored-By**。
- **push = STOP**：本 repo 獨立 `.git`；push 走 **cmd.exe**（Windows Credential Manager 在 cmd/git-bash 才抓得到），由 shawn 自跑。push `main` → Cloudflare Pages 自動 build **前端**。
- **worker deploy = STOP**：`worker/` 改動才需 `pnpm -C worker cf:deploy`（前端 push 不觸發 worker 部署）；先 `pnpm cf:deploy:dry` 驗 0 error。deploy 防呆見 monorepo `docs/runbooks/deploy-runbook.md`。
  - 部署狀態查證（read-only，需 wrangler 已登入）：`cd worker && npx wrangler deployments list`（列 UTC 時間戳，對比 worker/ 最新 commit 判是否已上線）。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`；本 repo 工件：`CHANGELOG.md`、`docs/BACKLOG.md`（本 repo 目前無 `docs/specs/`——小工具多走旁路，需 spec 時建）。

本 repo 補充（非 DEVLOOP 摘要條目）：健檢報告在 `docs/health-reviews/`（`_INDEX.md` 索引）。深度 project-health-review 僅 Owner 手動 opt-in；輕量 delta 維護按需。

### 🔒 部署面鐵則（2026-08-01，勿回退）

本 repo 的 CF Pages 部署**不是「發佈 repo 根目錄」**，而是由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`。CF dashboard 必須設 Build command = `sh deploy-prepare.sh`、Build output directory = `_site`。

- **為什麼**：CF Pages 無 build 步驟時把 repo 根整棵目錄當靜態資產上傳 → `AGENTS.md`／`docs/`／`tools/`／`tests/`／`worker/` 後端源碼全部變成該網域下可直接 GET 的公開檔（2026-08-01 實測 12/13 站中招）。**private repo 只保護「誰能 clone」，不保護「已部署的檔案誰能下載」**；`.gitignore`（檔是 tracked）／`_headers`（只加標頭）／`robots.txt`（只擋收錄不擋直取）都擋不到。
- **允許清單而非排除清單**：頂層出現任何未列入 `deploy-allow.txt`／`deploy-deny.txt` 的項目 → **build 直接失敗**。新增內部資產的預設值是「不發佈」，不靠任何人記得。排除清單做不到（實測當天漏了 `worker/` 106 支 .ts 與 `_tools/`／`_cache/` 141 檔）。
- **新增站台資產**（新頁面／新資料夾）→ 加進 `deploy-allow.txt`；**新增內部資產** → 加進 `deploy-deny.txt`。改完跑一次 `sh deploy-prepare.sh` 確認印出「✓ 部署輸出就緒」。
- **腳本改動禁忌**：① 只能用 POSIX 語法（CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、輸出 0 檔而 build 仍「成功」⇒ **整站 404**，2026-08-01 實際發生）② 根層檔名不可無條件 `mkdir "$OUT/${f%/*}"`（會建出「叫 index.html 的目錄」⇒ `/` 404）③ 不得移除出貨前驗收閘（輸出 <3 檔／缺 index.html／內部檔混入 → 非零 exit，CF 保留前一版）。
- **部署後驗**：`curl -sI https://<repo>.pages.dev/AGENTS.md` → 回 `text/html` 正常（檔案不存在）；回 `text/markdown` = 紅燈。
