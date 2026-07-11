/* room.js — 多人共享路線 client（CF Durable Object，op-based）。基於 mit-planner app-room.js 改。
 * 對外 window.TreasureRoom：create/join/leave + addPoint/removePoint/setDone/setOrder/clearDone/clear + onChange。
 * client 只送「操作」，不送整份；DO 權威套用後廣播 {t:'state', points} → 收到就 render（並發加點不互蓋）。 */
(function () {
  'use strict';
  var PURE = window.TreasureRoomPure;   // room-pure.js（同 origin defer，於本檔前載入）：backoffDelay / sanitizeJoinCode
  var dev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API_PROD = 'https://ffxiv-tw-treasure-room.ffxiv-tw-tools.workers.dev';   // 已對齊 _headers connect-src / wrangler name
  var API = dev ? 'http://localhost:8787' : API_PROD;
  function wsURL(c) { return API.replace(/^http/, 'ws') + '/room/' + c + '/ws'; }

  var OWNER_KEY = 'ffxiv-tw-treasure-owner';
  var ROOM_KEY = 'ffxiv-tw-treasure-room';      // {code, savedAt}：6h 內自動重連
  var HIST_KEY = 'ffxiv-tw-treasure-roomhist';
  var REJOIN_MS = 6 * 60 * 60 * 1000;

  var code = null, ws = null, manualClose = false, retries = 0, reconnectT = null;
  var hbT = null, lastPong = 0;         // 心跳計時器 + 最後 pong 時刻（偵測半開連線）
  var points = [], online = 0;
  var listeners = [];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

  function owner() {
    var v = lsGet(OWNER_KEY);
    if (!v) {
      v = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()) + Date.now())
        .replace(/[^0-9a-f]/gi, '').slice(0, 12);
      lsSet(OWNER_KEY, v);
    }
    return v;
  }
  function ownerName() {
    try { if (window.FFXIVSettings && FFXIVSettings.get) { var n = FFXIVSettings.get('character.name'); if (n) return String(n).slice(0, 24); } } catch (_) {}
    return '玩家' + owner().slice(0, 4);
  }

  function emit(status) { for (var i = 0; i < listeners.length; i++) { try { listeners[i]({ points: points, online: online, code: code, status: status }); } catch (err) { try { console.warn('room listener error', err); } catch (_) {} } } }

  // 心跳：每 25s 送 ping，逾 60s 未收 pong（半開連線，行動網路切換常見）→ 主動關 socket 觸發重連。
  function startHeartbeat() {
    stopHeartbeat(); lastPong = Date.now();
    hbT = setInterval(function () {
      if (!ws || ws.readyState !== 1) return;
      if (Date.now() - lastPong > 60000) { try { ws.close(); } catch (_) {} return; }
      send({ t: 'ping' });
    }, 25000);
  }
  function stopHeartbeat() { if (hbT) { clearInterval(hbT); hbT = null; } }

  function saveRoom() { if (code) lsSet(ROOM_KEY, JSON.stringify({ code: code, savedAt: Date.now() })); else lsDel(ROOM_KEY); }
  function addHist(c) {
    var h = roomHistory(); h = [c].concat(h.filter(function (x) { return x !== c; })).slice(0, 5);
    lsSet(HIST_KEY, JSON.stringify(h));
  }
  function roomHistory() { try { var h = JSON.parse(lsGet(HIST_KEY) || '[]'); return Array.isArray(h) ? h : []; } catch (_) { return []; } }

  function scheduleReconnect() { retries++; clearTimeout(reconnectT); reconnectT = setTimeout(connect, PURE.backoffDelay(retries)); }

  function connect() {
    if (!code) return;
    clearTimeout(reconnectT); reconnectT = null;   // 清 pending 重連，避免與本次連線重複
    if (ws && ws.readyState <= 1) return;           // 已有 connecting/open 的 socket → 不重複建（孤兒 + presence 灌水）
    manualClose = false;
    var socket;
    try { socket = new WebSocket(wsURL(code)); } catch (e) { scheduleReconnect(); return; }
    ws = socket;
    // socket 身分守衛：stale socket（已被新連線取代）的事件一律略過，不動現行狀態
    socket.onopen = function () { if (ws !== socket) return; retries = 0; startHeartbeat(); emit('connected'); };
    socket.onmessage = function (ev) {
      if (ws !== socket) return;
      var m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === 'init' || m.t === 'state') {
        points = Array.isArray(m.points) ? m.points : [];
        if (m.online != null) online = m.online;
        emit(m.t);
      } else if (m.t === 'online') { online = m.online || 0; emit('online'); }
      else if (m.t === 'expired') { manualClose = true; lsDel(ROOM_KEY); code = null; points = []; online = 0; emit('expired'); }
      else if (m.t === 'pong') { lastPong = Date.now(); }
      else if (m.t === 'error') { emit('opError'); }   // storage_failed：該 op 未套用，通知 UI 讓使用者重試
    };
    socket.onclose = function () { if (ws !== socket) return; stopHeartbeat(); ws = null; online = 0; emit('disconnected'); if (!manualClose && code) scheduleReconnect(); };
    socket.onerror = function () { try { socket.close(); } catch (_) {} };
  }

  function send(op) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(op)); } catch (_) {} } }

  function create() {
    return fetch(API + '/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: { points: [] } }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d || !d.code) throw new Error('no_code'); code = d.code; points = []; saveRoom(); addHist(code); connect(); emit('created'); return code; });
  }
  function join(c) {
    c = PURE.sanitizeJoinCode(c);
    if (c.length !== 6) return false;
    if (ws) { manualClose = true; try { ws.close(); } catch (_) {} ws = null; }
    code = c; points = []; saveRoom(); addHist(code); connect(); emit('joining'); return true;
  }
  function leave() {
    manualClose = true; stopHeartbeat(); clearTimeout(reconnectT); reconnectT = null;
    if (ws) { try { ws.close(); } catch (_) {} } ws = null;
    code = null; points = []; online = 0; saveRoom(); emit('left');
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && code && (!ws || ws.readyState > 1)) { retries = 0; connect(); }
  });

  function boot() {
    var m = location.search.match(/[?&]room=([0-9A-Za-z]+)/);
    if (m) { join(m[1]); try { window.history.replaceState(null, '', location.pathname + location.hash); } catch (_) {} return; }
    var saved; try { saved = JSON.parse(lsGet(ROOM_KEY) || 'null'); } catch (_) {}
    if (saved && saved.code && (Date.now() - (saved.savedAt || 0) < REJOIN_MS)) join(saved.code);
  }

  window.TreasureRoom = {
    create: create, join: join, leave: leave,
    addPoint: function (p) { send({ t: 'add', p: p }); },
    removePoint: function (key) { send({ t: 'remove', key: key }); },
    setDone: function (key, done) { send({ t: 'done', key: key, done: done }); },
    setOrder: function (keys) { send({ t: 'order', keys: keys }); },
    clearDone: function () { send({ t: 'clearDone' }); },
    clear: function () { send({ t: 'clear' }); },
    getCode: function () { return code; },
    isInRoom: function () { return !!code; },
    isConnected: function () { return !!ws && ws.readyState === 1; },
    getPoints: function () { return points; },
    getOnline: function () { return online; },
    owner: owner, ownerName: ownerName, history: roomHistory,
    onChange: function (f) { listeners.push(f); },
    inviteUrl: function () { return code ? location.origin + location.pathname + '?room=' + code : ''; },
  };

  boot();
})();
