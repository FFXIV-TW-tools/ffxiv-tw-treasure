/* gather-map.js — 「去哪採到這張圖」區塊（唯一職責：採集點位速查 ＋ 點開看點位）。
 *
 * 資料＝data/gather.json（build-data.py 從本地 lspl/nodes.json 產），**延後載入**：
 * 選了等級才抓那 21 KB，第一步就離開的人不用付。
 *
 * ⚠️ 這是**依採集等級門檻推導**的清單，不是解包直說「這個點會掉這張圖」——解包裡沒有那張表
 *    （`GatheringItem` 只給等級門檻，`GatheringPointBase` 全表零命中）。畫面上必須寫清楚，
 *    否則讀起來像官方保證。
 *
 * 依賴由 app.js 注入（本檔不自己抓狀態）：{ el, TC, MODAL }。
 * 全程 createElement/textContent（無 innerHTML，CSP friendly）。 */
(function () {
  'use strict';
  function t(k, p) { return window.FFXIVI18n.t(k, p); }

  /* node type → **遊戲原生地圖標記圖示**（xivapi `/i/060000/`）。
     權威表＝marketboard `modules/price_utils.js` 的 `NODE_TYPE_ICON`（採集地圖用的同一組，
     icon 身分已在那邊對過 4/5 綁反的坑）。傳送點 icon 走同一條路徑（route-map.js 060453）。
     ⚠️ 初版用 emoji（⛏／🌿）被 Owner 退回：米色地圖上幾乎看不到，而且是自創圖示——
     AGENTS 的傳送點那條鐵則早就寫過同一件事，這裡踩的是同一個坑。 */
  var ICON_BASE = 'https://xivapi.com/i/060000/';
  var TYPE_ICON = { 0: ICON_BASE + '060438.png', 1: ICON_BASE + '060437.png',
                    2: ICON_BASE + '060433.png', 3: ICON_BASE + '060432.png' };
  /* 職業動作名（marker 的 hover 說明）。⚠️ 刻意寫成**字面** t('…') 而不是 `t(表[type])`：
     i18n 哨兵靠靜態掃描認 key，變數取用會讓這四條被判成「死 key」（實際發生過）。 */
  function typeName(tp) {
    return tp === 0 ? t('採掘') : tp === 1 ? t('碎石') : tp === 2 ? t('採伐') : t('割草');
  }

  function create(deps) {
    var el = deps.el, TC = deps.TC, MODAL = deps.MODAL;
    var DATA = null, req = null, token = null;   // token＝最後一次 render 的等級，用來丟棄過期回應

    function load() {
      if (DATA) return Promise.resolve(DATA);
      if (!req) req = fetch('data/gather.json').then(function (r) { return r.json(); })
        .then(function (j) { DATA = { levels: j.levels || {}, maps: j.maps || {} }; return DATA; });
      return req;
    }

    // 某張地圖的採集點放大檢視（沿用 app-modal 的 mapView，不另寫一套 modal）
    function openMap(lv, mid, pts) {
      var m = DATA.maps[String(mid)] || {};
      MODAL.mapView({
        title: t('{zone} · 採集 Lv.{lv}（{n} 處）', { zone: t(m.zone), lv: lv, n: pts.length }),
        image: m.image,
        markers: pts.map(function (p) {
          // 標籤直接寫在圖示下（等級＋遊戲內座標）——只放 hover title 的話，手機完全看不到，
          // 而「要去哪個座標」正是這張圖唯一要回答的事。
          return { pct: TC.coordsToPercent({ x: p.x, y: p.y }, m.sizeFactor),
                   icon: TYPE_ICON[p.t],
                   label: 'Lv.' + lv + ' (' + p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ')',
                   title: typeName(p.t) + ' Lv.' + lv };
        }),
        coordText: t('採礦工／園藝工在這些採集點採集，有機會拿到藏寶圖。'),
      });
    }

    function render(grade) {
      var box = el['gather-box']; if (!box) return;
      box.textContent = ''; box.hidden = true;
      var lv = grade && grade.gatherLevel;
      token = grade && grade.itemId;
      if (!lv) return;   // 綠圖：不是採集來的，整塊不出
      var mine = token;
      load().then(function (d) {
        if (token !== mine) return;   // 使用者已換等級 → 丟掉過期回應，不蓋掉現在這張圖
        var pts = d.levels[String(lv)] || [];
        if (!pts.length) return;
        var byMap = {};
        pts.forEach(function (p) { (byMap[p.m] = byMap[p.m] || []).push(p); });
        // 點多的地圖排前面（點多＝比較好刷），同數量時按地名排序，避免順序隨資料檔漂移
        var mids = Object.keys(byMap).map(Number).sort(function (a, b) {
          return byMap[b].length - byMap[a].length
            || String((d.maps[a] || {}).zone).localeCompare(String((d.maps[b] || {}).zone), 'zh-Hant');
        });
        var h = document.createElement('h3'); h.className = 'codex-h3 tre-gather__title';
        h.textContent = t('去哪採到這張圖（採集 Lv.{lv}，{n} 處）', { lv: lv, n: pts.length });
        var note = document.createElement('p'); note.className = 'tre-gather__note codex-small';
        /* ⚠️ 文案不寫「解包」這種內部術語（Owner 2026-08-16），但**誠實性不能一起丟掉**：
           「不保證每個點都會出」就是「這是依等級推導、不是官方逐點保證」的玩家語言版。 */
        note.textContent = t('符合這張圖採集等級的採集點（不保證每個點都會出）；點地區看點位。');
        var list = document.createElement('div'); list.className = 'tre-gather__zones';
        mids.forEach(function (mid) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'tre-gather__zone codex-small';
          b.textContent = t('{zone}（{n}）', { zone: t((d.maps[mid] || {}).zone), n: byMap[mid].length });
          b.addEventListener('click', function () { openMap(lv, mid, byMap[mid]); });
          list.appendChild(b);
        });
        box.appendChild(h); box.appendChild(note); box.appendChild(list); box.hidden = false;
      }, function () { /* 非核心資料：載不到就不顯示這塊，不擋選地圖 */ });
    }

    return { render: render };
  }

  window.TreasureGatherMap = { create: create };
})();
