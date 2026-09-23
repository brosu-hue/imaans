#!/usr/bin/env node
// UI state screenshots (loader-free start view, product card, go-to, about, bag, tour, joystick) at
// several viewport sizes — plus layout checks (no horizontal scroll, HUD fully on-screen).
//
//   node tools/ui-shots.mjs --out shots/ui/it2 [--modules architecture,ui,_uitest] [--sizes 390x844,375x667,844x390,1440x900]
//        [--states start,card,swatch,goto,info,bag,tour,joy] [--dpr 1] [--tier mid] [--src dist]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launch, openStore, sleep } from './ui-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const out = path.resolve(ROOT, args.out || 'shots/ui/tmp');
fs.mkdirSync(out, { recursive: true });
const sizes = String(args.sizes || '390x844').split(',').map(s => s.split('x').map(Number));
const states = String(args.states || 'start,card,swatch,goto,info,bag,tour,joy').split(',');
const modules = args.src === 'dist' ? (args.modules || '') : String(args.modules || 'architecture,ui,_uitest');
const { server, port } = await startServer();
const browser = await launch();
const report = [];

// teleport helper: put the camera somewhere and let the controls re-sync from it
const TP = (p, t) => `(() => { const c = window.__ctx.camera; c.position.set(${p}); c.lookAt(${t}); window.__ui.controls.resync(); window.__ui.hud.dismissHint(); })()`;
const project = (page, p) => page.evaluate((p) => { const c = window.__ctx; c.camera.updateMatrixWorld(); const v = new c.THREE.Vector3(...p).project(c.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, p);

// wait for real rendered frames / simulated seconds (SwiftShader can run at 2–5 fps with the full shell)
const frames = (page, n = 2) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const simWait = (page, sec, maxMs = 60000) => page.evaluate(([sec, maxMs]) => new Promise(r => { const t0 = window.__ctx.time, w0 = performance.now(); const f = () => (window.__ctx.time - t0 >= sec || performance.now() - w0 > maxMs ? r(window.__ctx.time - t0) : requestAnimationFrame(f)); f(); }), [sec, maxMs]);
// Taps carry explicit input timestamps: CDP dispatch blocks while a slow SwiftShader frame renders, so
// without them a 60 ms tap would arrive as a 1 s long-press (a real phone stamps events at input time).
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
async function touchTap(page, cdp, x, y) {
  const T = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }], timestamp: T });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: T + 0.06 });
}
async function mouseTap(cdp, x, y) {
  const T = Date.now() / 1000;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, timestamp: T - 0.05 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, timestamp: T });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, timestamp: T + 0.07 });
}
async function tapAt(page, cdp, mobile, x, y) { if (mobile) await touchTap(page, cdp, x, y); else await mouseTap(cdp, x, y); }
async function click(page, cdp, mobile, sel) {
  const b = await stableBox(page, sel); if (!b) throw new Error('no ' + sel);
  await tapAt(page, cdp, mobile, b.x + b.width / 2, b.y + b.height / 2);
}
async function layoutCheck(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = [];
    const docW = document.documentElement.scrollWidth, bodyW = document.body.scrollWidth;
    if (docW > W || bodyW > W) bad.push(`hscroll ${docW}/${bodyW} > ${W}`);
    for (const e of document.querySelectorAll('#me-ui .me-brand, #me-ui .me-bagbtn, #me-ui .me-bar, #me-ui .me-card.is-open, #me-ui .me-sheet.is-open, #me-ui .me-chip.is-on, #me-ui .me-toast')) {
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const r = e.getBoundingClientRect();
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) bad.push(`${e.className.split(' ')[0]} off-screen ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
      // text overflowing its own box (clipping)
      for (const t of e.querySelectorAll('.lbl, .me-word, .me-title, .me-cta, .me-go .t')) if (t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).overflow !== 'visible') bad.push('clipped ' + t.className + ' ' + t.textContent.slice(0, 20));
    }
    const card = document.querySelector('.me-card.is-open .me-card-bd'); if (card && card.scrollHeight > card.clientHeight + 2) bad.push(`card scrolls ${card.scrollHeight}/${card.clientHeight}`);
    return bad;
  });
}

for (const [W, H] of sizes) {
  const tag = `${W}x${H}`, mobile = W < 900;
  for (const state of states) {
    const ldFile = path.join(out, `${args.prefix || ""}loader-${tag}.png`);
    const beforeReady = state === 'loader' ? async (page) => { await page.waitForSelector('.me-loader', { timeout: 60000 }); await sleep(900); await page.screenshot({ path: ldFile }); } : null;
    const { context, page, logs, readyMs } = await openStore(browser, port, { W, H, dpr: Number(args.dpr || 1), modules, tier: args.tier || 'mid', src: args.src, query: args.query, beforeReady });
    if (state === 'loader') { report.push({ state, size: tag, file: path.relative(ROOT, ldFile), logs }); await context.close(); process.stderr.write(`${tag} loader\n`); continue; }
    const cdp = await context.newCDPSession(page);
    const EYE = 1.62;
    let note = '';
    try {
      if (state === 'start') await sleep(1900);
      else await sleep(1300);
      if (state === 'card') {
        await page.evaluate(TP(`1.3,${EYE},1.3`, '0.1,1.1,-2.3')); await frames(page, 3);
        const [x, y] = await project(page, [0.1, 1.2, -2.5]);
        await tapAt(page, cdp, mobile, x, y); await frames(page, 2); await sleep(900);
      } else if (state === 'product' || state === 'productbag') {
        // frame a real priced interactable from the live scene (prefers ones with colourways) and tap it
        const found = await page.evaluate((EYE) => {
          const c = window.__ctx, T = c.THREE, cam = c.camera, rc = new T.Raycaster(), m = new T.Matrix4(), out = [];
          for (const o of c.interact.items) {
            const targets = [];
            if (o.isInstancedMesh) { for (const k of [Math.floor(o.count / 2), 0]) { o.getMatrixAt(k, m); const p = new T.Vector3().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); targets.push(p); } }
            else { const b = new T.Box3().setFromObject(o); if (b.isEmpty()) continue; const sz = b.getSize(new T.Vector3()); if (sz.length() > 4) continue; targets.push(b.getCenter(new T.Vector3())); }
            for (const t of targets) {
              const d = new T.Vector3(-t.x * 0.3, 0, -t.z * 0.3 + 0.0001).setY(0); if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
              d.normalize();
              const p = t.clone().addScaledVector(d, 1.7); p.y = EYE;
              c.colliders.resolve(p);
              cam.position.copy(p); cam.lookAt(t); cam.updateMatrixWorld();
              rc.setFromCamera(new T.Vector2(0, 0), cam);
              const h = rc.intersectObjects(c.interact.items, true)[0]; if (!h) continue;
              const r = c.interact.infoFor(h); if (!r || !r.info || r.info.price === undefined) continue;
              out.push({ p: p.toArray(), t: t.toArray(), title: r.info.title, cw: (r.info.colorways || []).length });
            }
          }
          out.sort((a, b) => b.cw - a.cw);
          return out;
        }, EYE);
        if (!found.length) throw new Error('no priced interactable in scene');
        const pick = found[Math.min(found.length - 1, Number(args.pick || 0))];
        note = pick.title;
        await page.evaluate(TP(pick.p.join(','), pick.t.join(','))); await frames(page, 3);
        await tapAt(page, cdp, mobile, W / 2, H / 2); await frames(page, 2); await sleep(900);
        if (pick.cw > 1) { await click(page, cdp, mobile, '.me-swb[data-i="1"]'); await frames(page, 4); await sleep(500); }
        { const si = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out'))); if (si >= 0) { await click(page, cdp, mobile, `.me-szb[data-i="${si}"]`); await frames(page, 3); await sleep(300); } }
        if (state === 'productbag') { await click(page, cdp, mobile, '.me-card [data-act="add"]'); await sleep(1500); await click(page, cdp, mobile, '.me-bagbtn'); await frames(page, 3); await sleep(900); }
      } else if (state === 'swatch' || state === 'bag' || state === 'fly') {
        await page.evaluate(TP(`0,${EYE},-7.4`, '0,1.5,-10.6')); await frames(page, 3);
        const [x, y] = await project(page, [0, 1.5, -10.45]);
        await tapAt(page, cdp, mobile, x, y); await frames(page, 2); await sleep(700);
        const nsw = await page.locator('.me-swb').count();
        if (nsw > 1) { await click(page, cdp, mobile, `.me-swb[data-i="${Math.min(2, nsw - 1)}"]`); await frames(page, 4); await sleep(400); }
        const si = await page.evaluate(() => [...document.querySelectorAll('.me-szb')].findIndex(b => !b.classList.contains('out')));
        if (si >= 0) { await click(page, cdp, mobile, `.me-szb[data-i="${si}"]`); await sleep(200); }
        if (state === 'fly') { await click(page, cdp, mobile, '.me-card [data-act="add"]'); await sleep(330); }
        if (state === 'bag') {
          await click(page, cdp, mobile, '.me-card [data-act="add"]'); await sleep(1400);
          await click(page, cdp, mobile, '.me-bagbtn'); await sleep(900);
        }
      } else if (state === 'goto') { await click(page, cdp, mobile, '[data-act="goto"]'); await sleep(900); }
      else if (state === 'info') { await click(page, cdp, mobile, '[data-act="info"]'); await sleep(1200); }
      else if (state === 'tour') { await click(page, cdp, mobile, '[data-act="tour"]'); await simWait(page, 3.2); await sleep(300); }
      else if (state === 'joy') {
        if (mobile) {
          const x = Math.round(W * 0.2), y = Math.round(H * (W > H ? 0.7 : 0.75));
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 2, y: y - i * 5, id: 1 }] }); await sleep(30); }
          await simWait(page, 0.8, 8000);
        } else { await page.keyboard.down('KeyW'); await simWait(page, 0.8, 8000); }
      }
      await frames(page, 2);
      const f = path.join(out, `${(args.prefix || '') + state}-${tag}.png`);
      await page.screenshot({ path: f });
      const bad = await layoutCheck(page);
      const cam = await page.evaluate(() => { const c = window.__ctx.camera; return { p: c.position.toArray().map(v => +v.toFixed(2)), fps: window.__STATS().fps, nav: window.__ui.nav.kind }; });
      if (state === 'joy' && !mobile) await page.keyboard.up('KeyW');
      note = [note, ...bad].filter(Boolean).join('; ');
      report.push({ state, size: tag, readyMs, file: path.relative(ROOT, f), layout: bad, cam, logs: logs.filter(l => !/KHR_parallel_shader_compile/.test(l)) });
    } catch (e) { report.push({ state, size: tag, error: e.message.split('\n')[0], logs }); }
    await context.close();
    process.stderr.write(`${tag} ${state} ${note}\n`);
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close(); server.close();
