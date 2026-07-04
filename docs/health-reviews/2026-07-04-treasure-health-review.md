# ffxiv-tw-treasure 健檢報告（2026-07-04）

## 總評：專案體質 **7.6 / 10** · 使用者友善 **7.0 / 10** — 內外皆穩健，但使用者側有一個集中弱點：**多人共享清單的破壞性操作防呆與斷線回饋**（2×2 象限：內外皆穩，唯 ux-flows 一格需優先補）

一支做得相當用心的社群小工具：前端 XSS 面極窄（全程 `createElement`+`textContent`）、DO worker 的 op-based 並發正確性紮實（單執行緒序列套用保證「並發加點不互蓋」）、演算法有 golden test 釘住、CSP/安全 header 齊備。扣分**不在地基，而在多人房間的「使用者感知」層**：對全隊生效的破壞性操作（清空 / 移除）無二次確認、斷線時 op 靜默失效卻樂觀 toast 謊報成功——這兩者正面撞上工具最核心的承諾「多人清單不掉點」。這是本次唯一需要優先動手的主題；其餘 20 餘項皆為 low/info 級硬化與 polish。

> **審查規模**：9 維度（6 專案體質 + 3 使用者友善）× 對抗驗證 = 20 個 agent、0 失敗、1.35M token。31 個 raw finding 經獨立 skeptic 查證後：1 refuted、9 severity 下修、3 跨維重複合併。

---

## 機械基線（我已驗，勿重跑）

| 項目 | 結果 |
|------|------|
| `node tests/core.test.mjs` | ✅ all assertions passed (exit 0) — 座標公式 + 路線優化 golden |
| `node worker/tests/worker.test.mjs` | ✅ all assertions passed (exit 0) — applyOp 並發不互蓋 / validate / originAllowed |
| typecheck | N/A（純 JS，無 TS） |
| lint | repo 無 lint 設定 |
| 資產大小 | treasures.json 34KB · maps.json 3.8KB · grades.json 1.7KB（皆小，`Promise.all` 並行載）；地圖貼圖 xivapi.com hotlink（lazy）|
| 資料量 | 477 點 / 13 等級 / 28 圖（與 `_meta` / README file-map 一致，無數字 drift）|
| CI | ❌ 無 `.github/workflows`、repo 根無 `package.json`（前端測試無 npm script 入口）|
| CLAUDE.md / memory | 本 repo 無 CLAUDE.md；對應 memory 目錄空 → memory 稽核維度「無，略過」|

---

## 維度評分

### 專案體質（project）— 加權 **7.6**

| 維度 | 分數 | confirmed | 一句話 |
|------|:----:|:---------:|--------|
| 安全性 — 後端 / DO worker | 7.5 | 5（皆 low/info）| origin 白名單 fail-closed、validate 嚴、op 序列正確；缺口在 seed 路徑不如 op 路徑正規化 |
| 安全性 — 前端 / XSS / CSP | 9.0 | 2（low/info）| 全程 textContent 無 HTML sink，CSP 完整；剩 `unsafe-inline` 可收斂為 hash 的縱深硬化 |
| 正確性 — 並發 / 演算法 / 資料 | 7.5 | 3（low/info）| op-based 並發鐵桶、座標公式與 build-data 正確；扣分在 client→server 交付層的樂觀假成功 |
| 韌性 — 重連 / 錯誤 / 額度 | 7.0 | 7（low/info）| 退避/重連/過期/額度都穩，但數個 low 缺口集中在「斷線邊角」（靜默丟 op、重複連線、無心跳）|
| 程式品質 / DRY | 8.5 | 4（low/info）| 檔案都 <360 行、職責清楚、註解同步；只有死 CSS 與雙寫常數等輕量瑕疵 |
| 文件 drift + 測試/CI | 7.0 | 6（1 medium）| 核心不變量測試紮實；但 README 整份 predates 多人房間、且無 CI 聚合入口 |

### 使用者友善（user）— 加權 **7.0**

| 維度 | 分數 | confirmed | 一句話 |
|------|:----:|:---------:|--------|
| 感知效能（perf-ux）| 8.0 | 2（low）| 資產小、演算法 trivial、無 CLS；只有行動端大圖解碼與廣播重建的邊際優化 |
| UX 流程 / 回饋 / 防呆（ux-flows）| 6.0 | 5（1 high/1 medium）| 精靈引導與 toast 用心，但**破壞性操作無防呆 + 斷線假成功**是集中弱點 |
| A11y / 跨裝置（a11y-compat）| 7.0 | 3（medium×2）| 語意/aria 底子好，但挖掘卡 div+click 鍵盤不可用、觸控目標偏小 |

**加權說明**：專案體質權重＝安全 0.25(前後各半)／正確 0.30／韌性 0.15／品質 0.10／文件+測試 0.20；使用者友善＝perf 0.40／ux 0.40／a11y 0.20。ux-flows 因含 confirmed high 封頂 6.0，是壓低使用者分的主因。

---

## 須修改項目（必做）— 真缺陷，按風險排序

### 1. 🔴 破壞性操作對全隊共享清單無防呆 `[使用者·ux-flows A1+A2]` — **high**
- **檔案**：`js/app.js:305-312`（clear/clear-done handler）、`js/app.js:270-271`（✕ 移除）、`index.html:131-132`
- **現況**：「🗑 清空」清掉整份共享清單（含所有隊友解到的點）、「清除已完成」清掉全隊已完成點、路線列每點「✕」可刪任一 owner 的點——**三者皆無二次確認、無成功 toast、DO 權威清單無 undo**。同一 handler 內 optimize/copy 都有 toast，唯獨這幾個刪除動作靜默。
- **影響**：一次誤點（尤其手機第二螢幕誤觸）隊友的成果就默默消失，操作者連「已清空 N 點」的確認都拿不到。正面撞上工具最核心該防的資料遺失。
- **修**：清空 / 清除已完成前跳確認（「將清掉全隊 N 個點（含隊友的），確定？」）+ 成功 toast；✕ 移除他人的點時加確認，或限制成只能刪自己的點（`r.owner === ROOM.owner()`）、隊友的點灰階唯讀。

### 2. 🟠 斷線視窗 op 靜默失效，但樂觀 toast 謊報「已加入」成功 `[使用者·ux-flows A4 ⊕ resilience A1 ⊕ correctness A1]` — **medium**
- **檔案**：`js/app.js:172-179`（`toggleMine` gate 在 `isInRoom()` 非 `isConnected()`）、`js/room.js:68`（`send()` 在 `ws.readyState!==1` 時靜默 no-op）
- **現況**：WebSocket 斷線/重連空窗（退避最長 15s）或 DO rate limit 觸發時，op 被靜默丟棄；但 `toggleMine` 已先跳綠色「➕ 已加入共享路線」toast。`setDone`/`clear` 則相反——斷線時完全無回饋，按鈕像壞掉。
- **為何列 medium**：三個維度（正確性/韌性/UX）各自獨立抓到同一根因，收斂即訊號。目標使用者正是「邊玩遊戲邊用手機第二螢幕、網路易斷」的高風險族群，直接弱化「不掉點」承諾。（有補償訊號：卡片 ✓ 靠廣播回填、掉點時不亮，故非完全靜默 → 未升 high。）
- **修**：送 op 前檢查 `ROOM.isConnected()`，未連線改跳「連線中，稍後再試」而非成功 toast；或 `send()` 回傳布林讓 toast 依實際送出結果顯示；進階可加 bounded（≤64）待送佇列，`onopen` flush。

### 3. 🟠 挖掘卡是 `div`+click，鍵盤 / 螢幕閱讀器無法加入共享路線 `[使用者·a11y A1]` — **medium**
- **檔案**：`js/app.js:125, 138`（`renderTreasures`）
- **現況**：全站其他互動（等級卡/地圖卡/步驟/marker/房間鈕）都是 `<button>`，唯獨挖掘卡是 `div`+click——無 `tabindex`/`role`/`keydown`。既不可 Tab 聚焦、`:focus-visible` 也套不上、Enter/Space 無效。而「把自己解到的點加進共享路線」是核心互動。
- **影響**：鍵盤與螢幕閱讀器使用者完全無法執行核心操作（WCAG Level A 破口）。滑鼠/觸控不受影響。
- **修**：改用 `createElement('button')`（type=button），或補 `role="button" tabindex="0"` + keydown 監聽 + `aria-label`（「加入共享路線 X:23 Y:18」）+ `aria-pressed` 反映 `is-added`。

### 4. 🟠 路線列 checkbox / 📋 / ✕ 觸控目標過小 `[使用者·a11y A2]` — **medium**
- **檔案**：`styles.css:236`（checkbox 18×18）、`:237`（`.tre-route-item__btn` padding 2px 8px）、`:185`（marker 18px）
- **現況**：多人流程核心操作（完成勾選、複製、移除）實際命中區約 18–28px，低於 WCAG 2.5.8 的 24px、遠低於 44px 建議；密集排在同一列易誤點，而 ✕ 誤觸會刪掉隊友的點（連動 #1）。
- **修**：手機斷點（≤720px）下把 checkbox 與 `__btn` 命中區放大到 ≥40px（padding / 透明 hit-area / min-height），拉開 ✕ 與 📋 間距。

### 5. 🟡 README 整份 predates 多人房間功能 `[專案·docs-tests A1]` — **medium**
- **檔案**：`README.md`「結構」段（~L40-52）、「驗證」段（~L33-37）、L15
- **現況**：結構段只列 index.html/styles.css/treasure-core.js/app.js/data/build-data.py/core.test——**無 `js/room.js`、無 `worker/`（整個 DO 後端）**；驗證段漏 `node worker/tests/worker.test.mjs`；L15「純靜態前端…部署後零後端依賴」對整站已失真。
- **影響**：多人共享路線（進階核心功能）在 README 完全隱形，fresh clone 的 contributor 不知有 worker 要 deploy、不會跑並發正確性那支測試。
- **修**：結構段補 `js/room.js` + `worker/`；驗證段加 worker 測試；「零後端依賴」限定於單人查詢。

---

## 建議修改項目（可選）— 改善 / 硬化 / polish

> 每項：`標題 — file:line — 做法 — ROI`。全部 confirmed low/info，非缺陷。

**後端硬化 `[專案·sec-backend]`**
- seed 路徑正規化 point — `worker/src/index.js:201-206` — 抽 `add` 的 normalize 供 seed 共用（丟棄未知欄位、clamp ownerName 24）— 堵「64KB 垃圾隨每次 state 廣播放大」的建房者濫用（low）
- ping 計入 OP_RATE — `worker/src/index.js:216-227` — 把速率窗計數移到 ping 判斷前 — 擋 ping 洪水 app-level DoS（low）
- `*_BYTES` 改真位元組 — `worker/src/index.js:137,217` — 用 `TextEncoder().encode(x).length` 或改名 `*_CHARS` — CJK payload 目前可達上限約 3 倍（low）
- GET/WS per-IP 限流、缺 IP 保守 bucket — `:147-149, :92`（info，僅記錄，低敏感+短命已緩解）

**前端安全 `[專案·sec-frontend]`**
- CSP `script-src` 用 sha256 hash 取代 `'unsafe-inline'` — `_headers:9` — bootstrap 是靜態字串可算 hash — 縱深硬化（low，維護成本取捨可保留）
- `backgroundImage` url() 跳脫 / build 端斷言 image 為 https 且無引號 — `js/app.js:128,144,232`（info，資料源可信）

**韌性 `[專案·resilience]`**
- `connect()` 開頭 `clearTimeout(reconnectT)` + guard 既有 ws — `js/room.js:49-52` — 修重複連線/孤兒 socket/presence 灌水（low）
- socket 身分守衛（`if (ws !== socket) return`）— `js/room.js:64` — 修 stale onclose 清掉新 socket（low）
- `storage_failed` 前端回饋 + 修誤導註解 — `js/room.js:62` — 加 `m.t==='error'` 分支 emit + toast「同步暫時失敗」（low）
- client 心跳 ping（每 ~25s + lastPong 逾時重連）— `js/room.js` — 啟用既有 worker pong，修半開連線靜默停擺（low）
- 復活房補 `setAlarm` — `worker/src/index.js:238` — 每次 put 後 ensure alarm，或 `!st` 也視同過期拒 op — 修孤兒房 storage 永久殘留（low）
- `emit()` 裸 catch 加 `console.warn` — `js/room.js:38`（info，禁靜默吞錯精神）

**正確性 `[專案·correctness]`**
- auto-optimize 只由加點當事人觸發 / debounce — `js/app.js:337-338` — 避免 N 人各送相同 setOrder 的 O(N) 放大（low）
- `improve2Opt` 開放路徑尾端幻邊 — `js/treasure-core.js:110-116` — dormant（use2Opt 預設關、無呼叫者），啟用前修或加註「開放路徑勿啟用」（info）

**品質 `[專案·quality]`**
- 刪 3 個死 CSS — `styles.css:168(.tre-dig__coords) / 199(.tre-loading) / 262(.tre-roombar__hint)`（low）
- 抽 `mapsForGrade(g)` helper — `js/app.js:72-74 ↔ 97-99` renderMaps/renderMapTabs 重複的分組+排序（low）
- 移除過時 `API_PROD` 註解 — `js/room.js:7`「⚠ deploy 後確認此 URL」已對齊三方（info）

**文件 / 測試 `[專案·docs-tests]`**
- 加 CI / root `package.json` test script 串兩支測試 — push 觸發機械 gate（low）
- `build-data.py:9` docstring `name_tc`→`name_sc` 修自我矛盾（low）
- 補測試：2-opt golden(`core.test`)、`validatePoint` NaN/Infinity(`worker.test`)、DIG_W/DIG_H drift、expiresAt 保留（low，見計畫 batch 0）

**效能 / UX / a11y `[使用者]`**
- 縮圖 `img.decoding='async'` — `js/app.js:77` — 避免同步解碼阻塞主執行緒（low）
- route-list 依 key 就地 diff 取代整清單重建 — `js/app.js:249` — 減活躍組隊時 checkbox 閃動/焦點丟失（low）
- 斷線/重連各跳輕量 toast — `js/app.js:199` — 捲離房間 bar 也知道斷線（low）
- 打錯房號進空房時提示「這可能是空房，確認房號?」— `js/room.js:75-80`（low）
- 單人本地暫存清單（localStorage）開房一鍵灌入 — enhancement（info，非缺陷）
- 挖掘卡 2048² 背景層行動端記憶體 — 觀察項，回報卡頓再議（low）

---

## 誤報 / 校正（對抗驗證成果）

| Finding | 原判 | 校正 | 理由 |
|---------|:----:|:----:|------|
| perf-ux P2 首屏 document.write render-blocking CSS | low | **refuted** | 已拍板取捨（唯一標準寫法保證 defer 順序）+ preconnect 已緩解，未提出當初評估外新代價 |
| a11y A1 挖掘卡鍵盤不可用 | high | **medium** | 事實成立，但視覺比對為核心的社群工具、僅影響鍵盤/AT 族群，high 誇大 |
| sec-backend B1 seed 正規化 | medium | **low** | 機制成立，但建房者對自己房間訪客、硬上限 64KB + 6h TTL |
| correctness A1 / resilience A1 樂觀假成功 | medium | **low**（維度內）| 有補償訊號（卡片 ✓ 不亮）、重連 init 會對帳、非資料損毀 → 合併後於 ux-flows 以 medium 呈現 |
| resilience A2 重複連線 | medium | **low** | 孤兒 socket + presence 灌 1，6h 自清 |
| ux-flows A2/A3 移除他人點 / 打錯房號進空房 | medium | **low** | 單點可再加/短命工具固有限制 |
| docs-tests B1 無 CI | medium | **low** | 免費小工具、測試現皆綠可手動跑 |
| perf-ux P1 縮圖大圖解碼 | medium | **low** | impact 自標「靜態推斷未實測」、~100MB 峰值為推測 |
| resilience A3 / ux-flows A6 / a11y A3 | — | **partial** | 觸發面/機制描述略誇大，主體成立 |

---

## Memory / 文件稽核

- **CLAUDE.md 衛生**：本 repo **無 CLAUDE.md**（教訓依 `external/CLAUDE.md` 慣例應寫進各 repo 的 CLAUDE.md）。本次踩到的非顯而易見坑（樂觀 toast + 靜默丟 op、seed 未正規化）建議收斂成一份精簡 `CLAUDE.md`「不要做的事」段 → **待 shawn 確認是否建立**。
- **memory**：對應目錄空，無去重/drift/升級候選。
- **文件 drift**：僅 README（項 #5，須修改）與 `build-data.py` docstring（建議）兩處；數字/URL 類 drift 乾淨。

---

## 既有設計亮點（誠實列）

**專案體質**
- **op-based 並發協定**：client 送操作、DO 單執行緒序列套用純函式 `applyOp` 再廣播——「並發加點不互蓋」有單元測試明證，是這支工具最漂亮的設計（勝過 mit-planner 整份覆蓋）。
- **前端零 HTML sink**：全程 `createElement`+`textContent`、無 inline handler、事件委派——XSS 面窄到 sec-frontend 給 9 分。
- **安全 header 完整**：CSP `default-src 'self'` + `frame-ancestors 'none'` + `base-uri`/`form-action` 齊、origin 白名單錨定 `^...$` fail-closed、三處 rate limit。
- **演算法有 golden 釘住** + 移植時對 reference 跑過 parity；`expiresAt` 每次 put 正確保留不誤續命。
- **檔案職責清楚**、全數 <360 行遠低於門檻，註解密度佳。

**使用者友善**
- 三步精靈有 breadcrumb + `aria-live` 播報 + 空狀態文案清楚教「跟遊戲謎題圖肉眼比對」。
- 加點/移除/複製/建立/建議順序幾乎都有繁中 toast，錯誤訊息說人話。
- 同等級地圖快速切換 tab、高亮「自己加的」點、整張小地圖+pin 縮圖——多人 UX 打磨用心。
- 色弱/低視力有座標文字作為謎題圖比對的替代；`@media 720px` 側欄堆疊、手機把全圖放上面。
