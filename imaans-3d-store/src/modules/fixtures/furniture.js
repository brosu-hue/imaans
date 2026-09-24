// fixtures — the non-product pieces of the real shop floor:
//   bench            ZONES.bench (centre, 1.20 × 0.90 × 0.45): two black leather cushions on a low black base
//   mirror           ZONES.mirror (on the partition, 1.10 × 2.10, glass 0.25 … 2.35 m): box-projected reflection
//                    of architecture's environment capture (no extra scene render on any tier) + a warm LED halo
//                    (emissive outline on the glow batch + an additive wash on the flutes)
//   sculpturePlinth  ZONES.sculpturePlinth: travertine block, three small black / gold sculptures
//   plants           ZONES.plants: procedural planters here; the leaves (GLB foliage) are merged by glb.js
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, rbox, box, cyl, lathe, tube, uvBox } from './util.js';
import { COPY } from './copy.js';

const mul = (a, b) => a.clone().multiply(b);

/**
 * Upholstered cushion (w × h × d, origin at its bottom centre): a rounded block whose top is crowned and
 * button-tufted and whose sides belly out a little — the soft shape reads as leather, not as a box.
 * Built on a box grid packed toward the edges (for the roll), welded so the normals are smooth all round.
 */
function cushion(w, h, d, { r = 0.055, crown = 0.022, bulge = 0.012, dimple = 0.017 } = {}) {
  const a = w / 2, b = h / 2, c = d / 2, k = 3;
  // flat-part steps ≈ 4 cm, a multiple of 4 across (tufts at ±¼) and of 6 along (tufts at 0, ±⅓): the
  // buttons then sit exactly on grid vertices, so every dimple pinches the same way
  const n = (len, mult) => 2 * k + mult * Math.max(1, Math.round((len - 2 * r) / (0.04 * mult)));
  const N = [n(w, 4), n(h, 1), n(d, 6)], half = [a, b, c];
  const tufts = [];
  for (const tx of [-0.5, 0.5]) for (const tz of [-2 / 3, 0, 2 / 3]) tufts.push([tx * (a - r), tz * (c - r)]);
  const g = new THREE.BoxGeometry(1, 1, 1, N[0], N[1], N[2]);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const p = g.attributes.position, P = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  const axis = (u, i) => {   // uniform grid → k steps across each roll, the rest across the flat
    const s = Math.round((u + 0.5) * N[i]), m = N[i] - 2 * k, H = half[i];
    return s <= k ? -H + r * (s / k) : s >= N[i] - k ? H - r * ((N[i] - s) / k) : -H + r + (2 * H - 2 * r) * ((s - k) / m);
  };
  const lift = (x, z, up) => {
    let dy = crown * (1 - (x / a) ** 2) * (1 - (z / c) ** 2) * up;
    for (const [tx, tz] of tufts) dy -= dimple * up * Math.exp(-((x - tx) ** 2 + (z - tz) ** 2) / 0.0016);
    return dy;
  };
  for (let i = 0; i < p.count; i++) {
    P.set(axis(p.getX(i), 0), axis(p.getY(i), 1), axis(p.getZ(i), 2));
    C.set(Math.max(-a + r, Math.min(a - r, P.x)), Math.max(-b + r, Math.min(b - r, P.y)), Math.max(-c + r, Math.min(c - r, P.z)));
    D.subVectors(P, C); if (D.lengthSq() > 1e-12) D.setLength(r);
    P.addVectors(C, D);
    const fx = 1 - (P.x / a) ** 2, fz = 1 - (P.z / c) ** 2;
    const dy = lift(P.x, P.z, Math.max(0, (P.y - (b - r)) / r));
    const mid = Math.max(0, 1 - Math.abs(P.y) / b) ** 1.4;   // belly: most at half height, none at the rolls
    if (Math.abs(P.x) > a - r) P.x += Math.sign(P.x) * bulge * mid * Math.max(0, fz);
    if (Math.abs(P.z) > c - r) P.z += Math.sign(P.z) * bulge * mid * Math.max(0, fx);
    p.setXYZ(i, P.x, P.y + b + dy, P.z);
  }
  const m = mergeVertices(g, 1e-5);
  // drop the underside (it sits on the plinth, never seen)
  const idx = m.index.array, pos = m.attributes.position, keep = [];
  for (let t = 0; t < idx.length; t += 3) if (!(pos.getY(idx[t]) < 1e-4 && pos.getY(idx[t + 1]) < 1e-4 && pos.getY(idx[t + 2]) < 1e-4)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  m.setIndex(keep);
  m.computeVertexNormals();
  const out = uvBox(m.toNonIndexed());
  out.userData.buttons = tufts.map(([x, z]) => [x, h + lift(x, z, 1), z]);
  return out;
}

export function buildBench(F) {
  const { B, S, P, ctx } = F;
  const Z = ctx.layout.ZONES.bench;
  const G = M([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  // a low black plinth set 6 cm in (the cushions seem to float), two square-ish tufted cushions on it
  const base = 0.07, gap = 0.012, cw = (Z.w - gap) / 2, ch = Z.h - base;
  B.add('gloss', rbox(Z.w - 0.12, base, Z.d - 0.12, 0.006), mul(G, M([0, base / 2, 0])), F.ink);
  B.add('metal', rbox(Z.w - 0.118, 0.004, Z.d - 0.118, 0.0015), mul(G, M([0, base - 0.006, 0])), F.brass);   // reveal line
  const seat = cushion(cw, ch, Z.d);
  const btn = new THREE.SphereGeometry(0.0085, 8, 4); btn.scale(1, 0.45, 1);
  // piping: a welt along each cushion's top roll (a closed rounded-rectangle tube at the roll's 45° line)
  const pipe = (() => {
    const r = 0.055, ins = r * (1 - Math.SQRT1_2), a = cw / 2 - ins, b = Z.d / 2 - ins, rc = 0.04, pts = [];
    for (const [cx, cz, a0] of [[a - rc, b - rc, 0], [-(a - rc), b - rc, Math.PI / 2], [-(a - rc), -(b - rc), Math.PI], [a - rc, -(b - rc), Math.PI * 1.5]]) {
      for (let k = 0; k <= 4; k++) { const t = a0 + (k / 4) * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(t) * rc, 0, cz + Math.sin(t) * rc)); }
    }
    return { g: tube(pts, 0.0055, 56, 4, true), y: ch - ins };
  })();
  for (const s of [-1, 1]) {
    const cm = mul(G, M([s * (cw + gap) / 2, base, 0]));
    B.add('leather', seat, cm);
    B.add('leather', pipe.g, mul(cm, M([0, pipe.y, 0])));
    for (const [x, y, z] of seat.userData.buttons) B.add('leather', btn, mul(cm, M([x, y + 0.001, z])));
  }
  S.add(Z.cx, 0, Z.cz, Z.w + 0.3, Z.d + 0.3, Z.yaw, 0.55);
  F.col.addBox(Z.cx, Z.cz, Z.w + 0.04, Z.d + 0.04, Z.yaw);
  P.box([Z.cx, Z.h / 2, Z.cz], [Z.w, Z.h, Z.d], Z.yaw, { title: 'The bench', subtitle: COPY.bench, tag: ctx.brand.name });
}

/** Additive halo texture: bright at the mirror's edge, fading out over the flutes (built without read-back). */
function haloTexture(kit, iw, ih, ow, oh) {
  const W = 64, H = 128;
  return kit.canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H), d = img.data;
    const hx = iw / ow / 2, hy = ih / oh / 2;   // inner rect half-size in uv
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W - 0.5, v = (j + 0.5) / H - 0.5;
      const dx = Math.max(0, Math.abs(u) - hx) * ow, dy = Math.max(0, Math.abs(v) - hy) * oh;   // metres outside
      const dist = Math.hypot(dx, dy);
      const k = Math.exp(-dist / 0.07) * (1 - Math.min(1, dist / 0.2)) ** 1.5;
      const o = (j * W + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = Math.round(255 * k); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
}

export function buildMirror(F) {
  const { B, P, ctx, kit } = F;
  const Z = ctx.layout.ZONES.mirror, R = ctx.layout.ROOM;
  const zWall = R.partitionZ, gh = Z.glassH || 2.1, y0 = Z.bottom || 0.25, cy = y0 + gh / 2;
  // black backer (holds the LED strip), the glass 2 cm proud of the flutes, the LED line around its edge
  B.add('gloss', rbox(Z.w - 0.08, gh - 0.08, 0.02, 0.004), M([Z.cx, cy, zWall + 0.012]), F.ink);
  B.add('mirror', box(Z.w, gh, 0.006), M([Z.cx, cy, zWall + Z.d - 0.003]));
  const led = [2.3, 1.85, 1.3], t = 0.008, zl = zWall + 0.018;
  B.add('glow', box(Z.w + 2 * t, t, 0.004), M([Z.cx, y0 - t / 2, zl]), led);
  B.add('glow', box(Z.w + 2 * t, t, 0.004), M([Z.cx, y0 + gh + t / 2, zl]), led);
  for (const s of [-1, 1]) B.add('glow', box(t, gh, 0.004), M([Z.cx + s * (Z.w / 2 + t / 2), cy, zl]), led);
  // warm wash on the partition around it (additive, on the contact-shadow program shape: basic + map + transparent)
  const ow = Z.w + 0.5, oh = gh + 0.5;
  const mat = new THREE.MeshBasicMaterial({ map: haloTexture(kit, Z.w, gh, ow, oh), color: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(0.55),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.name = 'fixtures:halo';
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(ow, oh), mat);
  halo.position.set(Z.cx, cy, zWall + 0.004); halo.name = 'fixtures:mirrorHalo'; halo.renderOrder = 1;
  halo.raycast = () => {}; halo.updateMatrix(); halo.matrixAutoUpdate = false;
  F.root.add(halo);
  let k = 0;
  P.box([Z.cx, cy, zWall + 0.02], [Z.w, gh, 0.04], 0, {
    title: 'The mirror', subtitle: COPY.mirror, tag: ctx.brand.name,
    onTap: (hit) => {
      ctx.ui.toast(COPY.mirrorLines[k++ % COPY.mirrorLines.length]);
      if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: '#ffd58a', count: 24 });
      return false;
    },
  });
}

export function buildSculptures(F) {
  const { B, S, P, ctx } = F;
  const Z = ctx.layout.ZONES.sculpturePlinth;
  const G = M([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  const T = Z.h;
  B.add('gloss', rbox(Z.w - 0.04, 0.03, Z.d - 0.04, 0.004), mul(G, M([0, 0.015, 0])), F.ink);
  B.add('trav', rbox(Z.w, T - 0.025, Z.d, 0.006, 2), mul(G, M([0, 0.025 + (T - 0.025) / 2, 0])));
  // 1 · gold sphere on a black drum
  B.add('gloss', cyl(0.036, 0.04, 0.08, 20), mul(G, M([-0.22, T + 0.04, 0.01])), F.ink);
  B.add('metal', new THREE.SphereGeometry(0.062, 24, 16), mul(G, M([-0.22, T + 0.08 + 0.058, 0.01])), F.gold);
  // 2 · tall black ceramic vessel with a gold lip
  B.add('gloss', lathe([[0, 0], [0.05, 0], [0.07, 0.06], [0.074, 0.12], [0.055, 0.2], [0.03, 0.26], [0.034, 0.3], [0.028, 0.302], [0.02, 0.26], [0, 0.26]], 28), mul(G, M([0.01, T, -0.03])), F.ink);
  B.add('metal', cyl(0.034, 0.034, 0.006, 28, true), mul(G, M([0.01, T + 0.3, -0.03])), F.gold);
  // 3 · gold ring standing on a black block
  B.add('gloss', rbox(0.12, 0.03, 0.07, 0.004), mul(G, M([0.23, T + 0.015, 0.02])), F.ink);
  B.add('metal', new THREE.TorusGeometry(0.075, 0.013, 12, 40), mul(G, M([0.23, T + 0.03 + 0.086, 0.02], [0, 0.35, 0])), F.gold);
  S.add(Z.cx, 0, Z.cz, Z.w + 0.25, Z.d + 0.25, Z.yaw, 0.55);
  for (const x of [-0.22, 0.01, 0.23]) { const c = new THREE.Vector3(x, 0, 0).applyMatrix4(G); S.add(c.x, T, c.z, 0.16, 0.14, Z.yaw, 0.44); }
  F.col.addBox(Z.cx, Z.cz, Z.w + 0.04, Z.d + 0.04, Z.yaw);
  P.box([Z.cx, T / 2 + 0.1, Z.cz], [Z.w, T + 0.2, Z.d], Z.yaw, { title: 'Black & gold', subtitle: COPY.sculptures, tag: ctx.brand.name });
}

/**
 * Planters for ZONES.plants (tall right-back, small left-back) + the canopy plan glb.js fills with the GLB's
 * leaves. The tall plant stands at the measured corner of the folded unit (plan position, see PLANT_AT).
 */
// The measured tall-plant centre (1.92, −1.41) stands IN the folded unit's end (its face is x 2.005, from
// z −1.545) and right in front of the unit's first column of stacks and accessories; the drawing's (1.80, −1.52)
// hits the short rail's garments (x ≤ 1.75, z ≤ −1.50). So the pot goes into the free right-back corner — the
// pocket between the short rail's end, the right wall, the partition and the unit's end — centred, r 0.18.
function tallPlantAt(Z, R) {
  const x0 = Z.shortRail.x[1], z1 = Z.foldedShelves.z[0];
  return [(x0 + R.maxX) / 2, (R.minZ + z1) / 2];
}
export function buildPlants(F) {
  const { B, S, P, ctx } = F;
  F.canopies = [];
  for (const it of ctx.layout.ZONES.plants.items) {
    const tall = it.id === 'tall';
    const [x, z] = tall ? tallPlantAt(ctx.layout.ZONES, ctx.layout.ROOM) : [it.cx, it.cz];
    const r = Math.min(tall ? 0.18 : 0.17, it.r), ph = tall ? 0.46 : 0.6;
    const m = M([x, 0, z]);
    B.add('satin', lathe([[0, 0], [r * 0.78, 0], [r * 0.8, 0.012], [r * 0.97, ph - 0.03], [r, ph - 0.012], [r * 0.99, ph], [r * 0.92, ph], [r * 0.9, ph - 0.03], [0, ph - 0.03]], 28), m, F.blackMetal);
    B.add('satin', cyl(r * 0.9, r * 0.9, 0.004, 20), mul(m, M([0, ph - 0.035, 0])), '#2a211b');
    // slim stems from the soil up into the canopy (they also carry the eye across the gap the low tier's
    // missing leaf cluster leaves)
    const stems = tall ? [[0.02, 0.01, 2.05], [-0.05, 0.04, 1.75], [0.04, -0.05, 1.5]] : [[0.02, 0.01, 1.2], [-0.03, -0.02, 1.05]];
    for (const [dx, dz, top] of stems) {
      const pts = [new THREE.Vector3(dx * 0.3, ph - 0.03, dz * 0.3), new THREE.Vector3(dx, (ph + top) / 2, dz), new THREE.Vector3(dx * 1.8 - 0.04, top, dz * 1.8)];
      B.add('satin', tube(pts, tall ? 0.011 : 0.007, 10, 5), m, '#4a3b2c');
    }
    if (tall) {
      // clusters: [y of the GLB origin, scale, turn, dx, dz] — top of the last ≈ ZONES h (2.44 m)
      F.canopies.push({ x: x + 0.02, z: z + 0.04, sxz: 0.72, clusters: [[0.84, 1.0, 0.3, -0.03, -0.02], [1.22, 0.98, 2.4, 0.02, 0.03], [1.72, 0.85, 4.4, 0, 0]] });
    } else {
      F.canopies.push({ x, z, sxz: 0.85, clusters: [[ph - 0.26, 0.85, Math.PI, 0.02, 0], [it.h - 0.841 * 0.75, 0.75, 0.9, 0.03, 0.02]] });
    }
    // low tier: one leaf cluster fewer per plant (≈ 4.5k triangles each) — the top one always stays
    if (ctx.q.density < 0.8) { const c = F.canopies[F.canopies.length - 1]; c.clusters.splice(c.clusters.length - 2, 1); }
    S.add(x, 0, z, r * 3.2, r * 3.2, 0, 0.55);
    ctx.colliders.addCircle(x, z, r + 0.02);
    P.box([x, it.h / 2, z], [r * 2.6, it.h, r * 2.6], 0, {
      title: 'Our resident plant', subtitle: COPY.plant, tag: ctx.brand.name,
      onTap: (hit) => { ctx.ui.toast('The plant says hello'); if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: '#ffd58a', count: 16 }); return false; },
    });
  }
}
