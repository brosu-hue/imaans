// fixtures — the two GLBs, converted onto the module's material shapes so they add (almost) nothing:
//   sunglasses  one pair per pose that the sunglasses generator recorded (counter + shelf): frames join the
//               gloss batch (atlas tortoiseshell UVs, vertex colour = the product colour), lenses the tinted
//               'lens' batch — 0 draw calls of their own. A single "flyer" pair (hidden until used) animates
//               the try-on: the pair on the stand is collapsed out of the batch while it flies.
//   plant       only the alpha-tested leaves are used (foliage material, one merged mesh for both plants);
//               the planters are procedural (furniture.js).
// No InstancedMesh (instancing = a second program per material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, setColor, solidUV, recolor, collapse } from './util.js';

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

/** Load both models and add their parts to the batches (awaited by build() before the batches merge). */
export async function placeGLBs(F) {
  const A = F.ctx.assets;
  const res = await Promise.allSettled([
    F.sunPoses.length ? A.flatten('fixtures-sunglasses').then(parts => placeSunglasses(F, parts)) : null,
    F.canopies.length ? A.flatten('fixtures-plant').then(parts => placeLeaves(F, parts)) : null,
  ]);
  for (const r of res) if (r.status === 'rejected') console.warn('[fixtures] model', r.reason && r.reason.message);
}

// ============================================================================================ plants
/**
 * The leaf colour map within the tier's texture cap (low: 512). The model loader keeps alpha-tested maps full
 * size, because a 2D canvas loses the colour of transparent texels (premultiplied) → dark fringes at the
 * alpha-test edge. Here the downscaled texels are read back once and the leaf colour is bled into the cleared
 * ones (a few dilation passes, then the mean leaf colour everywhere else), and the result is uploaded as raw
 * RGBA (DataTexture: no premultiplication), so edges and mip levels stay green.
 */
function leafMap(F, map) {
  const max = F.ctx.q.texMax, img = map && map.image;
  const w = img && (img.naturalWidth || img.width), h = img && (img.naturalHeight || img.height);
  if (!max || !w || !h || (w <= max && h <= max) || typeof document === 'undefined') return map;
  const k = max / Math.max(w, h), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return map;
  g.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  let d;
  try { g.drawImage(img, 0, 0, W, H); d = g.getImageData(0, 0, W, H).data; } catch (e) { return map; }
  const has = new Uint8Array(W * H), mean = [0, 0, 0]; let n = 0;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 8) { has[i] = 1; mean[0] += d[i * 4]; mean[1] += d[i * 4 + 1]; mean[2] += d[i * 4 + 2]; n++; }
  if (!n) return map;
  for (let pass = 0; pass < 4; pass++) {
    const was = has.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (was[i]) continue;
      let r = 0, gg = 0, b = 0, m = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && was[j]) { r += d[j * 4]; gg += d[j * 4 + 1]; b += d[j * 4 + 2]; m++; }
      }
      if (m) { d[i * 4] = r / m; d[i * 4 + 1] = gg / m; d[i * 4 + 2] = b / m; has[i] = 1; }
    }
  }
  for (let i = 0; i < W * H; i++) if (!has[i]) { d[i * 4] = mean[0] / n; d[i * 4 + 1] = mean[1] / n; d[i * 4 + 2] = mean[2] / n; }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer), W, H, THREE.RGBAFormat);
  Object.assign(t, { colorSpace: map.colorSpace, wrapS: map.wrapS, wrapT: map.wrapT, flipY: map.flipY, anisotropy: map.anisotropy,
    magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, name: 'fixtures:leaves-' + W });
  t.needsUpdate = true;
  return t;
}

function placeLeaves(F, parts) {
  const src = parts.find(p => /leaves/i.test(p.name));
  if (!src) return;
  const leaf = prep(src.geometry);
  const list = [];
  for (const c of F.canopies) for (const [y, s, rot, dx, dz] of c.clusters) {
    list.push(leaf.clone().applyMatrix4(M([c.x + dx, y, c.z + dz], [0, rot, 0], [s * c.sxz, s, s * c.sxz])));
  }
  const mat = new THREE.MeshStandardMaterial({ map: leafMap(F, src.material.map), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0, name: 'fixtures:foliage' });
  const mesh = new THREE.Mesh(mergeAll(list), mat);
  mesh.name = 'fixtures:leaves'; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  F.root.add(mesh);
}

// ============================================================================================ sunglasses
const colourOf = (c) => (c && /tort/i.test(c.label) ? '#ffffff' : (c && c.swatch) || '#1c1c1c');

function placeSunglasses(F, parts) {
  const { A, B } = F;
  const tort = A.regions.tortoise;
  const byName = (re) => parts.filter(q => re.test(q.name));
  // one pair in model space: frames (+ temples + earhooks) with tortoiseshell UVs; lenses + nose pads
  const frameParts = [...byName(/Temple|Frames/), ...byName(/Earhook/)].map(q => {
    const g = prep(q.geometry); const pp = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pp.count; i++) uv.setXY(i, tort[0] + (tort[2] - tort[0]) * ((pp.getX(i) + 0.08) / 0.16), tort[1] + (tort[3] - tort[1]) * Math.min(1, Math.max(0, (pp.getY(i) - pp.getZ(i) * 0.4) / 0.12)));
    if (/Earhook/.test(q.name)) solidUV(g, A.centre('dark'));
    return g;
  });
  const pairFrame = mergeAll(frameParts); pairFrame.userData.atlas = true;
  const pairLens = mergeAll(byName(/LensesExterior|LensesInterior|Nosepads/).map(q => prep(q.geometry)));
  const cols = [], frames = [], lenses = [];
  F.sunPoses.forEach((sp) => {
    const c = sp.p && sp.p.colours.length ? sp.p.colours[sp.ci % sp.p.colours.length] : null;
    cols.push(colourOf(c));
    frames.push(B.add('gloss', pairFrame, sp.m, cols[cols.length - 1]));
    lenses.push(B.add('lens', pairLens, sp.m));
  });
  F.sun = { pairFrame, pairLens, cols, frames, lenses, base: F.sunPoses.map(sp => sp.m) };
  F.sunPaint = (i, c) => { cols[i] = colourOf(c); recolor(frames[i], cols[i]); };
}

/** After the batches are built: the flyer pair (same materials as the batches → no new programs). */
export function makeFlyer(F) {
  const S = F.sun; if (!S) return;
  const { mats } = F;
  const fg = S.pairFrame.clone(); setColor(fg, '#ffffff');
  const flyF = new THREE.Mesh(fg, mats.gloss);
  const flyLensMat = mats.lens.clone(); flyLensMat.userData = { ...mats.lens.userData }; F.metals.add(flyLensMat);
  const flyL = new THREE.Mesh(S.pairLens.clone(), flyLensMat); flyL.renderOrder = 3;
  flyF.castShadow = false; flyL.castShadow = false;
  const fly = new THREE.Group(); fly.name = 'fixtures:sunFlyer'; fly.add(flyF, flyL); fly.visible = false; fly.matrixAutoUpdate = false;
  F.root.add(fly);
  Object.assign(S, { fly, flyF, flyL, flyLensMat, lensOp: flyLensMat.opacity });
  S.hide = (i, on) => { collapse(S.frames[i], on); collapse(S.lenses[i], on); };
}

/** Per-frame try-on animation (fly to the eyes, hold, fly back). Registered by fixtures.js. */
export function sunglassesUpdater(F) {
  const { ctx } = F;
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), s0 = new THREE.Vector3(), s1 = new THREE.Vector3();
  const wear = new THREE.Matrix4(), off = M([0, -0.012, -0.082], [0, Math.PI, 0]).multiply(M([0, -0.03, 0]));
  let t = 0, i = -1;
  F.tryOnSunglasses = (k) => {
    const S = F.sun;
    if (!S || !S.fly || i >= 0) return;
    i = k; t = 0;
    setColor(S.flyF.geometry, S.cols[k]);
    S.hide(k, true); S.fly.visible = true;
    ctx.ui.hideCard();
    ctx.fx.burst(new THREE.Vector3().setFromMatrixPosition(S.base[k]), { color: '#ffd58a', count: 36 });
  };
  const LINES = ['Very chic — the whole shop looks better through these', 'Incognito, but make it fashion', 'Suddenly it feels like summer in Camps Bay', 'Those are so you — add them to your bag?'];
  return (dt) => {
    if (i < 0 || !F.sun) return;
    const S = F.sun;
    t += dt;
    const T_IN = 0.9, HOLD = 2.6, T_OUT = 0.9;
    const k = t < T_IN ? ease(t / T_IN) : t < T_IN + HOLD ? 1 : 1 - ease((t - T_IN - HOLD) / T_OUT);
    if (t >= T_IN && t - dt < T_IN) { ctx.ui.toast(LINES[Math.floor(ctx.time * 7) % LINES.length]); S.flyLensMat.opacity = 0.28; }
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
}
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
