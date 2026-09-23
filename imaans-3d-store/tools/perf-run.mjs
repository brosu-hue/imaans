#!/usr/bin/env node
// Load-time + shader-warmup + frame-hitch measurement (Chromium + SwiftShader, like tools/shot.mjs).
//
//   node tools/perf-run.mjs [--src dist] [--tier mid] [--size 390x844] [--dpr 1] [--modules a,b]
//                           [--runs 1] [--label name] [--no-sweep] [--no-prefetch] [--latency ms] [--live] [--query "k=v"] [--ui]
//
// Per run it reports:
//   buildMs            main.js stats.buildMs (boot → ready event)
//   readyAt            ms from navigation start to the 'ready' event (loader starts to fade)
//   firstFrameAt       ms from navigation start to the end of the first frame after 'ready' (the reveal frame)
//   revealFrameMs      duration of that first frame (shadow bake + any late shader compile shows up here)
//   maxFrameAfterReady longest rAF callback in the 3 s after ready
//   programs           renderer.info.programs.length at ready → after a 360° sweep from 3 positions
//   sweepNewPrograms   programs compiled during the sweep (the "first turn-around hitch"; target 0)
//   sweepMaxFrameMs    longest frame during the sweep
//   longTasks          main-thread long tasks (> 50 ms) before ready: count / total ms
//   net                model / texture request timeline: first start, last end, bytes
// Results are printed and written to shots/perf/<label>.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// local install first (npm i), then this cloud machine's global copy
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
import { scanModels } from './perf-models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const [W, H] = String(args.size || '390x844').split('x').map(Number);
const dpr = Number(args.dpr || 1);
const tier = args.tier || 'mid';
const runs = Number(args.runs || 1);
const label = String(args.label || `${args.src === 'dist' ? 'dist' : 'src'}-${tier}`);
const outDir = path.join(ROOT, 'shots/perf');
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
// Optional simulated latency per request (ms) — phones on 4G see ~60–120 ms RTT; the harness is on localhost.
const LAT = Number(args.latency || 0);
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, u);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404 ' + u); }
  const send = () => {
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    if (u === '/dist/index.html') {
      return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        + '<style>body{margin:0}</style></head><body>' + fs.readFileSync(f, 'utf8') + '</body></html>');
    }
    fs.createReadStream(f).pipe(res);
  };
  if (LAT) setTimeout(send, LAT); else send();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// Injected before any page script: frame timing + long tasks + ready timestamp.
const INIT = () => {
  const P = (window.__PERF = { frames: [], long: [], readyAt: 0 });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); try { cb(t); } finally { const e = performance.now(); if (e - s > 4 || P.readyAt) P.frames.push([Math.round(s), Math.round(e - s)]); if (P.frames.length > 4000) P.frames.splice(0, 1000); } });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no longtask API */ }
  const hook = () => {
    if (window.__ctx && window.__ctx.events) { window.__ctx.events.addEventListener('ready', () => { P.readyAt = performance.now(); }); return; }
    setTimeout(hook, 5);
  };
  hook();
};

const browser = await chromium.launch({ headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'] });
const results = [];
for (let r = 0; r < runs; r++) {
  const mobile = W < 900;
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(INIT);
  if (args.src !== 'dist' && !args['no-prefetch']) await context.addInitScript((p) => { window.__PREFETCH__ = p; }, scanModels(ROOT).prefetch);
  const page = await context.newPage();
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', e => logs.push('[pageerror] ' + String(e && e.message || e).slice(0, 300)));
  page.on('response', resp => { if (resp.status() >= 400) logs.push(`[http ${resp.status()}] ${resp.url()}`); });
  const qs = new URLSearchParams();
  if (args.modules) qs.set('modules', String(args.modules));
  qs.set('tier', tier);
  if (!args.ui) { qs.set('noui', '1'); if (!args.live) qs.set('shot', '1'); } // --live: no shot mode → governor + frame-skip run
  if (args.query) for (const [k, v] of new URLSearchParams(String(args.query))) qs.set(k, v);
  const url = `http://127.0.0.1:${port}${args.src === 'dist' ? '/dist/index.html' : '/src/dev.html'}?${qs}`;
  const t0 = Date.now();
  let ok = true;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: 300000, polling: 250 });
  } catch (e) { ok = false; logs.push('[harness] not ready: ' + e.message.split('\n')[0]); }
  const wallMs = Date.now() - t0;
  await page.waitForTimeout(3000); // let the reveal settle (3 s of frames after ready)
  let live = null;
  if (args.live) { // sample the dynamic-resolution governor for 16 s with the camera at rest
    live = await page.evaluate(async () => { const out = []; for (let i = 0; i < 16; i++) { await new Promise(r => setTimeout(r, 1000)); const s = window.__STATS(); out.push(`${s.dpr.toFixed(2)}@${s.fps}fps`); } const s = window.__STATS(); return { dprTrace: out.join(' '), dprChanges: s.perf.dprChanges, framesSkipped: s.perf.frameSkip, minDpr: window.__ctx.q.minDpr }; }).catch(e => ({ error: e.message }));
  }
  const res = await page.evaluate(async (doSweep) => {
    const P = window.__PERF, S = window.__STATS ? window.__STATS() : {};
    const ctx = window.__ctx, r = ctx && ctx.renderer;
    const after = P.frames.filter(f => f[0] >= P.readyAt);
    const first = after[0];
    const within3 = after.filter(f => f[0] < P.readyAt + 3000);
    const longBefore = P.long.filter(l => l[0] < P.readyAt);
    const out = {
      buildMs: S.buildMs, modules: S.modules, readyAt: Math.round(P.readyAt),
      firstFrameAt: first ? first[0] + first[1] : null, revealFrameMs: first ? first[1] : null,
      maxFrameAfterReady: Math.max(0, ...within3.map(f => f[1])),
      longTasksBeforeReady: { n: longBefore.length, ms: longBefore.reduce((a, l) => a + l[1], 0), max: Math.max(0, ...longBefore.map(l => l[1])) },
      programsAtReady: r ? r.info.programs.length : null, calls: S.calls, triangles: S.triangles, textures: S.textures, geometries: S.geometries,
      errors: S.errors, perf: S.perf || null,
    };
    // network timeline (resource timing is relative to navigation start)
    const res = performance.getEntriesByType('resource').map(e => ({ n: e.name.replace(location.origin, ''), s: Math.round(e.startTime), e: Math.round(e.responseEnd), b: e.encodedBodySize || e.transferSize || 0 }));
    const grp = (re) => { const a = res.filter(x => re.test(x.n)); return a.length ? { n: a.length, firstStart: Math.min(...a.map(x => x.s)), lastEnd: Math.max(...a.map(x => x.e)), kb: Math.round(a.reduce((s, x) => s + x.b, 0) / 1024) } : null; };
    out.net = { models: grp(/\/models\/[^/]+\.(glb|gltf\.json)/), modelTex: grp(/\/models\/[^/]+\.(webp|png|jpg)$/), tex: grp(/\/tex\//), all: grp(/./) };
    out.modelTimeline = res.filter(x => /\/models\/[^/]+\.(glb|gltf\.json)/.test(x.n)).map(x => `${x.n.split('/').pop()} ${x.s}→${x.e}`);
    // GPU memory estimate (bytes): textures by Source (RGBA8 = 4 B/px, half float 8, float 16; ×4/3 with mips),
    // the environment map, shadow maps, post-processing targets and the drawing buffer (MSAA ×4 when antialias).
    if (ctx) {
      const T = ctx.THREE, seen = new Map();
      const bpp = (t) => (t.type === T.HalfFloatType ? 8 : t.type === T.FloatType ? 16 : 4);
      const texBytes = (t) => {
        const im = t.image || (t.source && t.source.data); if (!im) return 0;
        const w = im.width || im.videoWidth || 0, h = im.height || im.videoHeight || 0;
        const mips = t.generateMipmaps !== false && t.minFilter !== T.LinearFilter && t.minFilter !== T.NearestFilter ? 4 / 3 : 1;
        return w * h * bpp(t) * mips * (t.isCubeTexture ? 6 : 1);
      };
      const addTex = (t, cat) => { if (!t || !t.isTexture) return; const k = t.source ? t.source.uuid : t.uuid; if (seen.has(k)) return; seen.set(k, [cat, texBytes(t), t.name || '']); };
      ctx.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v, v.isCanvasTexture || (v.image && v.image.getContext) ? 'canvas' : 'image'); } if (o.material && o.material.uniforms) for (const u of Object.values(o.material.uniforms)) if (u && u.value && u.value.isTexture) addTex(u.value, 'uniform'); });
      if (ctx.scene.environment) addTex(ctx.scene.environment, 'env');
      if (ctx.scene.background && ctx.scene.background.isTexture) addTex(ctx.scene.background, 'env');
      const cat = {}; for (const [c, b] of seen.values()) cat[c] = (cat[c] || 0) + b;
      let shadow = 0; ctx.scene.traverse(o => { if (o.isLight && o.castShadow && o.shadow && o.shadow.map) shadow += o.shadow.mapSize.x * o.shadow.mapSize.y * 8 * (o.isPointLight ? 6 : 1); });
      let post = 0; const mg = window.__magic && window.__magic.post;
      if (mg && mg.composer) for (const rt of [mg.composer.renderTarget1, mg.composer.renderTarget2]) if (rt) post += rt.width * rt.height * (bpp(rt.texture) + 4) * Math.max(1, rt.samples || 1);
      const c = r.domElement, aa = r.getContextAttributes().antialias ? 4 : 1;
      const drawBuf = c.width * c.height * 8 * aa + c.width * c.height * 4;
      const MB = (b) => +(b / 1048576).toFixed(1);
      const texTotal = Object.values(cat).reduce((a, b) => a + b, 0);
      out.gpuMemMB = { textures: MB(texTotal), byKind: Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, MB(v)])), textureSources: seen.size,
        largest: [...seen.values()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c2, b, n]) => `${n || c2} ${MB(b)}`),
        shadowMaps: MB(shadow), postTargets: MB(post), drawingBuffer: MB(drawBuf), total: MB(texTotal + shadow + post + drawBuf) };
    }
    if (doSweep && ctx) {
      const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const p0 = r.info.programs.length; let maxF = 0; const hits = [];
      const f0 = P.frames.length;
      const spots = [[0, 1.62, 8.4], [0, 1.62, 0], [0, 1.62, -7], [-5, 1.62, 3], [5, 1.62, 3]];
      for (const [px, py, pz] of spots) for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, before = r.info.programs.length;
        window.__setCam(px, py, pz, px + Math.sin(a) * 5, 1.4, pz - Math.cos(a) * 5);
        await frame();
        if (r.info.programs.length > before) hits.push(`${px},${pz}@${i * 30}°:+${r.info.programs.length - before}`);
      }
      for (const f of P.frames.slice(f0)) maxF = Math.max(maxF, f[1]);
      out.sweep = { programsBefore: p0, programsAfter: r.info.programs.length, newPrograms: r.info.programs.length - p0, maxFrameMs: maxF, hits: hits.slice(0, 20) };
    }
    // hidden tab → no frames (fake a visibilitychange: headless pages are never really hidden)
    if (ctx) {
      const wait = (ms) => new Promise(res => setTimeout(res, ms));
      const framesWithin = async (ms, need) => { const f0 = r.info.render.frame, t0 = performance.now(); while (performance.now() - t0 < ms && r.info.render.frame - f0 < need) await wait(50); return r.info.render.frame - f0; };
      const vis = await framesWithin(10000, 2);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      await wait(300); // a frame already in flight may still land
      const hid = await framesWithin(2500, 1000);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      const resumed = await framesWithin(10000, 2);
      out.hiddenTab = { visibleFrames: vis, hiddenFrames2500ms: hid, resumedFrames: resumed, ok: vis > 0 && hid === 0 && resumed > 0 };
    }
    return out;
  }, !args['no-sweep']).catch(e => ({ error: e.message }));
  results.push({ ok, wallMs, ...res, live, logs: logs.slice(0, 20) });
  await context.close();
}
await browser.close(); server.close();
const med = (k) => { const v = results.map(x => typeof k === 'function' ? k(x) : x[k]).filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const summary = { label, tier, src: args.src || 'src', size: `${W}x${H}`, dpr, runs,
  median: { buildMs: med('buildMs'), readyAt: med('readyAt'), firstFrameAt: med('firstFrameAt'), revealFrameMs: med('revealFrameMs'), maxFrameAfterReady: med('maxFrameAfterReady'),
    programsAtReady: med('programsAtReady'), sweepNewPrograms: med(x => x.sweep && x.sweep.newPrograms), sweepMaxFrameMs: med(x => x.sweep && x.sweep.maxFrameMs), modelsLastEnd: med(x => x.net && x.net.models && x.net.models.lastEnd) },
  results };
fs.writeFileSync(path.join(outDir, label + '.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
