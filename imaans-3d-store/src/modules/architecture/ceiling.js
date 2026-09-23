// Ceiling fixtures: black track runs + spot heads (emissive lenses), recessed downlights,
// pendant globe clusters over the tables, the glowing cove above the plinth.
import * as THREE from 'three';
import { mat4 } from './util.js';
import { flipFaces } from './shell.js';
import { H, COVE, TRACK_Y, TRACKS, HEADS, DOWNLIGHTS, GLOBES } from './plan.js';

const UP = new THREE.Vector3(0, 1, 0);
const WARM = new THREE.Color(1.0, 0.83, 0.64);

export function buildCeilingFixtures(ctx, batch) {
  const { kit } = ctx;
  // ---- tracks ----
  for (const [x0, z0, x1, z1] of TRACKS) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    const m = mat4([(x0 + x1) / 2, H - 0.016, (z0 + z1) / 2], [0, ang, 0]);
    batch.add('steel', new kit.RoundedBoxGeometry(0.036, 0.032, len, 1, 0.004), m);
    // end caps + a live-end feed canopy
    for (const t of [0, 1]) {
      const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
      batch.add('steel', new kit.RoundedBoxGeometry(0.042, 0.036, 0.03, 1, 0.005), mat4([cx, H - 0.018, cz], [0, ang, 0]));
    }
    batch.add('steel', new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), mat4([x0 + (x1 - x0) * 0.02, H - 0.006, z0 + (z1 - z0) * 0.02]));
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
  const trackAng = (x, z) => { for (const [x0, z0, x1, z1] of TRACKS) { if (Math.abs(x0 - x1) < 1e-3 && Math.abs(x - x0) < 1e-3) return 0; if (Math.abs(z0 - z1) < 1e-3 && Math.abs(z - z0) < 1e-3) return Math.PI / 2; } return 0; };
  for (const [x, z, tx, ty, tz] of HEADS) {
    const ang = trackAng(x, z);
    batch.add('steel', adapter, mat4([x, TRACK_Y - 0.015, z], [0, ang, 0]));
    const pivot = new THREE.Vector3(x, TRACK_Y - 0.115, z);
    batch.add('steel', stem, mat4([x, TRACK_Y - 0.07, z]));
    batch.add('steel', knuckle, mat4(pivot.toArray()));
    d.set(tx, ty, tz).sub(pivot).normalize();
    q.setFromUnitVectors(UP, d);
    const place = (geo, off, key, extra) => {
      v.copy(pivot).addScaledVector(d, off);
      const m = new THREE.Matrix4().compose(v, q, new THREE.Vector3(1, 1, 1));
      if (extra) m.multiply(extra);
      batch.add(key, geo, m, key === 'glow' ? { color: WARM.clone().multiplyScalar(7) } : {});
    };
    place(body, 0.035, 'steel');
    place(fins, -0.02, 'steel');
    place(fins, 0.0, 'steel');
    place(bezel, 0.12, 'steel');
    place(lens, 0.118, 'glow', new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  }

  // ---- recessed downlights ----
  for (const [x, z] of DOWNLIGHTS) {
    batch.add('ceiling', new THREE.CylinderGeometry(0.078, 0.078, 0.01, 28), mat4([x, H - 0.005, z]));
    batch.add('steel', new THREE.RingGeometry(0.05, 0.066, 28).rotateX(Math.PI / 2), mat4([x, H - 0.0104, z]));
    batch.add('glow', new THREE.CircleGeometry(0.05, 24).rotateX(Math.PI / 2), mat4([x, H - 0.0108, z]), { color: WARM.clone().multiplyScalar(5) });
  }

  // ---- linear slot diffusers along the side walls + smoke detectors (quiet realism) ----
  for (const sx of [-7.3, 7.3]) for (const [z0, z1] of [[-9.6, -6.0], [-3.2, 0.4], [2.6, 6.2]]) {
    const L = z1 - z0, cz = (z0 + z1) / 2;
    batch.add('ceiling', new kit.RoundedBoxGeometry(0.085, 0.012, L + 0.05, 1, 0.004), mat4([sx, H - 0.006, cz]));
    for (const off of [-0.017, 0.017]) batch.add('steel', new THREE.PlaneGeometry(0.02, L).rotateX(Math.PI / 2), mat4([sx + off, H - 0.0125, cz]));
  }
  const det = kit.lathe([[0.055, 0], [0.058, 0.004], [0.058, 0.024], [0.05, 0.034], [0, 0.036]], 20);
  for (const [dx, dz] of [[-4.1, 3.2], [4.1, 3.2], [-4.1, -5.2], [4.1, -5.2], [0, -8.8], [0, 9.4]]) batch.add('ceiling', det, mat4([dx, H, dz], [Math.PI, 0, 0]));
  // ---- pendant globes (opal glass, brass fittings) ----
  const cap = kit.lathe([[0.043, 0], [0.042, 0.004], [0.03, 0.022], [0.016, 0.04], [0.014, 0.052], [0.0, 0.052]], 24);
  const canopy = kit.lathe([[0, 0], [0.058, 0], [0.064, 0.006], [0.064, 0.026], [0.05, 0.03], [0, 0.03]], 28);
  const unitSphere = new THREE.SphereGeometry(1, 26, 16);
  for (const [x, y, z, r] of GLOBES) {
    const top = y + r * 0.96;
    batch.add('brass', canopy, mat4([x, H - 0.03, z]));
    const cl = H - 0.03 - (top + 0.05);
    batch.add('steel', new THREE.CylinderGeometry(0.0022, 0.0022, cl, 5, 1, true), mat4([x, top + 0.05 + cl / 2, z]));
    batch.add('brass', cap, mat4([x, top - 0.004, z]));
    batch.add('glow', unitSphere, mat4([x, y, z], [0, 0, 0], r), {
      color: (px, py) => { const t = (py - (y - r)) / (2 * r); const k = 1.2 - 0.72 * t; return [WARM.r * k, WARM.g * k, WARM.b * k]; },
    });
  }

  // ---- cove above the plinth ----
  const rr = COVE.rRecess, domeH = 0.34;
  // recess wall (inside the ring, lit by the hidden LED on the ledge) + dome
  const wall = flipFaces(new THREE.CylinderGeometry(rr, rr, 0.28, 96, 4, true)).translate(COVE.x, H + 0.14, COVE.z);
  batch.add('glow', wall, null, { color: (px, py) => { const t = (py - H) / 0.28; const k = 2.3 - 1.1 * t; return [WARM.r * k, WARM.g * k, WARM.b * k]; } });
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([rr * Math.cos(t * Math.PI / 2) ** 0.8 * (1 - t * 0.0), H + 0.28 + domeH * Math.sin(t * Math.PI / 2)]); }
  pts[pts.length - 1][0] = 0;
  const dome = kit.lathe(pts, 96); // lathe normals face outward → flip to face down/in
  batch.add('glow', flipFaces(dome), mat4([COVE.x, 0, COVE.z]), {
    color: (px, py, pz) => { const r = Math.hypot(px - COVE.x, pz - COVE.z) / rr; const k = 0.42 + 1.05 * r * r * r; return [WARM.r * k, WARM.g * k, WARM.b * k]; },
  });
  // top of the lip (ledge, hides the LED), then the visible luminous LED line on the ceiling plane
  batch.add('glow', new THREE.RingGeometry(COVE.rLed[0], COVE.rLed[1], 160).rotateX(Math.PI / 2), mat4([COVE.x, H - 0.0035, COVE.z]), { color: WARM.clone().multiplyScalar(6) });
}
