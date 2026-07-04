// worker/tests/worker.test.mjs — node tests/worker.test.mjs（fail 即 exit 非 0）
// 守 op-based 房間核心：applyOp / validatePoint / validateState / genCode / originAllowed。
// 重點：證明「並發加點不互蓋」— DO 單執行緒序列呼叫 applyOp，兩人各加一點都保留。
import assert from 'node:assert/strict';
import { applyOp, validatePoint, validateState, genCode, originAllowed, normalizePoint } from '../src/index.js';

const P = (o = {}) => ({ key: 'u1:1.0', owner: 'u1', ownerName: '貓', map: 4, x: 20, y: 20, item: 6688, ...o });

// genCode
assert.match(genCode(), /^[0-9A-Z]{6}$/, 'genCode 6 碼 base32');

// validatePoint
assert.ok(validatePoint(P()), '合法點');
assert.ok(!validatePoint(P({ x: 99 })), 'x 超範圍拒');
assert.ok(!validatePoint(P({ x: NaN })), 'x=NaN 拒（守 !isFinite guard）');
assert.ok(!validatePoint(P({ y: Infinity })), 'y=Infinity 拒（守 !isFinite guard）');
assert.ok(!validatePoint(P({ map: '4' })), 'map 非整數拒');
assert.ok(!validatePoint(P({ key: '' })), '空 key 拒');
assert.ok(!validatePoint(null), 'null 拒');

// ── applyOp add：並發加點不互蓋（核心證明）──
let pts = [];
pts = applyOp(pts, { t: 'add', p: P({ key: 'A:1', owner: 'A' }) });
assert.equal(pts.length, 1, 'add A → 1');
pts = applyOp(pts, { t: 'add', p: P({ key: 'B:1', owner: 'B' }) });   // 模擬 B「同時」加（DO 序列處理）
assert.deepEqual(pts.map((q) => q.key), ['A:1', 'B:1'], '兩人各加一點都保留（不互蓋）');
assert.equal(applyOp(pts, { t: 'add', p: P({ key: 'A:1', owner: 'A' }) }), null, '重複 key → no-op(null)');

// done
const d = applyOp(pts, { t: 'done', key: 'A:1', done: true });
assert.equal(d.find((q) => q.key === 'A:1').done, true, 'done 套用');
assert.equal(applyOp(pts, { t: 'done', key: 'X', done: true }), null, 'done 不存在 → null');

// remove
assert.deepEqual(applyOp(pts, { t: 'remove', key: 'A:1' }).map((q) => q.key), ['B:1'], 'remove A');
assert.equal(applyOp(pts, { t: 'remove', key: 'X' }), null, 'remove 不存在 → null');

// order（含漏列補後面）
assert.deepEqual(applyOp(pts, { t: 'order', keys: ['B:1', 'A:1'] }).map((q) => q.key), ['B:1', 'A:1'], 'order 重排');
assert.deepEqual(applyOp(pts, { t: 'order', keys: ['B:1'] }).map((q) => q.key), ['B:1', 'A:1'], 'order 漏列補後面（不丟）');

// clearDone / clear
assert.deepEqual(applyOp(d, { t: 'clearDone' }).map((q) => q.key), ['B:1'], 'clearDone 清掉 done');
assert.deepEqual(applyOp(pts, { t: 'clear' }), [], 'clear 清空');
assert.equal(applyOp([], { t: 'clear' }), null, 'clear 空 → null');

// MAX_POINTS（64）
const big = [];
for (let i = 0; i < 64; i++) big.push(P({ key: 'k' + i }));
assert.equal(applyOp(big, { t: 'add', p: P({ key: 'k64' }) }), null, '超過 MAX_POINTS → null');

// bad op
assert.equal(applyOp([], { t: 'nope' }), null, '未知 op → null');
assert.equal(applyOp([], null), null, 'null op → null');

// normalizePoint（add + seed 共用：只留白名單欄位 + clamp ownerName）
const np = normalizePoint({ key: 'k', owner: 'o', ownerName: 'x'.repeat(50), map: 4, x: 1, y: 2, item: 9, done: true, junk: 'evil', extra: 'x'.repeat(60000) });
assert.deepEqual(Object.keys(np).sort(), ['done', 'item', 'key', 'map', 'owner', 'ownerName', 'x', 'y'], 'normalizePoint 只留白名單欄位（丟棄 junk/extra）');
assert.equal(np.ownerName.length, 24, 'ownerName clamp 到 24');
assert.equal(np.done, false, 'normalizePoint done 一律 false');
assert.equal(np.junk, undefined, '未知欄位 junk 被丟棄');
// add 路徑實際套用 normalize（超長 ownerName + 垃圾欄位進不了 storage）
const added = applyOp([], { t: 'add', p: P({ key: 'z:1', ownerName: 'y'.repeat(40), junk: 1 }) });
assert.equal(added[0].ownerName.length, 24, 'add 後 ownerName ≤24');
assert.equal(added[0].junk, undefined, 'add 後無 junk 欄位');

// validateState（建房 seed）
assert.ok(validateState({ points: [] }), '空 state 合法');
assert.ok(validateState({ points: [P()] }), 'state 含合法點');
assert.ok(!validateState({ points: 'x' }), 'points 非陣列拒');
assert.ok(!validateState({ points: [P({ x: 99 })] }), 'state 含畸形點拒');

// originAllowed
const mk = (o) => ({ headers: { get: () => o } });
assert.ok(originAllowed(mk('https://ffxiv-tw-treasure.pages.dev')), '正式站 OK');
assert.ok(originAllowed(mk('https://abc123.ffxiv-tw-treasure.pages.dev')), 'CF preview 子網域 OK');
assert.ok(originAllowed(mk('http://localhost:8774')), 'localhost OK');
assert.ok(!originAllowed(mk('https://evil.pages.dev')), '他站 pages.dev 拒');
assert.ok(!originAllowed(mk('https://ffxiv-tw-treasure.pages.dev.evil.com')), '前綴偽裝拒');

console.log('worker(treasure-room): all assertions passed');
