/* app-modal.js — 本工具的對話框元件（唯一職責：依 portal codex-modal 設計系統開/關 modal）。
 * 對外 window.TreasureModal：confirm（取代原生 confirm，回 Promise<boolean>）+ mapView（挖掘點放大檢視）。
 * 全程 createElement/textContent（無 innerHTML，CSP friendly）；焦點鎖/還原走 window.FFXIVA11y.trapFocus（fallback no-op）。
 * 設計系統要求：ESC + overlay 點擊關閉（見 _DESIGN-SYSTEM §codex-modal）。 */
(function () {
  'use strict';

  // modal 外殼：建 overlay/標題/關閉鈕 + 綁 ESC/overlay 關閉；body 內容由呼叫端 build(bodyEl) 填。
  // onClose(val) 只會被呼叫一次（done 旗標）。回傳 { close, modal, footer }。
  function shell(opts, onClose) {
    var overlay = document.createElement('div'); overlay.className = 'codex-modal-overlay';
    var modal = document.createElement('div'); modal.className = 'codex-modal'; modal.style.maxWidth = opts.maxWidth || '440px';
    modal.setAttribute('role', opts.role || 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', opts.titleId);
    var head = document.createElement('div'); head.className = 'codex-modal__header';
    var h = document.createElement('h3'); h.className = 'codex-h3'; h.id = opts.titleId; h.style.margin = '0'; h.textContent = opts.title || '';
    var x = document.createElement('button'); x.type = 'button'; x.className = 'codex-modal__close'; x.textContent = '×'; x.setAttribute('aria-label', '關閉');
    head.appendChild(h); head.appendChild(x);
    var body = document.createElement('div'); body.className = 'codex-modal__body';
    var foot = document.createElement('div'); foot.className = 'codex-modal__footer';
    modal.appendChild(head); modal.appendChild(body); modal.appendChild(foot);
    overlay.appendChild(modal); document.body.appendChild(overlay);
    opts.build(body);

    var release = null, done = false;
    function close(val) {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      if (release) release();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      onClose(val);
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(opts.escValue); } }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(opts.escValue); });
    x.addEventListener('click', function () { close(opts.escValue); });
    return { close: close, modal: modal, footer: foot, setFocusTrap: function (initial) {
      release = (window.FFXIVA11y && FFXIVA11y.trapFocus) ? FFXIVA11y.trapFocus(modal, { initial: initial }) : null;
    } };
  }

  // 確認框（破壞性操作用）。回 Promise<boolean>；ESC / overlay / × / 取消 皆為 false。
  function confirmModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'codex-btn codex-btn--ghost'; cancel.textContent = opts.cancelText || '取消';
      var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'codex-btn codex-btn--' + (opts.danger ? 'danger' : 'primary'); ok.textContent = opts.confirmText || '確定';
      var s = shell({
        title: opts.title || '確認', titleId: 'tre-confirm-title', role: 'alertdialog', escValue: false,
        build: function (body) {
          var p = document.createElement('p'); p.className = 'codex-body'; p.style.margin = '0'; p.textContent = opts.message || '';
          body.appendChild(p);
        },
      }, resolve);
      s.footer.appendChild(cancel); s.footer.appendChild(ok);
      s.setFocusTrap(ok);
      cancel.addEventListener('click', function () { s.close(false); });
      ok.addEventListener('click', function () { s.close(true); });
    });
  }

  // 挖掘點放大檢視：整張地圖 + 該區所有點的編號標記（共享路線縮圖太小看不出位置 → 點縮圖開這個）。
  // 標記沿用 step3 全圖的 .tre-fullmap__marker 樣式（同一套視覺語彙），被點的那顆 is-active 放大。
  // opts: {title, image, markers:[{pct:{x,y}, label, active}], aetherytes:[{x,y}(百分比)], coordText, onCopy}
  function mapView(opts) {
    opts = opts || {};
    var closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'codex-btn codex-btn--ghost'; closeBtn.textContent = '關閉';
    var s = shell({
      title: opts.title || '挖掘點', titleId: 'tre-mapview-title', maxWidth: 'min(92vw, 720px)', escValue: undefined,
      build: function (body) {
        var wrap = document.createElement('div'); wrap.className = 'tre-mapview';
        if (opts.image) {
          wrap.style.backgroundImage = 'url("' + opts.image + '")';
          // 傳送點圖示與區域大圖共用同一產生器（route-map.js），不在此另寫一份
          if (window.TreasureRouteMap && TreasureRouteMap.aethIcon) {
            (opts.aetherytes || []).forEach(function (a) { wrap.appendChild(TreasureRouteMap.aethIcon(a)); });
          }
          (opts.markers || []).forEach(function (mk) {
            var s = document.createElement('span');
            s.className = 'tre-fullmap__marker' + (mk.active ? ' is-active' : '');
            s.style.left = mk.pct.x + '%'; s.style.top = mk.pct.y + '%';
            s.textContent = mk.label; s.setAttribute('aria-hidden', 'true');
            wrap.appendChild(s);
          });
        } else {
          var na = document.createElement('p'); na.className = 'codex-body'; na.textContent = '此地圖無圖資'; wrap.appendChild(na);
        }
        body.appendChild(wrap);
        var co = document.createElement('p'); co.className = 'tre-mapview__co codex-body'; co.textContent = opts.coordText || '';
        body.appendChild(co);
      },
    }, function () {});
    if (opts.onCopy) {
      var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'codex-btn codex-btn--primary'; cp.textContent = '📋 複製座標';
      cp.addEventListener('click', opts.onCopy);
      s.footer.appendChild(cp);
    }
    s.footer.appendChild(closeBtn);
    s.setFocusTrap(closeBtn);
    closeBtn.addEventListener('click', function () { s.close(); });
  }

  window.TreasureModal = { confirm: confirmModal, mapView: mapView };
})();
