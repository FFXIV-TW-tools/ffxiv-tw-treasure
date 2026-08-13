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
#
# ⚠️ **G18/46185 列在表內但目前不會出貨** —— 台服尚未收錄該物品。
# 2026-08-13 兩次更正，值得完整記下來因為第一次的更正本身也是錯的：
#   · 原本的排除理由寫「繁中名未進 item_lookup」
#   · 當天稍早我複核成「已經進了（name_tc =『陳舊的卡岡圖亞革地圖』）⇒ 理由失效」——**錯**
#   · 真相：`item_lookup.name_tc_source` 這一欄（同日新增）標的是 **`opencc`**。
#     台服解包 `tc_Item.csv` 與 `tclocal_Item.csv` 的 46185 **都是空字串**，
#     那個名字是国服「陈旧的卡冈图亚革地图」機器轉繁的產物。
# ⇒ 教訓：**「item_lookup 有繁中名」不等於「台服有這個名字」**。這一欄存在之前，
#   兩者在資料上長得一模一樣，我就是這樣看錯的。本檔因此改為只收 `name_tc_source='dump'`。
# ⇒ 它留在表內是為了**台服開放當天自動出貨**（解包一有名字就過閘），不需要再改這裡。
#   順帶佐證台服命名慣例其實是統一的：官方用編號式（陳舊的地圖G17），
#   国服才用皮名（陈旧的狞豹革地图）——我先前寫「台服命名並不統一」同樣是被機轉名誤導。
GRADE_CATALOG = [
    (46185, 'G18', '7.4'),
    (43557, 'G17', '7.0'), (43556, 'G16', '7.0'),
    (39591, 'G15', '6.3'), (36612, 'G14', '6.0'), (36611, 'G13', '6.0'),
    (26745, 'G12', '5.0'), (26744, 'G11', '5.0'),
    (19770, '綠圖', '4.05'), (17836, 'G10', '4.0'), (17835, 'G9', '4.0'),
    (12243, 'G8', '3.0'), (12242, 'G7', '3.0'), (12241, 'G6', '3.0'),
]
GRADE_ITEMIDS = {iid for iid, _, _ in GRADE_CATALOG}
# 實際出貨的等級數地板（只准升不准降）。目前 13＝全表 14 扣掉台服未收錄的 G18。
SHIPPED_GRADE_FLOOR = 13


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
    rows = {iid: conn.execute('SELECT name_tc, name_tc_source FROM items WHERE id=?',
                              (iid,)).fetchone() for iid in GRADE_ITEMIDS}
    conn.close()
    # 繁中名 = 台服解包原文。**只收 `name_tc_source='dump'`**，其餘（opencc／tnze）一律當作沒有。
    # ⚠️ 光看 `name_tc` 有值是不夠的 —— G18 就是有值（機轉自国服名）而台服解包裡是空的。
    # 這一欄之前不存在，兩種情況在資料上完全無法區分，那正是 2026-08-13 誤判的成因。
    names = {iid: (row[0] if row and row[0] and row[1] == 'dump' else None)
             for iid, row in rows.items()}
    return places, maps, names, aeth


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = fetch_treasures()
    places, maps, names, aeth_raw = load_local()

    # grades.json —— **台服解包沒有名字的等級一律不出貨**（fail-closed）。
    # 不是「先放上去、名字之後補」：站上顯示的名字是玩家拿回遊戲內搜尋用的，
    # 沒有官方名時任何替代品（機轉／英文／自創）都會讓他搜不到，而畫面上完全正常。
    grades, pending = [], []
    for iid, grade, exp in GRADE_CATALOG:
        name = names.get(iid)
        if not name:
            pending.append(f'{grade}(item {iid})')
            continue
        psize = next((t.get('partySize') for t in raw if t.get('item') == iid), None)
        grades.append({'grade': grade, 'itemId': iid, 'name': name,
                       'partySize': psize, 'expansion': exp,
                       'special': grade == '綠圖'})
    if pending:
        print(f'· 台服尚未收錄、暫不出貨：{"、".join(pending)}（解包一有名字就會自動出現）')
    # 只准升不准降的地板：某次 dump 壞掉／欄位改名會讓上面那圈**靜默**掃掉一整批等級，
    # 而輸出仍是合法 JSON、站台照常運作，只是少了幾個分頁。地板讓它當場失敗。
    if len(grades) < SHIPPED_GRADE_FLOOR:
        print(f'✗ 只產出 {len(grades)} 個等級，低於地板 {SHIPPED_GRADE_FLOOR}'
              '（dump 壞了？欄位改名？）', file=sys.stderr)
        sys.exit(1)

    shipped = {g['itemId'] for g in grades}
    pts = [t for t in raw if t.get('item') in shipped]
    used_maps = sorted({t['map'] for t in pts})

    gaps = []

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
