// Architecture helpers: merge-by-material batching, world-space metre UVs, profile extrusions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

/** Matrix from position / euler rotation / scale. */
export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.fromArray(scale); else _s.setScalar(scale);
  return new THREE.Matrix4().compose(_p.fromArray(pos), _q, _s);
}

const _nonIndexed = new WeakMap();
const _nm = new THREE.Matrix3();
/**
 * Collects geometries per key, then merges each key into ONE mesh (one draw call per material).
 * Geometries are baked to world space in tight typed-array loops (no clone/applyMatrix4 churn);
 * UVs can be re-projected to world metres; uv1 (light-map UVs) is computed per batch at merge time;
 * per-part vertex colours supported. Source geometries are never mutated.
 */
export class Batch {
  constructor() { this.parts = new Map(); }
  /** o: {worldUV: bool|number (scale), color: THREE.Color|[r,g,b]|fn(x,y,z)->[r,g,b], uvScale:[su,sv]} */
  add(key, geo, matrix = null, o = {}) {
    let g = geo;
    if (geo.index) { g = _nonIndexed.get(geo); if (!g) { g = geo.toNonIndexed(); _nonIndexed.set(geo, g); } }
    const P = g.attributes.position.array, N = g.attributes.normal && g.attributes.normal.array, U = g.attributes.uv && g.attributes.uv.array;
    const n = P.length / 3;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const e = matrix ? matrix.elements : null;
    let m = null;
    if (e) { _nm.getNormalMatrix(matrix); m = _nm.elements; }
    const wuv = o.worldUV || !U, ws = typeof o.worldUV === 'number' ? o.worldUV : 1;
    const su = o.uvScale ? o.uvScale[0] : 1, sv = o.uvScale ? o.uvScale[1] : 1;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      let x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      let nx = N ? N[i3] : 0, ny = N ? N[i3 + 1] : 1, nz = N ? N[i3 + 2] : 0;
      if (e) {
        const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
        x = X; y = Y; z = Z;
        const NX = m[0] * nx + m[3] * ny + m[6] * nz, NY = m[1] * nx + m[4] * ny + m[7] * nz, NZ = m[2] * nx + m[5] * ny + m[8] * nz;
        const l = Math.hypot(NX, NY, NZ) || 1; nx = NX / l; ny = NY / l; nz = NZ / l;
      }
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z; nor[i3] = nx; nor[i3 + 1] = ny; nor[i3 + 2] = nz;
      if (wuv) {
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        let u, v;
        if (ax >= ay && ax >= az) { u = nx > 0 ? -z : z; v = y; } else if (ay >= az) { u = x; v = -z; } else { u = nz > 0 ? x : -x; v = y; }
        uv[i * 2] = u * ws; uv[i * 2 + 1] = v * ws;
      } else { uv[i * 2] = U[i * 2] * su; uv[i * 2 + 1] = U[i * 2 + 1] * sv; }
    }
    let col = null;
    if (o.color !== undefined) {
      col = new Float32Array(n * 3);
      const c0 = o.color;
      for (let i = 0; i < n; i++) {
        const c = typeof c0 === 'function' ? c0(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], i) : c0;
        if (c.isColor) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } else { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
      }
    }
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push({ pos, nor, uv, col, n });
  }
  /** Merge a key → BufferGeometry (or null). uv1Fn(x,y,z,nx,ny,nz) → [u,v] adds a light-map channel. */
  merge(key, uv1Fn = null) {
    const list = this.parts.get(key);
    if (!list || !list.length) return null;
    const total = list.reduce((a, p) => a + p.n, 0);
    const hasColor = list.some(p => p.col);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const col = hasColor ? new Float32Array(total * 3).fill(1) : null;
    let o = 0;
    for (const p of list) {
      pos.set(p.pos, o * 3); nor.set(p.nor, o * 3); uv.set(p.uv, o * 2);
      if (col && p.col) col.set(p.col, o * 3);
      o += p.n;
    }
    this.parts.delete(key);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv1Fn) {
      const uv1 = new Float32Array(total * 2);
      for (let i = 0; i < total; i++) {
        const r = uv1Fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
        uv1[i * 2] = r[0]; uv1[i * 2 + 1] = r[1];
      }
      g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    }
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  keys() { return [...this.parts.keys()]; }
}

/** World-space box projection UVs in metres (keeps the existing normals). */
export function worldUV(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = n.getX(i) > 0 ? -z : z; v = y; }
    else if (ay >= ax && ay >= az) { u = x; v = -z; }
    else { u = n.getZ(i) > 0 ? x : -x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Sweep a 2-D profile (CCW points [d, h]: d = distance out along `normal`, h = distance along `up`;
 * the closing edge back to the first point lies on the wall and is omitted) along a straight run
 * of `length` from `start` in direction `along`. Smooth normals across shallow bends, crisp at
 * corners; optional fan caps at both ends. Direct typed arrays — no ExtrudeGeometry/earcut.
 */
export function profileRun(profile, length, start, along, normal, up = [0, 1, 0], caps = true) {
  const X = new THREE.Vector3(...normal), Y = new THREE.Vector3(...up), Z = new THREE.Vector3().crossVectors(X, Y);
  const A = new THREE.Vector3(...along), O = new THREE.Vector3(...start);
  if (Z.dot(A) < 0) O.addScaledVector(A, length);
  const np = profile.length, segs = np - 1;
  // per-segment 2-D outward normals, per-end smoothed normals
  const sn = [];
  for (let i = 0; i < segs; i++) { const dx = profile[i + 1][0] - profile[i][0], dh = profile[i + 1][1] - profile[i][1], l = Math.hypot(dx, dh) || 1; sn.push([dh / l, -dx / l]); }
  const endN = (i, end) => { // normal at segment i's start (end=0) or end (end=1)
    const j = end ? i + 1 : i - 1, a = sn[i];
    if (j < 0 || j >= segs) return a;
    const b = sn[j], dot = a[0] * b[0] + a[1] * b[1];
    if (dot < 0.5) return a; // > 60° bend → crisp
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l];
  };
  const capTris = caps ? (np - 1) : 0;
  const nv = segs * 6 + capTris * 6;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  let k = 0;
  const put = (d, h, z, nd, nh, nz) => {
    pos[k] = O.x + X.x * d + Y.x * h + Z.x * z; pos[k + 1] = O.y + X.y * d + Y.y * h + Z.y * z; pos[k + 2] = O.z + X.z * d + Y.z * h + Z.z * z;
    nor[k] = X.x * nd + Y.x * nh + Z.x * nz; nor[k + 1] = X.y * nd + Y.y * nh + Z.y * nz; nor[k + 2] = X.z * nd + Y.z * nh + Z.z * nz;
    k += 3;
  };
  for (let i = 0; i < segs; i++) {
    const [d0, h0] = profile[i], [d1, h1] = profile[i + 1], n0 = endN(i, 0), n1 = endN(i, 1);
    put(d0, h0, 0, n0[0], n0[1], 0); put(d1, h1, 0, n1[0], n1[1], 0); put(d1, h1, length, n1[0], n1[1], 0);
    put(d0, h0, 0, n0[0], n0[1], 0); put(d1, h1, length, n1[0], n1[1], 0); put(d0, h0, length, n0[0], n0[1], 0);
  }
  if (caps) {
    const cd = 0, ch = (profile[0][1] + profile[np - 1][1]) / 2;
    for (let i = 0; i < np - 1; i++) {
      const [d0, h0] = profile[i], [d1, h1] = profile[i + 1];
      put(cd, ch, length, 0, 0, 1); put(d0, h0, length, 0, 0, 1); put(d1, h1, length, 0, 0, 1);
      put(cd, ch, 0, 0, 0, -1); put(d1, h1, 0, 0, 0, -1); put(d0, h0, 0, 0, 0, -1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/** Radial-gradient soft blob painted into a 2-D context (additive "light"). */
export function blob(g, x, y, rx, ry, rgb, a, rot = 0, stops = [[0, 1], [0.35, 0.62], [0.7, 0.2], [1, 0]]) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(rx, ry);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [t, k] of stops) grd.addColorStop(t, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * k})`);
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
  g.restore();
}

let _noise = null;
/**
 * Break 8-bit gradient banding: overlay a tiny tiled noise pattern additively (no getImageData →
 * no synchronous canvas read-back, which is very slow on phones).
 */
export function dither(g, W, H, amp = 3, seed = 7) {
  if (!_noise) {
    _noise = document.createElement('canvas'); _noise.width = _noise.height = 64;
    const n = _noise.getContext('2d'), img = n.createImageData(64, 64), d = img.data;
    let s = seed >>> 0;
    for (let i = 0; i < d.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    n.putImageData(img, 0, 0);
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, amp / 255);
  g.fillStyle = g.createPattern(_noise, 'repeat');
  g.fillRect(0, 0, W, H);
  g.restore();
}
