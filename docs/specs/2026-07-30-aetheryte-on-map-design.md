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
| **本地 `data/item_dict/lspl/aetherytes.json`** | ✅ 採用（**修正**：初版誤接 Teamcraft 網路檔，實測兩者 268 筆內容完全相同，且 `build-data.py` 早就在讀同目錄的 `lspl/maps.json`、marketboard `build_gathering_nodes.py` 也用這份 → 依 DRY 用本地，不多接外部源）|
| Teamcraft `aetherytes.json`（網路） | ❌ 與本地同內容，多一個網路依賴 |
| 本地 `place_names.json` | ❌ map-id keyed 的**地區名**，不含水晶 |
| 本地 `datamining_tc/` 台服解包快取 | ❌ 只有 Action/Item/Status/ClassJob 等 sheet，**無 Aetheryte / PlaceName** |
| 本地 `game_ref.sqlite` | ❌ 表為 actions / statuses / macro_icons / craft_actions / meta |

**涵蓋率實測**：本工具用到的 **28 張圖全部有**水晶資料（type 0 共 65 個、type 1 共 16 個＝野外聚落水晶，兩者皆可傳送）。
> ⚠️ 上句「兩者皆可傳送」是**勘查當下的初步判讀，非最終決策**——§3.1 已由 Owner 判定 type 1 是以太之光（區域出口／換圖點）、**不採用**。只讀勘查段會得到相反結論（2026-08-01 R3 健檢指出此矛盾）。

## 3. 決策

1. **只收 `type === 0` 主水晶**（可直接傳送的目的地）。此決策翻轉兩次，留痕：初版只取 type 0 → 因 map 213（龍堡內陸低地）會一顆不剩而改成全收 → **Owner 2026-07-30 判定改回只收 type 0**：type 1 是以太之光（`aethernetCoords` 0,0），實際是區域出口／換圖點，不是傳送目的地，標上去只是雜訊。沒有主水晶的圖就是真的沒有（map 213 即為此），留空、不拿以太之光充數。
2. **不顯示水晶名稱**。名稱要 `nameid` → PlaceName 的台服正名，本地無權威源（見上表）；鐵則「禁自建對照表 / 禁自創譯名」→ 只畫圖示 + 位置。玩家在遊戲地圖上看得到名字，位置對得起來就夠。
3. **座標寫進 `data/maps.json` 各 map 的 `aetherytes: [{x, y}]`**（不另開檔）：前端已載 maps.json，多一個檔就多一次 fetch 與一次快取失效面；欄位是**新增**、向後相容。
4. **圖示沿用既有實作，不自創**：主水晶 `060453`（22px，xivapi），與 `ffxiv-tw-marketboard/modules/map_view.js` 同一組——初版自創「金色菱形」被 Owner 指出（DRY 鐵則：改動前先找既有模組，我漏查）。該檔並已記教訓「不用 emoji：顏色/大小/字重隨系統字型，在米色地圖上幾乎看不到」。區域大圖與放大檢視共用同一個產生器 `TreasureRouteMap.aethIcon`。

## 4. 驗收條件

- `py -3.11 tools/build-data.py` 重建後 `maps.json` 28 張圖皆帶 `aetherytes` 欄位，主水晶總數 = 65；map 213（龍堡內陸低地）為空＝該圖真的沒有主水晶。
- 區域大圖與放大檢視都看得到水晶標記，與挖掘點一眼可分。
- `npm test` 全綠且基線只升（新增 drift 斷言：座標值域、不得殘留 `t` 欄位、總量不塌（≥60））。
- 端到端：本地 `wrangler dev`（B-004 修好後可用）開真房間加點，確認水晶隨大圖一起出現。

## 5. 不做

- 水晶名稱／傳送費用／最近水晶推薦（`route-stat` 那句「傳送點未計入（規劃中）」是另一條線，見 BACKLOG）。
