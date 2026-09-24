// fixtures — catalogue glue. Every accessory the fixtures display (counter top, display step 2, the three upper
// shelves of the folded unit) is a real Imaan's product from ctx.catalog.byCategory('accessories'); the 3-D item
// is chosen from the product's own name / tags (kindOf), coloured from its colour swatches, and the card's
// colourways recolour it. planAccessories() guarantees every accessory a slot before any slot shows a repeat.
import * as THREE from 'three';

/** Stable colour index for a display key (so repeats of a product show its other colours). */
function colourIndex(p, i = 0) { return p && p.colours.length ? ((i % p.colours.length) + p.colours.length) % p.colours.length : 0; }
/** Swatch of a product colour (sRGB hex), with a neutral fallback. */
export function swatch(p, i = 0, fallback = '#8a7a64') { return (p && p.colours[colourIndex(p, i)] && p.colours[colourIndex(p, i)].swatch) || fallback; }

/**
 * Card info for a product display. opts.recolor(swatchHex, colour, index) repaints the 3-D item; opts.at
 * (Vector3 or [x,y,z]) is where the colour-change sparkle bursts.
 */
export function productCard(F, p, { recolor, at, subtitle, tag, actions, onTap } = {}) {
  const { ctx } = F;
  if (!p) return { title: ctx.brand.name, subtitle: ctx.brand.tagline };
  const where = at ? (at.isVector3 ? at : new THREE.Vector3().fromArray(at)) : null;
  const colorways = p.colours.map((c, i) => ({
    apply: () => {
      if (recolor) recolor(c.swatch, c, i);
      if (where) ctx.fx.burst(where.clone(), { color: c.swatch, count: 18 });
    },
  }));
  return ctx.catalog.card(p, { colorways, subtitle, tag, actions, onTap });
}

// ------------------------------------------------------------------------------------------ accessory kinds
// First rule matching the product NAME wins; the tags are only tried when the name matches nothing.
const KIND_RULES = [
  ['sunglasses', /sunglass/], ['hoops', /hoop/], ['drops', /\bdrop/], ['studs', /stud|earring/],
  ['beads', /beaded.*necklace|statement/], ['layered', /necklace|pendant|chain/], ['bracelet', /bracelet|bangle/],
  ['pocket', /pocket square/], ['scarf', /scarf|scarves/], ['cardholder', /card ?holder|wallet/], ['coinpurse', /purse|coin/],
  ['beltWoven', /woven.*belt|fabric belt/], ['belt', /belt/], ['keyring', /keyring|charm/], ['gloves', /glove/],
  ['sunhat', /sun hat/], ['beanie', /beanie/], ['bucket', /\bhats?\b/], ['socks', /sock/], ['umbrella', /umbrella/],
  ['backpack', /backpack/], ['weekend', /weekend|travel bag|duffel|holdall/], ['clutch', /clutch/], ['pouch', /phone|pouch/],
  ['crossbody', /crossbody|shoulder/], ['raffia', /raffia|straw|basket/], ['tote', /tote|bags?\b|handbag/],
];
/** The 3-D item kind for an accessory product (see items.js GEN). */
export function kindOf(p) {
  const name = String((p && p.name) || '').toLowerCase(), tags = ((p && p.tags) || []).join(' ').toLowerCase();
  for (const src of [name, tags]) for (const [k, re] of KIND_RULES) if (re.test(src)) return k;
  return 'cardholder';
}
// Which slot classes each kind fits: 'counter' (counter top, small), 'bag' (display step), 'shelf' (shelves 2-3,
// ≈ 0.4 m clear), 'top' (shelf 4, ≈ 0.16 m clear).
const SMALL = ['counter', 'shelf', 'top'];
const FITS = {
  sunglasses: SMALL, hoops: ['counter', 'shelf'], drops: SMALL, studs: SMALL, beads: SMALL, layered: ['counter', 'shelf'],
  bracelet: SMALL, pocket: SMALL, scarf: SMALL, cardholder: SMALL, coinpurse: SMALL, beltWoven: SMALL, belt: SMALL,
  keyring: SMALL, gloves: SMALL, socks: SMALL, umbrella: SMALL, clutch: ['counter', 'bag', 'shelf', 'top'],
  pouch: ['counter', 'bag', 'shelf', 'top'], beanie: ['bag', 'shelf', 'top'], sunhat: ['bag', 'shelf'], bucket: ['bag', 'shelf'],
  crossbody: ['bag', 'shelf'], tote: ['bag', 'shelf'], raffia: ['bag', 'shelf'], backpack: ['bag', 'shelf'], weekend: ['bag'],
};
export const fits = (kind, cls) => (FITS[kind] || SMALL).includes(cls);

/**
 * Assign accessories to display slots so EVERY product shows at least once before any slot shows a repeat.
 * slots: [{ pref: kind, cls }] in priority order. Returns { items: [{ p, kind, ci } | null], unplaced: [p] };
 * ci = colour index (0 for a product's first appearance, then its next colourways).
 */
export function planAccessories(products, slots) {
  const kinds = new Map(products.map(p => [p, kindOf(p)]));
  const used = new Map();
  const take = (p) => { const n = used.get(p) || 0; used.set(p, n + 1); return { p, kind: kinds.get(p), ci: n }; };
  const items = slots.map(() => null);
  // 1 · the product the slot was designed for (its kind), first appearance only
  slots.forEach((s, i) => { const p = products.find(q => !used.has(q) && kinds.get(q) === s.pref); if (p) items[i] = take(p); });
  // 2 · any product not shown yet that fits the slot (catalogue additions land here before repeats do)
  slots.forEach((s, i) => { if (items[i]) return; const p = products.find(q => !used.has(q) && fits(kinds.get(q), s.cls)); if (p) items[i] = take(p); });
  // 3 · repeats in the next colourway: the slot's own kind first, else the least-shown product that fits
  slots.forEach((s, i) => {
    if (items[i]) return;
    let pool = products.filter(q => kinds.get(q) === s.pref);
    if (!pool.length) pool = products.filter(q => fits(kinds.get(q), s.cls));
    if (!pool.length) return;
    pool.sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0));
    items[i] = take(pool[0]);
  });
  return { items, unplaced: products.filter(p => !used.has(p)) };
}
