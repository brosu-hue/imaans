// Module: footwear — the Shoes department of IMAANS (the hero department: Imaan's *Shoes*).
// Zones: sneakerWall, shoeStage, benchL, benchR, shoeRug (see CONTRACT.md / core/layout.js).
//
//  • Wall: seven arched niches (black lacquer + gold beads, or warm oak: ?fwniche=oak) in front of the
//    charcoal back wall — warm backlit panels, oak shelves with brass nosing + LED lines, stock cubbies of
//    matte-black IMAANS boxes (gold crown + wordmark), a gold-on-black section plaque in every arch crown.
//    The catalogue merchandises it: sections Sneakers · Boots · Heels · Flats · Sandals come from the
//    products' tags (footwear/catalog.js), each niche shows its section's real products in their real
//    colours, and every shoe's 3-D style follows the product kind (footwear/lasts.js: courts, block &
//    kitten heels, chelsea / heeled / western / desert / faux-fur / riding / rain boots, ballet, Mary Jane,
//    loafers, monks, brogues, mules, slides, strappy / gladiator / espadrille / wedge / platform sandals;
//    sneakers = the Shopify GLB with a tint-mask colourway atlas).
//  • Salon: tiered pale-stone stage with gold edges + a glowing shadow-gap ring, the three catalogue
//    sneakers turning on acrylic risers (tap: colourways + "Spin it"), cognac-leather tufted benches,
//    fitting stool, floor mirror, brass shoe horn, an open IMAANS box with ivory tissue, the IMAANS rug.
// Performance: every procedural shoe of a wall section is ONE draw call (footwear/merged.js); joinery,
// rug, LEDs, shadows, acrylic and plaques share the architecture's shader programs (footwear/progs.js),
// so footwear itself compiles just two material programs (shoe material + sneaker atlas) — measured +2 programs
// at low, +3 at mid (the extra one is a shadow-depth variant) over architecture alone.
// Interactions: tap a shoe → catalogue card (name, Rand price, EU sizes with sold-out, the product's own
// colours — tapping one recolours the pair), "Try it on ✦" floats the shoe out and spins it.
import * as THREE from 'three';
import { Batch, ShadowBatch, mat4 } from './footwear/util.js';
import { STYLES } from './footwear/lasts.js';
import { shoeMaterials } from './footwear/shoeMats.js';
import { loadSneakers, buildSneakerStock, buildHeroes, sneakerColour, setSneakerColour, lodSwitcher, meshLods } from './footwear/sneakers.js';
import { WALL, buildWall, panelGlowTexture, plaqueTexture, wallMerch, shoeBoxGeometry, openBoxGeometry } from './footwear/wall.js';
import { STAGE, RUG, BENCHES, BENCH, buildStage, stageHalo, buildBenches, buildStool, buildMirror, shoeHornGeometry, buildRug } from './footwear/salon.js';
import { wallSections, styleFor, SECTION_LABEL, colourHex, printFor, shoeSizeRange, shoeProducts, sectionOf } from './footwear/catalog.js';
import { stdMat, glowMat, addMat, gildMat } from './footwear/progs.js';
import { ShoeBank } from './footwear/merged.js';
import { createTryOn } from './footwear/tryon.js';

const SNEAKER_FOOT = [0.34, 0.15];

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

/** Soft-focus "reflection" of the lit shop for the floor mirror: plaster + downlights, a joinery band, oak floor. */
function mirrorTexture(kit) {
  return kit.canvasTexture(192, 288, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, '#d9cfc0'); v.addColorStop(0.42, '#cdbfad'); v.addColorStop(0.5, '#6f6053'); v.addColorStop(0.6, '#5a4a3d');
    v.addColorStop(0.66, '#a07650'); v.addColorStop(1, '#8a6441');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    const blob = (x, y, r, c) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
    blob(w * 0.3, h * 0.12, 46, 'rgba(255,244,226,0.75)'); blob(w * 0.78, h * 0.2, 36, 'rgba(255,240,220,0.55)');
    blob(w * 0.55, h * 0.53, 40, 'rgba(255,196,130,0.35)');                        // a warm niche glow across the room
    blob(w * 0.18, h * 0.55, 30, 'rgba(236,226,210,0.3)');
    blob(w * 0.6, h * 0.8, 70, 'rgba(255,226,180,0.18)');                          // light pool on the floor
    // glass sheen + a soft darkening towards the frame
    const d = g.createLinearGradient(0, h * 0.1, w, h * 0.55);
    d.addColorStop(0.3, 'rgba(255,255,255,0)'); d.addColorStop(0.42, 'rgba(255,255,255,0.14)'); d.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = d; g.fillRect(0, 0, w, h);
    const e = g.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, h * 0.62);
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(20,14,10,0.28)');
    g.fillStyle = e; g.fillRect(0, 0, w, h);
  });
}

export async function build(ctx) {
  const { kit, q, catalog } = ctx;
  const root = ctx.group('footwear');
  const times = {}; let _t = performance.now(); const lap = (k) => { const n = performance.now(); times[k] = Math.round(n - _t); _t = n; };
  window.__fwTimes = times;
  const R = kit.rng(20260923);
  const D = q.density ?? 1;
  const finish = (ctx.params && ctx.params.get('fwniche')) || 'lacquer';
  const sneakersP = loadSneakers(ctx);           // network in parallel with the procedural work below

  // ------------------------------------------------------------------ the catalogue's plan for the wall
  const plan = wallSections(catalog, WALL.cx.length);
  const labels = [...new Set(plan.niches.map(n => n.section))];
  const plaqueRow = plan.niches.map(n => labels.indexOf(n.section));

  // ------------------------------------------------------------------ static joinery (merged by material)
  const batch = new Batch();
  buildWall(ctx, batch, { labels: labels.map(s => SECTION_LABEL[s] || s), plaqueRow }); lap('wall');
  const stage = buildStage(ctx, batch, kit);
  buildBenches(ctx, batch);
  buildStool(ctx, batch, [3.1, 0, -7.74], 0);
  buildMirror(ctx, batch, [-4.5, 0, -9.3], 0.62);
  shoeHornGeometry().forEach(g => batch.add('brass', g, mat4([-2.62, BENCH.seat + 0.013, -8.36], [0, 0.42, 0])));
  // stool oak joins the shelf oak (UVs swapped so the rotated grain runs lengthwise)
  for (const g of batch.parts.get('oakH') || []) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, uv.getY(i), u); } (batch.parts.get('shelf') || []).push(g); }
  batch.parts.delete('oakH');
  lap('salon');

  const plaques = plaqueTexture(kit, ctx.fonts, labels.map(s => SECTION_LABEL[s] || s));
  const lacquer = stdMat(ctx, 'lacquer', 'lacquer-black', { roughness: 0.32, env: 0.72 });
  const oak = stdMat(ctx, 'oak', 'oak', { libOpts: { rotation: Math.PI / 2 } });
  const MAT = {
    carcass: finish === 'oak' ? oak : lacquer,
    shelf: oak,
    brass: stdMat(ctx, 'brass', 'brass'),
    panel: glowMat('panel', panelGlowTexture(kit), new THREE.Color(1.5, 1.42, 1.34)),
    glow: glowMat('glow'),
    cubby: stdMat(ctx, 'cubby', 'oak-smoked'),
    stone: stdMat(ctx, 'stone', 'concrete', { libOpts: { color: '#cbc2b4' }, roughness: 0.7 }),
    stoneTop: stdMat(ctx, 'stoneTop', 'concrete', { libOpts: { color: '#dcd4c7' }, roughness: 0.62 }),
    acrylic: gildMat('acrylic', null, { opacity: 0.26, roughness: 0.04, env: 1.8, color: '#eef7fb' }),
    leather: stdMat(ctx, 'leather', 'leather-cognac', { roughness: 0.5, color: '#93613c' }),   // caramel, not oxblood, under the warm spots
    lacquer, plaque: lacquer,
    // the low floor mirror: in the env map it only ever saw the dusk storefront (a dark grey pane), so it shows
    // a painted, soft-focus reflection of the lit store instead (shared unlit glow program, no extra pass)
    mirror: glowMat('mirror', mirrorTexture(kit), new THREE.Color(1.0, 0.98, 0.95)),
    // matte gold-on-black face: no metal sheen, so the centre plaque isn't washed out by the ceiling ring
    label: gildMat('label', plaques.tex, { emissive: new THREE.Color(1.05, 0.8, 0.46), metalness: 0, roughness: 0.62, env: 0.25, depthWrite: true }),
  };
  const byMat = new Map();
  for (const key of batch.keys()) { const m = MAT[key] || oak; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(key); }
  const meshes = {};
  for (const [mat, keys] of byMat) {
    const all = []; for (const k of keys) all.push(...batch.parts.get(k));
    batch.parts.set('__' + mat.name, all);
    const geo = batch.merge('__' + mat.name, { uv1: true }); if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.name = mat.name;
    m.castShadow = [oak, lacquer, MAT.stone, MAT.stoneTop, MAT.leather, MAT.brass, MAT.cubby].includes(mat);
    m.receiveShadow = ![MAT.glow, MAT.panel, MAT.acrylic, MAT.mirror, MAT.label].includes(mat);
    if (mat === MAT.acrylic) m.renderOrder = 2;
    if (mat === MAT.glow || mat === MAT.panel) m.raycast = () => {};
    root.add(m);
    for (const k of keys) meshes[k] = m;
  }
  const rug = buildRug(ctx); root.add(rug);
  root.add(stageHalo(kit));
  lap('merge');

  // ------------------------------------------------------------------ merchandise (all real products)
  const { shoes, boxes } = wallMerch(R, D, plan.niches, styleFor);
  const T2 = STAGE.tiers[1][1];
  const pick = (kind, key) => catalog.pick(kind, key);
  const salonPair = (p, ci, a, b, extra = {}) => {
    const st = styleFor(p), id = 'salon-' + (shoes.length);
    // left / right foot from where the second shoe stands relative to the first one's toe direction
    if (a.mirror === undefined || b.mirror === undefined) {
      const fx = Math.cos(a.yaw), fz = -Math.sin(a.yaw);
      const bRight = (b.pos[0] - a.pos[0]) * -fz + (b.pos[2] - a.pos[2]) * fx > 0;
      a = { ...a, mirror: !bRight }; b = { ...b, mirror: bRight };
    }
    shoes.push({ product: p, ci, style: st, salon: true, pairId: id, ...a, ...extra });
    shoes.push({ product: p, ci, style: st, salon: true, pairId: id, ...b, ...extra });
  };
  // stage picks come straight from the catalogue's shoe sections (stable, never a non-shoe)
  const bySection = (sec, k) => { const l = shoeProducts(catalog).filter(p => sectionOf(p) === sec); return l.length ? l[k % l.length] : pick('sneaker', 'stage-' + sec + k); };
  const T1 = STAGE.tiers[0][1], SZ = STAGE.cz;
  // the stage's middle tier: a court pair and a boot pair
  salonPair(pick('heel', 'stage-heels'), 1, { pos: [-0.36, T2, SZ - 0.42], yaw: 2.35 }, { pos: [-0.47, T2, SZ - 0.3], yaw: 2.2 });
  salonPair(pick('boot', 'stage-boots'), 0, { pos: [0.4, T2, SZ - 0.4], yaw: 0.72 }, { pos: [0.52, T2, SZ - 0.26], yaw: 0.86 });
  // the bottom tier: flats front-centre, a loafer pair on the left flank, sandals on the right (toes to the aisle)
  salonPair(bySection('flats', 1), 0, { pos: [-0.03, T1, SZ + 0.8], yaw: -0.3 }, { pos: [0.035, T1, SZ + 0.905], yaw: -0.36 });
  salonPair(bySection('flats', 0), 1, { pos: [-0.8, T1, SZ - 0.03], yaw: -1.9 }, { pos: [-0.905, T1, SZ + 0.02], yaw: -1.84 });
  salonPair(bySection('sandals', 2), 0, { pos: [0.8, T1, SZ - 0.03], yaw: -1.24 }, { pos: [0.905, T1, SZ + 0.02], yaw: -1.3 });
  // in front of bench L: a pair of heels, one tipped over
  salonPair(pick('heel', 'bench-left'), 0, { pos: [-3.42, RUG.h, BENCHES[0].cz + 0.52], yaw: -1.1 }, { pos: [-3.12, RUG.h + 0.034, BENCHES[0].cz + 0.6], yaw: -1.9, roll: 1.42 });
  // by bench R: a sneaker pair kicked off on the rug
  salonPair(pick('sneaker', 'bench-right'), 1, { pos: [2.42, RUG.h, BENCHES[1].cz + 0.5], yaw: -2.2, mirror: false }, { pos: [2.63, RUG.h, BENCHES[1].cz + 0.56], yaw: -1.75, mirror: true });
  // the open box on bench R's seat
  const boxShoe = pick('sneaker', 'open-box');
  shoes.push({ product: boxShoe, ci: 0, style: styleFor(boxShoe), salon: true, inBox: true, pos: [3.58, BENCH.seat + 0.074, BENCHES[1].cz - 0.02], yaw: 0.2, mirror: true });
  // box stacks next to bench R + one by the mirror
  const stackAt = (x, z, n, yaw0) => { for (let i = 0; i < n; i++) boxes.push({ pos: [x + R.range(-0.012, 0.012), RUG.h + i * 0.128, z + R.range(-0.01, 0.01)], yaw: yaw0 + R.range(-0.09, 0.09) }); };
  stackAt(4.3, -8.78, 4, 0.12); stackAt(4.36, -8.32, 2, -0.3); stackAt(-4.02, -9.55, 3, 0.5);
  // colours + prints from the catalogue
  for (const s of shoes) {
    const c = s.product.colours[s.ci % Math.max(1, s.product.colours.length)] || null;
    s.ci = s.product.colours.length ? s.ci % s.product.colours.length : 0;
    if (s.style === 'sneaker') Object.assign(s, sneakerColour(c));
    else { s.color = colourHex(s.product, s.ci); s.print = printFor(c) || undefined; }
    s.matrix = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(s.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(s.tilt || 0, s.yaw, s.roll || 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  }
  lap('merch');

  // ------------------------------------------------------------------ procedural shoes: one bank per wall section + salon
  const M = shoeMaterials(ctx);
  const geoCache = new Map();
  const baseCache = new Map();
  const geoOf = (style, print, lite, mirror) => {
    const k0 = style + '|' + (print || '') + '|' + (lite ? 1 : 0), k = k0 + '|' + (mirror ? 'R' : 'L');
    if (!geoCache.has(k)) {
      if (!baseCache.has(k0)) baseCache.set(k0, STYLES[style].build({ print, lite }));
      geoCache.set(k, handed(baseCache.get(k0), !!mirror));
    }
    return geoCache.get(k);
  };
  const banks = {};
  const lodEntries = [];
  for (const s of shoes) {
    if (s.style === 'sneaker') continue;
    const key = s.salon ? 'salon' : s.pos[0] < -2.6 ? 'L' : s.pos[0] > 2.6 ? 'R' : 'C';
    if (!banks[key]) banks[key] = new ShoeBank(key, M.shoe, geoOf, key === 'salon' ? [false] : [false, true]);
    banks[key].add(s);
  }
  for (const b of Object.values(banks)) {
    root.add(b.build());
    if (b.lods.length > 1) lodEntries.push({ box: b.box.clone().expandByScalar(0.2), near: 4.2, set: (l) => b.setLevel(l) });
  }
  lap('dressShoes');

  // ------------------------------------------------------------------ IMAANS shoe boxes (instanced, shoe program)
  const boxMesh = kit.instanced(shoeBoxGeometry(), M.shoe, boxes.map(b => ({ position: b.pos, rotation: [0, b.yaw, 0], color: '#ffffff' })));
  boxMesh.name = 'footwear:boxes'; root.add(boxMesh);
  const openBox = kit.instanced(openBoxGeometry(R), M.shoe, [{ position: [3.58, BENCH.seat + 0.004, BENCHES[1].cz - 0.02], rotation: [0, 0.2, 0], color: '#ffffff' }]);
  openBox.name = 'footwear:openBox'; root.add(openBox);

  // ------------------------------------------------------------------ sneakers (wall + salon stock, heroes)
  const S = await sneakersP; lap('sneakerLoad');
  const sneakerItems = shoes.filter(s => s.style === 'sneaker');
  const sneakerMeshes = buildSneakerStock(ctx, S, sneakerItems);
  for (const m of sneakerMeshes) root.add(m);
  lodEntries.push(...meshLods(sneakerMeshes, 4.6));
  // heroes: the catalogue's sneakers / runners, one per riser (repeats take the next colour)
  const sneakerProducts = shoeProducts(catalog).filter(p => sectionOf(p) === 'sneakers');
  const heroList = sneakerProducts.length ? sneakerProducts : [pick('sneaker', 'hero')];
  const heroItems = stage.risers.map((r, i) => {
    const p = heroList[i % heroList.length], ci = Math.floor(i / heroList.length) % Math.max(1, p.colours.length);
    return { product: p, ci, style: 'sneaker', hero: i, pos: [r.wx, r.top + 0.0006, r.wz], yaw: [0.4, 2.1, -1.2][i % 3], ...sneakerColour(p.colours[ci]) };
  });
  const heroes = buildHeroes(ctx, S, heroItems);
  root.add(heroes);
  const heroSpin = [0.32, -0.26, 0.28];
  const hm = new THREE.Matrix4(), hq = new THREE.Quaternion(), hp = new THREE.Vector3(), hs = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const placeHeroes = () => { heroItems.forEach((it, i) => { hq.setFromAxisAngle(Y, it.yaw); heroes.setMatrixAt(i, hm.compose(hp.fromArray(it.pos), hq, hs)); }); heroes.instanceMatrix.needsUpdate = true; };
  placeHeroes();
  const heroBox = new THREE.Box3(); heroItems.forEach(it => heroBox.expandByPoint(new THREE.Vector3().fromArray(it.pos))); heroBox.expandByScalar(0.3);
  lodEntries.push({ box: heroBox, near: 5.5, set: (l) => { heroes.geometry = heroes.userData.lods[l]; } });
  ctx.onUpdate(lodSwitcher(ctx, lodEntries));
  lap('heroes');

  // ------------------------------------------------------------------ contact shadows (one mesh)
  const sh = new ShadowBatch();
  for (const s of shoes) {
    if (s.inBox) continue;
    const [fw, fd] = s.style === 'sneaker' ? SNEAKER_FOOT : STYLES[s.style].foot;
    const lying = Math.abs(s.roll || 0) > 0.5;
    sh.add(s.pos[0], (lying ? s.pos[1] - 0.034 : s.pos[1]) + 0.0015, s.pos[2], fw * 1.05, fd * (lying ? 1.5 : 1), s.yaw, s.pos[1] > 0.3 ? 0.55 : 0.5);
  }
  for (const b of boxes) if (b.pos[1] < 0.02 || Math.abs(b.pos[1] - WALL.floor) < 0.01) sh.add(b.pos[0], b.pos[1] + 0.0015, b.pos[2], 0.42, 0.28, b.yaw, 0.55);
  for (const r of stage.risers) sh.add(r.wx, r.base + 0.0015, r.wz, r.r * 2.8, r.r * 2.8, 0, 0.35);
  sh.add(STAGE.cx, RUG.h + 0.001, STAGE.cz, 2.45, 2.45, 0, 0.42);
  for (const b of BENCHES) {
    sh.add(b.cx, RUG.h + 0.001, b.cz, BENCH.w + 0.35, BENCH.d + 0.35, 0, 0.36);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sh.add(b.cx + sx * (BENCH.w / 2 - 0.09), RUG.h + 0.0015, b.cz + sz * (BENCH.d / 2 - 0.075), 0.1, 0.1, 0, 0.55);
  }
  sh.add(3.1, RUG.h + 0.001, -7.74, 0.5, 0.44, 0, 0.5);             // stool
  sh.add(-4.5, RUG.h + 0.001, -9.34, 0.72, 0.42, 0.62, 0.45);        // mirror
  sh.add(3.58, BENCH.seat + 0.012, BENCHES[1].cz - 0.02, 0.44, 0.3, 0.2, 0.45); // open box on the seat
  sh.add(-2.62 + 0.2, BENCH.seat + 0.012, -8.36 - 0.08, 0.5, 0.08, 0.42, 0.3); // shoe horn
  for (const cx of WALL.cx) sh.add(cx, 0.002, WALL.front + 0.04, WALL.W + 0.12, 0.2, 0, 0.5); // wall units on the floor
  root.add(sh.mesh(addMat));

  kit.freeze(root);

  // ------------------------------------------------------------------ colliders
  ctx.colliders.addBox(0, WALL.z0 + WALL.depth / 2 + 0.01, WALL.cx[6] - WALL.cx[0] + WALL.W + 0.04, WALL.depth + 0.04);
  ctx.colliders.addCircle(STAGE.cx, STAGE.cz, STAGE.tiers[0][0] + 0.03);
  for (const b of BENCHES) ctx.colliders.addBox(b.cx, b.cz, BENCH.w + 0.04, BENCH.d + 0.04);
  ctx.colliders.addBox(3.1, -7.74, 0.38, 0.34);
  ctx.colliders.addBox(-4.5, -9.3, 0.62, 0.42, 0.62);
  ctx.colliders.addBox(4.33, -8.55, 0.42, 0.72);
  ctx.colliders.addBox(-4.02, -9.55, 0.38, 0.34, 0.5);

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
      if (it.style === 'sneaker') { if (it.mesh && !it.hero) tryOn.start(it.mesh, it.index); return; }
      if (!it.bank || it.flying) return;
      const fl = new THREE.InstancedMesh(geoOf(it.style, it.print, false, it.mirror), M.shoe, 1);
      fl.setMatrixAt(0, it.matrix); fl.setColorAt(0, col.set(it.color)); fl.name = 'footwear:floater'; fl.frustumCulled = false; fl.raycast = () => {};
      root.add(fl); it.bank.hide(it); it.flying = true;
      tryOn.start(fl, 0, { onDone: () => { it.bank.show(it); root.remove(fl); fl.dispose(); it.flying = false; } });
    } };
  }
  const sizeLine = shoeSizeRange(catalog);
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
  for (const m of sneakerMeshes) ctx.interact.add(m, (hit) => { const it = m.userData.items[hit.instanceId]; return cardFor(it, it && !it.inBox ? [tryOnAction(it)] : []); });
  const boost = heroItems.map(() => 0);
  ctx.interact.add(heroes, (hit) => {
    const i = hit.instanceId, it = heroItems[i]; if (!it) return null;
    return cardFor(it, [{ label: 'Spin it ✦', run: () => { boost[i] = 1; ctx.fx.burst(new THREE.Vector3(it.pos[0], it.pos[1] + 0.12, it.pos[2]), { color: '#f6dd8c', count: 40 }); } }]);
  });
  const shoesDept = (ctx.brand.departments || []).find(d => d.id === 'shoes');
  const boxInfo = {
    title: ctx.brand.name + ' shoe box', tag: ctx.brand.legalName,
    subtitle: [shoesDept ? shoesDept.description : '', sizeLine ? 'Sizes ' + sizeLine + '.' : ''].filter(Boolean).join(' '),
    actions: [sizeGuide, { label: 'Delivery & collection', run: () => ctx.ui.showInfo('shipping-delivery') }],
  };
  ctx.interact.add(boxMesh, boxInfo);
  const openBoxItem = shoes.find(s => s.inBox);
  ctx.interact.add(openBox, () => cardFor(openBoxItem) || boxInfo);
  if (meshes.leather) ctx.interact.add(meshes.leather, { title: 'Try-on bench', tag: 'Shoes', subtitle: `Take a seat and try them on${sizeLine ? ' — ' + sizeLine : ''}. ${ctx.brand.slogan || ''}`.trim(), actions: [sizeGuide, { label: 'Visit the shop', run: () => ctx.ui.showInfo('visit') }] });
  if (meshes.mirror) ctx.interact.add(meshes.mirror, { title: 'Fitting mirror', tag: 'Shoes', subtitle: 'Angled low so you can see the shoe, not the socks.', onTap: () => ctx.ui.toast('Looking sharp ✦') });

  // ------------------------------------------------------------------ hotspots
  ctx.hotspots.add({ id: 'sneakers', label: 'Shoes — the wall', pos: [0, ctx.layout.EYE, -5.6], look: [0, 1.62, -10.8], order: 42 });
  ctx.hotspots.add({ id: 'shoe-stage', label: 'Shoes — try-on salon', pos: [1.7, 1.5, -6.05], look: [-0.25, 0.55, -8.35], order: 45 });

  // ------------------------------------------------------------------ per-frame (tiny)
  ctx.onUpdate((dt) => {
    if (!ctx.shotMode) {
      for (let i = 0; i < heroItems.length; i++) {
        boost[i] = Math.max(0, boost[i] - dt * 0.45);
        heroItems[i].yaw += dt * (heroSpin[i % 3] + Math.sign(heroSpin[i % 3]) * 7 * boost[i] * boost[i]);
      }
      placeHeroes();
    }
    if (tryOn.busy) tryOn.update(dt);
  });
  lap('finish');
  window.__fw = { shoes, boxes, meshes, banks, sneakerMeshes, heroes, heroItems, tryOn, plan, geoCache,
    counts: { sneakers: sneakerItems.length, procedural: shoes.length - sneakerItems.length, boxes: boxes.length, styles: geoCache.size } };
}
