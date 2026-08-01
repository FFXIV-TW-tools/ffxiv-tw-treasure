#!/bin/sh
# CF Pages build step — 只把站台檔複製到 _site/，內部檔一概不部署。
#
# 背景：CF Pages 的 Git 整合在沒有 build 步驟時，預設把 repo 根整棵目錄當靜態資產上傳
# → AGENTS.md / CLAUDE.md / docs/ / tools/ / tests/ / worker 後端源碼全部變成該網域下
# 可直接 GET 的公開檔（2026-08-01 實測 12/13 站皆 200）。private repo 只保護「誰能 clone」，
# 不保護「已部署的檔案誰能下載」；.gitignore（檔是 tracked）／_headers（只加標頭）／
# robots.txt（只擋收錄不擋直取）三者都擋不到，唯一解是不要上傳它們。
#
# dashboard 設定（Pages 專案 → Settings → Build）：
#   Build command          : sh deploy-prepare.sh
#   Build output directory : _site
set -eu
OUT=_site
rm -rf "$OUT"; mkdir -p "$OUT"

# 白名單思維：內部目錄整個排除，且只有站台會用到的副檔名才上線。
# 新增站台資產類型時才動這份清單（日後新增內部檔不會因忘記排除而外洩）。
git ls-files -z | while IFS= read -r -d '' f; do
  case "$f" in
    # 內部目錄：文件／建置工具／測試／CI／Worker 後端源碼（Worker 由 wrangler 另外部署，不該進靜態站）
    docs/*|tools/*|scripts/*|tests/*|test/*|.github/*|.claude/*|wasm/src/*|worker/*) continue ;;
    # 內部檔案類型
    *.md|*.py|*.ps1|*.sh|*.rs|*.ts|*.toml|*.lock|*.yml|*.yaml|*.ini|*.example) continue ;;
    package.json|package-lock.json|pnpm-lock.yaml|tsconfig*.json|.gitignore|.gitattributes|.rgignore|.env*) continue ;;
    */package.json|*/package-lock.json|*/.gitignore) continue ;;
  esac
  mkdir -p "$OUT/$(dirname "$f")"
  cp "$f" "$OUT/$f"
done

# 授權義務：若 repo 隨站部署授權全文（頁尾直連），補回
for L in LICENSE-APACHE-2.0.txt LICENSE-MIT.txt; do
  if [ -f "$L" ] && [ ! -f "$OUT/$L" ]; then cp "$L" "$OUT/"; fi
done

# 驗收閘：內部檔混入即中止 build（不等上線才發現）
LEAK=$(find "$OUT" -type f \( -name '*.md' -o -name '*.py' -o -name '*.ps1' -o -name '*.rs' -o -name '*.ts' -o -name '*.toml' -o -name '*.lock' -o -name '*.ini' -o -name 'package*.json' -o -name '.env*' \) 2>/dev/null | head -20)
if [ -n "$LEAK" ]; then echo "✗ 內部檔混入部署輸出，中止：" >&2; echo "$LEAK" >&2; exit 1; fi
echo "✓ 部署輸出就緒：$(find "$OUT" -type f | wc -l) 個檔案"
