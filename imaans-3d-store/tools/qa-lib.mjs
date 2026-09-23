// QA suite helpers (owned by QA): static server, Chromium/SwiftShader launch, store page, touch input,
// in-page helper bundle. Same server + launch approach as tools/shot.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// local install first (npm i), then this cloud machine's global copy
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ktx2': 'image/ktx2', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

export async function startServer() {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404 ' + u); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    if (u === '/dist/index.html') {
      // mimic the artifact publisher's skeleton around the page fragment (same as tools/shot.mjs)
      return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}img{max-width:100%}[hidden]{display:none!important}</style>'
        + '</head><body>' + fs.readFileSync(f, 'utf8') + '</body></html>');
    }
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

export function launch() {
  return chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
  });
}

// Harness / SwiftShader noise that says nothing about the store.
const NOISE = /KHR_parallel_shader_compile|GPU stall due to ReadPixels|GL_CLOSE_PATH_NV|Automatic fallback to software WebGL|favicon\.ico|WebGL: too many errors|\[\.WebGL-[0-9a-fx]+\]GL Driver Message/;

/** logs: [{kind: 'error'|'warning'|'pageerror'|'requestfailed'|'http', text}] → {errors, warnings, ignored} */
export function classifyLogs(logs, okUrls = new Set()) {
  const out = { errors: [], warnings: [], ignored: [] };
  for (const l of logs) {
    const line = `[${l.kind}] ${l.text}`;
    // Chromium logs a streamed-then-cancelled body read as ERR_ABORTED even when the file arrived (HTTP 200)
    const aborted = l.kind === 'requestfailed' && /net::ERR_ABORTED/.test(l.text) && okUrls.has(l.text.split(' ')[0]);
    if (NOISE.test(l.text) || aborted) out.ignored.push(line + (aborted ? '  (also answered 200 — harness noise)' : ''));
    else if (l.kind === 'warning') out.warnings.push(line);
    else out.errors.push(line);
  }
  return out;
}

/** Open the store and wait for window.__STORE_READY. o {W,H,dpr,tier,modules,query,src,mobile,timeout} */
export async function openStore(browser, port, o = {}) {
  const W = o.W || 390, H = o.H || 844, mobile = o.mobile ?? W < 900;
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: o.dpr || 1, isMobile: mobile, hasTouch: mobile, reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push({ kind: t, text: m.text().slice(0, 500) }); });
  page.on('pageerror', e => logs.push({ kind: 'pageerror', text: String((e && e.stack) || e).slice(0, 900) }));
  page.on('requestfailed', r => logs.push({ kind: 'requestfailed', text: r.url() + ' ' + ((r.failure() && r.failure().errorText) || '') }));
  const okUrls = new Set();
  page.on('response', r => { if (r.status() >= 400) logs.push({ kind: 'http', text: r.status() + ' ' + r.url() }); else okUrls.add(r.url()); });
  await page.addInitScript(IN_PAGE);
  const qs = new URLSearchParams();
  if (o.modules) qs.set('modules', o.modules);
  qs.set('tier', o.tier || 'mid');
  if (o.query) for (const [k, v] of new URLSearchParams(o.query)) qs.set(k, v);
  const pagePath = o.src === 'dist' ? '/dist/index.html' : '/src/dev.html';
  const url = `http://127.0.0.1:${port}${pagePath}?${qs}`;
  const t0 = Date.now();
  let ready = true, readyError = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: o.timeout || 240000, polling: 250 });
  } catch (e) { ready = false; readyError = e.message.split('\n')[0]; }
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, logs, okUrls, url, ready, readyError, readyMs: Date.now() - t0, W, H, mobile };
}

// ------------------------------------------------------------------------------------------ input (CDP)
export const nowS = () => Date.now() / 1000;
export const touch = (cdp, type, pts, ts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1 })), timestamp: ts ?? nowS() });
export async function tap(cdp, x, y) { const T = nowS(); await touch(cdp, 'touchStart', [[x, y]], T); await touch(cdp, 'touchEnd', [], T + 0.06); }
export async function mouseTap(cdp, x, y) {
  const T = nowS();
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: T - 0.05 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, timestamp: T });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, timestamp: T + 0.07 });
}
export async function drag(cdp, [x0, y0], [x1, y1], n = 10, dt = 0.016, id = 1) {
  let T = nowS();
  await touch(cdp, 'touchStart', [[x0, y0, id]], T);
  for (let i = 1; i <= n; i++) { T += dt; await touch(cdp, 'touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, id]], T); }
  T += dt; await touch(cdp, 'touchEnd', [], T);
}
export const frames = (page, n = 2) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** Wait until the store's simulated clock advanced `sec` (frames are slow under SwiftShader). */
export const simWait = (page, sec, maxMs = 60000) => page.evaluate(([sec, maxMs]) => new Promise(r => { const c = window.__ctx; if (!c) return setTimeout(() => r(0), Math.min(maxMs, sec * 1000)); const t0 = c.time, w0 = performance.now(); const f = () => (c.time - t0 >= sec || performance.now() - w0 > maxMs ? r(c.time - t0) : requestAnimationFrame(f)); f(); }), [sec, maxMs]);

// ------------------------------------------------------------------------------------------ in-page helpers
// Injected before the page scripts (addInitScript). Selector-agnostic where possible so the ui rebrand
// (class names may change) does not break the suite: panels are found by role/data-sheet/visibility.
const IN_PAGE = `(() => {
  const Q = window.__qa = {};
  Q.norm = (s) => String(s == null ? '' : s).replace(/[\\s\\u00a0\\u202f]+/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  Q.vis = (el) => {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  Q.root = () => document.getElementById('me-ui') || (() => { const b = document.querySelector('[data-act]'); if (!b) return null; let e = b; while (e.parentElement && e.parentElement !== document.body) e = e.parentElement; return e; })();
  Q.panels = () => [...document.querySelectorAll('[role="dialog"], [data-sheet]')].filter(Q.vis).filter(e => !e.parentElement.closest('[role="dialog"], [data-sheet]'));
  Q.card = () => { const c = document.querySelector('.me-card.is-open'); if (c && Q.vis(c)) return c; return Q.panels().find(e => !e.hasAttribute('data-sheet')) || null; };
  Q.sheet = (name) => { const s = document.querySelector('[data-sheet="' + name + '"]'); if (s && Q.vis(s) && (s.classList.contains('is-open') || s.getAttribute('aria-hidden') === 'false')) return s; return name ? null : (Q.panels().find(e => e.hasAttribute('data-sheet')) || null); };
  Q.anySheet = () => Q.panels().find(e => e.hasAttribute('data-sheet')) || Q.panels()[0] || null;
  Q.isStub = (fn) => typeof fn !== 'function' || /^[a-zA-Z_$]*\\s*\\([^)]*\\)\\s*\\{\\s*\\}$/.test(String(fn).trim());
  Q.bagCount = () => {
    try { const b = window.__ui && window.__ui.bag; if (b && typeof b.count === 'function') return b.count(); } catch (e) {}
    const el = document.querySelector('.me-badge') || document.querySelector('[class*="badge"]');
    const n = el ? parseInt(el.textContent, 10) : NaN; return isNaN(n) ? null : n;
  };
  Q.pose = () => { const c = window.__ctx.camera; const d = c.getWorldDirection(new window.__ctx.THREE.Vector3()); return { x: c.position.x, y: c.position.y, z: c.position.z, yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))), t: window.__ctx.time }; };
  Q.tp = (p, t) => { const c = window.__ctx; c.controlsEnabled = true; c.camera.position.set(p[0], p[1], p[2]); c.camera.lookAt(t[0], t[1], t[2]); c.camera.updateMatrixWorld(); try { window.__ui && window.__ui.controls && window.__ui.controls.resync && window.__ui.controls.resync(); } catch (e) {} };
  Q.project = (p) => { const c = window.__ctx; c.camera.updateMatrixWorld(); const v = new c.THREE.Vector3(p[0], p[1], p[2]).project(c.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; };
  Q.moduleOf = (o) => { const s = window.__ctx.scene; let last = o; for (let e = o; e && e !== s; e = e.parent) last = e; return last && last.parent === s ? (last.name || last.type) : '?'; };
  // Render control (harness only). SwiftShader frames cost ~0.5-1 s on a busy machine and the store's
  // clock advances at most 0.05 s per frame, so waits run with ctx.render swapped for a no-op (updaters,
  // controls and flights still tick every frame, in real time) and measurements render explicitly.
  // A true no-op would starve headless Chromium of frames (no canvas damage → no BeginFrame → rAF, the
  // store clock and CSS transitions all freeze), so "off" is a 1x1 scissored clear through three's state.
  Q.renderOff = () => { const c = window.__ctx, r = c.renderer; if (!Q._render) { Q._render = c.render; c.render = () => { const rt = r.getRenderTarget(); r.setRenderTarget(null); r.setScissorTest(true); r.setScissor(0, 0, 1, 1); r.clear(true, false, false); r.setScissorTest(false); r.setRenderTarget(rt); }; } };
  Q.renderOn = () => { const c = window.__ctx; if (Q._render) { c.render = Q._render; Q._render = null; } };
  Q.renderNow = () => { const c = window.__ctx; c.renderer.info.reset(); (Q._render || c.render).call(c); const i = c.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, programs: (i.programs || []).length }; };
  // Pixel-ratio cap (draw calls / triangles / programs do not depend on resolution); main.js's dynamic
  // resolution goes through setPixelRatio, so the cap holds until fullRes().
  Q.lowRes = (cap) => { const r = window.__ctx.renderer; if (!Q._spr) { Q._spr = r.setPixelRatio; Q._pr = r.getPixelRatio(); r.setPixelRatio = (v) => Q._spr.call(r, Math.min(v, cap)); } r.setPixelRatio(cap); window.dispatchEvent(new Event('resize')); };
  Q.fullRes = () => { const r = window.__ctx.renderer; if (Q._spr) { r.setPixelRatio = Q._spr; Q._spr.call(r, Q._pr); Q._spr = null; window.dispatchEvent(new Event('resize')); } };
  Q.raf = (n = 1) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
})();`;
