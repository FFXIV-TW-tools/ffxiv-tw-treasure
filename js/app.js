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
  var shared = { points: [], online: 0, synced: false }; // 同步前不得把空清單當成 0 點

  var el = {};
  ['step-grade', 'step-map', 'step-treasure', 'grade-grid', 'recent-picks', 'map-grid', 'dig-grid', 'loot-box', 'gather-box',
   'full-map', 'full-map-info', 'map-title', 'tre-title', 'tre-status', 'map-tabs', 'tre-dig-hint',
   'room-bar', 'route-panel', 'route-stat', 'route-empty', 'route-list',
   'route-total', 'route-done', 'route-zones', 'route-next', 'route-next-text'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });
  var visual = window.TreasureVisual;
  document.querySelectorAll('[data-tre-icon]').forEach(function (host) { host.appendChild(visual.icon(host.dataset.treIcon)); });

  // i18n：shim 保證 window.FFXIVI18n 一定在（index.html 的 inline shim 早於本檔）。
  // 整句一條 key（不拆片段串接）——片段在英日文語序下組不回通順句子。
  function t(k, p) { return window.FFXIVI18n.t(k, p); }

  function announce(msg) { if (el['tre-status']) el['tre-status'].textContent = msg; }
  function toast(msg, v) { if (window.FFXIVToast && FFXIVToast.show) FFXIVToast.show(msg, v || 'ok'); }
  function badge(text, v) { var s = document.createElement('span'); s.className = 'codex-badge' + (v ? ' codex-badge--' + v : ''); s.textContent = text; return s; }
  // ⚠️ 地名本身也走 t()：它們是**遊戲官方名**，字典裡那一段由 tools/build-i18n-names.py
  //    從解包 join 出來，不是人手打的譯名（鐵則：不自創）。查不到就照樣顯示繁中。
  function zoneName(mid) { var m = DATA.maps[mid]; return (m && m.zone) ? t(m.zone) : t('地圖 {id}', { id: mid }); }
  /* 「名稱（等級）」的標籤——但**名稱本身已含等級時不重複**。
     2026-08-13 正名後（改用台服解包原文），13 張圖裡有 12 張的官方名就叫「陳舊的地圖G17」，
     再串一次 grade 會變成「陳舊的地圖G17（G17）」。只有「深層傳送魔紋的地圖」（綠圖）
     的名字不含等級，仍需要補上。⇒ 判斷放這裡一次，不要在兩個呼叫點各寫一份。 */
  /* 等級代號 → 顯示字。G6…G17 是 ASCII，翻不翻一樣；**只有「綠圖」是中文**
     （社群慣用分級名，不是官方物品名，所以不在解包生成區塊裡）。
     漏掉它的症狀是英文／日文畫面上孤零零一張中文卡片。 */
  function gradeTag(g) { return g === '綠圖' ? t('綠圖') : g; }

  function gradeLabel(g) {
    var n = g.name || '';
    var name = t(n);
    return n.indexOf(g.grade) >= 0 ? name : t('{name}（{grade}）', { name: name, grade: g.grade });
  }
  function copyText(t) { return (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; }) : Promise.resolve(false); }
  // 整條複製的每行也自帶地名（原本只有「1. ( 21 , 14 )」缺地名，貼進遊戲沒人看得懂在哪張圖）。
  // 格式化本體在 treasure-core（純函式、有測試）。
  function gameCoord(zone, p) { return TC.formatGameCoord(zone, p); }
  // ⚠️ 被複製的這串是要**貼進遊戲**的（/p 地名 座標），地名跟著介面語言走
  //    （Owner 2026-08-13 裁示）。參數名已從 t 改成 raw：原本的局部變數叫 t，
  //    會遮掩掉上面的 t() 函式。
  function copyCoords(m, p) { var raw = gameCoord((m && m.zone) || '', p); copyText(raw).then(function (ok) { toast(ok ? t('已複製：{text}', { text: raw }) : raw, ok ? 'ok' : 'warn'); }); }

  // 對話框走 app-modal.js（codex-modal 設計系統）；未載入時 confirm 一律回 false（不誤觸破壞性操作）。
  function confirmModal(opts) { return MODAL ? MODAL.confirm(opts) : Promise.resolve(false); }

  function setBreadcrumb(active) {
    var steps = { grade: 0, map: 1, treasure: 2 }, current = steps[active];
    document.querySelectorAll('.codex-step[data-step]').forEach(function (step, index) {
      step.classList.toggle('is-done', index < current);
      step.classList.toggle('is-current', index === current);
      if (index === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
    var mapBtn = document.querySelector('[data-goto="map"]');
    if (mapBtn) mapBtn.setAttribute('aria-disabled', state.grade ? 'false' : 'true');
    var hints = {
      grade: state.grade ? t('已選 {grade}', { grade: gradeTag(state.grade.grade) }) : t('先選你手上的藏寶圖等級'),
      map: state.mapId ? t('已選 {zone}', { zone: zoneName(state.mapId) }) : state.grade ? t('現在選地圖') : t('選好等級後挑地圖'),
      treasure: state.mapId ? t('現在比對挖掘點') : t('比對謎題圖找座標'),
    };
    Object.keys(hints).forEach(function (key) { document.querySelector('[data-step-hint="' + key + '"]').textContent = hints[key]; });
  }
  var STEP_PANEL = { grade: 'step-grade', map: 'step-map', treasure: 'step-treasure' };
  var stepReady = false;   // 首次（載入時）showStep 不搶焦點，之後每次切換才移焦到新面板標題
  // 三步切換時把焦點移到新面板標題（tabindex=-1）→ 鍵盤/螢幕閱讀器落到新內容，不卡在舊步驟
  function focusStepHeading(name) {
    var panel = el[STEP_PANEL[name]]; if (!panel) return;
    var h = panel.querySelector('h2'); if (!h) return;
    h.setAttribute('tabindex', '-1');
    try { h.focus(); } catch (_) {}
  }
  function showStep(name) {
    var changed = el[STEP_PANEL[name]].hidden;
    el['step-grade'].hidden = name !== 'grade'; el['step-map'].hidden = name !== 'map'; el['step-treasure'].hidden = name !== 'treasure';
    setBreadcrumb(name);
    if (stepReady && changed) focusStepHeading(name); else stepReady = true;
  }

  // 怪物等級＝該版本上限（7.x=100 / 6.x=90 / 5.x=80 / 4.x=70 / 3.x=60；綠圖 4.05→70）。挖圖時可能出現的怪等。
  var RECENT_KEY = 'treasure.recentPicks.v1';
  function recentPicks() {
    try {
      var saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(function (pick) {
        var g = DATA.grades.find(function (x) { return x.itemId === pick.itemId; });
        return g && mapsForGrade(g).mids.indexOf(pick.mapId) >= 0;
      }).slice(0, 3);
    } catch (e) { return []; }
  }
  function rememberPick(itemId, mapId) {
    try {
      var picks = recentPicks().filter(function (p) { return p.itemId !== itemId || p.mapId !== mapId; });
      picks.unshift({ itemId: itemId, mapId: mapId });
      localStorage.setItem(RECENT_KEY, JSON.stringify(picks.slice(0, 3)));
    } catch (e) { /* 儲存不可用不阻斷查圖 */ }
    renderRecent();
  }
  function renderRecent() {
    var host = el['recent-picks']; host.textContent = '';
    var picks = recentPicks(); host.hidden = !picks.length;
    if (!picks.length) return;
    var label = document.createElement('span'); label.className = 'tre-recent__label'; label.appendChild(visual.icon('clock'));
    label.appendChild(document.createTextNode(t('繼續上次'))); host.appendChild(label);
    picks.forEach(function (pick) {
      var g = DATA.grades.find(function (x) { return x.itemId === pick.itemId; });
      var b = document.createElement('button'); b.type = 'button'; b.className = 'codex-btn codex-btn--ghost';
      b.textContent = t('{grade}・{zone}', { grade: gradeTag(g.grade), zone: zoneName(pick.mapId) });
      b.addEventListener('click', function () { selectGrade(g); selectMap(pick.mapId); }); host.appendChild(b);
    });
  }
  function monsterLevel(exp) { var maj = parseInt(exp, 10); return (maj >= 2 && maj <= 9) ? 30 + maj * 10 : null; }

  // ── Step 1：等級 ──
  function renderGrades() {
    renderRecent();
    el['grade-grid'].textContent = '';
    DATA.grades.forEach(function (g) {
      var card = document.createElement('button'); card.type = 'button'; card.className = 'codex-card codex-card--info tre-card';
      var top = document.createElement('div'); top.className = 'tre-card__top';
      var gradeEl = document.createElement('span'); gradeEl.className = 'tre-card__grade'; gradeEl.textContent = gradeTag(g.grade);
      top.appendChild(gradeEl);
      var lv = monsterLevel(g.expansion);
      if (lv) { var lvEl = badge(t('怪 Lv.{lv}', { lv: lv }), 'gold'); lvEl.setAttribute('data-help', t('挖圖時可能出現的怪物等級')); top.appendChild(lvEl); }
      var name = document.createElement('span'); name.className = 'tre-card__name'; name.textContent = t(g.name);   // 遊戲官方名：字典的生成區塊有 en/ja（tools/build-i18n-names.py）
      var meta = document.createElement('span'); meta.className = 'tre-card__meta';
      meta.appendChild(badge(g.partySize === 8 ? t('8 人') : t('單人')));
      meta.appendChild(badge(t('版本 {v}', { v: g.expansion }), 'gold'));
      if (g.special) meta.appendChild(badge(t('傳送門'), 'neon'));
      card.appendChild(top); card.appendChild(name); card.appendChild(meta);
      /* 取得方式：解包 GatheringItem 的採集等級門檻（綠圖沒有 —— 它不是採集來的，欄位為 null）。
         「哪一個採集點會出」解包裡不存在（已掃過 GatheringPointBase 全表零命中），所以只給等級。 */
      if (g.gatherLevel) {
        var how = document.createElement('span'); how.className = 'tre-card__how codex-small';
        how.textContent = t('採集 Lv.{lv} 以上的點可能挖到', { lv: g.gatherLevel });
        card.appendChild(how);
      }
      // 挖掘區域速查：不點進去也看得到這張圖會出現在哪幾張地圖
      var mids = mapsForGrade(g).mids;
      if (mids.length) {
        var zonesEl = document.createElement('span'); zonesEl.className = 'tre-card__zones';
        mids.forEach(function (mid) {
          var z = document.createElement('span'); z.className = 'codex-chip'; z.textContent = zoneName(mid);
          zonesEl.appendChild(z);
        });
        card.appendChild(zonesEl);
      }
      card.addEventListener('click', function () { selectGrade(g); });
      el['grade-grid'].appendChild(card);
    });
  }
  /* step 2 的兩個補充區塊各自成模組（app.js 只注入依賴，不放渲染細節）：
     · loot-panel.js＝「這張圖可能開出」（藏寶迷宮寶箱 ＋ 挖出的箱子，含查價連結）
     · gather-map.js＝「去哪採到這張圖」（採集點位）
     兩者都自帶延後載入與過期回應保護。 */
  var LOOT = window.TreasureLootPanel ? window.TreasureLootPanel.create({ el: el }) : null;
  // 「去哪採到這張圖」走 gather-map.js（自帶延後載入與過期回應保護），依賴由此注入
  var GATHER = window.TreasureGatherMap
    ? window.TreasureGatherMap.create({ el: el, TC: TC, MODAL: MODAL }) : null;

  function selectGrade(g) {
    state.grade = g; state.mapId = null; renderMaps(g);
    if (LOOT) LOOT.render(g);
    if (GATHER) GATHER.render(g);
    el['map-title'].querySelector('[data-tre-title]').textContent = t('{grade} · 選擇地圖', { grade: gradeLabel(g) });
    showStep('map'); announce(t('已選 {grade}，請選地圖', { grade: gradeLabel(g) }));
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
      var cnt = document.createElement('span'); cnt.className = 'codex-count tre-mapcard__count'; cnt.textContent = t('{n} 點', { n: counts[mid] });
      body.appendChild(zone); body.appendChild(cnt); card.appendChild(img); card.appendChild(body);
      card.addEventListener('click', function () { selectMap(mid); });
      el['map-grid'].appendChild(card);
    });
  }
  function selectMap(mid, fromTabs) {
    state.mapId = mid; rememberPick(state.grade.itemId, mid); renderTreasures(); renderMapTabs();
    el['tre-title'].querySelector('[data-tre-title]').textContent = t('{zone} · {grade} 挖掘點', { zone: zoneName(mid), grade: state.grade.grade });
    showStep('treasure'); announce(t('顯示 {zone} 的挖掘點', { zone: zoneName(mid) }));
    if (fromTabs) el['map-tabs'].querySelector('[aria-selected="true"]').focus();
  }

  // 重畫 tab 時先解除舊節點監聽；鍵盤切換經 onChange 直接選圖，不能再 tab.click() 遞迴派發。
  var releaseMapTabs = null;
  function renderMapTabs() {
    var host = el['map-tabs']; if (!host) return;
    if (releaseMapTabs) { releaseMapTabs(); releaseMapTabs = null; }
    host.textContent = '';
    var panel = document.getElementById('tre-map-tabpanel');
    var g = state.grade;
    if (!g) { host.hidden = true; panel.removeAttribute('role'); panel.removeAttribute('aria-labelledby'); return; }
    var mg = mapsForGrade(g), counts = mg.counts, mids = mg.mids;
    if (mids.length <= 1) { host.hidden = true; panel.removeAttribute('role'); panel.removeAttribute('aria-labelledby'); return; }
    host.hidden = false; panel.setAttribute('role', 'tabpanel');
    mids.forEach(function (mid) {
      var tab = document.createElement('button'); tab.type = 'button'; tab.className = 'codex-tab codex-tab--boxed'; tab.setAttribute('role', 'tab');
      tab.id = 'tre-map-tab-' + mid; tab.setAttribute('aria-controls', panel.id);
      tab.setAttribute('aria-selected', mid === state.mapId ? 'true' : 'false'); tab.tabIndex = mid === state.mapId ? 0 : -1;
      var name = document.createElement('span'); name.textContent = zoneName(mid);
      var count = document.createElement('span'); count.className = 'codex-count'; count.textContent = String(counts[mid]);
      tab.appendChild(name); tab.appendChild(count);
      host.appendChild(tab);
    });
    panel.setAttribute('aria-labelledby', 'tre-map-tab-' + state.mapId);
    if (window.FFXIVA11y && FFXIVA11y.initTabs) {
      releaseMapTabs = FFXIVA11y.initTabs(host, { onChange: function (_, i) { if (mids[i] !== state.mapId) selectMap(mids[i], true); } });
    } else {
      host.querySelectorAll('[role="tab"]').forEach(function (tab, i) {
        tab.addEventListener('click', function () { if (mids[i] !== state.mapId) selectMap(mids[i], true); });
      });
    }
  }

  // ── Step 3：挖掘點（➕ = 加入房間共享路線）──
  function myKey(p) { return (ROOM ? ROOM.owner() : '') + ':' + p.id; }
  function hasMine(p) { return shared.points.some(function (q) { return q.key === myKey(p); }); }
  /** @param {HTMLElement} card @param {boolean} added @returns {void} */
  function trackDigCard(card, added) {
    var inRoom = ROOM && ROOM.isInRoom();
    card.setAttribute('data-track', inRoom ? (added ? 'remove-route-point' : 'add-route-point') : 'open-dig-map');
    card.setAttribute('data-track-label', inRoom ? (added ? '移除路線點位' : '新增路線點位') : '放大挖掘點地圖');
  }

  function renderTreasures() {
    var g = state.grade, mid = state.mapId, m = DATA.maps[mid] || {};
    var sf = m.sizeFactor || 100;
    var pts = (DATA.byItem[g.itemId] || []).filter(function (p) { return p.map === mid; });

    el['dig-grid'].textContent = '';
    pts.forEach(function (p, i) {
      var off = TC.calcCardOffset({ x: p.x, y: p.y }, sf, DIG_W, DIG_H);
      // button（非 div）→ 鍵盤可 Tab/Enter/Space 操作、螢幕閱讀器可播報（加入共享路線是核心互動）
      var card = document.createElement('button'); card.type = 'button'; card.className = 'tre-dig'; card.dataset.idx = i; card.dataset.key = p.id;
      trackDigCard(card, hasMine(p));
      card.setAttribute('aria-label', ROOM && ROOM.isInRoom()
        ? t('加入共享路線 X:{x} Y:{y}', { x: p.x, y: p.y })
        : t('放大地圖並複製座標 X:{x} Y:{y}', { x: p.x, y: p.y }));
      if (ROOM && ROOM.isInRoom()) card.setAttribute('aria-pressed', hasMine(p) ? 'true' : 'false');
      if (hasMine(p)) card.classList.add('is-added');
      var mapDiv = document.createElement('div'); mapDiv.className = 'tre-dig__map';
      if (m.image) mapDiv.style.backgroundImage = 'url("' + m.image + '")';
      mapDiv.style.left = off.x + 'px'; mapDiv.style.top = off.y + 'px';
      var pin = document.createElement('span'); pin.className = 'tre-dig__pin';
      var num = document.createElement('span'); num.className = 'tre-dig__num'; num.textContent = String(i + 1);
      var tick = document.createElement('span'); tick.className = 'tre-dig__tick'; tick.setAttribute('aria-hidden', 'true');
      var bar = document.createElement('div'); bar.className = 'tre-dig__bar';
      var co = document.createElement('span'); co.className = 'tre-dig__co'; co.textContent = 'X:' + p.x + ' Y:' + p.y;
      bar.appendChild(co);
      card.appendChild(mapDiv); card.appendChild(pin); card.appendChild(num); card.appendChild(tick); card.appendChild(bar);
      card.title = digCardTitle();
      card.addEventListener('click', function () { toggleMine(p); });
      card.addEventListener('mouseenter', function () { highlight(i, false); });
      card.addEventListener('focus', function () { highlight(i, false); });
      el['dig-grid'].appendChild(card);
    });

    el['full-map'].textContent = '';
    el['full-map'].style.backgroundImage = m.image ? 'url("' + m.image + '")' : 'none';
    pts.forEach(function (p, i) {
      var pct = TC.coordsToPercent({ x: p.x, y: p.y }, sf);
      var mk = document.createElement('button'); mk.type = 'button'; mk.className = 'codex-map-pin tre-fullmap__marker'; mk.dataset.idx = i;
      mk.style.left = pct.x + '%'; mk.style.top = pct.y + '%'; mk.textContent = String(i + 1); mk.setAttribute('aria-label', t('挖掘點 {n}：X:{x} Y:{y}', { n: i + 1, x: p.x, y: p.y }));
      mk.addEventListener('click', function () { highlight(i, true); });
      mk.addEventListener('mouseenter', function () { highlight(i, true); });
      el['full-map'].appendChild(mk);
    });
    refreshDigCopy();
  }

  function digCardTitle() {
    return ROOM && ROOM.isInRoom() ? t('點一下加入 / 移出共享路線') : t('放大地圖並複製座標');
  }
  function refreshDigCopy() {
    var inRoom = ROOM && ROOM.isInRoom();
    var count = el['dig-grid'].childElementCount;
    el['tre-dig-hint'].textContent = inRoom ? t('比對謎題圖，點卡片加入共享路線。') : t('比對謎題圖，點卡片放大地圖並複製座標。');
    el['full-map-info'].textContent = inRoom ? t('{n} 個挖掘點 · 點卡片即可加入共享路線', { n: count })
      : t('{n} 個挖掘點 · 點卡片可放大地圖', { n: count });
  }

  function highlight(i, scrollDig) {
    el['dig-grid'].querySelectorAll('.tre-dig').forEach(function (c) {
      var on = +c.dataset.idx === i; c.classList.toggle('is-hl', on);
      if (on && scrollDig && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    el['full-map'].querySelectorAll('.tre-fullmap__marker').forEach(function (c) { c.classList.toggle('codex-map-pin--active', +c.dataset.idx === i); });
  }
  function refreshDigAdded() {
    var own = ROOM ? ROOM.owner() : '';
    el['dig-grid'].querySelectorAll('.tre-dig').forEach(function (c) {
      var on = shared.points.some(function (q) { return q.key === own + ':' + c.dataset.key; });
      c.classList.toggle('is-added', on);
      trackDigCard(c, on);
      if (ROOM && ROOM.isInRoom()) c.setAttribute('aria-pressed', on ? 'true' : 'false');
      else c.removeAttribute('aria-pressed');
      c.title = digCardTitle();
      var p = (DATA.byItem[state.grade.itemId] || []).find(function (q) { return String(q.id) === c.dataset.key; });
      if (p) c.setAttribute('aria-label', ROOM && ROOM.isInRoom()
        ? t('加入共享路線 X:{x} Y:{y}', { x: p.x, y: p.y })
        : t('放大地圖並複製座標 X:{x} Y:{y}', { x: p.x, y: p.y }));
    });
  }

  // 送 op 前確認 WS 已連上。斷線/重連視窗內 room.js send() 會靜默丟棄 op，
  // 若照舊樂觀 toast「已加入」就是謊報成功→掉點。未連上時給誠實回饋、擋下操作。
  function ensureConnected() {
    if (ROOM && ROOM.isConnected()) return true;
    toast(t('連線中，尚未同步，請稍後再試'), 'warn');
    return false;
  }

  function toggleMine(p) {
    if (!ROOM || !ROOM.isInRoom()) {
      var m = DATA.maps[p.map] || {}, sf = m.sizeFactor || 100;
      var all = (DATA.byItem[state.grade.itemId] || []).filter(function (q) { return q.map === p.map; });
      MODAL.mapView({
        title: zoneName(p.map), image: m.image,
        markers: all.map(function (q, i) { return { pct: TC.coordsToPercent({ x: q.x, y: q.y }, sf), label: String(i + 1), active: q.id === p.id }; }),
        aetherytes: (m.aetherytes || []).map(function (a) { return TC.coordsToPercent({ x: a.x, y: a.y }, sf); }),
        coordText: t('X:{x} Y:{y}', { x: p.x, y: p.y }),
        onCopy: function () { copyCoords(m, p); },
      });
      return;
    }
    if (!ensureConnected()) return;
    var key = myKey(p);
    if (shared.points.some(function (q) { return q.key === key; })) { ROOM.removePoint(key); toast(t('已從共享路線移除（X:{x} Y:{y}）', { x: p.x, y: p.y }), 'ok'); }
    else { ROOM.addPoint({ key: key, owner: ROOM.owner(), ownerName: ROOM.ownerName(), map: p.map, x: p.x, y: p.y, item: p.item }); toast(t('➕ 已加入共享路線（X:{x} Y:{y}）', { x: p.x, y: p.y }), 'ok'); }
    // 即時 toast 給操作回饋（不等廣播）；卡片 ✓ 狀態仍由 DO 廣播回 refreshDigAdded 更新
  }


  var ROOM_BAR = window.TreasureRoomBar && window.TreasureRoomBar.create({
    el: el['room-bar'], ROOM: ROOM, getShared: function () { return shared; }, toast: toast, copyText: copyText,
  });
  function renderRoomBar() { if (ROOM_BAR) ROOM_BAR.render(); }
  // 共享路線面板走 route-panel.js（渲染 + 面板動作）；依賴由此注入，該檔不自己抓房間狀態/資料。
  var PANEL = window.TreasureRoutePanel ? window.TreasureRoutePanel.create({
    el: el, TC: TC, RMAP: RMAP, MODAL: MODAL, ROOM: ROOM,
    getMaps: function () { return DATA.maps; },
    getShared: function () { return shared; },
    zoneName: zoneName, toast: toast, copyText: copyText, copyCoords: copyCoords, gameCoord: gameCoord,
    ensureConnected: ensureConnected, confirmModal: confirmModal,
  }) : null;
  function renderRoom() { if (PANEL) PANEL.render(); }
  if (PANEL) PANEL.onGoGrade(function () { showStep('grade'); el['step-grade'].scrollIntoView({ block: 'start' }); });

  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { var next = b.dataset.goto; if (next === 'grade') showStep('grade'); else if (next === 'map' && state.grade) showStep('map'); });
  });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { showStep(b.dataset.back); }); });

  var prevKeys = [];   // 上次看到的點 key 清單（偵測隊友新加點用）
  var disconnectedOnce = false;   // 斷過線才在重連時報「已重新連線」（避免首次連線誤報）
  if (ROOM) ROOM.onChange(function (st) {
    var prevCount = shared.points.length, prevOnline = shared.online;
    var newPts = st.points || [];
    shared.points = newPts; shared.online = st.online || 0;
    if (st.status === 'joining' || st.status === 'created' || st.status === 'left' || st.status === 'disconnected') shared.synced = false;
    if (st.status === 'init' || st.status === 'state') shared.synced = true;
    renderRoomBar(); renderRoom();
    if (state.mapId !== null) {
      refreshDigAdded();
      refreshDigCopy();
    }
    // 連線/同步狀態回饋（斷線時 op 會被丟棄 → 讓使用者看得到）
    if (st.status === 'joining' || st.status === 'created' || st.status === 'left') disconnectedOnce = false;
    // 連線/同步事件同步進 #tre-status（aria-live）→ 螢幕閱讀器聽得到，不只靠視覺 toast（U3）
    if (st.status === 'expired') { toast(t('房間已過期（建立滿 6 小時），請重新建立房間'), 'warn'); announce(t('房間已過期，請重新建立房間')); prevKeys = []; disconnectedOnce = false; return; }
    if (st.status === 'opError') { toast(t('同步暫時失敗，剛才的操作未生效，請重試'), 'error'); announce(t('同步暫時失敗，剛才的操作未生效，請重試')); return; }
    if (st.status === 'disconnected') { if (ROOM.isInRoom()) { disconnectedOnce = true; toast(t('已斷線，重連中…'), 'warn'); announce(t('已斷線，重新連線中')); } return; }
    if (st.status === 'connected') { if (disconnectedOnce) { disconnectedOnce = false; toast(t('已重新連線'), 'ok'); announce(t('已重新連線')); } return; }
    // 有人加入 → 小通知（自己首次連線 prevOnline=0 不報；init / 重連 status==='init' 不報）
    if (ROOM.isInRoom() && st.status !== 'init' && shared.online > prevOnline && prevOnline > 0)
      toast(t('👥 有人加入房間（{n} 人）', { n: shared.online }), 'ok');
    if (ROOM.isInRoom() && st.status === 'state') {
      var me = ROOM.owner();
      var newly = newPts.filter(function (p) { return prevKeys.indexOf(p.key) < 0; });
      // 隊友加點 → 通知（只算別人加的新 key；自己加的不報）
      var others = newly.filter(function (p) { return p.owner !== me; });
      if (others.length) toast(t('➕ {who} 加了 {n} 個挖掘點', { who: others[0].ownerName || t('隊友'), n: others.length }), 'ok');
      prevKeys = newPts.map(function (p) { return p.key; });
      // 只有「加點的當事人」自己觸發重排 → 避免線上 N 人各送一份相同 setOrder（O(N) 放大、逼近 rate limit）。
      // 重排廣播 key 不變 → newly 空 → iAdded false → 不再觸發，無迴圈。
      var iAdded = newly.some(function (p) { return p.owner === me; });
      if (PANEL && iAdded && shared.points.length > prevCount && shared.points.length >= 2) PANEL.applyOptimize(true);
    } else {
      prevKeys = newPts.map(function (p) { return p.key; });
    }
  });

  function fatalErr(err) {
    console.error('藏寶圖資料載入失敗', err);
    el['grade-grid'].textContent = '';
    var box = document.createElement('div'); box.className = 'codex-empty codex-empty--bare';
    var p = document.createElement('p'); p.textContent = t('藏寶圖資料暫時無法載入，請重新整理後再試。');
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'codex-btn codex-btn--ghost';
    retry.textContent = t('重新整理'); retry.addEventListener('click', function () { location.reload(); });
    box.appendChild(visual.icon('warning')); box.appendChild(p); box.appendChild(retry); el['grade-grid'].appendChild(box);
  }
  function load() {
    renderRoomBar(); renderRoom();   // 先畫房間 bar（即使資料還沒到 / 已自動重連）
    if (!TC) { fatalErr(new Error('treasure-core.js missing')); return; }
    Promise.all([
      fetch('data/grades.json').then(function (r) { return r.json(); }),
      fetch('data/maps.json').then(function (r) { return r.json(); }),
      fetch('data/treasures.json').then(function (r) { return r.json(); }),
    ]).then(function (res) {
      DATA.grades = res[0].grades || []; DATA.maps = res[1].maps || {}; DATA.byItem = {};
      (res[2].treasures || []).forEach(function (p) { (DATA.byItem[p.item] = DATA.byItem[p.item] || []).push(p); });
      renderGrades(); showStep('grade'); announce(t('已載入 {n} 個等級', { n: DATA.grades.length }));
    }).catch(fatalErr);
  }
  load();
})();
