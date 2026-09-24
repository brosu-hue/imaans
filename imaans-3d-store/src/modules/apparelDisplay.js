// Module: apparelDisplay — the two dressed mannequins in the left window and the folded-shelf unit on the right
// wall of the real IMAANS shop (docs/REAL-LAYOUT.md). Zones (ctx.layout.ZONES): windowMannequins, foldedShelves.
//
// Merchandising is data: layout.splitClothes(byCategory('clothes')) gives the window its two lead pieces (each
// worn by the baked figure whose silhouette fits it — figures.figureFor) and the shelves their folded clothes;
// apparelRails hangs the rest, so every clothing product is shown at least once. The folded unit is built here
// whole (espresso carcass, five shelves at ZONES.foldedShelves.shelfY, warm LED lips); its two lowest shelves hold
// 5 folded stacks each, the three upper ones are left EMPTY for the fixtures module (accShelves).
//
// Mannequins are dressed SDF figures baked offline (tools/apparelDisplay-bake.mjs → assets/models/
// mannequin-*.glb). At runtime every figure part is merged per material, recoloured from its look's products,
// and a shared vertex patch turns a figure on its base when tapped (no extra draw calls). Folded stacks are
// instanced with per-stack cards + colourways. Shader programs are shared with apparelRails (fabrics, LEDs /
// glows / contact shadows on architecture's programs) — see apparelRails/imaans.js.
//
// Helpers: apparelDisplay/{util,figures,folded,stacks}.js
import * as THREE from 'three';
import { Batch, createTurnUniform, rbox, mat4 } from './apparelDisplay/util.js';
import { buildFigures, figureFor } from './apparelDisplay/figures.js';
import { foldedGeo } from './apparelDisplay/folded.js';
import { Stacks } from './apparelDisplay/stacks.js';
import { makeGlow } from './apparelRails/labels.js';
import { lineOf, lightToDark, productCard, albedo, swatchOf, ShadowQuads, ledMaterial, glowMaterial } from './apparelRails/imaans.js';

// Window figures turn from the street toward the door (deg, +y): they face the pavement start view three-quarters
// and still read in profile from inside the shop.
const WINDOW_ROT = [30, 26];

// Folded unit joinery (m): off the wall (clears the skirting), board thicknesses, stacks.
const GAP = 0.017, PANEL = 0.018, CHEEK = 0.03, SHELF_T = 0.03, TOP_T = 0.035;
const STACK = { w: 0.17, d: 0.28, pitch: 0.195 };
// Folded lines (one InstancedMesh each): geometry at real size, fabric, garments per stack.
const FOLDS = {
  knit:   { geo: { w: STACK.w, h: 0.055, d: STACK.d }, fabric: 'knit', n: 3 },
  cotton: { geo: { w: STACK.w, h: 0.04, d: STACK.d, collar: false, inner: 1 }, fabric: 'cotton', n: 4 },
  denim:  { geo: { w: STACK.w, h: 0.042, d: STACK.d, collar: false, inner: 1 }, fabric: 'denim', n: 4 },
};
const foldLine = p => { const l = lineOf(p); return l === 'knit' || l === 'cable' ? 'knit' : l === 'jeans' ? 'denim' : 'cotton'; };
const isTop = p => ['knit', 'cable', 'camisole', 'shirt'].includes(lineOf(p));

/** The two window figures: lead product (splitClothes), baked figure, footprint centre, turn, height. */
function windowPlan(ctx) {
  const Z = ctx.layout.ZONES.windowMannequins;
  const { mannequins } = ctx.layout.splitClothes(ctx.catalog.byCategory('clothes'));
  const taken = new Set();
  return Z.items.map((it, i) => {
    const lead = mannequins[i] || null;
    const { id, part, shoe } = figureFor(lead || { tags: [], name: '' }, taken);
    return { id, part, lead, shoe, zone: 'window', pos: [it.cx, 0, it.cz], rot: WINDOW_ROT[i % WINDOW_ROT.length], height: it.h, centre: true };
  });
}

/** Start every download before any module builds (they stream in while architecture builds). */
export function setup(ctx) {
  for (const f of windowPlan(ctx)) ctx.assets.gltf('mannequin-' + f.id).catch(() => {});
  ctx.assets.gltf('shoe').catch(() => {});
  ctx.assets.gltf('shoe-lod').catch(() => {});
}

export async function build(ctx) {
  const t0 = performance.now();
  const { mats, layout } = ctx;
  const root = ctx.group('apparelDisplay');
  const staticBatch = new Batch();
  const shadows = new ShadowQuads();
  const stacks = new Stacks(ctx);
  stacks.tint = albedo;
  const U = createTurnUniform();
  const times = {};
  let t = performance.now();

  // ---------------------------------------------------------------------------------------------
  // Folded shelves: the whole unit (built facing +z in the zone frame, turned to the right wall)
  // ---------------------------------------------------------------------------------------------
  const Z = layout.ZONES.foldedShelves, SY = Z.shelfY;
  const Mz = mat4([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  const at = (x, y, z) => Mz.clone().multiply(mat4([x, y, z]));
  const W = Z.w, H = Z.h, zWall = -Z.d / 2, zBack = zWall + GAP + PANEL, zFront = Z.d / 2, xIn = W / 2 - CHEEK, D = zFront - zBack;
  staticBatch.add('wood', rbox(W, H, PANEL, 0.003, 1, true), { matrix: at(0, H / 2, zWall + GAP + PANEL / 2) });
  for (const s of [-1, 1]) staticBatch.add('wood', rbox(CHEEK, H, zFront - zWall - GAP, 0.004, 1, true), { matrix: at(s * (W / 2 - CHEEK / 2), H / 2, (zWall + GAP + zFront) / 2) });
  staticBatch.add('wood', rbox(W, TOP_T, zFront - zWall - GAP, 0.005, 1), { matrix: at(0, H - TOP_T / 2, (zWall + GAP + zFront) / 2) });
  staticBatch.add('wood', rbox(2 * xIn, SY[0] - SHELF_T, D - 0.03, 0.003, 1), { matrix: at(0, (SY[0] - SHELF_T) / 2, zBack + (D - 0.03) / 2) });   // recessed kick
  const lit = [];   // board undersides with an LED lip: shelves 1 … 4 and the top
  SY.forEach((y, i) => {
    staticBatch.add('wood', rbox(2 * xIn, SHELF_T, D, 0.004, 1), { matrix: at(0, y - SHELF_T / 2, zBack + D / 2) });
    if (i) lit.push(y - SHELF_T);
  });
  lit.push(H - TOP_T);
  for (const y of lit) {
    staticBatch.add('led', rbox(2 * xIn - 0.04, 0.005, 0.012, 0.001, 1), { matrix: at(0, y - 0.0025, zFront - 0.03) });
    const below = SY.filter(s => s < y - 0.01).pop() ?? 0;
    staticBatch.add('glow', glowQuad(-xIn, xIn, Math.max(below, y - 0.42), y, zBack + 0.002), { matrix: Mz });
  }
  const fc = new THREE.Vector3(0, 0, 0.08).applyMatrix4(Mz);
  shadows.add(fc.x, 0.004, fc.z, W + 0.12, Z.d + 0.2, 0.55, Z.yaw);   // floor under / in front of the kick
  ctx.colliders.addBox(Z.cx, Z.cz, W + 0.04, Z.d + 0.04, Z.yaw);

  // the folded clothes: 5 stacks on each of the clothes shelves (tops above, bottoms below), every product once
  const { folded } = layout.splitClothes(ctx.catalog.byCategory('clothes'));
  const spots = Z.clothesShelves.length * Z.perShelf;
  const plan = folded.map(p => ({ p, ci: lightToDark(p)[0] ?? 0 }));
  for (let k = 0; plan.length < spots && folded.length; k++) {   // fewer products than spots: next colourways
    const p = folded[k % folded.length], order = lightToDark(p), seen = plan.filter(q => q.p === p).length;
    plan.push({ p, ci: order.length ? order[seen % order.length] : 0 });
  }
  plan.sort((a, b) => (isTop(b.p) - isTop(a.p)) || (folded.indexOf(a.p) - folded.indexOf(b.p)));
  const shelves = Z.clothesShelves.slice().sort((a, b) => b - a);   // the higher clothes shelf gets the tops
  for (const [key, L] of Object.entries(FOLDS)) stacks.line(key, foldedGeo(L.geo), mats.fabric(L.fabric, '#ffffff'));
  const R = ctx.kit.rng(4417);
  plan.slice(0, spots).forEach(({ p, ci }, i) => {
    const shelf = shelves[Math.floor(i / Z.perShelf)], slot = i % Z.perShelf, key = foldLine(p), L = FOLDS[key];
    const lx = (slot - (Z.perShelf - 1) / 2) * STACK.pitch, lz = zBack + 0.04 + STACK.d / 2, top = SY[shelf];
    const items = [];
    for (let k = 0; k < L.n; k++) {
      const w = new THREE.Vector3(lx + (R() - 0.5) * 0.01, top + k * L.geo.h * 0.94, lz + (R() - 0.5) * 0.012).applyMatrix4(Mz);
      items.push({ pos: w.toArray(), rot: [0, Z.yaw + (R() - 0.5) * 0.05, 0], scale: [0.97 + R() * 0.06, 1, 1], color: albedo(swatchOf(p, ci)), jitter: (R() - 0.5) * 0.03 });
    }
    const st = stacks.add(key, items, s => productCard(ctx, p, { current: s.currentHex || s.ci }));
    st.ci = ci;
    const c = new THREE.Vector3(lx, 0, lz).applyMatrix4(Mz);
    shadows.add(c.x, top + 0.002, c.z, STACK.w + 0.08, STACK.d + 0.08, 0.5, Z.yaw);
  });
  times.shelves = performance.now() - t; t = performance.now();

  // ---------------------------------------------------------------------------------------------
  // Window mannequins (no podium: they stand on the shop floor just inside the left window)
  // ---------------------------------------------------------------------------------------------
  const WZ = layout.ZONES.windowMannequins;
  const figs = await buildFigures(ctx, { root, figs: windowPlan(ctx), staticBatch, shadows, U });
  for (const it of WZ.items) ctx.colliders.addBox(it.cx, it.cz, it.w, it.d);
  times.figures = performance.now() - t; times.fig = figs.times; t = performance.now();

  // ---------------------------------------------------------------------------------------------
  // Static merged meshes
  // ---------------------------------------------------------------------------------------------
  const statMats = new Map();
  const matFor = (key) => {
    if (statMats.has(key)) return statMats.get(key);
    const m = key === 'led' ? ledMaterial('#ffd6a0', 3.2)
      : key === 'glow' ? glowMaterial(makeGlow(), '#ffcc94', 0.36, 'apparelDisplay:ledGlow')
      : key === 'wood' ? mats.get('oak-smoked', { color: layout.PALETTE.shopEspresso })
      : mats.get(key);
    statMats.set(key, m);
    return m;
  };
  for (const { key, mesh } of staticBatch.build(root, matFor)) {
    if (key === 'glow') { mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 2; }
    if (key === 'led') { mesh.castShadow = false; mesh.receiveShadow = false; }
  }
  stacks.build(root, 'ad:stack');
  shadows.build(root, 'ad:contactShadows');
  times.merge = performance.now() - t;
  // freeze everything static (turning a figure is a uniform)
  root.updateMatrixWorld(true);
  root.traverse(o => { o.matrixAutoUpdate = false; });
  ctx.onUpdate((dt, time) => figs.update(dt, time));
  times.total = performance.now() - t0;
  window.__apparelDisplay = { figs, stacks, times, root, looks: figs.looks, turn: i => figs.turn(figs.records[i]) };
  // dev: ?adTap=N turns figure N at ready (for interaction screenshots)
  if (ctx.params.has('adTap')) ctx.events.addEventListener('ready', () => { const i = +ctx.params.get('adTap'); if (figs.records[i]) figs.turn(figs.records[i]); });
  // dev: ?adAngle=i:rad freezes figure i mid-turn (deterministic interaction screenshots)
  if (ctx.params.has('adAngle')) { const [i, a] = ctx.params.get('adAngle').split(':').map(Number); const r = figs.records[i]; if (r) U.value[r.slot].z = a; }
}

/** Additive LED wash in the local plane z = const facing +z (glow texture's left half, bright at the top). */
function glowQuad(x0, x1, y0, y1, z) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0.5, 1, 0, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
