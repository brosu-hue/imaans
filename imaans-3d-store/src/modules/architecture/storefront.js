// Storefront (z = +4.4): black-metal piers at x ±1.00 / ±2.40, a black head from 2.6 to 3.0 m, two 1.30 m
// glass windows with a transom bar at 1.84 m, and the 1.90 m double glass door whose leaves stand open
// outward (so the walk from the pavement goes straight in). Outside: the black fascia (2.6 … 4.3 m) that
// carries the lit IMAANS logo (signage.js). The street + our building's facade live in exterior.js.
import * as THREE from 'three';
import { mat4 } from './util.js';
import { ZONES } from '../../core/layout.js';

const SF = ZONES.storefront, EN = ZONES.entrance, FA = ZONES.signage.fascia;
const Z = SF.z, T = 0.12;                       // glass plane + frame depth (z 4.34 … 4.46)
export const LEAF = { w: EN.leaves[0][1] - EN.leaves[0][0], h: EN.h, open: EN.openDeg * Math.PI / 180, t: 0.05 };

/** The two open leaves: hinge [x, z], local +x runs from the hinge to the free edge (s = ±1), yaw. */
export function leafPoses() {
  return [-1, 1].map(side => {
    const hx = side < 0 ? EN.x[0] : EN.x[1], s = -side;           // left leaf extends toward +x when closed
    const yaw = -s * LEAF.open;                                     // swing the free edge out to +z
    return { hx, hz: Z + 0.03, s, yaw };
  });
}

export function buildStorefront(ctx, batch) {
  const { kit } = ctx;
  const steel = (w, h, d, x, y, z, r = 0.004) => batch.add('steel', new kit.RoundedBoxGeometry(w, h, d, 1, r), mat4([x, y, z]));
  const pane = (x0, x1, y0, y1, z = Z) => batch.add('glass', new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateY(Math.PI), mat4([(x0 + x1) / 2, (y0 + y1) / 2, z]));
  const [hy0, hy1] = SF.head;
  // piers + head
  for (const x of SF.piers) steel(SF.pierW, hy0, T, x, hy0 / 2, Z);
  steel(SF.x[1] - SF.x[0], hy1 - hy0, T, 0, (hy0 + hy1) / 2, Z, 0.002);
  // windows: sill, transom bar, glass above and below it
  for (const [x0, x1] of SF.windows) {
    steel(x1 - x0, 0.05, T * 0.8, (x0 + x1) / 2, 0.025, Z);
    steel(x1 - x0, 0.05, 0.06, (x0 + x1) / 2, SF.transomY, Z);
    pane(x0, x1, 0.05, SF.transomY - 0.025);
    pane(x0, x1, SF.transomY + 0.025, hy0);
  }
  // door: head bar at the leaf height, glass transom light above it, threshold
  steel(EN.w, 0.05, T * 0.8, 0, EN.h + 0.025, Z);
  pane(EN.x[0], EN.x[1], EN.h + 0.05, hy0);
  steel(EN.w, 0.012, 0.16, 0, 0.006, Z, 0.002);

  // open door leaves: black frame, glass infill, a tall vertical bar handle on both faces near the free edge
  const q = new THREE.Matrix4();
  for (const L of leafPoses()) {
    const base = mat4([L.hx, 0, L.hz], [0, L.yaw, 0]);
    const put = (key, geo, x, y, z) => { q.copy(base).multiply(mat4([L.s * x, y, z])); batch.add(key, geo, q); };
    const y0 = 0.012, h = LEAF.h - y0, w = LEAF.w;
    put('steel', new kit.RoundedBoxGeometry(0.05, h, LEAF.t, 1, 0.006), 0.025, y0 + h / 2, 0);
    put('steel', new kit.RoundedBoxGeometry(0.05, h, LEAF.t, 1, 0.006), w - 0.025, y0 + h / 2, 0);
    put('steel', new kit.RoundedBoxGeometry(w - 0.1, 0.05, LEAF.t, 1, 0.006), w / 2, y0 + h - 0.025, 0);
    put('steel', new kit.RoundedBoxGeometry(w - 0.1, 0.1, LEAF.t, 1, 0.006), w / 2, y0 + 0.05, 0);
    put('glass', new THREE.PlaneGeometry(w - 0.1, h - 0.15), w / 2, y0 + 0.1 + (h - 0.15) / 2, 0);
    for (const f of [-1, 1]) {
      put('steel', new THREE.CylinderGeometry(0.014, 0.014, 1.2, 14), w - 0.13, 1.1, f * 0.07);
      for (const py of [0.6, 1.6]) put('steel', new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10).rotateX(Math.PI / 2), w - 0.13, py, f * 0.045);
    }
  }

  // fascia board outside (matte black), a thin black-metal cap on top
  const fw = FA.x[1] - FA.x[0], fh = FA.y[1] - FA.y[0];
  batch.add('darkFree', new kit.RoundedBoxGeometry(fw, fh, 0.12, 2, 0.01), mat4([(FA.x[0] + FA.x[1]) / 2, FA.y[0] + fh / 2, Z + 0.12]));
  steel(fw + 0.02, 0.03, 0.15, (FA.x[0] + FA.x[1]) / 2, FA.y[1] + 0.015, Z + 0.12);
}

/** Floor-standing colliders owned by architecture: the two open door leaves. */
export function storefrontColliders(ctx) {
  for (const L of leafPoses()) {
    const c = Math.cos(L.yaw), s = Math.sin(L.yaw), half = LEAF.w / 2;
    // local +x (times L.s) → world (cos yaw, -sin yaw)
    const cx = L.hx + L.s * half * c, cz = L.hz - L.s * half * s;
    ctx.colliders.addBox(cx, cz, LEAF.w + 0.02, LEAF.t + 0.03, L.yaw);
  }
}

export { buildExterior } from './exterior.js';
