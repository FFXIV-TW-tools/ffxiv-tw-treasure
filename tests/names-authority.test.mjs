// tests/names-authority.test.mjs — node tests/names-authority.test.mjs（fail 即 exit 非 0）
//
// 守「**站上顯示的繁中名 ＝ 台服 client 解包原文，零機器轉換**」
// （Owner 2026-08-13 裁示：「一律使用解包名稱，不要使用機器翻譯；若是機器翻譯要特別註明」）。
//
// 【由來】`tools/build-data.py` 原本走 `s2twp(name_sc)`（**国服名經 OpenCC 簡→繁**），
//   理由寫的是「name_tc 對藏寶圖物品是通用『地圖Gxx』錯名」。逐筆對台服解包核對後那個前提是錯的：
//     · `item_lookup.name_tc` 與 `datamining_tc/tc_Item.csv` 逐字相同（43557 → 陳舊的地圖G17）
//     · 日服官方同樣是編號式（`ja_Item` → 古ぼけた地図G17）；**只有英文**用生物皮名
//     · 台服命名並不統一：G18 的官方名就是「陳舊的卡岡圖亞革地圖」＝有正式皮名
//   ⇒「地圖Gxx」不是佔位符，是台服客戶端真正的名字。站上原本顯示的皮名**在台服 client 裡不存在**
//     ⇒ 玩家拿它回遊戲內搜尋會找不到，而畫面上完全看不出有問題（名字讀起來非常合理）。
//
// 【為什麼要機械守】這是典型的零回饋訊號缺陷：名字看起來對、測試全綠、build 全綠，
//   只有把「站上的字」與「解包的字」擺在一起比才看得到。而且它已經在線上活了將近兩個月。
//
// ⚠️ 本檔需要 monorepo 的 `data/item_dict`（跨機以 env `FFXIV_PROJECT_ROOT` 覆寫）。
//   **拿不到權威源時一律失敗，不 skip**——skip 在 CI 上與 pass 長得一模一樣，
//   而這條守的正是「有沒有真的對過答案」。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(process.env.FFXIV_PROJECT_ROOT || 'C:/FFXIVProject', 'data', 'item_dict');
/* ⚠️ 權威源刻意是**原始解包 CSV**，不是 `item_lookup.sqlite` 的 `name_tc` 欄。
   2026-08-13 查證：`XIVDiscordBot/scripts/enrich_item_dict.py` 的 `_resolve_name_tc()` 優先序是
   「官方 TC → TNZE → **OpenCC 簡→繁 fallback**」，而 sqlite **沒有記錄每一筆走了哪條**
   （`_name_source()` 算得出 dt/tnze/opencc，卻沒存進任何欄位）。
   ⇒ `name_tc` 是「官方名與機轉名的混合物，且從消費端分不出來」。拿它當權威源，
   等於讓本哨兵繼承同一個歧義——它要守的正是「顯示名不是機器轉換」。
   直接讀 `tc_Item.csv` 就沒有這個問題：那是台服 client 解包，沒有 fallback 摻進來。 */
const TC_CSV = join(DICT, 'datamining_tc', 'tc_Item.csv');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const grades = JSON.parse(readFileSync(join(ROOT, 'data/grades.json'), 'utf8')).grades;
ok(Array.isArray(grades) && grades.length > 0, 'grades.json 應有內容');

// ── ① 產生器不得再有任何機器轉換 ────────────────────────────────────────
{
  const py = readFileSync(join(ROOT, 'tools/build-data.py'), 'utf8');
  const code = py.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');   // 註解裡會提到歷史，只看程式碼
  ok(!/opencc|OpenCC|_S2T|s2twp/.test(code),
    '⚠️ build-data.py 的**程式碼**不得出現 opencc／s2twp —— 那是国服名經機器轉換，'
    + '不是台服官方名（Owner 2026-08-13：一律使用解包名稱）');
  ok(/SELECT name_tc FROM items/.test(code),
    'build-data.py 必須直接取 name_tc（台服解包原文）');
  ok(!/SELECT name_sc FROM items/.test(code),
    'build-data.py 不得取 name_sc（那是国服名）');
}

// ── ② 逐筆核對：站上的每一個名字都必須等於解包原文 ──────────────────────
ok(existsSync(TC_CSV),
  `找不到權威源 ${TC_CSV}——本檔刻意不 skip：拿不到答案時「跳過」在 CI 上與「通過」無法區分，`
  + '而這條守的正是「有沒有真的對過答案」。跨機請設 FFXIV_PROJECT_ROOT。');

/* 逐字元 CSV 解析。⚠️ **不要用 `split('\n')`**：`Description` 欄位內含換行，引號內的換行
   不是換行 ⇒ 整份資料錯位，症狀是「id 明明在檔裡卻查不到」（2026-08-13 實際踩到，
   而且那個假結論差點被寫成「這些地圖名無法多語化」）。同理不要寫死表頭列號：
   `tc_*` 是三列前導（key／欄名／offset），`en_*`／`ja_*` 只有一列。 */
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

let rows;
try {
  const csv = parseCsv(readFileSync(TC_CSV, 'utf8'));
  let h = -1;
  for (let r = 0; r < 3; r++) if (csv[r] && (csv[r].includes('Name') || csv[r].includes('Singular'))) { h = r; break; }
  ok(h >= 0, 'tc_Item.csv 找不到欄名列（dump 格式變了？）');
  let ni = csv[h].indexOf('Name'); if (ni < 0) ni = csv[h].indexOf('Singular');
  const start = h === 0 ? 1 : h + 2;
  rows = {};
  for (let i = start; i < csv.length; i++) { const c = csv[i]; if (c && c[0]) rows[c[0]] = (c[ni] || '').trim(); }
  // 解析健全性：13 筆全查不到多半是解析壞了而不是資料沒有 —— 那正是上面警告的失效模式
  ok(Object.keys(rows).length > 10000, `tc_Item.csv 只解析出 ${Object.keys(rows).length} 列，解析器可能壞了`);
} catch (e) {
  assert.fail(`讀不到 ${TC_CSV}（${e.message.slice(0, 200)}）——同上，不得當成通過`);
}

const bad = [];
for (const g of grades) {
  const authoritative = rows[String(g.itemId)];
  if (!authoritative) { bad.push(`${g.grade}(item ${g.itemId})：解包源查無此 id`); continue; }
  if (g.name !== authoritative) bad.push(`${g.grade}：站上「${g.name}」≠ 台服解包「${authoritative}」`);
}
assert.deepStrictEqual(bad, [], '⚠️ 站上顯示的名稱與台服解包不符：\n  ' + bad.join('\n  '));
n++;

// ── ③ `_meta.source` 必須誠實 ──────────────────────────────────────────
// 產生器換了來源卻沒改 _meta 的話，下一個人會照著錯的說明去追來源。
{
  const meta = JSON.parse(readFileSync(join(ROOT, 'data/grades.json'), 'utf8'))._meta || {};
  ok(/name_tc/.test(meta.source || ''), '_meta.source 必須寫明物品名取自 name_tc');
  ok(!/s2twp|name_sc/.test(meta.source || ''), '_meta.source 不得再宣稱走 s2twp／name_sc');
}

// ── ④ UI 不得把等級串成重複字樣 ─────────────────────────────────────────
// 正名後 12/13 的官方名已含等級（「陳舊的地圖G17」），再串一次會變「陳舊的地圖G17（G17）」。
{
  const app = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
  ok(/function gradeLabel\(/.test(app), 'app.js 應有 gradeLabel() 集中處理「名稱是否已含等級」');
  ok(!/g\.name \+ '（' \+ g\.grade/.test(app),
    '⚠️ 不得直接串 name＋grade——正名後會產生「陳舊的地圖G17（G17）」');
  ok(!/'已選 ' \+ g\.name \+ ' ' \+ g\.grade/.test(app),
    '⚠️ 螢幕閱讀器播報同樣不得重複等級');
}

console.log(`✅ names-authority: ${n} 項通過（${grades.length} 個名稱逐筆對過台服解包）`);
