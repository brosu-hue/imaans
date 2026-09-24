// Static fixture geometry for apparelRails: a tiny merge-by-material batcher plus the parts the bays are made
// of (bevelled boards, rail tubes, flanges, finials).
// Every generator returns geometry in METRES with metre UVs (library materials assume them).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** Matrix from position / euler rotation / scale. */
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** Merge-by-material batcher. add(key, geometry, matrix?, {uv: 'box'|'keep', grain: 'v'}) → build(materials) → meshes. */
export class Batch {
  constructor() { this.lists = new Map(); }
  add(key, geo, m = null, { uv = 'box', grain = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (uv === 'box' || !g.attributes.uv) boxUVInPlace(g, grain);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return this;
  }
  build(materials, root, { castShadow = false, receiveShadow = true } = {}) {
    const out = {};
    for (const [key, list] of this.lists) {
      const g = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[key]);
      mesh.name = 'apparelRails:' + key; mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      root.add(mesh); out[key] = mesh;
    }
    return out;
  }
}

/**
 * World-space box projection (1 UV = 1 m). grain 'v' makes wood grain run vertically on side faces
 * (library woods have their grain along u).
 */
function boxUVInPlace(g, grain) {
  if (!g.attributes.normal) g.computeVertexNormals();   // keep smooth normals of bevels / tubes
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= ax && ay >= az) { u = x; v = z; } else { u = x; v = y; }
    if (grain === 'v' && ay < Math.max(ax, az)) { const t = u; u = v; v = t; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Bevelled box (centre origin). */
export function board(w, h, d, r = 0.004) {
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
}

/** Tube along +y from y=0 to len (radius r). */
export function tube(r, len, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  g.translate(0, len / 2, 0);
  return g;
}

/** Tube between two points. */
export function tubeBetween(a, b, r, seg = 12) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = tube(r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export function ball(r, seg = 8) { return new THREE.SphereGeometry(r, seg, Math.max(5, seg * 0.7 | 0)); }

/** Short disc (flange) with its axis along +y. */
export function disc(r, t, seg = 16) { const g = new THREE.CylinderGeometry(r, r, t, seg); return g; }
