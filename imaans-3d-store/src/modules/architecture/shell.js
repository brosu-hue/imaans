// Shell of the real shop: light polished marble floor, warm-ivory wall panels (1.2 m wide, two rows split at
// 0.64 of the height, fine shadow-gap joints) on a 0.10 m black-metal skirting, the flat 3.0 m ceiling with
// the bulkhead (2.66 m over the first 1.5 m inside the glass), and the dark fluted partition at the back
// with its closed staff door.
import * as THREE from 'three';
import { mat4, profileRun } from './util.js';
import { H, X0, X1, Z0, Z1, BULK, PANEL_W, PANEL_SPLIT, SKIRT_H, DOOR } from './plan.js';

const DEG = Math.PI / 180;
const GROOVE = 0.008;       // panel joint width (m)

export function buildShell(ctx, batch) {
  const { kit } = ctx;
  // ---------------- floor (shop floor + the threshold strip under the door) ----------------
  batch.add('marble', new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2), null, { worldUV: true });

  // ---------------- side walls: ivory panels + joints + skirting ----------------
  for (const side of [-1, 1]) {
    const x = side < 0 ? X0 : X1, rot = side < 0 ? 90 * DEG : -90 * DEG, n = side < 0 ? 1 : -1;
    batch.add('walls', new THREE.PlaneGeometry(Z1 - Z0, H).rotateY(rot).translate(x, H / 2, (Z0 + Z1) / 2), null, { worldUV: true });
    // vertical joints every 1.2 m from the partition, one horizontal joint at 0.64 H
    for (let z = Z0 + PANEL_W; z < Z1 - 0.1; z += PANEL_W) {
      batch.add('groove', new THREE.PlaneGeometry(GROOVE, H - SKIRT_H).rotateY(rot).translate(x + n * 0.0012, SKIRT_H + (H - SKIRT_H) / 2, z), null, { worldUV: true });
    }
    batch.add('groove', new THREE.PlaneGeometry(Z1 - Z0, GROOVE).rotateY(rot).translate(x + n * 0.0012, PANEL_SPLIT, (Z0 + Z1) / 2), null, { worldUV: true });
    // 0.10 m black metal skirting, 12 mm proud
    batch.add('steel', new kit.RoundedBoxGeometry(0.012, SKIRT_H, Z1 - Z0 - 0.01, 1, 0.002), mat4([x + n * 0.006, SKIRT_H / 2, (Z0 + Z1) / 2]));
  }

  // ---------------- ceiling + bulkhead ----------------
  batch.add('ceiling', new THREE.PlaneGeometry(X1 - X0, BULK.z0 - Z0).rotateX(Math.PI / 2).translate(0, H, (Z0 + BULK.z0) / 2), null, { worldUV: true });
  batch.add('ceiling', new THREE.PlaneGeometry(X1 - X0, Z1 - BULK.z0).rotateX(Math.PI / 2).translate(0, BULK.y, (BULK.z0 + Z1) / 2), null, { worldUV: true });
  batch.add('ceiling', new THREE.PlaneGeometry(X1 - X0, H - BULK.y).rotateY(Math.PI).translate(0, (H + BULK.y) / 2, BULK.z0), null, { worldUV: true }); // bulkhead face (toward -z)
  // a crisp shadow-gap where the bulkhead face meets the flat ceiling
  batch.add('groove', new THREE.PlaneGeometry(X1 - X0, 0.012).rotateY(Math.PI).translate(0, H - 0.006, BULK.z0 - 0.001), null, { worldUV: true });

  // ---------------- partition: dark vertical flutes, closed staff door ----------------
  const FL = 0.05, DEPTH = 0.016;
  const flutes = (x0, x1, y0, y1) => {
    // one profile across the run (a row of half-round flutes), swept straight up
    const n = Math.max(1, Math.round((x1 - x0) / FL)), w = (x1 - x0) / n, prof = [[0, 0]];
    for (let i = 0; i < n; i++) {
      const a = i * w;
      for (let k = 0; k <= 6; k++) { const t = k / 6; prof.push([DEPTH * Math.sin(Math.PI * t) ** 0.7, a + w * (0.04 + 0.92 * t)]); }
      prof.push([0, a + w]);
    }
    // profile d = out along +z, h = along +x; sweep upward from y0
    batch.add('flutes', profileRun(prof, y1 - y0, [x0, y0, Z0 - DEPTH], [0, 1, 0], [0, 0, 1], [1, 0, 0], false), null, { worldUV: true });
  };
  flutes(X0, DOOR.x[0] - 0.05, 0, H);
  flutes(DOOR.x[1] + 0.05, X1, 0, H);
  flutes(DOOR.x[0] - 0.05, DOOR.x[1] + 0.05, DOOR.h + 0.05, H);
  // backing plane behind the flutes (seen through the gaps at grazing angles)
  batch.add('flutes', new THREE.PlaneGeometry(X1 - X0, H).translate(0, H / 2, Z0 - DEPTH), null, { worldUV: true });
  // staff door: black-metal frame, flush dark lacquer leaf, black pull handle
  const cx = DOOR.cx, dw = DOOR.w, dh = DOOR.h;
  const cas = [[0, 0], [0.02, 0], [0.02, 0.05], [0, 0.05]];
  batch.add('steel', profileRun(cas, dw + 0.1, [DOOR.x[0] - 0.05, dh, Z0 - DEPTH], [1, 0, 0], [0, 0, 1], [0, 1, 0]), null, { worldUV: true });
  batch.add('steel', profileRun(cas, dh, [DOOR.x[0], 0, Z0 - DEPTH], [0, 1, 0], [0, 0, 1], [-1, 0, 0]), null, { worldUV: true });
  batch.add('steel', profileRun(cas, dh, [DOOR.x[1], 0, Z0 - DEPTH], [0, 1, 0], [0, 0, 1], [1, 0, 0]), null, { worldUV: true });
  batch.add('door', new kit.RoundedBoxGeometry(dw - 0.006, dh - 0.006, 0.04, 2, 0.005), mat4([cx, dh / 2, Z0 - DEPTH - 0.012]), { worldUV: true });
  batch.add('steel', new kit.RoundedBoxGeometry(0.022, 0.6, 0.022, 1, 0.008), mat4([DOOR.x[1] - 0.1, 1.05, Z0 - DEPTH + 0.045]));
  for (const y of [0.8, 1.3]) batch.add('steel', new THREE.CylinderGeometry(0.007, 0.007, 0.045, 10).rotateX(90 * DEG), mat4([DOOR.x[1] - 0.1, y, Z0 - DEPTH + 0.022]));
  return { door: DOOR };
}
