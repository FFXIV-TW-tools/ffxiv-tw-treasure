#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""藏寶圖工具資料生成 — 一次性 / 版本更新時跑（產出靜態 JSON 供前端載，部署後零後端、零第三方 runtime）。

來源（2026-06-22 決策）：
- 挖掘點 treasures：**Teamcraft** treasures.json（決策 #5，註明來源 Teamcraft）
- 採集等級 gatherLevel：**xivapi 解包** GatheringItem.GatheringItemLevel（2026-08-16 新增，權威＝SE 解包）
- 寶箱掉落 loot：**Teamcraft** loot-sources.json（＝Garland 同一份，已對照一致；社群整理，非解包）
- 地圖 size_factor + 貼圖 URL：本地 data/item_dict/lspl/maps.json（Teamcraft maps 鏡像，map-id keyed）
- 地區繁中名：本地 data/item_dict/place_names.json（**map-id keyed** — 已驗）
- 物品繁中名：本地 data/item_dict/item_lookup.sqlite items.**name_tc**（＝台服 client 解包原文，與 datamining_tc/tc_Item.csv 逐字相同）。**零轉換**——2026-08-13 更正，見下方長註解
- 等級分級（Gxx / 綠圖 社群慣例 itemId↔grade）：GRADE_CATALOG（事實對照，繁中名仍從 sqlite 生）

DRY 鐵則：所有繁中名走本地權威源，禁自建對照表。
跨機：monorepo 根用 env FFXIV_PROJECT_ROOT，預設 C:/FFXIVProject（對齊 .claude/rules/cross-machine-paths.md）。

用法：python tools/build-data.py  → 寫 data/{grades,maps,treasures}.json + 印涵蓋率報告（有缺即 exit 1）。
"""
import csv
import json
import os
import sqlite3
import sys
import urllib.parse
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
LOOT_CACHE = os.path.join(OUT, '_teamcraft-loot-sources.json')
GATHER_CACHE = os.path.join(OUT, '_xivapi-gather-levels.json')
TEAMCRAFT_URL = ('https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/'
                 'staging/libs/data/src/lib/json/treasures.json')
# loot-sources.json：{被掉落的 item id: [來源 id…]}，來源含藏寶圖 item id ⇒ 反查即得「這張圖開得出什麼」。
TEAMCRAFT_LOOT_URL = ('https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/'
                      'staging/libs/data/src/lib/json/loot-sources.json')
XIVAPI = 'https://v2.xivapi.com/api'

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


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'ffxiv-tw-treasure/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def fetch_cached(url, cache, label, unit='筆'):
    """抓上游 JSON，快取到 data/_*.json；網路失敗回退快取，兩者皆無即整支失敗。"""
    try:
        data = _get(url)
        with open(cache, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        print(f'✓ {label} 抓取 {len(data)} {unit}（快取 {cache}）')
        return data
    except Exception as e:  # noqa: BLE001 — build 腳本，網路失敗回退快取
        if os.path.exists(cache):
            print(f'⚠ {label} 抓取失敗（{e}），用快取 {cache}')
            with open(cache, encoding='utf-8') as f:
                return json.load(f)
        print(f'✗ {label} 抓取失敗且無快取：{e}', file=sys.stderr)
        sys.exit(1)


def fetch_treasures():
    return fetch_cached(TEAMCRAFT_URL, CACHE, 'Teamcraft treasures.json', '點')


# 綠圖（19770）**沒有 GatheringItem** —— 它不是採集取得的（是從藏寶圖寶箱的傳送門後拿到）。
# 這是既知事實，所以列成白名單；其餘等級查不到就是資料鏈壞了，必須當場失敗，
# 不能讓「採集等級」欄靜默變空（畫面上只會少一個標籤，沒有任何錯誤訊號）。
NO_GATHER_ITEM = {19770}


def fetch_gather_levels(item_ids):
    """xivapi 解包 GatheringItem → {item id: 採集等級}。

    藏寶圖是「採集時隨機額外取得」，**不掛在任何採集點上**（已掃過 GatheringPointBase 全 1425 列
    與 Teamcraft nodes 的 items／hiddenItems，13 張圖零命中）⇒ 解包裡拿得到的只有這個等級門檻，
    「哪一個採集點會出」在解包中並不存在，不要再去找一次。
    """
    try:
        out = {}
        for iid in sorted(item_ids):
            if iid in NO_GATHER_ITEM:
                continue
            res = _get(f'{XIVAPI}/search?sheets=GatheringItem'
                       f'&query={urllib.parse.quote(f"Item={iid}")}').get('results') or []
            if not res:
                continue
            row = _get(f'{XIVAPI}/sheet/GatheringItem/{res[0]["row_id"]}'
                       '?fields=GatheringItemLevel.GatheringItemLevel')
            lv = row['fields']['GatheringItemLevel']['fields']['GatheringItemLevel']
            out[str(iid)] = lv
        with open(GATHER_CACHE, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False)
        print(f'✓ xivapi GatheringItem 採集等級 {len(out)} 筆（快取 {GATHER_CACHE}）')
        return out
    except Exception as e:  # noqa: BLE001 — 同上，網路失敗回退快取
        if os.path.exists(GATHER_CACHE):
            print(f'⚠ 採集等級抓取失敗（{e}），用快取 {GATHER_CACHE}')
            with open(GATHER_CACHE, encoding='utf-8') as f:
                return json.load(f)
        print(f'✗ 採集等級抓取失敗且無快取：{e}', file=sys.stderr)
        sys.exit(1)


# 採集職業動作（對齊 marketboard build_gathering_nodes.py 的 type 表；4/5＝刺魚／釣魚不收——
# 藏寶圖只從採礦工／園藝工的採集點取得，釣魚點不會出）。
GATHER_TYPES = {0: 'mine', 1: 'quarry', 2: 'log', 3: 'harvest'}


def build_gather_nodes(levels):
    """本地 lspl/nodes.json → {採集等級: [點位]} ＋ 這些點所在地圖的底圖資訊。

    ⚠️ 這是**推導**，不是解包直說：解包只給「這張圖需要採集 Lv.N」（GatheringItem），
    沒有任何一筆說「這個採集點會掉這張圖」。我們取的是「等級**恰好等於**門檻的採集點」，
    因為那就是玩家實際會去刷的點。前端必須標明是依採集等級推導，別讓它讀起來像官方保證。

    ⚠️ `map == 0` 的點（本地 nodes.json 有一批）**丟掉**：不知道在哪張圖就畫不出來，
    硬畫會標到錯的地方，而畫面上完全看不出來。
    """
    with open(os.path.join(DICT, 'lspl', 'nodes.json'), encoding='utf-8') as f:
        nodes = json.load(f)
    with open(os.path.join(DICT, 'lspl', 'maps.json'), encoding='utf-8') as f:
        lspl_maps = json.load(f)
    with open(os.path.join(DICT, 'place_names.json'), encoding='utf-8') as f:
        places = json.load(f)

    want = set(levels)
    out, used, dropped = {str(lv): [] for lv in want}, set(), 0
    for node in nodes.values():
        lv, mid = node.get('level'), node.get('map')
        if lv not in want or node.get('type') not in GATHER_TYPES:
            continue
        me = lspl_maps.get(str(mid)) if mid else None
        if not mid or not me or not me.get('image') or me.get('size_factor') is None:
            dropped += 1
            continue
        out[str(lv)].append({'m': mid, 'x': round(node['x'], 2), 'y': round(node['y'], 2),
                             't': node['type'], 'lim': bool(node.get('limited')),
                             'leg': bool(node.get('legendary'))})
        used.add(mid)
    # 地名缺一個就整張圖不出（fail-closed）：前端拿 zone 去 t() 查字典，空字串會變成
    # 「key 是空字串」的缺譯，i18n 哨兵當場紅——而且畫面上是個沒有名字的按鈕。
    gmaps, nameless = {}, []
    for mid in sorted(used):
        me = lspl_maps[str(mid)]
        zone = places.get(str(mid), {}).get('place')
        if not zone:
            nameless.append(mid)
            continue
        gmaps[mid] = {'zone': zone, 'sizeFactor': me['size_factor'], 'image': me['image']}
    if nameless:
        out = {lv: [p for p in pts if p['m'] not in nameless] for lv, pts in out.items()}
        print(f'· 採集點地圖無繁中地名、不出貨：{nameless}')
    print(f'✓ 採集點 {sum(len(v) for v in out.values())} 個 / {len(gmaps)} 張地圖'
          f'（{dropped} 個因無 map/圖資丟棄）')
    return out, gmaps


# 藏寶迷宮（傳送門後的副本）→ ContentFinderCondition id。
#
# ⚠️ **這張對照表是人工的**，因為解包裡沒有它：`TreasureHuntRank` → `EventItem`（入場 key item）
#    → `InstanceContent` → `ContentFinderCondition` 整條查過，沒有任何欄位把「圖等級」接到迷宮。
#    對照本身是遊戲機制（哪張圖開得出哪個傳送門），**內容全部來自解包**（DungeonChest*）。
# ⚠️ 一張圖可能通往**多個**迷宮（同世代後續改版新增的 shifting 版），故值是 list。
# ⚠️ 單人圖（partySize 1）挖不到傳送門 ⇒ 沒有迷宮，不是漏填。
# 接錯世代的防呆＝下面的 patch 閘（掉落物 patch 必須落在該圖版本之後），不靠人記得核對。
DUNGEON_CATALOG = {
    12243: [179],        # G8  → 水城寶物庫
    17836: [268, 586],   # G10 → 運河寶物庫／運河寶物庫神殿
    19770: [276],        # 綠圖 → 運河寶物庫深層
    26745: [688, 745],   # G12 → 夢羽寶境／夢羽寶殿
    36612: [819],        # G14 → 驚奇百寶城
    39591: [909],        # G15 → 厄爾庇斯育體寶殿
    43557: [993],        # G17 → 加加財富天坑
    # 7.3 的「巡夢金庫」（對應 G18）**台服 client 尚未收錄**——`tc_ContentFinderCondition.csv`
    # 查無此名，所以拿不到 CFC id、現在補不了。台服開放後補一行即可（G18 本身也在等同一件事）。
}


def tc_names(path):
    """台服解包 CSV → {id: Name}（三列前導；引號內含換行故必須用 csv.reader）。"""
    with open(path, encoding='utf-8') as f:
        rows = list(csv.reader(f))
    hdr = next(i for i, r in enumerate(rows[:4]) if 'Name' in r)
    ni = rows[hdr].index('Name')
    start = hdr + 1
    if start < len(rows) and rows[start] and rows[start][0] == 'int32':
        start += 1
    return {r[0]: r[ni].strip() for r in rows[start:]
            if r and r[0].isdigit() and len(r) > ni and r[ni].strip()}


def item_patch_table():
    """lspl ItemPatch.csv（區間表）→ 查 item id 的 patch 版本，用於世代防呆。"""
    with open(os.path.join(DICT, 'lspl', 'ItemPatch.csv'), encoding='utf-8') as f:
        rng = [(int(r['StartItemId']), int(r['EndItemId']), r['PatchNo'])
               for r in csv.DictReader(f)]

    def patch_of(iid):
        for lo, hi, p in rng:
            if lo <= iid <= hi:
                return float(p.split('.')[0] + '.' + (p.split('.')[1] if '.' in p else '0'))
        return None
    return patch_of


def build_dungeon_loot(grades):
    """藏寶迷宮寶箱掉落（本地解包 DungeonChest ＋ DungeonChestItem）。

    這是「傳送門後的副本」內容——**與藏寶圖本身挖出的箱子是兩回事**，也是玩家真正在問的
    「G17 的地牢有什麼」。含掉落機率與數量區間，遠比社群整理的 loot-sources 完整
    （加加財富天坑 35 項 vs loot-sources 的 2 項）。
    """
    with open(os.path.join(DICT, 'lspl', 'DungeonChest.csv'), encoding='utf-8') as f:
        chests = list(csv.DictReader(f))
    with open(os.path.join(DICT, 'lspl', 'DungeonChestItem.csv'), encoding='utf-8') as f:
        chest_items = list(csv.DictReader(f))
    # DungeonDrop＝同一座迷宮的其他掉落（只有 item id，沒有機率／數量）。舊寶物庫有一批
    # 只記在這裡（水城 +52、運河 +23…），不併就等於少列一半；新的三座（819／909／993）沒有。
    with open(os.path.join(DICT, 'lspl', 'DungeonDrop.csv'), encoding='utf-8') as f:
        drops = list(csv.DictReader(f))
    cfc_names = tc_names(os.path.join(DICT, 'datamining_tc', 'tc_ContentFinderCondition.csv'))
    patch_of = item_patch_table()
    conn = sqlite3.connect(os.path.join(DICT, 'item_lookup.sqlite'))
    tclocal = tc_names(os.path.join(DICT, 'datamining_tc', 'tclocal_Item.csv'))

    by_chest = {}
    for r in chest_items:
        by_chest.setdefault(r['ChestId'], []).append(r)

    out, gaps = {}, []
    for g in grades:
        cfcs = DUNGEON_CATALOG.get(g['itemId'])
        if not cfcs:
            continue
        dungeons = []
        for cfc in cfcs:
            name = cfc_names.get(str(cfc))
            if not name:
                gaps.append(f'{g["grade"]}：CFC {cfc} 在台服解包查無名稱（id 打錯？）')
                continue
            # ⚠️ **一座迷宮可能有多個寶箱記錄**（運河寶物庫深層／神殿各有 2 個，位置不同），
            #    而 Probability 是**各箱獨立**的 ⇒ 合併成一份清單會讓兩組機率混在一起看不出來。
            #    資料層帶 chestNo，前端在多於一箱時分開標示。
            #    ⚠️ 這張表**沒有「第幾層」的欄位**：機率是該寶箱的掉落率，不是逐層機率。
            cs = sorted([c for c in chests if c['ContentFinderConditionId'] == str(cfc)],
                        key=lambda c: int(c['ChestNo']))
            rows, seen, hidden = [], set(), 0
            for c in cs:
                for r in by_chest.get(c['RowId'], []):
                    iid = int(r['ItemId'])
                    if iid in seen:
                        continue
                    seen.add(iid)
                    nm = resolve_tc_name(conn, iid, tclocal)
                    if not nm:
                        # 台服解包沒有官方名（多為国服機轉）⇒ 不出貨，但**要記數**：
                        # 只是默默少列，清單看起來完整卻少了一半，正是零回饋訊號。
                        hidden += 1
                        continue
                    rows.append({'id': iid, 'name': nm, 'min': int(r['Min']), 'max': int(r['Max']),
                                 'p': round(float(r['Probability']), 2),
                                 'c': int(c['ChestNo']) if len(cs) > 1 else 0})
            for r in drops:
                if r['ContentFinderConditionId'] != str(cfc):
                    continue
                iid = int(r['ItemId'])
                if iid in seen:
                    continue
                seen.add(iid)
                nm = resolve_tc_name(conn, iid, tclocal)
                if not nm:
                    hidden += 1
                    continue
                rows.append({'id': iid, 'name': nm})   # 無機率／數量欄 → 前端不顯示那一段
            if not rows:
                gaps.append(f'{g["grade"]}：迷宮「{name}」(CFC {cfc}) 一件掉落都沒有')
                continue
            # 世代防呆：對照接錯世代時，掉落物的 patch 會整批早於該圖的版本
            # （例：把 G17 接到 3.x 的水城寶物庫）。這種錯誤在畫面上完全正常 ⇒ 機械擋。
            exp = float(g['expansion'])
            newest = max((patch_of(r['id']) or 0) for r in rows)
            if newest + 0.5 < exp:
                gaps.append(f'{g["grade"]}(版本 {exp})：迷宮「{name}」的掉落最新只到 patch {newest}'
                            '——對照可能接錯世代')
            # 先按寶箱編號、再按機率高低（同箱的排在一起，機率才讀得出是哪一箱的）
            rows.sort(key=lambda r: (r.get('c') or 0, -(r.get('p') or 0)))
            dungeons.append({'cfc': cfc, 'name': name, 'items': rows, 'hidden': hidden,
                             'chests': len(cs)})
        if dungeons:
            out[str(g['itemId'])] = dungeons
    conn.close()
    total = sum(len(d['items']) for ds in out.values() for d in ds)
    print(f'✓ 藏寶迷宮 {sum(len(v) for v in out.values())} 座 / 掉落 {total} 筆')
    return out, gaps


def resolve_tc_name(conn, iid, tclocal):
    """台服解包原文，否則 None。

    ⚠️ 收 `dump` **與** `dt`——但 `dt` 必須與 `tclocal_Item.csv` **逐字相同**才算數。
    2026-08-16 查證：`dt` 的來源（full.sqlite 的 name_tc）就是台服 client 本地解包，
    只是 `tc_Item.csv` 那一份較舊、很多 7.x 物品是空的（48228「偏光染劑」即是）。
    先前只收 `dump` 過嚴，把台服真的有官方名的物品也擋掉了。
    """
    # 機器轉換來源（国服簡→繁）與 tnze 一律不收 —— 兩者都不是台服官方名。
    # ⚠️ 這句話刻意寫成 `#` 註解：names-authority 哨兵掃「非註解行」有沒有機轉字樣，
    #    docstring 不算註解 ⇒ 寫在上面那段裡會被判成「產生器又在做機器轉換」（實際踩過）。
    row = conn.execute('SELECT name_tc, name_tc_source FROM items WHERE id=?', (iid,)).fetchone()
    if not row or not row[0]:
        return None
    if row[1] == 'dump':
        return row[0]
    if row[1] == 'dt' and tclocal.get(str(iid)) == row[0]:
        return row[0]
    return None


def build_loot(shipped):
    """Teamcraft loot-sources.json 反查 → {藏寶圖 item id: [{id, name}…]}。

    ⚠️ **這一份不是台服解包**，是社群整理（Teamcraft／Garland 同源），且**已知不完整**
    （2026-08-16 實測：G16 26 筆、G6 32 筆，但 G17 只有 2 筆、綠圖 0 筆）。
    ⇒ 前端必須標明來源與「已知掉落」，不得讓玩家以為是完整清單。
    物品**名字**仍走台服解包（name_tc_source='dump'），台服未收錄的物品整筆不出
    （fail-closed：寧可少列一項，也不放機轉名上站）。
    """
    raw = fetch_cached(TEAMCRAFT_LOOT_URL, LOOT_CACHE, 'Teamcraft loot-sources.json')
    conn = sqlite3.connect(os.path.join(DICT, 'item_lookup.sqlite'))
    rev = {iid: [] for iid in shipped}
    for dropped, sources in raw.items():
        for src in sources:
            if src in rev and dropped.isdigit():
                rev[src].append(int(dropped))
    tclocal = tc_names(os.path.join(DICT, 'datamining_tc', 'tclocal_Item.csv'))
    out, skipped = {}, 0
    for iid, drops in rev.items():
        items = []
        for did in sorted(set(drops)):
            nm = resolve_tc_name(conn, did, tclocal)
            if nm:
                items.append({'id': did, 'name': nm})
            else:
                skipped += 1
        out[str(iid)] = items
    conn.close()
    print(f'✓ 掉落物 {sum(len(v) for v in out.values())} 筆'
          f'（{skipped} 筆台服未收錄，已略過）')
    return out


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
    gather = fetch_gather_levels(GRADE_ITEMIDS)

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
                       'gatherLevel': gather.get(str(iid)),
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
    # 採集等級缺口＝資料鏈壞了（xivapi 欄位改名／sheet 改版），不是「這張圖沒有等級」。
    # 少一個標籤在畫面上完全沒有訊號 ⇒ 併進 gaps 讓 build 非零 exit。
    for g in grades:
        if g['gatherLevel'] is None and g['itemId'] not in NO_GATHER_ITEM:
            gaps.append(f'{g["grade"]}(item {g["itemId"]}) 無採集等級（GatheringItem 查無）')

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

    # loot.json（寶箱掉落；社群整理來源，與上面三份的權威等級不同 ⇒ _meta 分開寫清楚）
    loot = build_loot(shipped)

    # 藏寶迷宮掉落（傳送門後的副本；本地解包，含機率與數量）
    dungeon, dgaps = build_dungeon_loot(grades)
    gaps.extend(dgaps)

    # gather.json（去哪採到這張圖：等級門檻對應的採集點位）
    want_levels = sorted({g['gatherLevel'] for g in grades if g['gatherLevel']})
    gather, gather_maps = build_gather_nodes(want_levels)
    for lv in want_levels:
        if not gather[str(lv)]:
            gaps.append(f'採集 Lv.{lv} 一個點都沒有（nodes.json 壞了？欄位改名？）')

    meta = {'source': 'Teamcraft (treasures.json) · 傳送水晶 lspl/aetherytes.json（本地）· 物品名 item_lookup.name_tc（台服解包原文，零轉換） · 地名 place_names（本地權威） · 採集等級 xivapi GatheringItem（解包）',
            'gradeCount': len(grades), 'mapCount': len(out_maps), 'pointCount': len(out_pts),
            'aetheryteCount': sum(len(m['aetherytes']) for m in out_maps.values())}
    loot_meta = dict(meta, source='寶箱＝Teamcraft (loot-sources.json)＝社群整理，**已知不完整**'
                                  ' · 藏寶迷宮＝本地解包 DungeonChest／DungeonChestItem（含機率與數量）'
                                  ' · 物品名 item_lookup.name_tc（台服解包原文，零轉換）',
                     lootCount=sum(len(v) for v in loot.values()),
                     dungeonCount=sum(len(d['items']) for ds in dungeon.values() for d in ds))
    gather_meta = {'source': '本地 lspl/nodes.json（採集點位）· 地名 place_names（本地權威）'
                             ' · 依解包採集等級門檻推導（解包沒有「哪個點掉哪張圖」的表）',
                   'nodeCount': sum(len(v) for v in gather.values()), 'mapCount': len(gather_maps)}

    for fn, obj in [('grades.json', {'_meta': meta, 'grades': grades}),
                    ('maps.json', {'_meta': meta, 'maps': out_maps}),
                    ('treasures.json', {'_meta': meta, 'treasures': out_pts}),
                    ('loot.json', {'_meta': loot_meta, 'loot': loot, 'dungeons': dungeon}),
                    ('gather.json', {'_meta': gather_meta, 'levels': gather, 'maps': gather_maps})]:
        with open(os.path.join(OUT, fn), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

    print(f'✓ 輸出 {len(grades)} grades / {len(out_maps)} maps / {len(out_pts)} points'
          f' / {loot_meta["lootCount"]} loot / {loot_meta["dungeonCount"]} dungeon loot'
          f' / {gather_meta["nodeCount"]} gather nodes → {OUT}')
    if gaps:
        print('✗ 涵蓋率缺口：', file=sys.stderr)
        for g in gaps:
            print('   -', g, file=sys.stderr)
        sys.exit(1)
    print('✓ 涵蓋率：所有 grade 有繁中名、所有 map 有地名/size_factor/貼圖')


if __name__ == '__main__':
    main()
