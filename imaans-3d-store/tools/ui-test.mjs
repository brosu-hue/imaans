#!/usr/bin/env node
// Functional tests for the ui module (controls + HUD) with Playwright + SwiftShader.
// Simulates real touch (CDP multi-touch with input timestamps), mouse and keyboard and asserts on
// camera pose, collisions, cards, bag, tour, go-to, glide, layout at many sizes, shot-mode respect.
//
//   node tools/ui-test.mjs [--modules ui,_uitest] [--src dist] [--only name,name] [--tier mid]
// Exit code 1 if any test fails.
import { parseArgs, startServer, launch, openStore, sleep } from './ui-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const MODULES = args.src === 'dist' ? '' : String(args.modules || 'ui,_uitest');
const ONLY = args.only ? new Set(String(args.only).split(',')) : null;
const EYE = 1.62, R = 0.28;
const { server, port } = await startServer();
const browser = await launch();
const results = [];

// ------------------------------------------------------------------------------------------------ helpers
const frames = (page, n = 2) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const simWait = (page, sec, maxMs = Number(args.maxwait || 90000)) => page.evaluate(([sec, maxMs]) => new Promise(r => { const t0 = window.__ctx.time, w0 = performance.now(); const f = () => (window.__ctx.time - t0 >= sec || performance.now() - w0 > maxMs ? r(window.__ctx.time - t0) : requestAnimationFrame(f)); f(); }), [sec, maxMs]);
const pose = (page) => page.evaluate(() => { const u = window.__ui, c = window.__ctx.camera; return { x: c.position.x, y: c.position.y, z: c.position.z, yaw: u.controls.pose.yaw, pitch: u.controls.pose.pitch, t: window.__ctx.time }; });
const TP = (page, p, t) => page.evaluate(([p, t]) => { const c = window.__ctx.camera; c.position.set(...p); c.lookAt(...t); window.__ui.controls.resync(); }, [p, t]).then(() => frames(page, 3));
const project = (page, p) => page.evaluate((p) => { const c = window.__ctx; c.camera.updateMatrixWorld(); const v = new c.THREE.Vector3(...p).project(c.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, p);
const nowS = () => Date.now() / 1000;
const touch = (cdp, type, pts, ts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1 })), timestamp: ts ?? nowS() });
// wait until an element stops moving (CSS slide-in transitions run late when frames are slow)
async function stableBox(page, sel, maxMs = 8000) {
  const t0 = Date.now(); let last = null;
  for (;;) {
    const b = await page.locator(sel).first().boundingBox();
    if (b && last && Math.abs(b.x - last.x) < 0.5 && Math.abs(b.y - last.y) < 0.5) return b;
    if (Date.now() - t0 > maxMs) return b;
    last = b; await new Promise(r => setTimeout(r, 120));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // a real frame in between
  }
}
async function tap(cdp, x, y) { const T = nowS(); await touch(cdp, 'touchStart', [[x, y]], T); await touch(cdp, 'touchEnd', [], T + 0.06); }
async function mouseTap(cdp, x, y) {
  const T = nowS();
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: T - 0.05 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, timestamp: T });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, timestamp: T + 0.07 });
}
/** touch drag from a to b in n steps (dt seconds per step, stamped) */
async function drag(cdp, [x0, y0], [x1, y1], n = 10, dt = 0.016, id = 1) {
  let T = nowS();
  await touch(cdp, 'touchStart', [[x0, y0, id]], T);
  for (let i = 1; i <= n; i++) { T += dt; await touch(cdp, 'touchMove', [[x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, id]], T); }
  T += dt; await touch(cdp, 'touchEnd', [], T);
}
const clickSel = async (page, cdp, sel, mobile = true) => {
  const b = await stableBox(page, sel); if (!b) throw new Error('missing ' + sel);
  if (mobile) await tap(cdp, b.x + b.width / 2, b.y + b.height / 2); else await mouseTap(cdp, b.x + b.width / 2, b.y + b.height / 2);
  await frames(page, 2);
};
const errorsOf = (logs) => logs.filter(l => !/KHR_parallel_shader_compile|GPU stall due to ReadPixels|GL_CLOSE_PATH_NV/.test(l));
function ok(cond, msg) { if (!cond) throw new Error(msg); }
async function withPage(o, fn) {
  const s = await openStore(browser, port, { modules: MODULES, tier: args.tier || 'mid', src: args.src, ...o });
  s.cdp = await s.context.newCDPSession(s.page);
  let r; try { r = await fn(s); } finally { await s.context.close(); }
  return r;
}
async function test(name, fn) {
  if (ONLY && !ONLY.has(name)) return;
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ name, pass: true, ms: Date.now() - t0, detail }); process.stderr.write(`PASS ${name} ${detail ? JSON.stringify(detail) : ''}\n`); }
  catch (e) { results.push({ name, pass: false, ms: Date.now() - t0, error: e.message.split('\n')[0] }); process.stderr.write(`FAIL ${name}: ${e.message.split('\n')[0]}\n`); }
}

// ------------------------------------------------------------------------------------------------ tests
await test('boot', () => withPage({ W: 390, H: 844 }, async ({ page, logs }) => {
  await sleep(2200);
  const s = await page.evaluate(() => ({
    fonts: document.fonts.check('600 20px "Cinzel"') && document.fonts.check('500 20px "Cinzel"') && document.fonts.check('400 20px "Marcellus"') && document.fonts.check('400 15px "Jost"') && document.fonts.check('500 15px "Jost"'),
    ctxFonts: window.__ctx.fonts, loader: !!document.querySelector('.me-loader'), hint: !!document.querySelector('.me-hint.is-on'), title: document.title,
    uiReplaced: (() => { window.__ctx.ui.toast('ui-test toast'); return [...document.querySelectorAll('.me-toast')].some(t => /ui-test toast/.test(t.textContent)); })(),
    api: ['toast', 'showCard', 'hideCard', 'setLoading', 'addToBag', 'openBag', 'showInfo'].filter(k => typeof window.__ctx.ui[k] !== 'function' || /^\s*\w*\s*\(_/.test(String(window.__ctx.ui[k]))),
    word: document.querySelector('.me-word')?.textContent, brand: window.__ctx.brand.name,
    euro: /€|EUR|TTC|Maison|Étoile|chérie/.test(document.getElementById('me-ui').textContent),
    ann: document.querySelector('.me-annchip span, .me-annbar span')?.textContent, annData: window.__ctx.brand.announcement,
    mod: window.__MODSTATS().ui,
    hscroll: document.documentElement.scrollWidth > innerWidth,
  }));
  ok(s.fonts, 'fonts not loaded'); ok(!s.loader, 'loader still present'); ok(s.hint, 'first-run hint not shown');
  ok(/Cinzel/.test(s.ctxFonts.display) && /Jost/.test(s.ctxFonts.sans), 'ctx.fonts not set: ' + JSON.stringify(s.ctxFonts));
  ok(s.uiReplaced && !s.api.length, 'ctx.ui not replaced: ' + s.api.join(','));
  ok(s.word === s.brand && s.brand === 'IMAANS', 'wordmark ' + s.word);
  ok(!s.euro, 'old brand / euro copy in the HUD');
  ok(!s.annData || s.ann === s.annData, 'announcement not shown: ' + s.ann);
  if (args.src === 'dist') ok(s.title === 'IMAANS', 'title ' + s.title);
  ok(s.mod && s.mod.calls === 0, 'ui draw calls ' + JSON.stringify(s.mod)); ok(!s.hscroll, 'horizontal scroll');
  ok(errorsOf(logs).length === 0, 'console: ' + errorsOf(logs).join(' | '));
  return { title: s.title, uiCalls: s.mod.calls, display: s.ctxFonts.display.split(',')[0] };
}));

await test('touch-look+pitch-clamp+hint', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1500);
  const a = await pose(page);
  await drag(cdp, [320, 300], [180, 300], 12);
  await simWait(page, 0.6);
  const b = await pose(page);
  ok(b.yaw < a.yaw - 0.35, `yaw did not turn right on a leftward drag: ${a.yaw.toFixed(3)} → ${b.yaw.toFixed(3)}`);
  ok(Math.hypot(b.x - a.x, b.z - a.z) < 0.01, 'look drag moved the camera');
  const hint = await page.evaluate(() => !!document.querySelector('.me-hint.is-on'));
  ok(!hint, 'hint not dismissed on first interaction');
  const stored = await page.evaluate(() => { try { return localStorage.getItem('imaans:hint:v1'); } catch (e) { return 'err'; } });
  ok(stored === '1', 'hint dismissal not remembered');
  await drag(cdp, [300, 150], [300, 820], 20);
  await simWait(page, 0.6);
  const c = await pose(page);
  ok(c.pitch <= 55 * Math.PI / 180 + 1e-3 && c.pitch > 50 * Math.PI / 180, 'pitch clamp: ' + (c.pitch * 180 / Math.PI).toFixed(1));
  // inertia: a fast flick keeps turning a little after release
  const d0 = await pose(page);
  await drag(cdp, [340, 400], [240, 400], 4, 0.012);
  const d1 = await pose(page); await simWait(page, 0.5); const d2 = await pose(page);
  ok(Math.abs(d2.yaw - d1.yaw) > 0.005, 'no look inertia after flick');
  ok(Math.abs(d2.yaw - d1.yaw) < 0.45, 'look inertia too strong: ' + (d2.yaw - d1.yaw).toFixed(3));
  return { yawTurn: +(b.yaw - a.yaw).toFixed(3), pitchDeg: +(c.pitch * 180 / Math.PI).toFixed(1), inertia: +(d2.yaw - d1.yaw).toFixed(3), d0: +d0.yaw.toFixed(2) };
}));

await test('joystick-walk', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await TP(page, [0, EYE, 8.4], [0, EYE, -4]);
  const a = await pose(page);
  const [x, y] = [90, 700];
  let T = nowS();
  await touch(cdp, 'touchStart', [[x, y]], T);
  for (let i = 1; i <= 6; i++) { T += 0.016; await touch(cdp, 'touchMove', [[x, y - i * 10]], T); }
  const vis = await page.evaluate(() => document.querySelector('.me-joy').classList.contains('is-on'));
  await simWait(page, 0.6);                   // let the easing reach cruising speed, then measure
  const a1 = await pose(page);
  const w = await simWait(page, 2.0);
  const b = await pose(page);
  await touch(cdp, 'touchEnd', [], T + 0.1);
  await simWait(page, 0.8);
  const c = await pose(page);
  const hidden = await page.evaluate(() => !document.querySelector('.me-joy').classList.contains('is-on'));
  const dz = a.z - b.z, speed = (a1.z - b.z) / w;
  ok(vis, 'joystick not shown'); ok(hidden, 'joystick not hidden on release');
  ok(dz > 1.6 && speed > 1.2 && speed < 1.5, `joystick walk ${dz.toFixed(2)} m, cruising speed ${speed.toFixed(2)} m/s`);
  ok(Math.abs(b.x - a.x) < 0.1, 'drifted sideways ' + (b.x - a.x).toFixed(3));
  ok(c.z < b.z && b.z - c.z < 0.5, 'no easing-out after release: ' + (b.z - c.z).toFixed(3));
  ok(Math.abs(b.y - EYE) < 0.02, 'eye height ' + b.y.toFixed(3));
  return { dz: +dz.toFixed(2), sim: +w.toFixed(2), speed: +speed.toFixed(2), coast: +(b.z - c.z).toFixed(3) };
}));

await test('joystick+look-multitouch', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await TP(page, [0, EYE, 8.4], [0, EYE, -4]);
  const a = await pose(page);
  let T = nowS();
  await touch(cdp, 'touchStart', [[90, 700, 1]], T);
  T += 0.016; await touch(cdp, 'touchMove', [[90, 650, 1]], T);
  T += 0.016; await touch(cdp, 'touchStart', [[90, 650, 1], [300, 300, 2]], T);
  for (let i = 1; i <= 8; i++) { T += 0.016; await touch(cdp, 'touchMove', [[90, 650, 1], [300 - i * 10, 300, 2]], T); }
  await simWait(page, 1.0);
  const b = await pose(page);
  await touch(cdp, 'touchEnd', [], T + 0.05);
  ok(b.yaw < a.yaw - 0.1, 'second finger did not look'); ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.6, 'first finger did not walk');
  return { turned: +(b.yaw - a.yaw).toFixed(2), moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2) };
}));

await test('collision-box+circle', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  // knit table box collider at (-2.1, 4.8) 1.9 × 0.95 → the eye must stop at z ≥ 4.8 + 0.475 + R
  await TP(page, [-2.1, EYE, 7.2], [-2.1, EYE, 0]);
  await page.keyboard.down('KeyW'); await simWait(page, 3.5); await page.keyboard.up('KeyW');
  const b = await pose(page);
  ok(b.z >= 4.8 + 0.475 + R - 0.02, 'walked into the table: z=' + b.z.toFixed(3));
  ok(b.z < 5.7, 'did not reach the table: z=' + b.z.toFixed(3));
  // plinth circle (0,-2) r 1.5 via the joystick, straight on
  await TP(page, [0, EYE, 2.2], [0, EYE, -6]);
  let T = nowS(); await touch(cdp, 'touchStart', [[90, 700]], T);
  for (let i = 1; i <= 6; i++) { T += 0.016; await touch(cdp, 'touchMove', [[90, 700 - i * 10]], T); }
  await simWait(page, 3.0);
  await touch(cdp, 'touchEnd', [], T + 0.05);
  const c = await pose(page);
  const d = Math.hypot(c.x - 0, c.z + 2);
  ok(d >= 1.5 + R - 0.02, 'walked into the plinth: d=' + d.toFixed(3));
  // walls: keep walking toward the storefront
  await TP(page, [3.5, EYE, 9.5], [3.5, EYE, 20]);
  await page.keyboard.down('KeyW'); await simWait(page, 2.5); await page.keyboard.up('KeyW');
  const w = await pose(page);
  ok(w.z <= 11 - 0.35 - R + 0.01, 'walked through the storefront: z=' + w.z.toFixed(3));
  return { tableStopZ: +b.z.toFixed(3), plinthDist: +d.toFixed(3), wallZ: +w.z.toFixed(3) };
}));

const bagState = (page) => page.evaluate(() => ({ n: document.querySelector('.me-badge').textContent, label: document.querySelector('.me-bagbtn').getAttribute('aria-label'),
  stored: (() => { try { return JSON.parse(localStorage.getItem('imaans_cart_v1') || 'null'); } catch (e) { return 'err'; } })(), toasts: [...document.querySelectorAll('.me-toast')].map(t => t.textContent).join('|') }));

await test('tap-card-swatch-bag', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await page.evaluate(() => { window.__ev = []; for (const k of ['imaans:add-to-bag', 'imaans:view-product']) window.addEventListener(k, (e) => window.__ev.push([k, e.detail])); });
  // an OLDER info object (numeric price, string sizes, no productId) still renders — in Rand, no €
  await TP(page, [1.3, EYE, 1.3], [0.1, 1.1, -2.3]);
  const b0 = await page.evaluate(() => window.__uitest.bursts);
  let [x, y] = await project(page, [0.1, 1.2, -2.5]);
  await tap(cdp, x, y); await frames(page, 2); await sleep(700);
  const c1 = await page.evaluate(() => ({ open: document.querySelector('.me-card').classList.contains('is-open'), title: document.querySelector('#me-card-title')?.textContent, price: document.querySelector('.me-price')?.textContent, bursts: window.__uitest.bursts, img: !!document.querySelector('.me-card .me-ph') }));
  ok(c1.open && c1.title === 'Ivory Slip Dress' && c1.price === 'R 420.00' && !c1.img, 'legacy card: ' + JSON.stringify(c1));
  ok(c1.bursts > b0, 'no fx.burst at the tap point');
  // a real catalogue knit: photo, price, colours (apply()), sizes (sold out disabled), short description
  await TP(page, [-1.3, EYE, 6.4], [-2.4, 0.9, 4.8]);
  [x, y] = await project(page, [-2.4, 0.92, 4.8]);
  await tap(cdp, x, y); await frames(page, 2); await sleep(700);
  const exp = await page.evaluate(() => { const c = window.__ctx.catalog, p = c.get(window.__uitest.cards.knit); return { id: p.id, name: p.name, price: c.formatPrice(c.priceOf(p)), short: p.short, colours: p.colours.map(x => x.label), sizes: p.sizes.map(z => [z.id, z.label, z.inStock]), img: c.imageUrl(p, window.__ctx.assets.base) }; });
  const c2 = await page.evaluate(() => ({ title: document.querySelector('#me-card-title')?.textContent, taps: window.__uitest.taps, sw: document.querySelectorAll('.me-swb').length, price: document.querySelector('.me-price span')?.textContent,
    img: document.querySelector('.me-card .me-ph img')?.getAttribute('src'), subt: document.querySelector('.me-card .me-subt')?.textContent, imgOk: (() => { const i = document.querySelector('.me-card .me-ph img'); return !!i && (!i.complete || i.naturalWidth > 0); })(),
    site: !!document.querySelector('.me-card .me-site'), ev: window.__ev.filter(e => e[0] === 'imaans:view-product').map(e => e[1].productId) }));
  ok(c2.title === exp.name && c2.taps === 1 && c2.sw === exp.colours.length && c2.price === exp.price && c2.subt === exp.short, 'knit card: ' + JSON.stringify({ c2, exp }));
  ok(c2.img === exp.img && c2.imgOk, 'product photo: ' + c2.img);
  ok(!c2.site, '"View on website" must be hidden standalone');
  ok(c2.ev.includes(exp.id), 'imaans:view-product not dispatched: ' + JSON.stringify(c2.ev));
  await clickSel(page, cdp, '.me-swb[data-i="1"]');
  const ap = await page.evaluate(() => ({ applied: window.__uitest.applied.slice(), on: document.querySelector('.me-swb.is-on')?.getAttribute('data-i'), lbl: document.querySelector('.me-cw-n')?.textContent }));
  ok(ap.applied.includes(exp.colours[1]) && ap.on === '1' && ap.lbl === exp.colours[1], 'swatch: ' + JSON.stringify(ap));
  const sz0 = await page.evaluate(() => ({ n: document.querySelectorAll('.me-szb').length, out: [...document.querySelectorAll('.me-szb.out')].map(b => b.textContent), on: document.querySelector('.me-szb.is-on')?.textContent || null }));
  ok(sz0.n === exp.sizes.length && sz0.out.join() === exp.sizes.filter(z => !z[2]).map(z => z[1]).join() && sz0.on === null, 'sizes: ' + JSON.stringify(sz0));
  // no size chosen yet → Add to bag asks for one and adds nothing
  await clickSel(page, cdp, '.me-card [data-act="add"]'); await sleep(900);
  const nb = await bagState(page);
  ok(nb.n === '0' && /size/i.test(nb.toasts), 'added without a size: ' + JSON.stringify(nb));
  await clickSel(page, cdp, '.me-szb.out'); await sleep(200);
  const sz1 = await page.evaluate(() => ({ on: document.querySelector('.me-szb.is-on')?.textContent || null, toast: [...document.querySelectorAll('.me-toast')].map(t => t.textContent).join('|') }));
  ok(sz1.on === null && /sold out/.test(sz1.toast), 'sold-out size was selectable: ' + JSON.stringify(sz1));
  const si = exp.sizes.findIndex(z => z[2]);
  await clickSel(page, cdp, `.me-szb[data-i="${si}"]`);
  const sz2 = await page.evaluate(() => ({ on: document.querySelector('.me-szb.is-on')?.textContent, lbl: document.querySelector('.me-sz-l')?.textContent }));
  ok(sz2.on === exp.sizes[si][1] && sz2.lbl === exp.sizes[si][1], 'size pick: ' + JSON.stringify(sz2));
  await clickSel(page, cdp, '.me-card [data-act="add"]');
  await sleep(1500);
  const bag = await bagState(page);
  const colourId = await page.evaluate(() => window.__ctx.catalog.get(window.__uitest.cards.knit).colours[1].id);
  const line = bag.stored && bag.stored.lines && bag.stored.lines[0];
  ok(bag.n === '1' && /1 item/.test(bag.label), 'bag badge: ' + JSON.stringify(bag));
  ok(bag.stored && bag.stored.v === 1 && line && line.productId === exp.id && line.sizeId === exp.sizes[si][0] && line.colourId === colourId && line.qty === 1 && Object.keys(line).sort().join() === 'colourId,lineId,productId,qty,sizeId',
    'stored line (website shape) ' + JSON.stringify(bag.stored));
  const ev = await page.evaluate(() => window.__ev.filter(e => e[0] === 'imaans:add-to-bag').map(e => e[1]));
  ok(ev.length === 1 && ev[0].items[0].productId === exp.id && ev[0].count === 1, 'imaans:add-to-bag ' + JSON.stringify(ev));
  // tap empty ceiling → card closes
  await tap(cdp, 200, 60 + 60); await frames(page, 2); await sleep(300);
  const closed = await page.evaluate(() => !document.querySelector('.me-card').classList.contains('is-open'));
  ok(closed, 'tap on nothing did not close the card');
  // bag sheet: line with size + colour, qty +/−, total, WhatsApp link mirroring the website's order message
  await clickSel(page, cdp, '.me-bagbtn'); await sleep(500);
  await clickSel(page, cdp, '.me-qty [data-d="1"]'); await sleep(200);
  const sheet = await page.evaluate(() => { const a = document.querySelector('.me-bag-foot a.me-wa'); return { open: !!document.querySelector('[data-sheet="bag"].is-open'), row: document.querySelector('.me-bag-list li')?.textContent.replace(/\s+/g, ' ').trim(),
    qty: document.querySelector('.me-qty output')?.textContent, total: document.querySelector('.me-total b')?.textContent, href: a && a.getAttribute('href'), target: a && a.getAttribute('target'), rel: a && a.getAttribute('rel'), badge: document.querySelector('.me-badge').textContent }; });
  const want = await page.evaluate(([id, si]) => { const c = window.__ctx.catalog, b = window.__ctx.brand, p = c.get(id), z = p.sizes[si], col = p.colours[1];
    // the website's totals block: Subtotal + Delivery rows only when the shop charges delivery (content-driven)
    const sub = c.priceOf(p) * 2, ck = b.checkout || {}, fee = typeof ck.deliveryFeeCents === 'number' ? ck.deliveryFeeCents : 0;
    const thr = typeof ck.freeDeliveryOverCents === 'number' ? ck.freeDeliveryOverCents : null, del = thr !== null && sub >= thr ? 0 : fee;
    const totals = (del > 0 || fee > 0 ? ['Subtotal: ' + c.formatPrice(sub), 'Delivery: ' + (del > 0 ? c.formatPrice(del) : 'Free')] : []).concat('Total: ' + c.formatPrice(sub + del)).join('\n');
    return { total: c.formatPrice(c.priceOf(p) * 2), wa: String(b.checkout.whatsappNumber || b.contact.whatsapp).replace(/\D/g, ''), intro: b.checkout.messageIntro, outro: b.checkout.messageOutro, totals,
      line: `1. ${p.name} (Size ${z.label}, ${col.label}${p.sku ? ', ' + p.sku : ''}) x2 - ${c.formatPrice(c.priceOf(p) * 2)}` }; }, [exp.id, si]);
  ok(sheet.open && sheet.row.includes(exp.name) && sheet.row.includes(exp.colours[1]) && sheet.row.includes(exp.sizes[si][1]), 'bag sheet: ' + JSON.stringify(sheet));
  ok(sheet.qty === '2' && sheet.total === want.total && sheet.badge === '2', 'qty/total: ' + JSON.stringify(sheet));
  ok(sheet.href && sheet.href.startsWith('https://wa.me/' + want.wa + '?text=') && sheet.target === '_blank' && /noopener/.test(sheet.rel), 'WhatsApp link: ' + sheet.href);
  const msg = decodeURIComponent(sheet.href.split('?text=')[1]);
  const wantMsg = [want.intro, want.line, want.totals, want.outro].filter(Boolean).join('\n\n');
  ok(msg === wantMsg, 'order message:\n' + msg + '\n--- want ---\n' + wantMsg);
  await clickSel(page, cdp, '.me-qty [data-d="-1"]'); await sleep(200);
  const q1 = await page.evaluate(() => document.querySelector('.me-qty output')?.textContent);
  await clickSel(page, cdp, '.me-bag-list [data-act="bag-remove"]'); await sleep(300);
  const n2 = await page.evaluate(() => ({ n: document.querySelector('.me-badge').textContent, empty: !!document.querySelector('.me-bag-list .me-empty'), stored: JSON.parse(localStorage.getItem('imaans_cart_v1')).lines.length }));
  ok(q1 === '1' && n2.n === '0' && n2.empty && n2.stored === 0, 'qty−/remove: ' + JSON.stringify({ q1, n2 }));
  return { card: c2.title, price: c2.price, bagRow: sheet.row, msgLines: msg.split('\n').length };
}));

await test('look-card+addToBag-api', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  // "complete the look": the pieces are listed; tapping one opens its own card; the action adds all three
  await TP(page, [0.1, EYE, 1.6], [0.1, 1.1, -2]);
  let [x, y] = await project(page, [0.8, 1.2, -1.6]);
  await tap(cdp, x, y); await frames(page, 2); await sleep(700);
  const lk = await page.evaluate(() => ({ items: [...document.querySelectorAll('.me-look .me-lk-i b')].map(b => b.textContent), pri: document.querySelector('.me-card .me-cta.pri')?.textContent, add: !!document.querySelector('.me-card [data-act="add"]'),
    want: window.__uitest.cards.look.map(id => window.__ctx.catalog.get(id).name) }));
  ok(lk.items.join('|') === lk.want.join('|') && /look/i.test(lk.pri) && !lk.add, 'look card: ' + JSON.stringify(lk));
  await clickSel(page, cdp, '.me-card [data-act="action"]'); await sleep(1600);
  const b1 = await bagState(page);
  ok(b1.n === '3' && b1.stored.lines.length === 3 && /3 pieces/.test(b1.toasts), 'add the look: ' + JSON.stringify(b1));
  await clickSel(page, cdp, '.me-look [data-i="1"]'); await sleep(600);
  const sub = await page.evaluate(() => ({ title: document.querySelector('#me-card-title')?.textContent, add: !!document.querySelector('.me-card [data-act="add"]') }));
  ok(sub.title === lk.want[1] && sub.add, 'look piece card: ' + JSON.stringify(sub));
  // ctx.ui.addToBag: same line merges, sold-out size is refused, qty clamps to 99
  const r = await page.evaluate(() => {
    const c = window.__ctx.catalog, p = c.products.find(p => p.inStock && p.sizes.some(z => !z.inStock) && p.sizes.some(z => z.inStock));
    const ok1 = window.__ctx.ui.addToBag({ productId: p.id, sizeId: p.sizes.find(z => z.inStock).id, qty: 1 });
    window.__ctx.ui.addToBag({ productId: p.id, sizeId: p.sizes.find(z => z.inStock).id, qty: 150 });
    const bad = window.__ctx.ui.addToBag({ productId: p.id, sizeId: p.sizes.find(z => !z.inStock).id });
    const unknown = window.__ctx.ui.addToBag({ productId: 'prd_does_not_exist' });
    const st = JSON.parse(localStorage.getItem('imaans_cart_v1')).lines;
    return { added: ok1.added, refused: bad.refused.length, unknown: unknown.refused.length, lines: st.length, qty: st.find(l => l.productId === p.id && !l.colourId).qty };
  });
  ok(r.added === 1 && r.refused === 1 && r.unknown === 1 && r.lines === 4 && r.qty === 99, 'addToBag rules: ' + JSON.stringify(r));
  // persists across a reload (ids + qty only), and ctx.ui.openBag() shows it
  await page.reload(); await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: 120000 }); await sleep(1200);
  await page.evaluate(() => window.__ctx.ui.openBag()); await sleep(700);
  const rl = await page.evaluate(() => ({ n: document.querySelector('.me-badge').textContent, rows: document.querySelectorAll('.me-bag-list .me-bl').length, open: !!document.querySelector('[data-sheet="bag"].is-open') }));
  ok(rl.n === '99+' && rl.rows === 4 && rl.open, 'after reload: ' + JSON.stringify(rl));
  return { look: lk.items.length, rules: r, reload: rl };
}));

await test('website-bridge', () => withPage({ W: 390, H: 844, beforeReady: async (page) => {
  // a stand-in for the Imaan's website runtime (window.IS with cart.js's IS.cart API) — installed before boot
  await page.evaluate(() => {
    const calls = [], lines = [], subs = [];
    window.IS = { router: { go() {} }, bus: { on: (e, fn) => { if (e === 'cart:change') subs.push(fn); }, emit() {} },
      cart: { add: (o) => { calls.push(o); lines.push({ lineId: 'ln' + calls.length, productId: o.productId, sizeId: o.sizeId, colourId: o.colourId, qty: o.qty || 1, product: { name: 'Site product', images: [] }, size: null, colour: null, unitCents: 10000, lineCents: 10000 * (o.qty || 1) }); subs.forEach(f => f({ removed: [] })); return 'ln' + calls.length; },
        count: () => lines.reduce((a, l) => a + l.qty, 0), lines: () => lines.slice(), setQty() { return true; }, remove() { return true; }, clear() {}, orderUrl: () => 'https://wa.me/27000000000?text=site' } };
    window.__siteCalls = calls;
  });
} }, async ({ page, cdp }) => {
  await sleep(1200);
  await TP(page, [-1.3, EYE, 6.4], [-2.4, 0.9, 4.8]);
  const [x, y] = await project(page, [-2.4, 0.92, 4.8]);
  await tap(cdp, x, y); await frames(page, 2); await sleep(700);
  const site = await page.evaluate(() => { const a = document.querySelector('.me-card a.me-site'); return a && a.getAttribute('href'); });
  const want = await page.evaluate(() => window.__ctx.catalog.siteUrl(window.__ctx.catalog.get(window.__uitest.cards.knit)));
  ok(site === want, '"View on website" link: ' + site + ' want ' + want);
  const si = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out')));
  await clickSel(page, cdp, `.me-szb[data-i="${si}"]`);
  await clickSel(page, cdp, '.me-card [data-act="add"]'); await sleep(1500);
  const r = await page.evaluate(() => ({ calls: window.__siteCalls, n: document.querySelector('.me-badge').textContent, local: localStorage.getItem('imaans_cart_v1'),
    knit: window.__ctx.catalog.get(window.__uitest.cards.knit) }));
  ok(r.calls.length === 1 && r.calls[0].productId === r.knit.id && r.calls[0].sizeId === r.knit.sizes[si].id && r.calls[0].colourId === r.knit.colours[0].id && r.calls[0].qty === 1, 'IS.cart.add opts ' + JSON.stringify(r.calls));
  ok(r.n === '1' && r.local === null, 'badge must follow IS.cart.count() and nothing is stored locally: ' + JSON.stringify({ n: r.n, local: r.local }));
  await page.evaluate(() => window.__ctx.ui.openBag()); await sleep(600);
  const b = await page.evaluate(() => ({ href: document.querySelector('.me-bag-foot a.me-wa')?.getAttribute('href'), cart: !!document.querySelector('.me-bag-foot a[href="#/cart"]'), row: document.querySelector('.me-bl b')?.textContent }));
  ok(b.href === 'https://wa.me/27000000000?text=site' && b.cart && b.row === 'Site product', 'embedded bag sheet: ' + JSON.stringify(b));
  return { calls: r.calls.length, site };
}));

await test('info-pages', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await clickSel(page, cdp, '[data-act="info"]'); await sleep(500);
  const m = await page.evaluate(() => ({ items: [...document.querySelectorAll('.me-mi .t')].map(e => e.textContent), want: window.__ctx.brand.pages.map(p => p.title), word: document.querySelector('.me-ib-w')?.textContent }));
  ok(m.want.every(t => m.items.includes(t)) && m.items.includes('Visit us') && m.items.includes('Credits') && m.word === 'IMAANS', 'info menu: ' + JSON.stringify(m));
  await clickSel(page, cdp, '.me-mi[data-slug="about"]'); await sleep(400);
  const ab = await page.evaluate(() => { const p = window.__ctx.brand.pages.find(p => p.slug === 'about'); return { h: document.querySelector('.me-pt')?.textContent, h3: document.querySelector('.me-info-bd h3')?.textContent, want: p.title, want3: p.blocks[0].heading, back: getComputedStyle(document.querySelector('.me-back')).display }; });
  ok(ab.h === ab.want && ab.h3 === ab.want3 && ab.back !== 'none', 'about page: ' + JSON.stringify(ab));
  await clickSel(page, cdp, '.me-back'); await sleep(300);
  const back = await page.evaluate(() => document.querySelectorAll('.me-mi').length);
  ok(back >= 7, 'back to menu: ' + back);
  // FAQ accordion
  await page.evaluate(() => window.__ctx.ui.showInfo('faq')); await sleep(400);
  const q0 = await page.evaluate(() => ({ n: document.querySelectorAll('.me-q').length, hidden: document.querySelector('.me-a').hidden, want: window.__ctx.brand.pages.find(p => p.slug === 'faq').blocks.reduce((a, b) => a + b.items.length, 0) }));
  await clickSel(page, cdp, '.me-q'); await sleep(200);
  const q1 = await page.evaluate(() => ({ exp: document.querySelector('.me-q').getAttribute('aria-expanded'), hidden: document.querySelector('.me-a').hidden }));
  ok(q0.n === q0.want && q0.hidden && q1.exp === 'true' && !q1.hidden, 'faq accordion: ' + JSON.stringify({ q0, q1 }));
  // Visit us: address, hours, links
  await page.evaluate(() => window.__ctx.ui.showInfo('visit')); await sleep(400);
  const v = await page.evaluate(() => { const b = window.__ctx.brand; const links = [...document.querySelectorAll('.me-info-bd a')].map(a => [a.getAttribute('href'), a.getAttribute('target')]);
    return { addr: document.querySelector('.me-addr')?.innerText.split('\n'), want: b.contact.addressLines, rows: document.querySelectorAll('.me-hours tr').length, days: b.hours.days.length, today: document.querySelectorAll('.me-hours tr.is-today').length, links,
      insta: (b.social.find(s => /insta/i.test(s.label)) || {}).url, wa: b.contact.whatsapp, email: b.contact.email, note: document.querySelector('.me-note')?.textContent === b.hours.note,
      sel: getComputedStyle(document.querySelector('.me-ct .v')).userSelect || getComputedStyle(document.querySelector('.me-ct .v')).webkitUserSelect }; });
  const has = (pre, tgt) => v.links.some(([h, t]) => h && h.startsWith(pre) && (tgt === undefined || t === tgt));
  ok(v.addr.join('|') === v.want.join('|') && v.rows === v.days && v.today === 1 && v.note, 'visit: ' + JSON.stringify(v));
  ok(has('tel:') && has('https://wa.me/' + v.wa, '_blank') && has('mailto:' + v.email) && has(v.insta, '_blank') && v.sel === 'text', 'visit links: ' + JSON.stringify(v.links) + ' select ' + v.sel);
  // Size guide renders the site's size lists; credits load
  await page.evaluate(() => window.__ctx.ui.showInfo('size-guide')); await sleep(400);
  const sg = await page.evaluate(() => ({ chips: document.querySelectorAll('.me-sizes span').length, want: window.__ctx.catalog.sizeGuides.reduce((a, g) => a + g.sizes.length, 0), h: document.querySelector('.me-pt')?.textContent }));
  ok(sg.chips === sg.want, 'size guide: ' + JSON.stringify(sg));
  await page.evaluate(() => window.__ctx.ui.showInfo('credits')); await sleep(1200);
  const cr = await page.evaluate(() => document.querySelector('.me-credits')?.textContent);
  ok(/Cinzel/.test(cr) && /three\.js/.test(cr), 'credits: ' + cr);
  // the brand pill opens About; Escape closes
  await page.keyboard.press('Escape'); await sleep(300);
  await clickSel(page, cdp, '.me-brand'); await sleep(500);
  const br = await page.evaluate(() => ({ open: !!document.querySelector('[data-sheet="info"].is-open'), view: window.__ui.hud.infoView }));
  ok(br.open && br.view === 'about', 'brand pill: ' + JSON.stringify(br));
  return { menu: m.items.length, faq: q0.n, sizes: sg.chips };
}));

await test('action-button', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await TP(page, [1.2, EYE, 6.8], [2.3, 0.7, 4.8]);
  const [x, y] = await project(page, [2.3, 0.8, 4.8]);
  await tap(cdp, x, y); await frames(page, 2); await sleep(600);
  const n = await page.evaluate(() => ({ pri: document.querySelector('.me-card .me-cta.pri')?.textContent, add: !!document.querySelector('[data-act="add"]') }));
  ok(n.pri && /sparkle/.test(n.pri) && !n.add, 'no-price card should promote its first action and hide Add to bag: ' + JSON.stringify(n));
  await clickSel(page, cdp, '.me-card .me-cta.pri');
  const a = await page.evaluate(() => window.__uitest.actions);
  ok(a === 1, 'action.run not called');
  return n;
}));

await test('double-tap-glide', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await TP(page, [0, EYE, 8.4], [0, 0.6, 4.5]);
  const [x, y] = await project(page, [0, 0, 6.2]);
  const T = nowS();
  await touch(cdp, 'touchStart', [[x, y]], T); await touch(cdp, 'touchEnd', [], T + 0.05);
  await touch(cdp, 'touchStart', [[x + 3, y + 2]], T + 0.2); await touch(cdp, 'touchEnd', [], T + 0.25);
  const kind = await page.evaluate(() => window.__ui.nav.kind);
  await simWait(page, 3.0);
  const b = await pose(page);
  ok(kind === 'glide', 'glide not started: ' + kind);
  ok(Math.abs(b.z - 6.2) < 0.45 && Math.abs(b.x) < 0.3, `glide ended at ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
  return { end: [+b.x.toFixed(2), +b.z.toFixed(2)] };
}));

await test('tour-start-stop', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  const a = await pose(page);
  await clickSel(page, cdp, '[data-act="tour"]');
  const s1 = await page.evaluate(() => ({ kind: window.__ui.nav.kind, on: document.querySelector('[data-act="tour"]').classList.contains('is-on'), cap: document.querySelector('.me-cap.is-on .me-cap-t')?.textContent }));
  ok(s1.kind === 'tour' && s1.on, 'tour did not start ' + JSON.stringify(s1));
  // trace the flight and make sure it never enters an obstacle
  await page.evaluate(() => { window.__trace = []; window.__ctx.onUpdate(() => { const p = window.__ctx.camera.position; if (window.__ui.nav.active) window.__trace.push([p.x, p.z]); }); });
  await simWait(page, 12);
  const b = await pose(page);
  const s2 = await page.evaluate(() => ({ cap: document.querySelector('.me-cap.is-on .me-cap-t')?.textContent, k: document.querySelector('.me-cap-k')?.textContent, i: window.__ui.nav.flight && window.__ui.nav.flight.i }));
  ok(Math.hypot(b.x - a.x, b.z - a.z) > 1.0, 'tour did not move the camera');
  // any touch stops the tour
  await tap(cdp, 300, 200); await frames(page, 2);
  const s3 = await page.evaluate(() => ({ active: window.__ui.nav.active, on: document.querySelector('[data-act="tour"]').classList.contains('is-on') }));
  ok(!s3.active && !s3.on, 'touch did not stop the tour ' + JSON.stringify(s3));
  const bad = await page.evaluate((R) => {
    const c = window.__ctx.colliders; let worst = 1e9;
    for (const [x, z] of window.__trace) {
      for (const k of c.circles) worst = Math.min(worst, Math.hypot(x - k.x, z - k.z) - k.r);
      for (const b of c.boxes) { const dx = x - b.cx, dz = z - b.cz; const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos; worst = Math.min(worst, Math.hypot(Math.max(0, Math.abs(lx) - b.hw), Math.max(0, Math.abs(lz) - b.hd))); }
    }
    return { worst, n: window.__trace.length };
  }, R);
  ok(bad.worst >= R - 0.03, 'tour path clearance ' + bad.worst.toFixed(3));
  return { stopAt: s2, clearance: +bad.worst.toFixed(3), samples: bad.n };
}));

await test('goto-sneakers', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  await sleep(1200);
  await clickSel(page, cdp, '[data-act="goto"]'); await sleep(500);
  const items = await page.evaluate(() => [...document.querySelectorAll('.me-go .t')].map(e => e.firstChild.textContent));
  // every department that has a stop is listed (the dev stand-ins register no accessories stop; the real fixtures module does)
  const want = await page.evaluate(() => ['clothes', 'shoes'].concat(window.__ctx.hotspots.list.some(h => h.id === 'accessories') ? ['accessories'] : [])
    .map(id => window.__ctx.brand.departments.find(d => d.id === id).name).concat([window.__ctx.layout.DEPARTMENTS.newIn.name]));
  ok(want.every(w => items.includes(w)) && items.includes('Checkout'), 'go-to departments ' + JSON.stringify(items));
  const i = await page.evaluate(() => { const b = [...document.querySelectorAll('.me-go')].find(b => /^Shoes/.test(b.querySelector('.t').textContent)); return b && b.getAttribute('data-i'); });
  await clickSel(page, cdp, `.me-go[data-i="${i}"]`);
  await page.evaluate(() => { window.__trace = []; window.__ctx.onUpdate(() => { const p = window.__ctx.camera.position; if (window.__ui.nav.active) window.__trace.push([p.x, p.z]); }); });
  const kind = await page.evaluate(() => window.__ui.nav.kind);
  await simWait(page, 11);
  const b = await pose(page);
  ok(kind === 'goto', 'goto not started');
  ok(Math.hypot(b.x - 0, b.z + 6.2) < 0.35, `arrived at ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
  ok(Math.abs(b.yaw) < 0.08, 'facing ' + b.yaw.toFixed(3));
  const plinthGap = await page.evaluate(() => Math.min(...window.__trace.map(([x, z]) => Math.hypot(x, z + 2))) - 1.5);
  ok(plinthGap >= 0.25, 'path grazed the plinth: ' + plinthGap.toFixed(3));
  return { items: items.length, end: [+b.x.toFixed(2), +b.z.toFixed(2)], plinthGap: +plinthGap.toFixed(2) };
}));

await test('desktop-keys-mouse-wheel', () => withPage({ W: 1440, H: 900 }, async ({ page, cdp }) => {
  await sleep(1200);
  await TP(page, [0, EYE, 8.4], [0, EYE, -4]);
  const a = await pose(page);
  await page.keyboard.down('KeyW'); const w1 = await simWait(page, 1.5); await page.keyboard.up('KeyW');
  await simWait(page, 0.6);
  const b = await pose(page);
  await page.keyboard.down('Shift'); await page.keyboard.down('KeyW'); const w2 = await simWait(page, 1.0); await page.keyboard.up('KeyW'); await page.keyboard.up('Shift');
  await simWait(page, 0.6);
  const c = await pose(page);
  ok(a.z - b.z > 1.2 && a.z - b.z < 2.4, 'W walk ' + (a.z - b.z).toFixed(2));
  ok((b.z - c.z) / w2 > (a.z - b.z) / w1 * 1.3, 'Shift is not faster');
  // arrows turn
  await page.keyboard.down('ArrowLeft'); await simWait(page, 0.5); await page.keyboard.up('ArrowLeft');
  const d = await pose(page); ok(d.yaw > c.yaw + 0.5, 'ArrowLeft turn ' + (d.yaw - c.yaw).toFixed(2));
  // mouse drag look
  const T = nowS();
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 450, button: 'left', buttons: 1, clickCount: 1, timestamp: T });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900 + i * 20, y: 450, button: 'left', buttons: 1, timestamp: T + i * 0.016 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1100, y: 450, button: 'left', buttons: 0, clickCount: 1, timestamp: T + 0.2 });
  await frames(page, 2);
  const e = await pose(page); ok(e.yaw > d.yaw + 0.2, 'mouse drag look ' + (e.yaw - d.yaw).toFixed(2));
  // wheel = small step
  await TP(page, [0, EYE, 8.4], [0, EYE, -4]);
  const f0 = await pose(page);
  await page.mouse.move(720, 450); await page.mouse.wheel(0, -100); await simWait(page, 0.8);
  const f1 = await pose(page);
  ok(f0.z - f1.z > 0.2 && f0.z - f1.z < 0.6, 'wheel step ' + (f0.z - f1.z).toFixed(2));
  // click → side card on the right
  await TP(page, [1.3, EYE, 1.3], [0.1, 1.1, -2.3]);
  const [x, y] = await project(page, [0.1, 1.2, -2.5]);
  await mouseTap(cdp, x, y); await frames(page, 2); await sleep(700);
  const card = await page.evaluate(() => { const r = document.querySelector('.me-card').getBoundingClientRect(); return { open: document.querySelector('.me-card').classList.contains('is-open'), left: r.left, right: r.right, w: r.width, barVisible: getComputedStyle(document.querySelector('.me-bar')).opacity }; });
  ok(card.open && card.left > 900 && card.right <= 1440, 'desktop side card ' + JSON.stringify(card));
  // Escape closes
  await page.keyboard.press('Escape'); await sleep(300);
  const closed = await page.evaluate(() => !document.querySelector('.me-card').classList.contains('is-open'));
  ok(closed, 'Escape did not close the card');
  return { walk: +(a.z - b.z).toFixed(2), run: +((b.z - c.z) / w2).toFixed(2), wheel: +(f0.z - f1.z).toFixed(2), card: { left: Math.round(card.left), w: Math.round(card.w) } };
}));

const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375], [768, 1024], [1024, 768], [1440, 900]];
await test('layout-sizes', async () => {
  const out = {};
  for (const [W, H] of SIZES) {
    await withPage({ W, H }, async ({ page, cdp }) => {
      await sleep(1300);
      const mobile = W < 900;
      const check = () => page.evaluate(() => {
        const W = innerWidth, H = innerHeight, bad = [];
        if (document.documentElement.scrollWidth > W || document.body.scrollWidth > W) bad.push('hscroll');
        for (const e of document.querySelectorAll('#me-ui .me-brand, #me-ui .me-bagbtn, #me-ui .me-bar, #me-ui .me-card.is-open, #me-ui .me-sheet.is-open, #me-ui .me-chip.is-on, #me-ui .me-annchip.is-on span')) {
          const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
          const r = e.getBoundingClientRect();
          if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push(e.className.split(' ')[0] + ' off-screen ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        }
        for (const b of document.querySelectorAll('#me-ui button, #me-ui input, #me-ui a')) {
          const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
          if (!r.width || cs.visibility === 'hidden' || b.closest('[aria-hidden="true"]')) continue;
          const sc = b.closest('.me-scroll, .me-card-bd'); if (sc) { const q = sc.getBoundingClientRect(); if (r.bottom <= q.top || r.top >= q.bottom) continue; }
          if (r.width < 43.5 || r.height < 43.5) bad.push(`small ${b.className || b.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        for (const p of document.querySelectorAll('#me-ui .me-card.is-open, #me-ui .me-sheet.is-open')) {
          const pr = p.getBoundingClientRect();
          for (const t of p.querySelectorAll('button, a, .me-title, .me-price, .me-bl-p, .me-hours td')) { const r = t.getBoundingClientRect(); if (r.width && (r.right > pr.right + 1 || r.left < pr.left - 1)) bad.push('x-overflow ' + (t.className || t.tagName) + ':' + t.textContent.trim().slice(0, 14)); }
        }
        for (const t of document.querySelectorAll('#me-ui .lbl, #me-ui .me-word, #me-ui .me-hint, #me-ui .me-cta span, #me-ui .me-title, #me-ui .me-go .t, #me-ui .me-mi .t')) {
          const r = t.getBoundingClientRect(); if (!r.width) continue;
          if (t.scrollWidth > t.clientWidth + 1) bad.push('clipped ' + t.className + ':' + t.textContent.slice(0, 16));
        }
        // centre of the view stays clear (nothing but the card/sheets may cover it)
        const el = document.elementFromPoint(W / 2, H * 0.45); if (el && el.closest('#me-ui') && !el.closest('.me-card, .me-sheet, .me-scrim')) bad.push('centre blocked by ' + el.className);
        return bad;
      });
      // wait until the HUD and any open panel stop moving (CSS slides run late when frames are slow)
      const settle = async () => { let last = '', same = 0; const t0 = Date.now();
        while (Date.now() - t0 < 9000) {
          const k = await page.evaluate(() => { const r = (e) => e ? [...Object.values(e.getBoundingClientRect().toJSON())].map(Math.round).join() : '';
            const bar = document.querySelector('.me-bar'), o = +getComputedStyle(bar).opacity;
            return [r(document.querySelector('.me-top')), r(bar), r(document.querySelector('.me-card.is-open, .me-sheet.is-open')), o > 0.02 && o < 0.98 ? Math.random() : o, document.getElementById('me-ui').className].join('|'); });
          if (k === last) { if (++same >= 2) return; } else same = 0;
          last = k; await sleep(150); await frames(page, 2);
        } };
      const check0 = check; const checkS = async () => { await settle(); return check0(); };
      const b1 = await checkS();
      await TP(page, [0, EYE, -7.4], [0, 1.5, -10.6]);
      const [x, y] = await project(page, [0, 1.5, -10.45]);
      if (mobile) await tap(cdp, x, y); else await mouseTap(cdp, x, y);
      await frames(page, 2); await sleep(700);
      const b2 = await checkS();
      const cardOpen = await page.evaluate(() => document.querySelector('.me-card').classList.contains('is-open'));
      await page.keyboard.press('Escape'); await sleep(200);
      await clickSel(page, cdp, '[data-act="goto"]', mobile); await sleep(600);
      const b3 = await checkS();
      await page.keyboard.press('Escape'); await sleep(200);
      await clickSel(page, cdp, '[data-act="info"]', mobile); await sleep(600);
      const b4 = await checkS();
      await page.evaluate(() => window.__ctx.ui.showInfo('visit')); await sleep(500);
      const b5 = await checkS();
      await page.keyboard.press('Escape'); await sleep(200);
      await page.evaluate(() => { const c = window.__ctx.catalog; for (const p of c.products.filter(p => p.inStock).slice(0, 3)) window.__ctx.ui.addToBag({ productId: p.id, sizeId: (p.sizes.find(z => z.inStock) || {}).id, qty: 1 }); window.__ctx.ui.openBag(); });
      await sleep(900);
      const b6 = await checkS();
      out[`${W}x${H}`] = { start: b1, card: cardOpen ? b2 : ['card did not open'], goto: b3, info: b4, visit: b5, bag: b6 };
    });
  }
  const fails = Object.entries(out).filter(([, v]) => Object.values(v).some(a => a.length));
  ok(!fails.length, JSON.stringify(Object.fromEntries(fails)));
  return Object.keys(out);
});

await test('rotate-keeps-pose', () => withPage({ W: 390, H: 844 }, async ({ page }) => {
  await sleep(1200);
  await TP(page, [-1, EYE, 3], [-3, 1.2, 0]);
  const a = await pose(page);
  await page.setViewportSize({ width: 844, height: 390 }); await frames(page, 3); await sleep(300);
  const b = await pose(page);
  const lay = await page.evaluate(() => ({ h: document.documentElement.scrollWidth > innerWidth, bar: document.querySelector('.me-bar').getBoundingClientRect().bottom <= innerHeight, fov: window.__ctx.camera.fov }));
  await page.setViewportSize({ width: 390, height: 844 }); await frames(page, 3);
  const c = await pose(page);
  ok(Math.abs(a.yaw - b.yaw) < 1e-3 && Math.hypot(a.x - c.x, a.z - c.z) < 0.02, 'pose changed on rotation');
  ok(!lay.h && lay.bar, 'landscape layout ' + JSON.stringify(lay));
  return { fovLandscape: lay.fov };
}));

await test('reduced-motion-no-bob', () => withPage({ W: 390, H: 844, reducedMotion: true }, async ({ page }) => {
  await sleep(1200);
  await TP(page, [0, EYE, 8.4], [0, EYE, -4]);
  await page.keyboard.down('KeyW');
  const ys = [];
  for (let i = 0; i < 8; i++) { await simWait(page, 0.12); ys.push((await pose(page)).y); }
  await page.keyboard.up('KeyW');
  const spread = Math.max(...ys) - Math.min(...ys);
  ok(spread < 1e-3, 'head bob with reduced motion: ' + spread);
  return { spread };
}));

await test('head-bob-subtle', () => withPage({ W: 390, H: 844 }, async ({ page }) => {
  await sleep(1200);
  await TP(page, [0, EYE, 8.4], [0, EYE, -4]);
  await page.keyboard.down('KeyW'); await simWait(page, 0.8);
  const ys = [];
  for (let i = 0; i < 14; i++) { await simWait(page, 0.07); ys.push((await pose(page)).y); }
  await page.keyboard.up('KeyW');
  const spread = Math.max(...ys) - Math.min(...ys);
  ok(spread > 0.004 && spread < 0.03, 'bob amplitude ' + spread.toFixed(4));
  return { spread: +spread.toFixed(4) };
}));

await test('shot-mode-respected', () => withPage({ W: 390, H: 844, query: 'shot=1' }, async ({ page, cdp }) => {
  await sleep(800);
  const a = await pose(page);
  await drag(cdp, [320, 300], [120, 300], 10);
  await page.keyboard.down('KeyW'); await simWait(page, 0.8); await page.keyboard.up('KeyW');
  const b = await pose(page);
  ok(Math.abs(a.yaw - b.yaw) < 1e-6 && Math.abs(a.z - b.z) < 1e-6, 'camera moved in shot mode');
  return null;
}));

await test('hint-remembered', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const url = `http://127.0.0.1:${port}${args.src === 'dist' ? '/dist/index.html' : '/src/dev.html'}?${MODULES ? 'modules=' + MODULES + '&' : ''}tier=mid`;
  await page.goto(url); await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: 120000 });
  await sleep(1800);
  const first = await page.evaluate(() => !!document.querySelector('.me-hint.is-on'));
  await page.keyboard.press('KeyW');
  await page.reload(); await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: 120000 });
  await sleep(1800);
  const second = await page.evaluate(() => !!document.querySelector('.me-hint.is-on'));
  await context.close();
  ok(first && !second, `hint first=${first} second=${second}`);
  return null;
});

await test('real-product-card', () => withPage({ W: 390, H: 844 }, async ({ page, cdp }) => {
  // For full-scene runs: frame a real catalogue interactable from whatever the modules registered, tap it,
  // and check the card (photo, price, sizes) + Add to bag → stored line + badge.
  await sleep(1500);
  const found = await page.evaluate((EYE) => {
    const c = window.__ctx, T = c.THREE, cam = c.camera, rc = new T.Raycaster(), m = new T.Matrix4(), out = [];
    for (const o of c.interact.items) {
      const targets = [];
      if (o.isInstancedMesh) { for (const k of [Math.floor(o.count / 2), 0]) { o.getMatrixAt(k, m); targets.push(new T.Vector3().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld)); } }
      else { const b = new T.Box3().setFromObject(o); if (b.isEmpty()) continue; if (b.getSize(new T.Vector3()).length() > 4) continue; targets.push(b.getCenter(new T.Vector3())); }
      for (const t of targets) {
        const d = new T.Vector3(-t.x * 0.3, 0, -t.z * 0.3 + 0.0001); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
        const p = t.clone().addScaledVector(d, 1.7); p.y = EYE; c.colliders.resolve(p);
        cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld(); rc.setFromCamera(new T.Vector2(0, 0), cam);
        const h = rc.intersectObjects(c.interact.items, true)[0]; if (!h) continue;
        const r = c.interact.infoFor(h); const i = r && r.info;
        if (!i || !i.productId || i.buyable === false || !i.image || !(i.sizeOptions || []).some(z => z.inStock)) continue;
        out.push({ p: p.toArray(), t: t.toArray(), id: i.productId });
        if (out.length > 3) return out;
      }
    }
    return out;
  }, EYE);
  ok(found.length, 'no catalogue product with a photo + sizes found in the scene');
  await TP(page, found[0].p, found[0].t);
  const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
  await tap(cdp, W / 2, H / 2); await frames(page, 2); await sleep(900);
  const c = await page.evaluate(() => { const i = window.__ui.hud.cardInfo; return i && { id: i.productId, title: document.querySelector('#me-card-title')?.textContent, price: document.querySelector('.me-price span')?.textContent, img: !!document.querySelector('.me-card .me-ph img'),
    sizes: document.querySelectorAll('.me-szb').length, want: window.__ctx.catalog.get(i.productId) && window.__ctx.catalog.get(i.productId).name }; });
  ok(c && c.title === c.want && /^R /.test(c.price) && c.img && c.sizes > 0, 'real card: ' + JSON.stringify(c));
  const si = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out')));
  if (si >= 0) await clickSel(page, cdp, `.me-szb[data-i="${si}"]`);
  await clickSel(page, cdp, '.me-card [data-act="add"]'); await sleep(1500);
  const b = await bagState(page);
  ok(b.n === '1' && b.stored.lines[0].productId === c.id, 'real add: ' + JSON.stringify(b));
  return { product: c.title, price: c.price };
}));

const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 1));
await browser.close(); server.close();
process.exit(failed.length ? 1 : 0);
