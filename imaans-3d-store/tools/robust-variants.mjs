// Synthetic "newer website content" variants for the robustness harness (core owner).
//   node tools/robust-variants.mjs <site folder> <out dir>
// Writes <out>/<variant>/content.static.js (+ a symlink to the site's img/) and <out>/<variant>.json (the raw
// content document, for live-mode injection). Variants mimic what the shop owner can do in the site admin.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SITE = path.resolve(process.argv[2]), OUT = path.resolve(process.argv[3]);
const sb = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(SITE, 'content.static.js'), 'utf8'), sb);
const BASE = JSON.parse(JSON.stringify(sb.window.IS_FALLBACK_CONTENT));
const clone = () => JSON.parse(JSON.stringify(BASE));
const inCat = (p, id) => (p.categoryIds || []).includes(id);

const V = {};
// (a) far fewer products: 5 per category
V.few = () => { const c = clone(); const n = {}; c.products = c.products.filter(p => { const k = p.categoryIds[0]; n[k] = (n[k] || 0) + 1; return n[k] <= 5; }); return c; };
// (a) a department with no products at all (accessories), and one with 1 (shoes)
V.emptyacc = () => { const c = clone(); let s = 0; c.products = c.products.filter(p => !inCat(p, 'cat_accessories') && (!inCat(p, 'cat_shoes') || s++ < 1)); return c; };
// (b) many more products: every product ×2 more (≈ 258), new ids/slugs, varied prices
V.many = () => {
  const c = clone(), extra = [];
  for (let r = 1; r <= 2; r++) for (const p of BASE.products) {
    const q = JSON.parse(JSON.stringify(p)); q.id = p.id + '_v' + r; q.slug = p.slug + '-v' + r; q.name = p.name + (r === 1 ? ' II' : ' Edition'); q.sku = (p.sku || 'X') + '-' + r;
    q.priceCents = p.priceCents + r * 10000; q.salePriceCents = r === 2 && p.priceCents > 50000 ? p.priceCents - 5000 : null;
    q.sizes = (q.sizes || []).map((s, i) => ({ ...s, id: s.id + '_v' + r })); q.colours = (q.colours || []).map(s => ({ ...s, id: s.id + '_v' + r }));
    extra.push(q);
  }
  c.products = c.products.concat(extra); return c;
};
// (c) messy / unusual products
V.weird = () => {
  const c = clone(), P = c.products;
  const cl = P.find(p => inCat(p, 'cat_clothes')), sh = P.find(p => inCat(p, 'cat_shoes')), ac = P.find(p => inCat(p, 'cat_accessories'));
  const add = (src, o) => { const q = { ...JSON.parse(JSON.stringify(src)), ...o }; P.push(q); return q; };
  add(cl, { id: 'prd_kaftan', slug: 'silk-kaftan', name: 'Silk Kaftan', tags: ['kaftans', 'modest', 'eid'], badges: ['eid-special'], images: [] });                 // unknown kind + unknown badge + no image
  add(sh, { id: 'prd_clog', slug: 'wooden-clog', name: 'Wooden Clog', tags: ['clogs'], sizes: [], colours: [], images: [{ url: '/img/does-not-exist.jpg', alt: '' }] }); // unknown shoe kind, no sizes/colours, missing file
  add(ac, { id: 'prd_fan', slug: 'hand-fan', name: 'Hand Fan', tags: undefined, badges: undefined, sizes: undefined, colours: undefined, images: undefined, shortDescription: undefined });
  add(cl, { id: 'prd_str', slug: 'string-price-tee', name: 'String Price Tee', priceCents: '19900', salePriceCents: '14900' });                                        // CMS stored numbers as strings
  add(cl, { id: 'prd_badsale', slug: 'bad-sale-shirt', name: 'Bad Sale Shirt', priceCents: 49900, salePriceCents: 49900 });                                            // "sale" == price → not on sale (site rule)
  add(sh, { id: 'prd_nocol', slug: 'swatchless-boot', name: 'Swatchless Boot', colours: [{ id: 'c1', label: 'Tobacco' }, { label: 'Ink', swatch: 'navy' }, { id: 'c3', swatch: '#123' }], sizes: [{ label: '38' }, { id: 's2', label: '39', inStock: false }] });
  add(cl, { id: 'prd_free', slug: 'free-gift-bag', name: 'Free Gift Bag', priceCents: 0, salePriceCents: null });
  add(cl, { id: 'prd_nocat', slug: 'uncategorised-dress', name: 'Uncategorised Dress', categoryIds: [] });                                                               // no category at all
  add(sh, { id: 'prd_dup1', slug: 'linen-wrap-dress', name: 'Duplicate Slug Sandal' });                                                                                 // slug collision with a real product
  // all sold out in shoes; sales everywhere in accessories
  for (const p of P) { if (inCat(p, 'cat_shoes')) { p.inStock = false; (p.sizes || []).forEach(s => (s.inStock = false)); } if (inCat(p, 'cat_accessories') && typeof p.priceCents === 'number') p.salePriceCents = Math.round(p.priceCents * 0.7); }
  // (g) very long name + emoji
  add(cl, { id: 'prd_long', slug: 'long-name', name: 'The Extraordinarily Long Hand-Embroidered Broderie Anglaise Summer Maxi Dress With Pockets 🌸✨👗 (Limited Eid Collection)', shortDescription: '🌸 Very long short description '.repeat(8) });
  return c;
};
// (d) renamed / added / removed categories
V.cats = () => {
  const c = clone();
  const clothes = c.categories.find(k => k.id === 'cat_clothes');
  clothes.id = 'cat_clothing'; clothes.slug = 'clothing'; clothes.name = 'Clothing';                     // renamed slug + id
  c.categories.find(k => k.id === 'cat_accessories').name = 'Bags & Accessories';                        // renamed label
  c.categories.push({ id: 'cat_kids', slug: 'kids', name: 'Kids', description: 'Little feet, big style.', order: 3, visible: true });
  c.categories.push({ id: 'cat_sale', slug: 'sale', name: 'Sale', description: '', order: 4, visible: true });
  let k = 0;
  for (const p of c.products) {
    p.categoryIds = p.categoryIds.map(id => (id === 'cat_clothes' ? 'cat_clothing' : id));
    if (p.salePriceCents != null) p.categoryIds.unshift('cat_sale');                                     // listed under "Sale" first
    if (k < 12 && (p.tags.includes('sneakers') || p.tags.includes('trainers') || p.tags.includes('tops') || p.tags.includes('dresses'))) { p.categoryIds = ['cat_kids']; p.name = 'Kids ' + p.name; k++; }
  }
  c.categories.reverse();                                                                                 // different order in the array
  return c;
};
// (e) no promos / pages / testimonials, empty hours, sparse contact/checkout/nav
V.bare = () => {
  const c = clone();
  c.promos = []; c.pages = []; c.testimonials = []; c.hours = {}; c.social = []; c.nav = {}; c.footer = {};
  c.contact = { email: 'hello@example.co.za' }; c.checkout = { mode: 'whatsapp' }; c.sizeGuides = [];
  return c;
};
// (e') pages with odd blocks, promos with a date window in the past, hours with every day closed
V.odd = () => {
  const c = clone();
  c.pages = [{ slug: 'about', title: 'About', blocks: [{ type: 'image' }, { heading: 'Only a heading' }] }, { slug: 'faq', title: 'FAQ', blocks: [{ items: [{ question: 'Q?', answer: 'A.' }, {}] }] }, { slug: 'new-page', title: 'Brand New Page', blocks: [{ body: 'Hello' }] }];
  c.promos.forEach(p => { p.endsAt = '2020-01-01T00:00:00.000Z'; });
  c.hours = { note: '', days: c.hours.days.map(d => ({ ...d, closed: true })) };
  c.testimonials = [{ name: 'A', text: '' }, { text: 'No name given' }];
  return c;
};
// (f) currency formatting fields
V.currency = () => { const c = clone(); c.site.currency = { code: 'ZAR', symbol: 'ZAR', position: 'after', decimals: 0, thousands: ',', decimalSep: ',' }; return c; };
V.currency2 = () => { const c = clone(); c.site.currency = { code: 'ZAR' }; return c; };                    // partial object

const only = process.argv[4] ? process.argv[4].split(',') : Object.keys(V);
for (const name of only) {
  const doc = V[name]();
  const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'content.static.js'), '/* robust variant ' + name + ' */\nwindow.IS_FALLBACK_CONTENT = ' + JSON.stringify(doc) + ';\n');
  const img = path.join(dir, 'img'); if (!fs.existsSync(img)) fs.symlinkSync(path.join(SITE, 'img'), img);
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(doc));
  console.log(name, doc.products.length, 'products');
}
