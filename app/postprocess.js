// 下載後處理：打包 zip、合併總覽圖
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const sharp = require('sharp');

function makeZip(srcDir, zipPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    const ar = archiver('zip', { zlib: { level: 6 } });
    out.on('close', () => resolve(ar.pointer()));
    ar.on('error', reject);
    ar.pipe(out);
    ar.glob('*.gif', { cwd: srcDir });
    ar.finalize();
  });
}

// 把每個 GIF 的第一格縮成 cell×cell，拼成一張透明底 PNG 總覽圖
async function makeContactSheet(srcDir, names, outPath, cell = 96) {
  const cols = Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / cols);
  const tiles = [];
  for (let i = 0; i < names.length; i++) {
    const f = path.join(srcDir, names[i]);
    if (!fs.existsSync(f)) continue;
    try {
      const buf = await sharp(f, { pages: 1 })
        .resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      tiles.push({ input: buf, left: (i % cols) * cell, top: Math.floor(i / cols) * cell });
    } catch { /* 個別圖失敗就跳過 */ }
  }
  if (!tiles.length) throw new Error('沒有可用的圖片');
  await sharp({
    create: { width: cols * cell, height: rows * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(tiles)
    .png()
    .toFile(outPath);
  return { cols, rows, count: tiles.length };
}

module.exports = { makeZip, makeContactSheet };
