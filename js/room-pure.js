/*
 * room-pure.js — 房間 client 的純輔助函式（無 DOM/WS/localStorage 依賴，可單元測試）。
 * 瀏覽器掛 window.TreasureRoomPure（room.js 於其後載入取用）；node 走 module.exports（tests/room-pure.test.mjs）。
 * 抽出動機：room.js 本體依賴 location/WebSocket/localStorage，無法在 node 直接 import；
 *          把「與環境無關的計算」隔出來 → 覆蓋重連退避 + 房號淨化這兩個易錯點。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TreasureRoomPure = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 指數退避重連延遲（ms）：1s、2s、4s、8s、16s→上限 15s（retries clamp 4）。
  // 與 room.js scheduleReconnect 原式完全等價（retries 已於呼叫端遞增後傳入）。
  function backoffDelay(retries) {
    return Math.min(15000, 1000 * Math.pow(2, Math.min(retries, 4)));
  }

  // 房號淨化：大寫化 + 去掉非 [0-9A-Z] 字元（貼上帶符號/中文/空白也能救）。
  // 回傳淨化後字串；長度是否合法（6 碼）由呼叫端判定（join 仍需 length===6）。
  function sanitizeJoinCode(raw) {
    return (raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  return { backoffDelay: backoffDelay, sanitizeJoinCode: sanitizeJoinCode };
});
