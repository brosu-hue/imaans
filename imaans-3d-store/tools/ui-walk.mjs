#!/usr/bin/env node
// A first-time shopper's walk through the FULL store with real touch input (CDP), one page per size:
// loader → start (hint) → joystick → shoe / garment / look / accessory cards → size + colour → add to bag →
// bag + WhatsApp → Info menu + every page → Go to → Tour → Credits. Screenshots + a layout check per step.
//
//   node tools/ui-walk.mjs --out shots/final-polish-ui [--sizes 390x844,375x667:low,844x390,1440x900]
//        [--steps start,joy,shoe,garment,look,accessory,bag,info,pages,goto,tour,credits] [--dpr 1] [--src dist]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launch, openStore, sleep } from './ui-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const outRoot = path.resolve(ROOT, args.out || 'shots/final-polish-ui');
const sizes = String(args.sizes || '390x844,375x667:low,844x390,1440x900').split(',').map(s => { const [wh, tier] = s.split(':'); const [W, H] = wh.split('x').map(Number); return { W, H, tier: tier || args.tier || 'mid' }; });
const STEPS = new Set(String(args.steps || 'start,joy,shoe,garment,look,accessory,bag,info,pages,goto,tour,credits').split(','));
const EYE = 1.62;
const { server, port } = await startServer();
const browser = await launch();
const report = [];

const frames = (page, n = 2) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const TP = (page, p, t) => page.evaluate(([p, t]) => { const c = window.__ctx.camera; c.position.set(...p); c.lookAt(...t); window.__ui.controls.resync(); }, [p, t]).then(() => frames(page, 3));
async function stableBox(page, sel, maxMs = 8000) {
  const t0 = Date.now(); let last = null;
  for (;;) {
    const b = await page.locator(sel).first().boundingBox({ timeout: 5000 }).catch(() => null);
    if (b && last && Math.abs(b.x - last.x) < 0.5 && Math.abs(b.y - last.y) < 0.5) return b;
    if (Date.now() - t0 > maxMs) return b;
    last = b; await sleep(120); await frames(page, 2);
  }
}
const T = () => Date.now() / 1000;
async function tapAt(cdp, mobile, x, y) {
  const t = T();
  if (mobile) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: t }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + 0.06 }); return; }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: t - 0.05 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, timestamp: t });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, timestamp: t + 0.07 });
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
    for (const b of document.querySelectorAll('#me-ui button, #me-ui a, #me-ui input')) {
      const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
      if (!r.width || cs.visibility === 'hidden' || b.closest('[aria-hidden="true"]')) continue;
      const sc = b.closest('.me-scroll, .me-card-bd'); if (sc) { const q = sc.getBoundingClientRect(); if (r.bottom <= q.top || r.top >= q.bottom) continue; }
      if (r.width < 43.5 || r.height < 43.5) bad.push(`small ${b.className || b.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const panel = document.querySelector('#me-ui .me-card.is-open, #me-ui .me-sheet.is-open');
    if (panel) {
      const pr = panel.getBoundingClientRect();
      for (const t of panel.querySelectorAll('button, a, .me-title, .me-price')) { const r = t.getBoundingClientRect(); if (r.width && (r.right > pr.right + 1 || r.left < pr.left - 1)) bad.push('x-overflow ' + (t.className || t.tagName) + ':' + t.textContent.trim().slice(0, 18)); }
      for (const t of panel.querySelectorAll('.me-cta span, .me-go .t, .me-mi .t, .me-lk span')) if (t.scrollWidth > t.clientWidth + 1) bad.push('clipped ' + t.className + ':' + t.textContent.trim().slice(0, 18));
      bad.push(`(panel covers ${Math.round(100 * (pr.width * pr.height) / (W * H))}% of the screen)`);
    }
    return bad;
  });
}
/** frame a real product whose card matches `want` (shoes | clothes | accessories | look) */
async function findProduct(page, want, skip = 0) {
  return page.evaluate(([EYE, want, skip]) => {
    const c = window.__ctx, Th = c.THREE, cam = c.camera, rc = new Th.Raycaster(), m = new Th.Matrix4(), out = [];
    const save = [cam.position.clone(), cam.quaternion.clone()];
    for (const o of c.interact.items) {
      const targets = [];
      if (o.isInstancedMesh) { for (const k of [Math.floor(o.count / 2), 0]) { o.getMatrixAt(k, m); targets.push(new Th.Vector3().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld)); } }
      else { const b = new Th.Box3().setFromObject(o); if (b.isEmpty() || b.getSize(new Th.Vector3()).length() > (want === 'look' ? 9 : 4)) continue; const cc = b.getCenter(new Th.Vector3()); targets.push(cc); if (want === 'look') targets.push(cc.clone().setY(1.25)); }
      for (const t of targets) {
        const d = new Th.Vector3(-t.x * 0.3, 0, -t.z * 0.3 + 0.0001); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
        const p = t.clone().addScaledVector(d, want === 'look' ? 2.4 : 1.6); p.y = EYE; c.colliders.resolve(p);
        cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld(); rc.setFromCamera(new Th.Vector2(0, 0), cam);
        const h = rc.intersectObjects(c.interact.items, true)[0]; if (!h) continue;
        const r = c.interact.infoFor(h), i = r && r.info; if (!i) continue;
        if (want === 'look') { if (!Array.isArray(i.lookItems) || !i.lookItems.length) continue; }
        else if (i.category !== want || !i.productId || i.buyable === false || !(i.sizeOptions || []).some(z => z.inStock)) continue;
        out.push({ p: p.toArray(), t: t.toArray(), title: i.title, cw: (i.colorways || []).length, sz: (i.sizeOptions || []).length });
      }
    }
    cam.position.copy(save[0]); cam.quaternion.copy(save[1]);
    out.sort((a, b) => (b.cw + b.sz * 0.5) - (a.cw + a.sz * 0.5));
    return out[Math.min(out.length - 1, skip)] || null;
  }, [EYE, want, skip]);
}

for (const { W, H, tier } of sizes) {
  const tag = `${W}x${H}${tier !== 'mid' ? '-' + tier : ''}`, mobile = W < 900;
  const out = path.join(outRoot, tag); fs.mkdirSync(out, { recursive: true });
  let n = 0; const rows = [];
  const t0 = Date.now();
  const shot = async (page, name, extra = '') => {
    const f = path.join(out, `${String(n++).padStart(2, '0')}-${name}.png`);
    await frames(page, 2);
    await page.screenshot({ path: f, timeout: 180000 });
    const bad = await layoutCheck(page).catch(e => ['check: ' + e.message]);
    rows.push({ step: name, file: path.relative(ROOT, f), note: [extra, ...bad].filter(Boolean).join('; ') });
    process.stderr.write(`${tag} ${name} ${extra} ${bad.join('; ')}\n`);
  };
  let s;
  try {
    s = await openStore(browser, port, { W, H, dpr: Number(args.dpr || 1), tier, src: args.src, timeout: 400000,
      beforeReady: async (page) => { await page.waitForSelector('.me-loader', { timeout: 90000 }); await sleep(1500); const f = path.join(out, `${String(n++).padStart(2, '0')}-loader.png`); await page.screenshot({ path: f, timeout: 180000 }); rows.push({ step: 'loader', file: path.relative(ROOT, f), note: await page.evaluate(() => document.querySelector('.me-loader')?.innerText.replace(/\s+/g, ' ')) }); } });
  } catch (e) { report.push({ tag, error: 'open: ' + e.message.split('\n')[0] }); continue; }
  const { context, page, logs } = s;
  const cdp = await context.newCDPSession(page);
  const step = async (name, fn) => { if (!STEPS.has(name)) return; try { await fn(); } catch (e) { rows.push({ step: name, error: e.message.split('\n')[0] }); process.stderr.write(`${tag} ${name} ERROR ${e.message.split('\n')[0]}\n`); await page.keyboard.press('Escape').catch(() => {}); } };
  try {
    await step('start', async () => { await sleep(2600); await shot(page, 'start', `ready ${(s.readyMs / 1000).toFixed(1)}s`); });
    await step('joy', async () => {
      if (!mobile) { await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW'); await shot(page, 'walked-keys'); return; }
      const x = Math.round(W * 0.22), y = Math.round(H * (W > H ? 0.72 : 0.8)); let t = T();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: t });
      for (let i = 1; i <= 8; i++) { t += 0.03; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 6, id: 1 }], timestamp: t }); }
      await sleep(900); await shot(page, 'joystick-held');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: T() });
      await sleep(400);
    });
    const card = async (want, name, pick = 0) => {
      const f = await findProduct(page, want, pick); if (!f) throw new Error('no ' + want + ' in view');
      await TP(page, f.p, f.t); await tapAt(cdp, mobile, W / 2, H / 2); await frames(page, 2); await sleep(1100);
      const open = await page.evaluate(() => document.querySelector('.me-card').classList.contains('is-open'));
      if (!open) throw new Error('card did not open for ' + f.title);
      await shot(page, name, f.title);
      return f;
    };
    await step('shoe', async () => {
      const f = await card('shoes', 'card-shoe');
      if (f.cw > 1) { await click(page, cdp, mobile, '.me-swb[data-i="1"]'); await sleep(500); }
      const i = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out') && !b.classList.contains('is-on')));
      if (i >= 0) { await click(page, cdp, mobile, `.me-szb[data-i="${i}"]`); await sleep(250); }
      await shot(page, 'card-shoe-chosen');
      await click(page, cdp, mobile, '.me-card [data-act="add"]'); await sleep(1700);
      await shot(page, 'added-to-bag', 'badge ' + await page.evaluate(() => document.querySelector('.me-badge').textContent));
      await page.keyboard.press('Escape'); await sleep(400);
    });
    await step('garment', async () => { await card('clothes', 'card-garment'); await page.keyboard.press('Escape'); await sleep(400); });
    await step('look', async () => { await card('look', 'card-look'); await page.keyboard.press('Escape'); await sleep(400); });
    await step('accessory', async () => { await card('accessories', 'card-accessory'); await page.keyboard.press('Escape'); await sleep(400); });
    await step('bag', async () => {
      await page.evaluate(() => window.__ui.hud.hideCard()); await sleep(300);
      await click(page, cdp, mobile, '.me-bagbtn'); await sleep(1000);
      const wa = await page.evaluate(() => { const a = document.querySelector('.me-wa'); return a ? decodeURIComponent(a.href).slice(0, 160) : 'no link'; });
      await shot(page, 'bag', wa);
      // tap outside (scrim) closes
      await tapAt(cdp, mobile, W / 2, 30); await sleep(700);
      const closed = await page.evaluate(() => !window.__ui.hud.sheetOpen);
      rows.push({ step: 'bag-tap-outside', note: closed ? 'closed' : 'STILL OPEN' });
    });
    await step('info', async () => { await click(page, cdp, mobile, '[data-act="info"]'); await sleep(1000); await shot(page, 'info-menu'); });
    await step('pages', async () => {
      for (const slug of ['about', 'size-guide', 'shipping-delivery', 'returns', 'faq', 'visit']) {
        const sel = `.me-mi[data-slug="${slug}"]`;
        if (!(await page.evaluate(() => window.__ui.hud.sheetOpen === 'info'))) { await click(page, cdp, mobile, '[data-act="info"]'); await sleep(800); }
        if (await page.locator(sel).count()) { await click(page, cdp, mobile, sel); } else await page.evaluate((s) => window.__ctx.ui.showInfo(s), slug);
        await sleep(900);
        if (slug === 'faq') { await click(page, cdp, mobile, '.me-q'); await sleep(400); }
        await shot(page, 'page-' + slug);
        await click(page, cdp, mobile, '[data-act="info-back"]'); await sleep(600);
      }
      await page.keyboard.press('Escape'); await sleep(400);
    });
    await step('goto', async () => {
      await page.evaluate(() => { window.__ui.hud.closeSheets(); window.__ui.hud.hideCard(); }); await sleep(600);
      await TP(page, [0, EYE, 8.4], [0, 1.45, -4]);
      await click(page, cdp, mobile, '[data-act="goto"]'); await sleep(1000); await shot(page, 'goto');
      await click(page, cdp, mobile, '.me-go[data-i]'); await sleep(1500); await shot(page, 'goto-flying');
      await page.waitForFunction(() => !window.__ui.nav.active, null, { timeout: 60000 }).catch(() => {});
      await sleep(500); await shot(page, 'goto-arrived');
    });
    await step('tour', async () => {
      await click(page, cdp, mobile, '[data-act="tour"]'); await sleep(2500); await shot(page, 'tour');
      await click(page, cdp, mobile, '[data-act="tour"]'); await sleep(500);
    });
    await step('credits', async () => {
      await page.evaluate(() => window.__ctx.ui.showInfo('credits')); await sleep(1500); await shot(page, 'credits');
      await page.evaluate(() => window.__ctx.ui.showInfo('help')); await sleep(900); await shot(page, 'page-help');
      await page.keyboard.press('Escape');
    });
  } finally {
    const errs = logs.filter(l => !/KHR_parallel_shader_compile|GPU stall|GL_CLOSE_PATH_NV/.test(l));
    report.push({ tag, readyMs: s.readyMs, secs: Math.round((Date.now() - t0) / 1000), rows, logs: errs });
    await context.close();
  }
}
fs.writeFileSync(path.join(outRoot, 'walk.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close(); server.close();
