// apparelDisplay — hero plinth (0, -2) r 1.5 h 0.3: honed travertine drum, brushed-brass top band,
// recessed toe-kick with a warm LED line washing the floor, and the season's easel sign (IMAANS black +
// gold: crown, "THE SPRING EDIT" — the promo from ctx.brand.promos) in a brass frame.
import * as THREE from 'three';
import { lathe, rbox, cyl, mat4, DEG } from './util.js';

export const PLINTH = { x: 0, z: -2, r: 1.5, h: 0.3 };

/** Flat annulus in the xz plane with u = radial parameter (0 inner → 1 outer), v = angle. */
export function ringGeo(r0, r1, seg = 96) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1); uv.push(0, i / seg, 1, i / seg);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** Floor glow strip (x across, z outward from the edge), u = 0 at the edge → 1 away. */
export function stripGeo(len, depth) {
  const g = new THREE.PlaneGeometry(len, depth, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; // after rotation: v=1 at -z… remap: u = distance from the edge (z = -depth/2)
  const p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getZ(i) + depth / 2) / depth, 0.5);
  return g;
}

export function buildPlinth(ctx, { staticBatch, shadows, signs }) {
  const { x, z, r, h } = PLINTH;
  const at = (dx, dy, dz) => [x + dx, dy, z + dz];
  // drum side (lathe): top edge → side → toe-kick recess
  const R = r - 0.04;
  const side = lathe([[R - 0.01, h - 0.001], [R, h - 0.004], [R + 0.004, h - 0.012], [R + 0.004, 0.082], [R - 0.006, 0.075], [R - 0.055, 0.074], [R - 0.055, 0.0]], 120);
  side.computeVertexNormals();
  staticBatch.add('travertine', side, { matrix: mat4(at(0, 0, 0)) });
  // top slab: planar metre UVs so the travertine bands run straight across
  const top = new THREE.CircleGeometry(R - 0.005, 120); top.rotateX(-Math.PI / 2);
  { const p = top.attributes.position, uv = top.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i)); }
  staticBatch.add('travertine', top, { matrix: mat4(at(0, h, 0)) });
  // brass band capping the top edge (4.2 cm)
  const band = lathe([[R - 0.002, h + 0.0015], [R + 0.01, h + 0.0015], [R + 0.013, h - 0.002], [R + 0.013, h - 0.04], [R + 0.01, h - 0.043], [R + 0.004, h - 0.043]], 120);
  band.computeVertexNormals();
  staticBatch.add('brass', band, { matrix: mat4(at(0, 0, 0)) });
  // LED line under the lip + its wash on the floor
  staticBatch.add('led', cyl(R - 0.012, R - 0.012, 0.006, 120, true), { matrix: mat4(at(0, 0.069, 0)) });
  staticBatch.add('glow', ringGeo(R - 0.05, R + 0.42, 120), { matrix: mat4(at(0, 0.004, 0)) });
  shadows.add(x, 0.003, z, (r + 0.25) * 2, (r + 0.25) * 2, 0.35);
  // the season's easel sign on the plinth front edge
  const sx = 0.02, sz = 1.02, yaw = 0 * DEG, tilt = -12 * DEG;
  const cw = 0.3, ch = 0.4, bx = x + sx, bz = z + sz, by = h;
  const cardM = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(tilt));
  const place = (g, lx, ly, lz) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(lx, ly, lz)).applyMatrix4(cardM).applyMatrix4(new THREE.Matrix4().makeTranslation(bx, by, bz));
  const cy = 0.035 + ch / 2;
  staticBatch.add('signs', place(signs.plane('season', cw, ch), 0, cy, 0.0045));
  const back = signs.plane('black', cw, ch); back.rotateY(Math.PI);
  staticBatch.add('signs', place(back, 0, cy, -0.0015));
  // brass frame + easel leg + foot
  for (const [w2, h2, dx, dy] of [[cw + 0.016, 0.008, 0, ch / 2 + 0.004], [cw + 0.016, 0.008, 0, -ch / 2 - 0.004], [0.008, ch + 0.016, cw / 2 + 0.004, 0], [0.008, ch + 0.016, -cw / 2 - 0.004, 0]])
    staticBatch.add('brass', place(rbox(w2, h2, 0.01, 0.0025), dx, cy + dy, 0.001));
  const leg = cyl(0.004, 0.004, ch * 0.95, 8, true);
  leg.applyMatrix4(new THREE.Matrix4().makeRotationX(30 * DEG));
  staticBatch.add('brass', place(leg, 0, cy - 0.02, -0.085));
  staticBatch.add('brass', rbox(cw * 0.9, 0.01, 0.05, 0.003), { matrix: mat4([bx, by + 0.005, bz + 0.018], [0, yaw, 0]) });
  shadows.add(bx, by + 0.002, bz - 0.05, cw * 1.4, 0.26, 0.4, yaw);
  ctx.colliders.addCircle(x, z, r + 0.02);
  ctx.hotspots.add({ id: 'new-collection', label: (signs.copy && signs.copy.season && signs.copy.season.title) || 'New in', pos: [1.75, 1.62, 1.35], look: [0, 1.1, -2.15], order: 15 });
}
