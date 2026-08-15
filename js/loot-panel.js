/* loot-panel.js — 「這張圖可能開出」區塊（唯一職責：掉落清單渲染 ＋ 查價連結）。
 *
 * 資料＝data/loot.json（**延後載入**，選了等級才抓），兩種來源語意不同、分開呈現：
 *   · dungeons：**藏寶迷宮**（傳送門後的副本）寶箱——本地解包 DungeonChest／DungeonChestItem，
 *     含掉落機率與數量區間。這是玩家問「G17 的地牢有什麼」時要的東西。
 *   · loot：**藏寶圖本身挖出的箱子**——Teamcraft loot-sources（社群整理，已知不完整）。
 * 兩者不可混成一份清單：機率欄只有前者有，混在一起會讓後者看起來也是「已知機率」。
 *
 * 每個物品連到 marketboard 查價（跨工具 deep link 慣例＝ #/item/{id}，見 marketboard modules/deep_links.js）。
 * 全程 createElement/textContent（無 innerHTML，CSP friendly）。 */
(function () {
  'use strict';
  function t(k, p) { return window.FFXIVI18n.t(k, p); }

  // 查價：marketboard 的 hash 路由（該站 modules/*.js 內部連結用的就是這個形狀）
  var MARKET = 'https://market.xivtc.com/#/item/';

  function create(deps) {
    var el = deps.el;
    var DATA = null, req = null, token = null;

    function load() {
      if (DATA) return Promise.resolve(DATA);
      if (!req) req = fetch('data/loot.json').then(function (r) { return r.json(); })
        .then(function (j) { DATA = { loot: j.loot || {}, dungeons: j.dungeons || {} }; return DATA; });
      return req;
    }

    /* 一顆物品 chip＝查價連結。⚠️ 外連一律 rel="noopener"（新分頁拿得到 window.opener 就能改我們這頁）。 */
    function itemChip(it, withRate) {
      var a = document.createElement('a');
      a.className = 'tre-loot__item codex-small';
      a.href = MARKET + it.id;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.title = t('在市場板查價：{name}', { name: t(it.name) });
      var nm = document.createElement('span'); nm.textContent = t(it.name); a.appendChild(nm);
      if (withRate) {
        // 數量區間與機率是解包原值（Min/Max/Probability），不是估算
        var meta = document.createElement('span'); meta.className = 'tre-loot__rate';
        var qty = it.min === it.max ? '×' + it.min : '×' + it.min + '–' + it.max;
        meta.textContent = qty + '  ' + it.p + '%';
        a.appendChild(meta);
      }
      return a;
    }

    function section(title, note, items, withRate) {
      var wrap = document.createElement('div'); wrap.className = 'tre-loot__section';
      var h = document.createElement('h4'); h.className = 'tre-loot__subtitle codex-body'; h.textContent = title;
      wrap.appendChild(h);
      if (note) { var p = document.createElement('p'); p.className = 'tre-loot__note codex-small'; p.textContent = note; wrap.appendChild(p); }
      var list = document.createElement('div'); list.className = 'tre-loot__items';
      items.forEach(function (it) { list.appendChild(itemChip(it, withRate)); });
      wrap.appendChild(list);
      return wrap;
    }

    function render(grade) {
      var box = el['loot-box']; if (!box) return;
      box.textContent = ''; box.hidden = true;
      token = grade && grade.itemId;
      var mine = token;
      load().then(function (d) {
        if (token !== mine) return;   // 換等級了 → 丟掉過期回應
        var dungeons = d.dungeons[String(mine)] || [];
        var chest = d.loot[String(mine)] || [];
        if (!dungeons.length && !chest.length) return;
        var h = document.createElement('h3'); h.className = 'codex-h3 tre-loot__title';
        h.textContent = t('這張圖可能開出');
        box.appendChild(h);
        dungeons.forEach(function (dg) {
          // hidden＝台服解包還沒有官方名的品項。**必須講出來**：只是默默少列的話，
          // 清單看起來完整卻少了一半，而畫面上沒有任何訊號（天坑目前 18 顯示 / 17 未收錄）。
          // ⚠️ 面向玩家的文案不寫「解包」這種內部術語（Owner 2026-08-16）——只講他要知道的事
          var note = t('挖到傳送門後進入的藏寶迷宮，寶箱可能開出（含掉落機率與數量）。');
          if (dg.hidden) note += t('另有 {n} 項台服尚未收錄中文名稱，暫不顯示。', { n: dg.hidden });
          box.appendChild(section(t('🏛 {name}（{n} 項）', { name: t(dg.name), n: dg.items.length }),
                                  note, dg.items, true));
        });
        if (chest.length) {
          box.appendChild(section(t('📦 挖出的寶箱（已知 {n} 項）', { n: chest.length }),
                                  t('挖掘點寶箱的掉落，由玩家社群整理，可能不完整。'),
                                  chest, false));
        }
        var tip = document.createElement('p'); tip.className = 'tre-loot__note codex-small';
        tip.textContent = t('點物品可到市場板查價。');
        box.appendChild(tip);
        box.hidden = false;
      }, function () { /* 非核心資料：載不到就不顯示這塊，不擋選地圖 */ });
    }

    return { render: render };
  }

  window.TreasureLootPanel = { create: create };
})();
