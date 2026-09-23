#!/usr/bin/env node
// IMAANS UI screenshots: product card (photo, sizes, colours), sale card, look card, bag (+ WhatsApp link),
// Info menu + pages, Go to, loader — at several sizes, with the same layout checks as ui-shots.mjs.
//
//   node tools/ui-imaans-shots.mjs --out shots/ui/im2 [--modules ui,_uitest] [--sizes 390x844,375x667,844x390,1440x900]
//        [--states loader,start,product,sale,look,bag,info,visit,faq,size,goto,empty] [--tier mid] [--dpr 1] [--src dist] [--prefix x-]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launch, openStore, sleep } from './ui-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const out = path.resolve(ROOT, args.out || 'shots/ui/tmp');
fs.mkdirSync(out, { recursive: true });
const sizes = String(args.sizes || '390x844').split(',').map(s => s.split('x').map(Number));
const states = String(args.states || 'start,product,sale,look,bag,info,visit,faq,size,goto').split(',');
const modules = args.src === 'dist' ? (args.modules || '') : String(args.modules || 'ui,_uitest');
const prefix = args.prefix || '';
const { server, port } = await startServer();
const browser = await launch();
const report = [];
const EYE = 1.62;

const frames = (page, n = 2) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const TP = (page, p, t) => page.evaluate(([p, t]) => { const c = window.__ctx.camera; c.position.set(...p); c.lookAt(...t); window.__ui.controls.resync(); window.__ui.hud.dismissHint(); }, [p, t]).then(() => frames(page, 3));
const project = (page, p) => page.evaluate((p) => { const c = window.__ctx; c.camera.updateMatrixWorld(); const v = new c.THREE.Vector3(...p).project(c.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, p);
async function stableBox(page, sel, maxMs = 8000) {
  const t0 = Date.now(); let last = null;
  for (;;) {
    const b = await page.locator(sel).first().boundingBox({ timeout: 5000 }).catch(() => null);
    if (b && last && Math.abs(b.x - last.x) < 0.5 && Math.abs(b.y - last.y) < 0.5) return b;
    if (Date.now() - t0 > maxMs) return b;
    last = b; await new Promise(r => setTimeout(r, 120)); await frames(page, 2);
  }
}
async function tapAt(cdp, mobile, x, y) {
  const T = Date.now() / 1000;
  if (mobile) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: T }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: T + 0.06 }); return; }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: T - 0.05 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, timestamp: T });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, timestamp: T + 0.07 });
}
async function click(page, cdp, mobile, sel) { const b = await stableBox(page, sel); if (!b) throw new Error('no ' + sel); await tapAt(cdp, mobile, b.x + b.width / 2, b.y + b.height / 2); await frames(page, 2); }
async function layoutCheck(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = [];
    if (document.documentElement.scrollWidth > W || document.body.scrollWidth > W) bad.push('hscroll');
    for (const e of document.querySelectorAll('#me-ui .me-brand, #me-ui .me-bagbtn, #me-ui .me-bar, #me-ui .me-card.is-open, #me-ui .me-sheet.is-open, #me-ui .me-chip.is-on, #me-ui .me-toast, #me-ui .me-annchip.is-on span')) {
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = e.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push(`${e.className.split(' ')[0]} off-screen ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
    }
    const panel = document.querySelector('#me-ui .me-card.is-open, #me-ui .me-sheet.is-open');
    if (panel) {
      const pr = panel.getBoundingClientRect();
      for (const t of panel.querySelectorAll('button, a, .me-title, .me-price, .me-lk, .v')) {
        const r = t.getBoundingClientRect(); if (!r.width) continue;
        const sc = t.closest('.me-scroll, .me-card-bd'); const cr = sc ? sc.getBoundingClientRect() : pr;
        if (r.right > pr.right + 1 || r.left < pr.left - 1) bad.push('x-overflow ' + (t.className || t.tagName) + ':' + t.textContent.trim().slice(0, 18));
        if ((t.tagName === 'BUTTON' || t.tagName === 'A') && r.bottom > cr.top && r.top < cr.bottom && (r.width < 43.5 || r.height < 43.5)) bad.push(`small ${t.className || t.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (t.scrollWidth > t.clientWidth + 1 && /me-cta|me-lk|me-go|me-mi/.test(t.className)) bad.push('clipped ' + t.className + ':' + t.textContent.trim().slice(0, 18));
      }
    }
    return bad;
  });
}
/** Frame the _uitest plinth instance i (0 sale, 1 legacy, 2 look) or the knit stack, then tap it. */
async function openCard(page, cdp, mobile, which) {
  if (which === 'knit') { await TP(page, [-1.3, EYE, 6.4], [-2.4, 0.9, 4.8]); const [x, y] = await project(page, [-2.4, 0.92, 4.8]); await tapAt(cdp, mobile, x, y); }
  else {
    await TP(page, [0.1, EYE, 1.6], [0.1, 1.1, -2]);
    const at = [[-0.7, 1.2, -1.7], [0.1, 1.2, -2.5], [0.8, 1.2, -1.6]][which];
    const [x, y] = await project(page, at); await tapAt(cdp, mobile, x, y);
  }
  await frames(page, 2); await sleep(900);
}

for (const [W, H] of sizes) {
  const tag = `${W}x${H}`, mobile = W < 900;
  for (const state of states) {
    const ldFile = path.join(out, `${prefix}loader-${tag}.png`);
    const beforeReady = state === 'loader' ? async (page) => { await page.waitForSelector('.me-loader', { timeout: 60000 }); await sleep(Number(args.ldwait || 600)); await page.screenshot({ path: ldFile, timeout: 180000 }); } : null;
    let s;
    try { s = await openStore(browser, port, { W, H, dpr: Number(args.dpr || 1), modules, tier: args.tier || 'mid', src: args.src, query: args.query, beforeReady }); }
    catch (e) { report.push({ state, size: tag, error: 'open: ' + e.message.split('\n')[0] }); continue; }
    const { context, page, logs } = s;
    if (state === 'loader') { report.push({ state, size: tag, file: path.relative(ROOT, ldFile), logs }); await context.close(); process.stderr.write(`${tag} loader\n`); continue; }
    const cdp = await context.newCDPSession(page);
    let note = '';
    try {
      await sleep(state === 'start' ? 2400 : 1300);
      if (state !== 'start') await page.evaluate(() => window.__ui.hud.dismissHint());
      if (state === 'product' || state === 'bag') {
        await openCard(page, cdp, mobile, 'knit');
        await click(page, cdp, mobile, '.me-swb[data-i="1"]'); await sleep(300);
        const i = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out')));
        if (i >= 0) { await click(page, cdp, mobile, `.me-szb[data-i="${i}"]`); await sleep(200); }
        if (state === 'bag') {
          await click(page, cdp, mobile, '.me-card [data-act="add"]'); await sleep(1500);
          await page.evaluate(() => { const b = window.__ctx.catalog.products.filter(p => p.inStock && p.image && /svg$/.test(p.image))[0]; window.__ctx.ui.addToBag({ productId: b.id, sizeId: (b.sizes.find(z => z.inStock) || {}).id, qty: 2 }); });
          await sleep(1400);
          await click(page, cdp, mobile, '.me-bagbtn'); await sleep(900);
        }
      } else if (state === 'real' || state === 'realbag') {
        // full scene: frame a real catalogue product (photo + sizes) registered by the builder modules and tap it
        const found = await page.evaluate(([EYE, pick]) => {
          const c = window.__ctx, T = c.THREE, cam = c.camera, rc = new T.Raycaster(), m = new T.Matrix4(), out = [];
          for (const o of c.interact.items) {
            const targets = [];
            if (o.isInstancedMesh) { for (const k of [Math.floor(o.count / 2), 0]) { o.getMatrixAt(k, m); targets.push(new T.Vector3().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld)); } }
            else { const b = new T.Box3().setFromObject(o); if (b.isEmpty() || b.getSize(new T.Vector3()).length() > 4) continue; targets.push(b.getCenter(new T.Vector3())); }
            for (const t of targets) {
              const d = new T.Vector3(-t.x * 0.3, 0, -t.z * 0.3 + 0.0001); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
              const p = t.clone().addScaledVector(d, 1.6); p.y = EYE; c.colliders.resolve(p);
              cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld(); rc.setFromCamera(new T.Vector2(0, 0), cam);
              const h = rc.intersectObjects(c.interact.items, true)[0]; if (!h) continue;
              const r = c.interact.infoFor(h), i = r && r.info;
              if (!i || !i.productId || i.buyable === false || !i.image || !(i.sizeOptions || []).some(z => z.inStock)) continue;
              out.push({ p: p.toArray(), t: t.toArray(), title: i.title, cw: (i.colorways || []).length });
            }
          }
          out.sort((a, b) => b.cw - a.cw);
          return out[Math.min(out.length - 1, pick)] || null;
        }, [EYE, Number(args.pick || 0)]);
        if (!found) throw new Error('no real product in the scene');
        note = found.title;
        await TP(page, found.p, found.t);
        await tapAt(cdp, mobile, W / 2, H / 2); await frames(page, 2); await sleep(900);
        if (found.cw > 1) { await click(page, cdp, mobile, '.me-swb[data-i="1"]'); await frames(page, 3); await sleep(400); }
        const i = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out')));
        if (i >= 0) { await click(page, cdp, mobile, `.me-szb[data-i="${i}"]`); await sleep(200); }
        if (state === 'realbag') { await click(page, cdp, mobile, '.me-card [data-act="add"]'); await sleep(1500); await click(page, cdp, mobile, '.me-bagbtn'); await sleep(900); }
      } else if (state === 'sale') await openCard(page, cdp, mobile, 0);
      else if (state === 'look') await openCard(page, cdp, mobile, 2);
      else if (state === 'legacy') await openCard(page, cdp, mobile, 1);
      else if (state === 'info') { await click(page, cdp, mobile, '[data-act="info"]'); await sleep(900); }
      else if (state === 'visit' || state === 'faq' || state === 'size' || state === 'about' || state === 'shipping') {
        const slug = { visit: 'visit', faq: 'faq', size: 'size-guide', about: 'about', shipping: 'shipping-delivery' }[state];
        await page.evaluate((s) => window.__ctx.ui.showInfo(s), slug); await sleep(900);
        if (state === 'faq') { await click(page, cdp, mobile, '.me-q'); await sleep(300); }
      } else if (state === 'goto') { await click(page, cdp, mobile, '[data-act="goto"]'); await sleep(900); }
      else if (state === 'empty') { await click(page, cdp, mobile, '.me-bagbtn'); await sleep(900); }
      await frames(page, 2);
      const f = path.join(out, `${prefix}${state}-${tag}.png`);
      await page.screenshot({ path: f, timeout: 180000 });
      const bad = await layoutCheck(page);
      note = [note, ...bad].filter(Boolean).join('; ');
      report.push({ state, size: tag, file: path.relative(ROOT, f), layout: bad, logs: logs.filter(l => !/KHR_parallel_shader_compile/.test(l)) });
    } catch (e) { report.push({ state, size: tag, error: e.message.split('\n')[0], logs }); note = 'ERROR ' + e.message.split('\n')[0]; }
    await context.close();
    process.stderr.write(`${tag} ${state} ${note}\n`);
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close(); server.close();
