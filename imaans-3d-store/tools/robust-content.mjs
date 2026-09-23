// Fast (no browser) invariant check of the content pipeline: adaptSiteContent() on the site content and on
// every synthetic variant (tools/robust-variants.mjs), plus the catalog's formatPrice vs the site's formatMoney.
//   node tools/robust-content.mjs [<site folder>] [<variants dir>]
// FAILs when an adapted document would break a module: a product outside the three departments, a non-number
// price, a sale not below the price, a non-hex swatch, a size/colour without id, non-array fields, a missing
// department, bad hours/contact shapes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSiteContent, DEPARTMENTS } from '../src/core/imaans.adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(process.argv[2] || path.join(ROOT, '../imaans-site'));
const VARS = process.argv[3] ? path.resolve(process.argv[3]) : null;
const load = (f) => { if (f.endsWith('.json')) return JSON.parse(fs.readFileSync(f, 'utf8')); const w = {}; vm.runInNewContext(fs.readFileSync(f, 'utf8'), { window: w }); return w.IS_FALLBACK_CONTENT; };
const docs = [['site', load(path.join(SITE, 'content.static.js'))]];
if (VARS) for (const f of fs.readdirSync(VARS).filter(f => f.endsWith('.json')).sort()) docs.push([f.replace(/\.json$/, ''), load(path.join(VARS, f))]);
docs.push(['empty-object', {}], ['garbage', { products: [null, 7, 'x', { name: 42 }], categories: [null, {}], pages: [null, { slug: 'a' }], hours: 'closed', contact: [], site: { currency: 'ZAR' } }]);

// the site's formatMoney (js/core.js), for comparison
function formatMoney(cents, cur) {
  const c = cur && typeof cur === 'object' ? cur : {}; const n = typeof cents === 'number' && isFinite(cents) ? cents : 0; const neg = n < 0;
  const abs = Math.abs(Math.round(n)); const dec = typeof c.decimals === 'number' ? c.decimals : 2; let whole, frac = '';
  if (dec === 0) whole = Math.round(abs / 100); else if (dec === 1) { const t = Math.round(abs / 10); whole = Math.floor(t / 10); frac = String(t % 10); } else { whole = Math.floor(abs / 100); frac = String(100 + (abs % 100)).slice(1); }
  const th = typeof c.thousands === 'string' ? c.thousands : ' '; let body = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',').split(',').join(th);
  if (dec > 0) body = body + (c.decimalSep || '.') + frac; const sym = typeof c.symbol === 'string' ? c.symbol : '';
  const out = c.position === 'after' ? (body + (sym ? ' ' + sym : '')) : ((sym ? sym + ' ' : '') + body); return neg ? '-' + out : out;
}

let fails = 0;
const HEX6 = /^#[0-9a-f]{6}$/;
for (const [name, doc] of docs) {
  const P = [];
  let d; try { d = adaptSiteContent(doc); } catch (e) { console.log(`FAIL ${name}: adapter threw ${e.message}`); fails++; continue; }
  for (const k of ['categories', 'sizeGuides', 'pages', 'promos', 'testimonials', 'social', 'products']) if (!Array.isArray(d[k])) P.push(k + ' not an array');
  if (!Array.isArray(d.contact.addressLines) || !Array.isArray(d.hours.days)) P.push('contact.addressLines / hours.days not arrays');
  for (const dep of DEPARTMENTS) if (!d.categories.some(k => k.id === dep)) P.push('department missing: ' + dep);
  const ids = new Set();
  for (const p of d.products) {
    if (ids.has(p.id)) P.push('duplicate id ' + p.id); ids.add(p.id);
    if (!DEPARTMENTS.includes(p.category)) P.push(`${p.id}: category ${p.category}`);
    if (typeof p.priceCents !== 'number' || !isFinite(p.priceCents) || p.priceCents < 0) P.push(`${p.id}: priceCents ${p.priceCents}`);
    if (p.salePriceCents != null && !(p.salePriceCents < p.priceCents)) P.push(`${p.id}: sale ${p.salePriceCents} !< ${p.priceCents}`);
    for (const k of ['sizes', 'colours', 'tags', 'badges', 'categories']) if (!Array.isArray(p[k])) P.push(`${p.id}: ${k} not an array`);
    for (const s of p.sizes) if (!s.id || typeof s.label !== 'string') P.push(`${p.id}: size ${JSON.stringify(s)}`);
    for (const c of p.colours) if (!c.id || !HEX6.test(c.swatch) || !c.label) P.push(`${p.id}: colour ${JSON.stringify(c)}`);
    if (typeof p.name !== 'string' || !p.name || typeof p.slug !== 'string' || !p.slug) P.push(`${p.id}: name/slug`);
    if (p.tags.some(t => typeof t !== 'string')) P.push(`${p.id}: tag not a string`);
  }
  const cur = d.site.currency;
  for (const v of [0, 5, 99, 129900, 123456789, -5050]) { const ours = formatMoney(v, cur); if (/undefined|NaN|null/.test(ours)) P.push('formatMoney ' + ours); }
  const counts = DEPARTMENTS.map(k => k + ' ' + d.products.filter(p => p.category === k).length).join(', ');
  if (P.length) { fails++; console.log(`FAIL ${name}: ${P.length} problems — ${P.slice(0, 5).join(' | ')}`); }
  else console.log(`PASS ${name}: ${d.products.length} products (${counts}); ${d.pages.length} pages, ${d.promos.length} promos, ${d.hours.days.length} days; price ${formatMoney(129900, cur)}`);
}
// catalog.formatPrice === site formatMoney for the snapshot currency
const { catalog } = await import('../src/core/catalog.js');
const bad = [0, 1, 99, 100, 129900, 1000000, 123456789, -5050].filter(v => catalog.formatPrice(v) !== formatMoney(v, catalog.currency));
if (bad.length) { fails++; console.log('FAIL formatPrice differs from the site for ' + bad.join(', ')); } else console.log('PASS catalog.formatPrice === site formatMoney (' + catalog.formatPrice(123456789) + ')');
process.exit(fails ? 1 : 0);
