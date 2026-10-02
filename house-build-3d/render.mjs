#!/usr/bin/env node
// Deterministic frame export: opens index.html?export=1 in headless Chrome at 1920x1080,
// calls window.renderAt(i / 30) for every frame, saves PNGs, then encodes with ffmpeg.
//
//   node render.mjs                     full render -> frames/, house_3d.mp4, last_frame.png, timeline.json
//   node render.mjs --still 14.97       one frame -> still.png (or --out file.png)
//   node render.mjs --frames 0:89       render a frame range only (no encode)
//   node render.mjs --timeline-only     write timeline.json only
//   node render.mjs --serve [8080]      static server for the live preview
// Options: --workers N (parallel browsers, default 1), --swiftshader (force software GL),
//          --chrome /path/to/chrome, --keep-frames is implied (frames/ is never deleted).

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const DURATION = 15;
const TOTAL = FPS * DURATION;   // 450
const WIDTH = 1920;
const HEIGHT = 1080;
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/three@';

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

// ------------------------------------------------------------------ static server

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4',
};

function serve(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if (url.pathname === '/' ) file = path.join(ROOT, 'index.html');
      const data = await fsp.readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// three.js is imported from the CDN in the importmap. When node_modules/three is installed,
// requests to the CDN are answered from it: same pinned version, works offline, no drift.
function localThreeFile(url) {
  if (!url.startsWith(CDN_PREFIX)) return null;
  const rest = url.slice(CDN_PREFIX.length);           // "0.186.1/build/three.module.js"
  const slash = rest.indexOf('/');
  const rel = rest.slice(slash + 1).split('?')[0];
  const file = path.join(ROOT, 'node_modules', 'three', rel);
  return fs.existsSync(file) ? file : null;
}

// ------------------------------------------------------------------ browser

function findChrome() {
  const explicit = opt('--chrome', process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH);
  if (explicit) return explicit;
  const candidates = [
    '/opt/pw-browsers/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function launch() {
  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; } catch { puppeteer = (await import('puppeteer-core')).default; }
  const executablePath = findChrome();
  const args = ['--hide-scrollbars', '--force-device-scale-factor=1', '--ignore-gpu-blocklist', '--enable-webgl'];
  // Chrome refuses to start its sandbox as root (CI containers, cloud sandboxes).
  if (flag('--no-sandbox') || (process.getuid && process.getuid() === 0)) args.push('--no-sandbox');
  if (flag('--swiftshader')) args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  else args.push('--enable-unsafe-swiftshader');
  return puppeteer.launch({
    headless: true,
    executablePath,
    args,
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    protocolTimeout: 600000,
  });
}

async function openPage(browser, base) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const local = localThreeFile(req.url());
    if (local) {
      req.respond({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await fsp.readFile(local),
      });
    } else {
      req.continue();
    }
  });
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) console.log(`[page ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(`${base}/index.html?export=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  return page;
}

async function renderFrame(page, i, file) {
  const dataUrl = await page.evaluate((t) => window.renderFrameDataURL(t), i / FPS);
  await fsp.writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

// ------------------------------------------------------------------ main

async function main() {
  if (flag('--serve')) {
    const port = parseInt(opt('--serve', '8080'), 10) || 8080;
    await serve(port);
    console.log(`Preview: http://localhost:${port}/   (export view: http://localhost:${port}/index.html?export=1)`);
    return;
  }

  const server = await serve(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const workers = Math.max(1, parseInt(opt('--workers', '1'), 10));
  const browsers = [];
  try {
    const browser = await launch();
    browsers.push(browser);
    const page = await openPage(browser, base);
    const info = await page.evaluate(() => {
      const gl = document.getElementById('view').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log(`WebGL renderer: ${info}`);

    // timeline.json (phase times, element events, camera keys and per-frame camera samples)
    const timeline = await page.evaluate(() => window.getTimeline());
    await fsp.writeFile(path.join(ROOT, 'timeline.json'), JSON.stringify(timeline, null, 2));
    console.log('wrote timeline.json');
    if (flag('--timeline-only')) return;

    if (argv.includes('--stills')) {
      // Several stills for review: --stills 0,2.5,7.5 -> stills/still_00.00.png ...
      const times = opt('--stills', '').split(',').filter(Boolean).map(parseFloat);
      const dir = path.join(ROOT, 'stills');
      await fsp.mkdir(dir, { recursive: true });
      for (const t of times) {
        const dataUrl = await page.evaluate((tt) => window.renderFrameDataURL(tt), t);
        await fsp.writeFile(path.join(dir, `still_${t.toFixed(2).padStart(5, '0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
      }
      console.log(`wrote ${times.length} stills to stills/`);
      return;
    }

    if (argv.includes('--still')) {
      const t = parseFloat(opt('--still', '14.97'));
      const out = path.resolve(ROOT, opt('--out', 'still.png'));
      const dataUrl = await page.evaluate((tt) => window.renderFrameDataURL(tt), t);
      await fsp.writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(`wrote ${path.relative(ROOT, out)} (t = ${t})`);
      return;
    }

    const range = opt('--frames', `0:${TOTAL - 1}`).split(':').map((n) => parseInt(n, 10));
    const [first, last] = [Math.max(0, range[0]), Math.min(TOTAL - 1, range[1] ?? range[0])];
    const framesDir = path.join(ROOT, 'frames');
    await fsp.mkdir(framesDir, { recursive: true });

    const pages = [page];
    for (let w = 1; w < workers; w++) {
      const b = await launch();
      browsers.push(b);
      pages.push(await openPage(b, base));
    }

    const queue = [];
    for (let i = first; i <= last; i++) queue.push(i);
    const total = queue.length;
    let done = 0;
    const t0 = Date.now();
    await Promise.all(pages.map(async (pg) => {
      while (queue.length) {
        const i = queue.shift();
        await renderFrame(pg, i, path.join(framesDir, `f_${String(i).padStart(4, '0')}.png`));
        done++;
        if (done % 10 === 0 || done === total) {
          const el = (Date.now() - t0) / 1000;
          const eta = (el / done) * (total - done);
          process.stdout.write(`frame ${done}/${total}  ${el.toFixed(0)} s elapsed  ~${eta.toFixed(0)} s left\n`);
        }
      }
    }));

    const fullRun = first === 0 && last === TOTAL - 1;
    if (fullRun || fs.existsSync(path.join(framesDir, `f_${String(TOTAL - 1).padStart(4, '0')}.png`))) {
      await fsp.copyFile(path.join(framesDir, `f_${String(TOTAL - 1).padStart(4, '0')}.png`), path.join(ROOT, 'last_frame.png'));
      console.log('wrote last_frame.png (frame 449)');
    }
    if (fullRun && !flag('--no-video')) {
      await run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', 'frames/f_%04d.png',
        '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', 'house_3d.mp4']);
      console.log('wrote house_3d.mp4');
    }
  } finally {
    await Promise.all(browsers.map((b) => b.close().catch(() => {})));
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

