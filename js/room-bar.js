/* 房間卡只負責狀態呈現與房號／名稱操作；協定與持久化仍由 room.js 負責。 */
(function () {
  'use strict';
  function t(k, p) { return window.FFXIVI18n.t(k, p); }
  function create(deps) {
    var ROOM = deps.ROOM, bar = deps.el, visual = window.TreasureVisual;
    /**
     * @param {string} label
     * @param {string} icon
     * @param {() => void} callback
     * @param {string} variant
     * @param {string} track
     * @param {string} trackLabel
     * @returns {HTMLButtonElement}
     */
    function button(label, icon, callback, variant, track, trackLabel) {
      var b = visual.button(label, icon, variant);
      b.setAttribute('data-track', track); b.setAttribute('data-track-label', trackLabel);
      b.addEventListener('click', callback); return b;
    }
    function copy(value, success) {
      deps.copyText(value).then(function (ok) { deps.toast(ok ? success : t('複製失敗'), ok ? 'ok' : 'error'); });
    }
    function nameGroup() {
      var group = document.createElement('span'); group.className = 'codex-toolbar__group tre-roombar__name';
      var label = document.createElement('label'); label.className = 'codex-toolbar__label'; label.htmlFor = 'tre-room-name'; label.textContent = t('我的名稱');
      var input = document.createElement('input'); input.id = 'tre-room-name'; input.type = 'text'; input.className = 'codex-input tre-name-input';
      input.maxLength = 24; input.value = ROOM.customName(); input.placeholder = ROOM.ownerName();
      input.setAttribute('aria-describedby', 'tre-name-hint');
      input.addEventListener('change', function () {
        var before = input.value;
        if (!ROOM.setName(input.value)) { deps.toast(t('名稱未能儲存（設定服務未載入）'), 'error'); return; }
        input.value = ROOM.customName(); input.placeholder = ROOM.ownerName();
        if (input.value) deps.toast(t('顯示名稱已改為「{name}」（之後加的點生效）', { name: input.value }), 'ok');
        else if (before.trim()) deps.toast(t('名稱已清空，改回預設「{name}」', { name: ROOM.ownerName() }), 'ok');
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
      group.appendChild(label); group.appendChild(input); return group;
    }
    function render() {
      if (!bar) return;
      if (!ROOM) { bar.hidden = true; return; }
      var active = document.activeElement;
      var keepName = active && active.classList && active.classList.contains('tre-name-input')
        ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
      var keepJoin = active && active.id === 'tre-room-code' ? { value: active.value, start: active.selectionStart } : null;
      var expanded = bar.querySelector('details[open]') !== null;
      bar.hidden = false; bar.textContent = '';
      var hud = document.createElement('span'); hud.className = 'codex-hud'; hud.setAttribute('aria-hidden', 'true'); bar.appendChild(hud);
      var head = document.createElement('div'); head.className = 'tre-roombar__head';
      var h = document.createElement('h2'); h.className = 'codex-h3 codex-h3--section';
      if (ROOM.isInRoom()) {
        h.appendChild(document.createTextNode(t('房間') + ' '));
        var code = ROOM.getCode();
        var codeBtn = document.createElement('button'); codeBtn.type = 'button'; codeBtn.className = 'codex-chip tre-roombar__code'; codeBtn.textContent = code;
        codeBtn.setAttribute('aria-label', t('複製房號 {code}', { code: code }));
        codeBtn.setAttribute('data-track', 'copy-room-code'); codeBtn.setAttribute('data-track-label', '複製房號');
        codeBtn.addEventListener('click', function () { copy(code, t('已複製房號')); }); h.appendChild(codeBtn);
        var online = document.createElement('span'); online.className = 'tre-roombar__online';
        var dot = document.createElement('span'); dot.className = 'codex-status-dot codex-status-dot--' + (ROOM.isConnected() ? 'live' : 'warn'); dot.setAttribute('aria-hidden', 'true');
        online.appendChild(dot); online.appendChild(document.createTextNode(ROOM.isConnected()
          ? t('{n} 人在線', { n: deps.getShared().online || 1 }) : t('重新連線中'))); head.appendChild(online);
      } else {
        h.textContent = t('多人挖寶');
      }
      head.insertBefore(h, head.firstChild); bar.appendChild(head);
      if (!ROOM.isInRoom()) {
        var desc = document.createElement('p'); desc.className = 'codex-body tre-roombar__intro'; desc.textContent = t('建立房間，和隊友即時整理挖掘路線。'); bar.appendChild(desc);
      }
      var toolbar = document.createElement('div'); toolbar.className = 'codex-toolbar tre-roombar__toolbar'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', t('房間操作'));
      if (ROOM.isInRoom()) {
        toolbar.appendChild(button(t('複製邀請'), 'link', function () {
          copy(t('一起挖寶吧！房號：{code}', { code: ROOM.getCode() }) + '\n' + t('加入連結：{url}', { url: ROOM.inviteUrl() }), t('已複製邀請連結'));
        }, 'ghost', 'copy-invite', '複製邀請'));
        if (ROOM.canSetName()) toolbar.appendChild(nameGroup());
        toolbar.appendChild(button(t('離開'), 'sign-out', function () { ROOM.leave(); }, 'ghost', 'leave-room', '離開房間'));
        bar.appendChild(toolbar);
        if (ROOM.canSetName()) {
          var hint = document.createElement('p'); hint.id = 'tre-name-hint'; hint.className = 'codex-small tre-roombar__hint'; hint.textContent = t('改名只影響之後加入的點'); bar.appendChild(hint);
        }
      } else {
        toolbar.appendChild(button(t('建立房間'), 'plus', function () {
          ROOM.create().then(function (code) { deps.toast(t('房間已建立：{code}（把房號或邀請連結給隊友）', { code: code }), 'ok'); })
            .catch(function () { deps.toast(t('建立失敗（後端未連上）'), 'error'); });
        }, 'primary', 'create-room', '建立房間'));
        var details = document.createElement('details'); details.className = 'codex-accordion tre-roombar__join'; details.open = expanded;
        var summary = document.createElement('summary'); summary.textContent = t('加入房間'); details.appendChild(summary);
        var body = document.createElement('div'); body.className = 'codex-accordion__body';
        var label = document.createElement('label'); label.htmlFor = 'tre-room-code'; label.textContent = t('朋友的房號'); body.appendChild(label);
        var fields = document.createElement('div'); fields.className = 'tre-roombar__fields';
        var input = document.createElement('input'); input.id = 'tre-room-code'; input.type = 'text'; input.className = 'codex-input tre-room-input'; input.maxLength = 6;
        input.setAttribute('autocomplete', 'off'); input.setAttribute('aria-describedby', 'tre-room-error'); fields.appendChild(input);
        var join = document.createElement('button'); join.type = 'button'; join.className = 'codex-btn codex-btn--ghost'; join.textContent = t('加入'); fields.appendChild(join);
        join.setAttribute('data-track', 'join-room'); join.setAttribute('data-track-label', '加入房間');
        var error = document.createElement('span'); error.id = 'tre-room-error'; error.className = 'tre-roombar__error codex-small'; error.textContent = t('請輸入 6 碼房號'); error.hidden = true;
        function update() { input.value = input.value.toUpperCase(); join.setAttribute('aria-disabled', input.value.length !== 6 ? 'true' : 'false'); }
        function doJoin() {
          if (input.value.length !== 6 || !ROOM.join(input.value)) { error.hidden = false; input.setAttribute('aria-invalid', 'true'); return; }
          error.hidden = true; input.removeAttribute('aria-invalid');
        }
        input.addEventListener('input', function () { update(); if (input.value.length === 6) { error.hidden = true; input.removeAttribute('aria-invalid'); } });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            var usage = /** @type {{ XivUsage?: { track: (name: string) => void } }} */ (window).XivUsage;
            usage && usage.track('join-room');
            doJoin();
          }
        }); join.addEventListener('click', doJoin);
        body.appendChild(fields); body.appendChild(error);
        var history = ROOM.history();
        if (history.length) {
          var recent = document.createElement('div'); recent.className = 'tre-roombar__history';
          var title = document.createElement('span'); title.textContent = t('最近房號'); recent.appendChild(title);
          history.forEach(function (code) {
            var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'codex-chip'; chip.textContent = code;
            chip.setAttribute('data-track', 'join-room'); chip.setAttribute('data-track-label', '加入房間');
            chip.addEventListener('click', function () { ROOM.join(code); }); recent.appendChild(chip);
          });
          body.appendChild(recent);
        }
        details.appendChild(body); toolbar.appendChild(details); bar.appendChild(toolbar);
        if (keepJoin) { details.open = true; input.value = keepJoin.value; input.focus(); input.setSelectionRange(keepJoin.start, keepJoin.start); }
        update();
      }
      if (keepName) {
        var back = bar.querySelector('.tre-name-input');
        if (back) { back.value = keepName.value; back.focus(); back.setSelectionRange(keepName.start, keepName.end); }
      }
    }
    return { render: render };
  }
  window.TreasureRoomBar = { create: create };
})();
