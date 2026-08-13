#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""藏寶圖工具資料生成 — 一次性 / 版本更新時跑（產出靜態 JSON 供前端載，部署後零後端、零第三方 runtime）。

來源（2026-06-22 決策）：
- 挖掘點 treasures：**Teamcraft** treasures.json（決策 #5，註明來源 Teamcraft）
- 地圖 size_factor + 貼圖 URL：本地 data/item_dict/lspl/maps.json（Teamcraft maps 鏡像，map-id keyed）
- 地區繁中名：本地 data/item_dict/place_names.json（**map-id keyed** — 已驗）
- 物品繁中名：本地 data/item_dict/item_lookup.sqlite items.**name_tc**（＝台服 client 解包原文，與 datamining_tc/tc_Item.csv 逐字相同）。**零轉換**——2026-08-13 更正，見下方長註解
- 等級分級（Gxx / 綠圖 社群慣例 itemId↔grade）：GRADE_CATALOG（事實對照，繁中名仍從 sqlite 生）

DRY 鐵則：所有繁中名走本地權威源，禁自建對照表。
跨機：monorepo 根用 env FFXIV_PROJECT_ROOT，預設 C:/FFXIVProject（對齊 .claude/rules/cross-machine-paths.md）。

用法：python tools/build-data.py  → 寫 data/{grades,maps,treasures}.json + 印涵蓋率報告（有缺即 exit 1）。
"""
import json
import os
import sqlite3
import sys
import urllib.request

# Windows console 常是 cp950 → ✓/中文輸出會炸；強制 utf-8。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ⚠️ 2026-08-13 更正（Owner 裁示：「一律使用解包名稱，不要使用機器翻譯；若是機器翻譯要特別註明」）
#
# 本檔原本走 `s2twp(name_sc)`，理由寫的是「name_tc 對藏寶圖物品是通用『地圖Gxx』(錯)」。
# **那個前提是錯的**——逐筆對台服 client 解包核對後：
#   · `item_lookup.name_tc` 與 `datamining_tc/tc_Item.csv` **逐字相同**（43557 → 陳舊的地圖G17）
#   · 日服官方也是同樣的編號式命名（`ja_Item` 43557 → 古ぼけた地図G17）
#   · **只有英文**用生物皮名（`en_Item` → Timeworn Br'aaxskin Map）
#   · 而且台服命名並不統一：G18(46185) 的 name_tc 就是「陳舊的卡岡圖亞革地圖」＝有正式皮名
#   ⇒「地圖Gxx」不是佔位符，是台服客戶端真正的名字。原本顯示的皮名是**国服名經 OpenCC
#      簡→繁轉出來的**，台服 client 裡並不存在 ⇒ 玩家拿站上的名字回遊戲內搜尋會找不到。
#      這同時直踩 monorepo 鐵則「禁 OpenCC 机转（產国服譯名）／查證源＝台服解包」。
# ⇒ 改用 `name_tc`，並移除 opencc 相依（本檔不再有任何機器轉換）。
#    若日後真要顯示国服／社群慣用的皮名，那是**第二個欄位**且必須在畫面上註明來源，
#    不得再讓它冒充繁中官方名。

ROOT = os.environ.get('FFXIV_PROJECT_ROOT', 'C:/FFXIVProject')
DICT = os.path.join(ROOT, 'data', 'item_dict')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'data'))
CACHE = os.path.join(OUT, '_teamcraft-treasures.json')
TEAMCRAFT_URL = ('https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/'
                 'staging/libs/data/src/lib/json/treasures.json')

# 社群分級（高→低）：itemId → (grade 標籤, 版本)。繁中名不寫這裡，從 item_lookup 生成。
# G18/46185 暫不列。⚠️ 2026-08-13 複核：原因寫的是「繁中名未進 item_lookup」，**現在已經進了**
# （name_tc =「陳舊的卡岡圖亞革地圖」）⇒ 這條理由已失效。要不要補 G18 是**內容決策**（還需確認
# Teamcraft 是否有它的點位），不在本次「正名」範圍內，留給 Owner。
GRADE_CATALOG = [
    (43557, 'G17', '7.0'), (43556, 'G16', '7.0'),
    (39591, 'G15', '6.3'), (36612, 'G14', '6.0'), (36611, 'G13', '6.0'),
    (26745, 'G12', '5.0'), (26744, 'G11', '5.0'),
    (19770, '綠圖', '4.05'), (17836, 'G10', '4.0'), (17835, 'G9', '4.0'),
    (12243, 'G8', '3.0'), (12242, 'G7', '3.0'), (12241, 'G6', '3.0'),
]
GRADE_ITEMIDS = {iid for iid, _, _ in GRADE_CATALOG}


def fetch_treasures():
    """抓 Teamcraft treasures.json（快取到 data/_teamcraft-treasures.json）。"""
    try:
        req = urllib.request.Request(TEAMCRAFT_URL, headers={'User-Agent': 'ffxiv-tw-treasure/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode('utf-8'))
        with open(CACHE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        print(f'✓ Teamcraft treasures.json 抓取 {len(data)} 點（快取 {CACHE}）')
        return data
    except Exception as e:  # noqa: BLE001 — build 腳本，網路失敗回退快取
        if os.path.exists(CACHE):
            print(f'⚠ 抓取失敗（{e}），用快取 {CACHE}')
            with open(CACHE, encoding='utf-8') as f:
                return json.load(f)
        print(f'✗ 抓取失敗且無快取：{e}', file=sys.stderr)
        sys.exit(1)


def load_local():
    with open(os.path.join(DICT, 'place_names.json'), encoding='utf-8') as f:
        places = json.load(f)            # map-id(str) -> {place, region}
    with open(os.path.join(DICT, 'lspl', 'maps.json'), encoding='utf-8') as f:
        maps = json.load(f)              # map-id(str) -> {placename_id, size_factor, image, ...}
    with open(os.path.join(DICT, 'lspl', 'aetherytes.json'), encoding='utf-8') as f:
        aeth = json.load(f)              # [{map, x, y, type, ...}]（與 marketboard build_gathering_nodes 同一份）
    conn = sqlite3.connect(os.path.join(DICT, 'item_lookup.sqlite'))
    rows = {iid: conn.execute('SELECT name_tc FROM items WHERE id=?', (iid,)).fetchone() for iid in GRADE_ITEMIDS}
    conn.close()
    # 繁中名 = 台服解包原文（name_tc）。**不做任何轉換**——見檔頭 2026-08-13 更正。
    names = {iid: (row[0] if row and row[0] else None) for iid, row in rows.items()}
    return places, maps, names, aeth


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = fetch_treasures()
    places, maps, names, aeth_raw = load_local()

    # 只收 GRADE_CATALOG 內的 itemId（玩家實際使用的可採集等級；舊 ARR/特殊圖點位不 surface）
    pts = [t for t in raw if t.get('item') in GRADE_ITEMIDS]
    used_maps = sorted({t['map'] for t in pts})

    gaps = []

    # grades.json
    grades = []
    for iid, grade, exp in GRADE_CATALOG:
        name = names.get(iid)
        if not name:
            gaps.append(f'grade {grade}(item {iid}) 無繁中名')
        psize = next((t.get('partySize') for t in pts if t['item'] == iid), None)
        grades.append({'grade': grade, 'itemId': iid, 'name': name,
                       'partySize': psize, 'expansion': exp,
                       'special': grade == '綠圖'})

    # maps.json（enriched：繁中地名 + size_factor + 貼圖 URL）
    out_maps = {}
    for mid in used_maps:
        sk = str(mid)
        zone = places.get(sk, {}).get('place')
        region = places.get(sk, {}).get('region')
        me = maps.get(sk, {})
        sf = me.get('size_factor')
        img = me.get('image')
        if not zone:
            gaps.append(f'map {mid} 無繁中地名（place_names.json 缺 key）')
        if sf is None or not img:
            gaps.append(f'map {mid} 無 size_factor/image（maps.json 缺）')
        # 可傳送大水晶（type 0）：畫在路線圖上讓人看得出該傳哪一顆；名稱不帶（無台服正名權威源，
        # 禁自創譯名 → 只給位置，見 docs/specs/2026-07-30-aetheryte-on-map-design.md）
        # 只收 type 0 主水晶（可直接傳送的目的地）。type 1 是以太之光（aethernetCoords 0,0）——
        # 區域內的出口／換圖點，不是傳送目的地，標上去只是雜訊（Owner 2026-07-30 判定）。
        # 沒有主水晶的圖（如 map 213 龍堡內陸低地）就是真的沒有，留空、不拿以太之光充數。
        aeths = [{'x': round(a['x'], 2), 'y': round(a['y'], 2)}
                 for a in aeth_raw if a.get('map') == mid and a.get('type') == 0]
        out_maps[mid] = {'id': mid, 'zone': zone, 'region': region,
                         'sizeFactor': sf, 'image': img, 'aetherytes': aeths}

    # treasures.json（精簡：id,x,y,map,partySize,item）
    out_pts = [{'id': t['id'], 'x': round(t['coords']['x'], 2), 'y': round(t['coords']['y'], 2),
                'map': t['map'], 'partySize': t.get('partySize'), 'item': t['item']} for t in pts]

    meta = {'source': 'Teamcraft (treasures.json) · 傳送水晶 lspl/aetherytes.json（本地）· 物品名 item_lookup.name_tc（台服解包原文，零轉換） · 地名 place_names（本地權威）',
            'gradeCount': len(grades), 'mapCount': len(out_maps), 'pointCount': len(out_pts),
            'aetheryteCount': sum(len(m['aetherytes']) for m in out_maps.values())}

    for fn, obj in [('grades.json', {'_meta': meta, 'grades': grades}),
                    ('maps.json', {'_meta': meta, 'maps': out_maps}),
                    ('treasures.json', {'_meta': meta, 'treasures': out_pts})]:
        with open(os.path.join(OUT, fn), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

    print(f'✓ 輸出 {len(grades)} grades / {len(out_maps)} maps / {len(out_pts)} points → {OUT}')
    if gaps:
        print('✗ 涵蓋率缺口：', file=sys.stderr)
        for g in gaps:
            print('   -', g, file=sys.stderr)
        sys.exit(1)
    print('✓ 涵蓋率：所有 grade 有繁中名、所有 map 有地名/size_factor/貼圖')


if __name__ == '__main__':
    main()
