#!/usr/bin/env node
// CLI: node get-thread-gif.js <threads 貼文網址> [輸出資料夾] [--size=orig|200|100]
const path = require('path');
const { SIZE_URL, parseCode, extractIds, downloadAll } = require('./lib');

(async () => {
  const argv = process.argv.slice(2);
  const size = (argv.find((a) => a.startsWith('--size=')) || '--size=orig').split('=')[1];
  if (!SIZE_URL[size]) { console.error('--size 只能是 orig / 200 / 100'); process.exit(1); }
  const rest = argv.filter((a) => !a.startsWith('--'));
  const url = rest[0];
  if (!url) { console.error('用法: node get-thread-gif.js <threads 貼文網址> [輸出資料夾] [--size=orig|200|100]'); process.exit(1); }

  const code = parseCode(url);
  const outDir = path.resolve(rest[1] || path.join('downloads', code));

  console.log(`> 讀取貼文 ${code} ...`);
  const r = await extractIds(url, code);
  if (r.error === 'no-anchor') { console.error('找不到這則貼文（可能被刪除、設為私人，或 Threads 版面改了）'); process.exit(2); }
  if (!r.ids.length) { console.error('這則貼文裡沒有 Giphy GIF'); process.exit(3); }

  console.log(`> 找到 ${r.ids.length} 個 GIF，輸出到 ${outDir}`);
  const res = await downloadAll(r.ids, outDir, size, (p) => process.stdout.write(`\r  ${p.done}/${p.total}`));
  console.log(`\n> 完成: ${res.ok}/${r.ids.length} 個檔案, ${(res.bytes / 1048576).toFixed(1)} MB`);
  res.failed.forEach((f) => console.warn(`  ! ${f.id}: ${f.error}`));
})();
