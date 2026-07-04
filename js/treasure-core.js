/*
 * treasure-core.js — 藏寶圖工具演算法核心（座標換算 + 路線優化）
 * 純函式、無 DOM 依賴：瀏覽器掛 window.TreasureCore，node 走 module.exports（測試用）。
 *
 * 來源 / 鐵則（global §5）：
 * - 座標公式 = FFXIV 官方 datamining MapCoordinates 標準：percent = (coord-1)*SizeFactor/40.96。
 * - 路線優化演算法移植自 cycleapple/xiv-tc-treasure-finder（route-optimizer.js）：
 *   map-grouped greedy 最近鄰 + optional 2-opt；優化歐氏遊戲座標距離（傳送點僅顯示、不計成本）。
 * - 藏寶點 / 地圖 SizeFactor 資料源 = Teamcraft（見 D:/FFXIVProject/FFXIV_API.md #11 maps.json）。
 * 移植後以 tests/core.test.mjs 釘 golden 值；另一次性對 reference 跑 parity check 確認行為一致（鐵則 5）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TreasureCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 座標換算 ──────────────────────────────────────────────
  function clampPct(v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }

  // 遊戲座標 → 地圖圖上百分比（0-100），marker 定位用。
  function coordsToPercent(coords, sizeFactor) {
    var sf = sizeFactor || 100;
    return {
      x: clampPct((coords.x - 1) * sf / 40.96),
      y: clampPct((coords.y - 1) * sf / 40.96),
    };
  }

  // Teamcraft 風格裁切卡：平移 2048px 全圖使目標點落在卡片中心（pin 釘卡片中心），回傳 inline left/top px。
  // pixel = (coord-1)*SF/2（→2048px 空間）；扁平 DOM（map 直接放卡內），中心 = 卡片邊/2。
  // 註：reference 用 90% 巢狀容器(*0.9)，我們用扁平等效（pin 一樣正落在點上、DOM 更簡單）。
  function calcCardOffset(coords, sizeFactor, cardW, cardH) {
    var sf = sizeFactor || 100;
    return {
      x: (cardW / 2) - ((coords.x - 1) * sf / 2),
      y: (cardH / 2) - ((coords.y - 1) * sf / 2),
    };
  }

  // ── 路線優化（faithful port of reference route-optimizer.js）──────────
  function calcDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }
  function groupByMap(treasures) {
    return treasures.reduce(function (g, t) {
      (g[t.mapId] = g[t.mapId] || []).push(t);
      return g;
    }, {});
  }
  function calcCenter(treasures) {
    if (!treasures.length) return { x: 20, y: 20 };
    var s = treasures.reduce(function (a, t) {
      return { x: a.x + t.coords.x, y: a.y + t.coords.y };
    }, { x: 0, y: 0 });
    return { x: s.x / treasures.length, y: s.y / treasures.length };
  }
  // 地圖內最近鄰：startCoords 給定 → 起點選離它最近者，否則 index 0。
  function sortWithinMap(treasures, startCoords) {
    if (treasures.length <= 1) return treasures.slice();
    var result = [], remaining = treasures.slice(), currentIdx = 0;
    if (startCoords) {
      var minD = Infinity;
      remaining.forEach(function (t, i) {
        var d = calcDistance(startCoords, t.coords);
        if (d < minD) { minD = d; currentIdx = i; }
      });
    }
    while (remaining.length) {
      var current = remaining.splice(currentIdx, 1)[0];
      result.push(current);
      if (!remaining.length) break;
      var nearest = 0, md = Infinity;
      remaining.forEach(function (t, i) {
        var d = calcDistance(current.coords, t.coords);
        if (d < md) { md = d; nearest = i; }
      });
      currentIdx = nearest;
    }
    return result;
  }
  // 地圖間：從點最多的圖開始，依 centroid 最近鄰跳。
  function sortMaps(mapGroups) {
    var ids = Object.keys(mapGroups).map(Number);
    if (ids.length <= 1) return ids;
    var result = [], remaining = new Set(ids);
    var current = ids.reduce(function (mx, id) {
      return mapGroups[id].length > mapGroups[mx].length ? id : mx;
    }, ids[0]);
    while (remaining.size) {
      result.push(current);
      remaining.delete(current);
      if (!remaining.size) break;
      var cc = calcCenter(mapGroups[current]), nearest = null, md = Infinity;
      remaining.forEach(function (id) {
        var d = calcDistance(cc, calcCenter(mapGroups[id]));
        if (d < md) { md = d; nearest = id; }
      });
      current = nearest;
    }
    return result;
  }
  // ⚠ 移植自 reference 的 2-opt 用 (k+1)%length 環狀 wrap（閉環 TSP 假設）。本工具路線是**開放路徑**
  //   （calcTotalDistance 只累加 n-1 段、不回起點）→ k=末端時的「回起點」幻邊會混進增益判準，
  //   可能接受讓開放路徑變長的翻轉。目前 use2Opt 預設 false、無產品呼叫者（dormant）。
  //   啟用前須先修：k=last 時略過尾端幻邊（僅比較 d1 vs d3）。tests/core.test.mjs 有 golden 釘當前行為。
  function improve2Opt(treasures, maxIterations) {
    maxIterations = maxIterations || 50;
    if (treasures.length <= 3) return treasures.slice();
    var route = treasures.slice(), improved = true, iter = 0;
    while (improved && iter < maxIterations) {
      improved = false; iter++;
      for (var i = 0; i < route.length - 2; i++) {
        for (var k = i + 2; k < route.length; k++) {
          var d1 = calcDistance(route[i].coords, route[i + 1].coords);
          var d2 = calcDistance(route[k].coords, route[(k + 1) % route.length].coords);
          var d3 = calcDistance(route[i].coords, route[k].coords);
          var d4 = calcDistance(route[i + 1].coords, route[(k + 1) % route.length].coords);
          if (d3 + d4 < d1 + d2) {
            var reversed = route.slice(i + 1, k + 1).reverse();
            route = route.slice(0, i + 1).concat(reversed, route.slice(k + 1));
            improved = true;
          }
        }
      }
    }
    return route;
  }
  function calcTotalDistance(treasures) {
    if (treasures.length <= 1) return 0;
    var total = 0;
    for (var i = 0; i < treasures.length - 1; i++) total += calcDistance(treasures[i].coords, treasures[i + 1].coords);
    return total;
  }
  // 主優化：預設 map 分組 + greedy NN；use2Opt 預設關（與 reference 一致）。
  function optimize(treasures, options) {
    options = options || {};
    var useMapGrouping = options.useMapGrouping !== false;  // 預設 true
    var use2Opt = options.use2Opt === true;                 // 預設 false
    if (!treasures || treasures.length <= 1) return treasures ? treasures.slice() : [];
    var result;
    if (useMapGrouping) {
      var groups = groupByMap(treasures);
      var order = sortMaps(groups);
      result = []; var lastCoords = null;
      order.forEach(function (mapId) {
        var sorted = sortWithinMap(groups[mapId], lastCoords);
        result.push.apply(result, sorted);
        if (sorted.length) lastCoords = sorted[sorted.length - 1].coords;
      });
    } else {
      result = sortWithinMap(treasures);
    }
    if (use2Opt) result = improve2Opt(result);
    return result;
  }
  function analyzeRoute(treasures) {
    if (!treasures || !treasures.length) return { totalDistance: 0, mapCount: 0, mapJumps: 0 };
    var maps = new Set(treasures.map(function (t) { return t.mapId; })), jumps = 0;
    for (var i = 1; i < treasures.length; i++) if (treasures[i].mapId !== treasures[i - 1].mapId) jumps++;
    return { totalDistance: calcTotalDistance(treasures), mapCount: maps.size, mapJumps: jumps };
  }

  return {
    coordsToPercent: coordsToPercent,
    calcCardOffset: calcCardOffset,
    optimize: optimize,
    analyzeRoute: analyzeRoute,
    groupByMap: groupByMap,
    sortWithinMap: sortWithinMap,
    sortMaps: sortMaps,
    improve2Opt: improve2Opt,
    calcDistance: calcDistance,
    calcTotalDistance: calcTotalDistance,
  };
});
