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
/* ⚠️ 權威源是**兩份**台服解包，取聯集（2026-08-16 擴充）：
   · `tc_Item.csv`     — 原本唯一的那份，7.x 物品有一大批 Name 是空字串
   · `tclocal_Item.csv` — 台服 client 本地解包，較新（48228「偏光染劑」只有這份有）
   兩份都是 SE 台服 client 字串，沒有機器轉換摻入。只認前者的話，會把「台服真的有官方名」
   誤判成「只有機轉名」而整批擋掉——藏寶迷宮掉落有一半是這樣被擋的（實際踩過）。 */
const TC_CSVS = [join(DICT, 'datamining_tc', 'tc_Item.csv'),
                 join(DICT, 'datamining_tc', 'tclocal_Item.csv')];
const TC_CSV = TC_CSVS[0];

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const grades = JSON.parse(readFileSync(join(ROOT, 'data/grades.json'), 'utf8')).grades;
ok(Array.isArray(grades) && grades.length > 0, 'grades.json 應有內容');

// ── ① 未出貨的等級不得混進資料檔 ───────────────────────────────────────
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

// 兩份解包各自解析，值以「聯集」使用：一個 id 只要在任一份有非空名字，那就是台服官方名。
const dumps = [];
for (const path of TC_CSVS) {
  try {
    const csv = parseCsv(readFileSync(path, 'utf8'));
    let h = -1;
    for (let r = 0; r < 3; r++) if (csv[r] && (csv[r].includes('Name') || csv[r].includes('Singular'))) { h = r; break; }
    ok(h >= 0, `${path} 找不到欄名列（dump 格式變了？）`);
    let ni = csv[h].indexOf('Name'); if (ni < 0) ni = csv[h].indexOf('Singular');
    const start = h === 0 ? 1 : h + 2;
    const map = {};
    for (let i = start; i < csv.length; i++) { const c = csv[i]; if (c && c[0]) map[c[0]] = (c[ni] || '').trim(); }
    // 解析健全性：全查不到多半是解析壞了而不是資料沒有 —— 那正是上面警告的失效模式
    ok(Object.keys(map).length > 10000, `${path} 只解析出 ${Object.keys(map).length} 列，解析器可能壞了`);
    dumps.push(map);
  } catch (e) {
    assert.fail(`讀不到 ${path}（${e.message.slice(0, 200)}）——同上，不得當成通過`);
  }
}
// 等級名沿用第一份（那 13 筆兩份一致，由來見檔頭）
const rows = dumps[0];
// 任一份解包有這個名字就算數（回傳實際命中的字串，供錯誤訊息使用）
const officialNames = (id) => dumps.map((d) => d[String(id)]).filter((v) => v);

const bad = [];
for (const g of grades) {
  const authoritative = rows[String(g.itemId)];
  if (!authoritative) { bad.push(`${g.grade}(item ${g.itemId})：解包源查無此 id`); continue; }
  if (g.name !== authoritative) bad.push(`${g.grade}：站上「${g.name}」≠ 台服解包「${authoritative}」`);
}
assert.deepStrictEqual(bad, [], '⚠️ 站上顯示的名稱與台服解包不符：\n  ' + bad.join('\n  '));
n++;

/* ── ②b 掉落物名同樣逐筆核對 ────────────────────────────────────────────
   loot.json 的**清單**來自 Teamcraft（社群整理，刻意接受不完整），但**名字**必須跟等級名
   走同一條規矩：台服解包原文。這裡最容易破功的是產生器把 name_tc_source 過濾拿掉——
   那會讓国服機轉名（如 46171「永護塔路燈」）混進來，而畫面上讀起來完全正常。 */
{
  const loot = JSON.parse(readFileSync(join(ROOT, 'data/loot.json'), 'utf8')).loot || {};
  const shipped = new Set(grades.map((g) => String(g.itemId)));
  ok(Object.keys(loot).length > 0, 'loot.json 應有內容');
  ok(Object.keys(loot).every((k) => shipped.has(k)),
    'loot.json 不得含未出貨等級的 key（那等於把沒上站的圖的資料也發出去）');
  const lootBad = [];
  const checkItems = (label, items) => {
    for (const it of items) {
      const official = officialNames(it.id);
      if (!official.length) { lootBad.push(`${label} 的掉落 ${it.id}：兩份解包都查無官方名`); continue; }
      if (!official.includes(it.name)) lootBad.push(`${label}：站上「${it.name}」≠ 台服解包「${official.join('／')}」`);
    }
  };
  for (const [gid, items] of Object.entries(loot)) checkItems(gid, items);

  /* 藏寶迷宮（本地解包 DungeonChest*）同樣逐筆核對。這份是 2026-08-16 新增的主力資料
     （加加財富天坑 18 項 vs Teamcraft 的 2 項），品項比 loot 多得多，更需要機械守。 */
  const dungeons = JSON.parse(readFileSync(join(ROOT, 'data/loot.json'), 'utf8')).dungeons || {};
  ok(Object.keys(dungeons).length > 0, 'loot.json 應有 dungeons（藏寶迷宮掉落）');
  ok(Object.keys(dungeons).every((k) => shipped.has(k)), 'dungeons 不得含未出貨等級的 key');
  for (const [gid, list] of Object.entries(dungeons)) {
    for (const dg of list) {
      ok(typeof dg.hidden === 'number',
        `${gid} 的「${dg.name}」缺 hidden 欄 —— 台服未收錄的品項數必須帶到前端，`
        + '只是默默少列的話，清單看起來完整卻少了一半');
      checkItems(`${gid}/${dg.name}`, dg.items);
    }
  }
  assert.deepStrictEqual(lootBad, [], '⚠️ 掉落物名稱與台服解包不符：\n  ' + lootBad.join('\n  '));
  n++;
}

console.log(`✅ names-authority: ${n} 項通過（${grades.length} 個名稱逐筆對過台服解包）`);
