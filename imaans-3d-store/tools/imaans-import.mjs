// Imports the Imaan's Shoes website content (content.static.js from the site zip) into the 3D store:
//   src/core/imaans.data.js   — trimmed content document (products, categories, pages, contact, hours…)
//   assets/products/<slug>.*  — product photos (webp, 360 px) / vector illustrations (svg)
//   assets/brand/*            — logo + campaign imagery
// Re-run whenever the site content changes:
//   node tools/imaans-import.mjs <site folder | content.static.js | content.json> [--dry] [--keep-stale]
// The site folder is the one holding content.static.js (or data/content.json) and img/. --dry reports only
// (writes nothing); --keep-stale keeps product images no product uses any more (default: removed).
// Prints what changed and WARNs about anything the 3-D store can't show the way the site does.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { adaptSiteContent, DEPARTMENTS } from '../src/core/imaans.adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flags = new Set(argv.filter(a => a.startsWith('--'))), args = argv.filter(a => !a.startsWith('--'));
const DRY = flags.has('--dry'), KEEP_STALE = flags.has('--keep-stale');
const IN = path.resolve(args[0] || path.join(ROOT, '../imaans-site'));
const warns = [];
const warn = (m) => { warns.push(m); };

// ---- read the content document (content.static.js runs in a sandbox; JSON is parsed)
function readContent(p) {
  const st = fs.existsSync(p) ? fs.statSync(p) : null;
  if (!st) throw new Error('not found: ' + p);
  if (st.isDirectory()) {
    for (const f of ['content.static.js', 'data/content.json', 'content.json']) if (fs.existsSync(path.join(p, f))) return readContent(path.join(p, f));
    throw new Error('no content.static.js / data/content.json in ' + p);
  }
  const src = fs.readFileSync(p, 'utf8');
  let doc;
  if (p.endsWith('.json')) doc = JSON.parse(src);
  else {
    const win = {}; const sandbox = { window: win, self: win, globalThis: win, document: {}, console };
    vm.runInNewContext(src, sandbox, { timeout: 5000 });
    doc = win.IS_FALLBACK_CONTENT || sandbox.IS_FALLBACK_CONTENT || (win.IS && win.IS.content);
  }
  if (!doc || typeof doc !== 'object') throw new Error('no content document (window.IS_FALLBACK_CONTENT) in ' + p);
  let site = path.dirname(p); if (path.basename(site) === 'data') site = path.dirname(site);
  return { doc, site };
}
const { doc: c, site: SITE } = readContent(IN);
if (c.schemaVersion != null && c.schemaVersion !== 1) warn(`content schemaVersion ${c.schemaVersion} (the adapter was written for 1) — check the result carefully`);

const PROD = path.join(ROOT, 'assets/products'), BRAND = path.join(ROOT, 'assets/brand');
if (!DRY) { fs.mkdirSync(PROD, { recursive: true }); fs.mkdirSync(BRAND, { recursive: true }); }

async function toWebp(src, dst, width, quality = 76) {
  await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(dst);
}
const safe = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'product';

// ---- product photos → local assets (the adapter then records the local path)
const localImage = new Map(), usedFiles = new Set(), usedNames = new Set();
let missing = 0, converted = 0, remote = 0;
for (const p of Array.isArray(c.products) ? c.products : []) {
  if (!p || p.visible === false) continue;
  const im = Array.isArray(p.images) ? p.images.find(i => i && typeof i.url === 'string' && i.url) : null;
  const url = im && im.url;
  if (!url) { missing++; warn(`no photo: ${p.name || p.id} (the card shows a placeholder)`); continue; }
  if (/^https?:\/\//.test(url)) { localImage.set(p.id, url); remote++; warn(`remote photo kept as URL: ${p.name} → ${url}`); continue; }
  const src = path.join(SITE, decodeURIComponent(url.split(/[?#]/)[0]));
  if (!fs.existsSync(src)) { missing++; warn(`photo file missing: ${p.name || p.id} → ${url}`); continue; }
  let base = safe(p.slug || p.name); if (usedNames.has(base)) base = safe(base + '-' + p.id); usedNames.add(base); // slug collisions never overwrite
  const isSvg = /\.svg$/i.test(src), f = 'products/' + base + (isSvg ? '.svg' : '.webp');
  try {
    if (!DRY) { if (isSvg) fs.copyFileSync(src, path.join(ROOT, 'assets', f)); else await toWebp(src, path.join(ROOT, 'assets', f), 360); }
    localImage.set(p.id, f); usedFiles.add(path.basename(f)); converted++;
  } catch (e) { missing++; warn(`photo unreadable: ${p.name} → ${url} (${e.message.split('\n')[0]})`); }
}
const data = adaptSiteContent(c, p => localImage.get(p.id) || null);
const products = data.products;
if (!products.length) { console.error('ABORT: the content has no visible products — nothing written (the store would be empty).'); process.exit(1); }

// ---- what the 3-D store will make of it
const byDept = Object.fromEntries(DEPARTMENTS.map(d => [d, products.filter(p => p.category === d)]));
for (const d of DEPARTMENTS) if (!byDept[d].length) warn(`department "${d}" has NO products — its 3-D displays fall back to products of other departments`);
  else if (byDept[d].length < 6) warn(`department "${d}" has only ${byDept[d].length} products — its displays repeat them`);
const extraCats = data.categories.filter(k => !k.department);
for (const k of extraCats) {
  const ps = products.filter(p => p.categories.includes(k.slug));
  if (ps.length) warn(`site category "${k.name}" has no 3-D department; its ${ps.length} products are shown under ${[...new Set(ps.map(p => p.category))].join(' / ')}`);
}
const renamed = data.categories.filter(k => k.department && k.slug !== k.department);
for (const k of renamed) warn(`site category "${k.name}" (${k.slug}) is shown as the ${k.department} department`);
const inferred = products.filter(p => !p.categories.length);
if (inferred.length) warn(`${inferred.length} products have no category; placed by their tags/name: ${inferred.slice(0, 5).map(p => p.name + ' → ' + p.category).join(', ')}`);
const soldOut = products.filter(p => !p.inStock).length;
if (soldOut) warn(`${soldOut} products are sold out (still shown, with sold-out sizes disabled)${data.settings.showOutOfStock ? '' : ' — hidden: settings.showOutOfStock is off'}`);
if (!data.settings.showPrices) warn('settings.showPrices is off on the site — the 3-D store still shows prices');
const PAGES = ['about', 'shipping-delivery', 'returns', 'size-guide', 'faq'];
const missingPages = PAGES.filter(s => !data.pages.some(p => p.slug === s));
if (missingPages.length) warn(`pages missing: ${missingPages.join(', ')} (the Info menu lists whatever pages exist)`);
if (!data.promos.some(p => p.headline)) warn('no enabled promo with a headline — the Spring Edit plinth / window cards use their fallback copy');
const inWindow = (p) => !(p.startsAt && Date.parse(p.startsAt) > Date.now()) && !(p.endsAt && Date.parse(p.endsAt) < Date.now());
for (const p of data.promos.filter(p => !inWindow(p))) warn(`promo "${p.name}" is outside its startsAt/endsAt window today — the store hides it while it is (checked when the store loads)`);
if (!data.hours.days.length) warn('no opening hours — hours signage/cards show the contact details only');
if (!(data.checkout.whatsappNumber || data.checkout.emailTo)) warn('no WhatsApp number or order email — the bag cannot send an order');

// ---- previous snapshot, for a short diff
let prev = null;
try { const m = fs.readFileSync(path.join(ROOT, 'src/core/imaans.data.js'), 'utf8'); prev = JSON.parse(m.slice(m.indexOf('=') + 1).trim().replace(/;\s*$/, '')); } catch (e) { /* first import */ }
if (prev) {
  const old = new Map(prev.products.map(p => [p.id, p]));
  const added = products.filter(p => !old.has(p.id)), removed = prev.products.filter(p => !products.some(q => q.id === p.id));
  const repriced = products.filter(p => old.has(p.id) && (old.get(p.id).priceCents !== p.priceCents || old.get(p.id).salePriceCents !== p.salePriceCents));
  console.log(`vs previous snapshot: +${added.length} new, -${removed.length} removed, ${repriced.length} repriced products`);
}

if (!DRY) {
  fs.writeFileSync(path.join(ROOT, 'src/core/imaans.data.js'),
    '// GENERATED by tools/imaans-import.mjs from the Imaan\'s Shoes site content — do not edit by hand.\n' +
    'export const IMAANS = ' + JSON.stringify(data, null, 1) + ';\n');
  // brand imagery (only replaced when the site still has the file)
  const logo = path.join(SITE, 'img/logo.svg');
  if (fs.existsSync(logo)) fs.copyFileSync(logo, path.join(BRAND, 'logo.svg')); else warn('img/logo.svg not in the site — kept the current logo');
  for (const [src, dst, w] of [['img/banner-imaans-hero.jpg', 'banner.webp', 1400], ['img/promo-clothing-lifestyle.jpg', 'campaign-clothing.webp', 1024],
    ['img/promo-shoes-lifestyle.jpg', 'campaign-shoes.webp', 1024], ['img/promo-spring.jpg', 'spring-edit.webp', 533]]) {
    if (!fs.existsSync(path.join(SITE, src))) { warn(`${src} not in the site — kept the current ${dst}`); continue; }
    try { await toWebp(path.join(SITE, src), path.join(BRAND, dst), w, 80); } catch (e) { warn(`${src} unreadable — kept the current ${dst}`); }
  }
  // product images no product uses any more would still ship in dist/ → remove them
  if (!KEEP_STALE) {
    const stale = fs.readdirSync(PROD).filter(f => /\.(webp|svg)$/.test(f) && !usedFiles.has(f));
    for (const f of stale) fs.unlinkSync(path.join(PROD, f));
    if (stale.length) console.log(`removed ${stale.length} product images no product uses any more`);
  }
}
const size = d => (fs.existsSync(d) ? fs.readdirSync(d).reduce((a, f) => a + fs.statSync(path.join(d, f)).size, 0) : 0);
console.log(`${DRY ? '[dry run] ' : ''}${products.length} products (${converted} photos${remote ? `, ${remote} remote` : ''}, ${missing} without a photo file), products/ ${(size(PROD) / 1024) | 0} KB, brand/ ${(size(BRAND) / 1024) | 0} KB`);
console.log('by department:', DEPARTMENTS.map(k => k + ' ' + byDept[k].length).join(', '), extraCats.length ? '· other site categories: ' + extraCats.map(k => k.name).join(', ') : '');
console.log('pages:', data.pages.map(p => p.slug + '(' + p.blocks.length + ')').join(' ') || '(none)');
console.log('currency:', JSON.stringify(data.site.currency), '· promos:', data.promos.map(p => p.name).join(' | ') || '(none)');
if (warns.length) { console.log(`\n${warns.length} WARN${warns.length > 1 ? 's' : ''}:`); for (const w of warns.slice(0, 40)) console.log('  WARN ' + w); if (warns.length > 40) console.log(`  … ${warns.length - 40} more`); }
