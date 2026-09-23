// Static fixture geometry for apparelRails: a tiny merge-by-material batcher plus the parts the wall bays
// and floor rails are made of (fluted pilasters, bevelled boards, brass tubes, brackets, podiums, props).
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

/**
 * Fluted pilaster profile extruded vertically. Footprint: depth `d` out from the wall (−x → +x in local
 * space, wall at x = 0), width `w` along z, `n` concave flutes on the front face. Origin: wall, floor, centre.
 */
export function flutedPilaster(w, d, h, n = 5) {
  const s = new THREE.Shape();
  const hw = w / 2, ch = 0.008;
  const fl = (w - 2 * 0.022) / n, fr = fl * 0.36;
  s.moveTo(0, -hw);
  s.lineTo(d - ch, -hw); s.lineTo(d, -hw + ch);
  let z = -hw + 0.022;
  s.lineTo(d, z);
  for (let i = 0; i < n; i++) {
    const zc = z + fl / 2;
    s.lineTo(d, zc - fr);
    const segs = 5;
    for (let k = 1; k < segs; k++) { const a = Math.PI * k / segs; s.lineTo(d - Math.sin(a) * fr * 0.9, zc - fr * Math.cos(a)); }
    s.lineTo(d, zc + fr);
    z += fl;
    s.lineTo(d, z);
  }
  s.lineTo(d, hw - ch); s.lineTo(d - ch, hw); s.lineTo(0, hw); s.lineTo(0, -hw);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 1 });
  // shape (x, y) = (out from wall, along wall); extrusion +z → +y (a proper rotation, keeps the winding)
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Stepped moulding bar along +z (length L) with a simple crown profile; origin at wall/bottom/start. */
export function crownBeam(L, h, d) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(d - 0.01, 0); s.lineTo(d, 0.012); s.lineTo(d, h - 0.03);
  s.lineTo(d + 0.012, h - 0.022); s.lineTo(d + 0.016, h - 0.008); s.lineTo(d + 0.012, h); s.lineTo(0, h); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 1 });
  return g;
}

// ------------------------------------------------------------------------------------------------
// Shelf props
// ------------------------------------------------------------------------------------------------
/** Hat box with a slightly larger lid. Origin: bottom centre. Unit size (r = 1, h = 1) → scale per instance. */
export function hatBox() {
  const pts = [[0, 0], [0.97, 0], [1, 0.02], [1, 0.78], [1.035, 0.78], [1.04, 0.8], [1.04, 0.985], [1.02, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 16);
  return g;
}

/** Structured handbag: trapezoid body + flap + top handle. Origin bottom centre, ~0.3 × 0.22 × 0.13 m. */
export function handbag() {
  const body = new RoundedBoxGeometry(0.3, 0.2, 0.12, 2, 0.03);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 - 0.14 * (y + 0.1) / 0.2; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (1 - 0.08 * (y + 0.1) / 0.2)); }
  body.translate(0, 0.1, 0);
  const flap = new RoundedBoxGeometry(0.262, 0.09, 0.012, 1, 0.005); flap.translate(0, 0.16, 0.058);
  const curve = new THREE.CatmullRomCurve3([[-0.075, 0.195, 0], [-0.06, 0.27, 0], [0, 0.3, 0], [0.06, 0.27, 0], [0.075, 0.195, 0]].map(v => new THREE.Vector3(...v)));
  const handle = new THREE.TubeGeometry(curve, 10, 0.008, 5, false);
  const parts = [body, flap, handle].map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
  const g = mergeGeometries(parts, false);
  boxUVInPlace(g);
  return g;
}

/** Tote: open-top soft box + two strap loops. */
export function tote() {
  const body = new RoundedBoxGeometry(0.34, 0.3, 0.11, 2, 0.02);
  body.translate(0, 0.15, 0);
  const parts = [body];
  for (const sd of [1, -1]) {
    const c = new THREE.CatmullRomCurve3([[-0.07, 0.29, sd * 0.05], [-0.05, 0.42, sd * 0.045], [0.05, 0.42, sd * 0.045], [0.07, 0.29, sd * 0.05]].map(v => new THREE.Vector3(...v)));
    parts.push(new THREE.TubeGeometry(c, 8, 0.006, 4, false));
  }
  const ps = parts.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
  const g = mergeGeometries(ps, false);
  boxUVInPlace(g);
  return g;
}
