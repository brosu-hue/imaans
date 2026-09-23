#!/usr/bin/env node
// IMAANS 3-D store — one-command acceptance suite (owned by QA; see QA.md).
//
//   node tools/qa-run.mjs [--src dist] [--quick] [--only boot,budgets,catalog,hygiene,ui,layout,sheet]
//                         [--tiers low,mid,high] [--sizes 320x640,844x390] [--timeout 240000] [--out shots/qa]
//
// Prints a PASS/FAIL/WARN/SKIP table, writes shots/qa/report.json and shots/qa/sheet-<tier>.jpg.
// Exit code 1 when any check FAILs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, parseArgs, startServer, launch, openStore, classifyLogs, tap, mouseTap, drag, touch, nowS, frames, simWait, sleep } from './qa-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const QUICK = !!args.quick;
const SRC = args.src === 'dist' ? 'dist' : 'src';
const OUT = path.resolve(ROOT, args.out || 'shots/qa');
const ONLY = args.only ? new Set(String(args.only).split(',')) : null;
const want = (k) => !ONLY || ONLY.has(k);
const TIERS = (args.tiers ? String(args.tiers).split(',') : QUICK ? ['mid'] : ['low', 'mid', 'high']).filter(t => ['low', 'mid', 'high'].includes(t));
const UI_TIER = TIERS.includes('mid') ? 'mid' : TIERS[0];
const TIER_SIZE = { low: [375, 667], mid: [390, 844], high: [390, 844] };
const SIZES = (args.sizes ? String(args.sizes).split(',') : QUICK ? ['320x640', '844x390'] : ['320x640', '375x667', '390x844', '844x390', '1440x900']).map(s => s.split('x').map(Number));
const TIMEOUT = Number(args.timeout || 240000);
const BUDGET = { calls: 220, triangles: 700000, programs: 60 };
const MODULE_PROGRAMS = { architecture: 12, footwear: 10, apparel: 14, fixtures: 12, magic: 4, ui: 0 }; // CONTRACT targets (apparel = rails + display)
const ASSET_DIR = path.join(ROOT, SRC === 'dist' ? 'dist/assets' : 'assets');
fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true });

// Six budget viewpoints [name, pos, look] and ~16 contact-sheet viewpoints.
const VIEWS = [
  ['start', [0, 1.62, 8.4], [0, 1.45, -4]],
  ['clothes', [-2.35, 1.62, 3.1], [-6.7, 1.3, -1.3]],
  ['shoes', [0, 1.62, -5.6], [0, 1.62, -10.8]],
  ['accessories+checkout', [0.95, 1.62, 6.9], [4.5, 1.0, 5.2]],
  ['plinth', [1.75, 1.62, 1.35], [0, 1.1, -2.15]],
  ['lounge', [3.25, 1.62, 2.7], [6.9, 0.95, 0.75]],
];
const SHEET_VIEWS = [
  ['02 Window left', [-1.35, 1.62, 7.55], [-4.9, 1.15, 10.1]],
  ['03 Window right', [1.35, 1.62, 7.55], [4.9, 1.15, 10.1]],
  ['04 Clothes - rails', [-2.35, 1.62, 3.1], [-6.7, 1.3, -1.3]],
  ['05 Clothes - wall bays', [-3.1, 1.62, 7.4], [-7.9, 1.45, 2.4]],
  ['06 Clothes - denim cubbies', [-5.35, 1.62, -8.05], [-7.7, 1.35, -9.25]],
  ['07 The Spring Edit plinth', [1.75, 1.62, 1.35], [0, 1.1, -2.15]],
  ['08 Shoes - the wall', [0, 1.62, -5.6], [0, 1.62, -10.8]],
  ['09 Shoes - try-on salon', [1.7, 1.5, -6.05], [-0.25, 0.55, -8.35]],
  ['10 Dress rail', [1.85, 1.62, -1.35], [3.9, 1.25, -4.5]],
  ['11 Fitting rooms', [3.35, 1.62, -1.35], [6.4, 1.35, -4.7]],
  ['12 Lounge', [3.25, 1.62, 2.7], [6.9, 0.95, 0.75]],
  ['13 Accessories table', [0.95, 1.5, 6.35], [2.35, 0.95, 4.75]],
  ['14 Checkout', [3.55, 1.62, 7.6], [6.2, 1.1, 5.7]],
  ['15 Knit table', [-0.55, 1.62, 7.3], [-2.1, 0.8, 4.8]],
  ['16 Back wall to storefront', [0, 1.9, -9.4], [0, 1.3, 6]],
];

// ------------------------------------------------------------------------------------------------ results
const T0 = Date.now();
const rows = [];
const details = { boot: {}, budgets: {}, catalog: {}, hygiene: {}, ui: {}, layout: {}, sheets: {} };
function row(check, scope, status, detail) {
  rows.push({ check, scope, status, detail });
  process.stderr.write(`${status.padEnd(4)} ${check} [${scope}] ${detail || ''}\n`);
}
const secs = (ms) => (ms / 1000).toFixed(1) + 's';
const short = (a, n = 3) => a.slice(0, n).join(' | ') + (a.length > n ? ` (+${a.length - n} more)` : '');

const { server, port } = await startServer();
let browser = await launch();
const ensureBrowser = async () => { if (!browser.isConnected()) { process.stderr.write('browser disconnected — relaunching\n'); browser = await launch(); } };

// ================================================================================================= in-page probes
async function budgetProbe({ views, steps }) {
  const c = window.__ctx, Q = window.__qa, r = c.renderer;
  const before = new Set(r.info.programs || []);
  const progs = () => (r.info.programs || []).length;
  const p0 = progs(); let last = p0;
  const out = { p0, views: [], growth: [] };
  Q.renderOff(); Q.lowRes(0.3);
  const sample = async (px, py, pz, tx, ty, tz) => { window.__setCam(px, py, pz, tx, ty, tz); await Q.raf(2); return Q.renderNow(); };
  for (const [name, pos, look] of views) {
    const s = await sample(pos[0], pos[1], pos[2], look[0], look[1], look[2]);
    const v = { name, pos, look, calls: s.calls, triangles: s.triangles, programs: s.programs, mod: null, sweepMaxCalls: s.calls, sweepMaxTris: s.triangles, sweepMaxCallsAt: 0, sweepMaxTrisAt: 0 };
    if (s.programs > last) { out.growth.push({ view: name, step: 0, from: last, to: s.programs }); last = s.programs; }
    const yaw0 = Math.atan2(look[0] - pos[0], look[2] - pos[2]);
    for (let k = 1; k < steps; k++) {
      const a = yaw0 + (k * 2 * Math.PI) / steps, deg = Math.round((k * 360) / steps);
      const s2 = await sample(pos[0], pos[1], pos[2], pos[0] + Math.sin(a), pos[1] - 0.12, pos[2] + Math.cos(a));
      if (s2.calls > v.sweepMaxCalls) { v.sweepMaxCalls = s2.calls; v.sweepMaxCallsAt = deg; }
      if (s2.triangles > v.sweepMaxTris) { v.sweepMaxTris = s2.triangles; v.sweepMaxTrisAt = deg; }
      if (s2.programs > last) { out.growth.push({ view: name, step: deg, from: last, to: s2.programs }); last = s2.programs; }
    }
    out.views.push(v);
  }
  out.p1 = progs();
  // programs per module: distinct programs referenced by the materials in each top-level scene group
  const props = r.properties, all = new Set(r.info.programs || []), owned = new Map(), byMod = {};
  for (const g of c.scene.children) {
    const set = new Set();
    g.traverse(o => {
      const ms = [].concat(o.material || [], o.customDepthMaterial || [], o.customDistanceMaterial || []);
      for (const m of ms) { const p = props.get(m); if (p.programs) for (const pr of p.programs.values()) set.add(pr); else if (p.currentProgram) set.add(p.currentProgram); }
    });
    if (!set.size) continue;
    const mname = g.name || g.type;
    for (const pr of set) { if (!owned.has(pr)) owned.set(pr, []); owned.get(pr).push(mname); }
    const names = {}; for (const pr of set) names[pr.name] = (names[pr.name] || 0) + 1;
    byMod[mname] = { programs: set.size, names };
  }
  const un = {}; for (const pr of all) if (!owned.has(pr)) un[pr.name] = (un[pr.name] || 0) + 1;
  // which modules own the programs compiled after ready (late compiles)
  const late = {}; for (const pr of all) if (!before.has(pr)) { for (const m of owned.get(pr) || ['(post/shadow)']) (late[m] || (late[m] = [])).push(pr.name); }
  out.byModule = byMod; out.unattributed = un; out.total = all.size; out.lateByModule = late;
  // per-module draw calls / triangles LAST: __MODSTATS renders straight to the screen, which compiles
  // tone-mapped screen variants of every material (normal frames go through magic's HalfFloat target)
  for (const v of out.views) {
    window.__setCam(v.pos[0], v.pos[1], v.pos[2], v.look[0], v.look[1], v.look[2]); await Q.raf(2);
    try { v.mod = window.__MODSTATS(); } catch (e) { v.mod = { error: e.message }; }
  }
  Q.fullRes();
  out.pAfterModstats = progs();
  return out;
}

function catalogProbe({ maxInst, maxFaces }) {
  const c = window.__ctx, THREE = c.THREE, cat = c.catalog, Q = window.__qa;
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), box = new THREE.Box3();
  c.scene.updateMatrixWorld(true);
  const items = [], problems = new Map(), warnings = new Map(), nonProduct = new Map(), images = new Set(), seen = new Map(), dept = {};
  const prob = (map, module, object, issue) => { const k = module + '|' + object + '|' + issue; const e = map.get(k); if (e) e.n++; else map.set(k, { module, object, issue, n: 1 }); };
  const face = () => ({ a: 0, b: 1, c: 2, normal: new THREE.Vector3(0, 0, 1), materialIndex: 0 });
  function hitsFor(obj) {
    const hits = [], meshes = [];
    if (obj.isMesh || obj.isPoints || obj.isLine) meshes.push(obj); else obj.traverse(o => { if (o !== obj && o.isMesh && meshes.length < 6) meshes.push(o); });
    for (const o of meshes) {
      const g = o.geometry;
      const idx0 = g && g.index, pos0 = g && g.attributes && g.attributes.position;
      const nF0 = pos0 ? Math.floor((idx0 ? idx0.count : pos0.count) / 3) : 0;
      if (o.isInstancedMesh && (o.count > 8 || nF0 < 2)) {
        if (!g.boundingBox) g.computeBoundingBox();
        const ctr = g.boundingBox.getCenter(new THREE.Vector3()), n = o.count, step = Math.max(1, Math.ceil(n / maxInst));
        for (let i = 0; i < n; i += step) { o.getMatrixAt(i, m4); hits.push({ object: o, instanceId: i, faceIndex: 0, face: face(), point: ctr.clone().applyMatrix4(m4).applyMatrix4(o.matrixWorld), distance: 1, uv: new THREE.Vector2(0.5, 0.5) }); }
      } else if (o.isInstancedMesh) {
        // few instances of a merged geometry (e.g. footwear shoe banks: 1 instance, items resolved by faceIndex)
        const per = Math.max(1, Math.floor(maxFaces * 2 / o.count)), step = Math.max(1, Math.ceil(nF0 / per));
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4);
          for (let f = 0; f < nF0; f += step) {
            const a = idx0 ? idx0.getX(f * 3) : f * 3, b = idx0 ? idx0.getX(f * 3 + 1) : f * 3 + 1, cc = idx0 ? idx0.getX(f * 3 + 2) : f * 3 + 2;
            const p = new THREE.Vector3().fromBufferAttribute(pos0, a).add(v.fromBufferAttribute(pos0, b)).add(v.fromBufferAttribute(pos0, cc)).multiplyScalar(1 / 3).applyMatrix4(m4).applyMatrix4(o.matrixWorld);
            hits.push({ object: o, instanceId: i, faceIndex: f, face: { ...face(), a, b, c: cc }, point: p, distance: 1, uv: new THREE.Vector2(0.5, 0.5) });
          }
        }
      } else if (g && g.attributes && g.attributes.position) {
        const idx = g.index, pos = g.attributes.position, nF = Math.floor((idx ? idx.count : pos.count) / 3), step = Math.max(1, Math.ceil(nF / maxFaces));
        const fs = []; for (let f = 0; f < nF; f += step) fs.push(f); if (nF && fs[fs.length - 1] !== nF - 1) fs.push(nF - 1);
        for (const f of fs) {
          const a = idx ? idx.getX(f * 3) : f * 3, b = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, cc = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
          const p = new THREE.Vector3().fromBufferAttribute(pos, a).add(v.fromBufferAttribute(pos, b)).add(v.fromBufferAttribute(pos, cc)).multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld);
          hits.push({ object: o, faceIndex: f, face: { ...face(), a, b, c: cc }, point: p, distance: 1, uv: new THREE.Vector2(0.5, 0.5) });
        }
      } else { box.setFromObject(o); hits.push({ object: o, point: box.getCenter(new THREE.Vector3()), distance: 1 }); }
    }
    if (!hits.length) { box.setFromObject(obj); hits.push({ object: obj, point: box.getCenter(new THREE.Vector3()), distance: 1 }); }
    return hits;
  }
  const symbol = cat.formatPrice(0).split(' ')[0];
  for (const obj of c.interact.items) {
    const module = Q.moduleOf(obj), label = obj.name || obj.type + (obj.isInstancedMesh ? '[' + obj.count + ']' : '');
    const rec = { module, object: label, type: obj.isInstancedMesh ? 'InstancedMesh' : obj.type, count: obj.isInstancedMesh ? obj.count : null, sampled: 0, product: 0, nonProduct: 0, nulls: 0, throws: 0, products: new Set() };
    for (const hit of hitsFor(obj)) {
      rec.sampled++;
      let r; try { r = c.interact.infoFor(hit); } catch (e) { rec.throws++; prob(problems, module, label, 'infoFor threw: ' + e.message); continue; }
      const info = r && r.info;
      if (!info) { rec.nulls++; continue; }
      if (info.productId == null && Array.isArray(info.lookItems) && info.lookItems.length) {
        // "Complete the look" card (apparelDisplay): no single product, but every look item must be real
        rec.product++; let sum = 0;
        for (const li of info.lookItems) {
          const p = cat.get(li.productId);
          if (!p) { prob(problems, module, label, 'look item not in catalogue: ' + li.productId); continue; }
          sum += cat.priceOf(p); rec.products.add(p.id); seen.set(p.id, (seen.get(p.id) || 0) + 1);
          if (li.price !== cat.formatPrice(cat.priceOf(p))) prob(problems, module, label, `look item price "${li.price}" != "${cat.formatPrice(cat.priceOf(p))}" (${p.name})`);
          if (p.image) images.add(p.image); else prob(problems, module, label, 'no image for ' + p.name);
          const d = dept[p.category] || (dept[p.category] = { instances: 0, products: new Set(), modules: new Set() }); d.instances++; d.products.add(p.id); d.modules.add(module);
        }
        if (info.price !== cat.formatPrice(sum)) prob(problems, module, label, `look total "${info.price}" != sum of items "${cat.formatPrice(sum)}"`);
        const hero = cat.get(info.lookItems[0].productId);
        if (hero && info.title === hero.name && info.lookItems.length > 1) prob(warnings, module, label, `look card titled "${info.title}" (one product) shows the ${info.lookItems.length}-piece look total ${info.price}; ${hero.name} alone is ${cat.formatPrice(cat.priceOf(hero))}`);
        const k = module + '|look|' + info.title; const e = nonProduct.get(k);
        if (e) e.n++; else nonProduct.set(k, { module, title: 'look: ' + info.title + ' (' + info.lookItems.length + ' products)', tag: info.tag || '', price: info.price, n: 1 });
        continue;
      }
      if (info.productId == null) {
        rec.nonProduct++;
        const k = module + '|' + (info.title || '(untitled)'); const e = nonProduct.get(k);
        if (e) e.n++; else nonProduct.set(k, { module, title: info.title || '(untitled)', tag: info.tag || '', price: info.price || null, n: 1 });
        if (info.price) prob(problems, module, label, `priced but no productId: "${info.title}" ${info.price}`);
        continue;
      }
      rec.product++; rec.products.add(info.productId);
      const p = cat.get(info.productId);
      if (!p) { prob(problems, module, label, 'productId not in catalogue: ' + info.productId); continue; }
      const exp = cat.formatPrice(cat.priceOf(p));
      if (info.price !== exp) prob(problems, module, label, `price "${info.price}" != catalogue "${exp}" (${p.name})`);
      if (p.salePriceCents != null && info.wasPrice !== cat.formatPrice(p.priceCents)) prob(problems, module, label, `wasPrice "${info.wasPrice}" != "${cat.formatPrice(p.priceCents)}" (${p.name})`);
      if (!String(info.price || '').startsWith(symbol + ' ') || /€|EUR/.test(String(info.price) + String(info.wasPrice || ''))) prob(problems, module, label, 'price not in Rand: ' + info.price);
      if (info.title !== p.name) prob(warnings, module, label, `title "${info.title}" != product name "${p.name}"`);
      const img = info.image || p.image;
      if (!img) prob(problems, module, label, 'no image for ' + p.name); else images.add(img);
      if (info.image && p.image && info.image !== p.image) prob(warnings, module, label, `image ${info.image} != product image ${p.image}`);
      const d = dept[p.category] || (dept[p.category] = { instances: 0, products: new Set(), modules: new Set() });
      d.instances++; d.products.add(p.id); d.modules.add(module);
      seen.set(p.id, (seen.get(p.id) || 0) + 1);
    }
    rec.products = rec.products.size;
    items.push(rec);
  }
  const unseen = {}; for (const p of cat.products) if (!seen.has(p.id)) (unseen[p.category] || (unseen[p.category] = [])).push(p.name);
  return {
    items, problems: [...problems.values()], warnings: [...warnings.values()], nonProduct: [...nonProduct.values()], images: [...images],
    departments: Object.fromEntries(Object.entries(dept).map(([k, d]) => [k, { instances: d.instances, products: d.products.size, modules: [...d.modules] }])),
    catalogueSize: cat.products.length, productsShown: seen.size, unseen,
  };
}

async function tileProbe({ pos, look }) {
  const Q = window.__qa; Q.renderOff();
  window.__setCam(pos[0], pos[1], pos[2], look[0], look[1], look[2]);
  await Q.raf(3); // updaters (LOD, particles) see the new camera
  Q.renderNow();
  return window.__ctx.renderer.domElement.toDataURL('image/jpeg', 0.84);
}

function layoutProbe() {
  const Q = window.__qa, W = innerWidth, H = innerHeight, root = Q.root(), out = [];
  if (!root) return ['no ui root'];
  if (document.documentElement.scrollWidth > W + 0.5 || document.body.scrollWidth > W + 0.5) out.push(`hscroll (scrollWidth ${Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)} > ${W})`);
  if (document.documentElement.scrollHeight > H + 0.5 && getComputedStyle(document.body).overflow !== 'hidden') out.push(`vscroll (scrollHeight ${document.documentElement.scrollHeight} > ${H})`);
  const desc = (e) => { const cl = (typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '').split(' ').filter(Boolean)[0]; const a = e.getAttribute('data-act'); return e.tagName.toLowerCase() + (cl ? '.' + cl : '') + (a ? `[${a}]` : ''); };
  const shown = (e) => { for (let p = e; p && p.nodeType === 1; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || p.getAttribute('aria-hidden') === 'true' || p.hasAttribute('inert')) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inert = (e) => getComputedStyle(e).pointerEvents === 'none'; // own computed value: the HUD root is pointer-events:none and controls re-enable it
  const scroller = (e) => { for (let p = e.parentElement; p && p !== root.parentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) return p; } return null; };
  const inPanel = (e) => !!(e.closest && e.closest('[role="dialog"], [data-sheet]'));
  const isScrim = (e) => !!(e && e.closest && e.closest('[class*="scrim"], [data-act="close-sheets"]'));
  const off = (r, R) => r.left < R.left - 0.5 || r.top < R.top - 0.5 || r.right > R.right + 0.5 || r.bottom > R.bottom + 0.5;
  const V = { left: 0, top: 0, right: W, bottom: H };
  const fmtR = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round).join(',');
  // top-level blocks + open panels must be fully on-screen
  const blocks = new Set([...root.children, ...root.querySelectorAll('nav, [role="dialog"], [data-sheet], [role="note"], [role="status"]')]);
  for (const b of blocks) { if (!shown(b) || scroller(b)) continue; const r = b.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; if (b.tagName === 'CANVAS') continue; if (off(r, V)) out.push(`off-screen ${desc(b)} [${fmtR(r)}]`); }
  const inter = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="radio"], [role="slider"]')].filter(e => shown(e) && !inert(e));
  const chips = [...root.querySelectorAll('[class*="chip"], [class*="hint"], [class*="brand"], [role="note"], [role="status"], [aria-live]')].filter(e => shown(e) && !inPanel(e) && e.getBoundingClientRect().width > 4);
  const fixedInter = [];
  for (const e of inter) {
    const r = e.getBoundingClientRect(), sc = scroller(e);
    if (sc) { const R = sc.getBoundingClientRect(), hx = /(auto|scroll)/.test(getComputedStyle(sc).overflowX); if (!hx && (r.left < R.left - 2 || r.right > R.right + 2)) out.push(`clipped-x ${desc(e)} in scroller [${fmtR(r)}]`); if (r.bottom < R.top || r.top > R.bottom) continue; }
    else { if (off(r, V)) { out.push(`off-screen ${desc(e)} [${fmtR(r)}]`); continue; } fixedInter.push(e); }
    // tap target (an <input> wrapped by a big enough <label> counts as the label)
    let tr = r; const lab = e.tagName === 'INPUT' && e.closest('label'); if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width >= 43.5 && lr.height >= 43.5) tr = lr; }
    if (tr.width < 43.5 || tr.height < 43.5) out.push(`small ${desc(e)} ${Math.round(tr.width)}x${Math.round(tr.height)}`);
    // is something else on top of it?
    const cx = Math.min(W - 1, Math.max(0, (r.left + r.right) / 2)), cy = Math.min(H - 1, Math.max(0, (r.top + r.bottom) / 2));
    if (sc) { const R = sc.getBoundingClientRect(); if (cy < R.top || cy > R.bottom) continue; }
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== e && !e.contains(top) && !(top.closest && top.closest('label') && top.closest('label').contains(e))) {
      const panelOverHud = !inPanel(e) && (inPanel(top) || isScrim(top));
      if (!panelOverHud) out.push(`covered ${desc(e)} by ${desc(top)}`);
    }
  }
  // persistent HUD pieces must not overlap each other (panels overlay the HUD by design)
  const pieces = [...fixedInter.filter(e => !inPanel(e)), ...chips];
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const a = pieces[i], b = pieces[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix > 1.5 && iy > 1.5) out.push(`overlap ${desc(a)} x ${desc(b)} (${Math.round(ix)}x${Math.round(iy)})`);
  }
  // clipped single-line labels
  for (const t of root.querySelectorAll('.lbl, [class*="title"], [class*="word"], .me-cta span')) {
    if (!shown(t)) continue; const cs = getComputedStyle(t);
    if (t.scrollWidth > t.clientWidth + 1 && cs.overflow !== 'visible' && cs.whiteSpace === 'nowrap') out.push(`clipped-text ${desc(t)} "${t.textContent.trim().slice(0, 24)}"`);
  }
  out.push(`INFO checked ${inter.length} controls, ${chips.length} labels`);
  return [...new Set(out)];
}

function domTextProbe() {
  const parts = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (p && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue; const t = n.nodeValue.trim(); if (t) parts.push(t); }
  for (const e of document.querySelectorAll('*')) for (const a of ['aria-label', 'title', 'alt', 'placeholder', 'content', 'aria-valuetext']) { const v = e.getAttribute(a); if (v) parts.push(`@${a}=${v}`); }
  let keys = []; try { keys = Object.keys(localStorage); } catch (e) { /* */ }
  return { title: document.title, text: parts.join('\n'), keys };
}

// ================================================================================================= text hygiene
const HARD = [['Maison', /maison/i], ['Étoile/Etoile', /[ÉEé]toile/i], ['Nouvelle', /nouvelle/i], ['€', /€|\\u20ac|&euro;/i], ['EUR', /\bEUR\b/]];
const SOFT = [['TTC', /\bTTC\b/], ['Merci', /\bmerci\b/i], ['du soir', /du soir/i], ['Saison', /\bsaison\b/i], ['Bonjour/Bienvenue', /\bbonjour\b|\bbienvenue\b/i], ['Boutique (French copy)', /boutique du|la boutique/i]];
function scanText(text, file) {
  const hits = [];
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    for (const [word, re, soft] of [...HARD.map(h => [...h, false]), ...SOFT.map(s => [...s, true])]) {
      const m = re.exec(ln); if (!m) continue;
      const t = ln.trim(), ci = ln.indexOf('//');
      const comment = /^(\/\/|\/?\*|<!--|#)/.test(t) || (ci >= 0 && ci < m.index && !/https?:$/.test(ln.slice(0, ci))) || /(^|\/)dev\.html$/.test(file); // dev.html never ships
      hits.push({ file, line: i + 1, word, soft, comment, text: t.length > 160 ? t.slice(Math.max(0, m.index - 60 - (ln.length - ln.trimStart().length)), m.index + 80) : t });
    }
  });
  return hits;
}
function hygieneSrc() {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('_')) continue; // dev-only modules / dirs
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(m?js|html|css|json)$/.test(e.name) && !p.endsWith(path.join('core', 'imaans.data.js'))) files.push(p);
    }
  })(path.join(ROOT, 'src'));
  const hits = [];
  for (const f of files) hits.push(...scanText(fs.readFileSync(f, 'utf8'), path.relative(ROOT, f)));
  if (SRC === 'dist' && fs.existsSync(path.join(ROOT, 'dist/app.js'))) {
    const b = fs.readFileSync(path.join(ROOT, 'dist/app.js'), 'utf8');
    for (const [word, re] of HARD) { const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m, n = 0; while ((m = g.exec(b)) && n < 5) { n++; hits.push({ file: 'dist/app.js', line: 0, word, soft: false, comment: false, text: b.slice(Math.max(0, m.index - 50), m.index + 50) }); } }
  }
  return { files: files.length, hits };
}

// ================================================================================================= UI flows
async function uiFlows(s, hint) {
  const { page, cdp, W, H } = s;
  const out = [];
  const add = (name, status, detail) => { out.push({ name, status, detail }); row('ui.' + name, `${s.tier} ${W}x${H}`, status, detail); };
  const ev = (fn, a) => page.evaluate(fn, a);
  const env = await ev(() => { const Q = window.__qa, u = window.__ctx.ui; return { ui: !!window.__ui, root: !!Q.root(), stub: { showCard: Q.isStub(u.showCard), addToBag: Q.isStub(u.addToBag), openBag: Q.isStub(u.openBag), showInfo: Q.isStub(u.showInfo) }, bagApi: !!(window.__ui && window.__ui.bag) }; });
  details.ui.env = env;
  const uiErr = ((details.boot[s.tier] || {}).statsErrors || []).filter(e => /^ui/.test(e));
  add('hint', hint.seen ? 'PASS' : 'FAIL', hint.seen ? `first-run hint on ${secs(hint.ms)} after ready: "${hint.text.slice(0, 70)}"` : 'no first-run hint within 15 s of ready' + (uiErr.length ? ' — ' + uiErr[0] : ''));
  if (!env.ui || env.stub.showCard || !env.root) {
    const why = 'ui module not active' + (uiErr.length ? ': ' + uiErr[0] : ' (ctx.ui is still the registry stub)');
    for (const n of ['drag-look', 'joystick-walk', 'tap-card', 'size', 'add-to-bag', 'open-bag', 'whatsapp', 'info-menu', 'info-pages', 'goto-list', 'goto-reach', 'tour']) add(n, 'FAIL', why);
    return out;
  }
  const pose = () => ev(() => window.__qa.pose());
  const TP = async (p, t) => { await ev(([p, t]) => window.__qa.tp(p, t), [p, t]); await frames(page, 3); };
  const esc = async () => { await page.keyboard.press('Escape'); await sleep(250); await page.keyboard.press('Escape'); await sleep(250); };
  const center = (sel, within) => ev(([sel, within]) => { const Q = window.__qa; const scope = within === 'card' ? Q.card() : within === 'sheet' ? Q.anySheet() : document; if (!scope) return null; const el = [...scope.querySelectorAll(sel)].find(Q.vis); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, el.textContent.replace(/\s+/g, ' ').trim()]; }, [sel, within]);
  const tapSel = async (sel, within) => { const c = await center(sel, within); if (!c) return null; await tap(cdp, c[0], c[1]); await frames(page, 2); return c; };
  const START = [[0, 1.62, 8.4], [0, 1.62, -4]];
  const run = async (name, fn) => { try { await fn(); } catch (e) { add(name, 'FAIL', 'exception: ' + e.message.split('\n')[0]); } };

  await run('drag-look', async () => {
    await TP(...START); const a = await pose();
    await drag(cdp, [W * 0.8, H * 0.36], [W * 0.42, H * 0.36], 12);
    await simWait(page, 0.6); const b = await pose();
    let dy = b.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const moved = Math.hypot(b.x - a.x, b.z - a.z);
    add('drag-look', Math.abs(dy) > 0.25 && moved < 0.05 ? 'PASS' : 'FAIL', `leftward drag turned ${(dy * 180 / Math.PI).toFixed(0)}° (${dy < 0 ? 'right' : 'left'}), moved ${moved.toFixed(2)} m`);
  });

  await run('joystick-walk', async () => {
    await TP(...START); const a = await pose();
    const x = Math.round(W * 0.23), y = Math.round(H * 0.83);
    let T = nowS(); await touch(cdp, 'touchStart', [[x, y]], T);
    for (let i = 1; i <= 6; i++) { T += 0.016; await touch(cdp, 'touchMove', [[x, y - i * 10]], T); }
    const joy = await ev(() => { const j = document.querySelector('.me-joy, [class*="joy"]'); return j ? window.__qa.vis(j) : null; });
    await simWait(page, 2.0); const b = await pose();
    await touch(cdp, 'touchEnd', [], T + 0.1); await simWait(page, 0.6);
    const fwd = a.z - b.z, side = Math.abs(b.x - a.x);
    add('joystick-walk', fwd > 0.8 && side < 0.35 ? 'PASS' : 'FAIL', `thumb at (${x},${y}) pushed up: walked ${fwd.toFixed(2)} m forward, ${side.toFixed(2)} m sideways; joystick ${joy === null ? 'element not found' : joy ? 'visible' : 'hidden'}`);
  });

  // ---- tap a real product
  let target = null;
  await run('tap-card', async () => {
    const VPS = [['shoes', [0, 1.62, -6.6], [0, 1.3, -10.8]], ['clothes', [-2.35, 1.62, 3.1], [-6.7, 1.3, -1.3]], ['plinth', [1.75, 1.62, 1.35], [0, 1.1, -2.15]], ['accessories', [0.95, 1.5, 6.35], [2.35, 0.95, 4.75]]];
    for (const [vp, p, t] of VPS) {
      await TP(p, t);
      target = await ev(() => {
        const c = window.__ctx, Q = window.__qa, THREE = c.THREE, W = innerWidth, H = innerHeight;
        c.scene.updateMatrixWorld(true); c.camera.updateMatrixWorld();
        const m4 = new THREE.Matrix4(), pts = [];
        for (const o of c.interact.items) {
          const meshes = []; if (o.isMesh) meshes.push(o); else o.traverse(e => { if (e.isMesh && meshes.length < 4) meshes.push(e); });
          for (const m of meshes) {
            const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
            const ctr = g.boundingBox.getCenter(new THREE.Vector3());
            if (m.isInstancedMesh) { const st = Math.max(1, Math.floor(m.count / 80)); for (let i = 0; i < m.count; i += st) { m.getMatrixAt(i, m4); pts.push(ctr.clone().applyMatrix4(m4).applyMatrix4(m.matrixWorld)); } }
            else { const pos = g.attributes.position; const st = Math.max(1, Math.floor(pos.count / 60)); for (let i = 0; i < pos.count; i += st) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)); }
          }
        }
        const cands = [];
        for (const p of pts) {
          if (p.distanceTo(c.camera.position) > 7) continue;
          const [x, y, z] = Q.project([p.x, p.y, p.z]); if (z > 1 || z < -1) continue;
          if (x < W * 0.15 || x > W * 0.85 || y < H * 0.2 || y > H * 0.6) continue;
          cands.push([x, y, Math.hypot(x - W / 2, y - H * 0.42)]);
        }
        cands.sort((a, b) => a[2] - b[2]);
        const rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
        const visibleChain = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
        const pick = (x, y) => {
          if (window.__ui && window.__ui.pick) return window.__ui.pick(x, y);
          ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1); rc.setFromCamera(ndc, c.camera);
          for (const h of rc.intersectObjects(c.interact.items, true)) { if (!visibleChain(h.object)) continue; const r = c.interact.infoFor(h); if (r && r.info) return { hit: h, info: r.info }; }
          return null;
        };
        for (const [x, y] of cands.slice(0, 80)) {
          const res = pick(x, y), info = res && res.info;
          const inStock = info && Array.isArray(info.sizeOptions) ? info.sizeOptions.filter(s => s.inStock) : [];
          if (info && info.productId && info.price && info.image && inStock.length >= 2) return { x, y, title: info.title, price: info.price, priceCents: info.priceCents, productId: info.productId, image: info.image, sizes: inStock.map(s => s.label) };
        }
        return null;
      });
      if (target) { target.vp = vp; break; }
    }
    if (!target) return add('tap-card', 'FAIL', 'no tappable product with ≥2 in-stock sizes found on screen from 4 viewpoints');
    await tap(cdp, target.x, target.y); await frames(page, 2);
    let card = null;
    for (let i = 0; i < 12; i++) {
      await sleep(300);
      card = await ev((t) => {
        const Q = window.__qa, el = Q.card(); if (!el) return null;
        const txt = el.textContent, slug = String(t.image).split('/').pop().replace(/\.\w+$/, '');
        const imgs = [...el.querySelectorAll('img')].filter(Q.vis).map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 }));
        const bgs = [...el.querySelectorAll('[style*="background-image"]')].map(e => e.style.backgroundImage);
        const photo = imgs.find(i => i.src.includes(slug)) || (bgs.some(b => b.includes(slug)) ? { src: bgs.find(b => b.includes(slug)), ok: true } : null);
        return { title: Q.norm(txt).includes(Q.norm(t.title)), price: Q.norm(txt).includes(Q.norm(t.price)), photo, imgs: imgs.length, text: txt.replace(/\s+/g, ' ').trim().slice(0, 120) };
      }, target);
      if (card && card.photo && card.photo.ok) break;
    }
    const ok = card && card.title && card.price && card.photo && card.photo.ok;
    add('tap-card', ok ? 'PASS' : 'FAIL', !card ? `tapped "${target.title}" at (${Math.round(target.x)},${Math.round(target.y)}) [${target.vp}] — no card opened`
      : `"${target.title}" ${target.price} [${target.vp}] card: title ${card.title ? 'ok' : 'MISSING'}, price ${card.price ? 'ok' : 'MISSING'}, photo ${card.photo ? (card.photo.ok ? 'loaded' : 'not loaded') : `MISSING (${card.imgs} img)`}`);
  });

  let size = null;
  await run('size', async () => {
    if (!target) return add('size', 'SKIP', 'no product card');
    const SZ = '[data-act="size"], [role="radiogroup"][aria-label*="ize" i] [role="radio"]';
    size = await ev((SZ) => {
      const Q = window.__qa, el = Q.card(); if (!el) return { err: 'card closed' };
      const bs = [...el.querySelectorAll(SZ)]; if (!bs.length) return { n: 0 };
      const avail = bs.filter(b => !b.classList.contains('out') && b.getAttribute('aria-disabled') !== 'true' && !b.disabled);
      const cur = bs.find(b => b.classList.contains('is-on') || b.getAttribute('aria-checked') === 'true');
      const t = avail.find(b => b !== cur) || avail[0]; if (!t) return { n: bs.length, avail: 0 };
      t.scrollIntoView({ block: 'nearest' }); const r = t.getBoundingClientRect();
      return { n: bs.length, avail: avail.length, x: r.left + r.width / 2, y: r.top + r.height / 2, label: t.textContent.trim(), idx: bs.indexOf(t) };
    }, SZ);
    if (size.err || !size.n) { const s0 = size; size = null; return add('size', s0.err ? 'FAIL' : 'SKIP', s0.err || 'card has no size picker'); }
    if (!size.avail) { size = null; return add('size', 'FAIL', 'every size is sold out/disabled'); }
    await tap(cdp, size.x, size.y); await frames(page, 2); await sleep(300);
    const on = await ev(([SZ, i]) => { const el = window.__qa.card(); const b = el && [...el.querySelectorAll(SZ)][i]; return !!b && (b.classList.contains('is-on') || b.getAttribute('aria-checked') === 'true'); }, [SZ, size.idx]);
    add('size', on ? 'PASS' : 'FAIL', `${size.n} size chips, ${size.avail} in stock; chose "${size.label}" → ${on ? 'selected' : 'NOT selected'}`);
  });

  let bagN = null;
  await run('add-to-bag', async () => {
    if (!target) return add('add-to-bag', 'SKIP', 'no product card');
    const n0 = await ev(() => window.__qa.bagCount());
    const c = await ev(() => { const Q = window.__qa, el = Q.card(); if (!el) return null; const b = [...el.querySelectorAll('[data-act="add"], button')].filter(Q.vis).find(b => b.getAttribute('data-act') === 'add' || /add to (bag|basket)/i.test(b.textContent)); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, b.textContent.trim()]; });
    if (!c) return add('add-to-bag', 'FAIL', 'no "Add to bag" button on the card');
    await tap(cdp, c[0], c[1]); await frames(page, 2); await sleep(1500);
    bagN = await ev(() => window.__qa.bagCount());
    add('add-to-bag', n0 !== null && bagN === n0 + 1 ? 'PASS' : 'FAIL', `bag count ${n0} → ${bagN}`);
  });

  let bagText = '';
  await run('open-bag', async () => {
    if (env.stub.openBag) return add('open-bag', 'SKIP', 'ctx.ui.openBag() is still the registry no-op');
    await esc();
    await ev(() => window.__ctx.ui.openBag()); await sleep(800);
    const r = await ev(() => { const Q = window.__qa, s = Q.sheet('bag') || Q.anySheet(); return s ? s.textContent.replace(/\s+/g, ' ').trim() : null; });
    bagText = r || '';
    if (!r) return add('open-bag', 'FAIL', 'openBag() opened no visible sheet');
    if (!target) return add('open-bag', 'SKIP', 'bag sheet opens; no product was added');
    const n = (s) => s.replace(/\s+/g, '').toLowerCase();
    const hasT = n(r).includes(n(target.title)), hasS = !size || new RegExp('(size\\s*)?' + size.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(r);
    add('open-bag', hasT && hasS ? 'PASS' : 'FAIL', `bag sheet: title ${hasT ? 'ok' : 'MISSING'}, size ${size ? (hasS ? size.label + ' ok' : size.label + ' MISSING') : 'n/a'} — "${r.slice(0, 90)}"`);
  });

  await run('whatsapp', async () => {
    if (!target) return add('whatsapp', 'SKIP', 'no product in the bag');
    const w = await ev(() => {
      const Q = window.__qa, s = Q.sheet('bag') || Q.anySheet();
      const a = s && [...s.querySelectorAll('a[href]')].find(a => /wa\.me|whatsapp/i.test(a.href));
      if (a) return { href: a.href, via: 'link in bag sheet' };
      try { if (window.__ui && window.__ui.bag && window.__ui.bag.orderUrl) return { href: window.__ui.bag.orderUrl(), via: '__ui.bag.orderUrl() (no link in the sheet)' }; } catch (e) { /* */ }
      return null;
    });
    let href = w && w.href, via = w && w.via;
    if (!href) {
      // last resort: a send/WhatsApp button that calls window.open
      await ev(() => { window.__qaOpened = null; const o = window.open; window.open = (u, ...r) => { window.__qaOpened = String(u); return null; }; window.__qaOpenRestore = o; });
      const c = await center('button, [data-act="checkout"], [data-act="whatsapp"], [data-act="send"]', 'sheet');
      if (c && /whatsapp|send|order|checkout/i.test(c[2])) { await tap(cdp, c[0], c[1]); await sleep(600); href = await ev(() => window.__qaOpened); via = `window.open from "${c[2].slice(0, 30)}"`; }
      await ev(() => { if (window.__qaOpenRestore) window.open = window.__qaOpenRestore; });
    }
    if (!href) return add('whatsapp', env.bagApi || !env.stub.openBag ? 'FAIL' : 'SKIP', 'no wa.me link / order URL found');
    const u = new URL(href), text = u.searchParams.get('text') || '';
    const exp = await ev((t) => { const c = window.__ctx, b = window.__ui && window.__ui.bag; let total = null; try { if (b && b.totalCents) total = b.totalCents(); } catch (e) { /* */ } const n = window.__qa.bagCount() || 1; return { number: String((c.brand.checkout || {}).whatsappNumber || (c.brand.contact || {}).whatsapp || '').replace(/\D/g, ''), total: c.catalog.formatPrice(total != null ? total : t.priceCents * n) }; }, target);
    const n = (s) => s.replace(/[\s  ]+/g, ' ').toLowerCase();
    const checks = { https: u.protocol === 'https:' && u.hostname === 'wa.me', number: u.pathname.replace(/\D/g, '') === exp.number, name: n(text).includes(n(target.title)), size: !size || n(text).includes(n(size.label)), total: n(text).includes(n(exp.total)) };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    details.ui.whatsapp = { href: href.slice(0, 400), text, expected: exp };
    add('whatsapp', bad.length ? 'FAIL' : 'PASS', `${via}: ${bad.length ? 'missing ' + bad.join(', ') : 'wa.me/' + exp.number + ' with name, size ' + (size ? size.label : '-') + ', total ' + exp.total} — "${text.replace(/\n+/g, ' / ').slice(0, 110)}"`);
  });

  await run('info-menu', async () => {
    await esc();
    const c = await tapSel('[data-act="info"]');
    if (!c) return add('info-menu', 'FAIL', 'no Info button ([data-act="info"]) in the HUD');
    await sleep(800);
    const r = await ev(() => {
      const Q = window.__qa, s = Q.sheet('info') || Q.anySheet(); if (!s) return null;
      const b = window.__ctx.brand, want = [...['about', 'size-guide', 'faq'].map(sl => ((b.pages || []).find(p => p.slug === sl) || {}).title || sl), 'Visit us'];
      const t = Q.norm(s.textContent);
      return { missing: want.filter(w => !t.includes(Q.norm(w))), want, text: s.textContent.replace(/\s+/g, ' ').trim().slice(0, 100) };
    });
    if (!r) return add('info-menu', 'FAIL', 'Info button opened no sheet');
    add('info-menu', r.missing.length ? 'FAIL' : 'PASS', r.missing.length ? `menu lacks ${r.missing.join(', ')} — "${r.text}"` : `menu lists ${r.want.join(' / ')}`);
  });

  await run('info-pages', async () => {
    if (env.stub.showInfo) return add('info-pages', 'SKIP', 'ctx.ui.showInfo() is still the registry no-op');
    const res = [];
    for (const slug of ['about', 'size-guide', 'faq', 'visit']) {
      await esc();
      await ev((sl) => window.__ctx.ui.showInfo(sl), slug); await sleep(700);
      const r = await ev((slug) => {
        const Q = window.__qa, b = window.__ctx.brand, exp = [];
        if (slug === 'visit') { exp.push(...((b.contact || {}).addressLines || []).slice(0, 2)); const d = ((b.hours || {}).days || [])[0]; if (d) exp.push(d.label); if ((b.contact || {}).phoneDisplay) exp.push(b.contact.phoneDisplay); }
        else { const pg = (b.pages || []).find(p => p.slug === slug); if (pg) { exp.push(pg.title); const blk = (pg.blocks || []).find(x => x.body && x.body.trim()); if (blk) exp.push(blk.body.trim().split('\n')[0].replace(/[*_#>`[\]]/g, '').slice(0, 40)); const it = (pg.blocks || []).flatMap(x => x.items || [])[0]; if (it && it.q) exp.push(it.q); } }
        const s = Q.anySheet(); if (!s) return { slug, open: false, exp };
        const t = Q.norm(s.textContent);
        return { slug, open: true, missing: exp.filter(e => !t.includes(Q.norm(e))), exp: exp.length };
      }, slug);
      res.push(r);
    }
    const bad = res.filter(r => !r.open || r.missing.length);
    add('info-pages', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.map(r => r.open ? `${r.slug}: missing "${r.missing.map(m => m.slice(0, 30)).join('", "')}"` : `${r.slug}: no sheet`).join('; ') : res.map(r => `${r.slug} ✓(${r.exp})`).join(' '));
  });

  // ---- Go to: every department is listed and reachable
  await run('goto-list', async () => {
    await esc();
    const DEPTS = await ev(() => { const D = window.__ctx.layout.DEPARTMENTS || {}; const promo = ((window.__ctx.brand.promos || [])[0] || {}).name || ''; return { clothes: D.clothes && D.clothes.name, shoes: D.shoes && D.shoes.name, accessories: D.accessories && D.accessories.name, newIn: D.newIn && D.newIn.name, promo, windows: D.windows && D.windows.name, services: D.services && D.services.name }; });
    const RULES = { clothes: /cloth/i, shoes: /shoe/i, accessories: /accessor/i, newIn: new RegExp(['spring', 'edit', 'new in', 'new-collection', 'plinth', ...String(DEPTS.promo).toLowerCase().split(/\s+/).filter(w => w.length > 3)].join('|'), 'i'), windows: /window/i, services: /fitting|lounge/i };
    const c = await tapSel('[data-act="goto"]');
    if (!c) { add('goto-list', 'FAIL', 'no Go to button'); add('goto-reach', 'SKIP', 'no Go to button'); return; }
    await sleep(800);
    const list = await ev(() => { const Q = window.__qa, s = Q.sheet('goto') || Q.anySheet(); return s ? [...s.querySelectorAll('button, a[href]')].filter(b => Q.vis(b) && !/close/i.test(b.getAttribute('aria-label') || '')).map(b => { const t = b.querySelector('.t') || b; const first = [...t.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim()); return (first ? first.nodeValue : b.textContent).replace(/\s+/g, ' ').trim(); }).filter(Boolean) : null; });
    if (!list) { add('goto-list', 'FAIL', 'Go to opened no sheet'); add('goto-reach', 'SKIP', 'no list'); return; }
    const found = {}; for (const [k, re] of Object.entries(RULES)) found[k] = list.find(t => re.test(t)) || null;
    const missReq = ['clothes', 'shoes', 'accessories', 'newIn'].filter(k => !found[k]), missOpt = ['windows', 'services'].filter(k => !found[k]);
    details.ui.gotoList = list;
    add('goto-list', missReq.length ? 'FAIL' : missOpt.length ? 'WARN' : 'PASS', `${list.length} entries: ${list.map(t => t.replace(/^\d+\s*/, '')).join(' · ').slice(0, 170)}${missReq.length ? ' — MISSING ' + missReq.join(', ') : ''}${missOpt.length ? ' — no ' + missOpt.join(', ') : ''}`);
    const toTest = (QUICK ? ['shoes', 'accessories'] : Object.keys(RULES)).filter(k => found[k]);
    const reach = [];
    for (const k of toTest) {
      await esc();
      await TP(...START);
      if (!(await tapSel('[data-act="goto"]'))) break;
      await sleep(700);
      const label = found[k];
      const p = await ev((label) => { const Q = window.__qa, s = Q.sheet('goto') || Q.anySheet(); if (!s) return null; const b = [...s.querySelectorAll('button, a[href]')].find(b => { if (!Q.vis(b)) return false; const t = b.querySelector('.t') || b; const first = [...t.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim()); return (first ? first.nodeValue : b.textContent).replace(/\s+/g, ' ').trim() === label; }); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, label);
      if (!p) { reach.push({ k, ok: false, why: 'entry not tappable' }); continue; }
      await tap(cdp, p[0], p[1]); await frames(page, 2);
      let simT = 0;
      for (let i = 0; i < 14; i++) { simT += await simWait(page, 1.0, 20000); const act = await ev(() => (window.__ui && window.__ui.nav ? !!window.__ui.nav.active : null)); if (act === false && i > 0) break; }
      const r = await ev(([label, re]) => { const Q = window.__qa, c = window.__ctx.camera, rx = new RegExp(re, 'i'); let best = null; for (const h of window.__ctx.hotspots.list.filter(h => h && h.pos)) { if (!(rx.test((h.label || '') + ' ' + h.id) || Q.norm(label).includes(Q.norm(h.label || h.id)))) continue; const d = Math.hypot(c.position.x - h.pos[0], c.position.z - h.pos[2]); if (!best || d < best.d) best = { id: h.id, d }; } return best || { id: null, d: null, at: [+c.position.x.toFixed(2), +c.position.z.toFixed(2)] }; }, [label, RULES[k].source]);
      reach.push({ k, label, ok: r.d !== null && r.d < 0.5, d: r.d, id: r.id, sim: +simT.toFixed(1) });
    }
    details.ui.gotoReach = reach;
    const bad = reach.filter(r => !r.ok);
    add('goto-reach', !reach.length ? 'SKIP' : bad.length ? 'FAIL' : 'PASS', reach.map(r => `${r.k}${r.ok ? ' ✓' : ' ✗'}${r.d != null ? ' ' + r.d.toFixed(2) + 'm' + (r.id ? ' (' + r.id + ')' : '') : r.why ? ' ' + r.why : ' no matching hotspot'}`).join(', '));
  });

  await run('tour', async () => {
    await esc(); await TP(...START);
    const a = await pose();
    const c = await tapSel('[data-act="tour"]');
    if (!c) return add('tour', 'FAIL', 'no Tour button');
    await sleep(200);
    const k = await ev(() => (window.__ui && window.__ui.nav ? window.__ui.nav.kind + '/' + window.__ui.nav.active : 'n/a'));
    await simWait(page, 5.0); const b = await pose();
    const moved = Math.hypot(b.x - a.x, b.z - a.z) + Math.abs(b.yaw - a.yaw);
    await tap(cdp, W * 0.5, H * 0.3); await simWait(page, 0.8);
    const c1 = await pose(); await simWait(page, 1.2); const c2 = await pose();
    const act = await ev(() => (window.__ui && window.__ui.nav ? !!window.__ui.nav.active : null));
    const still = Math.hypot(c2.x - c1.x, c2.z - c1.z) < 0.03;
    add('tour', moved > 0.5 && (act === false || (act === null && still)) ? 'PASS' : 'FAIL', `started (${k}), moved ${moved.toFixed(2)} in 5 s; after a tap: ${act === false ? 'stopped' : act === null ? (still ? 'camera still' : 'camera still moving') : 'STILL RUNNING'}`);
  });
  await esc();
  return out;
}

// ================================================================================================= per-tier session
async function tierSession(tier) {
  const [W, H] = TIER_SIZE[tier];
  process.stderr.write(`\n=== tier ${tier} ${W}x${H} (${SRC}) ===\n`);
  const s = await openStore(browser, port, { W, H, tier, src: SRC, timeout: TIMEOUT });
  s.tier = tier;
  const scope = `${tier} ${W}x${H}`;
  const bootLogs = classifyLogs(s.logs.slice(), s.okUrls);
  const stats = s.ready ? await s.page.evaluate(() => window.__STATS()).catch(e => ({ errors: ['__STATS failed: ' + e.message] })) : await s.page.evaluate(() => (window.__STATS ? window.__STATS() : null)).catch(() => null);
  const statsErrors = (stats && stats.errors) || [];
  const mods = (stats && stats.modules) || {};
  const slow = Object.entries(mods).filter(([, v]) => v.ms > 3000).map(([k, v]) => `${k} ${secs(v.ms)}`);
  details.boot[tier] = { url: s.url, ready: s.ready, readyError: s.readyError, readyMs: s.readyMs, buildMs: stats && stats.buildMs, modules: mods, statsErrors, errors: bootLogs.errors, warnings: bootLogs.warnings, ignored: bootLogs.ignored.length, programsAtReady: stats && stats.programs, calls: stats && stats.calls, triangles: stats && stats.triangles, lights: stats && stats.lights };
  if (want('boot')) {
    const fail = !s.ready || bootLogs.errors.length || statsErrors.length;
    row('boot', scope, fail ? 'FAIL' : 'PASS', !s.ready ? `NOT READY after ${secs(s.readyMs)}: ${s.readyError}` : `ready ${secs(s.readyMs)}, ${bootLogs.errors.length} errors, ${statsErrors.length} stats.errors, ${bootLogs.warnings.length} warnings${statsErrors.length ? ' — ' + short(statsErrors, 2) : ''}${bootLogs.errors.length ? ' — ' + short(bootLogs.errors, 2) : ''}`);
    if (bootLogs.warnings.length) row('boot.warnings', scope, 'WARN', short([...new Set(bootLogs.warnings)], 3));
    if (slow.length) row('boot.slow-modules', scope, 'WARN', `module build > 3 s (SwiftShader): ${slow.join(', ')}`);
  }
  if (!s.ready) { await s.context.close(); return; }

  // first-run hint (before any interaction)
  const hint = { seen: false, ms: 0, text: '' };
  // state, not pixels: the hint element is switched on (its fade-in needs frames, which are scarce under SwiftShader)
  { const t0 = Date.now(); while (Date.now() - t0 < 15000) { const h = await s.page.evaluate(() => { const Q = window.__qa, root = Q.root(); if (!root) return null; const e = [...root.querySelectorAll('[class*="hint"], [role="note"]')].find(e => e.textContent.trim().length > 3 && (Q.vis(e) || e.classList.contains('is-on') || e.classList.contains('is-open'))); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }); if (h) { hint.seen = true; hint.ms = Date.now() - t0; hint.text = h; break; } await sleep(300); } }

  if (want('budgets')) {
    const b = await s.page.evaluate(budgetProbe, { views: VIEWS, steps: QUICK ? 8 : 12 });
    details.budgets[tier] = b;
    const mx = (k) => Math.max(...b.views.map(v => v[k]));
    const at = (k) => b.views.reduce((a, v) => (v[k] > a[k] ? v : a))['name'];
    const calls = mx('calls'), tris = mx('triangles'), sCalls = mx('sweepMaxCalls'), sTris = mx('sweepMaxTris');
    row('budget.calls', scope, calls > BUDGET.calls ? 'FAIL' : sCalls > BUDGET.calls ? 'WARN' : 'PASS', `max ${calls} (${at('calls')}) of ≤ ${BUDGET.calls} over 6 views; 360° sweep max ${sCalls} — ${b.views.map(v => v.name.split('+')[0] + ' ' + v.calls).join(', ')}`);
    row('budget.triangles', scope, tris > BUDGET.triangles ? 'FAIL' : sTris > BUDGET.triangles ? 'WARN' : 'PASS', `max ${(tris / 1000).toFixed(0)}k (${at('triangles')}) of ≤ 700k; sweep max ${(sTris / 1000).toFixed(0)}k — ${b.views.map(v => v.name.split('+')[0] + ' ' + (v.triangles / 1000).toFixed(0) + 'k').join(', ')}`);
    const pmax = Math.max(b.p1, ...b.views.map(v => v.programs));
    const modP = Object.entries(b.byModule).map(([k, v]) => `${k} ${v.programs}`).join(', ');
    const apparel = ((b.byModule.apparelRails || {}).programs || 0) + ((b.byModule.apparelDisplay || {}).programs || 0);
    const over = Object.entries(MODULE_PROGRAMS).filter(([k, lim]) => (k === 'apparel' ? apparel : ((b.byModule[k] || {}).programs || 0)) > lim).map(([k, lim]) => `${k} ${k === 'apparel' ? apparel : b.byModule[k].programs}>${lim}`);
    row('budget.programs', scope, pmax > BUDGET.programs ? 'FAIL' : over.length ? 'WARN' : 'PASS', `max ${pmax} of ≤ ${BUDGET.programs} (at ready ${b.p0}); per module: ${modP}; post/shadow/unattributed ${Object.values(b.unattributed).reduce((a, n) => a + n, 0)}${over.length ? ' — over module target: ' + over.join(', ') : ''}`);
    row('late-compiles', scope, b.growth.length ? 'WARN' : 'PASS', b.growth.length ? `programs grew ${b.p0} → ${b.p1} after ready: ${b.growth.map(g => `${g.view}@${g.step}° +${g.to - g.from}`).join(', ')} — new programs by module: ${Object.entries(b.lateByModule).map(([m, n]) => `${m} ${n.length}`).join(', ')}` : `no new programs during ${b.views.length} × 360° sweep (${b.p0})`);
  }

  if (want('catalog')) {
    const c = await s.page.evaluate(catalogProbe, QUICK ? { maxInst: 150, maxFaces: 150 } : { maxInst: 600, maxFaces: 500 });
    const missingImg = c.images.filter(img => !/^(\/|https?:|data:|blob:)/.test(img) && !fs.existsSync(path.join(ASSET_DIR, img)));
    c.missingImages = missingImg;
    details.catalog[tier] = c;
    const sampled = c.items.reduce((a, r) => a + r.sampled, 0), prodHits = c.items.reduce((a, r) => a + r.product, 0);
    const throws = c.items.filter(r => r.throws).map(r => `${r.module}/${r.object}`);
    const probs = c.problems.length + missingImg.length;
    row('catalog.products', scope, probs ? 'FAIL' : 'PASS', `${c.items.length} interactables, ${sampled} samples → ${prodHits} product hits, ${c.productsShown}/${c.catalogueSize} catalogue products shown; ${c.problems.length} problem kinds${missingImg.length ? `, ${missingImg.length} missing image files (${short(missingImg, 2)})` : ''}${c.problems.length ? ' — ' + short(c.problems.map(p => `${p.module}/${p.object}: ${p.issue} ×${p.n}`), 2) : ''}`);
    const d = c.departments;
    row('catalog.departments', scope, ['clothes', 'shoes', 'accessories'].every(k => d[k] && d[k].products > 0) ? 'PASS' : 'FAIL', ['clothes', 'shoes', 'accessories'].map(k => `${k}: ${d[k] ? `${d[k].products} products / ${d[k].instances} items` : 'NONE'}`).join('; ') + (Object.keys(c.unseen).length ? ` — never shown: ${Object.entries(c.unseen).map(([k, v]) => k + ' ' + v.length).join(', ')}` : ''));
    row('catalog.non-product', scope, c.warnings.length ? 'WARN' : 'PASS', `${c.nonProduct.length} non-product infos (${short(c.nonProduct.map(n => `${n.module}: ${n.title}`), 6)})${c.items.filter(r => !r.product && !r.nonProduct).length ? `; ${c.items.filter(r => !r.product && !r.nonProduct).length} items resolve to null` : ''}${c.warnings.length ? ' — ' + short(c.warnings.map(w => `${w.module}/${w.object}: ${w.issue} ×${w.n}`), 2) : ''}${throws.length ? ' — throws: ' + throws.join(', ') : ''}`);
  }

  if (want('sheet')) {
    const tiles = [];
    // HUD tile: the untouched start view with the interface
    try {
      await s.page.evaluate(() => { window.__qa.fullRes(); window.__qa.renderOn(); window.__setCam(0, 1.62, 8.4, 0, 1.45, -4); });
      await frames(s.page, 3);
      const f = path.join(OUT, 'tiles', `${tier}-01-start-hud.jpg`);
      await s.page.screenshot({ path: f, type: 'jpeg', quality: 82, timeout: 90000 });
      tiles.push({ path: f, label: '01 Start (with HUD)' });
    } catch (e) { process.stderr.write('hud tile failed: ' + e.message + '\n'); }
    for (const [label, pos, look] of SHEET_VIEWS) {
      try {
        const data = await s.page.evaluate(tileProbe, { pos, look });
        const f = path.join(OUT, 'tiles', `${tier}-${label.slice(0, 2)}.jpg`);
        fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
        tiles.push({ path: f, label });
      } catch (e) { process.stderr.write(`tile ${label} failed: ${e.message}\n`); }
    }
    await s.page.evaluate(() => window.__qa.renderOff());
    const sheet = path.join(OUT, `sheet-${tier}.jpg`);
    const r = makeSheet(tiles, sheet, `IMAANS 3-D store  ·  tier ${tier}  ·  ${W}x${H}  ·  ${SRC}  ·  ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    details.sheets[tier] = { path: path.relative(ROOT, sheet), tiles: tiles.length, ok: r.ok, err: r.err };
    row('sheet', scope, r.ok ? 'PASS' : 'FAIL', r.ok ? `${path.relative(ROOT, sheet)} (${tiles.length} views)` : 'PIL failed: ' + r.err);
  }

  if (tier === UI_TIER && want('ui')) {
    await s.page.evaluate(() => { window.__ctx.controlsEnabled = true; window.__qa.renderOff(); });
    details.ui.flows = await uiFlows(s, hint);
  }
  if (tier === UI_TIER && want('hygiene')) {
    const dom = await s.page.evaluate(domTextProbe);
    const hits = [...scanText(dom.text, 'DOM').map(h => ({ ...h, file: 'DOM', line: undefined, comment: false })),
      ...scanText(dom.title, 'document.title').map(h => ({ ...h, file: SRC === 'dist' ? 'document.title' : 'document.title (dev.html, never shipped)', line: undefined, comment: SRC !== 'dist' }))];
    const keyHits = dom.keys.filter(k => /maison|etoile/i.test(k));
    details.hygiene.dom = { hits, localStorageKeys: dom.keys };
    const hard = hits.filter(h => !h.soft && !h.comment), soft = hits.filter(h => h.soft || h.comment);
    row('hygiene.dom', scope, hard.length ? 'FAIL' : soft.length || keyHits.length ? 'WARN' : 'PASS', `${hard.length} brand/€ hits, ${soft.length} soft/dev-only hits in rendered DOM (after card/bag/info/go-to were opened)${hard.length || soft.length ? ' — ' + short([...new Set([...hard, ...soft].map(h => `${h.file} ${h.word}: "${h.text.slice(0, 60)}"`))], 3) : ''}${keyHits.length ? ' — storage keys: ' + keyHits.join(', ') : ''}`);
  }
  const all = classifyLogs(s.logs, s.okUrls);
  const late = all.errors.filter(e => !bootLogs.errors.includes(e));
  details.boot[tier].sessionErrors = late;
  details.boot[tier].sessionWarnings = all.warnings.filter(e => !bootLogs.warnings.includes(e));
  if (want('boot')) row('runtime-errors', scope, late.length ? 'FAIL' : 'PASS', late.length ? `${late.length} console errors after ready (during the checks): ${short([...new Set(late)], 2)}` : 'no console errors after ready');
  await s.context.close();
}

// ================================================================================================= layout
async function layoutAt(W, H) {
  const scope = `${W}x${H}`;
  const mobile = W < 900;
  const s = await openStore(browser, port, { W, H, tier: 'low', src: SRC, timeout: TIMEOUT, reducedMotion: true });
  const res = { ready: s.ready, states: {} };
  details.layout[scope] = res;
  if (!s.ready) { row('layout', scope, 'FAIL', 'store not ready: ' + s.readyError); await s.context.close(); return; }
  const ev = (fn, a) => s.page.evaluate(fn, a);
  const env = await ev(() => { const Q = window.__qa, u = window.__ctx.ui; return { root: !!Q.root(), showCard: !Q.isStub(u.showCard), addToBag: !Q.isStub(u.addToBag), openBag: !Q.isStub(u.openBag), showInfo: !Q.isStub(u.showInfo) }; });
  if (!env.root) { row('layout', scope, 'FAIL', 'no HUD (ui module not active)'); await s.context.close(); return; }
  // Final geometry, not mid-slide: frames are scarce under SwiftShader, so transitions are switched off
  await ev(() => { const st = document.createElement('style'); st.textContent = '#me-ui *,#me-ui *::before,#me-ui *::after,#me-ui{transition:none!important;animation:none!important}'; document.head.appendChild(st); window.__qa.lowRes(0.35); });
  const esc = async () => { await s.page.keyboard.press('Escape'); await sleep(200); await s.page.keyboard.press('Escape'); await ev(() => { try { window.__ctx.ui.hideCard(); } catch (e) { /* */ } }); await sleep(500); };
  const settle = () => ev(() => new Promise(r => { const t0 = performance.now(); const f = () => { const busy = document.getAnimations().some(a => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#me-ui') && !/infinite/.test(String(a.effect.getTiming().iterations))); if (!busy || performance.now() - t0 > 6000) r(); else setTimeout(f, 150); }; f(); }));
  const press = async (sel) => { const c = await ev((sel) => { const Q = window.__qa, e = [...document.querySelectorAll(sel)].find(Q.vis); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); if (!c) return false; if (mobile) await tap(s.cdp, c[0], c[1]); else await mouseTap(s.cdp, c[0], c[1]); await frames(s.page, 2); await sleep(800); await settle(); return true; };
  await sleep(2500); await settle();
  res.states.start = await ev(layoutProbe);
  // stress card: the longest product name with the most sizes/colours
  if (env.showCard) {
    await ev(() => { const cat = window.__ctx.catalog; const p = cat.products.slice().sort((a, b) => (b.name.length + b.sizes.length * 3 + b.colours.length * 2) - (a.name.length + a.sizes.length * 3 + a.colours.length * 2))[0]; window.__ctx.ui.showCard(cat.card(p), null); });
    await sleep(900); await settle(); res.states.card = await ev(layoutProbe); await esc();
  } else res.states.card = ['SKIP: showCard stub'];
  if (env.addToBag && env.openBag) {
    await ev(() => { const cat = window.__ctx.catalog; const ps = cat.products.filter(p => p.inStock && p.sizes.some(z => z.inStock)).slice(0, 3); for (const p of ps) window.__ctx.ui.addToBag({ productId: p.id, sizeId: p.sizes.find(z => z.inStock).id, colourId: p.colours[0] && p.colours[0].id, qty: 1 }); window.__ctx.ui.openBag(); });
    await sleep(900); await settle(); res.states.bag = await ev(layoutProbe); await esc();
  } else if (await press('[data-act="bag"]')) { res.states.bag = await ev(layoutProbe); await esc(); }
  if (await press('[data-act="info"]')) { res.states.info = await ev(layoutProbe); await esc(); } else res.states.info = ['no Info button'];
  if (env.showInfo) { await ev(() => window.__ctx.ui.showInfo('faq')); await sleep(900); await settle(); res.states.faq = await ev(layoutProbe); await esc(); }
  if (await press('[data-act="goto"]')) { res.states.goto = await ev(layoutProbe); await esc(); } else res.states.goto = ['no Go to button'];
  const checked = Object.entries(res.states).map(([k, v]) => { const i = v.find(x => x.startsWith('INFO')); return i ? k + ' ' + i.replace(/^INFO checked (\d+) controls.*/, '$1') : k; });
  for (const k of Object.keys(res.states)) res.states[k] = res.states[k].filter(x => !x.startsWith('INFO'));
  const issues = Object.entries(res.states).flatMap(([k, v]) => v.filter(x => !x.startsWith('SKIP')).map(x => `${k}: ${x}`));
  const hard = issues.filter(x => !/: small /.test(x)), small = issues.filter(x => /: small /.test(x));
  res.issues = issues;
  row('layout', scope, hard.length || small.length ? 'FAIL' : 'PASS', issues.length ? `${hard.length} layout + ${small.length} tap-target issues — ${short([...new Set(issues)], 4)}` : `clean — controls checked per state: ${checked.join(', ')}`);
  await s.context.close();
}

// ================================================================================================= contact sheet (PIL)
const SHEET_PY = String.raw`
import sys, json
from PIL import Image, ImageDraw, ImageFont
spec = json.load(sys.stdin)
tiles, cols, tw = spec['tiles'], spec.get('cols', 4), spec.get('tw', 300)
def font(sz, bold=False):
    for f in (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if bold else []) + ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']:
        try: return ImageFont.truetype(f, sz)
        except Exception: pass
    return ImageFont.load_default()
ims = []
for t in tiles:
    im = Image.open(t['path']).convert('RGB')
    ims.append(im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS))
th = max(im.height for im in ims)
lh, hh, pad = 24, 44, 6
rows = (len(ims) + cols - 1) // cols
W = cols * tw + (cols + 1) * pad
H = hh + rows * (th + lh + pad) + pad
sheet = Image.new('RGB', (W, H), (18, 18, 20))
d = ImageDraw.Draw(sheet)
d.text((pad + 4, 12), spec['title'], font=font(17, True), fill=(246, 221, 140))
f = font(13)
for i, im in enumerate(ims):
    r, c = divmod(i, cols)
    x, y = pad + c * (tw + pad), hh + r * (th + lh + pad)
    d.rectangle([x, y, x + tw - 1, y + lh - 1], fill=(8, 8, 10))
    d.text((x + 6, y + 5), tiles[i]['label'], font=f, fill=(250, 247, 242))
    sheet.paste(im, (x, y + lh))
sheet.save(spec['out'], quality=86)
print(spec['out'], sheet.size)
`;
function makeSheet(tiles, out, title) {
  if (!tiles.length) return { ok: false, err: 'no tiles' };
  const r = spawnSync('python3', ['-c', SHEET_PY], { input: JSON.stringify({ tiles, out, title, cols: 4, tw: 300 }), encoding: 'utf8' });
  return r.status === 0 ? { ok: true } : { ok: false, err: (r.stderr || r.error || '').toString().trim().split('\n').pop() };
}

// ================================================================================================= main
try {
  if (want('hygiene')) {
    const h = hygieneSrc();
    details.hygiene.src = h;
    const code = h.hits.filter(x => !x.soft && !x.comment), com = h.hits.filter(x => !x.soft && x.comment), soft = h.hits.filter(x => x.soft && !x.comment);
    row('hygiene.src', `${h.files} files`, code.length ? 'FAIL' : com.length || soft.length ? 'WARN' : 'PASS', `${code.length} code/string hits, ${com.length} in comments, ${soft.length} French-copy hits${code.length ? ' — ' + short(code.map(x => `${x.file}:${x.line} ${x.word}`), 5) : ''}${soft.length ? ' — soft: ' + short(soft.map(x => `${x.file}:${x.line} ${x.word}`), 3) : ''}`);
  }
  const needTier = ['boot', 'budgets', 'catalog', 'ui', 'sheet', 'hygiene'].some(want);
  if (needTier) for (const t of TIERS) { try { await ensureBrowser(); await tierSession(t); } catch (e) { row('tier-session', t, 'FAIL', 'harness exception: ' + e.message.split('\n')[0]); } }
  if (want('layout')) for (const [W, H] of SIZES) { try { await ensureBrowser(); await layoutAt(W, H); } catch (e) { row('layout', `${W}x${H}`, 'FAIL', 'harness exception: ' + e.message.split('\n')[0]); } }
} finally {
  await browser.close(); server.close();
}

// ================================================================================================= report
const dur = Date.now() - T0;
const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
const report = { suite: 'IMAANS 3-D store QA', when: new Date().toISOString(), src: SRC, quick: QUICK, tiers: TIERS, sizes: SIZES.map(s => s.join('x')), durationS: Math.round(dur / 1000), counts, results: rows, details };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const wC = Math.max(5, ...rows.map(r => r.check.length)), wS = Math.max(5, ...rows.map(r => String(r.scope).length));
const lines = [`\nIMAANS QA  ${SRC}${QUICK ? ' --quick' : ''}  ${report.when.slice(0, 16).replace('T', ' ')} UTC  (${Math.floor(dur / 60000)}m${String(Math.round(dur / 1000) % 60).padStart(2, '0')}s)`,
  `${'#'.padStart(3)}  ${'check'.padEnd(wC)}  ${'scope'.padEnd(wS)}  stat  detail`, '-'.repeat(wC + wS + 30)];
rows.forEach((r, i) => lines.push(`${String(i + 1).padStart(3)}  ${r.check.padEnd(wC)}  ${String(r.scope).padEnd(wS)}  ${r.status.padEnd(4)}  ${String(r.detail || '').slice(0, 260)}`));
lines.push('-'.repeat(wC + wS + 30), `PASS ${counts.PASS || 0}  FAIL ${counts.FAIL || 0}  WARN ${counts.WARN || 0}  SKIP ${counts.SKIP || 0}   →  ${path.relative(ROOT, path.join(OUT, 'report.json'))}${Object.values(details.sheets).length ? '  ' + Object.values(details.sheets).map(s => s.path).join('  ') : ''}`);
console.log(lines.join('\n'));
process.exit(counts.FAIL ? 1 : 0);
