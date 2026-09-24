// Module: fixtures — the counter, display step 2 + the accessories on the folded unit's upper shelves, the bench,
// the partition mirror, the two plants and the sculpture plinth of the real IMAANS shop (docs/REAL-LAYOUT.md).
// Owner: fixtures. Zones (ctx.layout.ZONES): counter, accStep, accShelves, bench, mirror, plants, sculpturePlinth.
//
// Merchandising is data: every accessory of ctx.catalog.byCategory('accessories') gets one of the 31 slots
// (counter top 10 · step 6 · shelves 15) before any slot shows a repeat (products.planAccessories); the 3-D item
// is picked from the product's own name / tags (products.kindOf → items.GEN) and coloured from its swatches.
// Tour / Go to stops are central data (layout.TOUR / GOTO): this module adds no hotspots.
//
// Shader programs (≤ 12, ≈ 8 used): every surface is one of a few material SHAPES —
//   1. the fixtures atlas family: MeshStandard + ONE painted atlas + vertex colours (print / satin / gloss /
//      metal: same program, different uniforms) — every accessory, the counter, the step, pots, sculptures
//   2. unlit glow (screens, the mirror's LED line)     3. box-projected mirror
//   4. library leather-black (bench) · travertine (plinth, bust risers) · glass (tinted lenses)
//   5. foliage (alpha-tested leaves)                   + the contact-shadow program (shadows, mirror halo)
// Draw calls: static geometry is merged by material into one mesh per material (≈ 12 in total); taps go to
// invisible proxy boxes (no draw call, no program). No lights, no transmission, no InstancedMesh.
import * as THREE from 'three';
import { Batch, ShadowBatch, Proxies, cloneLib } from './fixtures/util.js';
import { makeAtlas } from './fixtures/atlas.js';
import { planAccessories } from './fixtures/products.js';
import { show } from './fixtures/items.js';
import { buildCounter } from './fixtures/counter.js';
import { buildAccStep, buildAccShelves } from './fixtures/display.js';
import { buildBench, buildMirror, buildSculptures, buildPlants } from './fixtures/furniture.js';
import { placeGLBs, makeFlyer, sunglassesUpdater } from './fixtures/glb.js';

/** Mirror material: box-projected (parallax-corrected) reflection of architecture's captured store cube. */
function mirrorMaterial(R) {
  const box = { min: new THREE.Vector3(R.minX, 0, R.minZ), max: new THREE.Vector3(R.maxX, R.height, R.maxZ), capture: new THREE.Vector3().fromArray(R.envProbe) };
  const m = new THREE.MeshStandardMaterial({ color: '#eef0ee', metalness: 1, roughness: 0.02 });
  m.name = 'fixtures:mirror';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bpMin = { value: box.min }; sh.uniforms.bpMax = { value: box.max }; sh.uniforms.bpPos = { value: box.capture };
    sh.vertexShader = 'varying vec3 vBpWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvBpWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
      'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
      'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n\t\treflectVec = bpDir( reflectVec );');
    sh.fragmentShader = 'uniform vec3 bpMin;\nuniform vec3 bpMax;\nuniform vec3 bpPos;\nvarying vec3 vBpWorld;\n'
      + 'vec3 bpDir( vec3 v ) { vec3 w = v + sign( v ) * 1e-5 + vec3( equal( v, vec3( 0.0 ) ) ) * 1e-5; vec3 t1 = ( bpMax - vBpWorld ) / w; vec3 t0 = ( bpMin - vBpWorld ) / w; vec3 t = max( t0, t1 ); float d = min( min( t.x, t.y ), t.z ); return normalize( vBpWorld + v * d - bpPos ); }\n'
      + sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', chunk);
  };
  m.customProgramCacheKey = () => 'fixtures-bpcem-mirror';
  m.userData.envI = 1.0;
  return m;
}

export async function build(ctx) {
  const root = ctx.group('fixtures');
  // Hidden while the store loads: nothing of ours compiles during the loading frames (it all compiles once,
  // in main's warm-up after ready). Shown by our onReady hook.
  root.visible = false;
  const L = ctx.mats, kit = ctx.kit, brand = ctx.brand, catalog = ctx.catalog;
  const T = { t0: performance.now() }; const mark = (k) => { T[k] = Math.round(performance.now() - T.t0); };
  // start the model downloads now so they stream while we paint and build the procedural parts
  for (const id of ['fixtures-sunglasses', 'fixtures-plant']) ctx.assets.gltf(id).catch(() => {});
  const atlas = makeAtlas(kit, { fonts: ctx.fonts, brand, catalog, tier: ctx.tier });
  mark('atlas');

  // ------------------------------------------------------------------------------------------ materials
  const atlasMat = (name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ map: atlas.tex, vertexColors: true, roughness, metalness });
    m.name = 'fixtures:' + name; return m;
  };
  const MAT = {
    print: atlasMat('print', 0.82),
    satin: atlasMat('satin', 0.45),
    gloss: atlasMat('gloss', 0.2),
    metal: atlasMat('metal', 0.26, 1),
    glow: new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true, toneMapped: false, name: 'fixtures:glow' }),
    mirror: mirrorMaterial(ctx.layout.ROOM),
    leather: L.get('leather-black', { color: ctx.layout.PALETTE.shopLeather }),
    trav: L.get('travertine'),
    lens: cloneLib(L.get('glass')),
  };
  MAT.lens.color.set('#1a1410'); MAT.lens.opacity = 0.72; MAT.lens.name = 'fixtures:lens';
  MAT.gloss.userData.envI = 0.8; MAT.metal.userData.envI = 1.0; MAT.lens.userData.envI = 1.4;
  const metals = new Set([MAT.mirror, MAT.gloss, MAT.metal, MAT.lens]);
  const P = ctx.layout.PALETTE;
  const F = {
    ctx, kit, root, A: atlas, mats: MAT, metals,
    B: new Batch(['print', 'satin', 'gloss', 'metal', 'glow'], atlas.centre('white')),
    S: new ShadowBatch(kit), P: new Proxies(root, ctx.interact), col: ctx.colliders,
    slots: [], shown: [], sunPoses: [], canopies: [],
    gold: P.shopGold, brass: P.brass, ink: '#0d0d0e', blackMetal: P.shopBlackMetal, ivory: P.shopIvorySatin, ivoryTop: '#f6f3ee',
  };
  F.applyEnv = () => {
    const env = ctx.scene.environment; if (!env) return;
    for (const m of metals) { m.envMap = env; m.envMapIntensity = m.userData.envI ?? 0.9; }
  };
  F.sendOrder = (p) => {
    ctx.fx.burst(p ? p.clone() : new THREE.Vector3(2.0, 1.3, 3.3), { color: '#ffd58a', count: 60 });
    ctx.ui.openBag();
  };

  // ------------------------------------------------------------------------------------------ zones
  buildCounter(F); buildAccStep(F); buildAccShelves(F); mark('fixtures');
  buildBench(F); buildMirror(F); buildSculptures(F); buildPlants(F); mark('furniture');
  // every accessory once (counter → step → shelves priority), then repeats in their next colourway
  const plan = planAccessories(catalog.byCategory('accessories'), F.slots);
  plan.items.forEach((it, i) => { if (it) show(F, F.slots[i], it); });
  if (plan.unplaced.length) console.warn('[fixtures] accessories without a slot:', plan.unplaced.map(p => p.name).join(', '));
  F.plan = plan; mark('accessories');
  await placeGLBs(F); mark('glb');

  // ------------------------------------------------------------------------------------------ merge + add
  const meshes = F.B.build(MAT, root);
  for (const m of meshes) {
    if (m.material === MAT.lens) { m.renderOrder = 3; m.castShadow = false; }
    if (m.material === MAT.glow || m.material === MAT.mirror) { m.castShadow = false; m.receiveShadow = false; }
  }
  const shadows = F.S.mesh('fixtures:shadows'); if (shadows) root.add(shadows);
  makeFlyer(F);
  mark('merge');

  // ------------------------------------------------------------------------------------------ behaviours
  ctx.onUpdate(sunglassesUpdater(F));
  // env maps (after architecture's capture) + reveal
  ctx.onReady(() => { F.applyEnv(); root.visible = true; });
  mark('done'); F.times = T;
  window.__fixtures = F; // dev hook (harmless): shots / tests poke the try-on and read the slot plan
}
