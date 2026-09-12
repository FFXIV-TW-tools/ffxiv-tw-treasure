# 鐵則由來（`AGENTS.md` 的證據層）

> **定位**：`AGENTS.md` 只放「做什麼／禁什麼／權威在哪／怎麼驗證」，每 session 常駐；本檔放「為什麼」——事故經過、實測數字、拍板日期。
> 懷疑某條鐵則、或要改它時才讀。**新增鐵則時**：規則進 `AGENTS.md`，由來進本檔對應段，兩邊用同一個標題對得上。

---

## 協作後端（Durable Object）

- **op-based 而非整份覆蓋**：mit-planner 早期用「整份覆蓋」，並發加點會互蓋掉點——那正是本站改 op-based 的由來。presence 走 `getWebSockets().length` 是為了 0 storage 寫。
- **不要樂觀 toast 假成功**（2026-07-04 健檢）：斷線／重連視窗內 `room.js send()` 會靜默丟棄 op（`ws.readyState!==1`）。先跳「已加入」成功 toast 的話，使用者無感掉點，正面違反工具核心承諾「多人清單不掉點」。
- **破壞性操作要二次確認**（2026-07-04 健檢）：清空／清除已完成／移除**隊友的**點都對全隊權威清單生效，且 DO 無 undo。刪**自己的**點刻意不擋，不妨礙正當協作。
- **worker 只導出 function**（2026-07-30 B-004）：workerd 把 module 具名導出當 entrypoint 檢查，導出裸值（number／物件）會讓整支 worker 起不來、`wrangler dev` 直接掛——`MAX_CONN` 常數導出讓本地端到端測試斷了好幾輪都沒人發現。
- **worker 先 deploy、前端後 push**：前端 push 自動觸發 Pages build、worker deploy 是人工 STOP ⇒ 兩者之間必然有時間差；新 op 送到舊 worker 會被靜默丟棄。

## 前端與 UI

- **地圖標記不用 emoji**（2026-08-16 補）：遊戲節點圖示是白色線稿，直接貼在米色地圖上幾乎看不見（實測：圖片有載入、定位也對，畫面上就是找不到），傳送點那套淡陰影不夠 ⇒ 才有 30px ＋青色光暈＋黑色投影。marketboard 的 `map_view` 模組檔裡也已記「emoji 在米色地圖上幾乎看不到」。
- **傳送點只收 type 0**（2026-07-30 Owner 判定）：type 1 是以太之光＝出口／換圖點，不是傳送目的地。資料用本地 `aetherytes.json` 而非 Teamcraft 網路檔，兩者內容相同。
- **CSP `img-src` 漂移**（2026-07-30 實踩）：資料重建讓地圖網址換成 v2.xivapi.com、CSP 沒跟 → 線上地圖全黑。**本機 `python -m http.server` 不套 `_headers`，CSP 問題本地測不出來**。
- **`#grade-grid` CLS**（2026-08-23）：等級格由 JS 填（HTML 裡先放「… 展開卷軸 …」一行，約 50px），填完是 680px（1440）～**2340px（390）** ⇒ 把緊接其後的 footer 推出畫面，390px 實測 CLS 0.135。最終高度隨欄數變動一個量級、逐斷點釘不實際 ⇒ 用 `min-height: 72svh` 讓 footer 一開始就在 fold 外（同 ranking `#tableWrap`／sightseeing `.ss-grid`）。修後 1440/1280/900/600/390＝0.015/0.019/0.025/0.051/0.054。本站桌機 0.032 看起來沒事、手機才是 0.124 ⇒ 哨兵必須**逐寬度**掃。
- **`DIG_W/DIG_H` 雙寫**：裁切卡偏移用 JS 常數、卡片視窗尺寸用 CSS，漂移 → pin 偏離挖掘點。
- **檔案拆分沿革**：`js/app.js` 2026-07-30 由 505 行按職責拆出 `app-modal.js`（對話框）／`route-map.js`（區域大圖）／`route-panel.js`（共享路線面板）；2026-08-16 再把 step 2 的兩個補充區塊拆成 `loot-panel.js`／`gather-map.js`，現 408 行，其餘各檔偏小。
- **文案不寫內部術語**（Owner 2026-08-16）：但誠實性不能跟著消失——「這是推導、不保證」要改寫成玩家語言（例：「符合這張圖採集等級的採集點（不保證每個點都會出）」），不是刪掉。

## 資料與名稱權威

- **繁中名零機器轉換**（2026-08-13 更正）：本條原文是「物品名 = `name_sc → OpenCC s2twp`（`name_tc` 對藏寶圖是通用『地圖Gxx』**錯名**）」——**那個括號裡的判斷是錯的，而它就是 bug 的來源**：「陳舊的地圖G17」正是台服 client 出貨的名字（日服同為編號式 `古ぼけた地図G17`，只有英文用皮名）。照那句話做出來的站顯示的是**国服名機轉**，玩家拿回遊戲內搜尋找不到，而畫面上完全看不出問題。
- **「`item_lookup` 有繁中名」≠「台服有這個名字」**：G18(46185) 的 `name_tc` 有值（国服名機轉），但台服解包裡是**空字串** ⇒ 判斷必須看 `name_tc_source`，不能只看有沒有值。這一欄之前不存在，兩者在資料上完全無法區分，我就是這樣把 G18 誤判成「可以補了」。
- **`dt` 也要收**（2026-08-16 查證）：`dt` 就是台服 client 本地解包，`tc_Item.csv` 那份較舊、7.x 物品多為空字串 ⇒ 只收 `dump` 會把台服真的有官方名的物品擋掉一半。
- **未收錄品項要在畫面上講出來**：只是默默少列的話，清單看起來完整卻少了一半，而畫面上沒有任何訊號。
- **「藏寶圖從哪個採集點掉」在解包裡不存在，別再查一次**（2026-08-16 查證）：`GatheringItem` **有**藏寶圖（G17→`GatheringItemLevel` 100＝採集等級門檻，站上那行「⛏ 採集 Lv.N 以上的點可能挖到」就是它），但掃過 `GatheringPointBase` 全 1425 列與 Teamcraft `nodes.json` 的 `items`／`hiddenItems`，**13 張圖零命中** ⇒ 它是「採集時隨機額外取得」，不掛在任何採集點上。
- **`nodes.json` 的 `map == 0` 缺口**（2026-08-16 實測丟掉 197 個）：不知道在哪張圖就畫不出來，硬畫會標到錯的位置而畫面上完全正常 ⇒ 一律丟棄，所以點數是**下限**不是全部。`type` 4/5＝刺魚／釣魚不會出圖。
- **掉落物兩種來源不得混成一份**：`dungeons` 是玩家問「G17 的地牢有什麼」時要的東西（加加財富天坑 18 項 vs `loot` 的 2 項）；混成一份的話，只有前者有的機率欄會讓後者看起來也是「已知機率」。Teamcraft `loot-sources.json` 是社群整理、**已知不完整**（G17 只有 2 筆、綠圖 0 筆）。
- **`DungeonDrop` 要併**：舊寶物庫有一批只記在 `DungeonDrop`（水城 +52、運河 +23…），不併就少列一半；新的三座（驚奇百寶城／育體寶殿／加加財富天坑）沒有 `DungeonDrop` 資料。
- **`DUNGEON_CATALOG` 是人工對照**：「圖等級 → 藏寶迷宮」的對照在解包裡不存在（`TreasureHuntRank`→`EventItem`→`InstanceContent`→`CFC` 整條查過都斷開）；一張圖可能通往多個迷宮，單人圖挖不到傳送門所以沒有。已於 2026-08-16 與 Owner 提供的寶物庫列表逐條複核（版本／等級／對應藏寶圖）**九座全數吻合**。7.3 的「巡夢金庫」（對應 G18）台服 client 尚未收錄、拿不到 CFC id，等台服開放再補一行。接錯世代的防呆＝patch 閘，不靠人記得核對。
- **`names-authority` 哨兵讀原始 CSV**：權威源＝`datamining_tc/tc_Item.csv` ∪ `tclocal_Item.csv` **原始解包**，不用 `item_lookup.name_tc`（那欄混了 OpenCC fallback）——那是**獨立於 sqlite 的第二個證人**，兩邊都錯才會漏。拿不到權威源一律失敗不 skip。
- **多語名詞不進資料檔**：字典只在切外語時才載入 ⇒ 繁中訪客一個位元組都不用付（monorepo 鐵則「資料只載當前這份會用到的」）。

## 建置與演算法

- **root `package.json` 不設 `"type":"module"`**（2026-07-04 踩過）：`treasure-core.js` 是 UMD（`module.exports`），設了會把它當 ESM → `.mjs` 測試的 `import TC from` default-import 失效。`.mjs` 測試本就 ESM 不受影響；`worker/` 自帶 `"type":"module"`（worker code 是 ESM）不衝突。
- **2-opt 是閉環假設**：尾端 `(k+1)%length` 是幻邊，而本工具是**開放路徑**（`calcTotalDistance` 只累加 n-1 段）。用「≤ 非 2opt」單調斷言在開放路徑下會 flaky ⇒ 要釘就用固定 golden `deepEqual`。
- **座標／路線來源**：座標公式＝FFXIV 官方 datamining；路線演算法移植自 cycleapple/xiv-tc-treasure-finder，移植時對 reference 跑過 parity。

## VERIFY 測試基線沿革

- 2026-08-03 原始四套：core 14 / room-pure 17 / drift 13 / worker 60，`npm test` exit 0。此為歷史實跑紀錄；基線增減依有效契約據實記錄，不以數量方向判品質。
- worker 52→56＝B-047 xivtc.com 遷移期的 Origin 雙列契約：新網域 `treasure.xivtc.com` 須放行、未列舉的 xivtc 子網域／apex／後綴偽裝須被拒。
- worker 56→60＝2026-08-04 心跳 auto-response 跨檔漂移哨兵：DO 必須註冊 `setWebSocketAutoResponse`，且其比對的幀須與 `js/room.js` 送出的逐字節一致——沒註冊或字串不符都會讓每次心跳叫醒 DO 並計費，而**兩種失敗都零功能訊號**。
- 2026-08-13 新增兩套：`names-authority`＝顯示名逐筆對台服解包；`i18n`＝薄 wrapper，實作在 portal 共用哨兵。
- names-authority 20→40（2026-08-16）＝掉落物名稱逐筆對台服解包（權威源擴為 `tc_Item` ∪ `tclocal_Item` 兩份）＋藏寶迷宮掉落＋`hidden` 未收錄數＋畫面標註不得消失。
- i18n 62→79→82：**62 是共用哨兵回報的檢查項數**，不是本 repo 的 assert 數——它會隨共用哨兵演進而變，屆時照實更新即可，那不是本站的回歸。62→76 是 EN／JA 上線那筆 commit 只長了測試、沒回寫宣告值；79 是 2026-08-16 實測（新增 `js/gather-map.js` 進掃描清單）。
- 為什麼數字是「各測試從自身原始碼數出來的 assert 呼叫點」而不是執行次數：後者會被資料驅動迴圈放大，地圖改版就假紅燈。

## 部署面鐵則（2026-08-01 事故）

- CF Pages 無 build 步驟時把 repo 根整棵目錄當靜態資產上傳 → `AGENTS.md`／`docs/`／`tools/`／`tests/`／`worker/` 後端源碼全部變成該網域下可直接 GET 的公開檔（實測 12/13 站中招）。**private repo 只保護「誰能 clone」，不保護「已部署的檔案誰能下載」**；`.gitignore`（檔是 tracked）／`_headers`（只加標頭）／`robots.txt`（只擋收錄不擋直取）都擋不到。
- **排除清單做不到**：實測當天漏了 `worker/` 106 支 `.ts` 與 `_tools/`／`_cache/` 141 檔。
- **分類閘另有兩條靜默放行**（健檢 R3 D6）：CF 容器 npm 產物固定 skip 清單、`git check-ignore`——它是「逼人歸類」的提醒層；**真正的部署邊界是第 2 段複製迴圈的 allow-list 比對**，改腳本時該比對不可動、skip 清單只放建置環境產物不得用來繞分類。
- **POSIX 語法**：CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、輸出 0 檔而 build 仍「成功」⇒ **整站 404**（2026-08-01 實際發生）。根層檔名無條件 `mkdir "$OUT/${f%/*}"` 會建出「叫 index.html 的目錄」⇒ `/` 404。
- **產物路徑並行安全**：ranking B-117（2026-08-15）實證，只做「逐次專屬」而不加鎖**仍然兩份都 exit 1**（撞在 `rm -rf _site`）；現行解＝建到 `_site.tmp.$$`、清單走 `mktemp`（repo 外）、換名段用 `mkdir "$_site.lock"` 序列化，哨兵＝`test_deploy_prepare_is_concurrency_safe`。兩次實際故障的訊息（「頂層出現未分類項目」「輸出缺 index.html」）**都指向錯的方向**，看起來像漏加允許清單 —— 本 repo 日後若接排程／並行寫入者，照 ranking 的做法改，別重新 debug 一次。
- **驗收不帶 cache-bust 會得到假紅燈**：舊部署（發佈 repo 根的那版）留在 CF 邊緣的物件帶 `s-maxage=604800`，命中時回 `text/markdown` 但 header 有 `CF-Cache-Status: HIT` ＋ 大 `Age`。**那是快取殘留不是外洩**，最長 7 天自癒（pages.dev 非自有 zone，dashboard 沒有 Purge Everything，收斂路徑就是等 TTL）。2026-08-01 R3 健檢實測：帶 cache-bust 的 `/AGENTS.md`、`/worker/src/index.js`、`/deploy-allow.txt` 全回 SPA fallback＝現行部署乾淨。
- 本段為 12 個 external repo 的**共用權威版本**（2026-08-15 統一）：三條原本只寫在單一 repo 的教訓（cache-bust 假紅燈／分類閘的靜默放行／產物路徑並行安全）已回填到所有副本。

## 已退役

- **舊網址交接機制**（2026-09-05 退役，B-048）：舊 `*.pages.dev` host 的 301 改由 Cloudflare **帳號層 Bulk Redirects** 在邊緣執行。本 repo 不再有 functions 層的 middleware（**已退役，2026-09-07 複核未找到 `functions/_middleware.js`**）、HTML 也不再有 inline 交接腳本（`?stay` 救援門一併結束）；交接測試 `handoff.test` 與路由清單 `route-manifest`（**已退役，2026-09-07 複核 `tests/` 下未找到**）已刪。`_routes.json` 的 include 只留 API 代理路徑（HTML 路徑不進 Pages Functions、不再計費）。
