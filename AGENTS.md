# AGENTS.md — ffxiv-tw-treasure

FFXIV 繁中服（陸行鳥 DC）藏寶圖工具：選等級→選地圖→比對謎題圖找挖掘座標；多人＝房間共享路線（op-based DO，即時同步、自動排最省動線）。FFXIV-TW-tools portal 之一。

- **線上**：https://treasure.xivtc.com/（CF Pages · private repo `FFXIV-TW-tools/ffxiv-tw-treasure`）
- **協作後端**：`ffxiv-tw-treasure-room.ffxiv-tw-tools.workers.dev`（Worker + Durable Object + WebSocket）
- **本機預覽**：`py -m http.server 8799` → 127.0.0.1:8799（需 portal CDN：`svc start portal`，否則 codex 樣式／FFXIVToast 不載）

> **本檔＝規則層**（做什麼／禁什麼／權威在哪／怎麼驗證），每 session 常駐；事故經過、實測數字、拍板日期＝`docs/rules-rationale.md`（**同名段對應**）。

---

## 定位與規模

- **規模級別：M（DEVLOOP §5）**——~1.8k 行，兩個鬆耦合子系統：① 純靜態前端查詢（零後端依賴）② Durable Object 房間後端（op-based WebSocket）。預設完整循環、可逆單檔小修走旁路。**非 L**（無分解層、無 Gate 0）。
- external 公開工具，獨立 git repo。規則衝突時 **本 repo > external > monorepo project > global**。

---

## 架構鐵則（違反易壞）

### 協作後端（Durable Object）

- **用 Durable Object，不用 KV**：presence 靠 `getWebSockets().length`（0 storage 寫）。
- **op-based**：client 送操作、DO 單執行緒序列套 `applyOp` 再廣播 → 並發加點不互蓋。**勿改回「整份覆蓋」**。
- **送任何 op（add/remove/done/order/clear）前必先 `ensureConnected()`**（`isInRoom()`→`isConnected()`），未連上給「連線中」提示；**不可先跳成功 toast**（假成功＝使用者無感掉點）。
- **破壞性操作過 `confirmModal(...)` 二次確認＋成功 toast**：清空／清除已完成／移除**隊友的**點；刪**自己的**點一鍵即可。
- **worker 只導出 function**：導出裸值會讓整支 worker 起不來；要常數就導出 getter（`maxConn()`）。
- **動 `applyOp` 協定的部署順序：worker 先 deploy、前端後 push。**

### 前端與 UI

- **確認框用 `js/app-modal.js` 的 `TreasureModal.confirm()`，不用原生 `confirm()`**（app.js 以 `confirmModal()` 薄包；`.codex-modal-overlay/.codex-modal` + `.codex-btn--danger` + `FFXIVA11y.trapFocus`，支援 ESC／overlay 關閉）。
- **前端零 HTML sink**：全程 `createElement`+`textContent`、事件委派、無 inline handler；勿引入 `innerHTML`。
- **地圖標記一律遊戲原生圖示，不用 emoji**（權威＝marketboard 的 `NODE_TYPE_ICON`／map_view 模組，不自創）：採集點 xivapi `/i/060000/`（060438 採掘／060437 碎石／060433 採伐／060432 割草），視覺照抄該站 `.map-pin-img`（**30px＋青色光暈＋黑色投影**）；傳送點＝主水晶 `060453`（22px），資料＝`<monorepo>/data/item_dict/lspl/aetherytes.json`（勿接 Teamcraft）、**只收 type 0**。
- **`#grade-grid` 必須預留首屏高度**：`min-height: 72svh`（用 `svh` 非 `vh`），footer 一開始就在 fold 外。哨兵＝`<monorepo>/tools/check-cls.mjs`（**逐寬度**掃）。
- `drift.test.mjs` 守兩條雙寫：**`DIG_W/DIG_H`(app.js) ↔ `--dig-w/--dig-h`(styles.css) 必須同值**；**外部圖片主機必須同步 `_headers` 的 CSP `img-src`**（本機 `http.server` 不套 `_headers`，本地測不出 CSP 問題）。
- **面向使用者的文案不寫內部術語**（Owner 2026-08-16）：「解包」「dump」「name_tc」只進註解／`_meta`／文件；但「這是推導、不保證」要改寫成玩家語言、不得刪掉（`names-authority` 守 `t('…')` 不得出現「解包」）。
- **檔案 ≤ 500 行（新檔）**：目前最大 `js/app.js` 408 行；再逼近 500 就按職責分層（下一候選＝三步狀態機／裁切卡渲染）。
- 改 UI／CSS 前先 Read **../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md**（設計權威，不憑記憶寫）；色值走 `var(--token, fallback)`，勿裸寫 hex/rgba。

### 資料與名稱權威

- **繁中名一律台服解包原文、零機器轉換**：物品名＝`item_lookup.name_tc` **且 `name_tc_source` ∈ {`dump`, `dt`}**（`dt` 須與 `tclocal_Item.csv` 逐字相同才算數；`opencc`／`tnze` 不收）；地名＝`place_names.json`（map-id keyed）。**禁自建對照表、禁 OpenCC 機轉**；判斷**必須看 `name_tc_source`，不能只看有沒有值**。
- **被擋掉的品項要在畫面上講出來**：`hidden` 欄 →「另有 N 項台服尚未收錄官方名稱」。
- **多語（en/ja）名詞不進資料檔**：`tools/build-i18n-names.py` 生成到 `i18n/en.js`／`ja.js` 標記區塊，切外語才載入。
- **「藏寶圖從哪個採集點掉」在解包裡不存在，別再查一次**（由來見 rationale）。站上「去哪採到這張圖」是**依等級門檻推導**：取 `level` **恰好等於** `grades.json` 的 `gatherLevel` 的採集點（來源＝`<monorepo>/data/item_dict/lspl/nodes.json`，只收 type 0–3；`map == 0` 丟棄 ⇒ 點數是**下限**）。**畫面必須寫明是推導**，不得寫成官方保證、不得自創地點清單。
- **掉落物兩種來源不得混成一份清單**（`data/loot.json`）：`dungeons`＝藏寶迷宮寶箱，本地解包 **`DungeonChest`／`DungeonChestItem` ＋ `DungeonDrop` 兩張表必須併**，含機率與數量；`loot`＝挖出的箱子，Teamcraft `loot-sources.json`（**已知不完整**）。`DUNGEON_CATALOG`（`build-data.py`）是**人工對照**，防呆＝**patch 閘**（掉落物 patch 須落在該圖版本之後）。
- `tests/names-authority.test.mjs` 守：名稱逐筆＝兩份原始解包 CSV 之一、`hidden` 欄必須在、畫面上必須有來源與未收錄提示；拿不到權威源一律失敗不 skip。

### 建置與演算法

- **座標公式＝FFXIV 官方 datamining**；路線演算法移植自 cycleapple/xiv-tc-treasure-finder（勿自創）。
- **root `package.json` 不可設 `"type":"module"`**（`treasure-core.js` 是 UMD）；`worker/` 自帶 `"type":"module"` 不衝突。
- **`improve2Opt`（2-opt）是閉環假設**、本工具是**開放路徑**；`use2Opt` 預設關、無產品呼叫者。啟用前先修尾端幻邊，測試用**固定 golden `deepEqual`**，**勿用**「≤ 非 2opt」單調斷言（會 flaky）。

### 🔒 部署面（fail-closed，勿回退）

- 部署**不是「發佈 repo 根目錄」**：`deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`（CF Build command＝`sh deploy-prepare.sh`、output＝`_site`）。
- **頂層新增任何檔案／資料夾就得當場分類**：站台資產進 `deploy-allow.txt`、內部資產進 `deploy-deny.txt`，未分類 → build 直接失敗。改完跑 `sh deploy-prepare.sh` 確認印「✓ 部署輸出就緒」。
- 腳本改動禁忌／並行安全／部署後驗（帶 cache-bust）＝`.claude/rules/deploy-surface.md`（**Claude 讀到 `deploy-*` 檔才載入；其他 agent 手動讀**）。

---

## VERIFY（改動後必跑）

<!-- B-048-HANDOFF -->
> **舊網址交接機制 2026-09-05 退役**（見 rationale）：本 repo 無 middleware、無 inline 交接腳本，`_routes.json` include 只留 API 代理路徑。

> 測試基線 **6 套全綠 · 227 assert 呼叫點**（core 14 / room-pure 17 / drift 13 / worker 60 / names-authority 41 / i18n 82）；`npm test` exit 0；**只准升不准降**。沿革見 rationale。
> 下列標記機械把關（pre-commit gate 6 / `<monorepo>/tools/check-test-baseline.js`）；**數字＝各測試從自身原始碼數出的呼叫點**，非執行次數：

<!-- TEST-BASELINE label="core" cmd="node tests/core.test.mjs" match="(\d+) assertions passed" expect="14" -->
<!-- TEST-BASELINE label="room-pure" cmd="node tests/room-pure.test.mjs" match="(\d+) assertions passed" expect="17" -->
<!-- TEST-BASELINE label="drift" cmd="node tests/drift.test.mjs" match="(\d+) assertions passed" expect="13" -->
<!-- TEST-BASELINE label="worker" cmd="node worker/tests/worker.test.mjs" match="(\d+) assertions passed" expect="60" -->
<!-- TEST-BASELINE label="names-authority" cmd="node tests/names-authority.test.mjs" match="(\d+) 項通過" expect="41" -->
<!-- TEST-BASELINE label="i18n" cmd="node tests/i18n.test.mjs" match="(\d+) 項通過" expect="82" --><!-- 2026-08-16 實測 79（前次 76）；62→76 是 EN／JA 上線那筆 commit 只長了測試、沒回寫宣告值 -->

```bash
npm test   # 串六套；或個別跑：
node tests/core.test.mjs            # 座標換算 + 路線 golden（含 dormant 2-opt）
node tests/room-pure.test.mjs       # backoffDelay / sanitizeJoinCode / sanitizeDisplayName
node tests/drift.test.mjs           # DIG↔CSS / maps image / 無死 CSS / 頂層已分類
node worker/tests/worker.test.mjs   # applyOp/validate/originAllowed/roomFull/路由閘
node tests/names-authority.test.mjs # 顯示名＝台服解包原文（tc_Item ∪ tclocal_Item）
node tests/i18n.test.mjs            # 字典漂移／覆蓋率／shim 降級（實作在 portal）

py -3.11 tools/build-data.py        # 改資料源後重建 data/ 各 json（缺涵蓋率 exit 1）
py -3.11 tools/build-i18n-names.py  # 上一支跑完必接這支，任一筆 join 不到即失敗
cd worker && pnpm cf:deploy:dry     # worker 部署前驗（0 error 才 STOP 交 shawn deploy）
```

- 無 lint / typecheck（純 JS）、無 cachebust 腳本（`.js/.css` 不帶 `?v=`，靠 CF Pages `must-revalidate`）。
- UI smoke（改前端後）：`py -m http.server 8799`（先 `svc start portal`）→ 三步精靈 + 房間建／加入／加點／清空。

---

## 架構索引

| 檔案 | 職責 |
|------|------|
| `index.html`／`styles.css` | shell（portal CDN 注入 header/tokens）+ 三步精靈 DOM／工具樣式 |
| `js/treasure-core.js` | 純函式（UMD）：座標換算 `(coord-1)*SizeFactor/40.96`、路線優化（map 分組 greedy NN + optional 2-opt）|
| `js/app.js` | 三步狀態機 + 裁切卡／全圖渲染 + 房間 UI + 對各模組注入依賴（408 行）|
| `js/app-modal.js`／`route-map.js` | codex-modal（`confirm`／`mapView`）／區域路線大圖渲染器（SVG 順序線 + 編號標記 + `aethIcon`）|
| `js/gather-map.js`／`loot-panel.js` | step 2 補充區塊：「去哪採到這張圖」（走 `mapView`）／「這張圖可能開出」（連 marketboard 查價）|
| `js/route-panel.js` | 共享路線面板：清單列／大圖／建議順序／清空・清除已完成／複製巨集（依賴由 app.js 注入）|
| `js/room.js`／`room-pure.js` | 房間 client（WebSocket、op-based、重連 backoff、6h 自動重連）／可單測純輔助（UMD）|
| `worker/src/index.js` | 房間 API：**Durable Object**（`Room`、`applyOp` 純函式、SQLite storage、6h alarm）— 獨立 wrangler，**Pages 不 build 它** |
| `data/*.json` | 由 `tools/build-data.py` 生成；`maps` 含傳送水晶座標、`grades` 含 `gatherLevel`；`loot`／`gather` **延後載入** |
| `tests/`、`worker/tests/` | golden / drift / op-based 並發正確性 |

---

## 開發循環與 git 邊界

- **commit / push 通則見 **../CLAUDE.md****（裸 push 硬擋、401 排錯）。**commit** 動手前先列「要 commit `<檔案>`、訊息 `<message>`」知會，無反對才執行（不把 stage+commit 塞同一連鎖命令）；**繁中 Conventional Commits，不加 Co-Authored-By**。
- **push = STOP**：由 Owner 跑 `safe-push.sh --repo C:/FFXIVProject/external/ffxiv-tw-treasure --reason "<原因>"`；push `main` → CF Pages 自動 build **前端**。
- **worker deploy = STOP**：`worker/` 改動才需 `pnpm -C worker cf:deploy`（前端 push 不觸發）；先 `pnpm cf:deploy:dry` 驗 0 error，防呆見 `<monorepo>/docs/runbooks/deploy-runbook.md`。查狀態：`cd worker && npx wrangler deployments list`。
- DEVLOOP 正典＝`~/.claude/process/DEVLOOP.md`（**不內嵌摘要**，v1.21 §4.4）。工件＝`CHANGELOG.md`、`docs/BACKLOG.md`、`docs/specs/`；`docs/plans/` 尚未建，需要時照契約建。
- 鐵則由來＝`docs/rules-rationale.md`；路徑條件載入層＝`.claude/rules/deploy-surface.md`。健檢報告在 `docs/health-reviews/`，深度 project-health-review 僅 Owner opt-in。
