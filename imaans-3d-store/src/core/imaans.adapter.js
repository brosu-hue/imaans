// Turns an Imaan's Shoes website content document (the site's schemaVersion-1 JSON: window.IS.content,
// window.IS_FALLBACK_CONTENT, data/content.json or content.static.js) into the trimmed shape the 3D store
// uses. Shared by tools/imaans-import.mjs (build-time snapshot) and core/catalog.js (live content when the
// store runs inside the website) — so a newer content file only needs re-importing, never code changes.
//   imageOf(product) → the image path/url the store should use for that product (or null)
//
// Robust against content edits the site admin allows (and the usual CMS slips): every field is defaulted
// the same way the site's own normaliser does (js/core.js normalise()), numbers stored as strings are read,
// a "sale" price that isn't below the price is no sale (site rule), products/categories keep the site's
// `order`, and every product lands in one of the store's three departments:
//   product.category ∈ 'clothes' | 'shoes' | 'accessories'  (DEPARTMENTS — the 3-D store's zones)
// A site category maps to a department by its slug/id/name ('Clothing', 'Footwear', 'Bags & Accessories' …);
// products in other categories ('Kids', 'Sale', 'New in' …) go to the department of their other categories,
// else to the one their tags/name suggest (trainers → shoes, bag → accessories, else clothes).
// product.categories keeps every site category slug; catalog.categories lists all site categories.
export const DEPARTMENTS = ['clothes', 'shoes', 'accessories'];
const DEPT_NAME = { clothes: 'Clothes', shoes: 'Shoes', accessories: 'Accessories' };
const DEFAULT_CURRENCY = { code: 'ZAR', symbol: 'R', position: 'before', decimals: 2, thousands: ' ', decimalSep: '.' };
// category slug / id / name → department (first test wins: 'Kids shoes' → shoes)
const CAT_WORDS = [
  ['shoes', /\b(shoes?|footwear|sneakers?|trainers?|boots?|heels?|sandals?|loafers?)\b/],
  ['accessories', /\b(accessor\w*|bags?|jewel\w*|hats?|scar(f|ves)|belts?|wallets?|sunglasses)\b/],
  ['clothes', /\b(cloth\w*|apparel|\w*wear|fashion|garments?|dress(es)?|women\w*|men\w*|ladies|tops|knit\w*)\b/],
];
// product tags / name words → department, for products whose categories say nothing
const SHOE_WORDS = /\b(shoes?|sneakers?|trainers?|runners?|boots?|heels?|court|pumps?|stilettos?|flats?|ballet|loafers?|brogues?|monks?|sandals?|slides?|sliders?|mules?|wedges?|espadrilles?|clogs?|slippers?|footwear|mary jane|slip-on)\b/;
const ACC_WORDS = /\b(bags?|totes?|clutch|crossbody|backpacks?|handbags?|purses?|wallets?|card holder|sunglasses|scarf|scarves|hats?|caps?|beanies?|jewellery|jewelry|earrings?|necklaces?|bracelets?|rings?|belts?|gloves|umbrellas?|socks|keyrings?|charms|watch(es)?|hair accessories|accessories|gifts?)\b/;

const arr = v => (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const str = (v, d = '') => (v === null || v === undefined ? d : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : d);
/** number, or a numeric string ("129900" → 129900); anything else → null */
const num = v => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);
const slugify = v => str(v).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const byOrder = list => list.map((x, i) => [x, num(x && x.order) ?? i, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(e => e[0]);
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
// common fashion colour words → a swatch, for colours that come without one
const NAMED = { black: '#1c1c1c', white: '#f4f2ee', ivory: '#f3ecdf', cream: '#efe6d2', oat: '#ded2bd', sand: '#d8c4a2', beige: '#d9c7a7', stone: '#cfc6b8',
  tan: '#b98b5e', camel: '#b48a5a', brown: '#6b4a33', chocolate: '#4a3226', tobacco: '#7a5634', cognac: '#9a5a2c', grey: '#8d8d8d', gray: '#8d8d8d', charcoal: '#3a3a3c',
  navy: '#1f2a44', blue: '#3b5c8c', denim: '#4a6488', sky: '#9cc3e0', green: '#4f6b4a', olive: '#7c7f5c', sage: '#9aa88c', khaki: '#8f8a64', red: '#a3302a',
  burgundy: '#6b1f2a', wine: '#6b1f2a', pink: '#e3a9b4', blush: '#e9c3bd', rose: '#d88e98', lilac: '#b9a3c9', purple: '#6a4a86', yellow: '#e2c24a', mustard: '#c9a13a',
  orange: '#d9793a', rust: '#a4502c', gold: '#c9a24e', silver: '#bfc3c7', bronze: '#9a6a3a', natural: '#d8c8a8', ink: '#232733', leopard: '#b8894a', multi: '#b08d57' };
function swatchOf(c, label) {
  const s = str(c.swatch || c.hex || c.color || c.colour).trim();
  if (HEX.test(s)) return s.length === 4 ? '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s.toLowerCase();
  for (const w of (s + ' ' + label).toLowerCase().split(/[^a-z]+/)) if (NAMED[w]) return NAMED[w];
  return '#9a8f80'; // neutral taupe: never undefined / invalid for a 3-D material
}
const deptOfCategory = k => { const s = [k.slug, k.id, k.name].map(v => str(v).toLowerCase().replace(/[_-]+/g, ' ')).join(' '); const m = CAT_WORDS.find(([, re]) => re.test(s)); return m ? m[0] : null; };
const deptOfWords = s => (SHOE_WORDS.test(s) ? 'shoes' : ACC_WORDS.test(s) ? 'accessories' : 'clothes');

export function adaptSiteContent(c, imageOf = p => (p.images && p.images[0] && p.images[0].url) || null) {
  c = obj(c);
  const text = blocks => arr(blocks).filter(b => b && (b.body || b.heading || (Array.isArray(b.items) && b.items.length))).map(b => ({
    heading: str(b.heading), body: str(b.body), sizeGuideId: b.sizeGuideId || null,
    items: arr(b.items).map(i => ({ q: str(i && (i.q || i.question || i.title)), a: str(i && (i.a || i.answer || i.body)) })).filter(i => i.q || i.a),
  }));

  // ---- categories → departments. The first visible category that names a department becomes it (its id
  // is the department id: 'clothes' | 'shoes' | 'accessories'); every other category keeps its own slug.
  const siteCats = byOrder(arr(c.categories).filter(k => k && k.visible !== false && (k.id || k.slug)));
  const deptTaken = new Set();
  const cats = siteCats.map(k => {
    const d = deptOfCategory(k), own = str(k.slug || k.id).replace(/^cat_/, '');
    const id = d && !deptTaken.has(d) ? (deptTaken.add(d), d) : own;
    return { id, slug: str(k.slug, own), name: str(k.name, DEPT_NAME[id] || own), description: str(k.description), department: d, siteId: str(k.id) };
  });
  const catBySiteId = new Map(); for (const k of cats) { catBySiteId.set(k.siteId, k); catBySiteId.set(k.slug, k); }
  // departments nobody claimed still exist in the 3-D store (their zones are built regardless)
  for (const d of DEPARTMENTS) if (!deptTaken.has(d)) cats.push({ id: d, slug: d, name: DEPT_NAME[d], description: '', department: d, siteId: '' });

  // ---- products
  const seenIds = new Set();
  const products = [];
  byOrder(arr(c.products)).forEach((p, i) => {
    if (!p || typeof p !== 'object' || p.visible === false) return;
    const name = str(p.name, 'Product').trim() || 'Product';
    const id = str(p.id) || 'prd_' + (slugify(p.slug || name) || i);
    if (seenIds.has(id)) return; // duplicate id (CMS slip): the first one wins, like the site's lookups
    seenIds.add(id);
    const slug = str(p.slug) || slugify(name) || 'product-' + (i + 1);
    const tags = arr(p.tags).map(t => str(t).toLowerCase().trim()).filter(Boolean);
    const pcats = arr(p.categoryIds).map(x => catBySiteId.get(str(x)) || catBySiteId.get(str(x).replace(/^cat_/, ''))).filter(Boolean);
    const dk = pcats.find(k => k.department);
    const category = dk ? dk.department : deptOfWords((tags.join(' ') + ' ' + name).toLowerCase());
    const priceCents = Math.max(0, Math.round(num(p.priceCents) ?? 0));
    const sale = num(p.salePriceCents);
    const images = arr(p.images).filter(im => im && typeof im.url === 'string' && im.url);
    const sizes = arr(p.sizes).filter(s => s && (s.label != null || s.id != null)).map((s, j) => ({ id: str(s.id) || id + '_sz' + j, label: str(s.label, str(s.id)), inStock: s.inStock !== false }));
    const colours = arr(p.colours).filter(Boolean).map((s, j) => { const label = str(s.label || s.name, 'Colour ' + (j + 1)); return { id: str(s.id) || id + '_col' + j, label, swatch: swatchOf(s, label) }; });
    const q = {
      id, slug, name, sku: str(p.sku), category, categories: pcats.map(k => k.slug),
      short: str(p.shortDescription), priceCents, salePriceCents: sale != null && sale >= 0 && sale < priceCents ? Math.round(sale) : null,
      sizes, colours, badges: arr(p.badges).map(b => str(b).toLowerCase().trim()).filter(Boolean), tags, inStock: p.inStock !== false, featured: !!p.featured,
      image: null, imageAlt: str(images[0] && images[0].alt),
    };
    try { q.image = imageOf({ ...p, images }) || null; } catch (e) { q.image = null; }
    products.push(q);
  });
  const settings = obj(c.settings);
  const visibleProducts = settings.showOutOfStock === false ? products.filter(p => p.inStock) : products; // site: hide sold-out

  const site = obj(c.site), contact = obj(c.contact), hours = obj(c.hours), nav = obj(c.nav), an = obj(nav.announcement), k = obj(c.checkout);
  const cur = obj(site.currency), currency = {};
  for (const key of Object.keys(DEFAULT_CURRENCY)) currency[key] = cur[key] === null || cur[key] === undefined ? DEFAULT_CURRENCY[key] : cur[key];
  const digits = v => str(v).replace(/[^0-9]/g, '');
  const cleanContact = { ...contact, phoneDisplay: str(contact.phoneDisplay), whatsapp: digits(contact.whatsapp), email: str(contact.email),
    addressLines: arr(contact.addressLines).map(l => str(l)).filter(Boolean), mapUrl: str(contact.mapUrl), showMap: contact.showMap !== false };
  const DAY = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  return {
    site: { name: str(site.name, 'Imaan’s Shoes'), tagline: str(site.tagline), currency, locale: str(site.locale, 'en-ZA') },
    theme: obj(c.theme),
    announcement: (an.enabled && str(an.text)) || '',
    categories: cats.map(({ siteId, ...k }) => k),
    sizeGuides: arr(c.sizeGuides).filter(Boolean),
    pages: arr(c.pages).filter(p => p && p.visible !== false && p.slug).map(p => ({ slug: str(p.slug), title: str(p.title, str(p.slug)), blocks: text(p.blocks) })),
    // headline promos first (modules show promos[0] as "the current campaign"), then the site's order
    promos: byOrder(arr(c.promos).filter(p => p && p.enabled !== false))
      .map(p => ({ id: str(p.id), name: str(p.name), headline: str(p.headline), sub: str(p.sub), startsAt: p.startsAt || null, endsAt: p.endsAt || null }))
      .sort((a, b) => (b.headline ? 1 : 0) - (a.headline ? 1 : 0)),
    testimonials: arr(c.testimonials).filter(t => t && t.visible !== false && str(t.text).trim())
      .map(t => ({ name: str(t.name), location: str(t.location), rating: num(t.rating), text: str(t.text) })),
    contact: cleanContact,
    // days Monday-first by their `day` key (some consumers index days[(getDay()+6)%7]); unknown keys keep their place
    hours: { note: str(hours.note), days: (() => {
      const days = arr(hours.days).filter(Boolean).map(d => ({ ...d, day: str(d.day), label: str(d.label, DAY[str(d.day).slice(0, 3).toLowerCase()] || str(d.day)), open: str(d.open), close: str(d.close), closed: !!d.closed }));
      const ORDER = Object.keys(DAY), ix = d => ORDER.indexOf(d.day.slice(0, 3).toLowerCase());
      return days.every(d => ix(d) >= 0) ? days.map((d, i) => [d, i]).sort((a, b) => ix(a[0]) - ix(b[0]) || a[1] - b[1]).map(e => e[0]) : days;
    })() },
    social: arr(c.social).filter(s => s && s.visible !== false && s.url).map(s => ({ label: str(s.label, str(s.url)), url: str(s.url) })),
    checkout: {
      mode: str(k.mode, 'whatsapp'), whatsappNumber: digits(k.whatsappNumber) || cleanContact.whatsapp, emailTo: str(k.emailTo) || cleanContact.email,
      messageIntro: str(k.messageIntro), messageOutro: str(k.messageOutro), collectFields: arr(k.collectFields),
      deliveryNote: str(k.deliveryNote), minOrderCents: num(k.minOrderCents),
      freeDeliveryOverCents: num(k.freeDeliveryOverCents), deliveryFeeCents: num(k.deliveryFeeCents), termsNote: str(k.termsNote),
    },
    settings: { showPrices: settings.showPrices !== false, showOutOfStock: settings.showOutOfStock !== false },
    footer: { blurb: str(obj(c.footer).blurb) },
    products: visibleProducts,
  };
}
