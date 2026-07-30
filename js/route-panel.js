/* route-panel.js — 唯一職責：共享路線面板（房間內那塊）的渲染與操作。
 * 對外 window.TreasureRoutePanel.create(deps) → { render, applyOptimize }；建立時自行綁面板按鈕委派。
 * 不自己抓 DOM 以外的東西：房間狀態／資料／toast 等一律由 app.js 注入（deps），
 * 讓本檔可獨立閱讀、app.js 不再因這塊而膨脹（2026-07-30 拆檔：app.js 破 500 行門檻）。
 * 全程 createElement/textContent（無 innerHTML，CSP friendly）。 */
(function () {
  'use strict';

  var MACRO_MAX_LINES = 15;   // FFXIV 巨集單頁行數上限

  // deps: { el, TC, RMAP, MODAL, ROOM, getMaps(), getShared(), zoneName(mid), toast(msg,v),
  //         copyText(t), copyCoords(m,p), gameCoord(zone,p), ensureConnected(), confirmModal(opts) }
  function create(deps) {
    var el = deps.el, TC = deps.TC, RMAP = deps.RMAP, MODAL = deps.MODAL, ROOM = deps.ROOM;
    var zoneName = deps.zoneName, toast = deps.toast, ensureConnected = deps.ensureConnected;
    var confirmModal = deps.confirmModal, copyCoords = deps.copyCoords;
    function maps() { return deps.getMaps(); }
    function points() { return deps.getShared().points || []; }

    // 水晶座標 → 百分比（與挖掘點同一套換算）；缺欄位（舊快取資料）時回空陣列，不炸
    function aethPct(m) {
      var sf = m.sizeFactor || 100;
      return (m.aetherytes || []).map(function (a) { return TC.coordsToPercent({ x: a.x, y: a.y }, sf); });
    }

    // 一個地圖區的大圖：該區所有點依清單順序連線 + 編號標記（走法一眼看完，不必逐列對縮圖）
    function makeZoneMap(mid, pts) {
      var m = maps()[mid] || {}, sf = m.sizeFactor || 100;
      var zone = pts.map(function (q, idx) { return { q: q, no: idx + 1 }; })
        .filter(function (o) { return o.q.map === mid; });
      return RMAP.render({
        image: m.image,
        aetherytes: aethPct(m),
        points: zone.map(function (o) {
          return {
            pct: TC.coordsToPercent({ x: o.q.x, y: o.q.y }, sf),
            label: String(o.no), done: !!o.q.done, mine: !!(ROOM && o.q.owner === ROOM.owner()),
          };
        }),
        onPick: function (i) { openMapView(zone[i].q); },
      });
    }

    function openMapView(r) {
      if (!MODAL) return;
      var m = maps()[r.map] || {}, sf = m.sizeFactor || 100;
      // 同區的點一起畫上（編號＝共享清單序號）→ 看得出這點在路線裡的位置與鄰近點，比單一 pin 直觀
      var markers = points().map(function (q, idx) { return { q: q, no: idx + 1 }; })
        .filter(function (o) { return o.q.map === r.map; })
        .map(function (o) {
          return { pct: TC.coordsToPercent({ x: o.q.x, y: o.q.y }, sf), label: String(o.no), active: o.q.key === r.key };
        });
      MODAL.mapView({
        title: zoneName(r.map),
        image: m.image,
        markers: markers,
        aetherytes: aethPct(m),
        coordText: '第 ' + (markers.filter(function (k) { return k.active; })[0] || {}).label + ' 點 · X:' + r.x + ' Y:' + r.y + (r.done ? ' ✓ 已完成' : ''),
        onCopy: function () { copyCoords({ zone: zoneName(r.map) }, r); },
      });
    }

    // 清單一列：序號／完成勾／座標／加點者／複製・移除
    function makeItem(r, i) {
      var mine = !!(ROOM && r.owner === ROOM.owner());
      var item = document.createElement('div'); item.className = 'tre-route-item' + (r.done ? ' is-done' : '') + (mine ? ' is-mine' : '');
      var num = document.createElement('span'); num.className = 'tre-route-item__num'; num.textContent = String(i + 1);
      var chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!r.done; chk.setAttribute('aria-label', '標記完成');
      chk.addEventListener('change', function () {
        if (!ensureConnected()) { chk.checked = !chk.checked; return; }   // 未連上→還原勾選（op 未送出）
        ROOM.setDone(r.key, chk.checked);
      });
      var co = document.createElement('span'); co.className = 'tre-route-item__co codex-body'; co.textContent = 'X:' + r.x + ' Y:' + r.y;
      var owner = document.createElement('span'); owner.className = 'tre-route-item__owner'; owner.textContent = r.ownerName || '';
      var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'tre-route-item__btn'; cp.textContent = '📋'; cp.setAttribute('aria-label', '複製此點');
      cp.addEventListener('click', function () { copyCoords(maps()[r.map] || { zone: zoneName(r.map) }, r); });
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'tre-route-item__btn'; rm.textContent = '✕'; rm.setAttribute('aria-label', '移除');
      rm.addEventListener('click', function () {
        if (!ensureConnected()) return;
        // 刪自己的點一鍵即可；刪隊友的點才確認（避免默默抹掉別人成果，又不擋正當協作清理）
        if (mine) { ROOM.removePoint(r.key); return; }
        confirmModal({ title: '移除隊友的點', message: '這是「' + (r.ownerName || '隊友') + '」加的點，移除後對方也看不到。', confirmText: '移除', danger: true }).then(function (yes) {
          if (yes) ROOM.removePoint(r.key);
        });
      });
      item.appendChild(num); item.appendChild(chk); item.appendChild(co); item.appendChild(owner); item.appendChild(cp); item.appendChild(rm);
      return item;
    }

    // ── 面板整體（只在房間內顯示）──
    function render() {
      var inRoom = !!(ROOM && ROOM.isInRoom());
      el['route-panel'].hidden = !inRoom;
      if (!inRoom) return;
      var pts = points();
      var doneN = pts.filter(function (q) { return q.done; }).length;   // U4：標題常駐「已完成 X / 共 Y 點」完成進度彙總
      el['route-count'].textContent = pts.length ? '（已完成 ' + doneN + ' / 共 ' + pts.length + ' 點）' : '';
      el['route-empty'].hidden = pts.length > 0;
      el['route-list'].textContent = '';
      if (!pts.length) { el['route-stat'].hidden = true; return; }
      var curMap = null, listEl = null;
      pts.forEach(function (r, i) {
        if (r.map !== curMap) {
          curMap = r.map;
          var zoneEl = document.createElement('div'); zoneEl.className = 'tre-route-zone';
          var head = document.createElement('div'); head.className = 'tre-route-zone__head';
          var zn = document.createElement('span'); zn.textContent = zoneName(r.map);
          var zc = document.createElement('span'); zc.className = 'codex-small'; zc.textContent = pts.filter(function (x) { return x.map === r.map; }).length + ' 點';
          head.appendChild(zn); head.appendChild(zc); zoneEl.appendChild(head); el['route-list'].appendChild(zoneEl);
          // 左清單／右大圖並排（大圖獨佔一整列太空；並排後同一區的點與位置一眼對照）
          var body = document.createElement('div'); body.className = 'tre-route-zone__body';
          listEl = document.createElement('div'); listEl.className = 'tre-route-zone__items';
          body.appendChild(listEl); body.appendChild(makeZoneMap(r.map, pts));
          zoneEl.appendChild(body);
        }
        listEl.appendChild(makeItem(r, i));
      });
    }

    // 套用建議順序到共享清單（DO 重排 → 廣播 → 全隊同步）。silent＝自動觸發（加點後），不跳 toast / stat。
    function applyOptimize(silent) {
      var pts = points();
      if (pts.length < 2) { if (!silent) toast('至少 2 個點才需排序', 'warn'); return; }
      var arr = pts.map(function (q) { return { _key: q.key, coords: { x: q.x, y: q.y }, mapId: q.map }; });
      var before = TC.analyzeRoute(arr), opt = TC.optimize(arr), after = TC.analyzeRoute(opt);
      var optKeys = opt.map(function (o) { return o._key; });
      var same = optKeys.length === pts.length && optKeys.every(function (k, idx) { return pts[idx].key === k; });
      if (same) { if (!silent) { el['route-stat'].hidden = false; el['route-stat'].textContent = '已是建議順序（' + pts.length + ' 點）'; } return; }
      ROOM.setOrder(optKeys);
      if (silent) return;
      var pct = before.totalDistance > 0 ? Math.round((1 - after.totalDistance / before.totalDistance) * 100) : 0;
      el['route-stat'].hidden = false;
      var msg;
      if (after.mapCount <= 1) msg = '已排序：單一區域 ' + pts.length + ' 點（最近鄰）';
      else if (pct > 0) msg = '建議順序：' + after.mapCount + ' 區 · ' + pts.length + ' 點 · 路程約縮短 ' + pct + '%';
      else msg = '建議順序：' + after.mapCount + ' 區 · ' + pts.length + ' 點（已分組 + 最近鄰）';
      el['route-stat'].textContent = msg + ' · 傳送點未計入（規劃中）';
      toast('已算建議順序（同步給全隊）', 'ok');
    }

    // 破壞性操作對全隊權威清單生效、DO 無 undo → 二次確認 + 成功回饋
    function clearAll() {
      if (!ensureConnected()) return;
      var n = points().length;
      if (!n) { toast('清單是空的', 'warn'); return; }
      confirmModal({ title: '清空共享路線', message: '將清空整條共享路線，含隊友加的 ' + n + ' 個點，且無法復原。', confirmText: '清空', danger: true }).then(function (yes) {
        if (!yes) return;
        ROOM.clear(); toast('已清空 ' + n + ' 點', 'ok');
      });
    }
    function clearDone() {
      if (!ensureConnected()) return;
      var done = points().filter(function (q) { return q.done; }).length;
      if (!done) { toast('沒有已完成的點', 'warn'); return; }
      confirmModal({ title: '清除已完成', message: '將清除全隊 ' + done + ' 個已完成的點。', confirmText: '清除', danger: true }).then(function (yes) {
        if (!yes) return;
        ROOM.clearDone(); toast('已清除 ' + done + ' 個已完成', 'ok');
      });
    }

    // 複製整條＝直接貼進遊戲巨集欄的內容：每行 `/p 地名 ( 21.0 , 14.0 )`。
    // 用原生 /p（隊友看得到）而非插件指令——遊戲原生沒有「用任意座標插旗」的指令，
    // <flag>/<pos> 讀的是當下狀態、/coord 是 ChatCoordinates 插件，都無法從工具端指定座標。
    function copyMacro() {
      var pts = points(); if (!pts.length) { toast('清單是空的', 'warn'); return; }
      var lines = pts.map(function (r) { return '/p ' + deps.gameCoord(zoneName(r.map), r) + (r.done ? ' ✓' : ''); });
      deps.copyText(lines.join('\n')).then(function (ok) {
        if (!ok) { toast('複製失敗', 'error'); return; }
        toast('已複製巨集（' + pts.length + ' 行）' +
          (lines.length > MACRO_MAX_LINES ? '，超過巨集上限 ' + MACRO_MAX_LINES + ' 行，請分兩個巨集貼' : ''),
          lines.length > MACRO_MAX_LINES ? 'warn' : 'ok');
      });
    }

    if (el['route-panel']) el['route-panel'].addEventListener('click', function (e) {
      var b = e.target.closest('[data-route]'); if (!b) return;
      var a = b.dataset.route;
      if (a === 'optimize') { if (ensureConnected()) applyOptimize(false); }
      else if (a === 'copy') copyMacro();
      else if (a === 'clear-done') clearDone();
      else if (a === 'clear') clearAll();
    });

    return { render: render, applyOptimize: applyOptimize };
  }

  window.TreasureRoutePanel = { create: create };
})();
