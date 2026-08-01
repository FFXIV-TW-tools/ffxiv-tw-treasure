# ffxiv-tw-treasure R3 全維健檢報告（2026-08-01）

> 方法：7 維 Workflow fan-out（15 agent 成功 / 2 失敗）＋ finding 對抗驗證。46 findings → 35 confirmed / 5 partial / 0 refuted（**0 refuted＝主迴圈已加倍抽驗，見「誤報／校正」段**）。`user-experience` 維因 fan-out 模型週額度用盡失敗，**由主迴圈親自補審**（該維無獨立 verifier，已在下方標注）。
> 審查快照：`9b614b4`，working tree clean，`HEAD == origin/main`。

## 總評：專案體質 **7.7** / 10 · 使用者友善 **7.0** / 10 — 內外皆穩，但兩邊各有一批待清的中度項（涵蓋 7/7 維，其中 1 維為主迴圈自審）

較上輪 8.4／7.5 下降，**不可直接比較**：R2 複檢只跑 5 維且範圍不含部署面與資產實測，本輪多了 `build-release` 維（08-01 新管線首次受審）、correctness 深入 worker 路由層、UX 首次拿到首載資產的機械數據。分數下降來自**看見了以前沒看的地方**，不是程式碼變差——本輪 confirmed 的 4 個 medium 有 3 個在前兩輪的審查範圍之外。

雙視角定性：**內外皆穩**（兩者皆 ≥ 7），照計畫逐批清即可，無緊急項。

## 機械基線（全部實跑，agent 未重跑）

| 項目 | 結果 |
|------|------|
| `npm test` | 4 套全綠。**實測 assert 呼叫數 14／17／10／45 ＝ 86**，與 AGENTS 宣告完全一致（基線未漂） |
| `sh deploy-prepare.sh` | ✓ 16 檔／201 KB；輸出實查為純站台檔（`_headers`／`data/*.json`×3／`favicon`／`index.html`／`js/*.js`×7／`robots.txt`／`sitemap.xml`／`styles.css`），零內部檔 |
| `worker` `pnpm cf:deploy:dry` | 0 error，11.08 KiB，DO binding `Room` 正確 |
| 線上部署面探測 | cache-bust 後 `/AGENTS.md`、`/worker/src/index.js`、`/deploy-allow.txt` 全回 SPA fallback `text/html` ＝**現行部署乾淨**；無 cache-bust 時 `/AGENTS.md` 仍回 `text/markdown`（`CF-Cache-Status: HIT`、`Age≈8.6h`、舊部署 `s-maxage=604800`）＝邊緣快取殘留，非外洩 |
| 首載資產 | app.js 25 KB／styles 17.8 KB／treasures.json 34 KB／favicon 23 KB，合計 ~156 KB（不含 portal CDN），無巨型 base64／未壓縮圖 |
| **地圖底圖實測** | 單張 **618–760 KB** JPEG（v2.xivapi.com），且上游**不支援縮圖參數**（`?w=`／`?size=`／`?format=` 皆回同一份 618486 bytes）→ 見 U1 |
| CF Web Analytics | 線上首頁已含 `cloudflareinsights.com/beacon.min.js`（edge 注入）＝**已啟用**（推翻 memory 的「待開啟」記載） |
| 未跑 | `tools/build-data.py`（會改 working tree、資料源未變）；本地 UI smoke（portal CDN 服務未啟） |

## 維度評分

### 專案體質（7.7）

| 維度 | 分數 | 權重 | 重點 |
|------|:---:|:---:|------|
| 正確性 — 核心／資料／並發 | 7.5 | .29 | 座標公式、op-based 並發模型、資料生成鏈**逐項驗過皆正確**；扣分在路線品質天花板（跨區歐氏距離無物理意義）與 2 條樂觀回報路徑 |
| 安全 ＋ 韌性 | 7.0 | .38 | 前端零 HTML sink、op 驗證／正規化紮實、重連鏈路完整；扣分主因＝`POST /room/:code` 未授權整份覆蓋（**主迴圈線上實證**） |
| 品質 ＋ 測試防護網 | 8.0 | .19 | 檔案全數遠低於門檻、依賴注入姿態沒被繞過、drift 測試是真守門的；扣分＝基線無機械閘、DO 接線層無測試 |
| 文件 / CLAUDE.md drift ＋ 衛生 | 6.5 | .05 | 本輪最弱項：3 個 medium 集中在「照做會出錯」的祈使句與部署哨兵指令 |
| Memory 稽核 | 7.0 | .05 | treasure 教訓正確地落在 repo 文件而非 memory（做對了）；external 段有 3 處事實已過期未回寫 |
| 建置／發佈／部署面 | 8.0 | .10 | 允許清單真的 fail-closed（頂層 21 項 100% 覆蓋、零漏網）、symlink 逃逸已堵、每條失敗路徑都非零 exit；**未發現任何仍開放的外洩路徑** |

### 使用者友善（7.0）

| 維度 | 分數 | 權重 | 重點 |
|------|:---:|:---:|------|
| 使用者體驗（感知效能＋流程回饋＋a11y） | 7.0 | 1.0 | a11y 與回饋姿態是同級工具裡的好例子；扣分＝選等級一步最多拉 4 MB 原尺寸地圖當縮圖、單人模式沒有複製座標路徑 |

## 前輪追蹤（2026-07-11 R2）

R2 的「須修改」為空、11 條建議全批清，本輪逐項複核 fate：

- **已修且仍成立**：worker origin 閘（`POST /room` 已有 `originAllowed`）、單房連線上限（`MAX_CONN=32`＋`roomFull` 純函式測試）、卡片 ➕/✓ affordance（CSS `::after` 依 `.is-added` 切）、`showStep` 移焦（`focusStepHeading` + `tabindex=-1`）、連線事件進 `announce()`、「已完成 X/共 Y」進度、route-panel 初始 `hidden`、drift 死 CSS 改 token 邊界比對、room-pure 抽測（17 assert）。
- **未修延續**：B-001（route-list 整清單重建）、B-002（`styles.css:201`／`:102` 兩處裸色值，行號今日仍精準命中）、B-003（2048² 背景層記憶體）——皆為 Owner 判定「留觀察」，本輪不重報。
- **狀態行反向過期**：`_INDEX.md` 07-11 列仍寫「worker 待 deploy」，實測 `wrangler deployments list` 顯示 **2026-07-11T20:49:54Z 已部署**（早於該行寫下時間 12 小時）。這正是 memory `external.index-status-stale` 記載、且 07-11 那輪才修過一次的同型錯誤，**三週內復發**。

## 須修改項目（必做）

按風險排序。

1. **`POST /room/:code` 未授權即整份覆蓋房間權威清單**（medium）`[專案·sec-resilience＋correctness]`
   `worker/src/index.js:160-162` 對 `/room/:code` 不分 method 原封轉發到 DO，而 `Room.fetch:212-223` 對任何非 WS 的 POST 一律當 seed 處理。**主迴圈已對自建測試房線上實證**：無 `Origin` header、`Content-Type: text/plain`、空 body 的 `POST` 回 **200**，房內的點被清空（`{"points":[]}`），且此路徑**不廣播**→ 線上 client 停在舊清單直到下一個 op 才「全隊點突然消失」。同時重設 6h `alarm`＝可復活已過期房。門檻只有 6 碼房號（會出現在邀請連結／截圖／Discord）。這是唯一繞過 op-based 模型與 `confirmModal` 的路徑，正面對著「多人清單不掉點」的核心承諾。

2. **部署面鐵則的「部署後驗」指令今天照跑會得到假紅燈**（medium）`[專案·docs-drift]`
   `AGENTS.md:117` 寫 `curl -sI https://<repo>.pages.dev/AGENTS.md` → 回 `text/markdown` ＝紅燈。但機械基線證實：現行部署乾淨，回 `text/markdown` 純粹是舊部署的邊緣快取殘留（`CF-Cache-Status: HIT`、`Age≈8.6h`）。新鐵則段裡**唯一的驗收動作**照著跑必得假紅燈 → 要嘛引發不存在的事故調查，要嘛下次真外洩時被當雜訊忽略（哨兵最怕的失效模式）。

3. **AGENTS.md／CLAUDE.md 宣稱「本 repo 無 `docs/specs/`」，但 spec 自 07-30 已存在**（medium）`[專案·docs-drift]`
   `AGENTS.md:94`、`CLAUDE.md:7` 各寫「目前無 docs/specs」「兩目錄皆尚未建」，而 `docs/specs/2026-07-30-aetheryte-on-map-design.md` 已在、`CHANGELOG.md:33` 也已 link 它。同一份 AGENTS 的第 10 條又要求「依決策實作前必開該 cycle spec 全文」→ 讀者被前面那句說服而跳過查閱，而那份 spec 正裝著**翻轉過兩次**的「只收 type 0 主水晶」決策。

4. **README 結構區塊落後兩輪**（medium）`[專案·docs-drift]`
   缺 `js/app-modal.js`／`js/route-map.js`／`js/route-panel.js` 三支已上線模組（`index.html` 實載 7 支），也完全沒提 `deploy-prepare.sh` + `deploy-allow.txt`／`deploy-deny.txt` + `_headers` 這條 build pipeline。README 是給「不讀 AGENTS 的人」的唯一地圖，照它工作的人會把面板程式碼寫回 `app.js`（違反同 repo 的分層鐵則），也不知道新增站台資產必須登記允許清單。

5. **選等級一步最多下載 ~4 MB 原尺寸地圖，只為挑一張圖**（medium）`[使用者·perf-ux]`
   實測每張底圖 **618–760 KB**、上游無縮圖參數；點數最多的 G9–G12 各 6 張圖 → step 2 的縮圖牆一次拉 **~4 MB**，而使用者最終只會用其中一張（step 3 會重用同一份快取）。`loading="lazy"` 只擋得住視窗外的，桌機 6 張多半同時在視窗內。手機開圖對照是文件明列的使用情境。修法有兩條路（需 Owner 拍板，見計畫）。

6. **單人模式沒有複製座標的路徑，且點卡片會被捲走**（medium）`[使用者·ux-flows]`
   工具主打的單人流程是「查到座標即可」，但挖掘卡的唯一點擊行為是 `toggleMine`（加入共享路線）；不在房間時會跳 toast「先建立/加入房間」並 `scrollIntoView` 把畫面捲到頁首房間 bar——使用者正在比對的卡片被捲走。全站唯二的複製入口（`copyCoords`／`copyMacro`）都在共享路線面板內，**單人使用者拿不到 `/p 地名 ( 21.0 , 14.0 )` 這個已經寫好的格式**。卡片 `aria-label` 也寫死「加入共享路線」，對單人使用者是錯的敘述。

7. **測試基線 86 assert 沒有任何機械把關**（medium）`[專案·quality-tests]`
   全 repo 無 `TEST-BASELINE` 標記 → monorepo `tools/check-test-baseline.js` 對本 repo 整支跳過（實跑確認「檢查 0 項｜跳過 1 個 repo」）。13 個 external repo 中已有 7 個帶標記，本 repo 是漏網者。目前數字剛好正確（本輪實測 14/17/10/45＝86），但「只准升不准降」純靠人工紀律，何時失真無人會知道。

8. **08-01 部署輪的 repo-local Record 缺口 ＋ 邊緣快取殘留無追蹤點**（low，但屬鐵則義務）`[專案·docs-drift＋build-release]`
   五個 `fix(deploy)` commit（含自標 `!` 的 breaking）未動 `CHANGELOG.md`／`docs/BACKLOG.md`。**校正**：monorepo root `CHANGELOG.md` 已有完整的 `2026-08-01-deploy-surface` 段（含根因、允許清單 vs 排除清單的取捨、殘留自癒說明），所以「人話歷史完全不存在」不成立——真缺口是 repo-local 工件沒收官段，以及**邊緣快取殘留這個已知未收斂狀態沒有任何追蹤落點**。

9. **AGENTS.md 開發循環段仍是「內嵌 10 條摘要 ＋ 版本戳 v1.20」，而 DEVLOOP v1.21 已廢除這種寫法**（low）`[專案·docs-drift]`
   v1.21（2026-07-29）§4.4 改 pointer-only、per-repo 版本戳整族退役，理由正是「抄一份會過期的摘要＝製造第二真相源」。實跑 `node tools/check-devloop-artifacts.js --repo external/ffxiv-tw-treasure` 會出 **R18 警示**（不影響 exit）。修法：刪版本戳與內嵌摘要、保留 pointer ＋本 repo 專屬差異（VERIFY 命令、cycle id 格式、部署面鐵則），**不要整段刪**。順帶：R15 報 3 條 pointer 斷鏈，其中 `docs/runbooks/deploy-runbook.md`／`docs/LEDGER.md` 是 monorepo 路徑寫成本 repo 相對路徑、`data/{grades,maps,treasures}.json` 是大括號展開讓檢查器解不開——可一併改成明確寫法。
   > **這一項是機械閘抓到的，不是 fan-out 抓到的**：本輪 Phase 2 機械基線沒有先跑 `check-devloop-artifacts`，等到寫完報告要驗工件格式時才浮出來。下輪健檢的機械基線應把這支加進去（零 token、跨 repo 通用）。

## 建議修改項目（可選）

**協定／韌性**
- DO 對「可解釋的拒絕」回 `{t:'error', reason:...}`：`add` 撞 `MAX_POINTS=64`、op 超速、未知 `op.t` 目前都靜默丟棄，而前端已先跳成功 toast（`app.js:216`）。client 的 `opError` 分支已存在，接上成本近零。（low；觸發率低故非必做，但這是「樂觀 toast」鐵則在 server 側的同型漏口）
- 破壞性操作在 `confirmModal` resolve **之後**重驗一次 `ensureConnected()`（`route-panel.js:146/155`）——modal 開著時斷線會謊報「已清空 N 點」。（low）
- 已過期／已清空的房（`st == null`）在 WS 連線時應送 `{t:'expired'}` 而非當成新空房（`worker/src/index.js:199-208`）——目前使用者會看到「房間 XXXXXX · 1 人 · 空清單」＝主觀等同隊友的點被清光。（low）
- WS 升級被拒（`room_full`／`forbidden_origin`）改為「先 accept 再送原因後 close」（同現有 expired 路徑作法），否則 client 每 15 秒無限重連且只顯示「已斷線，重連中…」。（low）
- `applyOp` 的 `order` 補 no-op 收斂（唯一沒有「無變化→null」的 op）。（info）
- worker `normalizePoint` 的 `ownerName` 比照 `sanitizeDisplayName` 去控制字元再 clamp（一行；worker 是最後防線）。（info）

**路線品質**
- 每區起點改用該區主水晶座標（`maps[mid].aetherytes[0]`，資料已在手上、65 顆），`calcTotalDistance` 只累加同區段——跨區歐氏距離無物理意義，現在的「路程約縮短 X%」含無意義項。這同時把 UI 上「傳送點未計入（規劃中）」落地。（low，但這是「自動排最省動線」這個賣點的實際天花板）

**測試／DRY**
- 抽 `stepState(st, msg, now)` 純函式，讓 DO 的 read→apply→put 接線可測（現在改壞這 5 行測試仍全綠）。（low）
- `ownerName` 24 字上限三處硬編碼（`room-pure.js:30`／`worker:51`／`app.js:230`）進 drift 比對。（low）
- drift 的「圖片主機 ⊆ CSP img-src」掃描面擴到全部前端來源（現在只掃 3 支 js 且硬限 `.png`）。（low）
- `webSocketMessage` 的內聯 op 限流改呼叫既有 `rateLimited()` 助手並補窗口邊界測試。（low）
- 刪 `js/room.js:144-145` 的 `getPoints`／`getOnline`（Grep 全 repo 零呼叫端，非 static analyzer 誤報）。（low）

**部署**
- 把「頂層項目 ⊆ allow ∪ deny ∪ 固定略過清單」與「allow ∩ deny ＝ ∅」做成 drift 斷言，把「CF build 期才發現」提前到 commit 前。（low）
- `.gitignore` 加 `.deploy-filelist.tmp`（symlink 拒絕路徑會留下殘檔，下次本地 build 被自己的分類閘擋住）。（low）
- 刪掉 `.deploy-minify` 那 8 行（只掃輸出根層 `*.js`，而本 repo 所有 JS 都在 `js/` → 開了也是靜默 no-op），或改 `find` 並印出壓縮檔數。（low）
- AGENTS「開發注意」補一條部署順序：動 `applyOp` 協定時 **worker 先 deploy、前端後 push**（B-005 rename op 正是這類）。（low）

**文件**
- `AGENTS.md:33` 刪掉已完成的「下次實質接觸必須先拆：候選＝共享路線面板」（`route-panel.js` 已存在，同一行前半就寫了已拆）與無關的「遇授權牆不靜默跳過」；`AGENTS.md:48` 的「串三套」改「串四套」、`:51` 補 `sanitizeDisplayName`。（low）
- spec `2026-07-30-aetheryte-on-map-design.md`：勘查段（type 1「兩者皆可傳送」）與決策段（type 1 不是傳送目的地）互相打架，補一句交叉引用；front-matter 仍 `status: draft` 而 cycle 早已收官（`draft→approved` 僅 Owner）。（low）
- `_INDEX.md` 07-11 列狀態改為實況（worker 已於 2026-07-11T20:49Z 部署，前端已 push）。（low）

**UX（其餘）**
- portal CDN 未載入時 `toast()` 是靜默 no-op → 所有回饋（含「連線中，尚未同步」「複製失敗」）全部消失，而 `TreasureCore` 缺失有 `fatalErr`、`TreasureModal` 缺失會讓 confirm 回 false（安全降級），唯獨 toast 沒有 fallback。可考慮退回把訊息寫進已存在的 `#tre-status`（需改成可見）。（low）
- `app-modal.js` 的 `aria-labelledby` 用固定 id（`tre-confirm-title`／`tre-mapview-title`），兩個 modal 並存時會重複 id。（info，現況不會並存）

## 誤報 / 校正

0 refuted、5 partial——**refute 率 0 觸發加倍抽驗**，主迴圈親自複驗了下列項目，其中兩項推翻了 verifier 的結論：

| 項目 | verifier 判定 | 主迴圈複驗 | 仲裁 |
|------|--------------|-----------|------|
| `POST /room/:code` 覆蓋（correctness A1／sec A1 重複） | partial→medium／confirmed→medium | **對自建測試房線上實證**：無 Origin、空 body → HTTP 200 且點被清空 | 維持 medium，但可信度由「靜態閱讀」升為**實證**；兩維重複已合併 |
| 08-01 未 Record（docs A1 vs build D3） | docs 判 partial→low（理由：root CHANGELOG 有記）／build 判 confirmed→**medium**（沒查 root） | 讀 root `CHANGELOG.md`：`## 2026-08-01 — 部署面改 fail-closed…（cycle 2026-08-01-deploy-surface）` 段完整存在，含根因與快取殘留說明 | **採 low**，build-release 的 medium 是漏查 root 造成的高估 |
| 測試基線 86 是否已漂 | Q1 只證「無機械閘」 | 實數 14/17/10/45 = 86 | 宣告值**目前準確**，缺口純屬「沒有紅燈」而非「已經失真」 |
| 08-01 部署面是否仍有外洩 | build-release 稱「未發現仍開放的外洩路徑」 | 實查 `_site` 16 檔全為站台資產 ＋ 線上 cache-bust 探測三條路徑皆 SPA fallback | 確認 |
| Analytics 是否待開啟（memory A1） | confirmed→low | 線上首頁實含 beacon | 確認（memory 記載已過期） |

反例抽查（verifier 只驗「找到的」，不驗「漏掉的」）：對兩個高分維（quality-tests 8、build-release 8）做了 recall 反查——`robots.txt`／`sitemap.xml` 無內部路徑外洩、`_site` 產物逐檔比對、assert 實數比對、上游圖片 CDN 縮圖參數探測（這一項反而**找出本輪最大的 UX finding U1**，屬 fan-out 漏抓）。

**誠實聲明**：`user-experience` 維由主迴圈親自審查（fan-out 因模型週額度用盡失敗），**該維的 findings 沒有經過獨立 verifier 對抗查證**，職責分離在這一維是斷的。其 4 個 finding 中，U1 有硬數據（實測 content-length ×4 張圖、縮圖參數探測）、U2 有程式碼路徑證據，U3／U4 為靜態推斷。

## Memory / 文件稽核（刪／升級一律待 Owner 確認）

memory 目錄＝`~/.claude/projects/C--FFXIVProject/memory/`（本 repo 專屬 slug 目錄為空，de-facto 在父層）。**做對的地方**：treasure 的教訓全部落在 repo `AGENTS.md`／`CHANGELOG.md`／`docs/health-reviews/` 而非 memory，符合 `external/CLAUDE.md`「不另寫 per-cwd memory」；08-01 部署事故也只寫進 AGENTS 鐵則，沒有在 memory 重複一份。

**候選（待確認）**：
- `external.audit-followups.md`：item 1（Analytics 待開）與 item 2（island modal 遷移暫緩）**皆已完成**（線上 beacon 實測；island `index.html` 已是 `codex-modal`×3）→ 建議刪這兩項；僅剩的 item 3（island 寵物名人工校核，`js/app.js:1197` 註解仍在＝確實未完成）升級成 island repo 的 BACKLOG 條目後整檔刪除，並移除 `MEMORY.md:33`。
- `external.sightseeing-tool.md:10`「未部署（4 commit 未 push）」**已過期**：站台 200、`HEAD == origin/main`、portal `tools.json` 已收錄 → 刪該句，保留資料源知識段。
- `external.data-cache-must-revalidate.md:27` 指向的 `_NEW-TOOL.md` 模板**實際不含 `/data/*` 段**（`portal/templates/_headers` 只有 `/*.js`／`/*.css`／`/`／`/index.html`）→ 規則該落到模板（升級），memory 只留「推完要 curl 線上驗」的行為教訓。生態現況仍 100% 合規（唯一正 max-age 是 mit-planner `/data/icons/*`＝明列例外）。
- `MEMORY.md:33/34` 索引行內嵌易變數字與狀態（「9/11 已開」「11 站」，實際 13 工具）→ 索引只寫不隨時間變的結論。
- wikilink 三種寫法並存（`[[external-audit-followups]]` 連字號／`[[external.mit-planner]]` 點號／`[[gh-org-cloudflare]]` 無前綴）→ 統一成檔名點號式。

## 既有設計亮點

**專案體質**
- **op-based DO 並發模型是乾淨的**：`applyOp` 是純函式、DO 單執行緒序列套用，「並發加點不互蓋」有測試直接證明；`order` 對未列到的 key 補後面（不丟）這種細節也釘住了。
- **允許清單 fail-closed 部署管線做到位**：頂層 21 項 100% 被 allow/deny 覆蓋、只複製 tracked 檔（保證「本機驗的＝線上發的」）、symlink 逃逸拒絕、git 不可用時寧可中止也不退回語意更寬的 `cp -r`、出貨驗收是副檔名**白名單**。三道防線都用結構而非紀律。
- **零 HTML sink 全站維持住**：7 支 js 逐一確認 `createElement`+`textContent`，隊友可控的 `ownerName` 也走 `textContent`。
- **drift 測試是真守門的**：DIG 常數↔CSS、圖片主機 ⊆ CSP img-src（07-30 事故的直接產物）、死 CSS 用 token 邊界比對而非子字串——每一條拿掉都會真的紅。
- **教訓固化姿態**：踩過的坑（workerd 不收裸值導出、dash 不是 bash、根層檔名 `mkdir` 陷阱）全部寫成程式碼旁的具體註解，不是抽象規則。

**使用者友善**
- a11y 做得比同級小工具紮實：`aria-live` 狀態播報、挖掘卡是 `<button>` 帶 `aria-pressed`、步驟 `aria-current`、modal 有 focus trap＋ESC＋overlay 關閉、≤720px 觸控目標放大到 40px。
- 破壞性操作的分流有想過：刪自己的點一鍵、刪隊友的點要確認——既防誤刪又不擋正當協作。
- 房間 bar 重繪時保住正在輸入的名稱與游標位置；只有加點當事人觸發重排（避免 N 人各送一份 `setOrder`）——這兩個都是想過真實多人情境才會做的細節。
