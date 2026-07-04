# ffxiv-tw-treasure 修復計畫（2026-07-04）

> 依據：同目錄 `2026-07-04-treasure-health-review.md`
> 使用者＝繁中服玩家（桌機/手機第二螢幕、網路易斷）；核心承諾＝「多人清單不掉點」。
> commit 顆粒度對齊 `external/CLAUDE.md`（精準 stage、禁 `git add .`）；**push 走 STOP**（走 cmd.exe，見 deploy-runbook）。

---

## 須修改（必做）— 批次化可執行步驟

### 批次 0：測試地基與機械 ratchet（先做，作後續安全網 + 零成本回歸防護）

> 全部是純函式/腳本層、零 UI 風險，先固化不變量再改行為。

**0-1 root `package.json` 串起兩支測試 + CI gate**
- 動機：兩支守核心不變量（座標公式、並發不互蓋）的測試無聚合入口、無 push gate，綠燈目前是人工的。
- 檔案：新建 `package.json`（repo 根）+ 選擇性 `.github/workflows/test.yml`
- 做法：root `package.json` 加 `"test": "node tests/core.test.mjs && node worker/tests/worker.test.mjs"`；CI 於 push 跑 `npm test`。
- 驗證：`npm test` 兩支皆 exit 0。
- 依賴：無。

**0-2 補純函式邊界測試（把驗過的不變量固化）**
- 檔案：`worker/tests/worker.test.mjs`、`tests/core.test.mjs`
- 做法：
  - worker.test 加 `assert.ok(!validatePoint(P({x:NaN})))` + `Infinity`（守 `!isFinite` guard，docs-tests B3）
  - core.test 加 `optimize(fixture,{use2Opt:true})` 的**固定 golden `deepEqual`**（釘 dormant 2-opt，docs-tests B2）
  - ⚠ **計畫審修正**：**不用** `totalDistance ≤ 非2opt` 單調不等式——improve2Opt 是閉環假設（幻邊），`analyzeRoute` 量開放路徑，2-opt 可能讓開放路徑指標變大 → 單調斷言會 flaky 或反鎖 bug。只用固定輸入的 `deepEqual` 釘當前行為。
- 驗證：`npm test` 綠。
- 依賴：0-1。

**0-3 drift 機械檢查（高 ROI）**
- 檔案：新增 `tests/drift.test.mjs`（或併入 core.test）
- 做法：① 抽 `app.js` 的 `DIG_W/DIG_H` 與 `styles.css` 的 `--dig-w/--dig-h` 數值，不等即 fail（quality A2）；② 斷言 `maps.json` 每筆 image `^https://` 且不含 `"'()`（sec-frontend A2）。
- ⚠ **計畫審修正**：**死 CSS grep 檢查移到批次 3-2 同 commit**（與刪除共置），不留在 0-3——否則批次 0 先跑會因死 CSS 未刪而紅、掛紅到批次 3。DIG_W/DIG_H drift 與 maps.json 檢查留批次 0 無妨。
- 驗證：`npm test` 綠。
- 依賴：0-1。

### 批次 1：多人共享清單防呆與回饋（預期 1-2 commit · 驗證 `npm test` + 手動 UI smoke）

> **本批是本次健檢的核心**，直接補「不掉點」承諾的兩個破口。皆前端可逆改動。

**1-1 破壞性操作加確認 + 成功回饋（須修改 #1）**
- 動機：清空 / 清除已完成 / ✕ 移除 對全隊 DO 權威清單生效、無 undo、無確認、無回饋 → 誤點默默抹掉隊友成果。
- 檔案：`js/app.js:305-312`（route handler）、`js/app.js:270-271`（✕ 移除）
- 做法：
  - `clear`：跳確認「將清掉全隊 N 個點（含隊友的），確定？」→ 確認才 `ROOM.clear()` + 成功 toast「已清空 N 點」。
  - `clear-done`：同樣加確認（可較輕）+ 成功 toast。
  - ✕ 移除：**他人的點（`r.owner !== ROOM.owner()`）才加確認**（計畫審修正：硬鎖「只能刪自己的點」會擋掉正當協作如房主幫清重複/錯點，且刪他人點已校正為 low → 硬鎖屬過度設計）；自己的點維持一鍵刪。
  - ⚠ 確認框：避免用 `confirm()`（阻塞式、且本專案 CSP/瀏覽器對話框慣例）——優先用既有 codex 元件或輕量自訂確認；若無現成確認元件，退而用 `confirm()` 可接受（社群小工具、比例原則）。
- 驗證：手動——房間內加 3 點→按清空→出現確認→取消不動、確認清空並跳 toast；✕ 隊友點跳確認。
- 依賴：無。

**1-2 斷線時不謊報成功（須修改 #2，合併 3 維）**
- 動機：斷線/重連空窗送 op 被 `send()` 靜默丟棄，但 `toggleMine` 已跳「已加入」綠 toast → 假成功掉點。
- 檔案：`js/room.js:68`（`send`）、`js/app.js:172-181`（`toggleMine`）、房間動作各處
- 做法（計畫審修正：**兩層 gate、免佇列、免 send 布林**）：
  - `toggleMine`：**保留兩層** — 先 `ROOM.isInRoom()`（否則提示「先建房」+捲動，現況）→ 再 `ROOM.isConnected()`（否則跳「連線中，稍後再試」`warn`，不跳成功 toast）。**不可單純把 isInRoom 換成 isConnected**——否則「已在房但暫斷線」會誤報「先建房」。
  - `setDone`/`setOrder`/`clear`/`clearDone` 觸發前同樣先查 `isConnected()`，未連線給「連線中」提示（現況完全無回饋）。
  - **不做** bounded 佇列（YAGNI：誠實 warn 已修掉「假成功」這個真缺陷；佇列還要處理去重/stale key，成本不值）；**不改** `send()` 回傳布林（事前 gate 已足夠，改回傳值要動所有 `ROOM.*` wrapper 才一致，非必要）。
- 驗證：手動——DevTools 斷網→按加入→出現「連線中」非「已加入」；恢復網路後（若做佇列）自動補送。
- 依賴：無。

### 批次 2：a11y 核心可用性（預期 1 commit · 驗證 鍵盤 + 手機 smoke）

**2-1 挖掘卡改可鍵盤操作（須修改 #3）**
- 動機：核心互動「加入共享路線」的挖掘卡是 `div`+click，鍵盤/AT 完全無法操作（WCAG Level A）。
- 檔案：`js/app.js:125-141`（`renderTreasures`）
- 做法：`card` 改 `createElement('button')`（type=button，注意重設 button 預設樣式已由 `.tre-dig` 覆蓋，需確認 `padding:0`/`background`/`font` 不破版）；或保留 div 但加 `role="button" tabindex="0"` + `keydown`（Enter/Space→`toggleMine`）。加 `aria-label`「加入共享路線 X:23 Y:18」+ `aria-pressed` 反映 `is-added`；focus 時比照 mouseenter 呼叫 `highlight`。
- 驗證：Tab 能聚焦挖掘卡、Enter/Space 能加點、`:focus-visible` outline 可見、螢幕閱讀器播報 label。
- 依賴：無。建議搭配 batch 0-3 的「dig-card 必為 button/role=button」lint 斷言鎖住。

**2-2 觸控目標放大（須修改 #4）**
- 動機：路線列 checkbox/📋/✕ 命中區 18-28px < WCAG 24px，手機核心情境易誤點（✕ 誤刪連動 #1）。
- 檔案：`styles.css:236, 237, 185`（可只在 `@media (max-width:720px)` 內加大）
- 做法：`@media 720px` 下 checkbox 與 `.tre-route-item__btn` min-height/min-width ≥40px（padding 或透明 hit-area）、拉開 ✕ 與 📋 間距；`.tre-fullmap__marker` 於窄機加大可點半徑。
- 驗證：手機/DevTools device mode 量測命中區 ≥40px、不破版。
- 依賴：無。

### 批次 3：文件與死碼清理（預期 1 commit · 驗證 讀 README + `npm test`）

**3-1 README 補多人房間（須修改 #5）**
- 檔案：`README.md`（結構段、驗證段、L15）
- 做法：結構段補 `js/room.js` + `worker/`（DO 房間後端）；驗證段加 `node worker/tests/worker.test.mjs`（或 `npm test`）；「零後端依賴」限定於單人查詢、補一句多人依賴 worker。
- 驗證：README 結構/驗證段與實際檔案一致。
- 依賴：0-1（驗證段引 `npm test`）。

**3-2 刪 3 個死 CSS + 修過時註解 / docstring（併入本批）**
- 檔案：`styles.css:168,199,262`（刪）、`js/room.js:7`（改註解）、`tools/build-data.py:9`（`name_tc`→`name_sc`）
- 做法：刪 `.tre-dig__coords`/`.tre-loading`/`.tre-roombar__hint`；`API_PROD` 註解改「已對齊 _headers/wrangler」；docstring 決策段改 `name_sc → s2twp`。
- 驗證：`npm test`（含 0-3 死碼檢查）綠、UI 無變化。
- 依賴：與 0-3② 連動（先刪死 CSS 再讓檢查通過）。

---

## 建議修改（可選）— 輕量清單 + ROI

> 皆 confirmed low/info。行有餘力再做，按子系統可各自獨立成 commit。詳見 health-review.md「建議修改項目」。

- **後端硬化**：seed 正規化 · ping 計入 OP_RATE · `*_BYTES` 改真位元組 —— ROI：堵放大 DoS/繁中 payload 繞限（`worker/src/index.js`，可一批）
- **韌性**：`connect()` 清 reconnectT + 去重連線 · socket 身分守衛 · storage_failed 回饋 · client 心跳 · 復活房補 alarm · `emit()` 加 warn —— ROI：補斷線邊角（`js/room.js` + worker，可一批）
- **正確性/品質**：auto-optimize 只由當事人觸發 · 抽 `mapsForGrade` helper —— ROI：減冗餘 op 放大 / DRY（`js/app.js`）
- **效能/UX**：`img.decoding='async'` · route-list 就地 diff · 斷線 toast · 打錯房號空房提示 —— ROI：行動端順滑 + 斷線可感知（`js/app.js`）
- **CSP hash 取代 unsafe-inline**：縱深硬化（`_headers`，維護成本取捨）
- **enhancement**：單人本地暫存清單（非缺陷）

---

## 執行備註

- **commit 顆粒度**：批次 0（測試/CI）一個主題一 commit；批次 1（防呆+回饋）是核心、可 1-2 commit；批次 2（a11y）、批次 3（文件/死碼）各自成 commit。跨檔但同主題歸同 commit（如 1-2 的 `room.js`+`app.js`）。
- **commit 前知會**：動手前列「要 commit `<檔案>`、訊息 `<message>`」給 shawn，無反對才執行（不把 stage+commit 塞同一連鎖命令）。
- **push = STOP**：本 repo push 走 **cmd.exe**（`git -C external/ffxiv-tw-treasure push`），由 shawn 自己跑。push `main` → CF Pages 自動 build（前端）；worker 若有改需另 `pnpm cf:deploy`（STOP，見 deploy-runbook 目標 A/B）。
- **本批未動 worker 行為**（除建議項）→ 前端改動 push 即上線、無需重 deploy worker。
- **需 shawn 拍板**：
  - 1-1 的 ✕ 移除採「加確認」還是「只能刪自己的點」（後者改變協作語意）。
  - 是否建立本 repo `CLAUDE.md`（收斂本次踩坑教訓，見報告 Memory 段）。
  - 確認框用 codex 自訂元件 vs `confirm()`（比例原則下 `confirm()` 可接受）。
