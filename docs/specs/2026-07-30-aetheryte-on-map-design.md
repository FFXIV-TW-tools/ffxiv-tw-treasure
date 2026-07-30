---
status: draft
type: feature
cycle: 2026-07-30-aetheryte-on-map
date: 2026-07-30
---

# 地圖上顯示傳送水晶（知道要傳哪裡）

> 來源：Owner 2026-07-30「你把傳送水晶一起顯示在地圖上 這樣可以知道要傳哪裡」。
> 走 spec 而非旁路的理由：動 **生成資料 schema**（`data/maps.json` 加欄位）＋新增外部資料源 — DEVLOOP「資料模型／對外契約即使單檔不可旁路」。

## 1. 問題

共享路線的區域大圖只畫挖掘點，玩家看得出「要去哪」，但看不出**從哪個水晶傳過去最近**。實務上跨區路線的移動成本大頭就是傳送選擇，現在得自己開遊戲地圖比對。

## 2. 資料源勘查（已實測）

| 候選 | 結論 |
|---|---|
| Teamcraft `aetherytes.json`（同 repo 同路徑，與現用 `treasures.json` 同源） | ✅ 採用。268 筆，含 `map` / `x` / `y` / `type` / `nameid` |
| 本地 `place_names.json` | ❌ map-id keyed 的**地區名**，不含水晶 |
| 本地 `datamining_tc/` 台服解包快取 | ❌ 只有 Action/Item/Status/ClassJob 等 sheet，**無 Aetheryte / PlaceName** |
| 本地 `game_ref.sqlite` | ❌ 表為 actions / statuses / macro_icons / craft_actions / meta |

**涵蓋率實測**：本工具用到的 **28 張圖全部有**水晶資料（type 0 共 65 個、type 1 共 16 個＝野外聚落水晶，兩者皆可傳送）。

## 3. 決策

1. **不以 `type` 過濾，該圖上的水晶全收**。原本打算只取 `type 0`，實測發現 map 213（龍堡內陸低地）只有 type 1 的兩顆——那正是泰勒斐爾／阿涅斯特里恩，遊戲裡傳得到；只濾 type 0 會讓該圖一顆不剩。城內 aethernet shard 只存在於城市地圖，而城市地圖不是藏寶圖區 → 天然不會混進來。
2. **不顯示水晶名稱**。名稱要 `nameid` → PlaceName 的台服正名，本地無權威源（見上表）；鐵則「禁自建對照表 / 禁自創譯名」→ 只畫圖示 + 位置。玩家在遊戲地圖上看得到名字，位置對得起來就夠。
3. **座標寫進 `data/maps.json` 各 map 的 `aetherytes: [{x, y}]`**（不另開檔）：前端已載 maps.json，多一個檔就多一次 fetch 與一次快取失效面；欄位是**新增**、向後相容。
4. **顯示層**：區域大圖與放大檢視都畫，樣式與挖掘點編號標記明顯區隔（水晶＝菱形、非編號），`aria-hidden`（非互動、不搶鍵盤焦點）。

## 4. 驗收條件

- `py -3.11 tools/build-data.py` 重建後 `maps.json` 28 張圖皆帶 `aetherytes`，總數 = 81，且 map 213 有 2 顆（回歸守門：type 過濾誤判的案例）。
- 區域大圖與放大檢視都看得到水晶標記，與挖掘點一眼可分。
- `npm test` 全綠且基線只升（新增 drift 斷言：每張圖都有 `aetherytes`、座標在合理範圍）。
- 端到端：本地 `wrangler dev`（B-004 修好後可用）開真房間加點，確認水晶隨大圖一起出現。

## 5. 不做

- 水晶名稱／傳送費用／最近水晶推薦（`route-stat` 那句「傳送點未計入（規劃中）」是另一條線，見 BACKLOG）。
