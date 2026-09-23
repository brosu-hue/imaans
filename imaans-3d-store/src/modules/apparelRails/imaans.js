// IMAANS glue shared by the two clothing modules (apparelRails + apparelDisplay).
//
//  • Catalogue → store: every 3-D garment / stack / box / look maps to a real product of ctx.catalog.
//    lineOf(p) picks the hanging silhouette, familyOf(p) the merchandising group (from the product's own
//    tags: the first tag is the product type on the Imaan's site), buildGroups() derives the store's
//    groupings (bay names, rail edits) from the catalogue, so new content re-merchandises the store.
//  • productCard(): catalog.card + colourways that recolour the 3-D item (current colour listed first).
//  • Canvas type helpers in the IMAANS style (spaced serif caps, crown, black + gold).
//  • The shared, program-cheap materials both modules use (see CONTRACT: shader-program budget):
//      printMaterial   MeshStandard map + roughness/metalness mask + alphaTest, instanced (labels, tags,
//                      hooks, hangers, branded boxes, printed signs) — ONE program for both modules
//      ledMaterial     MeshBasic + map, opaque — the same program as architecture's glow lenses
//      glowMaterial    MeshBasic + map, additive — the same program as architecture's halos
//      ShadowQuads     contact shadows: MeshBasic + map (opacity levels baked into a 4×2 atlas) —
//                      shares architecture's additive program (blending is not a program parameter)
import * as THREE from 'three';
import { drawCrown, goldGradient } from '../../core/catalog.js';

export const IM = { black: '#141414', ink: '#0b0b0c', gold: '#b08d57', goldHi: '#e6c170', ivory: '#faf7f2', border: '#e8e3da',
  // print mask (G = roughness, B = metalness): gold foil is part metal so it still reads gold where no
  // light hits it (a fully metallic letter only mirrors the — often dark — surroundings)
  foil: 'rgb(0,95,165)', matte: 'rgb(0,150,0)' };

// ---------------------------------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------------------------------
const _c = new THREE.Color(), _d = new THREE.Color();
/** Perceived lightness 0..1 of an sRGB hex. */
export function lum(hex) { _c.set(hex || '#888888'); return 0.3 * _c.r + 0.59 * _c.g + 0.11 * _c.b; }
/** Squared sRGB distance. */
const _a = {}, _b = {};
export function colourDist(a, b) {
  _c.set(a || '#888').getRGB(_a, THREE.SRGBColorSpace); _d.set(b || '#888').getRGB(_b, THREE.SRGBColorSpace);
  return (_a.r - _b.r) ** 2 + (_a.g - _b.g) ** 2 + (_a.b - _b.b) ** 2;
}
/** Index of the product colour closest to `hex`. */
export function nearestColour(p, hex) {
  let best = 0, bd = Infinity;
  (p.colours || []).forEach((c, i) => { const d = colourDist(c.swatch, hex); if (d < bd) { bd = d; best = i; } });
  return best;
}
/** Product colour indices ordered light → dark (a retail colour gradient). */
export function lightToDark(p) { return (p.colours || []).map((c, i) => i).sort((a, b) => lum(p.colours[b].swatch) - lum(p.colours[a].swatch)); }
export function swatchOf(p, i = 0, fb = '#8a8378') { const c = p && p.colours && p.colours.length ? p.colours[((i % p.colours.length) + p.colours.length) % p.colours.length] : null; return (c && c.swatch) || fb; }
/** Denim / black swatches read too dark as a flat albedo under warm light — lift them a touch. */
export function albedo(hex) { _c.set(hex); const l = 0.3 * _c.r + 0.59 * _c.g + 0.11 * _c.b; if (l < 0.03) _c.lerp(_d.set('#2a2a2c'), 0.35); return '#' + _c.getHexString(); }

// ---------------------------------------------------------------------------------------------------
// product → hanging silhouette (a line of apparelRails.LINES)
// ---------------------------------------------------------------------------------------------------
const words = p => { const t = new Set(p.tags || []); for (const w of String(p.name || '').toLowerCase().split(/[\s-]+/)) t.add(w); return t; };
/** Hanging silhouette for a clothing product, or null when it is only shown folded (e.g. shorts). */
export function lineOf(p) {
  const W = words(p), has = (...a) => a.some(w => W.has(w));
  if (has('jeans', 'jean')) return 'jeans';
  if (has('shorts')) return null;
  if (has('camisole', 'cami', 'vest')) return 'camisole';
  if (has('dresses', 'dress', 'jumpsuit')) return has('slip', 'satin', 'maxi', 'silk') ? 'slip' : 'midi';
  if (has('skirts', 'skirt')) return has('mini', 'a-line', 'corduroy') ? 'mini' : 'skirt';
  if (has('trousers', 'trouser', 'chino', 'chinos', 'pants')) return 'trouser';
  if (has('coats', 'coat', 'overcoat', 'outerwear', 'trench')) return 'coat';
  if (has('quilted', 'puffer', 'padded', 'gilet')) return 'puffer';
  if (has('blazers', 'blazer', 'waistcoats', 'waistcoat', 'suits')) return 'blazer';
  if (has('cable')) return 'cable';
  if (has('knitwear', 'jumpers', 'jumper', 'cardigans', 'cardigan', 'breton', 'sweater')) return 'knit';
  return 'shirt';   // shirts, blouses, tops, shirt-jackets, anything new
}
/** Can it be shown folded on a shelf / table? */
export function foldable(p) { const l = lineOf(p); return l === null || ['knit', 'cable', 'shirt', 'camisole', 'jeans', 'trouser', 'mini'].includes(l); }

// ---------------------------------------------------------------------------------------------------
// merchandising groups — derived from the catalogue's own tags
// ---------------------------------------------------------------------------------------------------
// Families join a product's TYPE tag (its first tag on the site) with its synonyms; the label shown in
// the store is built from the tags actually present in the data ('shirts' + 'blouses' → "Shirts &
// Blouses"). A type tag no rule knows becomes its own family (label = the tag), so new content just works.
const FAMILY = [
  { key: 'dresses', tags: ['dresses', 'dress', 'jumpsuits'] },
  { key: 'knitwear', tags: ['knitwear', 'jumpers', 'cardigans', 'sweaters'] },
  { key: 'shirts', tags: ['shirts', 'blouses'], join: true },
  { key: 'tops', tags: ['tops', 't-shirts', 'tees', 'camisoles'] },
  { key: 'skirts', tags: ['skirts'] },
  { key: 'trousers', tags: ['trousers', 'shorts', 'chinos'], join: true },
  { key: 'denim', tags: ['denim', 'jeans'] },
  { key: 'tailoring', tags: ['tailoring', 'blazers', 'waistcoats', 'suits'] },
  { key: 'outerwear', tags: ['coats', 'jackets', 'outerwear'], join: true },
  { key: 'coord', tags: ['co-ord', 'co-ords', 'sets'] },
];
const title = s => String(s || '').replace(/(^|[\s/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export function familyOf(p) {
  const t0 = (p.tags || [])[0] || 'clothes';
  return FAMILY.find(f => f.tags.includes(t0)) || FAMILY.find(f => (p.tags || []).some(t => f.tags.includes(t))) || { key: t0, tags: [t0] };
}
function familyLabel(f, products) {
  if (f.join) {
    const present = f.tags.filter(t => products.some(p => (p.tags || [])[0] === t));
    if (present.length) return present.slice(0, 2).map(title).join(' & ');
  }
  const any = f.tags.find(t => products.some(p => (p.tags || []).includes(t)));
  return title(any || f.tags[0]);
}

/**
 * The store's clothing groupings, derived from the catalogue:
 *  families — by product type, biggest first: [{key, label, products}]
 *  edits    — secondary tags shared by ≥ 3 clothes (the promo's words first, e.g. 'linens' → Linen)
 *  group(words, label) — every clothing product whose tags / name contain one of the words
 */
export function buildGroups(catalog, brand) {
  const clothes = catalog.byCategory('clothes');
  const fam = new Map();
  for (const p of clothes) {
    const f = familyOf(p);
    if (!fam.has(f.key)) fam.set(f.key, { key: f.key, rule: f, products: [] });
    fam.get(f.key).products.push(p);
  }
  const families = [...fam.values()].map(f => ({ key: f.key, label: familyLabel(f.rule, f.products), products: f.products }))
    .sort((a, b) => b.products.length - a.products.length);
  // edits: secondary tags that are not a family's type tag
  const typeTags = new Set(FAMILY.flatMap(f => f.tags).concat(families.map(f => f.key)));
  const count = new Map();
  for (const p of clothes) for (const t of (p.tags || []).slice(1)) if (!typeTags.has(t)) count.set(t, (count.get(t) || 0) + 1);
  const promo = springPromo(brand);
  const stems = String(promo ? [promo.name, promo.headline, promo.sub].join(' ') : '').toLowerCase().split(/[^\p{L}-]+/u)
    .filter(w => w.length >= 4).map(w => w.replace(/(ings|ing|s)$/, ''));
  const promoPos = t => { const i = stems.findIndex(s => s.length >= 4 && (t.startsWith(s) || s.startsWith(t))); return i < 0 ? 1e3 : i; };
  const inPromo = t => promoPos(t) < 1e3;
  const edits = [...count.entries()].filter(([, n]) => n >= 3)
    .sort((a, b) => (promoPos(a[0]) - promoPos(b[0])) || (b[1] - a[1]))
    .map(([t]) => group([t], title(t)));
  function group(ws, label) {
    const has = p => { const W = words(p); return ws.some(w => W.has(w)); };
    return { key: 'tag:' + ws[0], label: label || title(ws[0]), products: clothes.filter(has), promo: ws.some(inPromo) };
  }
  return { clothes, families, edits, group, promo };
}

// ---------------------------------------------------------------------------------------------------
// brand copy (all from ctx.brand)
// ---------------------------------------------------------------------------------------------------
/** The seasonal promo (the one with a headline, e.g. "The Spring Edit has landed"). */
export function springPromo(brand) {
  const ps = (brand && brand.promos) || [];
  return ps.find(p => p.headline && /edit|season|new/i.test(p.name + ' ' + p.headline)) || ps.find(p => p.headline) || ps[0] || null;
}
/** {title:'The Spring Edit', rest:'has landed', sub} from the promo headline/name. */
export function promoCopy(brand) {
  const p = springPromo(brand);
  if (!p) return { title: (brand && brand.name) || 'IMAANS', rest: '', sub: (brand && brand.slogan) || '' };
  const name = String(p.name || '').trim(), head = String(p.headline || '').trim();
  let t = name, rest = '';
  const i = name ? head.toLowerCase().indexOf(name.toLowerCase()) : -1;
  if (i >= 0) { t = head.slice(0, i + name.length).trim(); rest = head.slice(i + name.length).trim(); }
  else if (head) { t = head; }
  return { title: t || name || head, rest, sub: String(p.sub || '').trim(), name };
}
/** A promo that names a department, e.g. "Clothes — Quality you can feel" → "Quality you can feel". */
export function deptLine(brand, dept) {
  const ps = (brand && brand.promos) || [];
  const p = ps.find(q => new RegExp('^\\s*' + dept, 'i').test(q.name || ''));
  if (!p) return '';
  const parts = String(p.name).split(/\s+[—–-]\s+/);
  return (parts[1] || p.headline || '').trim();
}

// ---------------------------------------------------------------------------------------------------
// catalogue helpers
// ---------------------------------------------------------------------------------------------------
export function firstInStockSize(p) { return (p.sizes || []).find(s => s.inStock) || null; }
export function hasStock(p) { return !!(p && p.inStock !== false && firstInStockSize(p)); }
/** Size labels across products, in first-seen order (XS, S, M…). */
export function sizeLabels(products) { const out = []; for (const p of products) for (const s of p.sizes || []) if (!out.includes(s.label)) out.push(s.label); return out; }
/** "R 649.00" — the lowest current price of a set of products. */
export function fromPrice(catalog, products) {
  const ps = products.filter(Boolean); if (!ps.length) return '';
  return catalog.formatPrice(Math.min(...ps.map(p => catalog.priceOf(p))));
}
/**
 * A product of `kind` for a 3-D item: ranked by the `prefer` words (tags / name), in stock first,
 * avoiding `used` products when an unused good match exists. Stable (no randomness).
 */
export function pickLike(catalog, kind, { prefer = [], used = null, needStock = true, filter = null } = {}) {
  let pool = catalog.all(kind);
  if (filter) { const f = pool.filter(filter); if (f.length) pool = f; }
  const W = pool.map(words);
  const score = i => { const k = prefer.findIndex(w => W[i].has(w)); return (k < 0 ? 50 : k) + (needStock && !hasStock(pool[i]) ? 100 : 0); };
  const order = pool.map((p, i) => i).sort((a, b) => score(a) - score(b) || a - b);
  const pick = order.find(i => !used || !used.has(pool[i].id));
  const p = pool[pick !== undefined ? pick : order[0]] || null;
  if (p && used) used.add(p.id);
  return p;
}

/**
 * Card for a product shown by a 3-D item. `current` = the colour index (or swatch hex) the item shows now;
 * colourways are listed from it (the card's selected swatch is the item's colour). recolor(hex, i) repaints
 * the item; `at` (Vector3) gets a colour sparkle.
 */
export function productCard(ctx, p, { current = 0, recolor, at, tag, subtitle, actions, onTap } = {}) {
  if (!p) return null;
  const n = (p.colours || []).length;
  let ci = typeof current === 'string' ? (p.colours || []).findIndex(c => (c.swatch || '').toLowerCase() === current.toLowerCase()) : current;
  if (!(ci >= 0)) ci = 0;
  const hooks = (p.colours || []).map((c, i) => ({
    apply: () => { if (recolor) recolor(c.swatch, i); if (at) ctx.fx.burst(at.clone ? at.clone() : new THREE.Vector3(...at), { color: c.swatch, count: 20 }); },
  }));
  const info = ctx.catalog.card(p, { colorways: hooks, subtitle, tag, actions, onTap });
  if (n > 1 && ci > 0) info.colorways = info.colorways.slice(ci).concat(info.colorways.slice(0, ci));
  return info;
}

// ---------------------------------------------------------------------------------------------------
// canvas type in the IMAANS style
// ---------------------------------------------------------------------------------------------------
export function fontsOf(ctx) { return (ctx && ctx.fonts) || { display: 'Georgia, "Times New Roman", serif', sans: 'system-ui, sans-serif' }; }
/** Letter-spaced text (track in px). Returns the drawn width. */
export function spaced(g, txt, cx, base, font, track, fill, align = 'center') {
  g.font = font; g.fillStyle = fill; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const ch = [...String(txt)], ws = ch.map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + track * Math.max(0, ch.length - 1);
  let x = align === 'center' ? cx - total / 2 : align === 'right' ? cx - total : cx;
  ch.forEach((c, i) => { g.fillText(c, x, base); x += ws[i] + track; });
  return total;
}
/** Largest caps font (≤ maxPx) whose spaced width fits maxW. trackEm = tracking as a fraction of the size. */
export function fitSpaced(g, txt, family, weight, maxW, maxPx, trackEm = 0.18) {
  let px = maxPx;
  for (let k = 0; k < 24; k++) {
    g.font = `${weight} ${px}px ${family}`;
    const ch = [...String(txt)]; const w = ch.reduce((a, c) => a + g.measureText(c).width, 0) + px * trackEm * Math.max(0, ch.length - 1);
    if (w <= maxW) break;
    px *= Math.max(0.6, Math.min(0.97, maxW / w));
  }
  return { font: `${weight} ${px}px ${family}`, px, track: px * trackEm };
}
/** Word-wrap `txt` into ≤ maxLines lines of ≤ maxW px (current font). */
export function wrapLines(g, txt, maxW, maxLines = 3) {
  const ws = String(txt || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of ws) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break; } else cur = t;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  else if (lines.length === maxLines && ws.join(' ') !== lines.join(' ')) lines[maxLines - 1] = lines[maxLines - 1].replace(/[,.;:]?\s*\S*$/, '…');
  return lines;
}
export { drawCrown, goldGradient };

/**
 * A brand plaque: black ground, gold keyline, gold spaced serif caps (+ optional crown). `mask` = the
 * roughness(G)/metalness(B) canvas painted in step (gold = foil).
 */
export function paintPlaque(g, m, fonts, [x, y, w, h], text, { crown = false, sub = '', ground = IM.black, keyline = true } = {}) {
  g.fillStyle = ground; g.fillRect(x, y, w, h);
  if (m) { m.fillStyle = 'rgb(0,150,0)'; m.fillRect(x, y, w, h); }
  const gold = goldGradient(g, y + h * 0.1, y + h * 0.9);
  const both = fn => { fn(g, gold); if (m) fn(m, IM.foil); };
  const ins = Math.max(3, h * 0.09);
  if (keyline) both((c, f) => { c.strokeStyle = f; c.lineWidth = Math.max(1.2, h * 0.025); c.strokeRect(x + ins, y + ins, w - 2 * ins, h - 2 * ins); });
  const inner = w - 2 * ins - h * 0.5;
  const cap = sub ? h * 0.36 : h * 0.44;
  const f = fitSpaced(g, text.toUpperCase(), fonts.display, 500, inner, cap, 0.2);
  const base = sub ? y + h * 0.56 : y + h * 0.5 + f.px * 0.36 + (crown ? h * 0.1 : 0);
  if (crown) { const cw = h * 0.3; both((c, fill) => drawCrown(c, x + w / 2, base - f.px * 0.72 - cw * 0.55, cw, fill)); }
  both((c, fill) => spaced(c, text.toUpperCase(), x + w / 2, base, f.font, f.track, fill));
  if (sub) {
    const s = fitSpaced(g, sub.toUpperCase(), fonts.sans, 500, inner, h * 0.15, 0.28);
    both((c, fill) => spaced(c, sub.toUpperCase(), x + w / 2, y + h * 0.8, s.font, s.track, fill));
  }
}

/** IMAANS hat-box print (lathe UV v: 0 bottom centre → 0.34 side bottom → 0.74 lid → 0.86 lid top edge → 1 centre). */
export function paintBox(g, m, fonts, [x, y, w, h], { ground = IM.black, band = '#1d1d1f', ink = null } = {}) {
  const Y = v => y + h * (1 - v);
  g.fillStyle = ground; g.fillRect(x, y, w, h);
  g.fillStyle = band; g.fillRect(x, Y(0.86), w, Y(0.74) - Y(0.86));
  if (m) { m.fillStyle = 'rgb(0,160,0)'; m.fillRect(x, y, w, h); }
  const gold = ink || goldGradient(g, Y(0.72), Y(0.4));
  const both = fn => { fn(g, gold); if (m) fn(m, IM.foil); };
  both((c, f) => { c.fillStyle = f; c.fillRect(x, Y(0.745) - 1, w, 2); c.fillRect(x, Y(0.36), w, 1.5); });
  // two crowns + wordmark around the drum
  for (const u of [0.25, 0.75]) {
    const cx = x + w * u, cs = Math.min(w * 0.12, (Y(0.4) - Y(0.72)) * 0.55);
    both((c, f) => drawCrown(c, cx, Y(0.62), cs, f));
    const f = fitSpaced(g, 'IMAANS', fonts.display, 500, w * 0.3, (Y(0.4) - Y(0.72)) * 0.2, 0.25);
    both((c, fill) => spaced(c, 'IMAANS', cx, Y(0.47), f.font, f.track, fill));
  }
}

/** Lathe hat box, unit radius / height (instance scale = [r, h, r]) with UVs into atlas rect [u0,v0,u1,v1]. */
export function brandBoxGeo(rect, seg = 24) {
  const [u0, v0, u1, v1] = rect;
  const prof = [[0, 0, 0], [0.97, 0, 0.3], [0.97, 0.01, 0.34], [0.97, 0.8, 0.72], [0.985, 0.8, 0.74], [1.0, 0.815, 0.745], [1.0, 0.985, 0.85], [0.985, 1.0, 0.86], [0, 1.0, 1.0]];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const [r, yy, v] of prof) { pos.push(c * r, yy, -s * r); uv.push(u0 + (u1 - u0) * (i / seg), v0 + (v1 - v0) * v); }
  }
  const n = prof.length;
  for (let i = 0; i < seg; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + n;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // outward winding check (signed volume)
  let vol = 0; const P = g.attributes.position.array, I = g.index.array;
  for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); }
  if (vol < 0) { for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } g.computeVertexNormals(); }
  return g;
}

// ---------------------------------------------------------------------------------------------------
// shared materials
// ---------------------------------------------------------------------------------------------------
/**
 * Low tier: ONE fabric look for every garment / figure fabric (the library's low-tier fabrics split into
 * three programs — with / without normal map, with / without the rim term — by kind). Use with
 * mats.fabric(kind, colour, { flat: true }) and as the material's onBeforeCompile: a cheap view-dependent
 * rim so cloth never reads as matte plastic on an iPhone 8. Strength per material in userData.fabricRim.
 */
export function rimPatch(shader) {
  shader.uniforms.fabricRim = { value: this.userData.fabricRim || 0.62 };
  shader.fragmentShader = 'uniform float fabricRim;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', [
    'float fabricFres = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );',
    'outgoingLight *= 1.0 + fabricRim * fabricFres * fabricFres * fabricFres;',
    '#include <opaque_fragment>',
  ].join('\n'));
}
/** The print program: map + roughness(G)/metalness(B) mask + alphaTest, double-sided. Use on InstancedMeshes. */
export function printMaterial(map, mask, name) {
  const m = new THREE.MeshStandardMaterial({ map, roughnessMap: mask, metalnessMap: mask, roughness: 1, metalness: 1, alphaTest: 0.5, side: THREE.DoubleSide });
  m.name = name || 'imaans:print';
  return m;
}
/** A single-instance InstancedMesh (so one-off prints share the instanced print program). */
export function one(geo, material, name) {
  const m = new THREE.InstancedMesh(geo, material, 1);
  m.setMatrixAt(0, new THREE.Matrix4()); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  m.name = name || material.name; return m;
}
let _white = null;
function white() {
  if (!_white) { _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); _white.colorSpace = THREE.SRGBColorSpace; _white.needsUpdate = true; }
  return _white;
}
const _led = new Map();
/** LED strip / lit edge: basic + map, opaque (architecture's glow-lens program). Tone-mapped. */
export function ledMaterial(color = '#ffd6a0', intensity = 2.4) {
  const k = color + ':' + intensity;
  if (!_led.has(k)) { const m = new THREE.MeshBasicMaterial({ map: white(), color: new THREE.Color(color).multiplyScalar(intensity) }); m.name = 'imaans:led'; _led.set(k, m); }
  return _led.get(k);
}
/** Additive light sheet (architecture's halo program). */
export function glowMaterial(map, color = '#ffc98f', k = 0.55, name = 'imaans:glow') {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  m.name = name; return m;
}

// contact shadows: 4 × 2 radial blobs with different peak opacities (no vertex colours → shared program)
const LEVELS = [0.22, 0.3, 0.36, 0.42, 0.48, 0.55, 0.62, 0.7];
let _shadowTex = null;
function shadowAtlas() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  LEVELS.forEach((a, i) => {
    const cx = (i % 4) * 128 + 64, cy = Math.floor(i / 4) * 128 + 64;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 62);
    grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(0.45, `rgba(0,0,0,${a * 0.55})`);
    grd.addColorStop(0.75, `rgba(0,0,0,${a * 0.18})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(cx - 64, cy - 64, 128, 128);
  });
  _shadowTex = new THREE.CanvasTexture(c); _shadowTex.colorSpace = THREE.NoColorSpace;
  return _shadowTex;
}
let _shadowMat = null;
export function shadowMaterial() {
  if (!_shadowMat) {
    _shadowMat = new THREE.MeshBasicMaterial({ map: shadowAtlas(), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    _shadowMat.name = 'imaans:contactShadow';
  }
  return _shadowMat;
}
/** Every contact shadow of a module in one draw call. add() = floor/shelf blob, addWall() = on a wall facing +x. */
export class ShadowQuads {
  constructor() { this.q = []; }
  /** Soft blob on a horizontal surface at (x, y, z), w (x) × d (z), opacity, rotY. */
  add(x, y, z, w, d, opacity = 0.5, rotY = 0) { this.q.push({ x, y, z, w, d, o: opacity, r: rotY, v: false }); return this; }
  /** Soft blob on a wall plane x = const facing +x: h tall (y), d wide (z). */
  addWall(x, y, z, h, d, opacity = 0.4) { this.q.push({ x, y, z, w: h, d, o: opacity, r: 0, v: true }); return this; }
  build(parent, name = 'shadows') {
    if (!this.q.length) return null;
    const n = this.q.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = new Uint32Array(n * 6);
    this.q.forEach((s, i) => {
      let li = 0, bd = 9; LEVELS.forEach((a, k) => { const d = Math.abs(a - s.o); if (d < bd) { bd = d; li = k; } });
      const u0 = ((li % 4) * 128 + 1) / 512, u1 = ((li % 4) * 128 + 127) / 512, v1 = 1 - (Math.floor(li / 4) * 128 + 1) / 256, v0 = 1 - (Math.floor(li / 4) * 128 + 127) / 256;
      const c = Math.cos(s.r), sn = Math.sin(s.r);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], k) => {
        const lx = a * s.w / 2, lz = b * s.d / 2;
        if (s.v) pos.set([s.x, s.y + lx, s.z + lz], i * 12 + k * 3);
        else pos.set([s.x + lx * c + lz * sn, s.y, s.z - lx * sn + lz * c], i * 12 + k * 3);
        uv.set([a < 0 ? u0 : u1, b < 0 ? v0 : v1], i * 8 + k * 2);
      });
      // floor quads face +y, wall quads face +x
      if (s.v) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      else idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, shadowMaterial()); mesh.renderOrder = 1; mesh.name = name;
    mesh.castShadow = false; mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }
}
