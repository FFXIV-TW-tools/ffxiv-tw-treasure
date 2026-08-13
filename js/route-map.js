/* route-map.js — 唯一職責：把「一個地圖區的共享路線」畫成一張帶順序的地圖（純渲染器）。
 * 對外 window.TreasureRouteMap.render(opts) → element；不碰房間狀態/資料載入（呼叫端算好百分比座標傳入）。
 * 順序線用 SVG（viewBox 0..100 對應百分比座標），標記沿用 step3 全圖的 .tre-fullmap__marker 視覺語彙。
 * 全程 createElement/createElementNS + textContent（無 innerHTML，CSP friendly）。 */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  // i18n：shim 保證 window.FFXIVI18n 一定在（index.html 的 inline shim 早於本檔），
  // 取不到翻譯時 t() 回傳原文 ⇒ 繁中路徑逐字不變。
  function t(k, p) { return window.FFXIVI18n.t(k, p); }

  // 主水晶圖示 060453（xivapi），與 marketboard modules/map_view.js 同一組圖示與尺寸——DRY，
  // 且該檔已記教訓「不用 emoji：在米色地圖上幾乎看不到」。只畫主水晶（資料端已濾掉以太之光）。
  function aethIcon(a) {
    var img = document.createElement('img');
    img.className = 'tre-routemap__aeth';
    img.src = 'https://xivapi.com/i/060000/060453.png';
    img.width = 22; img.height = 22; img.loading = 'lazy'; img.alt = '';
    img.title = t('主水晶（傳送點）');
    img.style.left = a.x + '%'; img.style.top = a.y + '%';
    return img;
  }

  // opts: {image, points:[{pct:{x,y}, label, done, mine}], aetherytes:[{x,y}(百分比)], onPick(i)}
  function render(opts) {
    opts = opts || {};
    var pts = opts.points || [];
    var wrap = document.createElement('div'); wrap.className = 'tre-routemap';
    if (opts.image) wrap.style.backgroundImage = 'url("' + opts.image + '")';

    if (pts.length > 1) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'tre-routemap__lines');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      var line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', pts.map(function (p) { return p.pct.x + ',' + p.pct.y; }).join(' '));
      svg.appendChild(line); wrap.appendChild(svg);
    }

    // 傳送點（先畫→墊在挖掘點標記下層）：看得出這區該傳哪一顆過去。
    (opts.aetherytes || []).forEach(function (a) { wrap.appendChild(aethIcon(a)); });

    pts.forEach(function (p, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'tre-fullmap__marker' + (p.done ? ' is-done' : '') + (p.mine ? ' is-mine' : '');
      b.style.left = p.pct.x + '%'; b.style.top = p.pct.y + '%';
      b.textContent = p.label;
      // ⚠️ 整句一條 key，不要拆成「第 」＋數字＋「 點」——那種串接在英日文的語序下組不回通順句子。
      b.setAttribute('aria-label', p.done ? t('第 {n} 點（已完成），放大檢視', { n: p.label })
                                          : t('第 {n} 點，放大檢視', { n: p.label }));
      if (opts.onPick) b.addEventListener('click', function () { opts.onPick(i); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  window.TreasureRouteMap = { render: render, aethIcon: aethIcon };
})();
