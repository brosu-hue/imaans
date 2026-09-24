// Ceiling + floor light fixtures: the 2 black tracks with spot heads (emissive lenses), recessed downlights
// (centre row + bulkhead), the light panel over the glass island, the 3 pendant globes over the counter,
// the warm LED cove slots along both side walls and the partition, and the floor uplight strip.
import * as THREE from 'three';
import { mat4 } from './util.js';
import { H, TRACK_Y, TRACKS, HEADS, DOWNLIGHTS, LIGHT_PANEL, PENDANTS, COVES, UPLIGHT } from './plan.js';

const UP = new THREE.Vector3(0, 1, 0);
const WARM = new THREE.Color(1.0, 0.83, 0.64);
const warm = (k) => WARM.clone().multiplyScalar(k);

export function buildCeilingFixtures(ctx, batch) {
  const { kit } = ctx;
  // ---- tracks ----
  for (const [x0, z0, x1, z1] of TRACKS) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    batch.add('steel', new kit.RoundedBoxGeometry(0.036, 0.032, len, 1, 0.004), mat4([(x0 + x1) / 2, H - 0.016, (z0 + z1) / 2], [0, ang, 0]));
    for (const t of [0, 1]) batch.add('steel', new kit.RoundedBoxGeometry(0.042, 0.036, 0.03, 1, 0.005), mat4([x0 + (x1 - x0) * t, H - 0.018, z0 + (z1 - z0) * t], [0, ang, 0]));
  }

  // ---- spot heads ----
  const adapter = new kit.RoundedBoxGeometry(0.044, 0.03, 0.095, 1, 0.006);
  const stem = new THREE.CylinderGeometry(0.0075, 0.0075, 0.09, 8, 1, true);
  const knuckle = new THREE.SphereGeometry(0.016, 10, 6);
  const body = new THREE.CylinderGeometry(0.043, 0.04, 0.155, 18, 1, false);
  const fins = new THREE.CylinderGeometry(0.047, 0.047, 0.012, 18, 1, false);
  const bezel = new THREE.CylinderGeometry(0.047, 0.045, 0.02, 18, 1, true);
  const lens = new THREE.CircleGeometry(0.033, 18);
  const q = new THREE.Quaternion(), d = new THREE.Vector3(), v = new THREE.Vector3();
  for (const [x, z, tx, ty, tz] of HEADS) {
    batch.add('steel', adapter, mat4([x, TRACK_Y - 0.015, z]));
    const pivot = new THREE.Vector3(x, TRACK_Y - 0.115, z);
    batch.add('steel', stem, mat4([x, TRACK_Y - 0.07, z]));
    batch.add('steel', knuckle, mat4(pivot.toArray()));
    d.set(tx, ty, tz).sub(pivot).normalize();
    q.setFromUnitVectors(UP, d);
    const place = (geo, off, key, extra) => {
      v.copy(pivot).addScaledVector(d, off);
      const m = new THREE.Matrix4().compose(v, q, new THREE.Vector3(1, 1, 1));
      if (extra) m.multiply(extra);
      batch.add(key, geo, m, key === 'glow' ? { color: warm(7) } : {});
    };
    place(body, 0.035, 'steel'); place(fins, -0.02, 'steel'); place(fins, 0.0, 'steel'); place(bezel, 0.12, 'steel');
    place(lens, 0.118, 'glow', new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  }

  // ---- recessed downlights (black trim ring, warm lens) ----
  for (const [x, z, y] of DOWNLIGHTS) {
    batch.add('steel', new THREE.RingGeometry(0.045, 0.062, 28).rotateX(Math.PI / 2), mat4([x, y - 0.0015, z]));
    batch.add('glow', new THREE.CircleGeometry(0.045, 24).rotateX(Math.PI / 2), mat4([x, y - 0.002, z]), { color: warm(5) });
  }

  // ---- light panel over the glass island: black frame + diffuser ----
  {
    const P = LIGHT_PANEL, w = P.x1 - P.x0, dd = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
    batch.add('glow', new THREE.PlaneGeometry(w - 0.05, dd - 0.05).rotateX(Math.PI / 2), mat4([cx, H - 0.031, cz]), { color: warm(3.2) });
    for (const [bw, bd, ox, oz] of [[w, 0.025, 0, -(dd / 2 - 0.0125)], [w, 0.025, 0, dd / 2 - 0.0125], [0.025, dd, -(w / 2 - 0.0125), 0], [0.025, dd, w / 2 - 0.0125, 0]]) {
      batch.add('steel', new kit.RoundedBoxGeometry(bw, 0.03, bd, 1, 0.003), mat4([cx + ox, H - 0.015, cz + oz]));
    }
  }

  // ---- pendant globes over the counter (opal glass, brass cap + canopy) ----
  const cap = kit.lathe([[0.034, 0], [0.033, 0.004], [0.024, 0.018], [0.013, 0.032], [0.011, 0.042], [0.0, 0.042]], 20);
  const canopy = kit.lathe([[0, 0], [0.05, 0], [0.055, 0.005], [0.055, 0.022], [0.043, 0.026], [0, 0.026]], 24);
  const unitSphere = new THREE.SphereGeometry(1, 22, 14);
  for (const [x, y, z, r, cy] of PENDANTS) {
    const top = y + r * 0.96;
    batch.add('brass', canopy, mat4([x, cy - 0.026, z]));
    const cl = cy - 0.026 - (top + 0.04);
    batch.add('steel', new THREE.CylinderGeometry(0.0022, 0.0022, cl, 5, 1, true), mat4([x, top + 0.04 + cl / 2, z]));
    batch.add('brass', cap, mat4([x, top - 0.004, z]));
    batch.add('glow', unitSphere, mat4([x, y, z], [0, 0, 0], r), {
      color: (px, py) => { const t = (py - (y - r)) / (2 * r); const k = 1.25 - 0.7 * t; return [WARM.r * k, WARM.g * k, WARM.b * k]; },
    });
  }

  // ---- LED coves: a narrow lit slot in the ceiling along the walls + the partition ----
  for (const [x0, z0, x1, z1] of COVES) {
    const len = Math.hypot(x1 - x0, z1 - z0), alongZ = Math.abs(z1 - z0) > Math.abs(x1 - x0);
    const g = alongZ ? new THREE.PlaneGeometry(0.05, len) : new THREE.PlaneGeometry(len, 0.05);
    batch.add('glow', g.rotateX(Math.PI / 2), mat4([(x0 + x1) / 2, H - 0.002, (z0 + z1) / 2]), { color: warm(4.2) });
  }

  // ---- floor uplight strip in front of the partition (black channel + lit lens) ----
  {
    const U = UPLIGHT, len = U.x1 - U.x0, cx = (U.x0 + U.x1) / 2;
    batch.add('steel', new kit.RoundedBoxGeometry(len + 0.03, 0.006, 0.05, 1, 0.002), mat4([cx, 0.003, U.z]));
    batch.add('glow', new THREE.PlaneGeometry(len, 0.02).rotateX(-Math.PI / 2), mat4([cx, 0.0065, U.z]), { color: warm(5.5) });
  }
}
