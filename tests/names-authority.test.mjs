// tests/names-authority.test.mjs — node tests/names-authority.test.mjs（fail 即 exit 非 0）
//
// 守「**站上顯示的繁中名 ＝ 台服 client 解包原文，零機器轉換**」
// （Owner 2026-08-13 裁示：「一律使用解包名稱，不要使用機器翻譯；若是機器翻譯要特別註明」）。
//
// 【由來】`tools/build-data.py` 原本走 `s2twp(name_sc)`（**国服名經 OpenCC 簡→繁**），
//   理由寫的是「name_tc 對藏寶圖物品是通用『地圖Gxx』錯名」。逐筆對台服解包核對後那個前提是錯的：
//     · `item_lookup.name_tc` 與 `datamining_tc/tc_Item.csv` 逐字相同（43557 → 陳舊的地圖G17）
//     · 日服官方同樣是編號式（`ja_Item` → 古ぼけた地図G17）；**只有英文**用生物皮名
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
  ok(/SELECT name_tc(?:, name_tc_source)? FROM items/.test(code),
    'build-data.py 必須直接取 name_tc（台服解包原文）');
  ok(!/SELECT name_sc FROM items/.test(code),
    'build-data.py 不得取 name_sc（那是国服名）');

  /* ⚠️ **「name_tc 有值」不等於「台服有這個名字」** —— 2026-08-13 補課。
     當天稍早我把 G18 的排除理由判成「已失效，item_lookup 現在有繁中名了」，
     而那個名字（「陳舊的卡岡圖亞革地圖」）是国服「陈旧的卡冈图亚革地图」機轉來的：
     台服 `tc_Item.csv` 與 `tclocal_Item.csv` 的 46185 **都是空字串**。
     兩者在 `name_tc` 這一欄長得一模一樣，是同日新增的 `name_tc_source` 才分得出來。
     ⇒ 產生器必須用來源欄過濾，否則下一個人會再犯一次同樣的判斷。 */
  ok(/name_tc_source/.test(code),
    'build-data.py 必須讀 name_tc_source —— 只看 name_tc 有沒有值，會把機轉名當成官方名');
  ok(/==\s*'dump'/.test(code) || /=== *'dump'/.test(code),
    "必須只收 name_tc_source == 'dump'（opencc／tnze 一律當作沒有）");
  /* ⚠️ 斷言要對準**比較與離開**，不是常數名字。初版寫 `/SHIPPED_GRADE_FLOOR/`，
     突變測試當場證明它是空轉：把守衛改成 `if False:` 之後，錯誤訊息的 print 裡
     仍留著那個名字 ⇒ 正則照樣命中、測試照樣綠。 */
  ok(/if\s+len\(grades\)\s*<\s*SHIPPED_GRADE_FLOOR\s*:/.test(code),
    '必須有出貨等級數地板的實際比較 —— dump 壞掉時上面那圈會**靜默**掃掉整批等級，'
    + '輸出仍是合法 JSON、站台照常運作，只是少了幾個分頁');
  ok(/SHIPPED_GRADE_FLOOR\s*=\s*(\d+)/.test(code)
     && Number(RegExp.$1) >= grades.length,
    `地板（${(code.match(/SHIPPED_GRADE_FLOOR\s*=\s*(\d+)/) || [])[1]}）不得低於目前出貨數 `
    + `${grades.length} —— 地板低於現況等於沒有地板`);
  /* ⚠️ 同上，範圍要夾住**這個守衛的區塊**。初版寫 `code.slice(indexOf(常數))` 再找
     `sys.exit(1)`，突變證明它是空轉：把守衛裡的 exit 刪掉之後，後面 gaps 檢查那個 exit
     仍在切片內 ⇒ 照樣命中。 */
  // ⚠️ 不能用「下一個頂層敘述」切 —— 守衛在 `def main():` 裡面，直到檔尾都有縮排，
  //    切出來的區塊會一路含到後面 gaps 檢查的那個 exit（第二次突變才抓到）。
  //    正確做法是抓「縮排回到 <= if 本身」的第一行。
  const guardLines = (code.split(/if\s+len\(grades\)\s*<\s*SHIPPED_GRADE_FLOOR\s*:\n/)[1] || '')
    .split('\n');
  const body = [];
  for (const l of guardLines) {
    if (l.trim() && (l.length - l.trimStart().length) <= 4) break;
    body.push(l);
  }
  const block = body.join('\n');
  ok(/sys\.exit\(1\)/.test(block),
    '地板不達標必須在**該守衛區塊內**非零 exit（只印訊息＝CI 與人都會略過）');
}

// ── ①b 未出貨的等級不得混進資料檔 ───────────────────────────────────────
// G18 留在 GRADE_CATALOG 是為了「台服開放當天自動出貨」，但在那之前它一個字都不該出現。
{
  const ids = new Set(grades.map((g) => g.itemId));
  ok(!ids.has(46185),
    '⚠️ G18(46185) 台服 client 尚未收錄（解包為空字串）——出貨它等於把機轉名放上站，'
    + '玩家拿去遊戲內搜尋會找不到');
  ok(grades.every((g) => g.name && g.name.trim()),
    '出貨的等級不得有空名稱（fail-closed：沒有官方名就整筆不出）');
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
