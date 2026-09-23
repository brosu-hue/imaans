#!/usr/bin/env node
// Integrator's dev-only check (never shipped; tools/_* ): ui on, look card + credits + pause/resume.
//   node tools/_integrate-ui.mjs [--src dist] [--size 390x844] [--tier mid] [--out shots/integrate/ui]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, startServer, launch, sleep } from './qa-lib.mjs';
const args = parseArgs(process.argv.slice(2));
const [W, H] = String(args.size || '390x844').split('x').map(Number);
const out = path.resolve(ROOT, args.out || 'shots/integrate/ui'); fs.mkdirSync(out, { recursive: true });
const { server, port } = await startServer();
const browser = await launch();
const mobile = W < 900;
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(args.dpr || 1.5), isMobile: mobile, hasTouch: mobile });
const page = await context.newPage();
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
page.on('pageerror', e => logs.push('[pageerror] ' + String(e).slice(0, 400)));
page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
const pagePath = args.src === 'dist' ? '/dist/index.html' : '/src/dev.html';
await page.goto(`http://127.0.0.1:${port}${pagePath}?tier=${args.tier || 'mid'}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__STORE_READY === true, null, { timeout: 300000, polling: 500 });
await sleep(2500);
const res = {};
await page.screenshot({ path: path.join(out, 'start-ui.png') });
// look card (the wrap mannequin, whose lead piece repeats the trench's)
res.look = await page.evaluate(() => {
  const c = window.__ctx; const items = c.interact.items.filter(o => o.userData.interact && o.userData.interact.lookItems);
  const o = items.find(o => /wrap/.test(o.name)) || items[0];
  window.__setCam(-3.9, 1.62, 7.4, -5.95, 1.2, 10.0);
  c.ui.showCard(o.userData.interact, { object: o, point: o.position.clone() });
  const el = document.querySelector('.me-card');
  return { title: el && el.querySelector('.me-title') && el.querySelector('.me-title').textContent, price: el && el.querySelector('.me-price') && el.querySelector('.me-price').textContent };
});
await sleep(1500);
await page.screenshot({ path: path.join(out, 'look-card.png') });
// a new accessory card
res.acc = await page.evaluate(() => {
  const c = window.__ctx; const o = c.interact.items.find(o => { const i = o.userData.interact; return i && i.productId === 'prd_weekendbag'; });
  window.__setCam(4.9, 1.62, 6.6, 7.6, 1.05, 6.4);
  c.ui.showCard(o.userData.interact, { object: o, point: o.position.clone() });
  const el = document.querySelector('.me-card'); return el && el.textContent.replace(/\s+/g, ' ').slice(0, 200);
});
await sleep(1500);
await page.screenshot({ path: path.join(out, 'acc-card.png') });
// credits
res.credits = await page.evaluate(async () => {
  window.__ctx.ui.hideCard(); window.__ctx.ui.showInfo('credits');
  for (let i = 0; i < 40; i++) { const c = document.querySelector('.me-credits'); if (c && !/Loading/.test(c.textContent)) break; await new Promise(r => setTimeout(r, 250)); }
  const c = document.querySelector('.me-credits'); return c ? [...c.querySelectorAll('li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()) : null;
});
await sleep(800);
await page.screenshot({ path: path.join(out, 'credits.png') });
// pause / resume
res.pause = await page.evaluate(async () => {
  const S = window.IMAANS_STORE, r = window.__ctx.renderer, wait = ms => new Promise(x => setTimeout(x, ms));
  const f0 = r.info.render.frame; S.pause(); S.pause(); await wait(300); const f1 = r.info.render.frame; await wait(2000); const f2 = r.info.render.frame;
  const t0 = window.__ctx.time; S.resume(); S.resume(); await wait(2000); const f3 = r.info.render.frame;
  return { framesWhilePaused: f2 - f1, framesAfterResume: f3 - f2, timeJump: +(window.__ctx.time - t0).toFixed(2), isPaused: S.isPaused(), programsAfterReady: window.__STATS().programsAfterReady };
});
res.models = await page.evaluate(() => ({ requested: window.__ctx.assets.requested(), fixtures: ['fixtures:sofa', 'fixtures:chairV', 'fixtures:foliage', 'fixtures:flowers'].map(n => [n, !!window.__ctx.scene.getObjectByName(n)]) }));
res.logs = logs;
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
await browser.close(); server.close();
