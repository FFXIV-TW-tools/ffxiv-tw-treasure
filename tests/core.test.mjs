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

// ── 2-opt golden：釘 dormant improve2Opt 分支的當前行為（預設關、無產品呼叫者）──
// 用固定 deepEqual 而非「≤ 非2opt」單調斷言：improve2Opt 是閉環假設（尾端幻邊），
// analyzeRoute 量開放路徑，2-opt 對開放路徑可能讓指標變大 → 單調斷言會 flaky。只鎖行為。
const zig = [
  { id: 'a', mapId: 1, coords: { x: 0, y: 0 } },
  { id: 'b', mapId: 1, coords: { x: 1, y: 10 } },
  { id: 'c', mapId: 1, coords: { x: 2, y: 0 } },
  { id: 'd', mapId: 1, coords: { x: 3, y: 10 } },
  { id: 'e', mapId: 1, coords: { x: 4, y: 0 } },
  { id: 'f', mapId: 1, coords: { x: 5, y: 10 } },
];
assert.deepEqual(TC.optimize(zig, { use2Opt: false }).map((t) => t.id), ['a', 'c', 'e', 'd', 'b', 'f'], '2-opt 關：greedy NN 順序');
assert.deepEqual(TC.optimize(zig, { use2Opt: true }).map((t) => t.id), ['a', 'c', 'e', 'f', 'd', 'b'], '2-opt 開：改善交叉後順序（golden）');

console.log('treasure-core: all assertions passed');
