#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""藏寶圖工具資料生成 — 一次性 / 版本更新時跑（產出靜態 JSON 供前端載，部署後零後端、零第三方 runtime）。

來源（2026-06-22 決策）：
- 挖掘點 treasures：**Teamcraft** treasures.json（決策 #5，註明來源 Teamcraft）
- 地圖 size_factor + 貼圖 URL：本地 data/item_dict/lspl/maps.json（Teamcraft maps 鏡像，map-id keyed）
- 地區繁中名：本地 data/item_dict/place_names.json（**map-id keyed** — 已驗）
- 物品繁中名：本地 data/item_dict/item_lookup.sqlite items.name_sc → s2twp（name_tc 對藏寶圖物品是通用「地圖Gxx」錯名，故取 name_sc 再簡→繁；決策 #1：權威生成，不硬編對照表）
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

# 簡→繁：item_lookup 的 name_tc 對藏寶圖物品是通用「地圖Gxx」(錯)，name_sc 才是正確生物皮名。
# 故繁中完整名 = s2twp(name_sc)，對齊 XIVDiscordBot/api/_textconv.py 的 S2T（DRY，非自建對照表）。
try:
    import opencc
    _S2T = opencc.OpenCC('s2twp')
except ImportError:
    print('✗ 需要 opencc（簡→繁）。請用有裝 opencc 的 python 跑，例如：py -3.11 tools/build-data.py', file=sys.stderr)
    sys.exit(1)

ROOT = os.environ.get('FFXIV_PROJECT_ROOT', 'C:/FFXIVProject')
DICT = os.path.join(ROOT, 'data', 'item_dict')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'data'))
CACHE = os.path.join(OUT, '_teamcraft-treasures.json')
TEAMCRAFT_URL = ('https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/'
                 'staging/libs/data/src/lib/json/treasures.json')

# 社群分級（高→低）：itemId → (grade 標籤, 版本)。繁中名不寫這裡，從 item_lookup 生成。
# G18/46185 暫不列（繁中名未進 item_lookup，與 reference 一致；item_dict 月更後補）。
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
    conn = sqlite3.connect(os.path.join(DICT, 'item_lookup.sqlite'))
    rows = {iid: conn.execute('SELECT name_sc FROM items WHERE id=?', (iid,)).fetchone() for iid in GRADE_ITEMIDS}
    conn.close()
    # 完整繁中名 = s2twp(name_sc)（name_tc 對藏寶圖是通用「地圖Gxx」錯名，見檔頭）
    names = {iid: (_S2T.convert(row[0]) if row and row[0] else None) for iid, row in rows.items()}
    return places, maps, names


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = fetch_treasures()
    places, maps, names = load_local()

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
        out_maps[mid] = {'id': mid, 'zone': zone, 'region': region,
                         'sizeFactor': sf, 'image': img}

    # treasures.json（精簡：id,x,y,map,partySize,item）
    out_pts = [{'id': t['id'], 'x': round(t['coords']['x'], 2), 'y': round(t['coords']['y'], 2),
                'map': t['map'], 'partySize': t.get('partySize'), 'item': t['item']} for t in pts]

    meta = {'source': 'Teamcraft (treasures.json) · 物品名 item_lookup.name_sc→s2twp · 地名 place_names（本地權威）',
            'gradeCount': len(grades), 'mapCount': len(out_maps), 'pointCount': len(out_pts)}

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
