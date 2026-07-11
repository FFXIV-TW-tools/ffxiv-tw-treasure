// tests/room-pure.test.mjs — node tests/room-pure.test.mjs（fail 即 exit 非 0）
// 釘 room client 純輔助（room.js 環境相依、無法直接 import → 抽出的計算在此覆蓋）：
//  backoffDelay（指數退避上限）+ sanitizeJoinCode（房號淨化）。
import assert from 'node:assert/strict';
import RP from '../js/room-pure.js';

// ── backoffDelay：1,2,4,8,16→clamp 15s（retries clamp 4）──
assert.equal(RP.backoffDelay(0), 1000, 'retries0 → 1s');
assert.equal(RP.backoffDelay(1), 2000, 'retries1 → 2s');
assert.equal(RP.backoffDelay(2), 4000, 'retries2 → 4s');
assert.equal(RP.backoffDelay(3), 8000, 'retries3 → 8s');
assert.equal(RP.backoffDelay(4), 15000, 'retries4 → 16s clamp 15s');
assert.equal(RP.backoffDelay(10), 15000, 'retries 大 → 恆上限 15s');

// ── sanitizeJoinCode：大寫 + 去非 [0-9A-Z]（貼含符號/中文/空白也救得回）──
assert.equal(RP.sanitizeJoinCode('abc123'), 'ABC123', '小寫轉大寫');
assert.equal(RP.sanitizeJoinCode(' a1-b2 '), 'A1B2', '去空白/連字號');
assert.equal(RP.sanitizeJoinCode('room=XY12ZZ'), 'ROOMXY12ZZ', '去 = 號（貼邀請連結片段）');
assert.equal(RP.sanitizeJoinCode('好QW12ER'), 'QW12ER', '去中文');
assert.equal(RP.sanitizeJoinCode(null), '', 'null → 空字串');
assert.equal(RP.sanitizeJoinCode(''), '', '空 → 空');

console.log('room-pure: all assertions passed');
