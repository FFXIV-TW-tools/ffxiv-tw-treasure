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
- **繁中至上 / 繁中名一律台服解包原文、零機器轉換**（2026-08-13 更正）：物品名 = `item_lookup.name_tc` **且 `name_tc_source='dump'`**；地名 = `place_names.json`（map-id keyed）。**禁自建對照表、禁 OpenCC 機轉**。
  ⚠️ 本行原文是「物品名 = `name_sc → OpenCC s2twp`（`name_tc` 對藏寶圖是通用『地圖Gxx』**錯名**）」——**那個括號裡的判斷是錯的，而它就是 bug 的來源**：「陳舊的地圖G17」正是台服 client 出貨的名字（日服同為編號式 `古ぼけた地図G17`，只有英文用皮名）。照那句話做出來的站顯示的是**国服名機轉**，玩家拿回遊戲內搜尋找不到，而畫面上完全看不出問題。
  ⚠️ 另一個更隱蔽的陷阱：**「`item_lookup` 有繁中名」不等於「台服有這個名字」**。G18(46185) 的 `name_tc` 有值（国服名機轉），但台服解包裡是**空字串** ⇒ 判斷必須看 `name_tc_source`，不能只看有沒有值。
  ⚠️ **多語（en/ja）名詞不進資料檔**：由 `tools/build-i18n-names.py` 生成到 `i18n/en.js`／`i18n/ja.js` 的標記區塊——字典只在切外語時才載入 ⇒ 繁中訪客一個位元組都不用付（monorepo 鐵則「資料只載當前這份會用到的」）。
- **座標公式 = FFXIV 官方 datamining**；路線演算法移植自 cycleapple/xiv-tc-treasure-finder（移植時對 reference 跑過 parity）。
- **worker 只導出 function**：workerd 把 module 具名導出當 entrypoint 檢查，導出裸值（number/物件）會讓整支 worker 起不來、`wrangler dev` 直接掛（2026-07-30 B-004：`MAX_CONN` 常數導出 → 本地端到端測試斷了好幾輪都沒人發現）。測試需要常數就導出 getter（`maxConn()`）。
- **前端零 HTML sink**：全程 `createElement`+`textContent`、事件委派、無 inline handler（CSP friendly）— 維持此姿態，勿引入 `innerHTML`。
- **檔案 ≤ 500 行（新檔）**：目前最大 `js/app.js` 356 行（2026-07-30 由 505 行按職責拆出 `app-modal.js` 對話框／`route-map.js` 區域大圖／`route-panel.js` 共享路線面板），其餘各檔偏小。**再逼近 500 就繼續按職責分層**（下一候選＝三步狀態機 vs 裁切卡渲染），勿硬塞。

---

## 改 UI / CSS 前

先 Read `../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md`（codex 元件 / token / modal / `.codex-tablet` padding 鐵則）— 設計權威單一來源，不憑記憶寫。色值一律走 `var(--token, fallback)` 模式（token 優先、CDN 失效時 fallback 兜底），勿裸寫 hex/rgba。

---

## VERIFY（改動後必跑）

<!-- B-048-HANDOFF -->
> **交接頁契約（B-048 Task 4）**——改 `functions/_middleware.js`／`_routes.json`／`tests/route-manifest.json` 後必跑：
>
> ```bash
> node tests/handoff.test.mjs
> ```
>
> ⚠️ 它**刻意不併進本 repo 既有的測試 runner**：該檔與 `functions/_middleware.js` 是 13 站逐站複製的樣板（每站只換 `OLD_HOST`／`NEW_ORIGIN` 兩個常數），檔名與介面必須跨站一致，不能為配合各站慣例改寫——改寫等於每站手動調整，正是 monorepo 交接頁一致性哨兵要防的漏抄。**既有測試基線不變。**

> 測試基線 **6 套全綠 · 186 assert 呼叫點**（core 14 / room-pure 17 / drift 13 / worker 60 / names-authority 20 / i18n 62；**只准升不准降**。2026-08-13 新增兩套：`names-authority`＝顯示名逐筆對台服解包（見下方說明）；`i18n`＝薄 wrapper，實際檢查在 portal 共用哨兵。⚠️ i18n 的 62 是**共用哨兵回報的檢查項數**，不是本 repo 的 assert 數——它會隨共用哨兵演進而變，屆時照實更新即可，那不是本站的回歸。（以下為 2026-08-03 原文） core 14 / room-pure 17 / drift 13 / worker 60；`npm test` exit 0；**只准升不准降**；2026-08-03 實測。worker 52→56＝B-047 xivtc.com 遷移期的 Origin 雙列契約：新網域 `treasure.xivtc.com` 須放行、未列舉的 xivtc 子網域／apex／後綴偽裝須被拒。worker 56→60＝2026-08-04 心跳 auto-response 跨檔漂移哨兵：DO 必須註冊 setWebSocketAutoResponse，且其比對的幀須與 js/room.js 送出的逐字節一致——沒註冊或字串不符都會讓每次心跳叫醒 DO 並計費，而**兩種失敗都零功能訊號**）。
> 基線由下列標記機械把關（pre-commit gate 6 / monorepo 的 tools/check-test-baseline.js）——**數字是各測試從自身原始碼數出來的呼叫點**，不是寫死的字面量，也不是執行次數（後者會被資料驅動迴圈放大，地圖改版就假紅燈）：

<!-- TEST-BASELINE label="core" cmd="node tests/core.test.mjs" match="(\d+) assertions passed" expect="14" -->
<!-- TEST-BASELINE label="room-pure" cmd="node tests/room-pure.test.mjs" match="(\d+) assertions passed" expect="17" -->
<!-- TEST-BASELINE label="drift" cmd="node tests/drift.test.mjs" match="(\d+) assertions passed" expect="13" -->
<!-- TEST-BASELINE label="worker" cmd="node worker/tests/worker.test.mjs" match="(\d+) assertions passed" expect="60" -->
<!-- TEST-BASELINE label="names-authority" cmd="node tests/names-authority.test.mjs" match="(\d+) 項通過" expect="20" -->
<!-- TEST-BASELINE label="i18n" cmd="node tests/i18n.test.mjs" match="(\d+) 項通過" expect="62" -->

```bash
npm test   # 串六套：core（座標/路線 golden）+ room-pure（退避/淨化）+ drift（DIG常數/maps image/死CSS/部署分類）+ worker（op-based 並發不互蓋）+ names-authority（顯示名＝台服解包）+ i18n（薄 wrapper → portal 共用哨兵）
# 或個別跑：
node tests/core.test.mjs           # 座標換算 + 路線優化 golden（含 dormant 2-opt 固定 golden）
node tests/room-pure.test.mjs      # room client 純輔助：backoffDelay 退避上限 + sanitizeJoinCode 房號淨化 + sanitizeDisplayName 顯示名淨化
node tests/drift.test.mjs          # DIG_W/DIG_H↔CSS 同步 + maps.json image 安全 + 無死 CSS（token 邊界比對）+ 頂層項目已分類（allow/deny 覆蓋、兩清單無交集）
node worker/tests/worker.test.mjs  # 房間 applyOp/validate/originAllowed/roomFull/公開路由閘（含「並發加點不互蓋」證明）
node tests/names-authority.test.mjs # 站上每個繁中名 ＝ 台服解包原文（零機器轉換）；權威源＝datamining_tc/tc_Item.csv **原始解包**，不用 item_lookup.name_tc（那欄混了 OpenCC fallback）；拿不到權威源一律失敗不 skip。⚠️ 2026-08-13 更正：`item_lookup` **現在有 `name_tc_source` 欄**（dump/dt/tnze/opencc），故產生器改為只收 `'dump'`——這一欄之前不存在，「有繁中名」與「台服真的有這個名字」在資料上完全無法區分，我就是這樣把 G18 誤判成「可以補了」（它的 name_tc 是国服名機轉，台服解包裡是空字串）。哨兵仍讀原始 CSV：那是**獨立於 sqlite 的第二個證人**，兩邊都錯才會漏
node tests/i18n.test.mjs           # i18n 三組檢查（字典雙向漂移／覆蓋率／shim 降級）——**薄 wrapper，實作在 portal `tools/i18n-check.mjs`**；本站只留 `i18n.config.json`。拿不到共用哨兵一律失敗不 skip

py -3.11 tools/build-data.py       # 改資料源後重建 data/ 下的 grades / maps / treasures.json（2026-08-13 起**不再需要 opencc**；有缺涵蓋率 exit 1）
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
| `data/grades.json`、`data/maps.json`、`data/treasures.json` | 生成資料（`tools/build-data.py` 從 Teamcraft treasures+aetherytes ＋本地 item_dict 產；`maps.json` 含各圖傳送水晶座標）|
| `tests/`、`worker/tests/` | golden / drift / op-based 並發正確性 |

---

## 開發注意（commit / push / deploy）

- **commit**：通則見 `../CLAUDE.md`「commit / push 通則」；動手前先列「要 commit `<檔案>`、訊息 `<message>`」知會，無反對才執行（不把 stage+commit 塞同一連鎖命令）。**繁中 Conventional Commits，不加 Co-Authored-By**。
- **push = STOP**：本 repo 獨立 `.git`；push 走 **cmd.exe**（Windows Credential Manager 在 cmd/git-bash 才抓得到），由 shawn 自跑。push `main` → Cloudflare Pages 自動 build **前端**。
- **worker deploy = STOP**：`worker/` 改動才需 `pnpm -C worker cf:deploy`（前端 push 不觸發 worker 部署）；先 `pnpm cf:deploy:dry` 驗 0 error。deploy 防呆見 monorepo 的 docs/runbooks/deploy-runbook.md。
  - 部署狀態查證（read-only，需 wrangler 已登入）：`cd worker && npx wrangler deployments list`（列 UTC 時間戳，對比 worker/ 最新 commit 判是否已上線）。

---

## 開發循環（DEVLOOP）

正典：`~/.claude/process/DEVLOOP.md`（**不在此內嵌摘要**——DEVLOOP v1.21 §4.4：抄一份會過期的摘要只是製造第二真相源）。

本 repo 差異：
- 工件＝`CHANGELOG.md`、`docs/BACKLOG.md`、`docs/specs/`（首份＝`2026-07-30-aetheryte-on-map-design.md`）；`docs/plans/` 尚未建，需要時照契約建。小修走旁路。
- 健檢報告在 `docs/health-reviews/`（`_INDEX.md` 索引）。深度 project-health-review 僅 Owner 手動 opt-in；輕量 delta 維護按需。
- 動 `applyOp` 協定時的部署順序：**worker 先 deploy、前端後 push**（前端 push 自動觸發 Pages build，worker deploy 是人工 STOP → 兩者之間必然有時間差；新 op 送到舊 worker 會被靜默丟棄）。

### 🔒 部署面鐵則（2026-08-01，勿回退）

本 repo 的 CF Pages 部署**不是「發佈 repo 根目錄」**，而是由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`。CF dashboard 必須設 Build command = `sh deploy-prepare.sh`、Build output directory = `_site`。

- **為什麼**：CF Pages 無 build 步驟時把 repo 根整棵目錄當靜態資產上傳 → `AGENTS.md`／`docs/`／`tools/`／`tests/`／`worker/` 後端源碼全部變成該網域下可直接 GET 的公開檔（2026-08-01 實測 12/13 站中招）。**private repo 只保護「誰能 clone」，不保護「已部署的檔案誰能下載」**；`.gitignore`（檔是 tracked）／`_headers`（只加標頭）／`robots.txt`（只擋收錄不擋直取）都擋不到。
- **允許清單而非排除清單**：頂層出現任何未列入 `deploy-allow.txt`／`deploy-deny.txt` 的項目 → **build 直接失敗**。新增內部資產的預設值是「不發佈」，不靠任何人記得。排除清單做不到（實測當天漏了 `worker/` 106 支 .ts 與 `_tools/`／`_cache/` 141 檔）。
- **新增站台資產**（新頁面／新資料夾）→ 加進 `deploy-allow.txt`；**新增內部資產** → 加進 `deploy-deny.txt`。改完跑一次 `sh deploy-prepare.sh` 確認印出「✓ 部署輸出就緒」。
- **腳本改動禁忌**：① 只能用 POSIX 語法（CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、輸出 0 檔而 build 仍「成功」⇒ **整站 404**，2026-08-01 實際發生）② 根層檔名不可無條件 `mkdir "$OUT/${f%/*}"`（會建出「叫 index.html 的目錄」⇒ `/` 404）③ 不得移除出貨前驗收閘（輸出 <3 檔／缺 index.html／內部檔混入 → 非零 exit，CF 保留前一版）。
- **部署後驗**（**務必帶 cache-bust**）：`curl -sI "https://ffxiv-tw-treasure.pages.dev/AGENTS.md?cb=$(date +%s)"` → 回 `text/html` 正常（檔案不存在、走 SPA fallback）；回 `text/markdown` = 紅燈。
  - ⚠️ **不帶 cache-bust 會得到假紅燈**：舊部署（發佈 repo 根的那版）留在 CF 邊緣的物件帶 `s-maxage=604800`，命中時回 `text/markdown` 但 header 有 `CF-Cache-Status: HIT` ＋ 大 `Age`。**那是快取殘留不是外洩**，最長 7 天自癒（pages.dev 非自有 zone，dashboard 沒有 Purge Everything，收斂路徑就是等 TTL）。2026-08-01 R3 健檢實測：帶 cache-bust 的 `/AGENTS.md`、`/worker/src/index.js`、`/deploy-allow.txt` 全回 SPA fallback＝現行部署乾淨。
