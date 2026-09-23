// apparelDisplay — the two window displays (z ≈ 9.2–10.8): floating travertine podiums with a brass
// nosing and a warm LED wash, a brass halo hoop framing the left pair, gilded pampas in a travertine urn
// on the right, and a small printed IMAANS card (the clothes promo line from ctx.brand.promos).
import * as THREE from 'three';
import { lathe, rbox, cyl, tube, mat4, DEG } from './util.js';
import { stripGeo } from './plinth.js';

export const PODIUMS = [
  { x0: -7.35, x1: -2.55, z0: 9.28, z1: 10.82 },
  { x0: 2.55, x1: 7.35, z0: 9.28, z1: 10.82 },
];
export const PODIUM_H = 0.22;

export function buildWindows(ctx, { staticBatch, shadows, signs }) {
  const H = PODIUM_H;
  for (const p of PODIUMS) {
    const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    staticBatch.add('travertine', rbox(w, 0.05, d, 0.008), { matrix: mat4([cx, H - 0.025, cz]) });
    staticBatch.add('travertine', rbox(w - 0.1, H - 0.05, d - 0.08, 0.004), { matrix: mat4([cx, (H - 0.05) / 2, cz + 0.02]) });
    // brass nosing along the store-facing edge + short returns
    staticBatch.add('brass', rbox(w + 0.004, 0.014, 0.016, 0.004), { matrix: mat4([cx, H - 0.006, p.z0 - 0.002]) });
    // LED under the lip, washing the floor toward the store
    staticBatch.add('led', rbox(w - 0.14, 0.005, 0.01, 0.002), { matrix: mat4([cx, H - 0.058, p.z0 + 0.05]) });
    const glow = stripGeo(w - 0.1, 0.55); glow.rotateY(Math.PI);
    staticBatch.add('glow', glow, { matrix: mat4([cx, 0.004, p.z0 + 0.04 - 0.275 + 0.0]) });
    shadows.add(cx, 0.003, cz, w + 0.3, d + 0.35, 0.45);
    ctx.colliders.addBox(cx, cz, w + 0.04, d + 0.04);
  }
  // --- left window: brass halo hoop behind the pair (frames them from the street)
  const hoopR = 0.96, hx = -5.07, hz = 10.6, hy = H + 0.05 + hoopR;
  const hoop = new THREE.TorusGeometry(hoopR, 0.016, 10, 120);
  { const uv = hoop.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.1, uv.getX(i) * 2 * Math.PI * hoopR); }
  staticBatch.add('brass', hoop, { matrix: mat4([hx, hy, hz]) });
  staticBatch.add('travertine', rbox(0.28, 0.06, 0.16, 0.01), { matrix: mat4([hx, H + 0.03, hz]) });
  shadows.add(hx, H + 0.002, hz, 0.42, 0.26, 0.5);
  // small card on the left podium
  const cardM = mat4([-3.25, H, 9.62], [0, Math.PI + 22 * DEG, 0]);   // faces the store
  const card = signs.plane('window', 0.26, 0.108); card.translate(0, 0.054, 0); card.applyMatrix4(new THREE.Matrix4().makeRotationX(-24 * DEG)); card.translate(0, 0.006, 0);
  staticBatch.add('signs', card, { matrix: cardM });
  const cb = signs.plane('ivory', 0.26, 0.108); cb.rotateY(Math.PI); cb.translate(0, 0.054, -0.002); cb.applyMatrix4(new THREE.Matrix4().makeRotationX(-24 * DEG)); cb.translate(0, 0.006, 0);
  staticBatch.add('signs', cb, { matrix: cardM });
  staticBatch.add('brass', rbox(0.22, 0.012, 0.06, 0.003), { matrix: mat4([-3.25, H + 0.006, 9.62], [0, Math.PI + 22 * DEG, 0]) });
  shadows.add(-3.25, H + 0.002, 9.62, 0.32, 0.14, 0.45, 22 * DEG);

  // --- right window: travertine urn with gilded pampas plumes
  const ux = 3.08, uz = 10.4;
  const urn = lathe([[0, 0], [0.12, 0], [0.16, 0.05], [0.2, 0.2], [0.19, 0.36], [0.15, 0.46], [0.12, 0.5], [0.135, 0.52], [0.11, 0.525], [0.1, 0.44], [0, 0.44]], 40);
  urn.computeVertexNormals();
  staticBatch.add('travertine', urn, { matrix: mat4([ux, H, uz]) });
  shadows.add(ux, H + 0.002, uz, 0.6, 0.6, 0.55);
  const rng = ctx.kit.rng(71);
  const plume = lathe([[0, 0], [0.02, 0.03], [0.042, 0.12], [0.046, 0.2], [0.038, 0.28], [0.02, 0.34], [0, 0.37]], 10);
  plume.computeVertexNormals();
  for (let i = 0; i < 13; i++) {
    const a = rng() * Math.PI * 2, lean = 0.12 + rng() * 0.38, len = 0.9 + rng() * 0.75;
    const base = [ux + Math.cos(a) * 0.04, H + 0.46, uz + Math.sin(a) * 0.04];
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    const mid = new THREE.Vector3(...base).addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, 0.02, 0));
    const tip = new THREE.Vector3(...base).addScaledVector(dir, len).addScaledVector(new THREE.Vector3(dir.x, -0.15, dir.z), 0.12 * lean);
    staticBatch.add('brass', tube([base, mid.toArray(), tip.toArray()], 0.0035, 5, 8));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(mid).normalize());
    const s = 0.8 + rng() * 0.45;
    staticBatch.add('plume', plume, { matrix: new THREE.Matrix4().compose(tip.clone().addScaledVector(tip.clone().sub(mid).normalize(), -0.05), q, new THREE.Vector3(s, s, s)),
      color: new THREE.Color().setHSL(0.09 + rng() * 0.02, 0.35, 0.72 + rng() * 0.08) });
  }
  const W = ctx.layout.DEPARTMENTS && ctx.layout.DEPARTMENTS.windows;
  ctx.hotspots.add({ id: 'windows', label: (W && W.name) || 'Windows', pos: [-1.35, 1.62, 7.55], look: [-4.9, 1.15, 10.1], order: 5 });
}
