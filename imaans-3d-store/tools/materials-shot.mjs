#!/usr/bin/env node
// (materials dev copy of tools/shot.mjs: imports the global playwright because the local link vanished)
// Headless screenshot + stats harness (Chromium + SwiftShader WebGL2).
//
//   node tools/shot.mjs --modules architecture,footwear \
//        --cams "wall:0,1.6,-6,0,1.6,-11;wide:0,1.62,8.4,0,1.45,-4" \
//        --size 390x844 --dpr 1.5 --tier mid --out shots/footwear --stats
//
// Options
//   --modules a,b     modules to build (default: all). 'ui' is excluded unless --ui is given.
//   --cams "n:px,py,pz,tx,ty,tz[,fov];…"   camera presets (default: the start view)
//   --size WxH        viewport (default 390x844 = modern phone portrait). Landscape: 844x390. Desktop: 1440x900
//   --dpr N           device pixel ratio for the screenshot (default 1.5; SwiftShader is slow)
//   --tier low|mid|high (default mid)
//   --out DIR         output directory (default shots/tmp) — files are DIR/<cam>.png
//   --wait MS         extra settle time after ready, per camera (default 400)
//   --stats           print window.__STATS() and per-module draw calls/triangles
//   --ui              include the ui module and take one screenshot of the untouched start view (ui.png)
//   --src dist        test the bundled build in dist/ instead of src/dev.html
//   --query "k=v&…"   extra URL params
//   --timeout MS      max wait for window.__STORE_READY (default 240000)
//   --eval "js"       run JS in the page after ready (result printed), e.g. to trigger an interaction
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// local install first (npm i), then this cloud machine's global copy
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));

const [W, H] = String(args.size || '390x844').split('x').map(Number);
const dpr = Number(args.dpr || 1.5);
const tier = args.tier || 'mid';
const outDir = path.resolve(ROOT, args.out || 'shots/tmp');
fs.mkdirSync(outDir, { recursive: true });
const cams = String(args.cams || 'start:0,1.62,8.4,0,1.45,-4').split(';').filter(Boolean).map(s => {
  const [name, v] = s.split(':'); return { name, v: v.split(',').map(Number) };
});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, u);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404 ' + u); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  if (u === '/dist/index.html') {
    // mimic the artifact publisher's skeleton around the page fragment
    return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
      + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style>'
      + '</head><body>' + fs.readFileSync(f, 'utf8') + '</body></html>');
  }
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const mobile = W < 900;
const context = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
});
const page = await context.newPage();
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
page.on('pageerror', e => logs.push('[pageerror] ' + String(e && e.stack || e).slice(0, 800)));
page.on('requestfailed', r => logs.push('[requestfailed] ' + r.url()));
page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });

const qs = new URLSearchParams();
if (args.modules) qs.set('modules', String(args.modules));
qs.set('tier', tier);
if (!args.ui) { qs.set('noui', '1'); qs.set('shot', '1'); }
if (args.query) for (const [k, v] of new URLSearchParams(String(args.query))) qs.set(k, v);
const pagePath = args.src === 'dist' ? '/dist/index.html' : '/src/dev.html';
const url = `http://127.0.0.1:${port}${pagePath}?${qs}`;
const t0 = Date.now();
let ok = true;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: Number(args.timeout || 240000), polling: 500 });
} catch (e) { ok = false; logs.push('[harness] not ready: ' + e.message.split('\n')[0]); }
const readyMs = Date.now() - t0;

const shots = [];
if (args.ui) {
  await page.waitForTimeout(Number(args.wait || 1500));
  const f = path.join(outDir, 'ui.png'); await page.screenshot({ path: f }); shots.push(f);
}
if (!args.ui || args.cams) {
  for (const c of cams) {
    await page.evaluate(v => window.__setCam && window.__setCam(...v), c.v);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(Number(args.wait || 400));
    const f = path.join(outDir, c.name + '.png');
    await page.screenshot({ path: f });
    shots.push(f);
  }
}
let evalResult;
if (args.eval) { try { evalResult = await page.evaluate(String(args.eval)); } catch (e) { evalResult = 'eval error: ' + e.message; } }
let stats = null, modstats = null;
if (args.stats) {
  stats = await page.evaluate(() => window.__STATS ? window.__STATS() : null).catch(() => null);
  modstats = await page.evaluate(() => window.__MODSTATS ? window.__MODSTATS() : null).catch(() => null);
}
console.log(JSON.stringify({ ok, readyMs, url, shots: shots.map(s => path.relative(ROOT, s)), stats, modstats, evalResult, logs: logs.slice(0, 60) }, null, 1));
await browser.close();
server.close();
