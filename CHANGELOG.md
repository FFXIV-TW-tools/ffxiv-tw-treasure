# Changelog

> 日期段落制（cycle 收官為段）；條目含人話「為什麼」，不從 git log 自動生成。
> 2026-07-11 起依 DEVLOOP 隨 cycle 更新；以前的段落為回填摘要（源自 git log 與健檢報告）。

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
