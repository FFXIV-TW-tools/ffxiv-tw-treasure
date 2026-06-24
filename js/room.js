/* room.js — 多人共享路線 client（CF Durable Object，op-based）。基於 mit-planner app-room.js 改。
 * 對外 window.TreasureRoom：create/join/leave + addPoint/removePoint/setDone/setOrder/clearDone/clear + onChange。
 * client 只送「操作」，不送整份；DO 權威套用後廣播 {t:'state', points} → 收到就 render（並發加點不互蓋）。 */
(function () {
  'use strict';
  var dev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API_PROD = 'https://ffxiv-tw-treasure-room.ffxiv-tw-tools.workers.dev';   // ⚠ deploy 後確認此 URL
  var API = dev ? 'http://localhost:8787' : API_PROD;
  function wsURL(c) { return API.replace(/^http/, 'ws') + '/room/' + c + '/ws'; }

  var OWNER_KEY = 'ffxiv-tw-treasure-owner';
  var ROOM_KEY = 'ffxiv-tw-treasure-room';      // {code, savedAt}：6h 內自動重連
  var HIST_KEY = 'ffxiv-tw-treasure-roomhist';
  var REJOIN_MS = 6 * 60 * 60 * 1000;

  var code = null, ws = null, manualClose = false, retries = 0, reconnectT = null;
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

  function emit(status) { for (var i = 0; i < listeners.length; i++) { try { listeners[i]({ points: points, online: online, code: code, status: status }); } catch (_) {} } }

  function saveRoom() { if (code) lsSet(ROOM_KEY, JSON.stringify({ code: code, savedAt: Date.now() })); else lsDel(ROOM_KEY); }
  function addHist(c) {
    var h = roomHistory(); h = [c].concat(h.filter(function (x) { return x !== c; })).slice(0, 5);
    lsSet(HIST_KEY, JSON.stringify(h));
  }
  function roomHistory() { try { var h = JSON.parse(lsGet(HIST_KEY) || '[]'); return Array.isArray(h) ? h : []; } catch (_) { return []; } }

  function scheduleReconnect() { retries++; clearTimeout(reconnectT); reconnectT = setTimeout(connect, Math.min(15000, 1000 * Math.pow(2, Math.min(retries, 4)))); }

  function connect() {
    if (!code) return;
    manualClose = false;
    try { ws = new WebSocket(wsURL(code)); } catch (e) { scheduleReconnect(); return; }
    ws.onopen = function () { retries = 0; emit('connected'); };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === 'init' || m.t === 'state') {
        points = Array.isArray(m.points) ? m.points : [];
        if (m.online != null) online = m.online;
        emit(m.t);
      } else if (m.t === 'online') { online = m.online || 0; emit('online'); }
      else if (m.t === 'expired') { manualClose = true; lsDel(ROOM_KEY); code = null; points = []; online = 0; emit('expired'); }
      // m.t === 'error'(storage_failed)：下次 op 自然重試；m.t === 'pong'：noop
    };
    ws.onclose = function () { ws = null; online = 0; emit('disconnected'); if (!manualClose && code) scheduleReconnect(); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }

  function send(op) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(op)); } catch (_) {} } }

  function create() {
    return fetch(API + '/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: { points: [] } }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d || !d.code) throw new Error('no_code'); code = d.code; points = []; saveRoom(); addHist(code); connect(); emit('created'); return code; });
  }
  function join(c) {
    c = (c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (c.length !== 6) return false;
    if (ws) { manualClose = true; try { ws.close(); } catch (_) {} ws = null; }
    code = c; points = []; saveRoom(); addHist(code); connect(); emit('joining'); return true;
  }
  function leave() {
    manualClose = true; if (ws) { try { ws.close(); } catch (_) {} } ws = null;
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
