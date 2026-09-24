// fixtures — accessories on the clothing side of the shop:
//   accStep     display step 2 (ZONES.accStep, right wall, 0.70 × 0.70 × 0.75, faces −x): an ivory three-step
//               podium, two bags per step (6 slots, bags by preference).
//   accShelves  the three upper shelves of the folded unit (ZONES.accShelves = foldedShelves; the unit and the
//               folded clothes on shelves 0-1 are apparelDisplay's): five accessories per shelf (15 slots) at
//               ZONES.accShelves.shelfY. Shelf 4 has ≈ 0.16 m clear under the unit's top, so it only takes
//               low pieces (class 'top').
// Both only push slots (filled by fixtures.js → items.show) plus the podium's own geometry / collider / shadow.
import * as THREE from 'three';
import { M } from './util.js';

const mul = (a, b) => a.clone().multiply(b);

export function buildAccStep(F) {
  const { B, S, ctx } = F;
  const Z = ctx.layout.ZONES.accStep;
  const G = M([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  const n = Z.steps || 3, hw = Z.w / 2, hd = Z.d / 2, rise = Z.h / n, run = Z.d / n;
  // stepped profile in (z, y), extruded along the wall (local x); tread k (0 = lowest, at the front)
  const prof = [[-hd, 0], [hd, 0]];
  for (let k = 0; k < n; k++) { const z = hd - run * k; prof.push([z, rise * (k + 1)], [z - run, rise * (k + 1)]); }
  prof.pop(); prof.push([-hd, Z.h]);
  const sh = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
  const b = 0.004;
  const g = new THREE.ExtrudeGeometry(sh, { depth: Z.w - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 1 });
  g.rotateY(Math.PI / 2); g.translate(-hw + b, 0, 0);   // (−z, y, e) → (e, y, z)
  B.add('satin', g, G, F.ivory);
  S.add(Z.cx - 0.03, 0, Z.cz, Z.d + 0.28, Z.w + 0.28, 0, 0.55);
  F.col.addBox(Z.cx, Z.cz, Z.w + 0.04, Z.d + 0.04, Z.yaw);
  // two bags per tread: [x along the wall, small turn]
  const plan = [
    [['weekend', -0.09, 0.05], ['pouch', 0.25, -0.2]],       // lowest tread (front)
    [['raffia', -0.16, 0.1], ['crossbody', 0.17, -0.12]],
    [['tote', -0.16, -0.1], ['backpack', 0.17, 0.14]],       // top tread (against the wall)
  ];
  plan.forEach((row, k) => row.forEach(([pref, x, a]) => {
    const zc = hd - run * (k + 0.5);
    F.slots.push({ zone: 'accStep', cls: 'bag', pref, m: mul(G, M([x, rise * (k + 1), zc], [0, a, 0])), yaw: Z.yaw + a });
  }));
}

export function buildAccShelves(F) {
  const { ctx } = F;
  const Z = ctx.layout.ZONES.accShelves;
  const G = M([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  const inner = Z.w - 0.06, pitch = inner / Z.perShelf;   // the unit's cheeks are 3 cm
  // per shelf (Z.shelves = [2, 3, 4], bottom → top): [preferred kind, scale, small turn]
  const rows = [
    [['scarf', 0.9, 0.08], ['pocket', 1, 0], ['scarf', 0.9, -0.06], ['gloves', 0.9, 0.1], ['beltWoven', 1, 0]],   // the two scarves apart
    [['beads', 1, 0.05], ['sunhat', 0.85, 0], ['sunglasses', 1, -0.15], ['bucket', 0.9, 0], ['layered', 1, -0.1]],
    [['beanie', 1, 0.1], ['socks', 1, -0.08], ['clutch', 0.78, 0.05], ['umbrella', 1, 0], ['beanie', 1, -0.12]],
  ];
  Z.shelfY.forEach((y, s) => rows[s].forEach(([pref, scale, a], i) => {
    const x = (i - (Z.perShelf - 1) / 2) * pitch;
    F.slots.push({ zone: 'accShelves', cls: s === Z.shelfY.length - 1 ? 'top' : 'shelf', pref, scale, m: mul(G, M([x, y, 0.02], [0, a, 0])), yaw: Z.yaw + a });
  }));
}
