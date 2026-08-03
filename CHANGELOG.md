# Changelog

> 日期段落制（cycle 收官為段）；條目含人話「為什麼」，不從 git log 自動生成。
> 2026-07-11 起依 DEVLOOP 隨 cycle 更新；以前的段落為回填摘要（源自 git log 與健檢報告）。

## 2026-08-03 — 舊網址交接頁（monorepo B-048 Task 4，第 7 站）

**為什麼**：本站已掛上 `treasure.xivtc.com`，但手上是舊 `*.pages.dev` 書籤的使用者不會知道，也不會把跨工具身份（UUID）帶過去。

**為什麼不是 301**：301 在**邊緣執行、早於任何 JS** ⇒ 舊 origin 完全沒機會讀 `localStorage` 裡的 UUID。純 301 會讓使用者靜默失去雲端身份。所以必須回一頁極簡 HTML、由 client 讀 LS 後自行組目標 URL——這也是為什麼目標 URL 不能在 server 端組完就送：**`#fragment` 永遠不會送到伺服器**。

### Added

- `functions/_middleware.js`（**四個條件同時成立才攔**：`GET`／`Accept` 含 `text/html`／host 精確等於 production 舊 host——字串全等，順帶讓 CF preview 子網域天然放行）
- `_routes.json`（**完整枚舉**，刻意不用 `/*`：那會讓每個 CSS/JS/圖片請求都變成一次 Functions invocation）
- `tests/route-manifest.json`（攔截路徑唯一事實源）＋ `tests/handoff.test.mjs`（四個攔截條件各有正負案例）
- `deploy-allow.txt` 加 `functions`／`_routes.json`；`deploy-deny.txt` 加 `tests`（fail-closed，漏了 build 直接失敗）

### Notes

- 本站為**單頁站**，manifest＝`["/", "/index.html"]`。`/index.html` 必須顯式列入——實測它**不會** 308 到 `/`（其餘 `.html` 深鏈會，被 308 後由無副檔名形式接手，交接照樣發生）。
- middleware 由樣板產生，**除兩個常數外與其餘 12 站逐字節相同**，由 monorepo 交接頁一致性哨兵把關（斷言的是逐字節相同，不是「條件有沒有在」——後者抓不到語意被改寫）。

## 2026-08-01 — 部署面改採允許清單 fail-closed（本 repo 側收官）

> cycle `2026-08-01-deploy-surface`（跨 12 站的 monorepo 級 initiative，全貌與根因見 monorepo root CHANGELOG 同 cycle 段；本段只記本 repo 的落地與驗收）。**補記於 2026-08-02**——當時五個 commit 只動了腳本與清單，沒留 repo-local 收官段（R3 健檢指出）。

### Changed
- **CF Pages 不再發佈 repo 根目錄**：改由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產 `_site/`（dashboard：Build command = `sh deploy-prepare.sh`、Build output = `_site`）。此前 `AGENTS.md`／`docs/`（含歷次健檢報告＝現成弱點地圖）／`tools/`／`tests/`／`worker/` 後端源碼全部是該網域下可直接 GET 的公開檔。
- **允許清單而非排除清單**：頂層任何未分類項目 → build 直接失敗。排除清單的預設是「全部發佈」，新增目錄天生外洩、只能靠人記得補；同一天實測漏了兩次。
- 依 codex／grok 雙外審修 7 項（消除殘餘 fail-open 路徑）：`while` 迴圈的 subshell 讓 `cp` 失敗不中止 → 改先落檔再讀；`git` 不可用時原本退回 `cp -r`＝安全語意悄悄放寬 → 改成寧可中止；出貨驗收由副檔名黑名單改**白名單**；允許路徑下的 symlink 一律拒絕（`cp` 會解參照，可把 deny 區內容複製成看似安全的 `.json`）。
- 略過 CF build 容器產物（`package-lock.json`／`node_modules` 等）——容器在跑 build command 前會自動 `npm install`，產生 repo 裡沒有的檔案，**treasure 正是被這條擋下的 canary**。

### Verified
- `sh deploy-prepare.sh` ✓ 16 檔（純站台資產：`_headers`／`data/*.json`×3／favicon／`index.html`／`js/*.js`×7／`robots.txt`／`sitemap.xml`／`styles.css`）。
- 線上 cache-bust 探測：`/AGENTS.md`、`/worker/src/index.js`、`/deploy-allow.txt` 全回 SPA fallback `text/html`＝現行部署乾淨。
- **殘留（已知未收斂）**：稽核期間被請求過的少數路徑仍在 CF 邊緣快取（舊部署的 `s-maxage=604800`），不帶 cache-bust 打 `/AGENTS.md` 仍會回 `text/markdown`。pages.dev 非自有 zone、無 Purge Everything → 收斂路徑是等 TTL，最長 7 天。複探條目見 BACKLOG B-010。

## 2026-08-02 — R3 全維健檢的須修改項（worker 授權破口 + 機械閘 + 文件 drift）

> cycle `2026-08-02-R3-fixes`（依據 [R3 健檢報告](docs/health-reviews/2026-08-01-R3全維-health-review.md) 與[修復計畫](docs/health-reviews/2026-08-01-R3全維-fix-plan.md)；B-012／B-013／spec status 待 Owner 拍板故未動）。

### Security
- **`POST /room/:code` 不再能整份覆蓋房間清單**（B-006）。**破口原樣**：default fetch 對 `/room/:code` 不分 method 原封轉發到 DO，而 `Room.fetch` 對任何非 WS 的 POST 一律當建房 seed 處理 → 外部一行 `curl -X POST .../room/<房號>`（無 Origin、空 body、`text/plain` 故無 preflight）就能把全隊清單覆蓋成空、重設 6h alarm，**且該分支不廣播** → 線上 client 停在舊清單，直到下一個 op 才「全隊點突然消失」。門檻只有 6 碼房號（會出現在邀請連結／截圖）。這繞過 origin 白名單、繞過 `confirmModal`、也繞過 op-based「不整份覆蓋」的架構鐵則，正面打到「多人清單不掉點」的核心承諾。
  - **健檢當場對自建測試房線上實證**（HTTP 200、`GET` 顯示點被清空），不是靜態推論。
  - 修法刻意**兩層**（任一層日後被改動、另一層仍在）：① default fetch 對 `/room/:code` 只轉發 GET（WS 升級握手本身就是 GET），其餘 405；② `Room.fetch` 的 POST 分支加 `pathname === '/seed'` 守衛（內部通道用的正是 `https://do/seed`），其餘 404。兩者抽成純函式 `publicRoomMethodAllowed` / `isSeedRequest` 並釘 7 個 assert（先寫紅燈測試再修）。

### Added
- **測試基線接上 pre-commit gate 6**（B-011）：四支測試各自從**自身原始碼**數出 assert 呼叫點並印出，AGENTS.md VERIFY 段掛四個 `TEST-BASELINE` 標記。此前 `check-test-baseline.js` 對本 repo 整支跳過（13 個 external repo 已有 7 個接上，本 repo 是漏網者），「只准升不准降」純靠人工紀律。
  - **為什麼數「呼叫點」不數「執行次數」**：執行次數會被資料驅動迴圈放大（drift 實測 223，其中 130 來自 65 顆水晶 × 2），地圖資料改版就讓基線變動＝假紅燈。**也不印寫死的字面量**——那等於讓 gate 比對兩個常數，正是這道閘要防的漂移。
  - 負向驗證：臨時加一條 assert → gate 立刻報「實測 15 > 宣告 14」並存證據檔。
- **部署分類閘提前到 commit 前**（drift 測試）：頂層 tracked 項目必須全被 `deploy-allow.txt` ∪ `deploy-deny.txt` ∪ 腳本固定略過清單覆蓋，且兩清單不得有交集（腳本 allow 先判且無 else，同名時 deny 形同無效）。此前分類閘只在 CF build 期跑 → 新增頂層檔會 push 成功但 build 失敗、站台靜默停在舊版。略過清單是**解析腳本**而非抄寫，不製造第二份會漂的清單。

### Fixed（文件 drift，皆為「照做會出錯」等級）
- **部署後驗指令補 cache-bust**（B-007）：`curl -sI .../AGENTS.md` 未帶 cache-bust 時會命中舊部署留在邊緣的物件（`s-maxage=604800`）回 `text/markdown`＝**假紅燈**。新鐵則段裡唯一的驗收動作照跑必紅，會讓下次真外洩被當雜訊忽略。已改成帶 cache-bust 並補判讀規則（`CF-Cache-Status: HIT` ＋大 `Age` ＝殘留非外洩，最長 7 天自癒；pages.dev 非自有 zone 無 Purge Everything）。
- **AGENTS.md／CLAUDE.md 不再宣稱「本 repo 無 `docs/specs/`」**（B-008）：spec 自 07-30 已存在且 CHANGELOG 已 link，而同一份 AGENTS 又要求「實作前必開該 cycle spec 全文」——讀者被前句說服而跳過，那份 spec 正裝著翻轉過兩次的「只收 type 0」決策。
- **README 結構補齊 + 新增「部署」段**（B-009）：原本缺 `app-modal.js`／`route-map.js`／`route-panel.js` 三支已上線模組，也完全沒提 `deploy-prepare.sh` + allow/deny + `_headers` 這條 build pipeline。README 是給不讀 AGENTS 的人的唯一地圖。
- **開發循環段改 pointer-only**（B-014）：DEVLOOP v1.21 §4.4 已廢除 AGENTS.md 內嵌摘要與 per-repo 版本戳（理由：抄一份會過期的摘要＝第二真相源），本檔仍停在「10 條摘要＋對齊 v1.20」。改成正典 pointer ＋本 repo 差異（工件位置／健檢落點／協定變更時的部署順序）。同時修掉 `check-devloop-artifacts` R15 報的 3 條 pointer 斷鏈。
- **檔案大小鐵則行去矛盾**：同一行前半寫「共享路線面板已拆到 route-panel.js」、後半又命令「下次實質接觸必須先拆＝把共享路線面板抽成獨立檔」（356 行本就未觸發任何門檻），照做等於對健康檔案做無謂重構；順帶移除與檔案大小無關的「遇授權牆不靜默跳過」模板殘留。
- **VERIFY 段「串三套」改「串四套」**、room-pure 描述補 `sanitizeDisplayName`（同段第 45 行早已寫「4 套」，自相矛盾）。
- **spec 勘查段與決策段的矛盾標註**：line 27 寫 type 1「兩者皆可傳送」、§3.1 寫 type 1 不是傳送目的地——只讀勘查段會得到相反結論。已加交叉引用（`status: draft → approved` 屬 Owner 權責，未動）。
- **`_INDEX.md` 07-11 列狀態更正**：原寫「worker 待 shawn 正式 deploy（前端待 push）」，`wrangler deployments list` 實證該批已於 2026-07-11T20:49:54Z 部署（晚於 commit `d6ab2d2` 12 小時）。這是 07-11 那輪才修過一次的同型錯誤，三週內復發。

### Verified
- `npm test` 4 套全綠 **86 → 96 assert 呼叫點**（core 14 / room-pure 17 / drift 10→13 / worker 45→52；只升）。
- `node tools/check-test-baseline.js --repo external/ffxiv-tw-treasure`：**檢查 4 項｜不符 0**（此前為「跳過」）；負向探針驗證會紅。
- `node tools/check-devloop-artifacts.js --repo external/ffxiv-tw-treasure`：✓ 工件格式合格，**R15／R18 警示全清**。
- `sh deploy-prepare.sh` ✓ 16 檔；drift 部署分類閘負向驗證（新 tracked 頂層檔 → exit 1）。
- `pnpm -C worker cf:deploy:dry` 0 error（11.65 KiB，DO binding `Room` 正確）。
- ✅ **worker 已部署並線上驗證**：shawn 於 **2026-08-02T15:14:05Z** deploy（`wrangler deployments list`，version `d26881af`）。隨即對新建測試房重跑實證命令：無 Origin 的 `POST /room/<房號>` 回 **405 `method_not_allowed`**（修前是 200 ＋清空）、**點完好無損**、`GET` 快照仍 200、建房路徑正常。破口關閉。

### 未做（待 Owner 拍板）
- **B-012** step 2 縮圖 ~4 MB（實測底圖 618–760 KB × 最多 6 張、上游無縮圖參數）：A 案建置期產 256px webp／B 案 IntersectionObserver 延後載入，取捨不同故不自決。
- **B-013** 單人模式複製座標路徑：推薦復用既有 `MODAL.mapView(onCopy)`，但會改變「未入房時點卡片」的行為，交 Owner 定。
- 批次 1 的四個選配 low 項（DO 回 error reason／`st==null` 併入 expired／`order` no-op 收斂／worker 端 `ownerName` 去控制字元）——納入可省一次 deploy 窗，但會擴大單次 commit scope。
- spec `status: draft → approved`（DEVLOOP §4：僅 Owner）；memory 刪／升級候選（見報告「Memory / 文件稽核」段）。

## 2026-07-30 — hotfix：線上地圖全黑（CSP 擋掉 v2.xivapi.com）

> cycle `2026-07-30-map-csp-hotfix`（旁路：單檔設定修復 + 一條機械守門）。**本輪自造的 regression**，Owner 回報「有些人顯示的地圖是黑色的」。

### Fixed
- **`_headers` 的 CSP `img-src` 放行 `https://v2.xivapi.com`**。**根因**：同日重跑 `build-data.py`（為了加傳送水晶）時，本地 `lspl/maps.json` 的地圖網址已隨上游在 2026-07 換成 `v2.xivapi.com/api/asset/map/...`（原 `xivapi.com/m/....jpg`），但 CSP 白名單只有舊網域 → 線上 28 張地圖底圖全被擋，只剩深色底＝「黑色地圖」。**為什麼本機測不到**：`python -m http.server` 不套 `_headers`，CSP 只在 Cloudflare Pages 生效，所以同日的本地端到端測試（含真房間）全綠卻照樣壞在線上。**又是既有實作已解過的題**：marketboard `_headers` 早就兩個網域都放行，該檔註解甚至寫著上游換 v2 的事。
### Added
- **drift 守門：圖片主機 ⊆ CSP 白名單**——掃 `maps.json` 的 `image` 與 JS 內的圖片 URL，主機不在 `_headers` `img-src` 就紅（負向測試實證：拿掉 v2 立刻 fail，訊息直指 CSP）。這條把「本機測不出的線上 CSP 問題」變成 commit 前就擋得住。
### Verified
- `npm test` 4 套全綠 **86 assert**（drift 9 → 10）。`https://v2.xivapi.com/api/asset/map/r2f1/00` 與 `https://xivapi.com/i/060000/060453.png` 皆實測 200。

## 2026-07-30 — 水晶改用既有圖示與本地資料源（只留主水晶）＋ 共享路線面板拆檔

> cycle `2026-07-30-aetheryte-on-map`（續前段；spec 同一份，決策已回寫）。

### Fixed
- **水晶圖示改用既有那組，不再自創**：主水晶 `060453`（22px, xivapi），與 `ffxiv-tw-marketboard/modules/map_view.js` 同一組圖示／尺寸；區域大圖與放大檢視共用 `TreasureRouteMap.aethIcon`。**為什麼**：前一版自創「金色菱形」——Owner 指出市場／採集地圖早有水晶渲染範例。這是 DRY 鐵則「改動前先找既有模組」的漏查（那份檔案裡甚至已寫著「不用 emoji：在米色地圖上幾乎看不到」的實測教訓）。
- **資料源改本地 `data/item_dict/lspl/aetherytes.json`**：實測與 Teamcraft 網路檔 268 筆內容**完全相同**，且 `build-data.py` 早就在讀同目錄的 `lspl/maps.json`、marketboard 也用這份 → 拿掉多接的網路源與其快取檔。
- **只留主水晶（type 0），濾掉以太之光（type 1）**：以太之光是區域出口／換圖點、不是傳送目的地，標上去只是雜訊（Owner 判定）。前一版因「map 213 濾掉會一顆不剩」而全收是誤判——龍堡內陸低地本來就沒有可直傳的大水晶，不該拿出口充數。主水晶 81 → **65 顆**，map 213 留空。
### Changed
- **拆 `js/route-panel.js`**（188 行）：共享路線面板的渲染與操作（清單列／區域大圖／建議順序／清空／清除已完成／複製巨集）整塊搬出，依賴由 app.js 注入（`getMaps`/`getShared`/`toast`/`confirmModal`…），該檔不自己抓房間狀態。**app.js 505 → 356 行**，回到門檻內。
### Verified
- `npm test` 4 套全綠 **85 assert**（core 14 / room-pure 17 / drift 9 / worker 45；drift 水晶斷言改為值域 + 不得殘留 `t` + 總量 ≥60 不塌）。
- **端到端（本地 worker + 真房間）**：拆檔後重測 5 點跨 2 區 → 勾完成（進度 1/4）／建議順序（stat 正確）／點標記開放大檢視（座標行「第 1 點 · X:21.3 Y:19.4 ✓ 已完成」）／ESC 關閉／清空 + 離開乾淨；水晶圖示 2 顆實際載入成功（`naturalWidth>0`），龍堡參天高地有 2 顆、龍堡內陸低地 0 顆（截圖確認符合資料）。

## 2026-07-30 — 地圖上顯示傳送水晶 ＋ 修好本地 wrangler dev

> cycle `2026-07-30-aetheryte-on-map`（spec: [docs/specs/2026-07-30-aetheryte-on-map-design.md](docs/specs/2026-07-30-aetheryte-on-map-design.md)；動生成資料 schema 故不走旁路）。

### Added
- **區域大圖與放大檢視都畫出傳送水晶**（金色菱形，與挖掘點的圓形編號標記一眼可分）：看得出這區該傳哪一顆過去。資料＝Teamcraft `aetherytes.json`（與現用 `treasures.json` 同源），寫進 `data/maps.json` 各 map 的 `aetherytes:[{x,y}]`（新增欄位、向後相容），28 張圖共 81 顆。
  - **不顯示水晶名稱**：名稱需 `nameid`→PlaceName 的台服正名，本地無權威源（`place_names.json` 是地區名、`datamining_tc/` 無 Aetheryte/PlaceName sheet、`game_ref.sqlite` 無該表——逐項排除見 spec），依鐵則「禁自建對照表／禁自創譯名」只給位置。
  - **不以 `type` 過濾**（推翻初版設計）：原打算只取 type 0，實測 map 213（龍堡內陸低地）只有 type 1 的兩顆＝泰勒斐爾／阿涅斯特里恩，遊戲裡傳得到 → 過濾掉會讓該圖一顆不剩。已把此案例寫成 drift 斷言（每張圖必有水晶 + 座標範圍）擋回歸。
### Fixed
- **B-004：本地 `wrangler dev` 起不來**——`worker/src/index.js` 為測試導出常數 `MAX_CONN`（number），workerd 把 module 具名導出當 entrypoint 檢查、拒收裸值（`not of type 'function or ExportedHandler'`），整支 worker 起不來。改以 getter `maxConn()` 導出。**影響**：本輪起可本地端到端測真房間（前三輪只能靠純函式測試 + 手動組 DOM）。
### Verified
- `npm test` 4 套全綠 **81 → 83 assert**（只升；新增 drift 水晶斷言 2 條）。
- `py -3.11 tools/build-data.py` 重建 0 缺口：13 grades / 28 maps / 477 points / 81 水晶，map 213 = 2 顆（回歸案例）。
- **端到端（本地 worker + 真房間）**：`wrangler dev` Ready → 建房 `ZJBZDM` 連上 → 加 3 點 → 左清單 3 列（含玩家名）／右大圖 3 編號標記 + 2 顆水晶；放大檢視同樣 3 標記 + 2 水晶、ESC 可關；清空 + 離開房間乾淨（截圖確認）。
- ⚠️ 本機 `python -m http.server` 不發 no-cache，改資料檔後要 hard reload 才看得到新 `maps.json`（線上 `_headers` 已是 `max-age=0`+ETag，無此問題）。

## 2026-07-30 — 共享路線直接畫出順序（區域大圖）＋ 複製整條改輸出遊戲巨集
> cycle `2026-07-30-route-map`（旁路：前端可逆改動；worker 未動、不需 deploy）。承上一段（顯示名／放大檢視）的同一輪對話收斂。
### Added
- **共享路線每個地圖區上方直接一張大圖**：該區所有點依清單順序 SVG 虛線連起來 + 編號標記（已完成灰化、自己加的金框），點標記可開放大檢視。**為什麼**：原本每列一張 84px 縮圖，要逐列看才拼得出「這區怎麼跑」；一張圖直接把順序畫出來，多人同區時最直觀（Owner 2026-07-30：「某個地圖三個人剛好三個點，直接一張圖顯示三個順序」）。
- **`js/route-map.js`**（新，40 行）：純渲染器 `TreasureRouteMap.render`，只吃百分比座標 + 標籤，不碰房間狀態 → 職責單一、app.js 不再膨脹。
### Changed
- **「複製整條」改成「複製成巨集」**：輸出每行 `/p 庫爾札斯西部高地 ( 21.0 , 14.0 )`（已完成標 ✓），貼進遊戲巨集欄按一下就把整條路線喊給隊友；超過 15 行（巨集上限）toast 提醒分兩個巨集。**為什麼**：原格式「`【區名】` 分段 + `1. ( 21 , 14 )`」每行缺地名、也不是能直接執行的東西，貼進遊戲沒用。
  - **查證留痕（Owner 提「直接給巨集指令」時做的）**：遊戲**原生沒有**用任意座標插旗的指令——`/waymark`(`/wmark`) 只放戰鬥場地標記 ABC/1234 且不吃座標（[Lodestone 文字指令](https://na.finalfantasyxiv.com/lodestone/playguide/db/text_command/82038e3fa9c/)）；能產生可點地圖連結的 `<flag>`（地圖 Ctrl+右鍵手插旗）與 `<pos>`（自身位置）讀的都是當下狀態，無法由工具端指定座標（[Lodestone UI 指南](https://na.finalfantasyxiv.com/uiguide/communication/communication-chat/chat_flag.html)）；`/coord x y : 地名` 是 **ChatCoordinates 插件**指令、非原生。→ Owner 拍板走原生 `/p` 文字版。
  - 格式化抽成 `TC.formatGameCoord`（純函式，3 個 assert 釘住「地名 + 一位小數」形狀）；單點複製共用同一函式，兩處不再各寫一份。
- **一區＝左清單／右大圖並排**（`tre-route-zone__body` grid，窄螢幕 ≤720px 退回上下堆疊）：大圖原本獨佔一整列、下面再接清單，垂直空間浪費且要上下來回看；並排後編號與位置一眼對照（Owner 2026-07-30）。
- **移除清單列縮圖**（`.tre-route-item__thumb/__thumbpin`）：區域大圖已完整取代其功能，留著等於同一資訊畫兩次、列高還被撐大。
### Verified
- `npm test` 4 套全綠 **78 → 81 assert**（只升）。版面以真地圖資料在頁面上組出同結構驗過（截圖：左清單 3 列／右大圖 3 標記，已完成列刪除線、自己的列 accent 條）。
- 瀏覽器 smoke：`TreasureRouteMap.render` 實測 4 點 → 4 標記 + 順序 polyline，已完成 1 顆灰化、自己的 2 顆金框（截圖確認）；`formatGameCoord` 頁面實跑回 `庫爾札斯西部高地 ( 21.0 , 14.0 )`，巨集行組合實跑 `/p 紅玉海 ( 8.5 , 30.3 ) ✓`；按鈕文案已更新、零 console error。
- ⚠️ **未驗**：真房間端到端（同前段，本地 `wrangler dev` 起不來＝B-004）；渲染器與格式化皆已在頁面上以真資料直接驗過。

## 2026-07-30 — 房間顯示名可手動改 ＋ 共享路線縮圖可放大
> cycle `2026-07-30-room-display-name`（旁路：可逆前端改動，無資料模型/對外契約變更；worker 未動、不需 deploy）。
### Added
- **房間 bar 加「我的名稱」輸入框**（在房間內才顯示）：寫回 portal 設定 `character.name`（跨工具共享身份，**不另存本地第二份**），空白＝清除回預設「玩家xxxx」。**為什麼**：顯示名原本只能在 portal 齒輪設定裡改，工具內沒有任何入口 → 多數人整排都是「玩家3f7a／玩家c91d」，等於沒有名字，而名字會出現在共享清單每列、移除隊友點的確認框、「XX 加了 N 個挖掘點」toast。名稱是加點當下快照進 DO 每個點的 → **改名只影響之後加的點**（不假裝回溯，hint/toast 都寫明；要回溯得加 DO rename op，Owner 判本輪不做）。
- **共享路線縮圖點擊放大**：84px 縮圖改 `button`（鍵盤可 Tab/Enter）→ 開 codex-modal 全圖 + **該區所有點的編號標記**（沿用 step3 全圖的 `.tre-fullmap__marker`，被點的那顆 `is-active` 金色放大）+ 座標 + 複製鈕；**縮圖上的 pin 也改成帶清單序號的號碼**（清單序號／縮圖 pin／放大圖標記＝同一組編號，不點開也知道是第幾點）。**為什麼**：縮圖太小看不出實際位置，等於要回上一步重找；標號版比單一 pin 直觀——看得出這點在路線裡的第幾站、鄰近還有哪些點（Owner 2026-07-30 指定）。
- **測試**：`sanitizeDisplayName`（trim／控制字元→空白／截 24 字＝與 worker `ownerName` clamp 同上限／空白視為未設定）進 room-pure，基線 **73 → 78 assert**（只升）。
### Changed
- **抽 `js/app-modal.js`**（confirm + mapView）：app.js 加功能後會破 500 行門檻 → 依「單一職責」把對話框職責分出去（AGENTS 檔案大小鐵則），app.js 482 行、modal 98 行。`drift.test.mjs` 的死 CSS 掃描來源同步加入新檔（否則新 class 會被誤判為死 CSS）。
### Verified
- `npm test` 4 套全綠 78 assert（exit 0）。
- 瀏覽器 smoke（127.0.0.1:8799 + portal CDN）：`setName` 真實 round-trip（含去換行／24 字截斷／清空回預設，測後已還原為未設定）；重繪保值——打字中觸發 renderRoomBar 後值/游標/焦點皆保留（原本會被整條 bar 重畫抹掉）；放大 modal 圖 + 座標完整可見無內捲軸、ESC 可關；零 console error。
- ⚠️ **未驗**：真房間端到端（本地 `wrangler dev` 起不來——`worker/src/index.js:270` 為測試導出的 `MAX_CONN` 常數被 workerd 拒收「not of type 'function or ExportedHandler'」，**既有問題、非本輪造成**，未修）。前端改動不觸及 worker 協定。

## 2026-07-29 — 資料檔快取改即時 revalidate

`/data/*` 由 `max-age=600` 改 `max-age=0` + `must-revalidate`（全站一致的 Owner 裁示）。**為什麼**：資料推上去後前端沒變，使用者無法分辨是「沒推成功」還是「快取還沒過期」，而這兩者的處置完全相反。頻寬不受影響——ETag 命中回 304，內容沒變不會重下載。

順帶記錄：本輪 monorepo 改以台服 client 自解包為繁中名權威（cycle `2026-07-29-B038-tc-client-datamine`）時，重跑 `build-data.py` 對本 repo **零譯名改動**——檔頭那條「`name_tc` 對藏寶圖物品是通用『地圖Gxx』」的偏離**經實測仍成立**：台服官方名確實就是「陳舊的地圖G17」，陸服的「陈旧的狞豹革地图」才帶皮革種類、資訊量較高。⚠️ 但檔頭把官方名寫成「**錯名**」並不正確，那是官方名，只是資訊量較低——措辭待修。

## 2026-07-11 — R2 複檢修復（體質 7.6→8.4 / 使用者 7.0→7.5，全建議批清）
> 依 `docs/health-reviews/2026-07-11-R2複檢-fix-plan.md`；零須修改（全 low/info 建議批）。批次 1 動 worker src → 待 shawn 正式 deploy。
### Added
- **worker 建房/連線防護對齊**：POST /room 補 `originAllowed` 閘（比照 WS 升級路徑，非白名單來源 403）＋單房 WS 連線軟上限 `roomFull`（`getWebSockets().length>=32`→503）（為什麼：建房端點原本任何來源可程式化打、單房連線無上限，兩者皆連線洪水面；不影響正常 8 人組隊 + 多開冗餘）。
- **前端加點 affordance**：挖掘卡右上角常駐 ➕（未加入，surface 底）/ ✓（已加入，accent 底 + ring）（為什麼：原本加入前卡片無任何加入提示，route-empty 文案卻指向不存在的 ➕＝空頭指路）。
- **a11y**：三步切換移焦到新面板標題（`.codex-h2` `tabindex=-1`＋focus，首次載入不搶焦）／斷線·重連·opError·過期事件同步 `announce()` 進 `#tre-status`（aria-live）（為什麼：鍵盤/SR 切步後卡在舊步驟、連線事件原只有視覺 toast 聽不到）。
- **完成進度彙總**：共享路線標題常駐「已完成 X / 共 Y 點」（route-count，不與 route-stat 排序訊息互蓋）。
- **測試地基**：抽 `js/room-pure.js`（UMD，仿 treasure-core）＋`tests/room-pure.test.mjs`（`backoffDelay` 退避上限／`sanitizeJoinCode` 房號淨化）；worker.test 補 origin 拒絕／`roomFull` 邊界／seed 65 點斷言。基線 **3 套 54 → 4 套 73 assert**（只升）。
### Changed
- **route-panel 初始 `hidden`**：避免載入時閃現（renderRoom 依是否在房間顯示）。
- **drift 死 CSS 檢查改 token 邊界比對**：`src.includes` 子字串 → 前後負向斷言 `[a-z0-9_-]`（為什麼：父類 `tre-dig` 被子類 `tre-dig__map` 子字串「誤判已使用」而漏抓死父類；已 node 佐證新舊差異）。
### Docs
- README 刪過時「（部署後）」；AGENTS 檔案大小自述據實化（「各檔遠低於門檻(454)」→「最大 app.js 466 行、近 500 門檻」）＋測試基線 54→73＋補 `js/room-pure.js` 索引。
### Verified
- `npm test` 4 套全綠 73 assert（exit 0）；`pnpm -C worker cf:deploy:dry` 0 error（build OK）；瀏覽器 smoke（portal CDN 載入）確認 ➕/✓ 切換（is-added→✓ + accent ring）、切步移焦（`activeElement`=map-title/tre-title）、route-panel 初始隱藏、room-pure 先於 room 載入且 `TreasureRoom` 正常初始化、零 console error。
- **worker 待正式 deploy（STOP by shawn）**：batch 1 動 `worker/src/index.js` → `pnpm -C worker cf:deploy` 由 shawn 自跑（前端 push 不觸發 worker 部署；dry-run 已驗 0 error）。

## 2026-07-11 — DEVLOOP retrofit ＋ 輕量 delta 稽核
### Added
- **AGENTS.md 正典**（原 `CLAUDE.md` 鐵則搬遷）＋`CLAUDE.md` 薄轉接（`@AGENTS.md`＋Claude 工具專屬段）＋本 `CHANGELOG.md`＋`docs/BACKLOG.md`（為什麼：規則原本只有 Claude 工具讀得到、無跨工具開放標準檔、待辦散在健檢計畫內；影響：跨 agent 可讀、待辦有唯一佇列 B-NNN、變更有人話歷史；規模自聲明＝**M 中型**）。
### Docs
- **修 `docs/health-reviews/_INDEX.md` 過時狀態**：2026-07-04 那列「worker 待 deploy」→ 更正為「worker 已 deploy 2026-07-04」（為什麼：查 `wrangler deployments list` 實證 worker 硬化 commit `ce9cbbe`（2026-07-04 11:38:19Z）後 11 分鐘於 11:49:11Z 已部署，且其後無 worker/ commit → 狀態停留在「待 deploy」是回寫當下的時間差，已上線）。
### Verified（無程式碼改動）
- **delta 稽核 2026-07-04→07-11 乾淨**：期間唯一改動＝`f1a2a60`（D:→C: 路徑遷移，僅註解/README/env 預設值）；無 regression、無鐵則違反（繁中正名走 name_sc→s2twp／無 `except:pass`／色值皆 `var(--token,fallback)` 模式（2 處裸值列 BACKLOG B-002）／無網路快取需 bounded／零 HTML sink）。
- **測試基線建立**：3 套全綠 · 54 assert 呼叫（core 11 / drift 5 / worker 38），`npm test` exit 0。最大源碼檔 `app.js` 454 行、無 >500/>2000 檔。

## 2026-07-04 — 健檢修復（體質 7.6 / 使用者 7.0，須修改＋建議全清）
### Fixed
- **多人共享清單防呆**：破壞性操作（清空/清除已完成/移除隊友點）加 portal codex-modal 二次確認＋成功 toast（為什麼：對全隊 DO 權威清單生效、無 undo，誤點默默抹掉隊友成果，正面撞「不掉點」承諾）。
- **斷線不謊報成功**：送 op 前 `ensureConnected()` 兩層 gate（`isInRoom()`→`isConnected()`），未連上跳「連線中」而非樂觀「已加入」toast（為什麼：斷線/重連空窗 `send()` 靜默丟 op、卻先跳綠 toast＝假成功掉點）。
- **a11y**：挖掘卡改鍵盤可操作（button/role+keydown+aria）、路線列觸控目標 ≥40px（WCAG）。
### Changed
- **worker DO 硬化並部署**（`ce9cbbe`，deploy 11:49:11Z）：seed 正規化（`normalizePoint` add/seed 共用）／ping 計入 OP_RATE 限流／`*_BYTES` 改真位元組（`TextEncoder`）／復活房拒 op／缺 IP 保守 bucket（為什麼：堵 64KB 垃圾隨 state 廣播放大、ping 洪水 DoS、CJK payload 繞字元限）。
- **韌性**：`connect()` 清 reconnectT + 連線去重 / socket 身分守衛 / client 心跳 / `storage_failed` 前端回饋。
- **正確性/品質**：auto-optimize 只由加點者觸發 / 抽 `mapsForGrade` DRY / 縮圖 `decoding=async` / 斷線·重連·同步失敗 toast。
### Added
- **測試地基**：root `package.json` 串 `npm test`（core+drift+worker）＋`tests/drift.test.mjs`（DIG 常數↔CSS 同步／maps image 安全／死 CSS 機械檢查）＋2-opt 固定 golden／`validatePoint` NaN·Infinity 邊界。
- **repo `CLAUDE.md`**：收斂本次踩坑教訓（樂觀 toast／seed 正規化／`type:module` 陷阱）。
- **健檢報告**：`docs/health-reviews/`（雙視角報告＋修復計畫＋`_INDEX`）。
### Docs
- README 補 `js/room.js`＋`worker/`（DO 房間後端）、驗證段加 worker 測試、「零後端依賴」限定於單人查詢；`build-data.py` docstring `name_tc`→`name_sc` 修自我矛盾。

## 2026-06-24 — 繁中服藏寶圖工具初版
### Added
- 三步精靈查挖寶座標（選等級→選地圖→比對謎題圖）＋共享路線即時組隊（codex UI / Teamcraft 資料 / CF Durable Object）。
- UX 二輪：路線縮圖改整張地圖+pin / 高亮自己的點 / 房號 UI 分清楚 / 房間 6h 過期（DO alarm）/ 隊友加點通知 / 卡片美化。
