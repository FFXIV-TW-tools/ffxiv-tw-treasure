# Changelog

> 日期段落制（cycle 收官為段）；條目含人話「為什麼」，不從 git log 自動生成。
> 2026-07-11 起依 DEVLOOP 隨 cycle 更新；以前的段落為回填摘要（源自 git log 與健檢報告）。

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
