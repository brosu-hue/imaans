// fixtures — GLB furniture & accessories, converted onto the module's few material shapes so the GLBs add
// (almost) no shader programs of their own:
//   sofa        fabric → library velvet (one colour per KHR variant name; tap cycles via ctx.assets.applyVariant),
//               legs / feet → merged into the satin / brass batches
//   chairs      velvet chair fabric → library velvet; damask → recoloured black-and-gold damask (textured
//               standard, same program as oak); woods → textured standard / atlas-family; metal → metal batch
//   plants      pot + soil → textured standard (both plants merged), leaves → foliage (alpha-tested)
//   vases       flowers → foliage, glass → the glass batch
//   sunglasses  4 pairs merged: frames (atlas gloss + tortoiseshell region) + lenses (tinted glass); a single
//               "flyer" pair animates the try-on
//   watch       lazy; body split into metal / gloss parts, face (atlas-family with its own map), glass, and the
//               ticking seconds hand (Anim_0 bound to a rebuilt 'Hand_Seconds' node chain)
// No InstancedMesh anywhere (instancing = a second program per material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, DEG, setColor, solidUV, recolor } from './util.js';
import { LOUNGE } from './lounge.js';
import { ACC, CLOCHE, clocheInfo } from './accTable.js';
import { COPY } from './copy.js';
import { productCard } from './products.js';

/** Plain Float32 copy of an attribute (de-quantised, de-interleaved) so merged geometries always match. */
function toFloat(a, size) {
  const n = a.count, out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    out[i * size] = a.getX(i); if (size > 1) out[i * size + 1] = a.getY(i); if (size > 2) out[i * size + 2] = a.getZ(i);
  }
  return new THREE.BufferAttribute(out, size);
}
/** Clean copy of a geometry with only position / normal / uv (+ optional flat colour), all Float32. */
function prep(geo, color = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', toFloat(geo.attributes.position, 3));
  if (geo.attributes.normal) g.setAttribute('normal', toFloat(geo.attributes.normal, 3));
  g.setAttribute('uv', geo.attributes.uv ? toFloat(geo.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (geo.index) g.setIndex(Array.from(geo.index.array));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (color !== null) setColor(g, color);
  return g;
}
function mergeAll(list) {
  const indexed = list.every(g => g.index);
  const m = mergeGeometries(indexed ? list : list.map(g => (g.index ? g.toNonIndexed() : g)), false);
  m.computeBoundingSphere(); m.computeBoundingBox();
  return m;
}
/** Static mesh helper (matrix baked, frozen). */
function staticMesh(F, geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = receive;
  m.matrixAutoUpdate = false; m.updateMatrix(); F.root.add(m);
  return m;
}
const foliageMats = new Map();
/** Foliage shape: base map + alpha test, double sided (leaves / petals) — one program for all. */
function foliage(src) {
  if (foliageMats.has(src)) return foliageMats.get(src);
  const m = new THREE.MeshStandardMaterial({ map: src.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0, name: 'fixtures:foliage' });
  foliageMats.set(src, m);
  return m;
}
/** Textured-standard shape (map + normal + roughness) — the same program as the library's oak / travertine. */
function texStd(map, normalMap, roughnessMap, roughness = 1, name = 'fixtures:texStd') {
  const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: roughnessMap || map, roughness, metalness: 0, name });
  return m;
}

export async function placeGLBs(F) {
  const { ctx } = F;
  const A = ctx.assets;
  const t0 = performance.now(), T = (F.glbTimes = {});
  const tm = (k, p) => p.then((r) => { T[k] = Math.round(performance.now() - t0); return r; });
  const jobs = [tm('sofa', sofa(F)), tm('chairV', chairVelvet(F)), tm('chairD', chairDamask(F)), tm('plants', plants(F)), tm('vases', vases(F)), tm('sun', A.flatten('fixtures-sunglasses').then(parts => placeSunglasses(F, parts)))];
  const res = await Promise.allSettled(jobs);
  for (const r of res) if (r.status === 'rejected') console.warn('[fixtures] model', r.reason && r.reason.message);
}

// ============================================================================================ sofa
const SOFA_LOOK = {
  'Champagne': ['velvet-champagne', '#cbb593'], 'Navy': ['velvet-ink', '#1f2740'], 'Gray': ['velvet-champagne', '#8d8a84'],
  'Black': ['velvet-champagne', '#161515'], 'Pale Pink': ['velvet-blush', '#d9a9a6'],
};
async function sofa(F) {
  const { ctx, B, S, P } = F;
  const A = ctx.assets, L = ctx.mats;
  const SOFA = 'fixtures-sofa'; // texture-free derivative of 'sofa' (tools/fixtures-lod.mjs)
  const obj = await A.model(SOFA);
  const { pos, rotY } = LOUNGE.sofa;
  obj.position.fromArray(pos); obj.rotation.y = rotY; obj.name = 'fixtures:sofa';
  obj.updateMatrixWorld(true);
  let fabric = null;
  const drop = [];
  obj.traverse(o => {
    if (!o.isMesh) return;
    if (/fabric/i.test(o.name)) {
      fabric = o;
      const g = prep(o.geometry); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 2.2);
      o.geometry = g;
    } else { // legs (black) + feet (brass caps) join the batches
      const g = prep(o.geometry).applyMatrix4(o.matrixWorld);
      if (/feet/i.test(o.name)) B.add('brass', g); else B.add('gloss', g, null, '#121213');
      drop.push(o);
    }
  });
  for (const o of drop) o.parent.remove(o);
  const names = await A.variantNames(SOFA);
  const lookOf = (n) => { const [surf, col] = SOFA_LOOK[n] || ['velvet-champagne', '#b9a282']; return L.get(surf, { color: col }); };
  // default look: black velvet (its champagne sheen gives it form on mid/high); low tier has no sheen, where
  // black velvet renders as a featureless hole — start it in champagne there (what mid actually reads as)
  const first = F.tier === 'low' || ctx.tier === 'low' ? 'Champagne' : 'Black';
  const state = { i: Math.max(0, names.indexOf(first)) };
  const apply = async (name) => {
    await A.applyVariant(SOFA, obj, name);            // the model's own KHR_materials_variants…
    if (fabric) fabric.material = lookOf(name);        // …shown through the library velvet (no extra programs)
  };
  await apply(names[state.i] || first);
  fabric.castShadow = true; fabric.receiveShadow = true;
  F.root.add(obj); ctx.kit.freeze(obj);
  S.add(pos[0] - 0.12, 0.012, pos[2], 1.3, 2.45, 0, 0.55);
  ctx.colliders.addBox(pos[0] - 0.1, pos[2], 1.05, 2.25);
  F.cycleSofa = (dir = 1) => { state.i = (state.i + dir + names.length) % names.length; return apply(names[state.i]); };
  P.box([pos[0] - 0.12, 0.42, pos[2]], [0.95, 0.84, 2.2], 0, () => {
    const info = {
      title: 'The velvet sofa', tag: 'Lounge · ' + ctx.brand.name, subtitle: COPY.sofa,
      onTap: (hit) => {
        F.cycleSofa(1);
        const cur = names[state.i];
        info.subtitle = `Now in ${cur.toLowerCase()} velvet. ` + COPY.sofa;
        info.colorways = names.map(n => ({ name: n, swatch: (SOFA_LOOK[n] || [0, '#cccccc'])[1], apply: () => { state.i = names.indexOf(n); apply(n); } }));
        if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: (SOFA_LOOK[cur] || [0, '#ffd58a'])[1], count: 30 });
      },
    };
    return info;
  });
}

// ============================================================================================ chairs
async function chairVelvet(F) {
  const { ctx, B, S, P } = F;
  const A = ctx.assets, L = ctx.mats;
  const parts = await A.flatten('fixtures-chair-velvet');
  const { pos, rotY } = LOUNGE.chairV;
  const place = M(pos, [0, rotY, 0]);
  const fab = [], wood = []; let woodMap = null;
  for (const p of parts) {
    if (/fabric/i.test(p.name)) { const g = prep(p.geometry).applyMatrix4(place); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.22, uv.getY(i) * 0.22); fab.push(g); }
    else if (/wood/i.test(p.name)) { wood.push(prep(p.geometry, '#ffffff').applyMatrix4(place)); woodMap = woodMap || p.material.map; }
    else if (/metal/i.test(p.name)) B.add('metal', prep(p.geometry).applyMatrix4(place), null, F.gold);
  }
  if (fab.length) staticMesh(F, mergeAll(fab), L.get('velvet-champagne', { color: '#7a5a42' }), 'fixtures:chairV');
  if (wood.length) {
    const wm = new THREE.MeshStandardMaterial({ map: woodMap, vertexColors: true, roughness: 0.55, metalness: 0, color: '#3a2a22', name: 'fixtures:chairWood' });
    staticMesh(F, mergeAll(wood), wm, 'fixtures:chairVWood');
  }
  S.add(pos[0], 0.012, pos[2], 1.0, 0.85, rotY, 0.55);
  ctx.colliders.addCircle(pos[0], pos[2], 0.42);
  P.box([pos[0], 0.35, pos[2]], [0.8, 0.7, 0.58], rotY, { title: 'The slipper chair', subtitle: COPY.chairV, tag: 'Lounge' });
}

/**
 * Black-and-gold damask from the model's own (purple-gold) damask texture: luminance → ink … gold ramp.
 * Done with canvas compositing only — NO getImageData (a synchronous GPU read-back: up to 24 s on a busy
 * phone / headless run). Steps (8-bit sRGB, like the old per-pixel loop):
 *   L = luminance ('saturation' with grey) → k = clamp(2·(L − 0.18)) via invert · add · invert · self-add
 *   → lo + k·(hi − lo) via multiply + add. Browsers without blend modes keep the original map.
 */
function recolourDamask(tex) {
  const img = tex && tex.image; if (!img || !img.width) return tex;
  try {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); const W = c.width, H = c.height;
    const pass = (op, fill) => { g.globalCompositeOperation = op; g.fillStyle = fill; g.fillRect(0, 0, W, H); };
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'saturation';
    if (g.globalCompositeOperation !== 'saturation') return tex; // no blend-mode support
    pass('saturation', '#808080');          // → luminance (grey)
    pass('difference', '#ffffff');          // 1 − L
    pass('lighter', 'rgb(46,46,46)');       // min(1, 1.18 − L)
    pass('difference', '#ffffff');          // max(0, L − 0.18)
    g.globalCompositeOperation = 'lighter'; g.drawImage(c, 0, 0);   // ×2 (clamped): k
    pass('multiply', 'rgb(160,123,61)');    // k · (hi − lo)   hi = (178,140,78)
    pass('lighter', 'rgb(18,17,17)');       // + lo            lo = (18,17,17)
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
    t.repeat.copy(tex.repeat); t.offset.copy(tex.offset); t.rotation = tex.rotation; t.center.copy(tex.center);
    t.anisotropy = 4;
    return t;
  } catch (e) { return tex; }
}
async function chairDamask(F) {
  const { ctx, B, S, P } = F;
  const parts = await ctx.assets.flatten('chair-damask');
  const { pos, rotY } = LOUNGE.chairD;
  const place = M(pos, [0, rotY, 0]);
  const groups = new Map();
  for (const p of parts) {
    if (/label/i.test(p.name)) continue;
    if (/hardware/i.test(p.name)) { B.add('metal', prep(p.geometry).applyMatrix4(place), null, F.gold); continue; }
    const k = p.material; if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(prep(p.geometry).applyMatrix4(place));
  }
  for (const [src, list] of groups) {
    const fabric = /fabric/i.test(src.name);
    const map = fabric ? recolourDamask(src.map) : src.map;
    const m = texStd(map, src.normalMap, src.roughnessMap, fabric ? 0.85 : 0.6, fabric ? 'fixtures:damask' : 'fixtures:damaskWood');
    if (!fabric) m.color.set('#6b5a50');
    if (src.normalMap) m.normalScale.copy(src.normalScale || new THREE.Vector2(1, 1));
    staticMesh(F, mergeAll(list), m, fabric ? 'fixtures:chairD' : 'fixtures:chairDWood');
  }
  S.add(pos[0], 0.012, pos[2], 1.0, 0.85, rotY, 0.55);
  ctx.colliders.addCircle(pos[0], pos[2], 0.42);
  P.box([pos[0], 0.35, pos[2]], [0.8, 0.7, 0.58], rotY, { title: 'The damask chair', subtitle: COPY.chairD, tag: 'Lounge' });
}

// ============================================================================================ plants + vases (merged)
async function plants(F) {
  const { ctx, S, P } = F;
  const parts = await ctx.assets.flatten('fixtures-plant');
  const pl = [
    { pos: [7.6, 0, -10.44], rotY: 0.6, scale: 1.9 },                       // back-right corner (large), clear of the mirror
    { pos: [LOUNGE.plant[0], 0, LOUNGE.plant[1]], rotY: -1.9, scale: 1.45 },  // lounge
  ];
  const leaves = [], pot = []; let leafSrc = null, potSrc = null;
  for (const p of parts) for (const q of pl) {
    if (/dirt/i.test(p.name)) continue; // 2k-triangle soil → a flat dark disc below
    const g = prep(p.geometry).applyMatrix4(M(q.pos, [0, q.rotY, 0], q.scale));
    if (/leaves/i.test(p.name)) { leaves.push(g); leafSrc = p.material; } else { pot.push(g); potSrc = potSrc || p.material; }
  }
  for (const q of pl) {
    const d = new THREE.CircleGeometry(0.2, 20); d.rotateX(-Math.PI / 2);
    F.B.add('satin', d, M([q.pos[0], q.pos[1] + 0.305 * q.scale, q.pos[2]], [0, 0, 0], q.scale), '#2a211b');
  }
  if (pot.length) staticMesh(F, mergeAll(pot), (() => { const m = texStd(potSrc.map, potSrc.normalMap, potSrc.map, 0.7, 'fixtures:pot'); m.color.set('#3a3634'); return m; })(), 'fixtures:plantPot');
  let leafMesh = null;
  if (leaves.length) leafMesh = staticMesh(F, mergeAll(leaves), foliage(leafSrc), 'fixtures:plantLeaves', { cast: false });
  for (const q of pl) {
    S.add(q.pos[0] - 0.05 * q.scale, 0, q.pos[2] - 0.08 * q.scale, 0.62 * q.scale, 0.62 * q.scale, 0, 0.55);
    ctx.colliders.addCircle(q.pos[0] - 0.04 * q.scale, q.pos[2] - 0.06 * q.scale, 0.2 * q.scale);
    P.box([q.pos[0], 0.42 * q.scale, q.pos[2]], [0.6 * q.scale, 0.84 * q.scale, 0.6 * q.scale], 0, {
      title: 'Our resident plant', subtitle: COPY.plant, tag: ctx.brand.name + ' · since 2019',
      onTap: (hit) => { ctx.ui.toast('The plant says hello'); if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: '#ffd58a', count: 16 }); return false; },
    });
  }
  void leafMesh;
}
async function vases(F) {
  const { ctx, B, S, P } = F;
  const parts = await ctx.assets.flatten('fixtures-vase');
  const [tx, tz] = LOUNGE.table;
  const pl = [
    { pos: [tx - 0.2, 0.4, tz + 0.27], rotY: 1.1, scale: 1.25 },
    { pos: [5.82, 1.0, 6.62], rotY: -0.4, scale: 1.7 },
  ];
  const flowers = []; let src = null;
  for (const p of parts) for (const q of pl) {
    const g = prep(p.geometry).applyMatrix4(M(q.pos, [0, q.rotY, 0], q.scale));
    if (/glass/i.test(p.name)) B.add('glass', g); else { flowers.push(g); src = p.material; }
  }
  if (flowers.length) staticMesh(F, mergeAll(flowers), foliage(src), 'fixtures:flowers', { cast: false });
  for (const q of pl) {
    const c = new THREE.Vector3(0.055 * q.scale, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), q.rotY);
    S.add(q.pos[0] + c.x, q.pos[1], q.pos[2] + c.z, 0.34 * q.scale, 0.2 * q.scale, q.rotY, 0.44);
    P.box([q.pos[0] + c.x, q.pos[1] + 0.12 * q.scale, q.pos[2] + c.z], [0.26 * q.scale, 0.26 * q.scale, 0.2 * q.scale], q.rotY, { title: 'Fresh flowers', subtitle: COPY.vase, tag: ctx.brand.legalName });
  }
}

// ============================================================================================ sunglasses
function placeSunglasses(F, parts) {
  const { ctx, P, A, mats } = F;
  const p = ctx.catalog.pick('sunglasses', 'acc-sun');
  const colourOf = (c) => (c && /tort/i.test(c.label) ? '#ffffff' : (c && c.swatch) || '#1c1c1c');
  const tort = A.regions.tortoise;
  const byName = (re) => parts.filter(q => re.test(q.name));
  // one pair in model space: frames (+ temples + earhooks) with tortoiseshell UVs; lenses + nose pads
  const frameParts = [...byName(/Temple|Frames/), ...byName(/Earhook/)].map(q => {
    const g = prep(q.geometry); const pp = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pp.count; i++) uv.setXY(i, tort[0] + (tort[2] - tort[0]) * ((pp.getX(i) + 0.08) / 0.16), tort[1] + (tort[3] - tort[1]) * ((pp.getY(i) - pp.getZ(i) * 0.4) / 0.12));
    if (/Earhook/.test(q.name)) solidUV(g, A.centre('dark'));
    return g;
  });
  const pairFrame = mergeAll(frameParts);
  const pairLens = mergeAll([...byName(/LensesExterior|LensesInterior|Nosepads/)].map(q => prep(q.geometry)));
  const n = F.sunPoses.length;
  const base = F.sunPoses.map((sp) => M(sp.pos, [0, sp.rotY, 0]).multiply(M([0, 0.086, 0.004], [-sp.tilt - 6 * DEG, 0, 0])).multiply(M([0, -0.04, 0])));
  const frames = [], lenses = [], cols = [];
  for (let i = 0; i < n; i++) {
    const c = p && p.colours[i % p.colours.length];
    cols.push(colourOf(c));
    frames.push(pairFrame.clone().applyMatrix4(base[i]));
    lenses.push(pairLens.clone().applyMatrix4(base[i]));
  }
  frames.forEach((g, i) => setColor(g, cols[i]));
  const fGeo = mergeAll(frames), lGeo = mergeAll(lenses);
  fGeo.userData.atlas = true;
  const lensMat = mats.glass.clone(); lensMat.color.set('#1a1410'); lensMat.opacity = 0.72; lensMat.name = 'fixtures:lens';
  F.metals.add(lensMat); lensMat.userData.envI = 1.4;
  const fMesh = staticMesh(F, fGeo, mats.gloss, 'fixtures:sunFrames');
  const lMesh = staticMesh(F, lGeo, lensMat, 'fixtures:sunLenses', { cast: false }); lMesh.renderOrder = 3;
  const per = pairFrame.attributes.position.count, perL = pairLens.attributes.position.count;
  const fOrig = fGeo.attributes.position.array.slice(), lOrig = lGeo.attributes.position.array.slice();
  // the flyer: one pair that animates to the viewer's eyes
  const flyF = new THREE.Mesh(pairFrame.clone(), mats.gloss); setColor(flyF.geometry, '#ffffff');
  const flyLensMat = lensMat.clone(); F.metals.add(flyLensMat); flyLensMat.userData.envI = 1.4;
  const flyL = new THREE.Mesh(pairLens.clone(), flyLensMat); flyL.renderOrder = 3;
  const fly = new THREE.Group(); fly.name = 'fixtures:sunFlyer'; fly.add(flyF, flyL); fly.visible = false; fly.matrixAutoUpdate = false;
  flyF.castShadow = false; F.root.add(fly);
  const handles = cols.map((c, i) => ({ mesh: fMesh, start: i * per, count: per }));
  const hide = (i, on) => {
    const fa = fGeo.attributes.position, la = lGeo.attributes.position;
    for (let k = i * per * 3; k < (i + 1) * per * 3; k++) fa.array[k] = on ? fOrig[i * per * 3] : fOrig[k];
    for (let k = i * perL * 3; k < (i + 1) * perL * 3; k++) la.array[k] = on ? lOrig[i * perL * 3] : lOrig[k];
    fa.needsUpdate = true; la.needsUpdate = true;
  };
  F.sun = { base, fly, flyF, flyL, flyLensMat, lensOp: lensMat.opacity, cols, handles, hide };
  F.sunPoses.forEach((sp, i) => {
    P.box([sp.pos[0], sp.pos[1] + 0.07, sp.pos[2]], [0.18, 0.12, 0.2], sp.rotY, () => productCard(F, p, {
      at: [sp.pos[0], sp.pos[1] + 0.1, sp.pos[2]],
      recolor: (_sw, c) => { cols[i] = colourOf(c); recolor(handles[i], cols[i]); },
      actions: [{ label: 'Try them on ✦', run: () => F.tryOnSunglasses(i) }],
    }));
  });
}

/** Per-frame try-on animation (fly to the eyes, hold, fly back). Registered by fixtures.js. */
export function sunglassesUpdater(F) {
  const { ctx } = F;
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), s0 = new THREE.Vector3(), s1 = new THREE.Vector3();
  const wear = new THREE.Matrix4(), off = M([0, -0.012, -0.082], [0, Math.PI, 0]).multiply(M([0, -0.03, 0]));
  let t = 0, i = -1;
  F.tryOnSunglasses = (k) => {
    if (!F.sun || i >= 0) return;
    i = k; t = 0;
    const S = F.sun;
    setColor(S.flyF.geometry, S.cols[k]);
    S.hide(k, true); S.fly.visible = true;
    ctx.ui.hideCard();
    ctx.fx.burst(new THREE.Vector3().setFromMatrixPosition(S.base[k]), { color: '#ffd58a', count: 36 });
  };
  return (dt) => {
    if (i < 0 || !F.sun) return;
    const S = F.sun;
    t += dt;
    const T_IN = 0.9, HOLD = 2.6, T_OUT = 0.9;
    let k;
    if (t < T_IN) k = ease(t / T_IN); else if (t < T_IN + HOLD) k = 1; else k = 1 - ease((t - T_IN - HOLD) / T_OUT);
    if (t >= T_IN && t - dt < T_IN) { ctx.ui.toast(line()); S.flyLensMat.opacity = 0.28; }
    if (t >= T_IN + HOLD && t - dt < T_IN + HOLD) S.flyLensMat.opacity = S.lensOp;
    ctx.camera.updateMatrixWorld();
    wear.multiplyMatrices(ctx.camera.matrixWorld, off);
    S.base[i].decompose(p0, q0, s0); wear.decompose(p1, q1, s1);
    p0.lerp(p1, k); p0.y += Math.sin(k * Math.PI) * 0.25; q0.slerp(q1, k);
    S.fly.matrix.compose(p0, q0, s0); S.fly.matrixWorldNeedsUpdate = true;
    if (t > T_IN + HOLD + T_OUT) {
      S.fly.visible = false; S.hide(i, false);
      ctx.fx.burst(new THREE.Vector3().setFromMatrixPosition(S.base[i]), { color: '#ffd58a', count: 24 });
      i = -1;
    }
  };
  function line() { const L = ['Very chic — the whole shop looks better through these', 'Incognito, but make it fashion', 'Suddenly it feels like summer in Camps Bay', 'Those are so you — add them to your bag?']; return L[Math.floor(ctx.time * 7) % L.length]; }
}
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

// ============================================================================================ watch (lazy)
/**
 * Loads the chronograph after the store is ready (non-blocking) in its gold variant, splits it onto the
 * module's shapes (metal / gloss vertex-coloured parts, face, glass) and plays Anim_0 on the seconds hand.
 * Shown within ~1.9 m. The cloche card is the shop's opening hours.
 */
export function loadWatch(F) {
  // fixtures-watch = 'watch' without its hidden / sub-pixel meshes (tools/fixtures-lod.mjs); original as fallback
  const A = F.ctx.assets;
  return A.gltf('fixtures-watch').catch(() => A.gltf('watch')).then((g) => buildWatch(F, g)).catch((e) => console.warn('[fixtures] watch', e && e.message));
}
async function buildWatch(F, g) {
  const { ctx, root, mats } = F;
  const scene = g.scene; scene.updateMatrixWorld(true);
  const skip = /Backplate|Clasp|Button/; // pushers + crown: 13.5k triangles nobody can see at 5 cm
  let secNode = null; scene.traverse(o => { if (!secNode && /^Hand[_ ]?Seconds$/i.test(o.name)) secNode = o; });
  const inSec = (o) => { for (let p = o; p; p = p.parent) if (p === secNode) return true; return false; };
  const secInv = secNode ? new THREE.Matrix4().copy(secNode.matrixWorld).invert() : null;
  const variant = (g.userData.variantNames || []).includes('Midnight Gold') ? 'Midnight Gold' : null;
  const matOf = async (o) => {
    const vm = o.userData.variantMaterialIdx;
    if (variant && vm && vm[variant] !== undefined) return g.parser.getDependency('material', vm[variant]);
    return o.material;
  };
  const metal = [], plastic = [], face = [], glass = [], sec = [];
  const meshes = []; scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    let sk = false; for (let p = o; p; p = p.parent) if (skip.test(p.name)) sk = true;
    if (sk) continue;
    const mat = await matOf(o);
    const inS = secNode && inSec(o);
    const mtx = inS ? new THREE.Matrix4().multiplyMatrices(secInv, o.matrixWorld) : o.matrixWorld;
    const col = mat.color ? '#' + mat.color.getHexString() : '#888888';
    if (mat.transparent) { glass.push(prep(o.geometry).applyMatrix4(mtx)); continue; }
    if (mat.map && !inS) { face.push({ geo: prep(o.geometry, '#ffffff').applyMatrix4(mtx), mat }); continue; }
    const geo = prep(o.geometry, col).applyMatrix4(mtx); solidUV(geo, F.A.centre('white'));
    if (inS) sec.push(geo); else if ((mat.metalness ?? 0) > 0.5) metal.push(geo); else plastic.push(geo);
  }
  const W = new THREE.Group(); W.name = 'fixtures:watch';
  const add = (parent, geo, mat, ro = 0) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = true; m.renderOrder = ro; parent.add(m); return m; };
  if (metal.length) add(W, mergeAll(metal), mats.metal);
  if (plastic.length) add(W, mergeAll(plastic), mats.gloss);
  if (face.length) {
    const src = face[0].mat;
    const fm = new THREE.MeshStandardMaterial({ map: src.map, vertexColors: true, roughness: 0.4, metalness: 0.2, name: 'fixtures:watchFace' });
    add(W, mergeAll(face.map(f => f.geo)), fm);
  }
  if (glass.length) add(W, mergeAll(glass), mats.glass, 2);
  // rebuild the seconds hand's node chain (sanitised names) so the clip's 'Hand_Seconds.quaternion' binds
  if (secNode && sec.length) {
    const chain = []; for (let p = secNode; p && p !== scene; p = p.parent) chain.unshift(p);
    let parent = W;
    for (const src of chain) { const o = new THREE.Object3D(); o.name = src.name; o.position.copy(src.position); o.quaternion.copy(src.quaternion); o.scale.copy(src.scale); parent.add(o); parent = o; }
    add(parent, mergeAll(sec), mats.gloss);
  }
  const [ox, oy, oz] = CLOCHE.pos;
  W.scale.setScalar(0.01);
  const pivot = new THREE.Group(); pivot.name = 'fixtures:watchPivot';
  pivot.position.set(ox, oy + 0.058, oz); pivot.rotation.set(0, CLOCHE.yaw, 0);
  const tilt = new THREE.Group(); tilt.rotation.x = -52 * DEG; pivot.add(tilt);
  W.position.set(0, 0, 0.0195); tilt.add(W);
  // lazily added after 'ready': compile its programs hidden first (ctx.warm), so its first view never hitches
  pivot.visible = false; root.add(pivot);
  F.applyEnv();
  if (ctx.warm) { try { await ctx.warm(pivot); } catch (e) { /* optional */ } }
  let mixer = null;
  if (g.animations && g.animations.length && secNode) { mixer = new THREE.AnimationMixer(W); mixer.clipAction(g.animations[0]).play(); }
  let speed = 1, boost = 0, frame = 0;
  const cam = ctx.camera, wp = new THREE.Vector3(ox, oy + 0.06, oz);
  const near = () => { pivot.visible = cam.position.distanceTo(wp) < 1.9; }; // a 5 cm watch is a few pixels beyond ~2 m
  near(); ctx.events.addEventListener('camset', near);
  ctx.onUpdate((dt) => {
    if ((frame++ & 7) === 0) near();
    if (!pivot.visible || !mixer) return;
    if (boost > 0) { boost -= dt; speed = 1 + 59 * Math.min(1, boost); } else speed = 1;
    mixer.update(dt * speed);
  });
  F.applyEnv();
  const wind = () => { boost = 1.6; ctx.fx.burst(new THREE.Vector3(ox, oy + 0.15, oz), { color: '#ffd58a', count: 40 }); ctx.ui.toast('Tick-tick-tick — fully wound'); };
  const proxy = F.P.box([ox, oy + 0.14, oz], [0.24, 0.3, 0.24], 0, () => clocheInfo(F, { actions: [{ label: 'Wind it ✦', run: wind }] }));
  F.watch = { pivot, W, mixer, proxy };
  return F.watch;
}
