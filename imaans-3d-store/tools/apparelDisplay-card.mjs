#!/usr/bin/env node
// apparelDisplay dev check (owner: apparelDisplay): taps a mannequin through the real ui picking path,
// screenshots the "Complete the look" card, presses "Add the look to bag" and reports the bag.
//   node tools/apparelDisplay-card.mjs [--modules architecture,apparelDisplay,ui] [--out shots/apparelDisplay] [--fig 0]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const modules = arg('modules', 'architecture,apparelDisplay,ui'), out = path.resolve(ROOT, arg('out', 'shots/apparelDisplay')), fig = +arg('fig', 0);
fs.mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(ROOT, u); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const logs = [];
p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 200)); });
p.on('pageerror', e => logs.push('pageerror ' + e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/src/dev.html?modules=${modules}&tier=mid`);
await p.waitForFunction(() => window.__STORE_READY === true, null, { timeout: 300000, polling: 500 });
await p.waitForTimeout(2500);
const res = await p.evaluate(async (fi) => {
  const c = window.__ctx, A = window.__apparelDisplay, cam = c.camera;
  window.__ui.stopFlight && window.__ui.stopFlight('x');
  window.__setCam(0.3, 1.62, 2.2, -1.4, 1.1, 3.9); cam.updateMatrixWorld();
  const r = A.figs.records[fi];
  const v = r.centre.clone().setY(r.pivot.y + 1.1).project(cam), rc = c.renderer.domElement.getBoundingClientRect();
  const hit = window.__ui.pick(rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height);
  if (!hit) return { error: 'no pick' };
  hit.info.onTap(hit.hit); c.ui.showCard(hit.info, hit.hit);
  return { title: hit.info.title, subtitle: hit.info.subtitle, price: hit.info.price };
}, fig);
await p.waitForTimeout(1500);
await p.screenshot({ path: path.join(out, 'final-card-look.png') });
const btn = await p.$('#me-ui .me-card [data-act="action"]');
if (btn) await btn.click();
let bag = [];
for (let i = 0; i < 20 && !bag.length; i++) { await p.waitForTimeout(500); bag = await p.evaluate(() => window.__ui.hud.bag.map(x => x.title + ' ' + x.price)); }
await p.waitForTimeout(800);
await p.screenshot({ path: path.join(out, 'final-card-added.png') });
console.log(JSON.stringify({ card: res, bag, logs }, null, 1));
await b.close(); server.close();
