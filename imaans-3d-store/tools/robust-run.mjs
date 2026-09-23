// Robustness harness (core owner): boots the FULL store from any store root (e.g. a scratch copy with a
// re-imported content variant) and checks that it still works — no errors, every department populated,
// every product card valid (catalogue price in the site's currency, image or placeholder), info pages,
// plus optional network / storage / orientation / pause / long-session experiments.
//
//   node tools/robust-run.mjs --root <store copy> --name few [--tier mid] [--size 390x844]
//        [--live <content.json> [--live-mode fallback|is]]   inject window.IS_FALLBACK_CONTENT / window.IS.content
//        [--delay 'regex=ms']       delay matching requests (slow network), e.g. 'models|tex=4000'
//        [--fail404 regex]          answer matching requests with 404       [--hang regex] never answer them
//        [--nostorage]              localStorage / sessionStorage throw (Safari private mode)
//        [--rotate]                 swap portrait/landscape mid-load and again after ready
//        [--pause]                  IMAANS_STORE pause/resume + visibilitychange checks
//        [--wander 300]             seconds of simulated wandering, sampling GPU/JS memory
//        [--shots]                  screenshots of 4 tour stops → <out>/<name>-*.jpg
//        [--out shots/robust] [--timeout 300000]
// Prints one JSON report (also <out>/<name>.json). Exit 1 on FAIL. Uses qa-lib's Chromium launch.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launch, classifyLogs, parseArgs, sleep } from './qa-lib.mjs';
import { scanModels } from './perf-models.mjs';

const A = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(A.root || path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const NAME = A.name || 'run';
const OUT = path.resolve(A.out || path.join(ROOT, 'shots/robust'));
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = String(A.size || '390x844').split('x').map(Number);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.hdr': 'application/octet-stream' };

function serve(root) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(root, u);
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404 ' + u); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const report = { name: NAME, root: ROOT, size: `${W}x${H}`, tier: A.tier || 'mid', checks: [], notes: [] };
const row = (id, status, detail) => { report.checks.push({ id, status, detail }); process.stderr.write(`[${NAME}] ${status} ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}\n`); };

const server = await serve(ROOT);
const port = server.address().port;
const browser = await launch();
const mobile = W < 900;
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const page = await context.newPage();
const logs = [], okUrls = new Set();
page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push({ kind: t, text: m.text().slice(0, 500), at: Date.now() }); });
page.on('pageerror', e => logs.push({ kind: 'pageerror', text: String((e && e.stack) || e).slice(0, 900), at: Date.now() }));
page.on('requestfailed', r => logs.push({ kind: 'requestfailed', text: r.url() + ' ' + ((r.failure() && r.failure().errorText) || ''), at: Date.now() }));
page.on('response', r => { if (r.status() >= 400) logs.push({ kind: 'http', text: r.status() + ' ' + r.url(), at: Date.now() }); else okUrls.add(r.url()); });

let pre = null; try { pre = scanModels(ROOT).prefetch; } catch (e) { report.notes.push('prefetch scan failed: ' + e.message); }
if (pre) await context.addInitScript((p) => { window.__PREFETCH__ = p; }, pre);
if (A.live) {
  const doc = JSON.parse(fs.readFileSync(A.live, 'utf8'));
  await context.addInitScript(([doc, mode]) => { if (mode === 'is') window.IS = { content: doc }; else window.IS_FALLBACK_CONTENT = doc; }, [doc, A['live-mode'] || 'fallback']);
}
if (A.nostorage) await context.addInitScript(() => {
  const thrower = { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } };
  try { Object.defineProperty(window, 'localStorage', thrower); Object.defineProperty(window, 'sessionStorage', thrower); } catch (e) { /* */ }
});
const expected404 = [];
if (A.delay || A.fail404 || A.hang) {
  const [dre, dms] = A.delay ? String(A.delay).split('=') : [null, 0];
  const D = dre ? new RegExp(dre) : null, F = A.fail404 ? new RegExp(A.fail404) : null, HG = A.hang ? new RegExp(A.hang) : null;
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (F && F.test(u)) { expected404.push(u); return route.fulfill({ status: 404, body: 'gone' }); }
    if (HG && HG.test(u)) { expected404.push(u); return; } // never answered
    if (D && D.test(u)) await sleep(+dms);
    return route.continue().catch(() => {});
  });
}

const qs = new URLSearchParams({ tier: report.tier });
const url = `http://127.0.0.1:${port}/src/dev.html?${qs}`;
const t0 = Date.now();
let ready = true, readyError = null;
const loaderTrace = [];
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  if (A.rotate) { await sleep(2500); await page.setViewportSize({ width: H, height: W }); await page.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); report.notes.push('rotated to landscape mid-load'); }
  // loader progress trace (never stuck): sample the ui loader state every 2 s until ready
  const deadline = Date.now() + (+A.timeout || 300000);
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => ({ ready: window.__STORE_READY === true, t: Math.round(performance.now() / 1000), prog: (() => { const el = document.querySelector('[class*="load"] [class*="bar"], .me-load-bar, [data-progress]'); return el ? (el.style.width || el.getAttribute('data-progress') || '') : ''; })(), label: (document.querySelector('.me-loader, [class*="loader"]') || {}).textContent || '' })).catch(() => null);
    if (s) { loaderTrace.push([s.t, s.prog, s.label.replace(/\s+/g, ' ').trim().slice(0, 40)]); if (s.ready) break; }
    await sleep(2000);
  }
  if (!(await page.evaluate(() => window.__STORE_READY === true))) throw new Error('not ready after timeout');
} catch (e) { ready = false; readyError = e.message.split('\n')[0]; }
report.readyMs = Date.now() - t0;
report.loaderTrace = loaderTrace.filter((r, i, a) => i === 0 || i === a.length - 1 || r[1] !== a[i - 1][1] || r[2] !== a[i - 1][2]).slice(-25);
row('boot', ready ? 'PASS' : 'FAIL', ready ? `ready in ${(report.readyMs / 1000).toFixed(1)} s` : readyError);

// ------------------------------------------------------------------ in-page content checks
const content = ready ? await page.evaluate(() => {
  const c = window.__ctx, cat = c.catalog, THREE = c.THREE, out = { problems: [], warnings: [] };
  const P = (s) => out.problems.length < 40 && out.problems.push(s), Wn = (s) => out.warnings.length < 40 && out.warnings.push(s);
  out.source = cat.source || '(catalog.source missing)';
  out.products = cat.products.length;
  out.byCat = {}; for (const p of cat.products) out.byCat[p.category] = (out.byCat[p.category] || 0) + 1;
  out.departments = (c.brand.departments || []).map(d => d.id + ':' + d.name);
  const sym = cat.formatPrice(0);
  out.sample = { zero: sym, big: cat.formatPrice(123456789), neg: cat.formatPrice(-5050), nan: cat.formatPrice(NaN), undef: cat.formatPrice(undefined) };
  // every product's card
  for (const p of cat.products) {
    let info; try { info = cat.card(p); } catch (e) { P('card() threw for ' + p.id + ': ' + e.message); continue; }
    if (!info || !info.title) P('card without title: ' + p.id);
    if (!/\d/.test(info.price || '') && info.price !== '') P(`card price "${info.price}" for ${p.id}`);
    if (/NaN|undefined|null/.test(String(info.price) + (info.wasPrice == null ? '' : String(info.wasPrice)))) P(`bad price text "${info.price}" / "${info.wasPrice}" (${p.id})`);
    if (info.wasPrice && cat.priceOf(p) >= p.priceCents) P('sale shown but sale price >= price: ' + p.id);
    for (const k of ['sizes', 'sizeOptions', 'colorways', 'colourOptions', 'tags', 'badges']) if (k in p || k in info) { const v = k in info ? info[k] : p[k]; if (!Array.isArray(v)) P(`${k} not an array on ${p.id}`); }
  }
  // pick() for every kind: must return a product
  for (const k of cat.kinds) { let p; try { p = cat.pick(k, 'robust'); } catch (e) { P('pick threw ' + k + ': ' + e.message); continue; } if (!p) P('pick(' + k + ') returned nothing'); }
  // sample every interactable (instances / faces), resolve infos
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  const shown = new Map(), dept = {}; let infos = 0, priced = 0, nulls = 0;
  const hitsOf = (obj) => {
    const hits = [], meshes = [];
    if (obj.isMesh) meshes.push(obj); else obj.traverse(o => { if (o !== obj && o.isMesh && meshes.length < 6) meshes.push(o); });
    for (const o of meshes) {
      const g = o.geometry, pos = g && g.attributes && g.attributes.position; if (!pos) continue;
      const nF = Math.floor((g.index ? g.index.count : pos.count) / 3);
      if (o.isInstancedMesh && (o.count > 8 || nF < 2)) { for (let i = 0; i < o.count; i += Math.max(1, Math.ceil(o.count / 400))) { o.getMatrixAt(i, m4); hits.push({ object: o, instanceId: i, faceIndex: 0, point: new THREE.Vector3().applyMatrix4(m4).applyMatrix4(o.matrixWorld), uv: new THREE.Vector2(0.5, 0.5), distance: 1 }); } }
      else { const step = Math.max(1, Math.ceil(nF / 300)); for (let i = 0; i < (o.isInstancedMesh ? o.count : 1); i++) for (let f = 0; f < nF; f += step) { const a = g.index ? g.index.getX(f * 3) : f * 3; hits.push({ object: o, instanceId: o.isInstancedMesh ? i : undefined, faceIndex: f, face: { a, b: a, c: a, normal: new THREE.Vector3(0, 0, 1) }, point: v.fromBufferAttribute(pos, a).clone().applyMatrix4(o.matrixWorld), uv: new THREE.Vector2(0.5, 0.5), distance: 1 }); } }
    }
    if (!hits.length) hits.push({ object: obj, point: new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld), distance: 1 }); // proxies (Object3D + custom raycast)
    return hits;
  };
  const modOf = (o) => { while (o && o.parent && o.parent !== c.scene) o = o.parent; return o ? o.name : '?'; };
  for (const obj of c.interact.items) {
    for (const hit of hitsOf(obj)) {
      let r; try { r = c.interact.infoFor(hit); } catch (e) { P(`${modOf(obj)}/${obj.name}: infoFor threw ${e.message}`); break; }
      const info = r && r.info; if (!info) { nulls++; continue; }
      infos++;
      const ids = info.productId != null ? [info.productId] : (info.lookItems || []).map(l => l.productId);
      if (!ids.length) { if (info.price) Wn(`${modOf(obj)}: priced non-product "${info.title}" ${info.price}`); continue; }
      priced++;
      for (const id of ids) {
        const p = cat.get(id);
        if (!p) { P(`${modOf(obj)}/${obj.name}: productId ${id} not in catalogue`); continue; }
        shown.set(p.id, (shown.get(p.id) || 0) + 1);
        const d = dept[p.category] || (dept[p.category] = { products: new Set(), modules: new Set() }); d.products.add(p.id); d.modules.add(modOf(obj));
      }
      if (info.productId != null) {
        const p = cat.get(info.productId); if (!p) continue;
        if (info.price !== cat.formatPrice(cat.priceOf(p))) P(`${modOf(obj)}: price "${info.price}" != "${cat.formatPrice(cat.priceOf(p))}" (${p.name})`);
        if (/NaN|undefined/.test(String(info.price) + String(info.subtitle) + String(info.title))) P(`${modOf(obj)}: NaN/undefined in card text of ${p.id}`);
      }
    }
  }
  out.interactables = c.interact.items.length; out.infos = infos; out.productInfos = priced; out.nullInfos = nulls;
  out.shown = shown.size;
  out.deptShown = Object.fromEntries(Object.entries(dept).map(([k, d]) => [k, { products: d.products.size, modules: [...d.modules].join('+') }]));
  out.hotspots = c.hotspots.list.map(h => h.id);
  out.stats = (({ calls, triangles, programs, geometries, textures, errors }) => ({ calls, triangles, programs, geometries, textures, errors }))(window.__STATS());
  return out;
}).catch(e => ({ error: e.message })) : null;
report.content = content;
if (content && !content.error) {
  row('catalog.cards', content.problems.length ? 'FAIL' : 'PASS', `${content.products} products (${JSON.stringify(content.byCat)}), source ${content.source}; ${content.problems.length} problems ${content.problems.slice(0, 4).join(' | ')}`);
  row('catalog.shown', 'INFO', `${content.interactables} interactables → ${content.productInfos} product infos, ${content.shown}/${content.products} products shown; per dept ${JSON.stringify(content.deptShown)}; departments ${content.departments.join(', ')}`);
  for (const d of (A.depts ? String(A.depts).split(',') : ['clothes', 'shoes', 'accessories'])) {
    const has = content.byCat[d] || 0, sh = content.deptShown[d];
    row('dept.' + d, !has ? 'INFO' : sh && sh.products ? 'PASS' : 'FAIL', has ? `${has} products, ${sh ? sh.products : 0} shown` : 'no products in this department (content)');
  }
} else if (content) row('catalog.cards', 'FAIL', content.error);

// ------------------------------------------------------------------ ui: card for the longest name, info pages
if (ready) {
  const ui = await page.evaluate(async () => {
    const c = window.__ctx, cat = c.catalog, out = { problems: [] };
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const byLen = cat.products.slice().sort((a, b) => b.name.length - a.name.length);
    const pick = [byLen[0], cat.products.find(p => !p.image), cat.products.find(p => p.salePriceCents != null), cat.products.find(p => !p.sizes.length)].filter(Boolean);
    out.cards = [];
    for (const p of pick) {
      try { c.ui.showCard(cat.card(p), null); } catch (e) { out.problems.push('showCard threw for ' + p.id + ': ' + e.message); continue; }
      await wait(1800);
      const card = document.querySelector('.me-card.is-open') || document.querySelector('[role="dialog"]');
      const r = card ? card.getBoundingClientRect() : null;
      const img = card && card.querySelector('.me-pc img, img');
      const ph = card && card.querySelector('.me-pc');
      const txt = card ? card.textContent.replace(/\s+/g, ' ') : '';
      const rec = { id: p.id, name: p.name.slice(0, 40), open: !!card, inView: !!r && r.left >= -1 && r.right <= innerWidth + 1, hasPrice: txt.includes(cat.formatPrice(cat.priceOf(p)).replace(/\s/g, ' ').trim().split(' ').pop()),
        img: img ? { src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0, broken: img.complete && img.naturalWidth === 0, shown: getComputedStyle(img).display !== 'none' && getComputedStyle(img).visibility !== 'hidden' } : null,
        placeholderBox: ph ? Math.round(ph.getBoundingClientRect().height) : null, scrollX: document.documentElement.scrollWidth > innerWidth + 1 };
      out.cards.push(rec);
      c.ui.hideCard(); await wait(500);
    }
    out.pages = [];
    for (const slug of [...(c.brand.pages || []).map(p => p.slug), 'visit', 'faq', 'about']) {
      try { c.ui.showInfo(slug); } catch (e) { out.problems.push('showInfo threw ' + slug + ': ' + e.message); continue; }
      await wait(700);
      const s = document.querySelector('[data-sheet].is-open') || document.querySelector('[data-sheet][aria-hidden="false"]');
      out.pages.push({ slug, open: !!s, chars: s ? s.textContent.replace(/\s+/g, ' ').length : 0, bad: s ? /undefined|NaN|\[object/.test(s.textContent) : false });
    }
    try { c.ui.openBag(); await wait(600); } catch (e) { out.problems.push('openBag threw ' + e.message); }
    out.scrollX = document.documentElement.scrollWidth > innerWidth + 1;
    out.domBad = /undefined|NaN|\[object Object\]/.test(document.getElementById('me-ui') ? document.getElementById('me-ui').textContent : '');
    return out;
  }).catch(e => ({ error: e.message }));
  report.ui = ui;
  if (ui.error) row('ui', 'FAIL', ui.error);
  else {
    const badCard = ui.cards.filter(k => !k.open || !k.inView || k.scrollX || (k.img && k.img.broken && k.img.shown));
    row('ui.cards', badCard.length || ui.problems.length ? 'FAIL' : 'PASS', ui.cards.map(k => `${k.name}: ${k.open ? 'open' : 'CLOSED'}${k.img ? (k.img.ok ? ' img ok' : k.img.broken ? (k.img.shown ? ' BROKEN IMG VISIBLE' : ' img broken→hidden') : ' img pending') : ' no img (placeholder ' + k.placeholderBox + 'px)'}${k.scrollX ? ' HSCROLL' : ''}`).join(' | ') + (ui.problems.length ? ' — ' + ui.problems.join('; ') : ''));
    const badPages = ui.pages.filter(p => !p.open || p.bad);
    row('ui.pages', badPages.length ? 'FAIL' : 'PASS', ui.pages.map(p => `${p.slug}${p.open ? '' : ' CLOSED'}${p.bad ? ' BADTEXT' : ''}(${p.chars})`).join(' '));
    row('ui.dom', ui.domBad || ui.scrollX ? 'FAIL' : 'PASS', `undefined/NaN in HUD text: ${ui.domBad}; horizontal scroll: ${ui.scrollX}`);
  }
}

// ------------------------------------------------------------------ screenshots of the tour stops
if (ready && A.shots) {
  const stops = await page.evaluate(() => window.__ctx.hotspots.list.map(h => ({ id: h.id, pos: h.pos, look: h.look })));
  await page.evaluate(() => { const u = window.__ui; try { u && u.hud && u.hud.closeSheets && u.hud.closeSheets(); } catch (e) {} window.__ctx.ui.hideCard(); });
  await sleep(1500);
  const want = ['clothes', 'shoe', 'acc', 'spring', 'plinth', 'window'];
  const chosen = []; for (const w of want) { const s = stops.find(s => s.id.toLowerCase().includes(w) && !chosen.includes(s)); if (s) chosen.push(s); }
  for (const s of chosen.slice(0, 4)) {
    await page.evaluate(({ pos, look }) => { window.__setCam(pos[0], pos[1], pos[2], look[0], look[1], look[2]); }, s);
    await page.evaluate(() => new Promise(r => { let n = 0; const f = () => (++n > 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    try { await page.screenshot({ path: path.join(OUT, `${NAME}-${s.id}.jpg`), type: 'jpeg', quality: 70, timeout: 120000 }); } catch (e) { report.notes.push('screenshot ' + s.id + ' failed: ' + e.message.split('\n')[0]); }
  }
  report.notes.push('shots: ' + chosen.slice(0, 4).map(s => `${NAME}-${s.id}.jpg`).join(', '));
}

// ------------------------------------------------------------------ orientation after ready
if (ready && A.rotate) {
  const res = [];
  for (const [w, h] of [[W, H], [H, W], [W, H]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await sleep(1500);
    res.push(await page.evaluate(() => { const c = window.__ctx, cv = c.renderer.domElement; return { vw: innerWidth, vh: innerHeight, cw: cv.clientWidth, ch: cv.clientHeight, aspect: +c.camera.aspect.toFixed(3), fov: Math.round(c.camera.fov), scrollX: document.documentElement.scrollWidth > innerWidth + 1 }; }));
  }
  const bad = res.filter(r => r.cw !== r.vw || r.ch !== r.vh || Math.abs(r.aspect - r.vw / r.vh) > 0.01 || r.scrollX);
  row('orientation', bad.length ? 'FAIL' : 'PASS', res.map(r => `${r.vw}x${r.vh} canvas ${r.cw}x${r.ch} aspect ${r.aspect} fov ${r.fov}${r.scrollX ? ' HSCROLL' : ''}`).join(' → '));
}

// ------------------------------------------------------------------ pause / resume / visibility
if (ready && A.pause) {
  const r = await page.evaluate(async () => {
    const S = window.IMAANS_STORE, c = window.__ctx, wait = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    let t = c.time; await wait(1500); out.runs = c.time > t;
    S.pause(); S.pause(); t = c.time; await wait(2500); out.pausedFrozen = c.time === t; out.isPaused = S.isPaused();
    S.resume(); S.resume(); t = c.time; await wait(2500); out.resumedRuns = c.time > t; out.jump = +(c.time - t).toFixed(2);
    const hid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
    t = c.time; await wait(2000); out.hiddenFrozen = c.time === t;
    S.pause(); S.resume(); t = c.time; await wait(1500); out.resumeWhileHiddenFrozen = c.time === t;
    delete document.hidden; if (hid) Object.defineProperty(document, 'hidden', { configurable: true, get: hid.get });
    document.dispatchEvent(new Event('visibilitychange'));
    t = c.time; await wait(2000); out.visibleRuns = c.time > t;
    S.pause(); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    t = c.time; await wait(1500); out.pausedStaysPausedAfterVisible = c.time === t; S.resume();
    t = c.time; await wait(1500); out.finalRuns = c.time > t;
    return out;
  });
  const ok = r.runs && r.pausedFrozen && r.isPaused && r.resumedRuns && r.hiddenFrozen && r.resumeWhileHiddenFrozen && r.visibleRuns && r.pausedStaysPausedAfterVisible && r.finalRuns;
  row('pause-resume', ok ? 'PASS' : 'FAIL', JSON.stringify(r));
}

// ------------------------------------------------------------------ long session
if (ready && A.wander) {
  const secs = +A.wander, samples = [];
  const cdp = await context.newCDPSession(page);
  const sample = async (label) => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const hu = await cdp.send('Runtime.getHeapUsage').catch(() => null); samples.push(await page.evaluate(([label, used]) => { const c = window.__ctx, m = c.renderer.info.memory; let objs = 0; c.scene.traverse(() => objs++); return { label, t: Math.round(performance.now() / 1000), geometries: m.geometries, textures: m.textures, programs: c.renderer.info.programs.length, objects: objs, heapMB: used != null ? +(used / 1048576).toFixed(2) : null, interact: c.interact.items.length, dom: document.getElementsByTagName('*').length }; }, [label, hu ? hu.usedSize : null])); };
  await sample('start');
  const tEnd = Date.now() + secs * 1000; let step = 0, nextSample = Date.now() + 30000;
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  while (Date.now() < tEnd) {
    step++;
    const act = step % 6;
    try {
      if (act === 0 || act === 3) { const k = keys[(step * 7) % 4]; await page.keyboard.down(k); await sleep(900); await page.keyboard.up(k); }
      else if (act === 1) { await page.mouse.move(W / 2, H * 0.3); await page.mouse.down(); await page.mouse.move(W / 2 + ((step * 37) % 160) - 80, H * 0.3 + ((step * 13) % 40) - 20, { steps: 6 }); await page.mouse.up(); }
      else if (act === 2) await page.evaluate((s) => { const c = window.__ctx, p = c.catalog.products[(s * 31) % c.catalog.products.length]; c.ui.showCard(c.catalog.card(p), null); c.fx.burst(new c.THREE.Vector3(0, 1.4, 4), { count: 40 }); }, step);
      else if (act === 4) await page.evaluate(() => { window.__ctx.ui.hideCard(); });
      else if (act === 5) await page.evaluate((s) => { const u = window.__ui, hs = window.__ctx.hotspots.list; if (u && u.goTo && hs.length) u.goTo(hs[s % hs.length]); }, step);
    } catch (e) { report.notes.push('wander step failed: ' + e.message.slice(0, 120)); }
    await sleep(600);
    if (Date.now() > nextSample) { nextSample += 30000; await sample('t+' + Math.round((Date.now() - (tEnd - secs * 1000)) / 1000)); }
  }
  await page.evaluate(() => { try { window.__ui && window.__ui.stopFlight && window.__ui.stopFlight(); } catch (e) {} window.__ctx.ui.hideCard(); });
  await sleep(1500); await sample('end');
  report.wander = { steps: step, samples };
  const a = samples[1] || samples[0], z = samples[samples.length - 1];
  const grow = { geometries: z.geometries - a.geometries, textures: z.textures - a.textures, programs: z.programs - a.programs, objects: z.objects - a.objects, heapMB: +(z.heapMB - a.heapMB).toFixed(1), dom: z.dom - a.dom };
  const bad = grow.geometries > 4 || grow.textures > 4 || grow.programs > 2 || grow.objects > 20 || grow.heapMB > 25 || grow.dom > 200;
  row('long-session', bad ? 'FAIL' : 'PASS', `${secs}s, ${step} actions; growth after warm-up ${JSON.stringify(grow)}; start ${JSON.stringify(samples[0])}`);
}

// ------------------------------------------------------------------ errors
const cls = classifyLogs(logs.map(l => ({ kind: l.kind, text: l.text })), okUrls);
const siteImg404 = A.live && logs.some(l => l.kind === 'http' && /\/img\//.test(l.text));
const isExpected = (t) => expected404.some(u => t.includes(u)) || (A.live && /\/img\/[^ ]+\.(jpe?g|png|webp|svg)/.test(t) && /404|ERR_|failed/i.test(t))
  || ((siteImg404 || expected404.length) && /Failed to load resource: the server responded with a status of 404/.test(t));
const errs = cls.errors.filter(e => !isExpected(e));
report.errors = errs; report.expectedErrors = cls.errors.filter(isExpected).length; report.warnings = cls.warnings.slice(0, 30);
const statsErr = content && content.stats ? content.stats.errors : [];
row('errors', errs.length || (statsErr && statsErr.length) ? 'FAIL' : 'PASS', `${errs.length} console/page/http errors, stats.errors ${JSON.stringify(statsErr || [])}${report.expectedErrors ? `, ${report.expectedErrors} expected (blocked / missing site images)` : ''} ${errs.slice(0, 3).join(' | ')}`);
fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify(report, null, 1));
await browser.close(); server.close();
const fail = report.checks.some(c => c.status === 'FAIL');
console.log(JSON.stringify({ name: NAME, result: fail ? 'FAIL' : 'PASS', checks: report.checks.map(c => c.status + ' ' + c.id) }));
process.exit(fail ? 1 : 0);
