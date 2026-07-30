// tests/drift.test.mjs — node tests/drift.test.mjs（fail 即 exit 非 0）
// 零成本機械檢查，把健檢驗過的不變量固化（同一不變量下次免 LLM 重驗）：
//  1. 裁切卡尺寸 DIG_W/DIG_H(app.js) 與 --dig-w/--dig-h(styles.css) 必須同值（漂移→pin 偏離挖掘點）
//  2. maps.json 每筆 image 必為 https:// 且不含 url() 危險字元（前端以字串拼 backgroundImage=url("...")）
//  3. styles.css 定義的每個 .tre-* class 都要在 index.html/js 有引用（擋死 CSS 累積）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

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

// ── 3. 無死 .tre-* CSS（styles.css 定義的每個都要有人用）──
// token 邊界比對（非子字串）：class 名前後不得緊接 class 字元 [a-z0-9_-]，
// 否則父類 `tre-dig` 會被子類 `tre-dig__map` 的子字串「誤判為已使用」→ 真死父類漏抓。
const src = appJs + modalJs + rmapJs + rpanelJs + roomJs + html;
const defined = new Set([...css.matchAll(/\.(tre-[a-z0-9_-]+)/gi)].map((m) => m[1]));
const usedAsToken = (cls) => new RegExp('(?<![a-z0-9_-])' + cls + '(?![a-z0-9_-])').test(src);
const dead = [...defined].filter((cls) => !usedAsToken(cls));
assert.deepEqual(dead, [], `發現死 CSS class（styles.css 定義但無人以完整 token 引用）：${dead.join(', ')}`);

console.log('drift: all assertions passed');
