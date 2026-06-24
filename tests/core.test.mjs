// tests/core.test.mjs — node tests/core.test.mjs（fail 即 exit 非 0）
// 釘 treasure-core.js 座標換算 + 路線優化的 golden 行為。
// 演算法移植自 cycleapple/xiv-tc-treasure-finder；移植當下另跑過 reference parity check（見 commit 說明）。
import assert from 'node:assert/strict';
import TC from '../js/treasure-core.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≈ ${b}`);

// ── 座標 → 百分比（官方公式 (coord-1)*SF/40.96，clamp 0-100）──
let p = TC.coordsToPercent({ x: 1, y: 1 }, 100);
near(p.x, 0, '(1,1)→0%'); near(p.y, 0, '(1,1)→0%');
p = TC.coordsToPercent({ x: 21, y: 21 }, 100);
near(p.x, 48.828125, '(21,21) sf100');
p = TC.coordsToPercent({ x: 21, y: 21 }, 95);
near(p.x, 46.38671875, '(21,21) sf95（蒼天區）');
p = TC.coordsToPercent({ x: 42, y: 42 }, 100);
near(p.x, 100, '(42,42) clamp 100');   // 41*100/40.96=100.097→clamp

// ── 裁切卡偏移（扁平 DOM，中心=邊/2，pixel=(coord-1)*SF/2）──
let o = TC.calcCardOffset({ x: 1, y: 1 }, 100, 218, 189);
near(o.x, 109, 'card offset x@(1,1)=W/2'); near(o.y, 94.5, 'card offset y@(1,1)=H/2');
o = TC.calcCardOffset({ x: 21, y: 21 }, 100, 200, 200);
near(o.x, -900, 'card offset x@(21,21): 100-1000');  // 200/2 - (20*100/2)

// ── 單圖最近鄰：起點 idx0，貪婪取最近 ──
const single = [
  { id: 0, mapId: 1, coords: { x: 0, y: 0 } },
  { id: 1, mapId: 1, coords: { x: 10, y: 10 } },
  { id: 2, mapId: 1, coords: { x: 1, y: 1 } },
  { id: 3, mapId: 1, coords: { x: 2, y: 2 } },
];
assert.deepEqual(TC.optimize(single).map((t) => t.id), [0, 2, 3, 1], '單圖 NN 順序');

// ── 多圖：從點最多的圖開始，圖內 NN 串接上一圖末點 ──
const multi = [
  { id: 'a', mapId: 1, coords: { x: 0, y: 0 } },
  { id: 'b', mapId: 1, coords: { x: 1, y: 1 } },
  { id: 'c', mapId: 1, coords: { x: 5, y: 5 } },
  { id: 'd', mapId: 2, coords: { x: 0, y: 0 } },
];
const route = TC.optimize(multi);
assert.deepEqual(route.map((t) => t.id), ['a', 'b', 'c', 'd'], '多圖：map1(3點)先、map2 後');

// ── analyzeRoute ──
const a = TC.analyzeRoute(route);
assert.equal(a.mapCount, 2, 'mapCount');
assert.equal(a.mapJumps, 1, 'mapJumps（c→d 跨圖）');
assert.ok(a.totalDistance > 0, 'totalDistance>0');

// ── 邊界 ──
assert.deepEqual(TC.optimize([]), [], '空陣列');
assert.deepEqual(TC.optimize(null), [], 'null');
assert.equal(TC.optimize(single, { useMapGrouping: false }).length, 4, '不分組仍全回');

console.log('treasure-core: all assertions passed');
