// Module: fixtures — accessories table, fitting rooms, back-right corner, lounge, checkout (IMAANS).
// Owner: fixtures. Zones in src/core/layout.js (accTable, fittingRooms, backRightCorner, lounge, checkout).
//
// Shader-program budget (≤ 12): every surface of the module uses one of a handful of material SHAPES —
//   1. library textured standard (oak-smoked, travertine + our marble built from the library's marble maps)
//   2. the fixtures atlas family: MeshStandard + ONE painted atlas + vertex colours (print / satin / gloss /
//      metal are the same program with different uniforms; GLB parts with a single base map join it too)
//   3. library velvet / bouclé (sheen)      4. foliage (alpha-tested, double-sided leaves & petals)
//   5. unlit glow (signs, lightboxes, screens, lamp shade)   6. box-projected mirror
//   + library brass / glass and the contact-shadow program, shared with the other modules.
// GLB furniture (sofa, chairs, plants, vase, sunglasses, watch) is converted onto those shapes in glb.js; no
// InstancedMesh (every instanced material is a second program). Taps go to invisible proxy boxes.
// Draw calls: static procedural geometry is merged by material into one mesh per material (≈14).
import * as THREE from 'three';
import { Batch, ShadowBatch, Proxies, cloneLib, recolor } from './fixtures/util.js';
import { makeAtlas, loadImages } from './fixtures/atlas.js';
import { buildAccTable } from './fixtures/accTable.js';
import { buildFitting } from './fixtures/fitting.js';
import { buildLounge, LOUNGE, rugTexture } from './fixtures/lounge.js';
import { buildCheckout } from './fixtures/checkout.js';
import { placeGLBs, sunglassesUpdater, loadWatch } from './fixtures/glb.js';
import { COPY } from './fixtures/copy.js';

const ROOM_BOX = { min: new THREE.Vector3(-8, 0, -11), max: new THREE.Vector3(8, 4.6, 11), capture: new THREE.Vector3(0, 1.8, 0) };

/** Mirror material: box-projected (parallax-corrected) reflection of the captured store cube. */
function mirrorMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#eef0ee', metalness: 1, roughness: 0.02 });
  m.name = 'fixtures:mirror';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bpMin = { value: ROOM_BOX.min }; sh.uniforms.bpMax = { value: ROOM_BOX.max }; sh.uniforms.bpPos = { value: ROOM_BOX.capture };
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

/** Polished marble as a plain textured MeshStandardMaterial (same program as oak / travertine). */
function marbleStd(L) {
  const t = L.textures('marble'), n = L.textures('travertine');
  const m = new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughnessMap, normalMap: n.normalMap, roughness: 0.22, metalness: 0 });
  m.normalScale.set(0.08, 0.08); m.name = 'fixtures:marble';
  m.userData.envI = 0.9;
  return m;
}

export async function build(ctx) {
  const root = ctx.group('fixtures');
  // Hidden while the store loads: nothing of ours compiles during the loading frames (it all compiles once,
  // in main's compileAsync after ready). Shown by our onReady hook.
  root.visible = false;
  const L = ctx.mats;
  const kit = ctx.kit;
  const brand = ctx.brand, catalog = ctx.catalog;

  // campaign prints for the lounge lightboxes + lookbook covers, painted into the atlas
  // start every model download now so they stream while we paint and build the procedural parts
  for (const id of ['fixtures-sofa', 'fixtures-chair-velvet', 'chair-damask', 'fixtures-plant', 'fixtures-vase', 'fixtures-sunglasses']) ctx.assets.gltf(id).catch(() => {});
  const T = { t0: performance.now() }; const mark = (k) => { T[k] = Math.round(performance.now() - T.t0); };
  const imgsP = loadImages({ camp1: ctx.assets.url(brand.images.campaignClothing), camp2: ctx.assets.url(brand.images.campaignShoes) }, 8000);
  const atlas = makeAtlas(kit, { fonts: ctx.fonts, brand, catalog, images: null, tier: ctx.tier });
  mark('atlas');
  let imgsIn = false;
  imgsP.then((imgs) => { imgsIn = true; atlas.setImages(imgs); });

  // ------------------------------------------------------------------------------------------ materials
  const atlasMat = (name, roughness, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ map: atlas.tex, vertexColors: true, roughness, metalness });
    m.name = 'fixtures:' + name; return m;
  };
  const MAT = {
    // shape 1 — library textured standard
    smoked: L.get('oak-smoked', { color: '#2e2622' }),   // black-stained oak joinery
    oak: L.get('oak-smoked'),
    trav: L.get('travertine'),
    // cubicle limewash + curtains: clones of the library surfaces (same programs) with their own env gain —
    // on mid/low no spot reaches behind the fascia, so they were lit by the dim shared env alone (muddy)
    plaster: cloneLib(L.get('plaster')),
    marble: marbleStd(L),
    // shared with architecture / other modules
    brass: cloneLib(L.get('brass')),
    glass: cloneLib(L.get('glass')),
    // shape 2 — the fixtures atlas family (one program)
    print: atlasMat('print', 0.82),
    satin: atlasMat('satin', 0.45),
    gloss: atlasMat('gloss', 0.2),
    metal: atlasMat('metal', 0.26, 1),
    // shape 5 / 6
    glow: new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true, toneMapped: false, name: 'fixtures:glow' }),
    mirror: mirrorMaterial(),
    // shape 3 — library sheen fabrics
    velvet: cloneLib(L.get('velvet-champagne', { color: '#cfb996' })),
    boucle: L.get('boucle'),
  };
  MAT.brass.userData.envI = 0.95; MAT.glass.userData.envI = 1.3; MAT.gloss.userData.envI = 0.8; MAT.metal.userData.envI = 1.0;
  MAT.velvet.userData.envI = 0.6; MAT.plaster.userData.envI = 0.75;
  MAT.glass.side = THREE.FrontSide;

  const metals = new Set([MAT.brass, MAT.mirror, MAT.glass, MAT.gloss, MAT.metal, MAT.marble, MAT.velvet, MAT.plaster]);
  const F = {
    ctx, THREE, kit, root, A: atlas, mats: MAT, metals,
    B: new Batch(['print', 'satin', 'gloss', 'metal', 'glow'], atlas.centre('white')),
    S: new ShadowBatch(kit), P: new Proxies(root, ctx.interact), col: ctx.colliders,
    rngLine: (arr) => arr[Math.floor((ctx.time * 13.7) % arr.length)],
    gold: '#d9ab48', goldDeep: '#b08d57', black: '#1b1b1b', ink: '#0d0d0e', ivory: '#faf7f2',
  };
  F.applyEnv = () => {
    const env = ctx.scene.environment; if (!env) return;
    for (const m of metals) { if (!m) continue; m.envMap = env; m.envMapIntensity = m.userData.envI ?? 0.9; }
  };

  // ------------------------------------------------------------------------------------------ zones
  buildAccTable(F); mark('acc');
  buildFitting(F); mark('fitting');
  buildLounge(F); mark('lounge');
  buildCheckout(F); mark('checkout');
  await placeGLBs(F); mark('glb');
  // the campaign photos have normally arrived by now; give them a moment more (never blocks for long)
  if (!imgsIn) await Promise.race([imgsP, new Promise(r => setTimeout(r, 1200))]);
  mark('images');

  // ------------------------------------------------------------------------------------------ merge + add
  const meshes = F.B.build(MAT, root);
  for (const m of meshes) if (m.material === MAT.glass) { m.renderOrder = 2; m.castShadow = false; }
  for (const m of meshes) if (m.material === MAT.glow || m.material === MAT.mirror) { m.castShadow = false; m.receiveShadow = m.material === MAT.mirror; }
  const shadows = F.S.mesh('fixtures:shadows'); if (shadows) root.add(shadows);
  mark('merge');
  // rug: the atlas program with its own painted texture (bands + wool texture)
  const rugMat = new THREE.MeshStandardMaterial({ map: rugTexture(kit, F), vertexColors: true, roughness: 0.96, metalness: 0, name: 'fixtures:rug' });
  const rug = new THREE.Mesh(F.rug, rugMat);
  rug.position.set(LOUNGE.rug[0], 0, LOUNGE.rug[1]); rug.name = 'fixtures:rug'; rug.receiveShadow = true;
  rug.updateMatrix(); rug.matrixAutoUpdate = false; root.add(rug);
  F.P.box([LOUNGE.rug[0], 0.01, LOUNGE.rug[1]], [2.2, 0.02, 2.2], 0, { title: 'The lounge rug', subtitle: COPY.rug, tag: brand.name + ' · Lounge' });

  // ------------------------------------------------------------------------------------------ behaviours
  const anims = [];
  F.animateCurtain = (cur, to) => { anims.push({ cur, from: cur.f, to, t: 0 }); };
  F.toggleLamp = () => {
    F.lamp.on = !F.lamp.on;
    recolor(F.lamp.outer, F.lamp.on ? [1.25, 0.95, 0.66] : [0.42, 0.38, 0.33]);
    recolor(F.lamp.inner, F.lamp.on ? [2.4, 1.85, 1.2] : [0.3, 0.27, 0.24]);
    ctx.fx.burst(new THREE.Vector3(LOUNGE.lamp[0], 1.6, LOUNGE.lamp[1]), { color: '#ffd58a', count: F.lamp.on ? 30 : 12 });
    ctx.ui.toast(F.lamp.on ? 'Let there be (warm) light' : 'Mood lighting, engaged');
  };
  F.sendOrder = (p) => {
    ctx.fx.burst(p ? p.clone() : new THREE.Vector3(5.66, 1.3, 5.25), { color: '#ffd58a', count: 60 });
    ctx.ui.openBag();
  };
  const sunUpd = sunglassesUpdater(F);
  ctx.onUpdate((dt) => {
    if (anims.length) {
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i]; a.t = Math.min(1, a.t + dt / 0.9);
        const k = a.t * a.t * (3 - 2 * a.t);
        a.cur.set(a.from + (a.to - a.from) * k);
        if (a.t >= 1) { anims.splice(i, 1); ctx.requestShadowUpdate(); }
      }
    }
    sunUpd(dt);
  });

  // env maps (after architecture's capture) + reveal
  ctx.onReady(() => { F.applyEnv(); root.visible = true; });

  // ------------------------------------------------------------------------------------------ hotspots
  ctx.hotspots.add({ id: 'fitting-rooms', label: 'Fitting rooms', pos: [3.35, 1.62, -1.35], look: [6.4, 1.35, -4.7], order: 50 });
  ctx.hotspots.add({ id: 'lounge', label: 'The lounge', pos: [3.25, 1.62, 2.7], look: [6.9, 0.95, 0.75], order: 55 });
  ctx.hotspots.add({ id: 'accessories', label: 'Accessories', pos: [0.95, 1.5, 6.35], look: [2.35, 0.95, 4.75], order: 60 });
  ctx.hotspots.add({ id: 'checkout', label: 'Pay & collect', pos: [3.55, 1.62, 7.6], look: [6.2, 1.1, 5.7], order: 65 });

  mark('done'); F.times = T;
  F.tier = ctx.tier;
  window.__fixtures = F; // dev hook (harmless): shots/tests poke curtains, sunglasses, sofa
}

export async function ready(ctx) {
  const F = window.__fixtures; if (!F) return;
  // the watch is heavy (2.3 MB, 37k tris): load it only once the store is up, never blocking the boot
  const go = () => loadWatch(F);
  if (ctx.shotMode || ctx.params.has('fxWatchNow')) await go();
  else setTimeout(go, 300);
}
