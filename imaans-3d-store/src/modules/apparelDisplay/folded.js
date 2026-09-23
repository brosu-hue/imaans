// apparelDisplay — folded garments (knits, tees, jeans) and hats. Unit-sized geometry meant for
// InstancedMesh (instance scale = real w/h/d). Origin = bottom centre, width along x, depth along z,
// the folded edge faces +z. UVs are metres at unit scale: v runs front→back so knit ribs / denim twill
// read the right way on the top face.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe } from './util.js';

/**
 * Folded garment slab: a rounded box (front edge = full roll), gently domed top, fold bulge at the front,
 * plus a neckline rib crescent at the back edge (collar hint) and shoulder fold creases on the top (sleeve
 * hints). Dimensions in metres (the real size — instance scale 1 keeps it, UVs = metres).
 */
export function foldedGeo({ w = 0.3, h = 0.06, d = 0.26, collar = true, seams = true, inner = 2 } = {}) {
  const R = h / 2, hw = w / 2, hd = d / 2, ix = Math.max(0, hw - R), iz = Math.max(0, hd - R);
  const axis = (half, inner) => {
    const a = [-half, -half + 0.3 * R, -half + R];
    for (let i = 1; i <= inner; i++) a.push(-half + R + (2 * (half - R)) * i / (inner + 1));
    a.push(half - R, half - 0.3 * R, half);
    return a;
  };
  const xs = axis(hw, inner), zs = axis(hd, inner), ys = [0, h * 0.5, h];
  const pos = [], nrm = [], uv = [], idx = [];
  const clampv = (v, a) => (v < -a ? -a : v > a ? a : v);
  const push = (x, y, z) => {
    const cx = clampv(x, ix), cy = h / 2, cz = clampv(z, iz);
    let nx = x - cx, ny = y - cy, nz = z - cz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const px = cx + nx * R, pz = cz + nz * R; let py = cy + ny * R;
    // shaping: domed top, fold bulge at the front, shoulder creases (sleeve hints)
    const tx = px / hw, tz = pz / hd;
    if (ny > 0.2) {
      py += h * 0.07 * (1 - tx * tx) * (1 - 0.6 * tz * tz);
      py += h * 0.08 * Math.max(0, tz) * Math.max(0, tz) * (1 - tx * tx * 0.5);
      if (seams) py -= h * 0.06 * Math.exp(-Math.pow((Math.abs(tx) - 0.6) / 0.08, 2)) * (1 - 0.5 * tz * tz);
    }
    pos.push(px, py, pz); nrm.push(nx, ny, nz); uv.push(px, pz);
  };
  const face = (A, B, map) => {
    const base = pos.length / 3;
    for (let j = 0; j < B.length; j++) for (let i = 0; i < A.length; i++) { const [x, y, z] = map(A[i], B[j]); push(x, y, z); }
    for (let j = 0; j < B.length - 1; j++) for (let i = 0; i < A.length - 1; i++) {
      const a = base + j * A.length + i, b = a + 1, c = a + A.length, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  };
  face(xs, zs, (x, z) => [x, h, z]);                                   // top
  face([-hw, -hw + R, hw - R, hw], [-hd, -hd + R, hd - R, hd], (x, z) => [x, 0, z]); // bottom (coarse)
  face(xs, ys, (x, y) => [x, y, hd]);                                  // front (fold)
  face(xs, ys, (x, y) => [x, y, -hd]);                                 // back
  face(zs, ys, (z, y) => [hw, y, z]);                                  // right
  face(zs, ys, (z, y) => [-hw, y, z]);                                 // left
  for (let t = 0; t < idx.length; t += 3) {                            // outward winding
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = nrm[a] + nrm[b] + nrm[c], ny = nrm[a + 1] + nrm[b + 1] + nrm[c + 1], nz = nrm[a + 2] + nrm[b + 2] + nrm[c + 2];
    if (fx * nx + fy * ny + fz * nz < 0) { const s2 = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s2; }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g = weldNormals(g);
  if (collar) g = mergeGeometries([g, collarGeo(w, h, d)], false);
  return g;
}

/** Recompute smooth normals across the duplicated face-seam vertices (keeps UVs). */
function weldNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    const e = map.get(k); if (e) e.push(i); else map.set(k, [i]);
  }
  for (const list of map.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0; for (const i of list) { x += n.getX(i); y += n.getY(i); z += n.getZ(i); }
    const l = Math.hypot(x, y, z) || 1; for (const i of list) n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}

/** Neckline rib crescent lying on the top near the back edge. */
function collarGeo(w, h, d) {
  const seg = 10, R0 = Math.min(0.085, w * 0.28), R1 = R0 + 0.016, cz = -d / 2 + 0.005, y0 = h * 1.0 + h * 0.035, th = 0.004;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI * (0.12 + 0.76 * i / seg);
    const c = Math.cos(a), s = Math.sin(a);
    for (const [R, yy] of [[R0, y0], [R0 + 0.004, y0 + th], [R1 - 0.004, y0 + th], [R1, y0]]) { pos.push(c * R, yy, cz + s * R); nrm.push(0, 1, 0); uv.push(a * R, R); }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < 3; k++) {
    const a = i * 4 + k, b = a + 1, c = a + 4, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure it faces up
  const n = g.attributes.normal; let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) { const ix = g.index; for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); } g.computeVertexNormals(); }
  return g;
}

/** Baseball cap: six-panel crown dome + curved brim + top button. Brim points +z. */
export function capGeo() {
  const crown = lathe([[0.0, 0.098], [0.02, 0.097], [0.045, 0.09], [0.07, 0.072], [0.088, 0.045], [0.097, 0.018], [0.1, 0.0], [0.096, 0.0]], 18);
  crown.scale(1, 1, 1.12); crown.computeVertexNormals();
  // brim: a curved elliptical plate with a real thickness (separate top / bottom sheets)
  const seg = 10, rows = 4, pos = [], idx = [], uv = [];
  for (const [dy, flip] of [[0, false], [-0.004, true]]) {
    const base = pos.length / 3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
      const a = Math.PI * (i / seg), t = j / rows;
      const R = 0.098 + t * 0.075;
      const x = Math.cos(a) * (0.098 * (1 - t) + 0.085 * t) * (1 - 0.15 * t), z = Math.sin(a) * R * 1.05;
      const y = 0.006 - t * t * 0.02 - Math.pow(Math.cos(a), 2) * t * 0.012 + dy;
      pos.push(x, y, z); uv.push(x, z);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, e = c + 1;
      if (flip) idx.push(a, b, c, b, e, c); else idx.push(a, c, b, b, c, e);
    }
  }
  const brim = new THREE.BufferGeometry();
  brim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  brim.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  brim.setIndex(idx); brim.computeVertexNormals();
  // top sheet must face up
  { const n = brim.attributes.normal; let up = 0; for (let i = 0; i < (rows + 1) * (seg + 1); i++) up += n.getY(i);
    if (up < 0) { const ix = brim.index; for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); } brim.computeVertexNormals(); } }
  const button = new THREE.SphereGeometry(0.008, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); button.translate(0, 0.096, 0);
  return mergeGeometries([crown, brim, stripUV(button)].map(g => keepPNU(g)), false);
}
/** Bucket hat: flat crown, tapered sides, down-sloping brim. */
export function bucketGeo() {
  const g = lathe([[0, 0.085], [0.072, 0.085], [0.082, 0.08], [0.09, 0.05], [0.096, 0.012], [0.104, 0.004], [0.145, -0.024], [0.158, -0.034], [0.156, -0.037], [0.1, -0.006], [0.09, 0.0]], 22);
  g.computeVertexNormals();
  return keepPNU(g);
}
function stripUV(g) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }
function keepPNU(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.index) { const n = g.attributes.position.count, a = []; for (let i = 0; i < n; i++) a.push(i); g.setIndex(a); }
  return g;
}

/** Hat box (round, with a lid overhang), unit radius/height → instance scale. */
export function hatBoxGeo() {
  const g = lathe([[0, 0], [0.97, 0], [0.97, 0.82], [0.985, 0.82], [1.0, 0.83], [1.0, 0.99], [0.985, 1.0], [0, 1.0]], 22);
  g.computeVertexNormals();
  return keepPNU(g);
}
