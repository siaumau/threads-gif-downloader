// Threads 貼文內嵌 Giphy GIF 擷取／下載核心
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SIZE_URL = {
  orig: (id) => `https://i.giphy.com/${id}.gif`,               // 原尺寸（檔案大）
  200: (id) => `https://media.giphy.com/media/${id}/200.gif`,  // 200px
  100: (id) => `https://media.giphy.com/media/${id}/100.gif`,  // 100px（最小）
};

function parseCode(url) {
  const m = String(url).match(/\/post\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('網址裡找不到貼文代碼 (/post/XXXX)');
  return m[1];
}

// 開無頭 Chromium 載入貼文，回傳主貼文（不含留言）裡所有 Giphy ID，順序即貼文排列順序
async function extractIds(url, code) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(String(url).split('?')[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('img[src*="giphy"]', { timeout: 30000 });
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);

    return await page.evaluate((CODE) => {
      const gifIds = (n) =>
        [...n.querySelectorAll('img')]
          .map((i) => ((i.currentSrc || i.src).match(/\/media\/[^/]+\/([^/]+)\//) || [])[1])
          .filter(Boolean);
      // 頁面上最後一個指向本貼文的 <a> = 貼文本身的時間戳連結
      const anchors = [...document.querySelectorAll('a')].filter((a) => a.href.includes(CODE));
      if (!anchors.length) return { error: 'no-anchor' };
      let scope = anchors[anchors.length - 1];
      // 往上取「還沒包含其他貼文連結」的最大祖先 = 這則貼文的區塊（排除留言）
      for (let p = scope; (p = p.parentElement); ) {
        const others = [...p.querySelectorAll('a')].filter(
          (a) => /\/post\//.test(a.href) && !a.href.includes(CODE)
        );
        if (others.length > 0) break;
        scope = p;
      }
      return { ids: gifIds(scope), text: scope.innerText.slice(0, 80) };
    }, code);
  } finally {
    await browser.close();
  }
}

// 單張下載；Giphy CDN 偶爾會斷，失敗自動重試
async function downloadOne(id, dest, size, attempts = 3) {
  let lastErr;
  for (let a = 1; a <= attempts; a++) {
    try {
      const res = await fetch(SIZE_URL[size](id), { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 4).toString('latin1') !== 'GIF8') throw new Error('不是 GIF 檔');
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) {
      lastErr = e;
      if (a < attempts) await new Promise((r) => setTimeout(r, 400 * a));
    }
  }
  throw lastErr;
}

// 併發下載（預設 6 條），onProgress({done,total,ok,failed}) 逐張回報
async function downloadAll(ids, outDir, size, onProgress, concurrency = 6) {
  fs.mkdirSync(outDir, { recursive: true });
  const width = String(ids.length).length;
  const names = ids.map((id, i) => `${String(i + 1).padStart(width, '0')}_${id}.gif`);
  let cursor = 0, done = 0, ok = 0, bytes = 0;
  const failed = [];

  const worker = async () => {
    while (cursor < ids.length) {
      const i = cursor++;
      try {
        // 注意: 不可寫成 bytes += await ...，併發下會讀到過期的 bytes 而漏計
        const n = await downloadOne(ids[i], path.join(outDir, names[i]), size);
        bytes += n;
        ok++;
      } catch (e) {
        failed.push({ id: ids[i], error: e.message });
      }
      done++;
      if (onProgress) onProgress({ done, total: ids.length, ok, failed: failed.length, name: names[i] });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return { ok, bytes, failed, names };
}

module.exports = { UA, SIZE_URL, parseCode, extractIds, downloadOne, downloadAll };
