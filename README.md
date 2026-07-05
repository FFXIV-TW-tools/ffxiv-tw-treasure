# FFXIV 繁中服藏寶圖

選等級 → 選地圖 → 比對謎題圖找挖寶座標。繁中服（陸行鳥 DC）藏寶圖挖掘點查詢工具。

**Pages URL**：https://ffxiv-tw-treasure.pages.dev/ （部署後）

---

## 怎麼用

1. **選等級** — 選你手上藏寶圖的等級（依生物皮命名 + Gxx，如「陳舊的獰豹革地圖（G17）」），G6~G17 + 綠圖。
2. **選地圖** — 該等級可能出現的區域，每張顯示縮圖 + 挖掘點數。
3. **比對謎題圖** — 把遊戲內開圖的謎題圖跟卡片庫（Teamcraft 風格裁切圖）肉眼比對，一樣的就照座標去挖；點卡片或側欄全圖標記複製座標。

無圖像辨識、無需登入。**單人查詢**為純靜態前端（挖掘點資料打包在站內、零後端依賴）；**多人共享路線**（可選）走一支 Cloudflare Durable Object worker（WebSocket 即時同步、op-based、房間 6h 過期）。

---

## 資料來源

- **挖掘點座標**：[Teamcraft](https://ffxivteamcraft.com)（`treasures.json`）— 已註明來源。
- **物品名（繁中）**：繁中服 `item_dict`（`item_lookup.sqlite` `name_sc` → OpenCC `s2twp`，因 `name_tc` 對藏寶圖物品為通用「地圖Gxx」非正名）。
- **地名 / 地圖 SizeFactor / 貼圖**：`item_dict`（`place_names.json` map-id keyed + `lspl/maps.json`，本地 Teamcraft maps 鏡像）。地圖貼圖由 `xivapi.com` hotlink。
- **座標換算**：FFXIV 官方 datamining 公式 `(coord-1)*SizeFactor/40.96`。

## 資料重建

```bash
# 需 opencc（簡→繁）。本機預設 python 無 opencc，用 py -3.11：
py -3.11 tools/build-data.py
```
產出 `data/{grades,maps,treasures}.json`（已 commit；部署用）；`data/_teamcraft-treasures.json` 為抓取快取（gitignored）。
跨機 monorepo 根用 env `FFXIV_PROJECT_ROOT`（預設 `C:/FFXIVProject`）。

## 驗證

```bash
npm test   # 一次跑三支：core（座標/路線 golden）+ drift（常數/資料/死 CSS）+ worker（op-based 並發不互蓋）
# 或個別跑：
node tests/core.test.mjs      # 座標換算 + 路線優化 golden（演算法移植自 Teamcraft-derived reference，已對 parity）
node tests/drift.test.mjs     # DIG_W/DIG_H↔CSS 同步 + maps.json image 安全 + 無死 CSS
node worker/tests/worker.test.mjs   # 多人房間 applyOp / validate / originAllowed（含「並發加點不互蓋」證明）
```

## 結構

```
index.html              # 三步精靈 DOM（portal codex 設計系統，head 走 portal CDN）
styles.css              # 工具樣式（用 portal token / codex 元件）
js/treasure-core.js     # 座標換算 + 路線優化（純函式，window.TreasureCore）
js/app.js               # 三步狀態機 + 裁切卡渲染 + 複製座標 + 房間 UI
js/room.js              # 多人共享路線 client（WebSocket、op-based，window.TreasureRoom）
worker/                 # 多人房間後端：Cloudflare Durable Object（op-based、SQLite、6h alarm 過期）
data/{grades,maps,treasures}.json   # 生成資料（build-data.py 產）
tools/build-data.py     # 資料生成（Teamcraft + item_dict 繁中）
tests/core.test.mjs     # 演算法 golden test
tests/drift.test.mjs    # 常數/資料/死 CSS 機械檢查
worker/tests/worker.test.mjs   # 房間 op-based 並發正確性
```

## License / Disclaimer

非官方 FFXIV 玩家工具，與 SQUARE ENIX CO., LTD. 無關。FINAL FANTASY XIV © SQUARE ENIX。
遊戲內名詞 / 機制 / 數據版權屬 SQUARE ENIX；挖掘點資料來自 Teamcraft，僅供玩家社群參考。
