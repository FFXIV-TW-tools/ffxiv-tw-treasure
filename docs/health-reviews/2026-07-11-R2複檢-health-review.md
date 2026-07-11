# ffxiv-tw-treasure R2 複檢健檢報告（2026-07-11）

> R2 複檢（前輪 07-04 體質 7.6/使用者 7.0 全清）。方法：5 維 Workflow（10 agent＋對抗驗證）。14 findings → 13 confirmed / 1 partial / 0 refuted。**零 medium 以上**——全 low/info。

## 總評：專案體質 **8.4** / 10 · 使用者友善 **7.5** / 10 — 內外皆穩（前輪 7.6/7.0 → 雙升；體質 8.4 為 external 全體最高之一）

| 維度 | 分數 | 重點 |
|------|:---:|------|
| correctness-core（專案） | 9 | 「不掉點」並發承諾設計成立（DO input-gate＋order op 補後面）；唯 genCode 碰撞 ~1/10⁹（info 存證） |
| sec-resilience（專案） | 8 | 零 HTML sink 守住；單房 WS 連線無上限（low）；POST /room 未過 origin（low） |
| quality-tests（專案） | 8 | 54 assert 無空殼；drift 死 CSS 檢查子字串誤判（low）；seed 65 點無測 |
| docs-drift（專案） | 9 | 幾乎全對；README「（部署後）」殘留；「遠低於門檻」與 454/500 不符 |
| user-experience（使用者） | 7.5 | 加點 affordance 弱＋文案指向不存在的 ➕；三步切換不移焦；缺完成進度彙總 |

## 須修改
無（零 medium 真缺陷）。

## 建議
sec A1 單房 WS 連線軟上限（如 32）／A2 POST /room 補 originAllowed（對齊 WS 路徑）／quality A1 drift 死 CSS 改 token 邊界比對／A2 seed 65 點斷言一行／A3 room.js backoff/join 淨化抽純函式測（覆蓋缺口）／docs A1 刪「（部署後）」／A2 檔案大小自述據實化／U1 卡片 ➕/✓ affordance＋文案對齊／U2 showStep 移焦（tabindex=-1＋focus）／U3 連線事件進 announce()／U4 「已完成 X/Y」彙總／U5 route-panel 初始 hidden。
【BACKLOG 既有】B-001 route-list 就地 diff／B-002 裸色值／B-003 2048² 記憶體——不變。

## 誤報/校正
0 refuted、1 partial；「worker 已 deploy」前輪修正確認正確。

## 亮點
op-based DO 並發設計乾淨（input-gate 原子化＋order 補後面已測）；零 HTML sink 全站；confirmModal 覆蓋完整＋focus trap；docs 精度 9。
