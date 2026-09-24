// Module: footwear — the Shoes department of IMAANS (the hero department: Imaan's *Shoes*), as in the real shop.
// Zones (core/layout.js ZONES, docs/REAL-LAYOUT.md): shoeWall1 · shoeStep1 · shoeWall2 (left wall) · shoeShelfBack
// (on the partition) · glassIsland (centre).
//  • Fixtures (footwear/units.js): dark espresso wall units with 9 lit tiers × 4 shoes (warm LED line on every shelf
//    lip, a pelmet LED, the tier wash painted on the back), the narrow 8 × 2 unit on the partition, the ivory
//    three-step podium (a pair per step) and the glass island (ivory body, black-metal frame, glass vitrine + top,
//    no transmission): 5 shoes under the glass, 5 on top. 104 display spots in all.
//  • Merchandise (footwear/catalog.js merchandise): every catalogue shoe has a spot — heels & sandals on wall 1 by
//    the window, boots & flats on wall 2, sneakers mixed with heels, flats & sandals on the glass island, boots too tall for a tier as pairs on the
//    step, the narrow shelf takes whatever is left — and the remaining spots show repeat colourways, like a real
//    shop. Every shoe's 3-D style follows the product kind (footwear/lasts.js); sneakers = the Shopify GLB with a
//    tint-mask colourway atlas (footwear/sneakers.js).
// Performance: joinery merged per material (wood · ivory · metal · glass · LED · tier wash) on the architecture's
// shader recipes (footwear/progs.js); the procedural shoes of each fixture group are ONE draw call with a full / lite
// LOD (footwear/merged.js) — floor and top tiers always lite on mid, everything lite on low; sneakers are two
// InstancedMeshes (left / right foot) with near / far LODs; all contact shadows are one mesh. No lights.
// Interactions: tap a shoe → catalogue card (name, Rand price, EU sizes with sold-out, the product's own colours —
// tapping one recolours the shoe / the pair), "Try it on ✦" floats the shoe out and spins it, "Size guide".
// Tour / Go to stops (shoe-wall-1, shoe-step, glass-island, shoe-wall-2, shoe-shelf) are layout data (layout.TOUR /
// GOTO), registered by ui.
import * as THREE from 'three';
import { Batch, ShadowBatch } from './footwear/util.js';
import { STYLES } from './footwear/lasts.js';
import { shoeMaterials } from './footwear/shoeMats.js';
import { loadSneakers, buildSneakerStock, sneakerColour, setSneakerColour, lodSwitcher, meshLods } from './footwear/sneakers.js';
import { wallUnit, stepUnit, islandUnit, tierWashTexture } from './footwear/units.js';
import { styleFor, colourHex, printFor, shoeProducts, sectionOf, merchandise } from './footwear/catalog.js';
import { stdMat, glowMat, addMat, gildMat } from './footwear/progs.js';
import { ShoeBank } from './footwear/merged.js';
import { createTryOn } from './footwear/tryon.js';

const SNEAKER_FOOT = [0.34, 0.15], SNEAKER_H = 0.13;
// which bank (one draw call per LOD) each fixture's procedural shoes join
const BANK = { shoeWall1: 'wall1', shoeStep1: 'wall1', shoeWall2: 'wall2', shoeShelfBack: 'back', glassIsland: 'island' };

/**
 * Real lasts are not symmetric: the forefoot swings towards the big toe and the outer side tapers into the
 * toe. The lofted shoes come out symmetric, so every style geometry is bent into a LEFT foot here (local +x
 * = toe, medial = +z) and mirrored across z (winding flipped) for the RIGHT foot — pairs are real pairs.
 */
function handed(src, mirror) {
  const g = src.clone();
  const P = g.attributes.position, N = g.attributes.normal;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i); if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const L = Math.max(0.05, x1 - x0), W = 0.046, A = 0.12, B = 0.0045, sz = mirror ? -1 : 1;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    const u = Math.min(1, Math.max(0, ((x - x0) / L - 0.42) / 0.58));
    const s = u * u * (3 - 2 * u), ds = u > 0 && u < 1 ? 6 * u * (1 - u) / (0.58 * L) : 0;
    const off = A * (W - z) + B;
    const dzdx = ds * off, dzdz = 1 - s * A;
    P.setZ(i, sz * (z + s * off));
    const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    const mx = nx - nz * dzdx / dzdz, mz = nz / dzdz, l = Math.hypot(mx, ny, mz) || 1;
    N.setXYZ(i, mx / l, ny / l, sz * mz / l);
  }
  if (mirror && g.index) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

export async function build(ctx) {
  const { kit, q, catalog, layout } = ctx;
  const Z = layout.ZONES;
  const root = ctx.group('footwear');
  const R = kit.rng(20260923);
  const D = q.density ?? 1;
  const sneakersP = loadSneakers(ctx);           // network in parallel with the procedural work below

  // ------------------------------------------------------------------ fixtures (joinery baked per material)
  const batch = new Batch();
  const W1 = wallUnit(batch, 'shoeWall1', Z.shoeWall1, { tiers: Z.shoeWall1.tiers, perTier: Z.shoeWall1.perTier, rng: R });
  const ST = stepUnit(batch, 'shoeStep1', Z.shoeStep1, { steps: Z.shoeStep1.steps, rng: R });
  const W2 = wallUnit(batch, 'shoeWall2', Z.shoeWall2, { tiers: Z.shoeWall2.tiers, perTier: Z.shoeWall2.perTier, rng: R });
  // the narrow shelf: toes out to both sides, a little more angled (0.32 m per shoe)
  const NB = wallUnit(batch, 'shoeShelfBack', Z.shoeShelfBack, { tiers: Z.shoeShelfBack.tiers, perTier: Z.shoeShelfBack.perTier, angle: 0.52, toes: (i) => (i % 2 ? 1 : -1), rng: R });
  const IS = islandUnit(batch, 'glassIsland', Z.glassIsland, { perTier: Z.glassIsland.perTier, rng: R });

  const MAT = {
    wood: stdMat(ctx, 'espresso', 'walnut', { libOpts: { color: ctx.layout.PALETTE.shopEspresso }, roughness: 0.5 }),
    ivory: stdMat(ctx, 'ivorySatin', null, { color: ctx.layout.PALETTE.shopIvorySatin, roughness: 0.38 }),
    metal: stdMat(ctx, 'blackMetal', 'steel-black', { color: ctx.layout.PALETTE.shopBlackMetal }),
    // thin clear glass: low opacity + a strong environment reflection (the gild program, no transmission pass)
    glass: gildMat('glass', null, { opacity: 0.13, roughness: 0.03, env: 1.7, color: '#eef6f5' }),
    glow: glowMat('led'),
    wash: glowMat('tierWash', tierWashTexture(kit, W1.clear / W1.pitch), new THREE.Color(1, 1, 1)),
  };
  // the ivory satin sides only see the spots at a grazing angle: a faint self-fill keeps them ivory, not taupe
  MAT.ivory.emissive.set(ctx.layout.PALETTE.shopIvorySatin).multiplyScalar(0.14);
  const meshes = {};
  for (const key of batch.keys()) {
    const mat = MAT[key];
    const geo = batch.merge(key, { uv1: true }); if (!geo || !mat) continue;
    const m = new THREE.Mesh(geo, mat);
    m.name = 'footwear:' + key;
    m.receiveShadow = key === 'wood' || key === 'ivory' || key === 'metal';
    if (key === 'glass') m.renderOrder = 2;
    if (key === 'glow' || key === 'wash' || key === 'glass') m.raycast = () => {};
    root.add(m);
    meshes[key] = m;
  }

  // ------------------------------------------------------------------ merchandise (all real products)
  const M = shoeMaterials(ctx);
  const geoCache = new Map(), baseCache = new Map();
  const geoOf = (style, print, lite, mirror) => {
    const k0 = style + '|' + (print || '') + '|' + (lite ? 1 : 0), k = k0 + '|' + (mirror ? 'R' : 'L');
    if (!geoCache.has(k)) {
      if (!baseCache.has(k0)) { const g = STYLES[style].build({ print, lite }); g.computeBoundingBox(); baseCache.set(k0, g); }
      geoCache.set(k, handed(baseCache.get(k0), !!mirror));
    }
    return geoCache.get(k);
  };
  const heightOf = (p) => { const st = styleFor(p); return st === 'sneaker' ? SNEAKER_H : (geoOf(st, null, false, false), baseCache.get(st + '||0').boundingBox.max.y); };
  const sec = (...ids) => (p) => ids.includes(sectionOf(p));
  const tooTall = (p) => heightOf(p) + 0.006 > W1.clear;
  const products = shoeProducts(catalog);
  const placed = merchandise(products, [
    { units: ST.units, home: tooTall, fill: sec('boots'), vary: true },
    // the island mixes kinds like a real shop: every sneaker once, the rest the least-shown heels / flats / sandals
    { units: IS.units, home: sec('sneakers'), fill: sec('heels', 'flats', 'sandals', 'sneakers'), vary: true },
    { units: W1.units, home: sec('heels', 'sandals'), fill: sec('heels', 'sandals'), group: true, run: 2 },
    { units: W2.units, home: sec('boots', 'flats'), fill: sec('boots', 'flats'), group: true, run: 2 },
    { units: NB.units, home: () => true, fill: sec('heels', 'flats', 'sandals'), group: true, run: 2 },
  ], heightOf);
  const shoes = [];
  let pairs = 0;
  for (const { unit, product, ci } of placed) {
    const pairId = unit.shoes.length > 1 ? pairs++ : undefined;
    for (const sh of unit.shoes) {
      const s = { product, ci, style: styleFor(product), fixture: unit.fixture, tier: unit.tier, pos: sh.pos, yaw: sh.yaw, mirror: sh.mirror, pairId, glass: !!unit.glass, lite: D < 0.95 && unit.outer };
      const c = product.colours[ci] || null;
      if (s.style === 'sneaker') Object.assign(s, sneakerColour(c));
      else { s.color = colourHex(product, ci); s.print = printFor(c) || undefined; }
      s.matrix = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(s.pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1));
      shoes.push(s);
    }
  }

  // ------------------------------------------------------------------ procedural shoes: one bank per fixture group
  const banks = {};
  const lodEntries = [];
  const lods = D < 0.75 ? [true] : [false, true];
  for (const s of shoes) {
    if (s.style === 'sneaker') continue;
    const key = BANK[s.fixture];
    if (!banks[key]) banks[key] = new ShoeBank(key, M.shoe, geoOf, lods);
    banks[key].add(s);
  }
  for (const b of Object.values(banks)) {
    root.add(b.build());
    if (b.lods.length > 1) lodEntries.push({ box: b.box.clone().expandByScalar(0.1), near: 2.2, set: (l) => b.setLevel(l) });
  }

  // ------------------------------------------------------------------ sneakers
  const S = await sneakersP;
  const sneakerItems = shoes.filter(s => s.style === 'sneaker');
  const sneakerMeshes = buildSneakerStock(ctx, S, sneakerItems);
  for (const m of sneakerMeshes) root.add(m);
  lodEntries.push(...meshLods(sneakerMeshes, 2.4));
  ctx.onUpdate(lodSwitcher(ctx, lodEntries));

  // ------------------------------------------------------------------ contact shadows (one mesh)
  const sh = new ShadowBatch();
  for (const s of shoes) {
    const [fw, fd] = s.style === 'sneaker' ? SNEAKER_FOOT : STYLES[s.style].foot;
    sh.add(s.pos[0], s.pos[1] + 0.0015, s.pos[2], fw * 1.05, fd, s.yaw, s.glass ? 0.4 : s.pos[1] > 0.3 ? 0.55 : 0.5);
  }
  for (const id of ['shoeWall1', 'shoeWall2', 'shoeShelfBack', 'shoeStep1', 'glassIsland']) {
    const z = Z[id];
    sh.add(z.cx, 0.002, z.cz, z.w + 0.1, z.d + 0.12, z.yaw, id === 'glassIsland' ? 0.6 : 0.5);
  }
  root.add(sh.mesh(addMat));

  kit.freeze(root);

  // ------------------------------------------------------------------ colliders (every unit, 2 cm clearance)
  for (const id of ['shoeWall1', 'shoeWall2', 'shoeShelfBack', 'shoeStep1', 'glassIsland']) {
    const z = Z[id];
    ctx.colliders.addBox(z.cx, z.cz, z.w + 0.04, z.d + 0.04, z.yaw);
  }

  // ------------------------------------------------------------------ interactions (catalogue cards)
  const tryOn = createTryOn(ctx);
  const col = new THREE.Color();
  const pairOf = (it) => (it.pairId !== undefined ? shoes.filter(o => o.pairId === it.pairId) : [it]);
  const burstAt = (it, color) => ctx.fx.burst(new THREE.Vector3(it.pos[0], it.pos[1] + 0.1, it.pos[2]), { color, count: 24 });
  function recolour(o, i) {
    const p = o.product, c = p.colours[i]; if (!c) return;
    o.ci = i;
    if (o.style === 'sneaker') setSneakerColour(o, c);
    else o.bank.setColour(o, c.swatch, printFor(c) || undefined);
  }
  function tryOnAction(it) {
    return { label: 'Try it on ✦', run: () => {
      if (it.style === 'sneaker') { if (it.mesh) tryOn.start(it.mesh, it.index); return; }
      if (!it.bank || it.flying) return;
      const fl = new THREE.InstancedMesh(geoOf(it.style, it.print, false, it.mirror), M.shoe, 1);
      fl.setMatrixAt(0, it.matrix); fl.setColorAt(0, col.set(it.color)); fl.name = 'footwear:floater'; fl.frustumCulled = false; fl.raycast = () => {};
      root.add(fl); it.bank.hide(it); it.flying = true;
      tryOn.start(fl, 0, { onDone: () => { it.bank.show(it); root.remove(fl); fl.dispose(); it.flying = false; } });
    } };
  }
  const sizeGuide = { label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') };
  function cardFor(it, extraActions = []) {
    if (!it || !it.product) return null;
    const p = it.product, pair = pairOf(it);
    const hooks = p.colours.map((c, i) => ({ apply: () => { for (const o of pair) recolour(o, i); burstAt(it, c.swatch || '#f6dd8c'); } }));
    const info = catalog.card(p, { colorways: hooks, actions: [...extraActions, sizeGuide] });
    if (!info) return null;
    // the colour on display first (the card opens with swatch 0 selected)
    const cur = it.ci % Math.max(1, info.colorways.length);
    if (cur > 0) info.colorways = [...info.colorways.slice(cur), ...info.colorways.slice(0, cur)];
    return info;
  }
  for (const b of Object.values(banks)) ctx.interact.add(b.mesh, (hit) => { const it = b.itemAt(hit.faceIndex); return cardFor(it, [tryOnAction(it)]); });
  for (const m of sneakerMeshes) ctx.interact.add(m, (hit) => { const it = m.userData.items[hit.instanceId]; return cardFor(it, [tryOnAction(it)]); });

  ctx.onUpdate((dt) => { if (tryOn.busy) tryOn.update(dt); });
  window.__fw = { shoes, placed, meshes, banks, sneakerMeshes, tryOn, geoCache,
    counts: { slots: shoes.length, products: new Set(shoes.map(s => s.product.id)).size, of: products.length, sneakers: sneakerItems.length, procedural: shoes.length - sneakerItems.length, styles: geoCache.size } };
}
