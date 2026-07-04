/* app.js — 藏寶圖：等級 → 地圖 → 挖掘點（單人查詢）；多人＝房間共享路線（op-based，走 window.TreasureRoom）。
 * 單人一次只解一張圖 → 純查詢；路線（記錄/分組/建議順序）是多人房間的事，狀態在 DO 權威清單、不存本地。
 * 座標換算走 window.TreasureCore。無 inline handler（CSP friendly）。 */
(function () {
  'use strict';
  var TC = window.TreasureCore;
  var ROOM = window.TreasureRoom;       // room.js（可能未載入 → 房間功能停用，查詢仍可用）
  var DIG_W = 208, DIG_H = 180;          // ⚠ 必須與 styles.css --dig-w/--dig-h 同值

  var DATA = { grades: [], maps: {}, byItem: {} };
  var state = { grade: null, mapId: null };
  var shared = { points: [], online: 0 };   // 房間共享清單（由 ROOM.onChange 灌入）

  var el = {};
  ['step-grade', 'step-map', 'step-treasure', 'grade-grid', 'map-grid', 'dig-grid',
   'full-map', 'full-map-info', 'map-title', 'tre-title', 'tre-status', 'map-tabs',
   'room-bar', 'route-panel', 'route-count', 'route-stat', 'route-empty', 'route-list'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function announce(msg) { if (el['tre-status']) el['tre-status'].textContent = msg; }
  function toast(msg, v) { if (window.FFXIVToast && FFXIVToast.show) FFXIVToast.show(msg, v || 'ok'); }
  function badge(text, v) { var s = document.createElement('span'); s.className = 'codex-badge' + (v ? ' codex-badge--' + v : ''); s.textContent = text; return s; }
  function zoneName(mid) { var m = DATA.maps[mid]; return (m && m.zone) || ('地圖 ' + mid); }
  function copyText(t) { return (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; }) : Promise.resolve(false); }
  function copyCoords(m, p) { var t = ((m && m.zone) || '') + ' ( ' + p.x + ' , ' + p.y + ' )'; copyText(t).then(function (ok) { toast(ok ? '已複製：' + t : t, ok ? 'ok' : 'warn'); }); }

  // 依 portal codex-modal 設計系統的確認框（取代原生 confirm）。回傳 Promise<boolean>（確定=true）。
  // 全程 createElement/textContent（無 innerHTML，CSP friendly）；焦點鎖/還原走 window.FFXIVA11y.trapFocus（fallback no-op）。
  // 設計系統要求：ESC + overlay 點擊關閉（見 _DESIGN-SYSTEM §codex-modal）。
  function confirmModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div'); overlay.className = 'codex-modal-overlay';
      var modal = document.createElement('div'); modal.className = 'codex-modal'; modal.style.maxWidth = '440px';
      modal.setAttribute('role', 'alertdialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'tre-confirm-title');
      var head = document.createElement('div'); head.className = 'codex-modal__header';
      var h = document.createElement('h3'); h.className = 'codex-h3'; h.id = 'tre-confirm-title'; h.style.margin = '0'; h.textContent = opts.title || '確認';
      var x = document.createElement('button'); x.type = 'button'; x.className = 'codex-modal__close'; x.textContent = '×'; x.setAttribute('aria-label', '關閉');
      head.appendChild(h); head.appendChild(x);
      var body = document.createElement('div'); body.className = 'codex-modal__body';
      var p = document.createElement('p'); p.className = 'codex-body'; p.style.margin = '0'; p.textContent = opts.message || '';
      body.appendChild(p);
      var foot = document.createElement('div'); foot.className = 'codex-modal__footer';
      var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'codex-btn codex-btn--ghost'; cancel.textContent = opts.cancelText || '取消';
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'codex-btn codex-btn--' + (opts.danger ? 'danger' : 'primary'); ok.textContent = opts.confirmText || '確定';
      foot.appendChild(cancel); foot.appendChild(ok);
      modal.appendChild(head); modal.appendChild(body); modal.appendChild(foot);
      overlay.appendChild(modal); document.body.appendChild(overlay);
      var release = (window.FFXIVA11y && FFXIVA11y.trapFocus) ? FFXIVA11y.trapFocus(modal, { initial: ok }) : null;
      var done = false;
      function close(val) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        if (release) release();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(val);
      }
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(false); } }
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
      x.addEventListener('click', function () { close(false); });
      cancel.addEventListener('click', function () { close(false); });
      ok.addEventListener('click', function () { close(true); });
    });
  }

  function setBreadcrumb(active) {
    document.querySelectorAll('.tre-step').forEach(function (b) {
      var key = b.dataset.goto || b.dataset.step;
      if (key === active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    var mapBtn = document.querySelector('.tre-step[data-goto="map"]'); if (mapBtn) mapBtn.disabled = !state.grade;
  }
  function showStep(name) {
    el['step-grade'].hidden = name !== 'grade'; el['step-map'].hidden = name !== 'map'; el['step-treasure'].hidden = name !== 'treasure';
    setBreadcrumb(name);
  }

  // 怪物等級＝該版本上限（7.x=100 / 6.x=90 / 5.x=80 / 4.x=70 / 3.x=60；綠圖 4.05→70）。挖圖時可能出現的怪等。
  function monsterLevel(exp) { var maj = parseInt(exp, 10); return (maj >= 2 && maj <= 9) ? 30 + maj * 10 : null; }

  // ── Step 1：等級 ──
  function renderGrades() {
    el['grade-grid'].textContent = '';
    DATA.grades.forEach(function (g) {
      var card = document.createElement('button'); card.type = 'button'; card.className = 'tre-card';
      var top = document.createElement('div'); top.className = 'tre-card__top';
      var gradeEl = document.createElement('span'); gradeEl.className = 'tre-card__grade'; gradeEl.textContent = g.grade;
      top.appendChild(gradeEl);
      var lv = monsterLevel(g.expansion);
      if (lv) { var lvEl = document.createElement('span'); lvEl.className = 'tre-card__lvl'; lvEl.textContent = '怪 Lv.' + lv; lvEl.title = '挖圖時可能出現的怪物等級'; top.appendChild(lvEl); }
      var name = document.createElement('span'); name.className = 'tre-card__name'; name.textContent = g.name;
      var meta = document.createElement('span'); meta.className = 'tre-card__meta';
      meta.appendChild(badge(g.partySize === 8 ? '8 人' : '單人'));
      meta.appendChild(badge('版本 ' + g.expansion, 'gold'));
      if (g.special) meta.appendChild(badge('傳送門', 'neon'));
      card.appendChild(top); card.appendChild(name); card.appendChild(meta);
      card.addEventListener('click', function () { selectGrade(g); });
      el['grade-grid'].appendChild(card);
    });
  }
  function selectGrade(g) {
    state.grade = g; state.mapId = null; renderMaps(g);
    el['map-title'].textContent = g.name + '（' + g.grade + '）· 選擇地圖';
    showStep('map'); announce('已選 ' + g.name + ' ' + g.grade + '，請選地圖');
  }

  // ── Step 2：地圖 ──
  function renderMaps(g) {
    el['map-grid'].textContent = '';
    var pts = DATA.byItem[g.itemId] || [], counts = {};
    pts.forEach(function (p) { counts[p.map] = (counts[p.map] || 0) + 1; });
    Object.keys(counts).map(Number).sort(function (a, b) { return zoneName(a).localeCompare(zoneName(b), 'zh-Hant'); }).forEach(function (mid) {
      var m = DATA.maps[mid] || {};
      var card = document.createElement('button'); card.type = 'button'; card.className = 'tre-mapcard';
      var img = document.createElement('img'); img.className = 'tre-mapcard__thumb'; img.loading = 'lazy'; img.alt = ''; if (m.image) img.src = m.image;
      var body = document.createElement('div'); body.className = 'tre-mapcard__body';
      var zone = document.createElement('span'); zone.className = 'tre-mapcard__zone codex-body'; zone.textContent = zoneName(mid);
      var cnt = document.createElement('span'); cnt.className = 'codex-small'; cnt.textContent = counts[mid] + ' 點';
      body.appendChild(zone); body.appendChild(cnt); card.appendChild(img); card.appendChild(body);
      card.addEventListener('click', function () { selectMap(mid); });
      el['map-grid'].appendChild(card);
    });
  }
  function selectMap(mid) {
    state.mapId = mid; renderTreasures(); renderMapTabs();
    el['tre-title'].textContent = zoneName(mid) + ' · ' + state.grade.grade + ' 挖掘點';
    showStep('treasure'); announce('顯示 ' + zoneName(mid) + ' 的挖掘點');
  }

  // 同等級地圖快速切換 tab（step 3 常駐）：玩家常一次準備多張同 grade 的圖、連續挖 → 直接切，不用退回選單
  function renderMapTabs() {
    var host = el['map-tabs']; if (!host) return;
    host.textContent = '';
    var g = state.grade; if (!g) { host.hidden = true; return; }
    var pts = DATA.byItem[g.itemId] || [], counts = {};
    pts.forEach(function (p) { counts[p.map] = (counts[p.map] || 0) + 1; });
    var mids = Object.keys(counts).map(Number).sort(function (a, b) { return zoneName(a).localeCompare(zoneName(b), 'zh-Hant'); });
    if (mids.length <= 1) { host.hidden = true; return; }   // 只有 1 張圖不必顯示
    host.hidden = false;
    var lbl = document.createElement('span'); lbl.className = 'tre-maptabs__lbl codex-small'; lbl.textContent = g.grade + ' 地圖：'; host.appendChild(lbl);
    mids.forEach(function (mid) {
      var chip = document.createElement('button'); chip.type = 'button';
      chip.className = 'tre-maptab' + (mid === state.mapId ? ' is-active' : '');
      chip.textContent = zoneName(mid) + '（' + counts[mid] + '）';
      if (mid === state.mapId) chip.setAttribute('aria-current', 'true');
      chip.addEventListener('click', function () { if (mid !== state.mapId) selectMap(mid); });
      host.appendChild(chip);
    });
  }

  // ── Step 3：挖掘點（➕ = 加入房間共享路線）──
  function myKey(p) { return (ROOM ? ROOM.owner() : '') + ':' + p.id; }
  function hasMine(p) { return shared.points.some(function (q) { return q.key === myKey(p); }); }

  function renderTreasures() {
    var g = state.grade, mid = state.mapId, m = DATA.maps[mid] || {};
    var sf = m.sizeFactor || 100;
    var pts = (DATA.byItem[g.itemId] || []).filter(function (p) { return p.map === mid; });

    el['dig-grid'].textContent = '';
    pts.forEach(function (p, i) {
      var off = TC.calcCardOffset({ x: p.x, y: p.y }, sf, DIG_W, DIG_H);
      // button（非 div）→ 鍵盤可 Tab/Enter/Space 操作、螢幕閱讀器可播報（加入共享路線是核心互動）
      var card = document.createElement('button'); card.type = 'button'; card.className = 'tre-dig'; card.dataset.idx = i; card.dataset.key = p.id;
      card.setAttribute('aria-label', '加入共享路線 X:' + p.x + ' Y:' + p.y);
      card.setAttribute('aria-pressed', hasMine(p) ? 'true' : 'false');
      if (hasMine(p)) card.classList.add('is-added');
      var mapDiv = document.createElement('div'); mapDiv.className = 'tre-dig__map';
      if (m.image) mapDiv.style.backgroundImage = 'url("' + m.image + '")';
      mapDiv.style.left = off.x + 'px'; mapDiv.style.top = off.y + 'px';
      var pin = document.createElement('span'); pin.className = 'tre-dig__pin';
      var num = document.createElement('span'); num.className = 'tre-dig__num'; num.textContent = String(i + 1);
      var tick = document.createElement('span'); tick.className = 'tre-dig__tick'; tick.textContent = '✓'; tick.setAttribute('aria-hidden', 'true');
      var bar = document.createElement('div'); bar.className = 'tre-dig__bar';
      var co = document.createElement('span'); co.className = 'tre-dig__co'; co.textContent = 'X:' + p.x + ' Y:' + p.y;
      bar.appendChild(co);
      card.appendChild(mapDiv); card.appendChild(pin); card.appendChild(num); card.appendChild(tick); card.appendChild(bar);
      card.title = '點一下加入 / 移出共享路線';
      card.addEventListener('click', function () { toggleMine(p); });
      card.addEventListener('mouseenter', function () { highlight(i, false); });
      card.addEventListener('focus', function () { highlight(i, false); });
      el['dig-grid'].appendChild(card);
    });

    el['full-map'].textContent = '';
    el['full-map'].style.backgroundImage = m.image ? 'url("' + m.image + '")' : 'none';
    pts.forEach(function (p, i) {
      var pct = TC.coordsToPercent({ x: p.x, y: p.y }, sf);
      var mk = document.createElement('button'); mk.type = 'button'; mk.className = 'tre-fullmap__marker'; mk.dataset.idx = i;
      mk.style.left = pct.x + '%'; mk.style.top = pct.y + '%'; mk.textContent = String(i + 1); mk.title = 'X:' + p.x + ' Y:' + p.y;
      mk.addEventListener('click', function () { highlight(i, true); });
      mk.addEventListener('mouseenter', function () { highlight(i, true); });
      el['full-map'].appendChild(mk);
    });
    el['full-map-info'].textContent = pts.length + ' 個挖掘點 · 點卡片即可加入共享路線';
  }

  function highlight(i, scrollDig) {
    el['dig-grid'].querySelectorAll('.tre-dig').forEach(function (c) {
      var on = +c.dataset.idx === i; c.classList.toggle('is-hl', on);
      if (on && scrollDig && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el['full-map'].querySelectorAll('.tre-fullmap__marker').forEach(function (c) { c.classList.toggle('is-active', +c.dataset.idx === i); });
  }
  function refreshDigAdded() {
    var own = ROOM ? ROOM.owner() : '';
    el['dig-grid'].querySelectorAll('.tre-dig').forEach(function (c) {
      var on = shared.points.some(function (q) { return q.key === own + ':' + c.dataset.key; });
      c.classList.toggle('is-added', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // 送 op 前確認 WS 已連上。斷線/重連視窗內 room.js send() 會靜默丟棄 op，
  // 若照舊樂觀 toast「已加入」就是謊報成功→掉點。未連上時給誠實回饋、擋下操作。
  function ensureConnected() {
    if (ROOM && ROOM.isConnected()) return true;
    toast('連線中，尚未同步，請稍後再試', 'warn');
    return false;
  }

  function toggleMine(p) {
    if (!ROOM || !ROOM.isInRoom()) {
      toast('多人挖寶？先在上方「建立 / 加入房間」', 'warn');
      if (el['room-bar'] && el['room-bar'].scrollIntoView) el['room-bar'].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!ensureConnected()) return;
    var key = myKey(p);
    if (shared.points.some(function (q) { return q.key === key; })) { ROOM.removePoint(key); toast('已從共享路線移除（X:' + p.x + ' Y:' + p.y + '）', 'ok'); }
    else { ROOM.addPoint({ key: key, owner: ROOM.owner(), ownerName: ROOM.ownerName(), map: p.map, x: p.x, y: p.y, item: p.item }); toast('➕ 已加入共享路線（X:' + p.x + ' Y:' + p.y + '）', 'ok'); }
    // 即時 toast 給操作回饋（不等廣播）；卡片 ✓ 狀態仍由 DO 廣播回 refreshDigAdded 更新
  }

  // ── 房間 bar ──
  function roomBtn(text, fn, variant) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'codex-btn codex-btn--' + (variant || 'ghost'); b.textContent = text; b.addEventListener('click', fn); return b;
  }
  function renderRoomBar() {
    if (!el['room-bar']) return;
    if (!ROOM) { el['room-bar'].hidden = true; return; }
    el['room-bar'].hidden = false; el['room-bar'].textContent = '';
    var hud = document.createElement('span'); hud.className = 'codex-hud'; hud.setAttribute('aria-hidden', 'true'); el['room-bar'].appendChild(hud);
    var row = document.createElement('div'); row.className = 'tre-roombar__row'; el['room-bar'].appendChild(row);
    if (ROOM.isInRoom()) {
      var lbl = document.createElement('span'); lbl.className = 'tre-roombar__label codex-body'; lbl.textContent = '房間'; row.appendChild(lbl);
      var codeEl = document.createElement('span'); codeEl.className = 'tre-roombar__code'; codeEl.textContent = ROOM.getCode(); row.appendChild(codeEl);
      row.appendChild(roomBtn('📋 複製碼', function () { copyText(ROOM.getCode()).then(function (ok) { toast(ok ? '已複製房號' : ROOM.getCode(), 'ok'); }); }));
      row.appendChild(roomBtn('🔗 邀請連結', function () { copyText(ROOM.inviteUrl()).then(function (ok) { toast(ok ? '已複製邀請連結' : '複製失敗', ok ? 'ok' : 'error'); }); }));
      var on = document.createElement('span'); on.className = 'tre-roombar__online codex-small';
      on.textContent = '👥 ' + (shared.online || 1) + ' 人' + (ROOM.isConnected() ? '' : '（連線中…）'); row.appendChild(on);
      row.appendChild(roomBtn('離開', function () { ROOM.leave(); }));
    } else {
      // 建立（自動產碼）— 與「加入」明確分開
      var createG = document.createElement('div'); createG.className = 'tre-roombar__group';
      var cl = document.createElement('span'); cl.className = 'tre-roombar__grouplbl codex-small'; cl.textContent = '開新房間：'; createG.appendChild(cl);
      createG.appendChild(roomBtn('＋ 建立房間', function () {
        ROOM.create().then(function (c) { toast('房間已建立：' + c + '（把房號或邀請連結給隊友）', 'ok'); }).catch(function () { toast('建立失敗（後端未連上）', 'error'); });
      }, 'primary'));
      var ch = document.createElement('span'); ch.className = 'tre-roombar__grouphint codex-xs'; ch.textContent = '房號自動產生，分享給隊友'; createG.appendChild(ch);
      row.appendChild(createG);
      var orEl = document.createElement('span'); orEl.className = 'tre-roombar__or codex-small'; orEl.textContent = '或'; row.appendChild(orEl);
      // 加入（貼朋友的房號）
      var joinG = document.createElement('div'); joinG.className = 'tre-roombar__group';
      var jl = document.createElement('span'); jl.className = 'tre-roombar__grouplbl codex-small'; jl.textContent = '加入朋友的房間：'; joinG.appendChild(jl);
      var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'codex-input tre-room-input'; inp.placeholder = '朋友給的 6 碼房號'; inp.maxLength = 6; inp.setAttribute('aria-label', '輸入朋友的房號'); joinG.appendChild(inp);
      var doJoin = function () { if (!ROOM.join(inp.value)) toast('房號需 6 碼', 'warn'); };
      joinG.appendChild(roomBtn('加入', doJoin));
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(); });
      var hist = ROOM.history();
      if (hist.length) {
        var hl = document.createElement('span'); hl.className = 'codex-small tre-roombar__grouphint'; hl.textContent = '最近：'; joinG.appendChild(hl);
        hist.forEach(function (c) { var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'tre-room-chip'; chip.textContent = c; chip.addEventListener('click', function () { ROOM.join(c); }); joinG.appendChild(chip); });
      }
      row.appendChild(joinG);
    }
  }

  // 共享路線每點的縮圖：整張小地圖（contain）+ pin 標出該點位置 → 看得出在哪一區的哪裡（比裁切塊好認）
  function makeRouteThumb(r) {
    var m = DATA.maps[r.map] || {};
    var wrap = document.createElement('div'); wrap.className = 'tre-route-item__thumb';
    if (m.image) {
      wrap.style.backgroundImage = 'url("' + m.image + '")';
      var pct = TC.coordsToPercent({ x: r.x, y: r.y }, m.sizeFactor || 100);
      var pin = document.createElement('span'); pin.className = 'tre-route-item__thumbpin'; pin.setAttribute('aria-hidden', 'true');
      pin.style.left = pct.x + '%'; pin.style.top = pct.y + '%';
      wrap.appendChild(pin);
    }
    return wrap;
  }

  // ── 共享路線面板（只在房間內顯示）──
  function renderRoom() {
    var inRoom = !!(ROOM && ROOM.isInRoom());
    el['route-panel'].hidden = !inRoom;
    if (!inRoom) return;
    var pts = shared.points || [];
    el['route-count'].textContent = pts.length ? '（' + pts.length + ' 點）' : '';
    el['route-empty'].hidden = pts.length > 0;
    el['route-list'].textContent = '';
    if (!pts.length) { el['route-stat'].hidden = true; return; }
    var curMap = null, zoneEl = null;
    pts.forEach(function (r, i) {
      if (r.map !== curMap) {
        curMap = r.map; zoneEl = document.createElement('div'); zoneEl.className = 'tre-route-zone';
        var head = document.createElement('div'); head.className = 'tre-route-zone__head';
        var zn = document.createElement('span'); zn.textContent = zoneName(r.map);
        var zc = document.createElement('span'); zc.className = 'codex-small'; zc.textContent = pts.filter(function (x) { return x.map === r.map; }).length + ' 點';
        head.appendChild(zn); head.appendChild(zc); zoneEl.appendChild(head); el['route-list'].appendChild(zoneEl);
      }
      var mine = !!(ROOM && r.owner === ROOM.owner());
      var item = document.createElement('div'); item.className = 'tre-route-item' + (r.done ? ' is-done' : '') + (mine ? ' is-mine' : '');
      var num = document.createElement('span'); num.className = 'tre-route-item__num'; num.textContent = String(i + 1);
      var thumb = makeRouteThumb(r);
      var chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!r.done; chk.setAttribute('aria-label', '標記完成');
      chk.addEventListener('change', function () {
        if (!ensureConnected()) { chk.checked = !chk.checked; return; }   // 未連上→還原勾選（op 未送出）
        ROOM.setDone(r.key, chk.checked);
      });
      var co = document.createElement('span'); co.className = 'tre-route-item__co codex-body'; co.textContent = 'X:' + r.x + ' Y:' + r.y;
      var owner = document.createElement('span'); owner.className = 'tre-route-item__owner'; owner.textContent = r.ownerName || '';
      var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'tre-route-item__btn'; cp.textContent = '📋'; cp.setAttribute('aria-label', '複製此點');
      cp.addEventListener('click', function () { copyCoords(DATA.maps[r.map] || { zone: zoneName(r.map) }, r); });
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'tre-route-item__btn'; rm.textContent = '✕'; rm.setAttribute('aria-label', '移除');
      rm.addEventListener('click', function () {
        if (!ensureConnected()) return;
        // 刪自己的點一鍵即可；刪隊友的點才確認（避免默默抹掉別人成果，又不擋正當協作清理）
        if (mine) { ROOM.removePoint(r.key); return; }
        confirmModal({ title: '移除隊友的點', message: '這是「' + (r.ownerName || '隊友') + '」加的點，移除後對方也看不到。', confirmText: '移除', danger: true }).then(function (yes) {
          if (yes) ROOM.removePoint(r.key);
        });
      });
      item.appendChild(num); item.appendChild(thumb); item.appendChild(chk); item.appendChild(co); item.appendChild(owner); item.appendChild(cp); item.appendChild(rm);
      zoneEl.appendChild(item);
    });
  }

  // 套用建議順序到共享清單（DO 重排 → 廣播 → 全隊同步）。silent＝自動觸發（加點後），不跳 toast / stat。
  function applyOptimize(silent) {
    var pts = shared.points || [];
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
  function optimizeRoom() { if (!ensureConnected()) return; applyOptimize(false); }
  // 破壞性操作對全隊權威清單生效、DO 無 undo → 二次確認 + 成功回饋（原本靜默無確認）
  function clearRoom() {
    if (!ensureConnected()) return;
    var n = (shared.points || []).length;
    if (!n) { toast('清單是空的', 'warn'); return; }
    confirmModal({ title: '清空共享路線', message: '將清空整條共享路線，含隊友加的 ' + n + ' 個點，且無法復原。', confirmText: '清空', danger: true }).then(function (yes) {
      if (!yes) return;
      ROOM.clear(); toast('已清空 ' + n + ' 點', 'ok');
    });
  }
  function clearDoneRoom() {
    if (!ensureConnected()) return;
    var done = (shared.points || []).filter(function (q) { return q.done; }).length;
    if (!done) { toast('沒有已完成的點', 'warn'); return; }
    confirmModal({ title: '清除已完成', message: '將清除全隊 ' + done + ' 個已完成的點。', confirmText: '清除', danger: true }).then(function (yes) {
      if (!yes) return;
      ROOM.clearDone(); toast('已清除 ' + done + ' 個已完成', 'ok');
    });
  }
  function copyRoom() {
    var pts = shared.points || []; if (!pts.length) { toast('清單是空的', 'warn'); return; }
    var lines = [], cur = null;
    pts.forEach(function (r, i) { if (r.map !== cur) { cur = r.map; lines.push('【' + zoneName(r.map) + '】'); } lines.push((i + 1) + '. ( ' + r.x + ' , ' + r.y + ' )' + (r.done ? ' ✓' : '')); });
    copyText(lines.join('\n')).then(function (ok) { toast(ok ? '已複製整條（' + pts.length + ' 點）' : '複製失敗', ok ? 'ok' : 'error'); });
  }

  if (el['route-panel']) el['route-panel'].addEventListener('click', function (e) {
    var b = e.target.closest('[data-route]'); if (!b) return;
    var a = b.dataset.route;
    if (a === 'optimize') optimizeRoom();
    else if (a === 'copy') copyRoom();
    else if (a === 'clear-done') clearDoneRoom();
    else if (a === 'clear') clearRoom();
  });

  document.querySelectorAll('.tre-step[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { var t = b.dataset.goto; if (t === 'grade') showStep('grade'); else if (t === 'map' && state.grade) showStep('map'); });
  });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { showStep(b.dataset.back); }); });

  var prevKeys = [];   // 上次看到的點 key 清單（偵測隊友新加點用）
  if (ROOM) ROOM.onChange(function (st) {
    var prevCount = shared.points.length, prevOnline = shared.online;
    var newPts = st.points || [];
    shared.points = newPts; shared.online = st.online || 0;
    renderRoomBar(); renderRoom(); refreshDigAdded();
    if (st.status === 'expired') { toast('房間已過期（建立滿 6 小時），請重新建立房間', 'warn'); prevKeys = []; return; }
    // 有人加入 → 小通知（自己首次連線 prevOnline=0 不報；init / 重連 status==='init' 不報）
    if (ROOM.isInRoom() && st.status !== 'init' && shared.online > prevOnline && prevOnline > 0)
      toast('👥 有人加入房間（' + shared.online + ' 人）', 'ok');
    // 隊友加點 → 通知（只算別人加的新 key；自己加的不報）
    if (ROOM.isInRoom() && st.status === 'state') {
      var me = ROOM.owner();
      var added = newPts.filter(function (p) { return prevKeys.indexOf(p.key) < 0 && p.owner !== me; });
      if (added.length) toast('➕ ' + (added[0].ownerName || '隊友') + ' 加了 ' + added.length + ' 個挖掘點', 'ok');
    }
    prevKeys = newPts.map(function (p) { return p.key; });
    // 加點後自動套建議順序（只在 op 廣播 'state' 且點數變多時；重排廣播點數不變 → 不再觸發，無迴圈）
    if (ROOM.isInRoom() && st.status === 'state' && shared.points.length > prevCount && shared.points.length >= 2)
      applyOptimize(true);
  });

  function fatalErr(msg) { el['grade-grid'].textContent = ''; var p = document.createElement('p'); p.className = 'tre-error codex-body'; p.textContent = msg; el['grade-grid'].appendChild(p); }
  function load() {
    renderRoomBar(); renderRoom();   // 先畫房間 bar（即使資料還沒到 / 已自動重連）
    if (!TC) { fatalErr('核心模組未載入（treasure-core.js），請重新整理。'); return; }
    Promise.all([
      fetch('data/grades.json').then(function (r) { return r.json(); }),
      fetch('data/maps.json').then(function (r) { return r.json(); }),
      fetch('data/treasures.json').then(function (r) { return r.json(); }),
    ]).then(function (res) {
      DATA.grades = res[0].grades || []; DATA.maps = res[1].maps || {}; DATA.byItem = {};
      (res[2].treasures || []).forEach(function (p) { (DATA.byItem[p.item] = DATA.byItem[p.item] || []).push(p); });
      renderGrades(); showStep('grade'); announce('已載入 ' + DATA.grades.length + ' 個等級');
    }).catch(function (e) { fatalErr('資料載入失敗，請重新整理。（' + ((e && e.message) || e) + '）'); });
  }
  load();
})();
