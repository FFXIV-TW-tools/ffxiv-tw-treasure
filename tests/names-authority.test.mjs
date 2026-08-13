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
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(process.env.FFXIV_PROJECT_ROOT || 'C:/FFXIVProject', 'data', 'item_dict');
const SQLITE = join(DICT, 'item_lookup.sqlite');

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
ok(existsSync(SQLITE),
  `找不到權威源 ${SQLITE}——本檔刻意不 skip：拿不到答案時「跳過」在 CI 上與「通過」無法區分，`
  + '而這條守的正是「有沒有真的對過答案」。跨機請設 FFXIV_PROJECT_ROOT。');

const ids = grades.map((g) => g.itemId).filter(Boolean);
const sql = `SELECT id, name_tc FROM items WHERE id IN (${ids.join(',')});`;
let rows;
try {
  // 用 python 讀 sqlite：本 repo 無 node sqlite 相依，而產生器本來就是 python（不新增相依）
  const out = execFileSync('python', ['-c',
    'import sqlite3,sys,json;sys.stdout.reconfigure(encoding="utf-8");'
    + `c=sqlite3.connect(r"${SQLITE.replace(/\\/g, '/')}");`
    + `print(json.dumps(dict((str(i),t) for i,t in c.execute(${JSON.stringify(sql)}))))`,
  ], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  rows = JSON.parse(out);
} catch (e) {
  assert.fail(`讀不到 item_lookup.sqlite（${e.message.slice(0, 200)}）——同上，不得當成通過`);
}

const bad = [];
for (const g of grades) {
  const authoritative = rows[String(g.itemId)];
  if (!authoritative) { bad.push(`${g.grade}(item ${g.itemId})：解包源查無此 id`); continue; }
  if (g.name !== authoritative) bad.push(`${g.grade}：站上「${g.name}」≠ 解包「${authoritative}」`);
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
