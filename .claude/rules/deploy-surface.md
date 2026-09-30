---
paths:
  - "deploy-prepare.sh"
  - "deploy-allow.txt"
  - "deploy-deny.txt"
---

# 部署面鐵則（動到 `deploy-*` 三件組時載入）

> 規則本體；事故實證與三條教訓的細節＝`docs/rules-rationale.md`「部署面鐵則」。非 Claude 的 agent 動這些檔前手動讀本檔。
> 本段為 12 個 external repo 的**共用權威版本**（2026-08-15 統一）。改本段請同步全部副本，不要只改一份。

- CF Pages 部署**不是「發佈 repo 根目錄」**：由 `deploy-prepare.sh` 依 `deploy-allow.txt` 產出 `_site/`。CF dashboard 必須設 Build command = `sh deploy-prepare.sh`、Build output directory = `_site`。
- **允許清單而非排除清單**：頂層出現任何未列入 `deploy-allow.txt`／`deploy-deny.txt` 的項目 → **build 直接失敗**。新增內部資產的預設值是「不發佈」，不靠任何人記得。
- **真正的部署邊界是第 2 段複製迴圈的 allow-list 比對**，改腳本時該比對不可動；分類閘另有兩條靜默放行（CF 容器 npm 產物固定 skip 清單、`git check-ignore`）——它只是「逼人歸類」的提醒層，skip 清單只放建置環境產物、不得用來繞分類。
- **腳本改動禁忌**：
  1. 只能用 POSIX 語法（CF 容器的 `sh` 是 dash，`read -r -d ''` 之類 bashism 會靜默失敗、輸出 0 檔而 build 仍「成功」⇒ **整站 404**）。
  2. 根層檔名不可無條件 `mkdir "$OUT/${f%/*}"`（會建出「叫 index.html 的目錄」⇒ `/` 404）。
  3. 不得移除出貨前驗收閘（輸出 <3 檔／缺 index.html／內部檔混入 → 非零 exit，CF 保留前一版）。
  4. **產物路徑不得假設獨佔**：S 型（固定 `_site/`）與 T 型（換名無鎖）皆 single-writer，禁並行跑 `deploy-prepare.sh`；C 型換名鎖不得回退。
     本 repo＝S 型。
- **部署後驗（務必帶 cache-bust）**：`curl -sL -o /dev/null -w '%{http_code} %{content_type} %{url_effective}\n' "https://<repo>.pages.dev/AGENTS.md?cb=$(date +%s)"` → 回 `text/html` 正常（檔案不存在、走 SPA fallback）；回 `text/markdown` = 紅燈。pages.dev 已 301 到正式網域，**一定要 `-L` 看最後一跳**（`-sI` 只拿到轉址頁的 `text/html`＝假綠燈）。**不帶 cache-bust 會得到假紅燈**（邊緣快取殘留，判別法見 rationale）。
