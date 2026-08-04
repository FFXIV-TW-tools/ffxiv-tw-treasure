// worker/tests/worker.test.mjs — node tests/worker.test.mjs（fail 即 exit 非 0）
// 守 op-based 房間核心：applyOp / validatePoint / validateState / genCode / originAllowed。
// 重點：證明「並發加點不互蓋」— DO 單執行緒序列呼叫 applyOp，兩人各加一點都保留。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { applyOp, validatePoint, validateState, genCode, originAllowed, normalizePoint, roomFull, maxConn, publicRoomMethodAllowed, isSeedRequest } from '../src/index.js';

// assert 呼叫點計數（供 AGENTS.md 的 TEST-BASELINE 標記機械比對）。刻意數「原始碼裡的呼叫點」
// 而非「執行次數」：後者會被資料驅動迴圈放大，地圖資料改版就讓基線變動＝假紅燈。
// 也刻意不印寫死的字面量——那等於讓 gate 比對兩個常數，正是這道閘要防的漂移。
const A = 'assert';
const asserts = (readFileSync(fileURLToPath(import.meta.url), 'utf8').match(new RegExp(A + '[.][a-zA-Z]+[(]', 'g')) || []).length;

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
// seed 65 點（> MAX_POINTS 64）：建房 seed 超量拒（守 POST /room 的 validateState 閘）
const seed65 = { points: [] };
for (let i = 0; i < 65; i++) seed65.points.push(P({ key: 'k' + i }));
assert.ok(!validateState(seed65), 'seed 65 點（>MAX_POINTS）拒');

// originAllowed（POST /room 與 WS 升級共用此閘：!originAllowed → 403）
const mk = (o) => ({ headers: { get: () => o } });
assert.ok(originAllowed(mk('https://ffxiv-tw-treasure.pages.dev')), '正式站 OK');
assert.ok(originAllowed(mk('https://abc123.ffxiv-tw-treasure.pages.dev')), 'CF preview 子網域 OK');
assert.ok(originAllowed(mk('http://localhost:8774')), 'localhost OK');
assert.ok(!originAllowed(mk('https://evil.pages.dev')), '他站 pages.dev 拒');
assert.ok(!originAllowed(mk('https://ffxiv-tw-treasure.pages.dev.evil.com')), '前綴偽裝拒');
assert.ok(!originAllowed(mk('')), '無 Origin header 拒（POST /room 無 Origin → 403）');

// B-047：遷 xivtc.com 期間的**雙列**契約（上面已斷言舊網域仍 OK，這裡補新網域那一半）。
// 漏新的 ⇒ treasure.xivtc.com 的房間全滅；漏舊的 ⇒ 舊書籤使用者當場斷線。
assert.ok(originAllowed(mk('https://treasure.xivtc.com')), '新正式站 treasure.xivtc.com OK');
assert.ok(!originAllowed(mk('https://unknown.xivtc.com')), '未列舉的 xivtc 子網域拒（精確 host，非萬用）');
assert.ok(!originAllowed(mk('https://xivtc.com')), 'apex 拒');
assert.ok(!originAllowed(mk('https://treasure.xivtc.com.evil.com')), '後綴偽裝拒');

// roomFull：單房 WS 連線軟上限邊界（MAX_CONN=32；達 32 拒第 33 條）
assert.equal(maxConn(), 32, 'MAX_CONN=32（以 getter 導出：workerd 拒收裸值導出，會讓 wrangler dev 起不來）');
assert.equal(roomFull(0), false, '0 連線未滿');
assert.equal(roomFull(31), false, '31 連線未滿（放行第 32）');
assert.equal(roomFull(32), true, '32 連線已滿（拒第 33）');
assert.equal(roomFull(64), true, '超量已滿');

// ── 公開路由閘：/room/:code 只准 GET 與 WS 升級（2026-08-01 健檢實證的授權破口）──
// 破口原樣：default fetch 對 /room/:code 不分 method 原封轉發 → 外部 POST 直達 Room.fetch
// 的 seed 分支，無 origin 檢查即整份覆蓋權威清單、重設 6h 期限，且**不廣播**（線上實測回 200、點被清空）。
// 兩層守衛：① 這裡擋 method ② isSeedRequest 擋路徑（seed 僅限內部 stub.fetch("https://do/seed")）。
assert.equal(publicRoomMethodAllowed('GET'), true, 'GET 放行（WS 升級握手本身就是 GET）');
assert.equal(publicRoomMethodAllowed('POST'), false, '外部 POST /room/:code 拒 — 這正是被實證的覆蓋破口');
assert.equal(publicRoomMethodAllowed('PUT'), false, 'PUT 拒');
assert.equal(publicRoomMethodAllowed('DELETE'), false, 'DELETE 拒');
assert.equal(isSeedRequest('/seed'), true, '內部 seed 通道認得');
assert.equal(isSeedRequest('/room/ABCDEF'), false, '外部路徑不得當 seed（第二層守衛）');
assert.equal(isSeedRequest('/seed/x'), false, '前綴偽裝拒');

// ── 心跳 auto-response 跨檔漂移哨兵（2026-08-04 額度事故）──────────────────
//
// client 每 25s 送 `{"t":"ping"}`。若 DO 沒有註冊 auto-response，那一幀會叫醒 hibernate 中的
// DO 並計費（3,456 次/日/連線）；若註冊了但字串與 client 不符，runtime 比對不到、一樣叫醒 DO。
// **兩種失敗都零功能訊號**：pong 照樣回（fallback 分支還在）、房間照常同步、所有測試照樣綠，
// 只有帳單悄悄回去。所以這裡守的是「有註冊」＋「兩邊字串一致」。
//
// 刻意做成**跨檔比對**而不是各自寫死字面量：寫死等於讓兩個常數互相比對，
// 而真正會漂的正是「有人改了 client 的幀格式卻沒動 worker」。
{
  const workerSrc = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const clientSrc = readFileSync(new URL('../../js/room.js', import.meta.url), 'utf8');

  assert.match(workerSrc, /setWebSocketAutoResponse\(/,
    'DO 建構子必須註冊 WebSocket auto-response —— 否則每次心跳都叫醒 DO 並計費（3,456 次/日/連線）');

  // client 送出的心跳鍵值（send(JSON.stringify(op)) → 取 `send({ t: 'ping' })` 的物件字面量）
  const clientPing = clientSrc.match(/send\(\s*\{\s*t:\s*'([a-z]+)'\s*\}\s*\)/);
  assert.ok(clientPing, 'js/room.js 找不到心跳送出點（解析失效即無法比對，不可當通過）');

  // worker auto-response 註冊的 request 物件（JSON.stringify({ t: "ping" })）
  const workerPing = workerSrc.match(/setWebSocketAutoResponse\([\s\S]*?JSON\.stringify\(\{\s*t:\s*"([a-z]+)"\s*\}\)/);
  assert.ok(workerPing, 'worker 的 auto-response request 必須由 JSON.stringify 產生（手寫字面量易因空白差異靜默失配）');

  assert.equal(workerPing[1], clientPing[1],
    `auto-response 比對的幀（${workerPing[1]}）必須與 client 送出的幀（${clientPing[1]}）一致 —— 不一致＝runtime 比對不到、照樣叫醒 DO，而且零訊號`);
}

console.log(`worker(treasure-room): ${asserts} assertions passed`);
