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

// ── 3. 無死 .tre-* CSS（styles.css 定義的每個都要有人用）──
const src = appJs + roomJs + html;
const defined = new Set([...css.matchAll(/\.(tre-[a-z0-9_-]+)/gi)].map((m) => m[1]));
const dead = [...defined].filter((cls) => !src.includes(cls));
assert.deepEqual(dead, [], `發現死 CSS class（styles.css 定義但無人引用）：${dead.join(', ')}`);

console.log('drift: all assertions passed');
