// footwear — the shoe salon's link to the Imaan's Shoes catalogue (ctx.catalog). NOTHING product-specific
// is hard-coded here: sections, 3-D styles and colours are derived from each product's tags / name, so a
// newer content file re-merchandises the wall by itself.
//   sections   Sneakers · Boots · Heels · Flats · Sandals (website shoe tags) → niches of the wall
//   styleFor   product → procedural style key (lasts.js STYLES) or 'sneaker' (the GLB)
//   colourHex  product colour → THREE-ready hex (swatches straight from the site)

export const SECTION_ORDER = ['boots', 'heels', 'sneakers', 'flats', 'sandals'];
export const SECTION_LABEL = { sneakers: 'Sneakers', boots: 'Boots', heels: 'Heels', flats: 'Flats', sandals: 'Sandals' };

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
 * Wall plan: which section each of the `n` niches shows (largest-remainder allocation by product count,
 * at least one niche per section, in SECTION_ORDER so sneakers land in the middle behind the stage).
 * Returns { niches: [{section, products:[…]}], sections: {id: [products]} }.
 */
export function wallSections(catalog, n = 7) {
  const shoes = shoeProducts(catalog);
  const by = {};
  for (const p of shoes) (by[sectionOf(p)] = by[sectionOf(p)] || []).push(p);
  let ids = SECTION_ORDER.filter(s => by[s] && by[s].length);
  if (!ids.length) return { niches: [], sections: by };
  if (ids.length > n) ids = ids.slice(0, n);
  const total = ids.reduce((a, s) => a + by[s].length, 0);
  const share = ids.map(s => Math.max(1, (by[s].length / total) * n));
  const alloc = share.map(Math.floor);
  let left = n - alloc.reduce((a, b) => a + b, 0);
  const order = ids.map((_, i) => i).sort((a, b) => (share[b] - alloc[b]) - (share[a] - alloc[a]));
  for (let k = 0; left > 0; k++) { alloc[order[k % order.length]]++; left--; }
  while (alloc.reduce((a, b) => a + b, 0) > n) { const i = alloc.indexOf(Math.max(...alloc)); alloc[i]--; }
  const niches = [];
  ids.forEach((s, i) => {
    const list = by[s];
    for (let k = 0; k < alloc[i]; k++) {
      // split a section's products across its niches (interleaved so each niche mixes styles)
      const mine = list.filter((_, j) => j % alloc[i] === k);
      niches.push({ section: s, products: mine.length ? mine : list, all: list });
    }
  });
  return { niches, sections: by };
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

/** "EU 36–41" from the catalogue's shoe size guide (or the products' own sizes). */
export function shoeSizeRange(catalog) {
  const g = (catalog.sizeGuides || []).find(s => /shoe/i.test(s.name || s.id || ''));
  const sizes = g ? g.sizes : [...new Set(shoeProducts(catalog).flatMap(p => p.sizes.map(s => s.label)))];
  if (!sizes.length) return '';
  return 'EU ' + sizes[0] + (sizes.length > 1 ? '–' + sizes[sizes.length - 1] : '');
}
