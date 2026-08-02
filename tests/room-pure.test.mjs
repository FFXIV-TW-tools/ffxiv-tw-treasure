// tests/room-pure.test.mjs — node tests/room-pure.test.mjs（fail 即 exit 非 0）
// 釘 room client 純輔助（room.js 環境相依、無法直接 import → 抽出的計算在此覆蓋）：
//  backoffDelay（指數退避上限）+ sanitizeJoinCode（房號淨化）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import RP from '../js/room-pure.js';

// assert 呼叫點計數（供 AGENTS.md 的 TEST-BASELINE 標記機械比對）。刻意數「原始碼裡的呼叫點」
// 而非「執行次數」：後者會被資料驅動迴圈放大，地圖資料改版就讓基線變動＝假紅燈。
// 也刻意不印寫死的字面量——那等於讓 gate 比對兩個常數，正是這道閘要防的漂移。
const A = 'assert';
const asserts = (readFileSync(fileURLToPath(import.meta.url), 'utf8').match(new RegExp(A + '[.][a-zA-Z]+[(]', 'g')) || []).length;

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

// ── sanitizeDisplayName：去頭尾空白 / 控制字元 / 截 24 字（與 worker ownerName clamp 同上限）──
assert.equal(RP.sanitizeDisplayName('  喵喵  '), '喵喵', '去頭尾空白');
assert.equal(RP.sanitizeDisplayName('阿\n貓\t狗'), '阿 貓 狗', '換行/tab → 空白（不破版）');
assert.equal(RP.sanitizeDisplayName('喵'.repeat(30)), '喵'.repeat(24), '超長截 24 字（同 worker clamp）');
assert.equal(RP.sanitizeDisplayName('   '), '', '純空白 → 空（＝未設定，回預設名）');
assert.equal(RP.sanitizeDisplayName(null), '', 'null → 空字串');

console.log(`room-pure: ${asserts} assertions passed`);
