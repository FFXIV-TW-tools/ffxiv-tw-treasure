# CLAUDE.md — ffxiv-tw-treasure

FFXIV 繁中服（陸行鳥 DC）藏寶圖工具：選等級→選地圖→比對謎題圖找挖掘座標（單人純查詢）；多人＝房間共享路線（op-based DO，即時同步、自動排最省動線）。FFXIV-TW-tools 之一。

- **線上**：https://ffxiv-tw-treasure.pages.dev/（Cloudflare Pages · private repo `FFXIV-TW-tools/ffxiv-tw-treasure`）
- **協作後端**：`ffxiv-tw-treasure-room.ffxiv-tw-tools.workers.dev`（Worker + Durable Object + WebSocket）
- **本機預覽**：`py -m http.server 8799` → 127.0.0.1:8799（需 portal CDN：`svc start portal`，否則 codex 樣式/FFXIVToast 不載）

---

## 架構速覽

- `index.html` shell（portal CDN document.write 注入 header/tokens）+ `styles.css`（用 portal codex token/元件）
- `js/treasure-core.js` 純函式（UMD）：座標換算 `(coord-1)*SizeFactor/40.96` + 路線優化（map 分組 greedy 最近鄰 + optional 2-opt）
- `js/app.js` 三步狀態機 + 裁切卡/全圖渲染 + 房間 UI + 共享路線面板 + `confirmModal`
- `js/room.js` 多人房間 client（WebSocket、op-based、自動重連 backoff、6h 自動重連）— 基於 mit-planner `app-room.js` 改
- `worker/` 房間 API：**Durable Object**（`Room` class，op-based `applyOp` 純函式、SQLite storage、6h alarm 過期）— 獨立 wrangler，**Pages 不 build 它**
- `data/{grades,maps,treasures}.json`（`tools/build-data.py` 從 Teamcraft + 本地 item_dict 產）

---

## 鐵則（違反易壞）

- **協作後端用 Durable Object，不用 KV**：presence 靠 `getWebSockets().length`（0 storage 寫）；op-based＝client 送操作、DO 單執行緒序列套 `applyOp` 再廣播 → **並發加點不互蓋**（勿改回「整份覆蓋」，那正是 mit 早期並發掉點的坑）。
- **不要樂觀 toast 假成功**（2026-07-04 健檢）：斷線/重連視窗內 `room.js send()` 會靜默丟棄 op（`ws.readyState!==1`）。送任何 op（add/remove/done/order/clear）前**必先 `ensureConnected()`**（兩層 gate：`isInRoom()`→`isConnected()`），未連上給「連線中」提示、**不可**先跳「已加入」成功 toast → 否則使用者無感掉點，正面違反工具核心承諾「多人清單不掉點」。
- **破壞性操作對全隊權威清單生效、DO 無 undo**（2026-07-04 健檢）：清空 / 清除已完成 / 移除**隊友的**點，一律過 `confirmModal(...)` 二次確認 + 成功 toast。刪**自己的**點一鍵即可（不擋正當協作）。
- **確認框依 portal codex-modal，不用原生 `confirm()`**：用 `js/app.js` 的 `confirmModal()`（`.codex-modal-overlay/.codex-modal` + `.codex-btn--danger` + `FFXIVA11y.trapFocus`，回 Promise<boolean>）。設計系統要求 ESC + overlay 點擊關閉。
- **root `package.json` 不可設 `"type":"module"`**（2026-07-04 踩過）：`treasure-core.js` 是 UMD（`module.exports`），設了會把它當 ESM → `.mjs` 測試的 `import TC from` default-import 失效。root 保持 CJS；`.mjs` 測試本就 ESM 不受影響。`worker/` 自帶 `"type":"module"`（worker code 是 ESM）不衝突。
- **`DIG_W/DIG_H`(app.js) ↔ `--dig-w/--dig-h`(styles.css) 雙寫必須同值**：裁切卡偏移用 JS 常數、卡片視窗尺寸用 CSS，漂移 → pin 偏離挖掘點。`tests/drift.test.mjs` 機械守（改動後跑 `npm test`）。
- **`improve2Opt`（2-opt）是閉環假設**（尾端 `(k+1)%length` 幻邊）：本工具是**開放路徑**（`calcTotalDistance` 只累加 n-1 段）。目前 `use2Opt` 預設關、無產品呼叫者；啟用前先修尾端幻邊，且測試用**固定 golden `deepEqual`**釘行為，**勿用**「≤ 非2opt」單調斷言（開放路徑下會 flaky）。
- **繁中至上 / 繁中名走本地權威源**：物品名 = `item_lookup.name_sc → OpenCC s2twp`（`name_tc` 對藏寶圖是通用「地圖Gxx」錯名）；地名 = `place_names.json`（map-id keyed）。**禁自建對照表**。座標公式 = FFXIV 官方 datamining；路線演算法移植自 cycleapple/xiv-tc-treasure-finder（移植時對 reference 跑過 parity）。
- **前端零 HTML sink**：全程 `createElement`+`textContent`、事件委派、無 inline handler（CSP friendly）— 維持此姿態，勿引入 `innerHTML`。
- **檔案 ≤ 500 行（新檔）/ 遇授權牆不靜默跳過**：目前各檔遠低於門檻，維持職責清楚。

---

## 改 UI / CSS 前

先 Read `../ffxiv-tw-tools-portal/_DESIGN-SYSTEM.md`（codex 元件 / token / modal / `.codex-tablet` padding 鐵則）— 設計權威單一來源，不憑記憶寫。

## 驗證

```bash
npm test   # 串三套：core（座標/路線 golden）+ drift（DIG常數/maps image/死CSS）+ worker（op-based 並發不互蓋）
```

## commit / push

- 通則見 `../CLAUDE.md`「commit / push 通則」（push 走 cmd.exe）+ monorepo `.claude/rules/deploy-runbook.md`
- 本 repo 特例：獨立 `.git`；push `main` → Cloudflare Pages 自動 build 前端，**worker 動到才 `pnpm cf:deploy`**（`worker/` 目錄）

## 健檢

雙視角健檢報告 + 修復計畫在 `docs/health-reviews/`（`_INDEX.md` 索引）。最近一次：2026-07-04（體質 7.6 / 使用者 7.0）。
