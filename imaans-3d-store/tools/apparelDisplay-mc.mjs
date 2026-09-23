// apparelDisplay — sparse marching cubes + mesh post-processing for the offline mannequin bake.
// Owner: apparelDisplay. Used by tools/apparelDisplay-bake.mjs (Node only).
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { MeshoptSimplifier } from 'meshoptimizer';

// cube corners (Bourke order) and edge → (corner a, corner b)
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGE = [[0, 1], [1, 2], [3, 2], [0, 3], [4, 5], [5, 6], [7, 6], [4, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Extract the zero set of sdf inside [bmin, bmax] at voxel size h. Sparse: a coarse grid (4h) finds the
 * narrow band, only band points are evaluated exactly. Returns { positions:Float32Array, indices:Uint32Array }.
 */
export function extract(sdf, bmin, bmax, h) {
  const C = 4, H = C * h;
  const cn = [0, 1, 2].map(a => Math.ceil((bmax[a] - bmin[a]) / H) + 1);
  const n = cn.map(c => (c - 1) * C + 1);
  const [nx, ny, nz] = n, N = nx * ny * nz;
  const F = new Float32Array(N), done = new Uint8Array(N);
  const [cx, cy, cz] = cn;
  const Cv = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const v = sdf(bmin[0] + i * H, bmin[1] + j * H, bmin[2] + k * H);
    Cv[i + cx * (j + cy * k)] = v;
    const fi = i * C + nx * (j * C + ny * k * C); F[fi] = v; done[fi] = 1;
  }
  const thr = H * 1.95;
  const near = [];
  for (let k = 0; k < cz - 1; k++) for (let j = 0; j < cy - 1; j++) for (let i = 0; i < cx - 1; i++) {
    let mn = Infinity;
    for (let c = 0; c < 8; c++) { const q = CORNER[c]; const v = Math.abs(Cv[(i + q[0]) + cx * ((j + q[1]) + cy * (k + q[2]))]); if (v < mn) mn = v; }
    if (mn < thr) near.push(i, j, k);
  }
  let evals = 0;
  for (let t = 0; t < near.length; t += 3) {
    const i0 = near[t] * C, j0 = near[t + 1] * C, k0 = near[t + 2] * C;
    for (let k = k0; k <= k0 + C; k++) for (let j = j0; j <= j0 + C; j++) for (let i = i0; i <= i0 + C; i++) {
      const fi = i + nx * (j + ny * k);
      if (done[fi]) continue;
      F[fi] = sdf(bmin[0] + i * h, bmin[1] + j * h, bmin[2] + k * h); done[fi] = 1; evals++;
    }
  }
  // marching cubes over the band cells
  const vmap = new Map();
  const pos = [], idx = [];
  const cornerVal = new Float64Array(8), cornerIdx = new Int32Array(8);
  const edgeVert = new Int32Array(12);
  for (let t = 0; t < near.length; t += 3) {
    const i0 = near[t] * C, j0 = near[t + 1] * C, k0 = near[t + 2] * C;
    for (let k = k0; k < k0 + C; k++) for (let j = j0; j < j0 + C; j++) for (let i = i0; i < i0 + C; i++) {
      let cube = 0;
      for (let c = 0; c < 8; c++) {
        const q = CORNER[c]; const fi = (i + q[0]) + nx * ((j + q[1]) + ny * (k + q[2]));
        cornerIdx[c] = fi; cornerVal[c] = F[fi];
        if (F[fi] < 0) cube |= 1 << c;
      }
      const em = edgeTable[cube];
      if (!em) continue;
      for (let e = 0; e < 12; e++) {
        if (!(em & (1 << e))) continue;
        const [a, b] = EDGE[e];
        const ia = cornerIdx[a], ib = cornerIdx[b];
        const lo = ia < ib ? ia : ib, axis = Math.abs(ib - ia) === 1 ? 0 : Math.abs(ib - ia) === nx ? 1 : 2;
        const key = lo * 3 + axis;
        let vi = vmap.get(key);
        if (vi === undefined) {
          const va = cornerVal[a], vb = cornerVal[b];
          const tt = va / (va - vb);
          const qa = CORNER[a], qb = CORNER[b];
          pos.push(bmin[0] + (i + qa[0] + (qb[0] - qa[0]) * tt) * h, bmin[1] + (j + qa[1] + (qb[1] - qa[1]) * tt) * h, bmin[2] + (k + qa[2] + (qb[2] - qa[2]) * tt) * h);
          vi = pos.length / 3 - 1; vmap.set(key, vi);
        }
        edgeVert[e] = vi;
      }
      const base = cube * 16;
      for (let q = 0; triTable[base + q] !== -1; q += 3) {
        const a = edgeVert[triTable[base + q]], b = edgeVert[triTable[base + q + 1]], c = edgeVert[triTable[base + q + 2]];
        if (a !== b && b !== c && a !== c) idx.push(a, b, c);
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), evals, cells: near.length / 3 };
}

/** Central-difference gradient (normalised) of sdf at p → out[3]. */
export function gradient(sdf, x, y, z, e, out) {
  const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  out[0] = gx / l; out[1] = gy / l; out[2] = gz / l; return l / (2 * e);
}

/** Project every vertex onto the surface (one Newton step) and compute SDF normals. */
export function refine(mesh, sdf, h) {
  const p = mesh.positions, nrm = new Float32Array(p.length), g = [0, 0, 0];
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i], y = p[i + 1], z = p[i + 2];
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      const gl = gradient(sdf, x, y, z, h * 0.3, g);
      const step = clampAbs(d / (gl || 1), h * 0.8);
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    gradient(sdf, x, y, z, h * 0.35, g);
    p[i] = x; p[i + 1] = y; p[i + 2] = z;
    nrm[i] = g[0]; nrm[i + 1] = g[1]; nrm[i + 2] = g[2];
  }
  mesh.normals = nrm;
  // winding: make face normals agree with the SDF gradient
  const ix = mesh.indices; let agree = 0;
  for (let t = 0; t < ix.length; t += 3 * 17) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    agree += fx * nrm[a] + fy * nrm[a + 1] + fz * nrm[a + 2] > 0 ? 1 : -1;
  }
  if (agree < 0) for (let t = 0; t < ix.length; t += 3) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
  return mesh;
}
const clampAbs = (v, m) => (v > m ? m : v < -m ? -m : v);

/** Drop triangles whose three vertices are all inside `hidden(x,y,z) < -margin`. */
export function cull(mesh, hidden, margin) {
  const p = mesh.positions, ix = mesh.indices;
  const inside = new Uint8Array(p.length / 3);
  for (let i = 0; i < inside.length; i++) inside[i] = hidden(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) < -margin ? 1 : 0;
  const out = [];
  for (let t = 0; t < ix.length; t += 3) if (!(inside[ix[t]] && inside[ix[t + 1]] && inside[ix[t + 2]])) out.push(ix[t], ix[t + 1], ix[t + 2]);
  mesh.indices = new Uint32Array(out);
  return mesh;
}

/** Remove unreferenced vertices (keeps any per-vertex arrays listed in `attrs` in sync). */
export function compact(mesh, attrs = ['positions', 'normals']) {
  const nV = mesh.positions.length / 3, remap = new Int32Array(nV).fill(-1);
  let n = 0;
  for (const i of mesh.indices) if (remap[i] < 0) remap[i] = n++;
  for (const a of attrs) {
    const src = mesh[a]; if (!src) continue;
    const w = src.length / nV, dst = new Float32Array(n * w);
    for (let i = 0; i < nV; i++) if (remap[i] >= 0) for (let c = 0; c < w; c++) dst[remap[i] * w + c] = src[i * w + c];
    mesh[a] = dst;
  }
  mesh.indices = mesh.indices.map(i => remap[i]);
  return mesh;
}

/** meshoptimizer simplification to ≤ targetTris (stops earlier at the absolute error). */
export async function simplify(mesh, targetTris, error) {
  await MeshoptSimplifier.ready;
  if (mesh.indices.length / 3 <= targetTris) return mesh;
  const attrs = new Float32Array(mesh.normals);
  const [ix] = MeshoptSimplifier.simplifyWithAttributes(mesh.indices, mesh.positions, 3, attrs, 3, [0.25, 0.25, 0.25], null, targetTris * 3, error, ['ErrorAbsolute']);
  mesh.indices = ix;
  return compact(mesh);
}
