// Small shared helpers every module may use. Keep this file dependency-light.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export { RoundedBoxGeometry, mergeGeometries, mergeVertices };

/** Deterministic PRNG (mulberry32). Use instead of Math.random so screenshots are reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

/**
 * Re-projects UVs so that 1 UV unit = 1 metre (box / tri-planar projection per vertex,
 * picked by the dominant normal axis). All library materials assume metre-scale UVs.
 * Call on a geometry in its final local scale (before instancing). Returns the geometry.
 */
export function boxUV(geo, scale = 1, offset = [0, 0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset[0], y = p.getY(i) + offset[1], z = p.getZ(i) + offset[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= ax && ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Scale an existing 0..1 UV set to metres: u *= sx, v *= sy. */
export function scaleUV(geo, sx, sy = sx) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  uv.needsUpdate = true;
  return geo;
}

let _shadowTex = null;
/** The shared soft contact-shadow texture (radial falloff, alpha in the texture). */
export function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.75, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c); _shadowTex.colorSpace = THREE.NoColorSpace;
  return _shadowTex;
}
const _shadowMats = new Map();
/**
 * Soft baked "contact shadow" blob for anything standing on a surface — the cheapest,
 * most important realism cue (works on every tier, no shadow maps needed).
 * w/d = footprint in metres (make it ~15–30% larger than the object), y = surface height.
 */
export function contactShadow(w, d, opacity = 0.55, y = 0.003) {
  const key = opacity.toFixed(2);
  let mat = _shadowMats.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity, depthWrite: false, color: 0x000000,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = 'contactShadow';
    _shadowMats.set(key, mat);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 1;
  m.name = 'contactShadow';
  return m;
}

/** Mark a finished static subtree so three.js stops recomputing its matrices every frame. */
export function freeze(obj) {
  obj.updateMatrixWorld(true);
  obj.traverse(o => { o.matrixAutoUpdate = false; });
  return obj;
}

/**
 * GPU-memory cap (ctx.q.texMax): an image / ImageBitmap / canvas larger than `max` px on its long side comes
 * back as a canvas downscaled to `max` (aspect kept, high-quality smoothing); anything within the cap — or a
 * missing/zero max — comes back unchanged. Used by the material library and the model loader on the low tier.
 * Callers keep alpha-critical maps (alpha-tested / blended) at full size: a 2D canvas stores premultiplied
 * alpha, so fully transparent texels lose their colour.
 */
export function capImage(img, max) {
  const w = img && (img.naturalWidth || img.videoWidth || img.width), h = img && (img.naturalHeight || img.videoHeight || img.height);
  if (!max || !w || !h || (w <= max && h <= max) || typeof document === 'undefined') return img;
  const k = max / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  if (!g) return img;
  g.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  try { g.drawImage(img, 0, 0, c.width, c.height); } catch (e) { return img; }
  return c;
}

/** Build a CanvasTexture: draw(ctx2d, w, h). */
export function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * InstancedMesh from a list of {position:[x,y,z], rotation:[x,y,z], scale:number|[x,y,z], color?}.
 * Uses instanceColor when any item has a color. Returns the mesh (not yet added).
 */
export function instanced(geo, mat, items, { castShadow = false, receiveShadow = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D(); const col = new THREE.Color();
  items.forEach((it, i) => {
    d.position.fromArray(it.position || [0, 0, 0]);
    d.rotation.set(...(it.rotation || [0, 0, 0]));
    if (Array.isArray(it.scale)) d.scale.fromArray(it.scale); else d.scale.setScalar(it.scale ?? 1);
    d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    if (it.color !== undefined) m.setColorAt(i, col.set(it.color));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = castShadow; m.receiveShadow = receiveShadow;
  m.computeBoundingSphere();
  return m;
}

/**
 * Lathe from a list of [radius, y] points with metre UVs (u = arc length around, v = profile length).
 * The profile must run bottom → top for the faces to point outward (three.js LatheGeometry winding).
 */
export function lathe(points, segments = 48, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = points.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  // metre UVs
  let len = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); cum.push(len); }
  const maxR = Math.max(...points.map(p => p[0]));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const seg = Math.round(uv.getX(i) * segments), j = Math.round(uv.getY(i) * (pts.length - 1));
    uv.setXY(i, (seg / segments) * phiLength * maxR, cum[j] ?? 0);
  }
  g.normalizeNormals(); // LatheGeometry leaves the last profile vertex's normal unnormalised
  return g;
}

export const DEG = Math.PI / 180;
