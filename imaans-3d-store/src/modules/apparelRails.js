// Module: apparelRails — the clothing rails of IMAANS (the "Clothes" department, left side of the shop).
// Zones: leftWallBays (six joinery bays along the left wall), railR1 / railR2 (double floor rails),
// railRR (two-tier round rack) and railR3 (high single rail on the right). See CONTRACT.md.
//
// Merchandising is data: every garment is a real product of ctx.catalog, coloured from its own swatches;
// the bays and rails are the catalogue's clothing groupings (apparelRails/imaans.js buildGroups: product
// types from the site's tags → bay friezes; the promo's words → the floor-rail edits), so a newer content
// file re-merchandises the rails without code changes.
//
// Everything repeated is instanced: one InstancedMesh per garment silhouette (instance colour = the
// product colour), hooks / hangers / clip hangers / swing tags / plaques share ONE print material (atlas
// texels), folded stacks / bags / IMAANS hat boxes are product stacks with cards. Static joinery is merged
// by material. Garments carry a baked cavity term and a per-instance rail occlusion + drape in a shared
// shader patch (apparelRails/garmentShader.js), so a packed rail reads as packed without shadow maps.
//
// Look: black steel rails and brackets with brass flanges / finials, charcoal bay backs, charcoal-stained oak
// fluted pilasters, crown and cabinets (IMAANS black joinery), smoked-oak shelves, pale travertine cabinet
// tops and rail bases, gold-on-black IMAANS plaques.
//
// Interactions: tap a garment → its product card (name, price in Rand, sizes with sold-out, colours); it
// swings on its hook (neighbours get nudged) and sparkles; colourways recolour that garment.
import * as THREE from 'three';
import { makeGarment, makeHanger, makeFolded, HANGER } from './apparelRails/garments.js';
import { garmentMaterial, instAttr } from './apparelRails/garmentShader.js';
import { Batch, mat, board, tubeBetween, ball, disc, flutedPilaster, crownBeam, handbag, tote } from './apparelRails/joinery.js';
import { createSwing } from './apparelRails/swing.js';
import { makeAtlas, makeGlow } from './apparelRails/labels.js';
import { buildGroups, lineOf, foldable, lightToDark, swatchOf, productCard, sizeLabels, ShadowQuads, ledMaterial, glowMaterial,
  printMaterial, one, brandBoxGeo, albedo, fontsOf } from './apparelRails/imaans.js';
import { Stacks } from './apparelDisplay/stacks.js';

// Garment silhouettes: one InstancedMesh each. pitch = preferred spacing on a rail (m). Products are
// mapped to a line by imaans.lineOf (tags / name words).
export const LINES = {
  camisole: { type: 'dress', variant: 3, fabric: 'satin', pitch: 0.06, seed: 31 },
  shirt:    { type: 'shirt', variant: 0, fabric: 'cotton', pitch: 0.062, seed: 12 },
  knit:     { type: 'sweater', variant: 0, fabric: 'knit', pitch: 0.078, seed: 14 },
  cable:    { type: 'sweater', variant: 1, fabric: 'cable', pitch: 0.088, seed: 15 },
  blazer:   { type: 'blazer', variant: 0, fabric: 'wool', pitch: 0.088, seed: 17 },
  coat:     { type: 'coat', variant: 0, fabric: 'wool', pitch: 0.098, seed: 19 },
  puffer:   { type: 'puffer', variant: 0, fabric: 'puffer', pitch: 0.12, seed: 26 },
  slip:     { type: 'dress', variant: 2, fabric: 'satin', pitch: 0.066, seed: 21 },
  midi:     { type: 'dress', variant: 1, fabric: 'linen', pitch: 0.078, seed: 22 },
  skirt:    { type: 'skirt', variant: 0, fabric: 'satin', pitch: 0.066, seed: 23 },
  mini:     { type: 'skirt', variant: 1, fabric: 'canvas', pitch: 0.062, seed: 27 },
  jeans:    { type: 'trousers', variant: 0, fabric: 'denim', pitch: 0.074, seed: 24 },
  trouser:  { type: 'trousers', variant: 1, fabric: 'linen', pitch: 0.06, seed: 25 },
};
const SHOW_HANGER = new Set(['jeans', 'slip', 'camisole']);   // lines whose hanger body shows
const HANGER_BAR_Y = HANGER.barY;                               // trouser bar height in the garment frame (−0.265)

// ---------------------------------------------------------------------------------------------------
// Left-wall joinery dimensions (wall face x = −8)
// ---------------------------------------------------------------------------------------------------
const WX = -8, PANEL = 0.025, PIL_W = 0.24, PIL_D = 0.14, TOPY = 3.1, SHELF_Y = 2.3, SHELF_T = 0.04, SHELF_D = 0.355;
const RAIL_X = -7.605, PANEL_X = WX + PANEL;
const pilZ = k => -7.08 + k * 2.56;
const SHELF_RECIPES = [
  [['box', 0.2, 2], ['bag', 0.48], ['box', 0.76, 1], ['fold', 0.93, 3]],
  [['fold', 0.2, 5], ['fold', 0.45, 5], ['box', 0.75, 2]],
  [['bag', 0.18], ['box', 0.42, 2], ['tote', 0.66], ['bag', 0.88]],
  [['fold', 0.16, 5], ['fold', 0.4, 5], ['fold', 0.64, 4], ['box', 0.87, 1]],
  [['fold', 0.14, 6], ['fold', 0.36, 5], ['fold', 0.58, 6], ['fold', 0.8, 5]],
  [['fold', 0.16, 6], ['fold', 0.4, 6], ['fold', 0.64, 5], ['tote', 0.87]],
];
const CABINET_RECIPES = [
  [['fold', 0.24, 3], ['box', 0.62]],
  [['fold', 0.2, 4], ['fold', 0.45, 3], ['bag', 0.75]],
  [['box', 0.2], ['bag', 0.46]],
  [['fold', 0.3, 4], ['fold', 0.55, 3]],
  [['fold', 0.22, 3], ['fold', 0.5, 4], ['box', 0.78]],
  [['bag', 0.25], ['fold', 0.55, 4]],
];

// Floor rails
const R1 = { cx: -4.7, cz: -3.0, y: 1.72 };
const R2 = { cx: -4.7, cz: 0.9, y: 1.75 };
const RR = { cx: -4.7, cz: 4.7, upper: { r: 0.36, y: 1.98, n: 16 }, lower: { r: 0.56, y: 0.9, n: 10 } };
const R3 = { cx: 3.9, cz: -4.6, y: 1.9 };

export async function build(ctx) {
  const { mats, kit, q } = ctx;
  const root = ctx.group('apparelRails');
  const D = Math.max(0.4, q.density ?? 1);
  const R = kit.rng(20240917);
  const Y = new THREE.Vector3(0, 1, 0);
  const times = {}; let _t = performance.now(); const lap = k => { const n = performance.now(); times[k] = Math.round((times[k] || 0) + n - _t); _t = n; };

  // ---------------------------------------------------------------------------------------------
  // Merchandising plan (all from the catalogue)
  // ---------------------------------------------------------------------------------------------
  const G = buildGroups(ctx.catalog, ctx.brand);
  const hangs = g => g && g.products.some(p => lineOf(p));
  const usedG = new Set();
  const take = g => { if (!hangs(g) || usedG.has(g.key)) return null; usedG.add(g.key); return g; };
  const nextFamily = () => G.families.find(f => !usedG.has(f.key) && hangs(f));
  const nextEdit = () => G.edits.find(e => !usedG.has(e.key) && hangs(e));
  // the round rack: denim (jackets / skirts up top, jeans folded over the lower ring)
  const denimFam = G.families.find(f => f.key === 'denim');
  const denim = G.group(['denim', 'jeans'], denimFam ? denimFam.label : 'Denim');
  let RRg = denim.products.length >= 2 ? take(denim) : null;
  if (RRg && denimFam) usedG.add(denimFam.key);
  if (!RRg) RRg = take(nextFamily());
  // R2 (nearest the plinth): the season's edits (the promo's own words first), R1: the families left over
  const promoEdits = G.edits.filter(e => e.promo);
  const R2a = take(promoEdits[0]) || take(nextEdit()) || take(nextFamily());
  const R2b = take(promoEdits[1]) || take(nextEdit()) || take(nextFamily());
  const bayGroups = [];
  for (let i = 0; i < 6; i++) bayGroups.push(take(nextFamily()) || take(nextEdit()) || G.families[i % Math.max(1, G.families.length)]);
  const R1a = take(nextFamily()) || take(nextEdit()) || G.families[0];
  const R1b = take(nextFamily()) || take(nextEdit()) || G.families[1 % G.families.length];
  // R3 (single high rail by the lounge): the remaining edit with the most long pieces (dresses / coats)
  const longN = g => g.products.filter(p => ['slip', 'midi', 'coat'].includes(lineOf(p))).length;
  const R3g = take(G.edits.filter(e => !usedG.has(e.key) && hangs(e)).sort((a, b) => longN(b) - longN(a) || b.products.length - a.products.length)[0])
    || take(nextFamily()) || G.families[0];

  // ---------------------------------------------------------------------------------------------
  // Garment lines: geometry + material (built lazily, only for lines that get instances)
  // ---------------------------------------------------------------------------------------------
  const lines = {};
  function line(key) {
    if (lines[key]) return lines[key];
    const def = LINES[key];
    const t0 = performance.now();
    const { geometry, info } = makeGarment(def.type, { variant: def.variant, seed: def.seed });
    times.garmentGen = Math.round((times.garmentGen || 0) + performance.now() - t0);
    const material = garmentMaterial(mats, def.fabric, def.opts || {}, info.halfW, info.top - info.bottom, key, { low: ctx.tier === 'low' });
    return (lines[key] = { key, def, geometry, info, material, items: [] });
  }
  const dropOf = g => Math.max(0.5, ...g.products.filter(p => lineOf(p)).map(p => -line(lineOf(p)).info.bottom));

  // ---------------------------------------------------------------------------------------------
  // Records: one garment instance + everything riding on its hanger
  // ---------------------------------------------------------------------------------------------
  const records = [];
  /**
   * pos = hook point on the rail, yaw = rotation about y (0 → front faces +z), rail = [occ, openF, openB, sym].
   * face = face-out (less drape, no twist).
   */
  function garment(key, product, ci, pos, yaw, rail, { face = false, tag = false } = {}) {
    const L = line(key);
    const r = kit.rng(records.length * 977 + 31);
    const rec = {
      line: key, L, pos: new THREE.Vector3(...pos),
      quat: new THREE.Quaternion().setFromAxisAngle(Y, yaw + (face ? 0 : (r() - 0.5) * 0.08)),
      scl: new THREE.Vector3(0.97 + r() * 0.06, 0.97 + r() * 0.06, 0.88 + r() * 0.22),
      product, ci, color: albedo(swatchOf(product, ci)), rail,
      drape: face ? [(r() - 0.5) * 0.06, (r() - 0.5) * 0.012, (r() - 0.5) * 0.006] : [(r() - 0.5) * 0.24, (r() - 0.5) * 0.05, (r() - 0.5) * 0.024],
      links: [], run: null, runIdx: 0, tag,
    };
    L.items.push(rec); records.push(rec);
    return rec;
  }

  /** Colour-blocked sequence for a group: [line, product, colourIndex, n] — same style together, light → dark. */
  function seqFor(products, len, spread = 1) {
    const hang = products.filter(p => lineOf(p));
    const order = [];
    for (const p of hang) { const l = lineOf(p); if (!order.includes(l)) order.push(l); }
    let blocks = [];
    for (const l of order) for (const p of hang.filter(x => lineOf(x) === l)) for (const ci of lightToDark(p)) blocks.push([l, p, ci]);
    if (!blocks.length) return [];
    const avg = () => blocks.reduce((a, b) => a + LINES[b[0]].pitch, 0) / blocks.length * spread * Math.pow(1 / D, 0.5);
    // too many colour blocks for the rail: drop the darkest colours of the most-coloured products first
    while (blocks.length > 2 && blocks.length > 1.15 * len / avg()) {
      const cnt = new Map(); for (const b of blocks) cnt.set(b[1], (cnt.get(b[1]) || 0) + 1);
      const [p, n] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n < 2) break;
      const i = blocks.map(b => b[1]).lastIndexOf(p); blocks.splice(i, 1);
    }
    const n = Math.max(1, Math.min(4, Math.round(len / avg() / blocks.length)));
    return blocks.map(([l, p, ci]) => [l, p, ci, n]);
  }

  /** Lay a colour-blocked sequence along a straight rail. Returns the run (array of records). */
  function layRun(seq, { x, y, z0, z1, yaw = 0, rail = [1, 0, 0, 0], airy = 1, tagEvery = 5, fill = 0 }) {
    const items = [];
    for (const [key, p, ci, n] of seq) {
      const k = Math.max(1, Math.round(n * D + (R() - 0.5) * 0.6));
      for (let i = 0; i < k; i++) items.push([key, p, ci, i === 0]);
    }
    const spread = Math.pow(1 / D, 0.5) * airy;
    const pitches = items.map(([key], i) => LINES[key].pitch * spread * (0.86 + R() * 0.28) + (items[i][3] && i ? 0.018 : 0));
    let total = pitches.reduce((a, b) => a + b, 0) - pitches[0] * 0.5;
    const len = z1 - z0;
    // over-full: thin out the longest colour blocks (never a whole product)
    while (total > len && items.length > 2) {
      let bi = -1, bl = 1; for (let i = 1; i < items.length; i++) { let s = i; while (s > 0 && !items[s][3]) s--; let e = i; while (e + 1 < items.length && !items[e + 1][3]) e++; if (!items[i][3] && e - s + 1 > bl) { bl = e - s + 1; bi = i; } }
      if (bi < 0) bi = Math.floor(items.length / 2);
      items.splice(bi, 1); pitches.splice(bi, 1); total = pitches.reduce((a, b) => a + b, 0) - pitches[0] * 0.5;
    }
    // under-full (a small group on a long wall rail, thinned at low density): add one more of each colour
    // block in turn until the rail is ~fill full — a shop packs its bays, it never hangs lonely strips
    if (fill && items.length) {
      const cap = items.length * 2;
      for (let pass = 0; total < fill * len && items.length < cap && pass < 6; pass++) {
        const starts = []; items.forEach((it, i) => { if (it[3]) starts.push(i); });
        for (let b = starts.length - 1; b >= 0 && total < fill * len && items.length < cap; b--) {
          const at = b + 1 < starts.length ? starts[b + 1] : items.length, [key, p, ci] = items[at - 1];
          items.splice(at, 0, [key, p, ci, false]);
          pitches.splice(at, 0, LINES[key].pitch * spread * (0.86 + R() * 0.28));
          total = pitches.reduce((a, c) => a + c, 0) - pitches[0] * 0.5;
        }
      }
    }
    const scale = total > len ? len / total : 1;
    let z = z0 + (len - total * scale) / 2;
    const run = [];
    const fz = Math.cos(yaw) >= 0 ? 1 : -1;   // garment front along +z or −z
    items.forEach(([key, p, ci, first], i) => {
      if (i) z += pitches[i] * scale;
      const last = i === items.length - 1;
      const rl = rail.slice();
      if (fz > 0) { if (last) rl[1] = 1; if (i === 0) rl[2] = 1; } else { if (i === 0) rl[1] = 1; if (last) rl[2] = 1; }
      const rec = garment(key, p, ci, [x, y, z], yaw, rl, { tag: (i % tagEvery === 2) || i === 0 || last });
      rec.blockStart = first;
      if (fill) rec.scl.z *= 1.3;   // wall bays are seen edge-on from the aisle: a touch more body, never a paper strip
      rec.run = run; rec.runIdx = run.length; run.push(rec);
    });
    return run;
  }
  const hero = g => g.products.filter(p => lineOf(p)).sort((a, b) => rankHero(b) - rankHero(a))[0];
  const rankHero = p => (p.badges.includes('new') ? 4 : 0) + (p.badges.includes('bestseller') ? 3 : 0) + (p.featured ? 2 : 0) + (p.inStock ? 1 : 0);

  // ---------------------------------------------------------------------------------------------
  // Product stacks on shelves / cabinets (folded clothes, bags, IMAANS hat boxes)
  // ---------------------------------------------------------------------------------------------
  const stacks = new Stacks(ctx);
  stacks.line('fold', makeFolded({ w: 0.3, h: 0.05, d: 0.26, seed: 3 }), mats.fabric('knit', '#ffffff'));
  stacks.line('foldDenim', makeFolded({ w: 0.3, h: 0.05, d: 0.26, seed: 5 }), mats.fabric('denim', '#ffffff'));
  stacks.line('bag', handbag(), mats.fabric('suede', '#ffffff'));
  stacks.line('tote', tote(), mats.fabric('canvas', '#ffffff'));
  const boxLine = stacks.line('box', null, null, { noColor: true });   // geometry + print material once the atlas exists
  const folds = [];      // [product, colourIndex] pairs, light → dark, foldable clothes
  for (const p of G.clothes.filter(foldable)) for (const ci of lightToDark(p)) folds.push([p, ci]);
  const hats = ctx.catalog.all('hat'), bags = ctx.catalog.all('handbag'), totes = ctx.catalog.all('tote');
  const cursor = { fold: 0, hat: 0, bag: 0, tote: 0 };
  const groupFolds = new Map();
  function nextFold(g) {
    let list = g ? groupFolds.get(g.key) : null;
    if (g && !list) { list = []; for (const p of g.products.filter(foldable)) for (const ci of lightToDark(p)) list.push([p, ci]); groupFolds.set(g.key, list); list.i = 0; }
    if (list && list.length >= 2) return list[list.i++ % list.length];
    return folds[cursor.fold++ % Math.max(1, folds.length)];
  }
  stacks.tint = albedo;
  const cardFn = (p, at, extra = {}) => st => productCard(ctx, p, { current: st.currentHex || st.ci || 0, tag: extra.tag, subtitle: extra.subtitle });
  const shadows = new ShadowQuads();
  /**
   * A folded stack / bag / box at (x, top, z) on a shelf running along z (fronts face +x). maxTop = the
   * lowest garment hem above it (cabinet tops under a rail): stacks shrink / boxes drop out to clear it.
   */
  function prop(kind, x, top, z, r, g, n = 4, maxTop = Infinity) {
    const room = maxTop - 0.035 - top;
    if (kind === 'fold') {
      const pair = nextFold(g); if (!pair) return;
      const [p, ci] = pair, isDenim = ['jeans', 'trouser', 'mini'].includes(lineOf(p)) || null === lineOf(p);
      const w = 0.3, d = isDenim ? 0.27 : 0.25, h = isDenim ? 0.042 : 0.048;
      const k = Math.min(Math.max(3, Math.round(n * (0.75 + 0.25 * D))), Math.floor(room / (h * 0.94)));
      if (k < 2) return;
      const items = [];
      for (let i = 0; i < k; i++) items.push({ pos: [x + (r() - 0.5) * 0.012, top + i * h * 0.94, z + (r() - 0.5) * 0.014], rot: [0, Math.PI / 2 + (r() - 0.5) * 0.06, 0],
        scale: [w * (0.97 + r() * 0.06) / 0.3, h / 0.05, d / 0.26], color: albedo(swatchOf(p, ci)), jitter: (r() - 0.5) * 0.03 });
      stacks.add(isDenim ? 'foldDenim' : 'fold', items, cardFn(p)).ci = ci;
      shadows.add(x, top + 0.002, z, d + 0.1, w + 0.12, 0.5);
    } else if (kind === 'box') {
      const rad = [0.19, 0.17, 0.15][n % 3] || 0.17, hh = rad * 1.05;
      if (hh > room) return;
      if (hh * 1.87 > room) n = 1;
      const p = hats[cursor.hat++ % Math.max(1, hats.length)]; if (!p) return;
      const items = [{ pos: [x, top, z], rot: [0, r() * 6, 0], scale: [rad, hh, rad] }];
      if (n >= 2) items.push({ pos: [x, top + hh + 0.002, z], rot: [0, r() * 6, 0], scale: [rad * 0.8, hh * 0.82, rad * 0.8] });
      stacks.add('box', items, cardFn(p, null, { subtitle: p.short ? p.short + ' · in an IMAANS hat box' : 'In an IMAANS hat box' }));
      shadows.add(x, top + 0.002, z, rad * 2.6, rad * 2.6, 0.55);
    } else {
      const tt = kind === 'tote';
      if ((tt ? 0.43 : 0.31) > room) return;
      const pool = tt ? totes : bags, p = pool[cursor[tt ? 'tote' : 'bag']++ % Math.max(1, pool.length)]; if (!p) return;
      stacks.add(tt ? 'tote' : 'bag', [{ pos: [x + 0.02, top, z], rot: [0, Math.PI / 2 + (r() - 0.5) * 0.35, 0], scale: [1, 1, 1], color: albedo(swatchOf(p, 0)) }], cardFn(p));
      shadows.add(x + 0.02, top + 0.002, z, 0.24, 0.42, 0.5);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Fixtures batch
  // ---------------------------------------------------------------------------------------------
  const B = new Batch();
  const glowQuads = [];      // [x, y0, y1, z0, z1, u0, u1]
  const plaques = [];        // {word, c:[x,y,z], w, h, face:'+x'|'-x'|'+z'|'-z', two?}
  const dividers = [];       // {x, y, z, size}
  const words = [];          // plaque texts (atlas order)
  const wordId = w => { let i = words.indexOf(w); if (i < 0) { words.push(w); i = words.length - 1; } return i; };
  const SIZES = sizeLabels(G.clothes).slice(0, 16);
  let sizeK = 0; const nextSize = () => SIZES[sizeK++ % Math.max(1, SIZES.length)] || 'M';

  // ---- left wall bays
  const wallLen = pilZ(6) - pilZ(0) + PIL_W + 0.1;
  B.add('char', crownBeam(wallLen, 0.22, 0.17), mat(WX, TOPY, pilZ(0) - PIL_W / 2 - 0.05), { grain: null });
  for (let k = 0; k <= 6; k++) {
    const z = pilZ(k);
    B.add('char', flutedPilaster(PIL_W, PIL_D, TOPY - 0.12, 5), mat(WX, 0, z), { grain: 'v' });
    B.add('char', board(PIL_D + 0.022, 0.2, PIL_W + 0.03, 0.006), mat(WX + (PIL_D + 0.022) / 2, 0.1, z), { grain: 'v' });
    B.add('char', board(PIL_D + 0.022, 0.12, PIL_W + 0.03, 0.006), mat(WX + (PIL_D + 0.022) / 2, TOPY - 0.06, z), { grain: 'v' });
    B.add('brass', board(0.006, 0.012, PIL_W + 0.03, 0.002), mat(WX + PIL_D + 0.024, 0.2, z));            // brass fillet over the plinth block
  }
  // bays: the tallest garments toward the back, the short / colourful ones by the entrance
  const bayOrder = bayGroups.map((g, i) => ({ g, i, drop: dropOf(g) })).sort((a, b) => b.drop - a.drop || a.i - b.i);
  const bays = [];
  bayOrder.forEach(({ g: grp, drop }, b) => {
    const z0 = pilZ(b) + PIL_W / 2, z1 = pilZ(b + 1) - PIL_W / 2, zc = (z0 + z1) / 2, L = z1 - z0;
    const railY = Math.min(1.97, Math.max(1.8, 0.56 + drop));
    bays.push({ z0, z1, zc, grp });
    B.add('panel', board(PANEL, TOPY - 0.16, L, 0.003), mat(WX + PANEL / 2, 0.16 + (TOPY - 0.16) / 2, zc), { grain: 'v' });
    // low drawer cabinet with a travertine top under the hanging garments
    const cd = 0.42, ch = 0.34, cz0 = z0 + 0.006, cz1 = z1 - 0.006, cl = cz1 - cz0;
    B.add('char', board(cd - 0.03, 0.06, cl - 0.02, 0.003), mat(PANEL_X + (cd - 0.03) / 2, 0.03, zc));                 // recessed kick
    B.add('char', board(cd - 0.012, ch - 0.08, cl, 0.004), mat(PANEL_X + (cd - 0.012) / 2, 0.06 + (ch - 0.08) / 2, zc));  // carcass
    B.add('stone', board(cd + 0.012, 0.024, cl + 0.01, 0.004), mat(PANEL_X + (cd + 0.012) / 2, ch - 0.012, zc));        // top
    const nd = 3, dw = (cl - 0.02 - (nd - 1) * 0.008) / nd;
    for (let d = 0; d < nd; d++) {
      const dzc = cz0 + 0.01 + dw / 2 + d * (dw + 0.008);
      B.add('char', board(0.016, ch - 0.1, dw, 0.004), mat(PANEL_X + cd - 0.004, 0.07 + (ch - 0.1) / 2, dzc));         // drawer front
      B.add('brass', tubeBetween([PANEL_X + cd + 0.018, 0.25, dzc - 0.07], [PANEL_X + cd + 0.018, 0.25, dzc + 0.07], 0.0055, 8));
      for (const e of [-0.06, 0.06]) B.add('brass', tubeBetween([PANEL_X + cd + 0.004, 0.25, dzc + e], [PANEL_X + cd + 0.018, 0.25, dzc + e], 0.004, 6));
    }
    shadows.add(PANEL_X + cd / 2 + 0.03, 0.004, zc, cd + 0.2, cl + 0.1, 0.55);
    // oak shelf with a brass nosing and an LED line under it
    B.add('wood', board(SHELF_D, SHELF_T, L - 0.004, 0.005), mat(PANEL_X + SHELF_D / 2, SHELF_Y + SHELF_T / 2, zc));
    B.add('brass', board(0.004, 0.012, L - 0.01, 0.0015), mat(PANEL_X + SHELF_D + 0.001, SHELF_Y + SHELF_T / 2, zc));
    B.add('led', board(0.012, 0.004, L - 0.04, 0.001), mat(PANEL_X + SHELF_D - 0.032, SHELF_Y - 0.002, zc));
    glowQuads.push([PANEL_X + 0.002, SHELF_Y - 0.95, SHELF_Y, z0, z1, 0, 0.5]);           // LED wash under the shelf
    glowQuads.push([PANEL_X + 0.002, SHELF_Y + SHELF_T, TOPY - 0.01, zc - 0.75, zc + 0.75, 0.5, 1]); // spot on the upper panel
    // face-out waterfall arm at the entrance end: the group's hero piece in three colours
    const zA = z1 - 0.37, fy = railY;
    B.add('steel', tubeBetween([PANEL_X, fy, zA], [-7.49, fy - 0.035, zA], 0.011, 10));
    B.add('brass', disc(0.03, 0.01, 16), mat(PANEL_X + 0.005, fy, zA, 0, 0, Math.PI / 2));
    B.add('brass', ball(0.019, 8), mat(-7.49, fy - 0.035, zA));
    for (const xs of [-7.86, -7.745, -7.63]) B.add('steel', ball(0.0135, 6), mat(xs, fy - 0.035 * (xs - PANEL_X) / (-7.49 - PANEL_X) + 0.004, zA));
    const recStart = records.length;
    const hp = hero(grp);
    if (hp) {
      const cols = lightToDark(hp);
      [-7.585, -7.69, -7.8].forEach((xh, i) => {
        const yh = fy - 0.035 * (xh - PANEL_X) / (-7.49 - PANEL_X) + 0.011 + 0.0025;
        const rec = garment(lineOf(hp), hp, cols[i % cols.length], [xh, yh, zA], Math.PI / 2, [0.85, i === 0 ? 1 : 0, 0, 1], { face: true, tag: i === 0 });
        rec.faceRank = i;
      });
    }
    // side-hung rail: black steel on brass wall flanges
    const rz0 = z0 + 0.05, rz1 = z1 - 0.78;
    B.add('steel', tubeBetween([RAIL_X, railY, rz0], [RAIL_X, railY, rz1], 0.015, 12));
    for (const zb of [rz0 + 0.14, rz1 - 0.14]) {
      B.add('steel', tubeBetween([PANEL_X, railY, zb], [RAIL_X, railY, zb], 0.0085, 8));
      B.add('brass', disc(0.028, 0.01, 16), mat(PANEL_X + 0.005, railY, zb, 0, 0, Math.PI / 2));
      B.add('steel', disc(0.021, 0.034, 10), mat(RAIL_X, railY, zb, Math.PI / 2, 0, 0));
    }
    for (const ze of [rz0, rz1]) B.add('brass', ball(0.019, 8), mat(RAIL_X, railY, ze));
    const run = layRun(seqFor(grp.products, rz1 - rz0 - 0.1, 1.12), { x: RAIL_X, y: railY, z0: rz0 + 0.05, z1: rz1 - 0.05, rail: [1, 0, 0, 0], airy: 1.12, fill: 0.84 });
    sizeDividers(run, RAIL_X, railY, 2);
    // cabinet-top props, clear of the hems hanging above them (face-out pieces span their width along z)
    {
      const bayRecs = records.slice(recStart);
      const hemAt = z => bayRecs.reduce((y, rec) => (Math.abs(rec.pos.z - z) < 0.16 + (rec.faceRank !== undefined ? rec.L.info.halfW : 0.07)
        ? Math.min(y, rec.pos.y + rec.L.info.bottom * rec.scl.y) : y), Infinity);
      const r = kit.rng(900 + b * 7), xc = PANEL_X + 0.2;
      for (const [kind, f, n] of CABINET_RECIPES[b % CABINET_RECIPES.length]) prop(kind, xc, ch, cz0 + cl * f, r, grp, n, hemAt(cz0 + cl * f));
    }
    // floor + panel shadows under / behind the run
    const hem = railY - drop;
    shadows.add(-7.62, 0.004, (rz0 + rz1) / 2, 0.9, rz1 - rz0 + 0.5, 0.42);
    shadows.addWall(PANEL_X + 0.003, Math.max(0.4, hem) + (railY - Math.max(0.4, hem)) * 0.45, (rz0 + rz1) / 2, railY - Math.max(0.4, hem) + 0.5, rz1 - rz0 + 0.35, 0.42);
    shadows.add(-7.66, 0.343, zA, 0.6, 0.7, 0.3);
    shadows.addWall(PANEL_X + 0.003, fy - 0.55, zA, 1.2, 0.85, 0.3);
    // shelf above
    {
      const r = kit.rng(700 + b * 13), top = SHELF_Y + SHELF_T, xc = PANEL_X + SHELF_D / 2 - 0.01;
      for (const [kind, f, n] of SHELF_RECIPES[b % SHELF_RECIPES.length]) prop(kind, xc, top, z0 + L * f, r, grp, n);
    }
    plaques.push({ word: wordId(grp.label), c: [WX + 0.17 + 0.0025, TOPY + 0.1, zc], w: 0.96, h: 0.12, face: '+x' });
    ctx.colliders.addBox(-7.62, zc, 0.76, L + PIL_W);
  });
  lap('bays');

  /** Round size dividers between colour blocks at ~1/3 and ~2/3 of a run. */
  function sizeDividers(run, x, y, n = 1) {
    const cuts = n === 1 ? [0.5] : [0.34, 0.7];
    for (const f of cuts) {
      let i = Math.floor(run.length * f);
      while (i < run.length - 1 && !(run[i + 1] && run[i + 1].blockStart)) i++;
      if (run[i] && run[i + 1]) dividers.push({ x, y, z: (run[i].pos.z + run[i + 1].pos.z) / 2, size: nextSize() });
    }
  }

  // ---- double floor rails R1 / R2 (bar A faces the central aisle, bar B the wall bays)
  for (const [F, ga, gb] of [[R1, R1a, R1b], [R2, R2a, R2b]]) {
    const { cx, cz, y } = F, hz = 1.12, ex = 0.3;
    B.add('stone', board(0.86, 0.1, 2.38, 0.012), mat(cx, 0.05, cz));
    for (const sx of [-ex, ex]) {
      for (const sz of [-hz, hz]) {
        B.add('steel', tubeBetween([cx + sx, 0.1, cz + sz], [cx + sx, y, cz + sz], 0.015, 10));
        B.add('brass', disc(0.032, 0.012, 16), mat(cx + sx, 0.106, cz + sz));
        B.add('brass', ball(0.022, 8), mat(cx + sx, y + 0.004, cz + sz));
      }
      B.add('steel', tubeBetween([cx + sx, y, cz - hz], [cx + sx, y, cz + hz], 0.015, 12));
    }
    for (const sz of [-hz, hz]) B.add('steel', tubeBetween([cx - ex, y - 0.06, cz + sz], [cx + ex, y - 0.06, cz + sz], 0.011, 10));
    [[ex, ga], [-ex, gb]].forEach(([dx, grp]) => {
      if (!grp) return;
      const yaw = dx > 0 ? 0 : Math.PI;
      const run = layRun(seqFor(grp.products, 2 * hz - 0.14, 1.2), { x: cx + dx, y, z0: cz - hz + 0.07, z1: cz + hz - 0.07, yaw, rail: [1, 0, 0, 0], airy: 1.2 });
      sizeDividers(run, cx + dx, y, 1);
      // topper plaque standing on the bar, facing its side of the rail
      const pw = 0.64, ph = 0.08, py = y + 0.024 + ph / 2;
      plaques.push({ word: wordId(grp.label), c: [cx + dx + Math.sign(dx) * 0.0045, py, cz], w: pw, h: ph, face: dx > 0 ? '+x' : '-x' });
      B.add('steel', board(0.008, ph + 0.008, pw + 0.008, 0.002), mat(cx + dx, py, cz));
      for (const s of [-0.22, 0.22]) B.add('brass', tubeBetween([cx + dx, y + 0.01, cz + s], [cx + dx, py - ph / 2, cz + s], 0.0035, 6));
    });
    shadows.add(cx, 0.004, cz, 1.2, 2.75, 0.62);
    shadows.add(cx, 0.004, cz, 1.9, 3.3, 0.3);
    ctx.colliders.addBox(cx, cz, 1.22, 2.45);
  }

  // ---- two-tier round rack: short pieces on the upper ring, trousers / jeans folded over the lower ring
  if (RRg) {
    const { cx, cz, upper, lower } = RR;
    const base = kit.lathe([[0, 0], [0.4, 0], [0.42, 0.012], [0.42, 0.055], [0.405, 0.07], [0, 0.07]], 40);
    B.add('stone', base, mat(cx, 0, cz));
    B.add('steel', tubeBetween([cx, 0.07, cz], [cx, upper.y + 0.05, cz], 0.02, 14));
    B.add('brass', disc(0.03, 0.02, 16), mat(cx, 0.08, cz));
    B.add('brass', ball(0.03, 10), mat(cx, upper.y + 0.075, cz));
    for (const ring of [upper, lower]) {
      const t = new THREE.TorusGeometry(ring.r, 0.013, 6, ring === upper ? 36 : 48);
      B.add('steel', t, mat(cx, ring.y, cz, Math.PI / 2, 0, 0));
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; B.add('steel', tubeBetween([cx, ring.y, cz], [cx + Math.cos(a) * ring.r, ring.y, cz + Math.sin(a) * ring.r], 0.008, 8)); }
      B.add('brass', disc(0.026, 0.03, 14), mat(cx, ring.y, cz));
    }
    const tops = RRg.products.filter(p => lineOf(p) && !['jeans', 'trouser'].includes(lineOf(p)) && -line(lineOf(p)).info.bottom < 0.95);
    const bottoms = RRg.products.filter(p => ['jeans', 'trouser'].includes(lineOf(p)));
    const topPairs = []; for (const p of (tops.length ? tops : G.clothes.filter(p => ['shirt', 'knit', 'camisole'].includes(lineOf(p))))) for (const ci of lightToDark(p)) topPairs.push([p, ci]);
    const nU = Math.max(13, Math.round(upper.n * D)), nL = 10;   // a full ring at every tier (gaps read as sold-out)
    const runU = [], runL = [];
    if (topPairs.length) for (let i = 0; i < nU; i++) {
      const a = (i + 0.5) / nU * Math.PI * 2 + 0.2;
      const [p, ci] = topPairs[Math.floor(i / nU * topPairs.length)];
      const rec = garment(lineOf(p), p, ci, [cx + Math.cos(a) * upper.r, upper.y, cz + Math.sin(a) * upper.r], -a, [0.9, 0, 0, 0], { tag: i % 4 === 1 });
      rec.blockStart = !runU.length || runU[runU.length - 1].product !== p || runU[runU.length - 1].ci !== ci;
      rec.run = runU; rec.runIdx = runU.length; runU.push(rec);
    }
    // lower tier: bottoms folded straight over the ring (no hangers) — the fold axis runs along the ring
    const botPairs = []; for (const p of (bottoms.length ? bottoms : G.clothes.filter(p => lineOf(p) === 'jeans'))) for (const ci of lightToDark(p)) botPairs.push([p, ci]);
    if (botPairs.length) for (let i = 0; i < nL; i++) {
      const a = (i + 0.5) / nL * Math.PI * 2;
      const [p, ci] = botPairs[Math.floor(i / nL * botPairs.length)];
      const rec = garment('jeans', p, ci, [cx + Math.cos(a) * lower.r, lower.y - HANGER_BAR_Y, cz + Math.sin(a) * lower.r], -a - Math.PI / 2, [0.45, 0, 0, 1], { tag: i % 3 === 1 });
      rec.noHanger = true; rec.pivot = new THREE.Vector3(0, HANGER_BAR_Y, 0);
      rec.run = runL; rec.runIdx = runL.length; runL.push(rec);
    }
    if (runU.length) runU.push(runU[0]); if (runL.length) runL.push(runL[0]);    // wrap neighbours
    // two-sided topper on the finial
    const ph = 0.075, pw = 0.6, py = upper.y + 0.2;
    B.add('steel', tubeBetween([cx, upper.y + 0.09, cz], [cx, py - ph / 2, cz], 0.006, 8));
    B.add('steel', board(pw + 0.008, ph + 0.008, 0.008, 0.002), mat(cx, py, cz, 0, Math.PI / 2 - 0.5, 0));
    const pa = Math.PI / 2 - 0.5, nx = Math.sin(pa), nz = Math.cos(pa);
    plaques.push({ word: wordId(RRg.label), c: [cx + nx * 0.0045, py, cz + nz * 0.0045], w: pw, h: ph, yaw: pa });
    plaques.push({ word: wordId(RRg.label), c: [cx - nx * 0.0045, py, cz - nz * 0.0045], w: pw, h: ph, yaw: pa + Math.PI });
    shadows.add(cx, 0.004, cz, 1.05, 1.05, 0.62);
    shadows.add(cx, 0.004, cz, 1.9, 1.9, 0.36);
    ctx.colliders.addCircle(cx, cz, 0.78);
  }

  // ---- R3: high gallery rail by the lounge
  {
    const { cx, cz, y } = R3, hz = 1.12;
    B.add('stone', board(0.56, 0.1, 2.38, 0.012), mat(cx, 0.05, cz));
    for (const sz of [-hz, hz]) {
      B.add('steel', tubeBetween([cx, 0.1, cz + sz], [cx, y + 0.04, cz + sz], 0.018, 14));
      B.add('brass', disc(0.038, 0.014, 16), mat(cx, 0.107, cz + sz));
      B.add('brass', ball(0.028, 8), mat(cx, y + 0.06, cz + sz));
    }
    B.add('steel', tubeBetween([cx, y, cz - hz], [cx, y, cz + hz], 0.015, 14));
    const run = layRun(seqFor(R3g.products, 2 * hz - 0.16, 1.15), { x: cx, y, z0: cz - hz + 0.08, z1: cz + hz - 0.08, rail: [0.7, 0, 0, 1], airy: 1.15, tagEvery: 4 });
    sizeDividers(run, cx, y, 1);
    const pw = 0.64, ph = 0.08, py = y + 0.024 + ph / 2;
    B.add('steel', board(0.008, ph + 0.008, pw + 0.008, 0.002), mat(cx, py, cz));
    for (const s of [-0.22, 0.22]) B.add('brass', tubeBetween([cx, y + 0.01, cz + s], [cx, py - ph / 2, cz + s], 0.0035, 6));
    plaques.push({ word: wordId(R3g.label), c: [cx - 0.0045, py, cz], w: pw, h: ph, face: '-x' });
    plaques.push({ word: wordId(R3g.label), c: [cx + 0.0045, py, cz], w: pw, h: ph, face: '+x' });
    shadows.add(cx, 0.004, cz, 0.9, 2.7, 0.62);
    shadows.add(cx, 0.004, cz, 1.6, 3.2, 0.3);
    ctx.colliders.addBox(cx, cz, 0.82, 2.45);
  }
  lap('floorRails');

  // ---------------------------------------------------------------------------------------------
  // Build meshes
  // ---------------------------------------------------------------------------------------------
  const fixMats = {
    wood: mats.get('oak-smoked'), char: mats.get('oak-smoked', { color: '#2e2a27' }), panel: mats.get('plaster', { color: '#2b2927' }), stone: mats.get('travertine'),
    steel: mats.get('steel-black'), brass: mats.get('brass'), led: ledMaterial('#ffd6a0', 3.2),
  };
  const fixtures = B.build(fixMats, root, { receiveShadow: true });
  // draw order (opaque): garments, then joinery, then everyone else — three sorts opaque objects by
  // material before depth, so this is what lets the walls/panels behind a packed rail be depth-rejected.
  for (const k of ['wood', 'char', 'panel', 'stone', 'steel', 'brass']) if (fixtures[k]) fixtures[k].renderOrder = -1;
  lap('fixtureMerge');

  // garments
  const tmpM = new THREE.Matrix4(), col = new THREE.Color();
  const garmentMeshes = [];
  for (const L of Object.values(lines)) {
    if (!L.items.length) continue;
    // nearest-to-the-entrance first: the usual view looks down −z, so dense rails get early-z rejection
    L.items.sort((a, b) => b.pos.z - a.pos.z || b.pos.x - a.pos.x);
    const n = L.items.length;
    const g = L.geometry;
    const mesh = new THREE.InstancedMesh(g, L.material, n);
    mesh.name = 'apparelRails:garment:' + L.key;
    L.items.forEach((rec, i) => {
      rec.mesh = mesh; rec.id = i;
      tmpM.compose(rec.pos, rec.quat, rec.scl); mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, col.set(rec.color));
    });
    g.setAttribute('aRail', instAttr(L.items.map(r => r.rail), 4));
    g.setAttribute('aDrape', instAttr(L.items.map(r => r.drape), 3));
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.renderOrder = -2;
    mesh.computeBoundingSphere();
    mesh.userData.records = L.items;
    root.add(mesh); garmentMeshes.push(mesh);
  }
  lap('garmentMeshes');

  // print atlas: IMAANS plaques + size dividers + swing tags + hook / hanger texels + hat boxes (ONE material)
  const atlas = makeAtlas(fontsOf(ctx), words, SIZES, { scale: ctx.tier === 'low' ? 0.5 : 1 });
  const printMat = printMaterial(atlas.map, atlas.mask, 'apparelRails:print');
  redrawWhenFontsLoad(atlas);
  // hangers: hooks (gold), visible hanger bodies (black), clip hangers (gold), swing tags
  const woodH = makeHanger('wood'), clipH = makeHanger('clip');
  const texel = (geo, r) => { const g = geo.clone(), uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2); const u = (r[0] + r[2]) / 2, v = (r[1] + r[3]) / 2; for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v); g.setAttribute('uv', uv); return g; };
  const hookItems = [], bodyItems = [], clipItems = [], tagItems = [];
  for (const rec of records) {
    if (rec.noHanger) { /* folded over a ring */ } else if (rec.L.info.hanger === 'clip') clipItems.push(rec);
    else { hookItems.push(rec); if (SHOW_HANGER.has(rec.line)) bodyItems.push(rec); }
    if (rec.tag) tagItems.push(rec);
  }
  const tagOff = rec => new THREE.Matrix4().makeTranslation(...rec.L.info.tag).multiply(new THREE.Matrix4().makeRotationY(rec.faceRank !== undefined ? 0.2 : Math.PI / 2 + 0.25));
  const linkMesh = (geo, material, list, name, { scaled = false, offset = null } = {}) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, material, list.length);
    m.name = 'apparelRails:' + name;
    const oneV = new THREE.Vector3(1, 1, 1);
    list.forEach((rec, i) => {
      const off = offset ? offset(rec) : null;
      tmpM.compose(rec.pos, rec.quat, scaled ? rec.scl : oneV); if (off) tmpM.multiply(off);
      m.setMatrixAt(i, tmpM);
      rec.links.push({ mesh: m, id: i, scaled, offset: off });
    });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    m.castShadow = false; m.receiveShadow = false;
    root.add(m); return m;
  };
  linkMesh(texel(woodH.metal, atlas.rects.gold), printMat, hookItems, 'hooks');
  const narrow = new THREE.Matrix4().makeScale(0.84, 1, 1);   // slimmer trouser/slip hangers: less 'cage' on dense rails
  linkMesh(texel(woodH.body, atlas.rects.black), printMat, bodyItems, 'hangers', { offset: () => narrow });
  linkMesh(texel(clipH.metal, atlas.rects.gold), printMat, clipItems, 'clipHangers');
  linkMesh(tagGeometry(atlas.rects.tag), printMat, tagItems, 'tags', { scaled: true, offset: tagOff });
  root.add(one(printGeometry(plaques, dividers, atlas), printMat, 'apparelRails:plaques'));
  lap('hangersLabels');

  // product stacks (folded clothes, bags, totes, IMAANS hat boxes) — cards + colourways
  boxLine.geometry = brandBoxGeo(atlas.rects.box); boxLine.material = printMat;
  stacks.build(root, 'apparelRails');
  lap('props');
  // glow + shadows
  root.add(glowMesh(glowQuads));
  shadows.build(root, 'apparelRails:shadows');
  lap('glowShadow');

  // ---------------------------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------------------------
  const swing = createSwing(ctx);
  const bp = new THREE.Vector3();
  for (const mesh of garmentMeshes) {
    ctx.interact.add(mesh, hit => {
      const rec = mesh.userData.records[hit.instanceId];
      return rec ? cardFor(rec) : null;
    });
  }
  function cardFor(rec) {
    return productCard(ctx, rec.product, {
      current: rec.ci,
      recolor(hex, i) {
        rec.ci = i; rec.color = albedo(hex);
        rec.mesh.setColorAt(rec.id, col.set(rec.color)); rec.mesh.instanceColor.needsUpdate = true;
        swing.start(rec, { amp: 0.5 });
        bp.copy(rec.pos); bp.y -= 0.35; ctx.fx.burst(bp.clone(), { color: hex, count: 18 });
      },
      onTap(hit) {
        swing.tap(rec);
        ctx.fx.burst(hit && hit.point ? hit.point.clone() : rec.pos.clone(), { color: rec.color, count: 24 });
      },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Tour stops
  // ---------------------------------------------------------------------------------------------
  const dept = (ctx.layout.DEPARTMENTS && ctx.layout.DEPARTMENTS.clothes && ctx.layout.DEPARTMENTS.clothes.name) || 'Clothes';
  ctx.hotspots.add({ id: 'rails', label: dept, pos: [-2.35, 1.62, 3.1], look: [-6.7, 1.3, -1.3], order: 20 });
  ctx.hotspots.add({ id: 'dresses', label: R3g.label, pos: [1.85, 1.62, -1.35], look: [3.9, 1.25, -4.5], order: 40 });

  // dev: ?arHide=a,b hides meshes whose name contains a / b (debug views)
  const hideP = ctx.params && ctx.params.get('arHide');
  if (hideP) root.traverse(o => { if (o.isMesh && hideP.split(',').some(h => o.name.includes(h))) o.visible = false; });
  kit.freeze(root);
  lap('interact');
  window.__apparelRails = { records, lines, swing, times, stacks, plan: { bays: bays.map(b => b.grp.label), R1: [R1a && R1a.label, R1b && R1b.label], R2: [R2a && R2a.label, R2b && R2b.label], RR: RRg && RRg.label, R3: R3g.label }, card: i => cardFor(records[i]) };
  // dev: ?arTap=N swings record N once the store is ready (screenshots of the interaction)
  const tapN = ctx.params && ctx.params.get('arTap'), tapAt = ctx.params && ctx.params.get('arTapAt');
  if (tapN || tapAt) ctx.events.addEventListener('ready', () => {
    let rec = tapN ? records[+tapN] : null;
    if (tapAt) { const p = new THREE.Vector3(...tapAt.split(',').map(Number)); let best = 1e9; for (const r of records) { const d = r.pos.distanceToSquared(p); if (d < best) { best = d; rec = r; } } }
    if (rec) cardFor(rec).onTap(null);
  });
}

// -------------------------------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------------------------------
/** Repaint the atlas once the ui's brand webfonts are in (canvas text falls back to Georgia before). */
function redrawWhenFontsLoad(atlas) {
  if (typeof document === 'undefined' || !document.fonts) return;
  let n = 0;
  const redraw = () => { if (n++ < 4) atlas.redraw(); };
  if (document.fonts.ready) document.fonts.ready.then(redraw);
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', redraw);
}

/** Swing-tag card (+ string) in its own frame: origin at the string's top, card hanging below, in the x-y plane. */
function tagGeometry(rect) {
  const [u0, v0, u1, v1] = rect;
  const w = 0.036, h = 0.06, sl = 0.022;
  const pos = [], uv = [], idx = [];
  const quad = (x0, y0, x1, y1, a, b, c, d) => {
    const n = pos.length / 3;
    pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    uv.push(a, b, c, b, c, d, a, d);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  quad(-w / 2, -sl - h, w / 2, -sl, u0, v0, u1, v1);                                   // card
  const su = u0 + (u1 - u0) * 0.5, sv = v0 + (v1 - v0) * 0.95;
  quad(-0.0006, -sl - 0.004, 0.0006, 0, su, sv, su + 0.0005, sv + 0.0005);               // string
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Static print mesh: IMAANS plaques (friezes + rail toppers) + size-divider discs on the rails. */
function printGeometry(plaques, dividers, atlas) {
  const pos = [], uv = [], nrm = [], idx = [];
  const push = (p, t, n) => { pos.push(...p); uv.push(...t); nrm.push(...n); };
  const FACE = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI };
  for (const pl of plaques) {
    const [u0, v0, u1, v1] = atlas.rects.words[pl.word] || atlas.rects.words[0];
    const yaw = pl.yaw !== undefined ? pl.yaw : FACE[pl.face || '+z'];
    // local quad in x-y facing +z, rotated by yaw (text reads left → right for a viewer facing it)
    const c = Math.cos(yaw), s = Math.sin(yaw), n = pos.length / 3, hw = pl.w / 2, hh = pl.h / 2;
    const P = (lx, ly) => [pl.c[0] + lx * c, pl.c[1] + ly, pl.c[2] - lx * s];
    const N = [s, 0, c];
    push(P(-hw, -hh), [u0, v0], N); push(P(hw, -hh), [u1, v0], N); push(P(hw, hh), [u1, v1], N); push(P(-hw, hh), [u0, v1], N);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const seg = 18, rO = 0.058, rI = 0.02;
  for (const d of dividers) {
    const [u0, v0, u1, v1] = atlas.rects.sizes[d.size] || Object.values(atlas.rects.sizes)[0] || [0, 0, 0.01, 0.01];
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, us = (u1 - u0) / 2 / 0.062, vs = (v1 - v0) / 2 / 0.062;
    for (const side of [1, -1]) {
      const n = pos.length / 3;
      // disc in the x-y plane (a rail runs along z through its hole); the hole hangs 5 mm below the rail axis
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        for (const rr of [rI, rO]) {
          const lx = ca * rr, ly = sa * rr - 0.005;
          push([d.x + lx, d.y + ly, d.z + side * 0.0012], [uc + lx * us * side, vc + ly * vs], [0, 0, side]);
        }
      }
      for (let i = 0; i < seg; i++) {
        const a = n + i * 2;
        if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

/** Additive warm light sheets (LED wash under shelves, spot scallops on the upper panels), facing +x. */
function glowMesh(quads) {
  const tex = makeGlow();
  const pos = [], uv = [], idx = [];
  for (const [x, y0, y1, z0, z1, u0, u1] of quads) {
    const n = pos.length / 3;
    pos.push(x, y0, z1, x, y0, z0, x, y1, z0, x, y1, z1);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, glowMaterial(tex, '#ffcc94', 0.36, 'apparelRails:glow'));
  m.name = 'apparelRails:glow'; m.renderOrder = 2;
  return m;
}
