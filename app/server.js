// 本機網頁介面：貼上 Threads 網址 → 自動下載該貼文所有 GIF
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const { SIZE_URL, parseCode, extractIds, downloadAll } = require('./lib');
const { makeZip, makeContactSheet } = require('./postprocess');

const PORT = Number(process.env.PORT) || 5123;
const ROOT = __dirname;
// 輸出位置：預設放在程式旁邊，啟動程式會用 DOWNLOAD_DIR 指到 exe 所在資料夾
const DOWNLOADS = path.resolve(process.env.DOWNLOAD_DIR || path.join(ROOT, 'downloads'));

const jobs = new Map(); // id -> { events: [], clients: Set, finished: bool }
let busy = false;

function emit(job, type, data) {
  const ev = { type, ...data };
  job.events.push(ev);
  const chunk = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of job.clients) res.write(chunk);
  if (type === 'done' || type === 'error') {
    job.finished = true;
    for (const res of job.clients) res.end();
    job.clients.clear();
  }
}

async function runJob(job, url, size) {
  const code = parseCode(url);
  const outDir = path.join(DOWNLOADS, code);
  emit(job, 'start', { code });

  const r = await extractIds(url, code);
  if (r.error === 'no-anchor') throw new Error('找不到這則貼文（可能被刪除、設為私人，或 Threads 版面改了）');
  if (!r.ids || !r.ids.length) throw new Error('這則貼文裡沒有 Giphy GIF');
  emit(job, 'found', { code, total: r.ids.length });

  const res = await downloadAll(r.ids, outDir, size, (p) => {
    emit(job, 'progress', { done: p.done, total: p.total, ok: p.ok, failed: p.failed, file: `/files/${code}/${p.name}` });
  });

  emit(job, 'postprocess', { step: 'zip' });
  const zipName = `${code}.zip`;
  const zipBytes = await makeZip(outDir, path.join(outDir, zipName));

  emit(job, 'postprocess', { step: 'sheet' });
  let sheet = null;
  try {
    const sheetName = `${code}_overview.png`;
    await makeContactSheet(outDir, res.names, path.join(outDir, sheetName));
    sheet = `/files/${code}/${sheetName}`;
  } catch (e) {
    emit(job, 'warn', { message: `總覽圖失敗: ${e.message}` });
  }

  // 自動開啟資料夾
  try { spawn('explorer.exe', [outDir], { detached: true, stdio: 'ignore' }).unref(); } catch {}

  emit(job, 'done', {
    code, dir: outDir,
    ok: res.ok, total: r.ids.length,
    bytes: res.bytes,
    failed: res.failed,
    zip: `/files/${code}/${zipName}`, zipBytes,
    sheet,
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.gif': 'image/gif', '.png': 'image/png', '.zip': 'application/zip' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return fs.createReadStream(path.join(ROOT, 'public', 'index.html')).pipe(res);
  }

  // 靜態提供已下載的檔案（路徑必須落在 downloads/ 內）
  if (u.pathname.startsWith('/files/')) {
    const rel = decodeURIComponent(u.pathname.slice('/files/'.length));
    const file = path.resolve(DOWNLOADS, rel);
    if (!file.startsWith(DOWNLOADS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }

  if (u.pathname === '/api/download' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    let payload;
    try { payload = JSON.parse(body); } catch { return json(res, 400, { error: '格式錯誤' }); }
    const { url, size = 'orig' } = payload;
    if (!SIZE_URL[size]) return json(res, 400, { error: '尺寸參數錯誤' });
    try { parseCode(url); } catch (e) { return json(res, 400, { error: e.message }); }
    if (busy) return json(res, 409, { error: '上一個任務還在跑，請等它結束' });

    busy = true;
    const id = randomUUID();
    const job = { events: [], clients: new Set(), finished: false };
    jobs.set(id, job);
    runJob(job, url, size)
      .catch((e) => emit(job, 'error', { message: e.message }))
      .finally(() => { busy = false; });
    return json(res, 200, { jobId: id });
  }

  if (u.pathname.startsWith('/api/events/')) {
    const job = jobs.get(u.pathname.slice('/api/events/'.length));
    if (!job) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    for (const ev of job.events) res.write(`data: ${JSON.stringify(ev)}\n\n`); // 補送已發生的事件
    if (job.finished) return res.end();
    job.clients.add(res);
    req.on('close', () => job.clients.delete(res));
    return;
  }

  if (u.pathname === '/api/open' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    const { dir } = JSON.parse(body || '{}');
    const target = path.resolve(dir || DOWNLOADS);
    if (!target.startsWith(DOWNLOADS)) return json(res, 400, { error: '路徑不允許' });
    try { spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref(); } catch {}
    return json(res, 200, { ok: true });
  }

  res.writeHead(404); res.end('not found');
});

// 啟動程式若被關掉（含強制結束），跟著收工，避免留下孤兒程序占用連接埠
if (process.env.PARENT_PID) {
  const ppid = Number(process.env.PARENT_PID);
  setInterval(() => {
    try { process.kill(ppid, 0); } catch { process.exit(0); }
  }, 3000).unref();
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`連接埠 ${PORT} 已被占用 —— 可能已經有一個下載器在跑了。`);
    console.error(`直接開 http://127.0.0.1:${PORT} 就好；要換埠號可設環境變數 PORT。`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://127.0.0.1:${PORT}`;
  console.log(`Threads GIF 下載器  →  ${addr}   (Ctrl+C 結束)`);
  if (!process.env.NO_OPEN) spawn('cmd', ['/c', 'start', '', addr], { detached: true, stdio: 'ignore' }).unref();
});
