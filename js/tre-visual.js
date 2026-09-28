/* 唯一圖示產生點：只讀 gen-site-icons 從 portal 正典挑出的可信 path。 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function icon(name) {
    var source = window.TreasureIcons && window.TreasureIcons[name];
    if (!source) throw new Error('缺少正典圖示：' + name);
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'codex-ico'); svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var paths = source.match(/<path\s+[^>]*\/>/g) || [];
    paths.forEach(function (markup) {
      var path = document.createElementNS(NS, 'path');
      var d = markup.match(/\bd="([^"]+)"/), opacity = markup.match(/\bopacity="([^"]+)"/);
      if (d) path.setAttribute('d', d[1]);
      if (opacity) path.setAttribute('opacity', opacity[1]);
      svg.appendChild(path);
    });
    return svg;
  }
  function button(label, name, variant) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'codex-btn codex-btn--' + (variant || 'ghost');
    b.appendChild(icon(name));
    var s = document.createElement('span'); s.textContent = label; b.appendChild(s);
    return b;
  }
  window.TreasureVisual = { icon: icon, button: button };
})();
