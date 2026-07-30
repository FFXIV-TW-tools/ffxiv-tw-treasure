/* route-map.js — 唯一職責：把「一個地圖區的共享路線」畫成一張帶順序的地圖（純渲染器）。
 * 對外 window.TreasureRouteMap.render(opts) → element；不碰房間狀態/資料載入（呼叫端算好百分比座標傳入）。
 * 順序線用 SVG（viewBox 0..100 對應百分比座標），標記沿用 step3 全圖的 .tre-fullmap__marker 視覺語彙。
 * 全程 createElement/createElementNS + textContent（無 innerHTML，CSP friendly）。 */
(function () {
  'use strict';
  var SVG_NS = 'http://www.w3.org/2000/svg';

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

    // 傳送水晶（先畫→墊在挖掘點標記下層）：讓人看得出這區該傳哪一顆過去。無名稱（無台服正名權威源）。
    (opts.aetherytes || []).forEach(function (a) {
      var s = document.createElement('span'); s.className = 'tre-routemap__aeth'; s.setAttribute('aria-hidden', 'true');
      s.style.left = a.x + '%'; s.style.top = a.y + '%';
      s.title = '傳送水晶';
      wrap.appendChild(s);
    });

    pts.forEach(function (p, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'tre-fullmap__marker' + (p.done ? ' is-done' : '') + (p.mine ? ' is-mine' : '');
      b.style.left = p.pct.x + '%'; b.style.top = p.pct.y + '%';
      b.textContent = p.label;
      b.setAttribute('aria-label', '第 ' + p.label + ' 點' + (p.done ? '（已完成）' : '') + '，放大檢視');
      if (opts.onPick) b.addEventListener('click', function () { opts.onPick(i); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  window.TreasureRouteMap = { render: render };
})();
