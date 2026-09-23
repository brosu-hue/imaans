// Shared helpers for the ui owner's tools (ui-test.mjs, ui-shots.mjs). Same static server + SwiftShader
// launch approach as tools/shot.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []));
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

export async function startServer() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404 ' + u); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    if (u === '/dist/index.html') {
      return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style>'
        + '</head><body>' + fs.readFileSync(f, 'utf8') + '</body></html>');
    }
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

export async function launch() {
  return chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
}

/** Opens the store; resolves once window.__STORE_READY. opts {W,H,dpr,modules,tier,src,query,reducedMotion} */
export async function openStore(browser, port, o = {}) {
  const W = o.W || 390, H = o.H || 844, mobile = o.mobile ?? W < 900;
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: o.dpr || 1, isMobile: mobile, hasTouch: mobile,
    reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)); });
  page.on('pageerror', e => logs.push('[pageerror] ' + String(e && e.stack || e).slice(0, 800)));
  page.on('requestfailed', r => logs.push('[requestfailed] ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  const qs = new URLSearchParams();
  if (o.modules) qs.set('modules', o.modules);
  qs.set('tier', o.tier || 'mid');
  if (o.query) for (const [k, v] of new URLSearchParams(o.query)) qs.set(k, v);
  const pagePath = o.src === 'dist' ? '/dist/index.html' : '/src/dev.html';
  const url = `http://127.0.0.1:${port}${pagePath}?${qs}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  if (o.beforeReady) await o.beforeReady(page);
  await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: o.timeout || 240000, polling: 250 });
  return { context, page, logs, url, readyMs: Date.now() - t0 };
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
