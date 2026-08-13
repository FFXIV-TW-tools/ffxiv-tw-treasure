/* tests/i18n.test.mjs — 薄 wrapper：實際檢查全部在 portal 共用哨兵。
 *
 * 本站**刻意不自寫哨兵**：pilot 期那三支共 483 行，其中 89% 與工具內容無關（認的是
 * `t()`／`data-i18n`／shim 這套共用契約的形狀）。抄第二份就是本 monorepo 明文禁止的
 * 「共用功能平行實作」，而抄錯的症狀是**哨兵自己失效**——照樣印綠、只是少檢查了東西。
 * 屬於本站的事實只留在 repo 根的 `i18n.config.json`（檔案清單與白名單）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = resolve(ROOT, '..', 'ffxiv-tw-tools-portal', 'tools', 'i18n-check.mjs');

if (!existsSync(CHECK)) {
  // 拿不到共用哨兵時**一律失敗**：skip 在輸出上與 pass 無法區分，
  // 而這支存在的意義就是「有沒有真的檢查過」。
  console.error(`✗ 找不到共用哨兵 ${CHECK}——external/ 同層應有 portal repo`);
  process.exit(1);
}
process.stdout.write(execFileSync(process.execPath, [CHECK, '--repo', ROOT], { encoding: 'utf8' }));
