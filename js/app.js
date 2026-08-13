/* app.js — 藏寶圖：等級 → 地圖 → 挖掘點（單人查詢）；多人＝房間共享路線（op-based，走 window.TreasureRoom）。
 * 單人一次只解一張圖 → 純查詢；路線（記錄/分組/建議順序）是多人房間的事，狀態在 DO 權威清單、不存本地。
 * 座標換算走 window.TreasureCore。無 inline handler（CSP friendly）。 */
(function () {
  'use strict';
  var TC = window.TreasureCore;
  var ROOM = window.TreasureRoom;       // room.js（可能未載入 → 房間功能停用，查詢仍可用）
  var MODAL = window.TreasureModal;     // app-modal.js（confirm / 放大檢視）
  var RMAP = window.TreasureRouteMap;   // route-map.js（區域路線大圖渲染器）
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
  /* 「名稱（等級）」的標籤——但**名稱本身已含等級時不重複**。
     2026-08-13 正名後（改用台服解包原文），13 張圖裡有 12 張的官方名就叫「陳舊的地圖G17」，
     再串一次 grade 會變成「陳舊的地圖G17（G17）」。只有「深層傳送魔紋的地圖」（綠圖）
     的名字不含等級，仍需要補上。⇒ 判斷放這裡一次，不要在兩個呼叫點各寫一份。 */
  function gradeLabel(g) {
    var n = g.name || '';
    return n.indexOf(g.grade) >= 0 ? n : (n + '（' + g.grade + '）');
  }
  function copyText(t) { return (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; }) : Promise.resolve(false); }
  // 整條複製的每行也自帶地名（原本只有「1. ( 21 , 14 )」缺地名，貼進遊戲沒人看得懂在哪張圖）。
  // 格式化本體在 treasure-core（純函式、有測試）。
  function gameCoord(zone, p) { return TC.formatGameCoord(zone, p); }
  function copyCoords(m, p) { var t = gameCoord((m && m.zone) || '', p); copyText(t).then(function (ok) { toast(ok ? '已複製：' + t : t, ok ? 'ok' : 'warn'); }); }

  // 對話框走 app-modal.js（codex-modal 設計系統）；未載入時 confirm 一律回 false（不誤觸破壞性操作）。
  function confirmModal(opts) { return MODAL ? MODAL.confirm(opts) : Promise.resolve(false); }

  function setBreadcrumb(active) {
    document.querySelectorAll('.tre-step').forEach(function (b) {
      var key = b.dataset.goto || b.dataset.step;
      if (key === active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    var mapBtn = document.querySelector('.tre-step[data-goto="map"]'); if (mapBtn) mapBtn.disabled = !state.grade;
  }
  var STEP_PANEL = { grade: 'step-grade', map: 'step-map', treasure: 'step-treasure' };
  var stepReady = false;   // 首次（載入時）showStep 不搶焦點，之後每次切換才移焦到新面板標題
  // 三步切換時把焦點移到新面板標題（tabindex=-1）→ 鍵盤/螢幕閱讀器落到新內容，不卡在舊步驟
  function focusStepHeading(name) {
    var panel = el[STEP_PANEL[name]]; if (!panel) return;
    var h = panel.querySelector('.codex-h2'); if (!h) return;
    h.setAttribute('tabindex', '-1');
    try { h.focus(); } catch (_) {}
  }
  function showStep(name) {
    el['step-grade'].hidden = name !== 'grade'; el['step-map'].hidden = name !== 'map'; el['step-treasure'].hidden = name !== 'treasure';
    setBreadcrumb(name);
    if (stepReady) focusStepHeading(name); else stepReady = true;
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
    el['map-title'].textContent = gradeLabel(g) + ' · 選擇地圖';
    showStep('map'); announce('已選 ' + gradeLabel(g) + '，請選地圖');
  }

  // 依 grade 算各地圖點數 + 按區名排序（renderMaps / renderMapTabs 共用，避免兩處各寫一份分組排序漂移）
  function mapsForGrade(g) {
    var pts = (g && DATA.byItem[g.itemId]) || [], counts = {};
    pts.forEach(function (p) { counts[p.map] = (counts[p.map] || 0) + 1; });
    var mids = Object.keys(counts).map(Number).sort(function (a, b) { return zoneName(a).localeCompare(zoneName(b), 'zh-Hant'); });
    return { mids: mids, counts: counts };
  }

  // ── Step 2：地圖 ──
  function renderMaps(g) {
    el['map-grid'].textContent = '';
    var mg = mapsForGrade(g), counts = mg.counts;
    mg.mids.forEach(function (mid) {
      var m = DATA.maps[mid] || {};
      var card = document.createElement('button'); card.type = 'button'; card.className = 'tre-mapcard';
      var img = document.createElement('img'); img.className = 'tre-mapcard__thumb'; img.loading = 'lazy'; img.decoding = 'async'; img.alt = ''; if (m.image) img.src = m.image;
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
    var mg = mapsForGrade(g), counts = mg.counts, mids = mg.mids;
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
      var tick = document.createElement('span'); tick.className = 'tre-dig__tick'; tick.setAttribute('aria-hidden', 'true');   // ➕/✓ 常駐 affordance 由 CSS ::after 依 .is-added 切
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
  // 「我的名稱」：寫回 portal 設定 character.name（跨工具共享身份，不另存一份）。
  // 名稱是加點當下快照進 DO 每個點的 → 改名只影響之後加的點（提示寫在 hint，不假裝會回溯）。
  function makeNameGroup() {
    var g = document.createElement('div'); g.className = 'tre-roombar__group';
    var lbl = document.createElement('span'); lbl.className = 'tre-roombar__grouplbl codex-small'; lbl.textContent = '我的名稱：'; g.appendChild(lbl);
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'codex-input tre-name-input';
    inp.maxLength = 24; inp.value = ROOM.customName(); inp.placeholder = ROOM.ownerName();
    inp.setAttribute('aria-label', '我在共享路線顯示的名稱');
    inp.title = '隊友在共享路線上看到的名稱（改名只影響之後加的點）';
    inp.addEventListener('change', function () {
      var before = inp.value;
      if (!ROOM.setName(inp.value)) { toast('名稱未能儲存（設定服務未載入）', 'error'); return; }
      inp.value = ROOM.customName(); inp.placeholder = ROOM.ownerName();
      if (inp.value) toast('顯示名稱已改為「' + inp.value + '」（之後加的點生效）', 'ok');
      else if (before.trim()) toast('名稱已清空，改回預設「' + ROOM.ownerName() + '」', 'ok');
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    g.appendChild(inp);
    return g;
  }
  function renderRoomBar() {
    if (!el['room-bar']) return;
    if (!ROOM) { el['room-bar'].hidden = true; return; }
    // 整條 bar 每次事件（隊友加點/上線數）都重畫 → 正在打字的名稱欄會被抹掉；先接住值與游標位置再還原。
    var act = document.activeElement;
    var keepName = (act && act.classList && act.classList.contains('tre-name-input'))
      ? { v: act.value, s: act.selectionStart } : null;
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
      if (ROOM.canSetName()) row.appendChild(makeNameGroup());
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
    if (keepName) {
      var back = el['room-bar'].querySelector('.tre-name-input');
      if (back) { back.value = keepName.v; back.focus(); try { back.setSelectionRange(keepName.s, keepName.s); } catch (_) {} }
    }
  }

  // 共享路線面板走 route-panel.js（渲染 + 面板動作）；依賴由此注入，該檔不自己抓房間狀態/資料。
  var PANEL = window.TreasureRoutePanel ? window.TreasureRoutePanel.create({
    el: el, TC: TC, RMAP: RMAP, MODAL: MODAL, ROOM: ROOM,
    getMaps: function () { return DATA.maps; },
    getShared: function () { return shared; },
    zoneName: zoneName, toast: toast, copyText: copyText, copyCoords: copyCoords, gameCoord: gameCoord,
    ensureConnected: ensureConnected, confirmModal: confirmModal,
  }) : null;
  function renderRoom() { if (PANEL) PANEL.render(); }

  document.querySelectorAll('.tre-step[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { var t = b.dataset.goto; if (t === 'grade') showStep('grade'); else if (t === 'map' && state.grade) showStep('map'); });
  });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { showStep(b.dataset.back); }); });

  var prevKeys = [];   // 上次看到的點 key 清單（偵測隊友新加點用）
  var disconnectedOnce = false;   // 斷過線才在重連時報「已重新連線」（避免首次連線誤報）
  if (ROOM) ROOM.onChange(function (st) {
    var prevCount = shared.points.length, prevOnline = shared.online;
    var newPts = st.points || [];
    shared.points = newPts; shared.online = st.online || 0;
    renderRoomBar(); renderRoom(); refreshDigAdded();
    // 連線/同步狀態回饋（斷線時 op 會被丟棄 → 讓使用者看得到）
    if (st.status === 'joining' || st.status === 'created' || st.status === 'left') disconnectedOnce = false;
    // 連線/同步事件同步進 #tre-status（aria-live）→ 螢幕閱讀器聽得到，不只靠視覺 toast（U3）
    if (st.status === 'expired') { toast('房間已過期（建立滿 6 小時），請重新建立房間', 'warn'); announce('房間已過期，請重新建立房間'); prevKeys = []; disconnectedOnce = false; return; }
    if (st.status === 'opError') { toast('同步暫時失敗，剛才的操作未生效，請重試', 'error'); announce('同步暫時失敗，剛才的操作未生效，請重試'); return; }
    if (st.status === 'disconnected') { if (ROOM.isInRoom()) { disconnectedOnce = true; toast('已斷線，重連中…', 'warn'); announce('已斷線，重新連線中'); } return; }
    if (st.status === 'connected') { if (disconnectedOnce) { disconnectedOnce = false; toast('已重新連線', 'ok'); announce('已重新連線'); } return; }
    // 有人加入 → 小通知（自己首次連線 prevOnline=0 不報；init / 重連 status==='init' 不報）
    if (ROOM.isInRoom() && st.status !== 'init' && shared.online > prevOnline && prevOnline > 0)
      toast('👥 有人加入房間（' + shared.online + ' 人）', 'ok');
    if (ROOM.isInRoom() && st.status === 'state') {
      var me = ROOM.owner();
      var newly = newPts.filter(function (p) { return prevKeys.indexOf(p.key) < 0; });
      // 隊友加點 → 通知（只算別人加的新 key；自己加的不報）
      var others = newly.filter(function (p) { return p.owner !== me; });
      if (others.length) toast('➕ ' + (others[0].ownerName || '隊友') + ' 加了 ' + others.length + ' 個挖掘點', 'ok');
      prevKeys = newPts.map(function (p) { return p.key; });
      // 只有「加點的當事人」自己觸發重排 → 避免線上 N 人各送一份相同 setOrder（O(N) 放大、逼近 rate limit）。
      // 重排廣播 key 不變 → newly 空 → iAdded false → 不再觸發，無迴圈。
      var iAdded = newly.some(function (p) { return p.owner === me; });
      if (PANEL && iAdded && shared.points.length > prevCount && shared.points.length >= 2) PANEL.applyOptimize(true);
    } else {
      prevKeys = newPts.map(function (p) { return p.key; });
    }
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
