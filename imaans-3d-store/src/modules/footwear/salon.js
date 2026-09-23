// footwear — the shoe salon in front of the wall: a tiered pale-stone stage (like the campaign's plinths)
// with gold edges and a glowing shadow-gap ring, acrylic risers, tufted cognac-leather try-on benches on
// brass legs, a fitting stool, an angled floor mirror, a long brass shoe horn, and the IMAANS rug (greige
// field, charcoal border, gold line + crowns).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat4, rbox, uvBox, cyl } from './util.js';
import { rampUV, stdMat, addMat } from './progs.js';
import { drawCrown } from '../../core/catalog.js';

export const STAGE = { cx: 0, cz: -8.2, tiers: [[1.0, 0.15], [0.7, 0.29], [0.4, 0.43]], base: 0.012, gap: 0.03 };
export const RUG = { cx: 0, cz: -8.4, w: 8.6, d: 3.2, h: 0.012 };
export const BENCHES = [{ cx: -3.1, cz: -8.4 }, { cx: 3.1, cz: -8.4 }];
export const BENCH = { w: 1.7, d: 0.5, seat: 0.46 };
// LED intensities for the shared glow ramp (× warm white; > 1 blooms)
export const LED = 1.7, RIM = 0.8;   // the ring is a soft warm-white line, not an orange neon

/** Lathe with a rounded top edge: drum of radius R from y0 to y1, edge radius e. */
function drum(R, y0, y1, e = 0.012, seg = 72) {
  const pts = [[0.0001, y1]];
  for (let k = 0; k <= 5; k++) { const a = (k / 5) * Math.PI / 2; pts.push([R - e + Math.sin(a) * e, y1 - e + Math.cos(a) * e]); }
  pts.push([R, y0]);
  pts.push([0.0001, y0]);
  return pts.reverse();          // LatheGeometry faces outward when the profile runs bottom → top
}

/** Stone tops get planar metre UVs (lathe UVs would draw tree rings); sides keep the banded wrap. */
function planarTops(g, i) {
  const n = g.attributes.normal, p = g.attributes.position, uv = g.attributes.uv;
  // (LatheGeometry leaves the last profile vertex's normal unnormalised — normalise before testing)
  for (let k = 0; k < uv.count; k++) {
    const ny = n.getY(k) / (Math.hypot(n.getX(k), n.getY(k), n.getZ(k)) || 1);
    if (ny > 0.8) uv.setXY(k, p.getX(k) + i * 0.37, p.getZ(k) + i * 0.61);
  }
  g.normalizeNormals();
  return g;
}

export function buildStage(ctx, batch, kit) {
  const { cx, cz, tiers, base, gap } = STAGE;
  // shadow-gap plinth (recessed) — holds the LED ring
  batch.add('cubby', kit.lathe([[0.0001, base], [0.93, base], [0.93, base + gap], [0.0001, base + gap]], 72), mat4([cx, 0, cz]));
  let y0 = base + gap;
  tiers.forEach(([R, top], i) => {
    const e = 0.014, yb = i === 0 ? y0 : tiers[i - 1][1] - 0.002;
    // travertine drum (side + rounded edge) and a terrazzo top disc set flush inside the edge
    const side = [[R, yb], [R, top - e]];
    for (let k = 1; k <= 5; k++) { const a = (k / 5) * Math.PI / 2; side.push([R - e + Math.cos(a) * e, top - e + Math.sin(a) * e]); }
    batch.add('stone', kit.lathe(side, 72), mat4([cx, 0, cz]));
    batch.add('stoneTop', planarTops(kit.lathe([[R - e + 0.0005, top], [0.0001, top]], 72), i), mat4([cx, 0, cz]));
    // brass cap band on the top edge
    batch.add('brass', kit.lathe([[R + 0.0025, top - 0.016], [R + 0.0025, top - 0.004], [R - 0.002, top + 0.0015], [R - 0.012, top + 0.0015]], 72), mat4([cx, 0, cz]));
  });
  // LED ring in the shadow gap (bloom) + halo decal on the rug (separate additive mesh, see stageHalo)
  const ring = rampUV(new THREE.TorusGeometry(0.955, 0.0055, 6, 96).rotateX(Math.PI / 2), LED);
  batch.add('glow', ring, mat4([cx, base + gap * 0.5, cz]));

  // acrylic risers for the hero sneakers
  const risers = [
    { x: 0, z: 0, base: tiers[2][1], h: 0.18, r: 0.105 },
    { x: -0.6, z: 0.5, base: tiers[0][1], h: 0.16, r: 0.095 },
    { x: 0.6, z: 0.5, base: tiers[0][1], h: 0.16, r: 0.095 },
  ];
  for (const r of risers) {
    const e = 0.008;
    const pts = [[0.0001, r.h]];
    for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; pts.push([r.r - e + Math.sin(a) * e, r.h - e + Math.cos(a) * e]); }
    for (let k = 0; k <= 4; k++) { const a = Math.PI / 2 + (k / 4) * Math.PI / 2; pts.push([r.r - e + Math.sin(a) * e, e + Math.cos(a) * e]); }
    pts.push([0.0001, 0]);
    pts.reverse();
    batch.add('acrylic', kit.lathe(pts, 40), mat4([cx + r.x, r.base + 0.001, cz + r.z]));
    // polished acrylic edges catch the light: faint lit rims top and bottom
    const rim = rampUV(new THREE.TorusGeometry(r.r - 0.004, 0.0016, 3, 40).rotateX(Math.PI / 2), RIM);
    batch.add('glow', rim, mat4([cx + r.x, r.base + 0.001 + r.h - 0.0035, cz + r.z]));
    batch.add('glow', rim, mat4([cx + r.x, r.base + 0.001 + 0.0035, cz + r.z]));
    r.top = r.base + 0.001 + r.h; r.wx = cx + r.x; r.wz = cz + r.z;
  }
  return { risers };
}

/** Soft additive glow on the rug around the stage's shadow gap. */
export function stageHalo(kit) {
  const tex = kit.canvasTexture(256, 256, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.62, 'rgba(0,0,0,0)');
    grd.addColorStop(0.685, 'rgba(255,240,222,0.85)'); grd.addColorStop(0.73, 'rgba(255,234,212,0.3)');
    grd.addColorStop(0.84, 'rgba(255,228,204,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  // additive, map only: the shared unlit-transparent program (same as the contact shadows)
  tex.colorSpace = THREE.NoColorSpace;
  const m = addMat('halo', tex, { color: new THREE.Color('#fff1e0').multiplyScalar(0.2), additive: true });
  const geo = new THREE.PlaneGeometry(2.8, 2.8).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(STAGE.cx, RUG.h + 0.002, STAGE.cz); mesh.renderOrder = 2; mesh.raycast = () => {};
  return mesh;
}

// ------------------------------------------------------------------------------------------------
// Benches
// ------------------------------------------------------------------------------------------------
/** Tufted cushion: rounded box with clustered edge loops, a slight crown and diamond-set button dimples. */
function tuftedCushion(w, h, d, r, buttons) {
  let g = new THREE.BoxGeometry(1, 1, 1, 30, 3, 10);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const p = g.attributes.position;
  const f = (c) => Math.sign(c) * 0.5 * (1 - Math.pow(1 - 2 * Math.abs(c), 1.9));
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(f(p.getX(i)) * w, f(p.getY(i)) * h, f(p.getZ(i)) * d);
    q.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
    const o = v.clone().sub(q);
    if (o.lengthSq() > 1e-12) v.copy(q).addScaledVector(o.normalize(), r);
    // crown + dimples on the top
    if (v.y > h / 2 - r * 0.6) {
      const ex = Math.min(1, (w / 2 - Math.abs(v.x)) / 0.12), ez = Math.min(1, (d / 2 - Math.abs(v.z)) / 0.1);
      let dy = 0.009 * ex * ez;
      for (const [bx, bz] of buttons) { const dd = (v.x - bx) ** 2 + (v.z - bz) ** 2; dy -= 0.017 * Math.exp(-dd / (2 * 0.028 * 0.028)); }
      v.y += dy;
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return uvBox(g);
}

export function buildBenches(ctx, batch) {
  const { w, d, seat } = BENCH;
  const cushH = 0.13, apronTop = seat - cushH, legH = apronTop - 0.055 - RUG.h;
  const buttons = [];
  for (let k = 0; k < 6; k++) buttons.push([-0.62 + k * 0.248, -0.1]);
  for (let k = 0; k < 5; k++) buttons.push([-0.496 + k * 0.248, 0.1]);
  const cushion = tuftedCushion(w, cushH, d, 0.045, buttons);
  const button = new THREE.SphereGeometry(0.011, 8, 4);
  const apron = rbox(w - 0.04, 0.055, d - 0.04, 0.008, 2);
  const leg = cyl(0.017, 0.011, legH, 16);
  const foot = cyl(0.0125, 0.0125, 0.018, 16);
  for (const b of BENCHES) {
    batch.add('leather', cushion, mat4([b.cx, seat - cushH / 2, b.cz]));
    for (const [bx, bz] of buttons) batch.add('leather', button, mat4([b.cx + bx, seat - 0.017 + 0.0035, b.cz + bz], [0, 0, 0], [1, 0.7, 1]));
    batch.add('lacquer', apron, mat4([b.cx, apronTop - 0.0275, b.cz]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = b.cx + sx * (w / 2 - 0.09), lz = b.cz + sz * (d / 2 - 0.075);
      batch.add('brass', leg, mat4([lx, RUG.h + legH / 2, lz]));
      batch.add('brass', foot, mat4([lx, RUG.h + 0.009, lz]));
    }
  }
}

/** Shoe-fitting stool: oak body with a sloped, leather-padded top. */
export function buildStool(ctx, batch, pos, yaw) {
  const w = 0.36, dpt = 0.3, hF = 0.17, hB = 0.31;
  const s = new THREE.Shape();
  s.moveTo(-dpt / 2, 0); s.lineTo(dpt / 2, 0); s.lineTo(dpt / 2, hF); s.lineTo(-dpt / 2, hB); s.lineTo(-dpt / 2, 0);
  const body = new THREE.ExtrudeGeometry(s, { depth: w - 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
  body.translate(0, 0, -(w - 0.012) / 2); body.rotateY(Math.PI / 2);
  uvBox(body);
  const m = mat4([pos[0], RUG.h, pos[2]], [0, yaw, 0]);
  batch.add('oakH', body, m);
  const slope = Math.atan2(hB - hF, dpt);
  const pad = rbox(w + 0.004, 0.028, Math.hypot(dpt, hB - hF) + 0.004, 0.012, 3);
  // the body's low front ends up at local -z (shape x → -z after rotateY): the pad tilts the same way
  const pm = m.clone().multiply(mat4([0, (hF + hB) / 2 + 0.016, 0], [-slope, 0, 0]));
  batch.add('leather', pad, pm);
  // brass kick plate
  batch.add('brass', rbox(w - 0.02, 0.05, 0.004, 0.0015, 1), m.clone().multiply(mat4([0, 0.035, dpt / 2 + 0.0045])));
}

/** Low angled floor mirror in a brass frame on a rear strut. */
export function buildMirror(ctx, batch, pos, yaw) {
  const W = 0.54, H = 0.74, tilt = 0.24, fr = 0.036;
  const m = mat4([pos[0], RUG.h, pos[2]], [0, yaw, 0]);
  const face = m.clone().multiply(mat4([0, 0.02, 0], [-tilt, 0, 0])).multiply(mat4([0, H / 2, 0]));
  batch.add('mirror', new THREE.PlaneGeometry(W - 2 * fr + 0.004, H - 2 * fr + 0.004), face.clone().multiply(mat4([0, 0, 0.004])));
  batch.add('lacquer', rbox(W - 0.01, H - 0.01, 0.012, 0.004, 1), face.clone().multiply(mat4([0, 0, -0.004])));
  // brass frame: four rounded bars
  const barH = rbox(W, fr, 0.022, 0.008, 2), barV = rbox(fr, H - 2 * fr, 0.022, 0.008, 2);
  for (const sy of [-1, 1]) batch.add('brass', barH, face.clone().multiply(mat4([0, sy * (H - fr) / 2, 0.004])));
  for (const sx of [-1, 1]) batch.add('brass', barV, face.clone().multiply(mat4([sx * (W - fr) / 2, 0, 0.004])));
  // rear strut + floor feet
  // rear strut: from the frame's upper back (y≈0.55) down to the floor ~0.3 m behind
  const top = [0, 0.55, -0.55 * Math.tan(tilt) - 0.012], foot = [0, 0.0, top[2] - 0.31];
  const len = Math.hypot(top[1] - foot[1], top[2] - foot[2]);
  batch.add('brass', cyl(0.008, 0.008, len, 10), m.clone().multiply(mat4([0, (top[1] + foot[1]) / 2, (top[2] + foot[2]) / 2], [Math.atan2(top[2] - foot[2], top[1] - foot[1]), 0, 0])));
  batch.add('brass', rbox(W * 0.9, 0.014, 0.05, 0.005, 1), m.clone().multiply(mat4([0, 0.007, 0.02])));
  return { face };
}

/** Long brass shoe horn: curved spoon + slim handle + ball end. Local x = along. */
export function shoeHornGeometry() {
  const parts = [];
  const L = 0.13, R = 0.024, nU = 12, nV = 10;
  const blade = (off, flip) => {
    const pos = [], idx = [];
    for (let i = 0; i <= nU; i++) for (let j = 0; j <= nV; j++) {
      const u = i / nU, th = (-1 + 2 * j / nV) * 1.15, wu = 1 - 0.38 * u;
      pos.push(u * L, (1 - Math.cos(th)) * R * 0.8 * wu + off, Math.sin(th) * R * wu);
    }
    for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
      const a = i * (nV + 1) + j, b = a + nV + 1;
      if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return uvBox(g);
  };
  parts.push(blade(0, false), blade(0.0016, true));
  const handle = cyl(0.0055, 0.0065, 0.36, 10).rotateZ(Math.PI / 2); handle.translate(L + 0.18, 0.012, 0);
  const ball = new THREE.SphereGeometry(0.012, 12, 8); ball.translate(L + 0.37, 0.012, 0);
  parts.push(handle, ball);
  return parts;
}

// ------------------------------------------------------------------------------------------------
// Rug (low-pile wool) — greige field with a tone-on-tone trellis, charcoal border band, a fine gold line and
// small gold crowns in the corners. Shared std program: design on uv, tuft normal on uv (own repeat),
// architecture's baked floor light on uv1 (same mapping as its floor) when available.
// ------------------------------------------------------------------------------------------------
export function buildRug(ctx) {
  const { kit, mats, scene } = ctx;
  const { w, d, h } = RUG;
  const tex = kit.canvasTexture(1024, 384, (g, W, H) => {
    const px = W / w;                                   // pixels per metre
    g.fillStyle = '#c4b8a6'; g.fillRect(0, 0, W, H);
    const r = kit.rng(77);
    // soft mottling (wool lots) + faint pile direction streaks
    for (let i = 0; i < 520; i++) {
      const x = r() * W, y = r() * H, rr = 8 + r() * 36;
      const grd = g.createRadialGradient(x, y, 0, x, y, rr);
      const a = 0.035 + r() * 0.04, light = r() < 0.5;
      grd.addColorStop(0, light ? `rgba(245,238,226,${a})` : `rgba(110,96,80,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    g.globalAlpha = 0.05; g.fillStyle = '#5d5044';
    for (let i = 0; i < 260; i++) g.fillRect(r() * W, r() * H, 1, 6 + r() * 20);
    g.globalAlpha = 1;
    // tone-on-tone trellis in the field (carved-pile look)
    g.save();
    const inset = 0.36 * px; g.beginPath(); g.rect(inset, inset, W - 2 * inset, H - 2 * inset); g.clip();
    const pitch = 0.7 * px;
    g.lineWidth = 0.035 * px; g.strokeStyle = 'rgba(236,228,214,0.06)';
    for (let k = -20; k < 40; k++) {
      g.beginPath(); g.moveTo(k * pitch, 0); g.lineTo(k * pitch + H, H); g.stroke();
      g.beginPath(); g.moveTo(k * pitch, H); g.lineTo(k * pitch + H, 0); g.stroke();
    }
    g.restore();
    // border: charcoal band + a fine gold line inside it, set in from the edge
    const band = (inset, width, col) => { g.strokeStyle = col; g.lineWidth = width * px; const o = (inset + width / 2) * px; g.strokeRect(o, o, W - 2 * o, H - 2 * o); };
    band(0.0, 0.05, '#b7aa96');
    band(0.12, 0.13, '#2b2826');
    band(0.285, 0.014, '#b08d57');
    band(0.32, 0.006, '#3a3531');
    // corner crowns (gold)
    for (const [cx, cy] of [[0.5, 0.5], [w - 0.5, 0.5], [0.5, d - 0.5], [w - 0.5, d - 0.5]]) drawCrown(g, cx * px, cy * px, 0.13 * px, '#a98752');
  });
  tex.anisotropy = ctx.q.anisotropy;
  const nset = mats.textures('rug') || {};
  // architecture's baked floor light (pools under the track heads) — same uv1 mapping as its floor
  let floor = null;
  scene.traverse(o => { if (!floor && o.isMesh && o.name === 'arch:floor') floor = o; });
  const lm = floor && floor.material && floor.material.lightMap;
  // uv in metres: the painted design repeats once over the rug, the library tuft normal keeps its own tile
  tex.repeat.set(1 / w, 1 / d); tex.offset.set(0, 0);
  const mat = stdMat(ctx, 'rug', null, { map: tex, normalMap: nset.normalMap || null, normalScale: 0.9, roughness: 1, color: '#ffffff',
    lightMap: lm ? { tex: lm, k: floor.material.lightMapIntensity * 0.8 } : null });
  // geometry: top plane + bevelled edge band. uv = rug-normalised, uv1 = the floor's light-map mapping
  const top = new THREE.PlaneGeometry(w - 0.02, d - 0.02, 8, 4).rotateX(-Math.PI / 2);
  top.translate(RUG.cx, h, RUG.cz);
  const edge = rbox(w, h, d, 0.005, 2); edge.translate(RUG.cx, h / 2 - 0.0008, RUG.cz);
  const ni = (g) => (g.index ? g.toNonIndexed() : g);
  const geo = kit.mergeGeometries([ni(top), ni(edge)]);
  const P = geo.attributes.position, n = P.count;
  const uv0 = new Float32Array(n * 2), uv1 = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), z = P.getZ(i);
    uv0[i * 2] = Math.min(w, Math.max(0, x - RUG.cx + w / 2)); uv0[i * 2 + 1] = Math.min(d, Math.max(0, d - (z - RUG.cz + d / 2)));
    uv1[i * 2] = (x + 8) / 16; uv1[i * 2 + 1] = (z + 11) / 22;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv0, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'footwear:rug'; mesh.receiveShadow = true;
  return mesh;
}
