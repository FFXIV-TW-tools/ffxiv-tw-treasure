// tests/drift.test.mjs — node tests/drift.test.mjs（fail 即 exit 非 0）
// 零成本機械檢查，把仍具跨檔／部署後果的不變量固化：
//  1. 裁切卡尺寸 DIG_W/DIG_H(app.js) 與 --dig-w/--dig-h(styles.css) 必須同值
//  2. maps.json 每筆 image 必為 https:// 且不含 url() 危險字元
//  3. maps／JS 圖片主機必須都在 _headers 的 CSP img-src 白名單
//  4. 傳送水晶資料形狀、座標值域與總量不塌
//  5. 每個頂層 tracked 項目都已列入 deploy-allow / deploy-deny
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// assert 呼叫點計數（供 AGENTS.md 的 TEST-BASELINE 標記機械比對）。刻意數「原始碼裡的呼叫點」
// 而非「執行次數」：後者會被資料驅動迴圈放大，地圖資料改版就讓基線變動＝假紅燈。
// 也刻意不印寫死的字面量——那等於讓 gate 比對兩個常數，正是這道閘要防的漂移。
const A = 'assert';
const asserts = (readFileSync(fileURLToPath(import.meta.url), 'utf8').match(new RegExp(A + '[.][a-zA-Z]+[(]', 'g')) || []).length;

const appJs = read('js/app.js');
const modalJs = read('js/app-modal.js');
const rmapJs = read('js/route-map.js');
const rpanelJs = read('js/route-panel.js');
const roomJs = read('js/room.js');
const css = read('styles.css');
const html = read('index.html');

// ── 1. DIG_W/DIG_H ↔ --dig-w/--dig-h 同步 ──
const digW = Number(/var\s+DIG_W\s*=\s*(\d+)/.exec(appJs)?.[1]);
const digH = Number(/DIG_H\s*=\s*(\d+)/.exec(appJs)?.[1]);
const cssW = Number(/--dig-w:\s*(\d+)px/.exec(css)?.[1]);
const cssH = Number(/--dig-h:\s*(\d+)px/.exec(css)?.[1]);
assert.ok(digW && cssW && digW === cssW, `DIG_W(${digW}) 必須 = --dig-w(${cssW})`);
assert.ok(digH && cssH && digH === cssH, `DIG_H(${digH}) 必須 = --dig-h(${cssH})`);

// ── 2. maps.json image 皆 https 且無 url() 破壞字元 ──
const maps = JSON.parse(read('data/maps.json')).maps;
for (const [mid, m] of Object.entries(maps)) {
  if (m.image == null) continue;              // 缺圖由 build-data 涵蓋率守門，非本檢查職責
  assert.ok(/^https:\/\//.test(m.image), `map ${mid} image 必為 https：${m.image}`);
  assert.ok(!/["'()\s]/.test(m.image), `map ${mid} image 不得含 url() 破壞字元：${m.image}`);
}

// ── 2a. 圖片主機必須在 _headers 的 CSP img-src 白名單內 ──
// 2026-07-30 實踩：上游把地圖網址換成 v2.xivapi.com，CSP 只放行 xivapi.com → 線上地圖全黑；
// 本機 http.server 不套 _headers 所以測不出來。此檢查把「資料裡的主機 ⊆ CSP 白名單」機械化。
const headers = read('_headers');
const imgSrc = /img-src ([^;]+);/.exec(headers)?.[1] || '';
const imgHosts = new Set(imgSrc.split(/\s+/).filter((t) => t.startsWith('https://')));
const usedHosts = new Set();
for (const m of Object.values(maps)) if (m.image) usedHosts.add(new URL(m.image).origin);
for (const js of [rmapJs, appJs, modalJs]) {
  for (const u of js.matchAll(/https:\/\/[\w.-]+\/[\w./-]*\.png/g)) usedHosts.add(new URL(u[0]).origin);
}
for (const h of usedHosts) assert.ok(imgHosts.has(h), `圖片主機 ${h} 不在 _headers img-src 白名單（線上會被 CSP 擋成空白/全黑）`);

// ── 2b. 傳送水晶（主水晶 type 0）座標健全性 ──
// 只收主水晶：以太之光（type 1）是區域出口／換圖點、不是傳送目的地（2026-07-30 Owner 判定）。
// 沒有主水晶的圖是真的沒有（如 map 213 龍堡內陸低地），故不斷言「每張圖都有」，只驗值域 + 總量不塌。
let aethTotal = 0;
for (const [mid, m] of Object.entries(maps)) {
  assert.ok(Array.isArray(m.aetherytes), `map ${mid} 缺 aetherytes 欄位`);
  for (const a of m.aetherytes) {
    assert.ok(a.x > 0 && a.x < 50 && a.y > 0 && a.y < 50, `map ${mid} 水晶座標超出合理範圍：${a.x},${a.y}`);
    assert.equal(a.t, undefined, `map ${mid} 不該再帶 type 欄位（資料端已濾成純主水晶）`);
  }
  aethTotal += m.aetherytes.length;
}
assert.ok(aethTotal >= 60, `主水晶總數異常偏低（${aethTotal}）— 資料源或過濾條件可能壞了`);


// ── 4. 部署分類閘：每個頂層 tracked 項目都必須已歸類 ──
// deploy-prepare.sh 的分類閘只在 CF build 期跑 → 新增頂層檔會 push 成功、但 build 失敗、
// 站台從此靜默停在舊版（fail-closed 保住不外洩，代價是沒人發現沒更新）。這裡把同一個
// 判斷提前到 commit 前：未分類就在本機紅，不必等 CF 的 build 失敗信。
const allow = new Set(read('deploy-allow.txt').split('\n').map((s) => s.trim()).filter(Boolean));
const deny = new Set(read('deploy-deny.txt').split('\n').map((s) => s.trim()).filter(Boolean));

// 腳本裡「固定略過」的兩組 case 樣式（$OUT/$ALLOW/$DENY 變數展開成實際值）——解析而非抄寫，
// 腳本改了這裡就跟著改，不會變成第二份會漂的清單。
const prep = read('deploy-prepare.sh');
const skip = new Set(
  [...prep.matchAll(/^\s*([^)\n]*\|[^)\n]*)\)\s*continue\s*;;/gm)]
    .flatMap((m) => m[1].split('|'))
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .map((s) => ({ $OUT: '_site', $ALLOW: 'deploy-allow.txt', $DENY: 'deploy-deny.txt' })[s] ?? s)
    .filter(Boolean),
);
assert.ok(skip.has('_site') && skip.has('node_modules'), 'deploy-prepare.sh 的固定略過清單解析失敗（case 樣式可能已改寫）');

const topLevel = new Set(
  execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    // git 對非 ASCII 檔名會加引號（core.quotepath），取頂層時先剝掉
    .map((f) => f.replace(/^"|"$/g, '').split('/')[0]),
);
const unclassified = [...topLevel].filter((e) => !allow.has(e) && !deny.has(e) && !skip.has(e));
assert.deepEqual(unclassified, [], `頂層項目未分類（CF build 會 fail-closed 擋下、站台停在舊版）：${unclassified.join(', ')} → 站台資產加進 deploy-allow.txt、內部資產加進 deploy-deny.txt`);

// allow 先於 deny 比對且無 else（deploy-prepare.sh:55-56）→ 同名時 deny 永遠碰不到。
// 現況無交集，這條是擋未來把內部資產誤寫進 allow 又以為 deny 擋得住。
const both = [...allow].filter((e) => deny.has(e));
assert.deepEqual(both, [], `同一項目同時列在 allow 與 deny（腳本 allow 先判 → deny 形同無效）：${both.join(', ')}`);
// 生成圖示以 portal 正典為權威；CI 只有本站 checkout 時明示 skip，漂移仍須紅燈。
const iconGen = join(ROOT, '..', 'ffxiv-tw-tools-portal', 'tools', 'gen-site-icons.mjs');
if (!existsSync(iconGen)) {
  console.log('skip icons drift：本機沒有 portal 共用產生器');
} else {
  const iconCheck = spawnSync(process.execPath, [iconGen, '--config', 'tools/icons.config.json', '--check'], { cwd: ROOT, encoding: 'utf8' });
  if (iconCheck.status === 2) console.log(`skip icons drift：${(iconCheck.stderr || '').trim()}`);
  else assert.equal(iconCheck.status, 0, `圖示產物與正典漂移：${iconCheck.stdout || ''}${iconCheck.stderr || ''}`);
}

console.log(`drift: ${asserts} assertions passed`);
