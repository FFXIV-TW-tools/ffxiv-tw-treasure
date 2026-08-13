/* 英文字典 — 藏寶圖挖寶共用房間（B-116 第二站）
 *
 * key ＝繁中原文（gettext 模型）。取不到 key 時 t() 回傳 key 本身，也就是照原樣顯示繁中，
 * 所以這裡缺一條的後果是「看得懂的中文」，不會是空白或識別字。
 *
 * ⚠️ 本檔以 classic <script> 同步載入 —— `fetch`／`defer` 都會晚一步，
 *    結果是半個畫面繁中、半個畫面外語。**不要改成 JSON**。
 * ⚠️ 哨兵＝portal 共用 `tools/i18n-check.mjs`（設定在 repo 根 `i18n.config.json`）。
 *    改動任何一句繁中文案＝key 變了 ⇒ 缺譯轉紅直到重譯。這是刻意的：
 *    「翻譯停在舊語意」在畫面上完全看不出來，只能靠機械比對。
 *
 * ⚠️ **遊戲名詞區塊由 tools/build-i18n-names.py 生成，不得手改**（見下方標記）：
 *    地圖名走 `en_Item.csv`、地名走 xivapi `csv/en/PlaceName.csv`，全部是 SE 官方 client
 *    字串。手打＝自創譯名，直踩鐵則「不自創、查證源＝官方解包」。
 *
 * ⚠️ **座標／巨集這類「要貼進遊戲」的文字**：地名跟著介面語言走（Owner 2026-08-13 裁示）。
 *    已知取捨：繁中服玩家的 client 是中文，英文介面複製出去的地名隊友不一定對得上。
 */
window.FFXIVI18nDict = {
  /* @@GEN:GAME-NAMES@@ 以下由 tools/build-i18n-names.py 生成，不得手改 */
  '亞克特爾樹海': 'Yak T\'el',
  '伊爾美格': 'Il Mheg',
  '伊爾薩巴德': 'Ilsabard',
  '克扎瑪烏卡溼地': 'Kozama\'uka',
  '加雷馬': 'Garlemald',
  '北洋地域': 'The Northern Empty',
  '厄爾庇斯': 'Elpis',
  '古代世界': 'The World Unsundered',
  '嘆息海': 'Mare Lamentorum',
  '基拉巴尼亞': 'Gyr Abania',
  '基拉巴尼亞山區': 'The Peaks',
  '基拉巴尼亞湖區': 'The Lochs',
  '基拉巴尼亞邊區': 'The Fringes',
  '夏勞尼荒野': 'Shaaloani',
  '天外天垓': 'Ultima Thule',
  '太陽神草原': 'The Azim Steppe',
  '奧薩德': 'Othard',
  '奧闊帕恰山': 'Urqopacha',
  '安穆·艾蘭': 'Amh Araeng',
  '尤卡圖拉爾': 'Yok Tural',
  '庫爾札斯': 'Coerthas',
  '庫爾札斯西部高地': 'Coerthas Western Highlands',
  '延夏': 'Yanxia',
  '拉凱提卡大森林': 'The Rak\'tika Greatwood',
  '星外天域': 'The Sea of Stars',
  '深層傳送魔紋的地圖': 'Timeworn Thief\'s Map',
  '珂露西亞島': 'Kholusia',
  '紅玉海': 'The Ruby Sea',
  '翻雲霧海': 'The Churning Mists',
  '薩卡圖拉爾': 'Xak Tural',
  '薩維奈島': 'Thavnair',
  '諾弗蘭特': 'Norvrandt',
  '迷津': 'Labyrinthos',
  '遺產之地': 'Heritage Found',
  '阿巴拉提亞': 'Abalathia\'s Spine',
  '阿巴拉提亞雲海': 'The Sea of Clouds',
  '陳舊的地圖G10': 'Timeworn Gazelleskin Map',
  '陳舊的地圖G11': 'Timeworn Gliderskin Map',
  '陳舊的地圖G12': 'Timeworn Zonureskin Map',
  '陳舊的地圖G13': 'Timeworn Saigaskin Map',
  '陳舊的地圖G14': 'Timeworn Kumbhiraskin Map',
  '陳舊的地圖G15': 'Timeworn Ophiotauroskin Map',
  '陳舊的地圖G16': 'Timeworn Loboskin Map',
  '陳舊的地圖G17': 'Timeworn Br\'aaxskin Map',
  '陳舊的地圖G6': 'Timeworn Archaeoskin Map',
  '陳舊的地圖G7': 'Timeworn Wyvernskin Map',
  '陳舊的地圖G8': 'Timeworn Dragonskin Map',
  '陳舊的地圖G9': 'Timeworn Gaganaskin Map',
  '雷克蘭德': 'Lakeland',
  '黑風海': 'The Tempest',
  '龍堡': 'Dravania',
  '龍堡內陸低地': 'The Dravanian Hinterlands',
  '龍堡參天高地': 'The Dravanian Forelands',
  /* @@/GEN:GAME-NAMES@@ */
  // ── 外殼／導覽 ────────────────────────────────────────────────
  '挖寶共用房間': 'Treasure Map Co-op',
  'FFXIV 繁中服': 'FFXIV TW',
  '介面語言': 'Interface language',
  '步驟': 'Steps',
  '① 選等級': '① Grade',
  '② 選地圖': '② Zone',
  '③ 挖掘點': '③ Dig sites',

  // ── 引導 ────────────────────────────────────────────────────
  '🗺️ 開了藏寶圖卻認不出在哪？<b>選等級 → 選地圖 → 跟遊戲裡的謎題圖肉眼比對</b>，找到一樣的就照座標去挖。':
    '🗺️ Opened a treasure map and cannot tell where it is? <b>Pick the grade → pick the zone → eyeball the in-game riddle art against the cards</b>, then dig at the matching coordinates.',
  '✨ <b>多人挖寶</b>：建立房間給隊友房號 → 每人把自己解到的點加進<b>共享路線</b> → 自動排<b>最省順序</b>、即時同步（單人一次只解一張圖，查到座標即可）。':
    '✨ <b>Group digging</b>: create a room, share the code, everyone adds their solved sites to the <b>shared route</b>, and it auto-sorts into the <b>shortest order</b> in real time. (Solo? Just look up the coordinates — no room needed.)',

  // ── Step 1：選等級 ───────────────────────────────────────────
  '選擇藏寶圖等級': 'Choose map grade',
  '選你手上藏寶圖的等級（台服官方名為「陳舊的地圖Gxx」）。':
    'Pick the grade of the map you are holding (the TW client names them "Timeworn Map Gxx").',
  '… 展開卷軸 …': '… unrolling the scroll …',
  '怪 Lv.{lv}': 'Mobs Lv.{lv}',
  '挖圖時可能出現的怪物等級': 'Level of the monsters that can spawn while digging',
  '8 人': 'Party of 8',
  '單人': 'Solo',
  '版本 {v}': 'Patch {v}',
  '綠圖': 'Thief',
  '傳送門': 'Portal',

  // ── Step 2：選地圖 ───────────────────────────────────────────
  '選擇地圖': 'Choose zone',
  '← 換等級': '← Change grade',
  '{grade} · 選擇地圖': '{grade} · Choose zone',
  '已選 {grade}，請選地圖': '{grade} selected. Now choose a zone.',
  '{n} 點': '{n} sites',
  '地圖 {id}': 'Map {id}',
  '{name}（{grade}）': '{name} ({grade})',

  // ── Step 3：挖掘點 ───────────────────────────────────────────
  '挖掘點': 'Dig sites',
  '← 換地圖': '← Change zone',
  '同等級地圖快速切換': 'Switch between zones of the same grade',
  '把遊戲內的謎題圖跟下面卡片比對，一樣的就照座標去挖。點卡片即可加入共享路線。':
    'Compare the in-game riddle art with the cards below; dig at the coordinates of the one that matches. Click a card to add it to the shared route.',
  '全區地圖（含所有挖掘點標記）': 'Zone map with every dig site marked',
  '{zone} · {grade} 挖掘點': '{zone} · {grade} dig sites',
  '顯示 {zone} 的挖掘點': 'Showing dig sites in {zone}',
  '{grade} 地圖：': '{grade} zones:',
  '{zone}（{n}）': '{zone} ({n})',
  '加入共享路線 X:{x} Y:{y}': 'Add X:{x} Y:{y} to the shared route',
  '點一下加入 / 移出共享路線': 'Click to add to or remove from the shared route',
  '{n} 個挖掘點 · 點卡片即可加入共享路線': '{n} dig sites · click a card to add it to the shared route',
  '此地圖無圖資': 'No map image available for this zone',
  '主水晶（傳送點）': 'Aetheryte (teleport destination)',
  '第 {n} 點，放大檢視': 'Site {n} — enlarge',
  '第 {n} 點（已完成），放大檢視': 'Site {n} (done) — enlarge',

  // ── 共享路線 ─────────────────────────────────────────────────
  '🧭 共享路線': '🧭 Shared route',
  '（已完成 {done} / 共 {total} 點）': '({done} of {total} done)',
  '建議順序': 'Suggest order',
  '📋 複製成巨集': '📋 Copy as macro',
  '複製成遊戲巨集：每行 /p 地名 ( 21.0 , 14.0 )，貼進巨集欄即可喊給隊友':
    'Copy as an in-game macro — one /p line per site, e.g. /p Zone ( 21.0 , 14.0 ). Paste it into a macro slot to call the spots out to your party.',
  '清除已完成': 'Clear completed',
  '🗑 清空': '🗑 Clear all',
  '房間裡還沒有點。到上方挖掘點卡片點一下（右上角 ➕）把你解到的點加進來，隊友會即時看到；按「建議順序」自動排最省動線。':
    'No sites in this room yet. Click a dig-site card above (the ➕ in its corner) to add the one you solved — your party sees it instantly. Then hit "Suggest order" to sort them into the shortest run.',
  '第 {no} 點 · X:{x} Y:{y}': 'Site {no} · X:{x} Y:{y}',
  '第 {no} 點 · X:{x} Y:{y} ✓ 已完成': 'Site {no} · X:{x} Y:{y} ✓ done',
  '標記完成': 'Mark as done',
  '複製此點': 'Copy this site',
  '移除': 'Remove',
  '移除隊友的點': 'Remove a teammate’s site',
  '這是「{who}」加的點，移除後對方也看不到。':
    'This site was added by {who}. Removing it also removes it for them.',
  '隊友': 'A teammate',
  '至少 2 個點才需排序': 'Sorting needs at least 2 sites',
  '已是建議順序（{n} 點）': 'Already in the suggested order ({n} sites)',
  '已排序：單一區域 {n} 點（最近鄰）': 'Sorted: {n} sites in one zone (nearest-neighbour)',
  '建議順序：{z} 區 · {n} 點 · 路程約縮短 {pct}%': 'Suggested order: {z} zones · {n} sites · about {pct}% shorter',
  '建議順序：{z} 區 · {n} 點（已分組 + 最近鄰）': 'Suggested order: {z} zones · {n} sites (grouped + nearest-neighbour)',
  ' · 傳送點未計入（規劃中）': ' · teleports not counted yet (planned)',
  '已算建議順序（同步給全隊）': 'Order suggested and synced to the party',
  '清單是空的': 'The list is empty',
  '清空共享路線': 'Clear the shared route',
  '將清空整條共享路線，含隊友加的 {n} 個點，且無法復原。':
    'This clears the whole shared route — all {n} sites, including ones your teammates added. It cannot be undone.',
  '清空': 'Clear',
  '已清空 {n} 點': 'Cleared {n} sites',
  '沒有已完成的點': 'No completed sites',
  '將清除全隊 {n} 個已完成的點。': 'This removes {n} completed sites for the whole party.',
  '清除': 'Clear',
  '已清除 {n} 個已完成': 'Cleared {n} completed sites',
  '已複製巨集（{n} 行）': 'Macro copied ({n} lines)',
  '已複製巨集（{n} 行），超過巨集上限 {max} 行，請分兩個巨集貼':
    'Macro copied ({n} lines) — that is over the {max}-line macro limit, so split it across two macros',
  '已複製：{text}': 'Copied: {text}',
  '複製失敗': 'Copy failed',
  '📋 複製座標': '📋 Copy coordinates',

  // ── 房間 ─────────────────────────────────────────────────────
  '房間': 'Room',
  '我的名稱：': 'My name:',
  '我在共享路線顯示的名稱': 'The name shown next to my sites',
  '隊友在共享路線上看到的名稱（改名只影響之後加的點）':
    'The name your party sees on the shared route (renaming only affects sites you add afterwards)',
  '名稱未能儲存（設定服務未載入）': 'Could not save your name (the settings service did not load)',
  '顯示名稱已改為「{name}」（之後加的點生效）': 'Display name changed to "{name}" (applies to sites you add from now on)',
  '名稱已清空，改回預設「{name}」': 'Name cleared — back to the default "{name}"',
  '玩家{id}': 'Player{id}',
  '📋 複製碼': '📋 Copy code',
  '已複製房號': 'Room code copied',
  '🔗 邀請連結': '🔗 Invite link',
  '已複製邀請連結': 'Invite link copied',
  '👥 {n} 人': '👥 {n} online',
  '👥 {n} 人（連線中…）': '👥 {n} online (connecting…)',
  '離開': 'Leave',
  '開新房間：': 'New room:',
  '＋ 建立房間': '＋ Create room',
  '房間已建立：{code}（把房號或邀請連結給隊友）': 'Room created: {code} — share the code or the invite link with your party',
  '建立失敗（後端未連上）': 'Could not create the room (no connection to the backend)',
  '房號自動產生，分享給隊友': 'The code is generated for you — just share it',
  '或': 'or',
  '加入朋友的房間：': 'Join a room:',
  '朋友給的 6 碼房號': '6-character room code',
  '輸入朋友的房號': 'Enter the room code',
  '房號需 6 碼': 'Room codes are 6 characters',
  '加入': 'Join',
  '最近：': 'Recent:',
  '多人挖寶？先在上方「建立 / 加入房間」': 'Digging as a group? Create or join a room above first',
  '連線中，尚未同步，請稍後再試': 'Still connecting — not synced yet, try again in a moment',
  '➕ 已加入共享路線（X:{x} Y:{y}）': '➕ Added to the shared route (X:{x} Y:{y})',
  '已從共享路線移除（X:{x} Y:{y}）': 'Removed from the shared route (X:{x} Y:{y})',
  '➕ {who} 加了 {n} 個挖掘點': '➕ {who} added {n} dig sites',
  '👥 有人加入房間（{n} 人）': '👥 Someone joined the room ({n} online)',
  '房間已過期（建立滿 6 小時），請重新建立房間': 'This room expired (rooms last 6 hours) — please create a new one',
  '房間已過期，請重新建立房間': 'Room expired — please create a new one',
  '同步暫時失敗，剛才的操作未生效，請重試': 'Sync failed for a moment — that action did not go through, please retry',
  '已斷線，重連中…': 'Disconnected — reconnecting…',
  '已斷線，重新連線中': 'Disconnected, reconnecting',
  '已重新連線': 'Reconnected',

  // ── 對話框／全域 ─────────────────────────────────────────────
  '關閉': 'Close',
  '取消': 'Cancel',
  '確定': 'OK',
  '確認': 'Confirm',
  '核心模組未載入（treasure-core.js），請重新整理。': 'Core module (treasure-core.js) failed to load. Please refresh the page.',
  '已載入 {n} 個等級': 'Loaded {n} map grades',
  '資料載入失敗，請重新整理。（{err}）': 'Failed to load data. Please refresh the page. ({err})',

  // ── 頁尾 ─────────────────────────────────────────────────────
  '挖掘點資料來源：': 'Dig-site data source:',
  '；地名 / 物品名為台服 client 解包原文。座標換算為 FFXIV 官方公式。本站為非官方玩家工具，與 SQUARE ENIX CO., LTD. 無關。':
    '; zone and item names are taken verbatim from the TW client data. Coordinates use the official FFXIV formula. This is an unofficial fan tool, not affiliated with SQUARE ENIX CO., LTD.',
};
