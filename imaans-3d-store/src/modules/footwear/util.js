// footwear — small geometry helpers + a merge-by-material batcher.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** Matrix from position [x,y,z], euler [x,y,z] (radians), scale (number | [x,y,z]). */
export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.fromArray(scale); else _s.setScalar(scale);
  return new THREE.Matrix4().compose(_p.fromArray(pos), _q, _s);
}

/**
 * Metre-scale box-projected UVs that KEEP the geometry's smooth normals and index
 * (kit.boxUV de-indexes and re-computes flat normals, which facets small bevels).
 */
export function uvBox(geo, scale = 1) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Rounded box with metre UVs (smooth bevels). */
export function rbox(w, h, d, r = 0.006, seg = 2) {
  return uvBox(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
}

/** Cylinder with metre UVs along its axis (y). */
export function cyl(rTop, rBot, h, seg = 24, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv, p = g.attributes.position;
  const R = Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) {
    const y = p.getY(i);
    if (Math.abs(g.attributes.normal.getY(i)) > 0.9) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, uv.getX(i) * Math.PI * 2 * R, y);
  }
  return g;
}

/** Tube along a list of THREE.Vector3 points. */
export function tube(points, r, seg = 48, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, r, radial, closed);
  return g;
}

/**
 * Collects geometries per material key, bakes transforms, normalises attributes and merges.
 * Attributes kept: position, normal, uv (+ color when the key asks for vertex colours, + uv1 from fn).
 */
export class Batch {
  constructor() { this.parts = new Map(); }
  add(key, geo, matrix = null, color = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    if (color !== null && !g.attributes.color) {
      const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }
  keys() { return [...this.parts.keys()]; }
  /** Merge one key. uv1Fn(x,y,z) → [u,v] adds a second UV set (baked light maps); uv1: true adds a zero one. */
  merge(key, { colors = false, uv1Fn = null, uv1 = false } = {}) {
    const list = this.parts.get(key); if (!list || !list.length) return null;
    for (const g of list) {
      if (colors && !g.attributes.color) {
        const n = g.attributes.position.count; const a = new Float32Array(n * 3).fill(1);
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
      if (!colors && g.attributes.color) g.deleteAttribute('color');
    }
    const geo = mergeGeometries(list, false);
    if (uv1Fn) {
      const p = geo.attributes.position; const a = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { const [u, v] = uv1Fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 2] = u; a[i * 2 + 1] = v; }
      geo.setAttribute('uv1', new THREE.BufferAttribute(a, 2));
    } else if (uv1) geo.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
}

/**
 * Soft blob shadows merged into ONE mesh on the shared unlit-transparent program (map only, no vertex
 * colours): per-quad opacity picks one of 8 pre-faded blobs in a strip texture.
 */
const SHADOW_LEVELS = 8;
let _shadowStrip = null;
function shadowStrip() {
  if (_shadowStrip) return _shadowStrip;
  const c = document.createElement('canvas'); c.width = 128 * SHADOW_LEVELS; c.height = 128;
  const g = c.getContext('2d');
  for (let k = 0; k < SHADOW_LEVELS; k++) {
    const a = 0.22 + (0.72 * k) / (SHADOW_LEVELS - 1), cx = k * 128 + 64;
    const grd = g.createRadialGradient(cx, 64, 0, cx, 64, 60);
    grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(0.45, `rgba(0,0,0,${a * 0.55})`);
    grd.addColorStop(0.75, `rgba(0,0,0,${a * 0.18})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(k * 128, 0, 128, 128);
  }
  _shadowStrip = new THREE.CanvasTexture(c); _shadowStrip.colorSpace = THREE.NoColorSpace;
  return _shadowStrip;
}
export class ShadowBatch {
  constructor() { this.quads = []; }
  /** x,z centre, w,d size, y surface height, rotY, opacity */
  add(x, y, z, w, d, rotY = 0, opacity = 0.5) { this.quads.push([x, y, z, w, d, rotY, opacity]); }
  mesh(addMat) {
    const n = this.quads.length; if (!n) return null;
    const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    const corners = [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];
    this.quads.forEach(([x, y, z, w, d, r, o], q) => {
      const c = Math.cos(r), s = Math.sin(r);
      const lvl = Math.max(0, Math.min(SHADOW_LEVELS - 1, Math.round(((o - 0.22) / 0.72) * (SHADOW_LEVELS - 1))));
      corners.forEach(([cx, cz, u, v], k) => {
        const lx = cx * w, lz = cz * d;
        pos.set([x + lx * c + lz * s, y, z - lx * s + lz * c], (q * 4 + k) * 3);
        uv.set([(lvl + 0.03 + u * 0.94) / SHADOW_LEVELS, 0.03 + v * 0.94], (q * 4 + k) * 2);
      });
      const b = q * 4; idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = addMat('contactShadow', shadowStrip(), { color: '#000000' });
    const mesh = new THREE.Mesh(g, m); mesh.name = 'footwear:shadows'; mesh.renderOrder = 1;
    mesh.raycast = () => {};
    return mesh;
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
