// Module: apparelDisplay — mannequins, the Spring Edit plinth, both window displays, the knit table and
// the left denim/knit cubbies. Zones: windowLeft, windowRight, leftCubbies, plinth, knitTable.
//
// IMAANS: every look, stack, hat and hat box is a real product of ctx.catalog (names, Rand prices, sizes
// with sold-out, colours); all copy on the printed signs comes from ctx.brand (the promo headline for the
// plinth, the clothes promo line for the window) and the catalogue's clothing groups (apparelRails/imaans).
//
// Mannequins are dressed SDF figures baked offline (tools/apparelDisplay-bake.mjs → assets/models/
// mannequin-*.glb). At runtime every figure part is merged per material and per zone, recoloured from its
// look's products, and a shared vertex patch turns individual figures on their base when tapped (no extra
// draw calls). Folded stacks, hats and hat boxes are instanced with per-stack cards + colourways.
// Shader programs are shared with apparelRails (print atlas, fabrics, LEDs / glows / contact shadows on
// architecture's programs) — see apparelRails/imaans.js.
//
// Helpers: apparelDisplay/{util,figures,plinth,windows,knitTable,cubbies,folded,stacks,signs}.js
import * as THREE from 'three';
import { Batch, createTurnUniform, turnable } from './apparelDisplay/util.js';
import { buildFigures } from './apparelDisplay/figures.js';
import { buildPlinth } from './apparelDisplay/plinth.js';
import { buildWindows, PODIUM_H } from './apparelDisplay/windows.js';
import { buildKnitTable } from './apparelDisplay/knitTable.js';
import { buildCubbies, cubbyLabel } from './apparelDisplay/cubbies.js';
import { foldedGeo, bucketGeo } from './apparelDisplay/folded.js';
import { Stacks } from './apparelDisplay/stacks.js';
import { createSigns } from './apparelDisplay/signs.js';
import { buildGroups, promoCopy, deptLine, fromPrice, sizeLabels, lineOf, ShadowQuads, ledMaterial, glowMaterial, one, brandBoxGeo, albedo, rimPatch } from './apparelRails/imaans.js';

const FIGS = [
  { id: 'slip', zone: 'plinth', pos: [0.06, 0.3, -2.62], rot: -6 },
  { id: 'trench', zone: 'plinth', pos: [-0.66, 0.3, -1.74], rot: 24 },
  { id: 'street', zone: 'plinth', pos: [0.7, 0.3, -1.64], rot: -30, shoe: 'default' },
  // window figures face the entrance aisle (≈ 3/4 toward the shop floor): they read from inside the store
  // and in profile from the street instead of showing the shop their backs
  { id: 'wrap', zone: 'winL', pos: [-5.95, PODIUM_H, 10.02], rot: 105 },
  { id: 'suit', zone: 'winL', pos: [-4.2, PODIUM_H, 10.02], rot: 122, shoe: 'default' },
  { id: 'knitdress', zone: 'winR', pos: [4.2, PODIUM_H, 10.02], rot: -122 },
];
const DRESS_FORM = { zone: 'winR', pos: [5.55, PODIUM_H, 9.95], rot: -112, scale: 12.5, standH: 0.6 };

/** Start every download before any module builds (they stream in while architecture builds). */
export function setup(ctx) {
  for (const f of FIGS) ctx.assets.gltf('mannequin-' + f.id).catch(() => {});
  ctx.assets.gltf('corset').catch(() => {});
  ctx.assets.gltf('shoe').catch(() => {});
  ctx.assets.gltf('shoe-lod').catch(() => {});
}

export async function build(ctx) {
  const t0 = performance.now();
  const { mats, catalog, brand } = ctx;
  const root = ctx.group('apparelDisplay');
  const groups = buildGroups(catalog, brand);
  // printed copy — all from the brand + catalogue
  const knitFam = groups.families.find(f => f.key === 'knitwear') || groups.families.find(f => f.products.some(p => ['knit', 'cable'].includes(lineOf(p))));
  const sizes = sizeLabels(groups.clothes);
  const sizeRange = sizes.length > 1 ? `Sizes ${sizes[0]} – ${sizes[sizes.length - 1]}` : '';
  const bottoms = groups.clothes.filter(p => ['jeans', 'trouser', 'mini'].includes(lineOf(p)) || lineOf(p) === null);
  const copy = {
    season: promoCopy(brand),
    knit: { label: knitFam ? knitFam.label : 'Knitwear', line: [knitFam ? `${knitFam.products.length} styles` : '', sizeRange].filter(Boolean).join(' · '), from: knitFam ? fromPrice(catalog, knitFam.products) : '' },
    denim: { label: cubbyLabel(groups), line: [sizeRange, bottoms.length ? 'from ' + fromPrice(catalog, bottoms) : ''].filter(Boolean).join(' · ') },
    window: { line: deptLine(brand, 'clothes') || brand.slogan, dept: (brand.departments.find(d => d.id === 'clothes') || {}).name || 'Clothes' },
  };
  const staticBatch = new Batch();
  const shadows = new ShadowQuads();
  const signs = createSigns(ctx, copy);
  const stacks = new Stacks(ctx);
  stacks.tint = albedo;
  const U = createTurnUniform();
  const zoneBatches = new Map([['plinth', new Batch()], ['winL', new Batch()], ['winR', new Batch()]]);
  const times = {};

  // instanced product lines (white base → instance colour = average albedo); IMAANS boxes are printed
  stacks.line('knit', foldedGeo({ w: 0.3, h: 0.058, d: 0.26 }), mats.fabric('knit', '#ffffff'));
  stacks.line('cable', foldedGeo({ w: 0.3, h: 0.07, d: 0.28 }), mats.fabric('cable', '#ffffff'));
  stacks.line('denim', foldedGeo({ w: 0.36, h: 0.043, d: 0.31, collar: false, inner: 1 }), mats.fabric('denim', '#ffffff'));
  stacks.line('hat', bucketGeo(), mats.fabric('canvas', '#ffffff'));
  stacks.line('boxBlack', brandBoxGeo(signs.uv('boxBlack')), signs.material, { noColor: true });
  stacks.line('boxIvory', brandBoxGeo(signs.uv('boxIvory')), signs.material, { noColor: true });

  let t = performance.now();
  buildPlinth(ctx, { staticBatch, shadows, signs }); times.plinth = performance.now() - t; t = performance.now();
  buildWindows(ctx, { staticBatch, shadows, signs }); times.windows = performance.now() - t; t = performance.now();
  buildKnitTable(ctx, { staticBatch, shadows, signs, stacks, groups }); times.table = performance.now() - t; t = performance.now();
  buildCubbies(ctx, { staticBatch, shadows, signs, stacks, groups }); times.cubbies = performance.now() - t; t = performance.now();
  ctx.hotspots.add({ id: 'denim', label: listLabel([copy.denim.label, copy.knit.label]), pos: [-5.35, 1.62, -8.05], look: [-7.7, 1.35, -9.25], order: 28 });
  const figs = await buildFigures(ctx, { root, figs: FIGS, dressForm: DRESS_FORM, staticBatch, shadows, zoneBatches, U });
  times.figures = performance.now() - t; times.fig = figs.times; t = performance.now();

  // static merged meshes
  const statMats = new Map();
  const matFor = (key, g) => {
    if (statMats.has(key)) return statMats.get(key);
    let m;
    if (key === 'led') m = ledMaterial('#ffd9a8', 3.2);
    else if (key === 'glow') m = glowMaterial(glowTexture(), '#ffc98f', 0.55, 'apparelDisplay:ledGlow');
    else if (key === 'signs') m = signs.material;
    else if (key === 'charcoal') m = mats.get('oak-smoked', { color: '#2e2a27' });   // IMAANS black joinery (the rails' bays)
    else if (key === 'plume') m = ctx.tier === 'low' ? turnable(mats.fabric('boucle', '#ffffff', { flat: true }), U, { before: rimPatch }) : turnable(mats.fabric('boucle', '#ffffff'), U);
    else { m = mats.get(key); if (g && g.color) { const c = m.clone(); c.vertexColors = true; if (m.onBeforeCompile) c.onBeforeCompile = m.onBeforeCompile; m = c; } }
    statMats.set(key, m);
    return m;
  };
  const built = staticBatch.build(root, matFor); times.staticBuild = performance.now() - t; times.staticKeys = staticBatch.times;
  for (const { key, mesh } of built) {
    if (key === 'glow') { mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 2; }
    if (key === 'led') { mesh.castShadow = false; mesh.receiveShadow = false; }
    if (key === 'signs') {
      // the printed signs as an InstancedMesh of one → the shared print program (apparelRails labels / tags)
      const inst = one(mesh.geometry, mesh.material, 'ad:signs'); inst.castShadow = false; inst.receiveShadow = true;
      root.remove(mesh); root.add(inst);
    }
  }
  stacks.build(root, 'ad:stack'); times.stacksBuild = performance.now() - t;
  shadows.build(root, 'ad:contactShadows'); times.shadowsBuild = performance.now() - t;
  times.merge = performance.now() - t;
  // freeze everything static (turning uses uniforms; the dress form group rotates itself)
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.name !== 'ad:dressform' && !(o.parent && o.parent.name === 'ad:dressform')) o.matrixAutoUpdate = false; });
  ctx.onUpdate((dt, time) => {
    figs.update(dt, time);
    for (const r of figs.records) if (r.group && r.turn) r.group.updateMatrixWorld(true);
  });
  times.total = performance.now() - t0;
  window.__apparelDisplay = { figs, stacks, times, root, copy, looks: figs.looks, turn: i => figs.turn(figs.records[i]) };
  // dev: ?adTap=N turns figure N at ready (for interaction screenshots)
  if (ctx.params.has('adTap')) ctx.events.addEventListener('ready', () => { const i = +ctx.params.get('adTap'); if (figs.records[i]) figs.turn(figs.records[i]); });
  // dev: ?adAngle=i:rad freezes figure i mid-turn (deterministic interaction screenshots)
  if (ctx.params.has('adAngle')) { const [i, a] = ctx.params.get('adAngle').split(':').map(Number); const r = figs.records[i]; if (r) { if (r.group) r.group.rotation.y = r.rot + a; else U.value[r.slot].z = a; } }
}

/** ['Denim & Trousers', 'Knitwear'] → 'Denim, Trousers & Knitwear' (no repeated words). */
function listLabel(labels) {
  const w = [];
  for (const l of labels.filter(Boolean)) for (const x of String(l).split(/\s*&\s*|\s*,\s*/)) if (x && !w.includes(x)) w.push(x);
  return w.length > 1 ? w.slice(0, -1).join(', ') + ' & ' + w[w.length - 1] : (w[0] || '');
}

let _glowTex = null;
function glowTexture() {
  if (!_glowTex) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 4;
    const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 128, 0);
    // additive blend: only rgb matters (no getImageData — a sync GPU readback stalls the boot)
    grd.addColorStop(0, 'rgb(255,255,255)'); grd.addColorStop(0.12, 'rgb(190,190,190)'); grd.addColorStop(0.4, 'rgb(64,64,64)'); grd.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 4);
    _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace; _glowTex.wrapS = _glowTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return _glowTex;
}
