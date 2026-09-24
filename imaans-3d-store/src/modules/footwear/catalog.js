// footwear — the shoe department's link to the Imaan's Shoes catalogue (ctx.catalog). NOTHING product-specific
// is hard-coded here: sections, 3-D styles and colours are derived from each product's tags / name, so a
// newer content file re-merchandises the shop by itself.
//   sectionOf    Sneakers · Boots · Heels · Flats · Sandals (website shoe tags) → which fixture is a shoe's home
//   styleFor     product → procedural style key (lasts.js STYLES) or 'sneaker' (the GLB)
//   merchandise  products × display units → what stands where (every product at least once)
//   colourHex    product colour → THREE-ready hex (swatches straight from the site)

const text = (p) => (p.name + ' ' + (p.tags || []).join(' ')).toLowerCase();
const has = (p, ...words) => { const t = text(p); return words.some(w => new RegExp('(^|[^a-z])' + w + '(s|es)?([^a-z]|$)').test(t)); };

/** Which wall section a product belongs to (tags first, like the website's shoe filters). */
export function sectionOf(p) {
  if (has(p, 'sneaker', 'trainer', 'runner')) return 'sneakers';
  if (has(p, 'boot')) return 'boots';
  if (has(p, 'heel', 'court', 'stiletto', 'pump')) return 'heels';
  if (has(p, 'sandal', 'slide', 'slider', 'wedge', 'espadrille', 'flip-flop')) return 'sandals';
  return 'flats';
}

/** The 3-D style that matches the product kind. */
export function styleFor(p) {
  const sec = sectionOf(p);
  if (sec === 'sneakers') return 'sneaker';
  if (sec === 'boots') {
    if (has(p, 'chelsea')) return 'chelsea';
    if (has(p, 'rain', 'rubber', 'wellington', 'gumboot')) return 'rain';
    if (has(p, 'riding', 'knee', 'knee-high', 'tall')) return 'riding';
    if (has(p, 'fur', 'faux fur', 'shearling', 'lined')) return 'furBoot';
    if (has(p, 'desert', 'chukka')) return 'desert';
    if (has(p, 'western', 'cowboy')) return 'western';
    if (has(p, 'heeled', 'block heel', 'heel')) return 'ankleHeel';
    return has(p, 'suede') ? 'desert' : 'chelsea';
  }
  if (sec === 'heels') {
    if (has(p, 'kitten', 'kitten heel')) return 'kitten';
    if (has(p, 'block', 'block heel')) return 'blockHeel';
    if (has(p, 'patent')) return 'patentPump';
    return 'pump';
  }
  if (sec === 'sandals') {
    if (/espadrille/i.test(p.name) && !/sandal/i.test(p.name)) return 'espadrille';
    if (has(p, 'wedge', 'espadrille')) return 'wedge';
    if (has(p, 'platform')) return 'platform';
    if (has(p, 'gladiator')) return 'gladiator';
    if (has(p, 'woven', 'raffia', 'basket')) return 'wovenSlide';
    if (has(p, 'bow')) return 'bowSlide';
    if (has(p, 'slide', 'slider', 'mule')) return 'slide';
    if (has(p, 'snake', 'snake print', 'croc', 'flat')) return 'strapAnkle';
    return 'twostrap';
  }
  // flats & co
  if (has(p, 'monk', 'monk-strap')) return 'monk';
  if (has(p, 'mary jane', 't-bar')) return 'maryjane';
  if (has(p, 'ballet', 'ballerina', 'pump flat')) return 'ballet';
  if (has(p, 'brogue', 'oxford', 'derby', 'lace-up')) return 'brogue';
  if (has(p, 'mule', 'slip-on', 'backless')) return 'mule';
  if (has(p, 'loafer', 'moccasin')) return 'loafer';
  return has(p, 'suede') ? 'monk' : 'loafer';
}

/** All shoes of the catalogue (category 'shoes'; falls back to tag matching if the category is renamed). */
export function shoeProducts(catalog) {
  let list = catalog.byCategory('shoes');
  if (!list.length) {
    const kinds = ['sneaker', 'boot', 'heel', 'flat', 'sandal', 'loafer', 'mule', 'brogue', 'slide', 'wedge'];
    const seen = new Set();
    list = [];
    for (const k of kinds) for (const p of catalog.all(k)) if (!seen.has(p.id) && has(p, k)) { seen.add(p.id); list.push(p); }
  }
  return list;
}

/**
 * Merchandise the shoe fixtures. fixtures (priority order): [{ units (prime first; a unit = one shoe or one pair,
 * unit.maxH = clear height), home(p) (the kinds it is the home of), fill(p) (kinds it repeats), group (a product's
 * colourways side by side) | interleave, vary (spare units show other products, not more colourways), run
 * (repeat colourways side by side) }]. heightOf(p) → display height (m).
 * 1. every product gets a home: the first fixture that wants it, has room and a unit it fits (else any with room);
 * 2. each fixture shows its homes' colourway 0, then more colourways round-robin while units remain;
 * 3. units left over show repeats: runs of consecutive colourways of the least-shown fill product.
 * Returns [{ unit, product, ci }] — every product at least once while the units allow (104 for 29 shoes today).
 */
export function merchandise(products, fixtures, heightOf) {
  const fits = (p, u) => heightOf(p) + 0.006 <= u.maxH;
  const nCol = (p) => Math.max(1, (p.colours || []).length);
  const shown = new Map(products.map(p => [p, 0]));
  const homes = fixtures.map(() => []);
  const room = (k, p) => homes[k].length < fixtures[k].units.filter(u => fits(p, u)).length;
  for (const p of products) {
    let k = fixtures.findIndex((f, i) => f.home(p) && room(i, p));
    if (k < 0) k = fixtures.findIndex((f, i) => room(i, p));
    if (k >= 0) homes[k].push(p);
  }
  const plan = fixtures.map((f, k) => {
    const home = homes[k], take = new Map(home.map(p => [p, 1]));
    let spare = f.units.length - home.length;
    for (let ci = 1; !f.vary && spare > 0; ci++) {
      const row = home.filter(p => ci < nCol(p)); if (!row.length) break;
      for (const p of row) if (spare > 0) { take.set(p, ci + 1); spare--; }
    }
    const entries = [];
    if (f.group) for (const p of home) for (let ci = 0; ci < take.get(p); ci++) entries.push([p, ci]);
    else for (let ci = 0; ; ci++) { const row = home.filter(p => ci < take.get(p)); if (!row.length) break; for (const p of row) entries.push([p, ci]); }
    for (const [p] of entries) shown.set(p, shown.get(p) + 1);
    return entries;
  });
  const out = [];
  fixtures.forEach((f, k) => {
    const entries = plan[k], here = new Set(homes[k]);
    let run = null, left = 0, ci = 0;
    for (const u of f.units) {
      const i = entries.findIndex(([p]) => fits(p, u));
      if (i >= 0) { const [p, c] = entries.splice(i, 1)[0]; out.push({ unit: u, product: p, ci: c }); continue; }
      if (!(run && left > 0 && fits(run, u))) {
        let pool = products.filter(p => f.fill(p) && fits(p, u));
        if (f.vary) { const fresh = pool.filter(p => !here.has(p)); if (fresh.length) pool = fresh; }
        if (!pool.length) pool = products.filter(p => fits(p, u));
        if (!pool.length) continue;
        run = pool.reduce((a, b) => (shown.get(b) < shown.get(a) ? b : a));
        left = Math.min(f.run || 1, nCol(run)); ci = shown.get(run);
      }
      out.push({ unit: u, product: run, ci: ci % nCol(run) });
      shown.set(run, shown.get(run) + 1); ci++; left--; here.add(run);
    }
  });
  return out;
}

/** Printed colourways ('Floral print', 'Brown snake', …) → the atlas print patch, else null. */
export function printFor(colour) {
  const l = String((colour && colour.label) || '').toLowerCase();
  if (/snake|croc|python/.test(l)) return 'snake';
  if (/floral|flower|botanic/.test(l)) return 'floral';
  return null;
}

/** A product's colour → hex (the site's swatch). */
export function colourHex(p, i = 0) {
  const c = p && p.colours && p.colours.length ? p.colours[((i % p.colours.length) + p.colours.length) % p.colours.length] : null;
  return c && c.swatch ? c.swatch : '#2a2522';
}
