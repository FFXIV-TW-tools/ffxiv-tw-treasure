#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""產生 i18n 字典裡的**遊戲名詞**區塊（地圖名 13 ＋ 地名 40）。

用法：python tools/build-i18n-names.py   → 就地改寫 i18n/en.js 與 i18n/ja.js 的標記區塊。

為什麼要有這支：這 53 個名詞是**遊戲內的官方名**，不是文案。手打＝自創譯名，
直踩 monorepo 鐵則「不自創、查證源＝官方解包」。而且它們每次改版都可能增減，
人不會記得回來對。⇒ 由 id join 出來，人只負責 UI 文案那一半。

來源與 join 路徑（三段都不是機器翻譯，全是 SE 官方 client 字串）：

  · 地圖名 ×13：`grades.json.itemId` → 本地 `datamining_tc/{en,ja}_Item.csv`
  · 地名（zone）×28：`maps.json` 的 map id → 本地 `lspl/maps.json.placename_id`
                     → upstream xivapi `csv/{en,ja}/PlaceName.csv`
  · 地名（region）×12：同上，走 `region_id`

⚠️ **為什麼 PlaceName 走 upstream 而不是本地**：本地 `datamining_tc` 只解了名稱層的
   `Item`／`Action`／`Status`／`CraftAction`，**沒有 `PlaceName`**（`tc_`／`tclocal_` 都沒有）。
   繁中那一側我們本來就有（`place_names.json`），這裡缺的只有 en／ja，而 xivapi 的
   datamining 就是 SE 的 en／ja client 字串。同 repo 的 ranking `gen_death_tc.py` 用同一條路徑取 EN。
   ⇒ 這是 **build 時**抓 CSV 產靜態字典，runtime 零相依，不是「替本站接一條資料鏈」。

⚠️ **產出寫進字典而不是資料檔**（`maps.json`／`grades.json`）：
   字典只在使用者真的切外語時才載入 ⇒ 繁中訪客（絕大多數）**一個位元組都不用付**。
   若塞進資料檔就是所有人都下載三份名字 —— 直踩 monorepo 鐵則「資料只載當前這份會用到的」。
   實測支持這個選擇：整份多語名詞約 1.5 KB，另開一支檔去分層反而多一次請求、更貴。
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
DICT = Path(os.environ.get('FFXIV_PROJECT_ROOT', 'C:/FFXIVProject')) / 'data' / 'item_dict'
DUMP = DICT / 'datamining_tc'
XIVAPI = 'https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/{lang}/PlaceName.csv'

BEGIN = '  /* @@GEN:GAME-NAMES@@ 以下由 tools/build-i18n-names.py 生成，不得手改 */'
END = '  /* @@/GEN:GAME-NAMES@@ */'
LANGS = ('en', 'ja')


def parse_names(text: str) -> dict[str, str]:
    """SE CSV → {id: Name}。

    ⚠️ 用 `csv.reader` 不是 `split('\\n')`：`Description` 之類的欄位內嵌換行，
    切錯會讓整份資料錯位，症狀是「id 明明在檔裡卻查不到」——那看起來就像
    「這筆本來就沒有官方名」，是會直接翻成錯誤結論的失效（2026-08-13 實際踩過兩次）。
    同理不寫死表頭列號：`tc_*` 是三列前導、`en_*`／`ja_*` 只有一列。
    """
    rows = list(csv.reader(io.StringIO(text)))
    hdr = next(i for i, r in enumerate(rows[:4]) if 'Name' in r)
    ni = rows[hdr].index('Name')
    start = hdr + 1
    if start < len(rows) and rows[start] and rows[start][0] == 'int32':
        start += 1
    return {r[0]: r[ni].strip() for r in rows[start:]
            if r and r[0].isdigit() and len(r) > ni and r[ni].strip()}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'ffxiv-tw-treasure/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8-sig')


def collect() -> dict[str, dict[str, str]]:
    """{lang: {繁中原文: 外語}}。任何一筆 join 不到就整支失敗——見 main() 的說明。"""
    grades = json.loads((ROOT / 'data/grades.json').read_text(encoding='utf-8'))['grades']
    maps = json.loads((ROOT / 'data/maps.json').read_text(encoding='utf-8'))['maps']
    lspl = json.loads((DICT / 'lspl/maps.json').read_text(encoding='utf-8'))

    out = {lang: {} for lang in LANGS}
    gaps = []
    for lang in LANGS:
        items = parse_names((DUMP / f'{lang}_Item.csv').read_text(encoding='utf-8'))
        places = parse_names(fetch(XIVAPI.format(lang=lang)))
        for g in grades:
            name = items.get(str(g['itemId']))
            if name:
                out[lang][g['name']] = name
            else:
                gaps.append(f'{lang}: 地圖 {g["grade"]}(item {g["itemId"]}) 無官方名')
        for mid, m in maps.items():
            e = lspl.get(str(mid), {})
            for tc, pid in ((m.get('zone'), e.get('placename_id')),
                            (m.get('region'), e.get('region_id'))):
                if not tc:
                    continue
                name = places.get(str(pid)) if pid else None
                if name:
                    out[lang][tc] = name
                else:
                    gaps.append(f'{lang}: 地名「{tc}」(map {mid}, placename {pid}) 無官方名')
    return out, gaps


def js_str(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def write_block(lang: str, pairs: dict[str, str]) -> None:
    path = ROOT / 'i18n' / f'{lang}.js'
    text = path.read_text(encoding='utf-8')
    body = '\n'.join(f'  {js_str(k)}: {js_str(v)},' for k, v in sorted(pairs.items()))
    block = f'{BEGIN}\n{body}\n{END}'
    if BEGIN in text:
        text = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END), lambda _: block,
                      text, flags=re.S)
    else:
        # 首次注入：擺在字典物件開頭，位置不影響語意（同一個物件字面）
        text = text.replace('window.FFXIVI18nDict = {',
                            'window.FFXIVI18nDict = {\n' + block, 1)
    path.write_text(text, encoding='utf-8')
    print(f'✓ {path.name}: {len(pairs)} 個遊戲名詞')


def main() -> None:
    pairs, gaps = collect()
    if gaps:
        # ⚠️ **fail-closed**：缺一筆就整支失敗，不「有幾筆寫幾筆」。
        # 部分寫入的後果是外語畫面上零星幾個中文地名，而畫面不會報錯、測試也不會紅
        # ——那正是這個生態反覆吃虧的零回饋訊號形狀。
        print('✗ 有名詞 join 不到官方名（不部分輸出）：', file=sys.stderr)
        for g in gaps:
            print('   -', g, file=sys.stderr)
        sys.exit(1)
    for lang in LANGS:
        write_block(lang, pairs[lang])


if __name__ == '__main__':
    main()
