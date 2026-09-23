// fixtures — fitting rooms: three black-oak cubicles (partitions to 2.4 m) with brass rails and pleated
// champagne-velvet curtains that open / close on tap, a halo-lit crown "FITTING ROOMS" sign on the black
// fascia; cubicle 2 stands open (mirror, stool, a catalogue dress on the hook). Outside: a tall arched cheval
// mirror + bouclé pouf. Back-right corner: grand arched floor mirror (the big plant is placed by glb.js).
import * as THREE from 'three';
import { M, rbox, box, cyl, lathe, tube, plane, archShape, uvXY, reededPanel, DEG, smooth, clamp, recolor } from './util.js';
import { productCard, swatch, lightest } from './products.js';
import { pickLike } from './accTable.js';
import { COPY } from './copy.js';

const XF = 5.8;          // curtain plane (front of the cubicles)
const ZS = [-7.6, -5.6, -3.6, -1.6];
const PART_H = 2.4, PART_T = 0.05;
const RAIL_X = 5.905, RAIL_Y = 2.2;
const HEM = 0.035;

/** Pleated two-sided curtain: positions for open fraction f (0 closed … 1 stacked toward zA). */
export class Curtain {
  constructor(zA, zB, material, { seed = 1, fullness = 1.9 } = {}) {
    this.zA = zA; this.zB = zB; this.len = zB - zA; this.fabric = this.len * fullness;
    this.n = Math.max(6, Math.round(this.len / 0.15));   // pleats
    this.k = 6;                                           // samples per pleat
    this.J = this.n * this.k;
    const ys = [RAIL_Y - 0.02, 2.1, 1.85, 1.5, 1.15, 0.85, 0.6, 0.4, 0.25, 0.14, 0.07, HEM];
    this.rowsY = ys; this.I = ys.length;
    this.seed = seed; this.f = 0;
    const cols = this.J + 1, n = cols * this.I;
    this.nv = n;
    const g = new THREE.BufferGeometry();
    // two layers (front face toward the shop, back face toward the cubicle) → FrontSide velvet, no
    // double-sided program variant
    this.pos = new Float32Array(n * 3 * 2);
    const uv = new Float32Array(n * 2 * 2);
    for (let L = 0; L < 2; L++) for (let i = 0; i < this.I; i++) for (let j = 0; j < cols; j++) {
      const k = L * n + i * cols + j; uv[k * 2] = (j / this.J) * this.fabric; uv[k * 2 + 1] = ys[i];
    }
    const idx = [];
    for (let L = 0; L < 2; L++) for (let i = 0; i < this.I - 1; i++) for (let j = 0; j < this.J; j++) {
      const a = L * n + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (L === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.set(0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = 'fixtures:curtain'; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
  }
  set(f) {
    this.f = f;
    const cols = this.J + 1, z0 = this.zA, z1 = this.zA + this.len * (1 - 0.8 * f);
    const L = z1 - z0, lam = L / this.n, P = this.fabric / this.n;
    const A0 = Math.min(P / 4, (lam / Math.PI) * Math.sqrt(Math.max(0, P / lam - 1)));
    const r = mulberry(this.seed);
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    const n = this.nv;
    for (let i = 0; i < this.I; i++) {
      const y = this.rowsY[i];
      const hem = smooth(0.6, 0.0, y);
      const head = smooth(2.02, RAIL_Y - 0.02, y);
      for (let j = 0; j < cols; j++) {
        const s = j / this.J;
        // hand-hung pleats: spacing drifts by up to ±30 % of a pleat and depth varies (a uniform sine read as
        // corrugated sheet); the drift fades toward the pinch-pleated heading, where the tape keeps them even
        const warp = (0.3 / this.n) * (0.35 + 0.65 * (1 - head)) * Math.sin(s * 13.1 + ph[1]);
        const wave = Math.sin(2 * Math.PI * this.n * (s + warp));
        const irregular = 1 + 0.26 * Math.sin(s * 17.3 + ph[0]) + 0.14 * Math.sin(s * 41.1 + ph[1]) + 0.08 * Math.sin(s * 83.7 + ph[2]);
        const A = A0 * irregular * (1 + 0.22 * hem) * (1 - 0.35 * head);
        const lead = f * smooth(0.6, 1, s) * (1 - y / RAIL_Y) * 0.05;
        const z = z0 + L * s - lead;
        const dx = A * wave + 0.012 * hem * Math.sin(s * 23 + ph[2]) * (1 + f);
        const k = (i * cols + j) * 3;
        const x = RAIL_X + dx - 0.01 * hem, zz = clamp(z, this.zA, this.zB);
        this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = zz;
        this.pos[n * 3 + k] = x + 0.006; this.pos[n * 3 + k + 1] = y; this.pos[n * 3 + k + 2] = zz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildFitting(F) {
  const { B, S, P, A, ctx } = F;
  // ---------------------------------------------------------------- partitions + front posts (black-stained oak)
  for (const z of ZS) {
    const len = 7.985 - XF;
    B.add('smoked', rbox(len, PART_H - 0.1, PART_T, 0.006, 2, { vertical: true }), M([XF + len / 2, 0.1 + (PART_H - 0.1) / 2, z]));
    B.add('gloss', rbox(len, 0.1, PART_T + 0.016, 0.004), M([XF + len / 2, 0.05, z]), F.ink);            // plinth
    B.add('smoked', rbox(0.085, PART_H, 0.085, 0.01, 2, { vertical: true }), M([XF, PART_H / 2, z]));    // front post
    B.add('brass', cyl(0.047, 0.047, 0.012, 20), M([XF, 0.006, z]));                                     // brass shoe
    B.add('brass', rbox(0.004, PART_H - 0.3, 0.012, 0.002), M([XF - 0.043, 0.15 + (PART_H - 0.3) / 2, z])); // gold inlay line
    S.add(XF + len / 2, 0, z, len + 0.2, 0.34, 0, 0.44);
    // inside the cubicles the walls are warm ivory limewash (bright, flattering); the outer end faces get
    // black-oak fluting with a brass line
    const pl = len - 0.12, ph = PART_H - 0.24;
    for (const sd of [-1, 1]) {
      const inside = (z === ZS[0] && sd > 0) || (z === ZS[3] && sd < 0) || (z !== ZS[0] && z !== ZS[3]);
      const fz = z + sd * (PART_T / 2 + 0.004);
      if (inside) B.add('plaster', rbox(pl, ph, 0.008, 0.003), M([XF + 0.07 + pl / 2, 0.13 + ph / 2, fz]));
      else B.add('smoked', reededPanel(pl, ph, 0.036, 0.01), M([XF + 0.07 + pl / 2, 0.13, z + sd * PART_T / 2], [0, sd > 0 ? 0 : Math.PI, 0]));
    }
  }
  const zMin = ZS[0] - 0.05, zMax = ZS[3] + 0.05, zc = (zMin + zMax) / 2;
  // black fascia + brass cap + shadow-gap reveal
  B.add('gloss', rbox(0.09, 0.26, zMax - zMin, 0.008), M([XF, 2.37, zc]), F.ink);
  B.add('brass', rbox(0.16, 0.022, zMax - zMin + 0.06, 0.006), M([XF + 0.01, 2.51, zc]));
  
  // rails + brackets; the curtains animate beneath them
  F.curtains = [];
  for (let c = 0; c < 3; c++) {
    const zA = ZS[c] + 0.035, zB = ZS[c + 1] - 0.035;
    B.add('brass', cyl(0.0105, 0.0105, zB - zA + 0.04, 16), M([RAIL_X, RAIL_Y + 0.03, (zA + zB) / 2], [Math.PI / 2, 0, 0]));
    for (const zz of [zA - 0.012, zB + 0.012]) {
      B.add('brass', cyl(0.022, 0.022, 0.012, 18), M([RAIL_X, RAIL_Y + 0.03, zz], [Math.PI / 2, 0, 0]));
      B.add('brass', cyl(0.006, 0.006, 0.06, 8), M([RAIL_X - 0.03, RAIL_Y + 0.03, zz], [0, 0, Math.PI / 2]));
    }
    const cur = new Curtain(zA, zB, F.mats.velvet, { seed: 11 + c * 7 });
    F.root.add(cur.mesh);
    F.curtains.push(cur);
  }
  // cubicle 1 occupied, cubicle 2 drawn open (mirror, stool, the dress on its hook), cubicle 3 ajar
  const target = [0.0, 0.64, 0.12];
  F.curtains.forEach((c, i) => c.set(target[i]));
  S.add(RAIL_X, 0, zc, 0.5, zMax - zMin, 0, 0.33);

  // someone is in fitting room 1: a pair of black loafers peeks out under the closed curtain
  for (const [dz, yaw] of [[-6.72, 0.08], [-6.5, -0.05]]) {
    const toe = new THREE.CapsuleGeometry(0.043, 0.17, 4, 12); toe.rotateZ(Math.PI / 2); toe.scale(1, 0.62, 0.95);
    B.add('gloss', toe, M([5.9, 0.028, dz], [0, yaw, 0]), '#141415');
    B.add('gloss', rbox(0.05, 0.012, 0.07, 0.004), M([5.84, 0.006, dz], [0, yaw, 0]), '#2a2220');
    S.add(5.88, 0, dz, 0.3, 0.14, yaw, 0.55);
  }

  // ---------------------------------------------------------------- interior of cubicle 2 (z −5.6 … −3.6)
  const zi = -4.6;
  mirrorRect(F, [7.975, 1.22, zi], 0.66, 1.72, -Math.PI / 2, 'brass');
  // stool: black oak drum + bouclé cushion
  B.add('smoked', lathe([[0.0, 0.0], [0.155, 0.0], [0.165, 0.01], [0.16, 0.36], [0.17, 0.38], [0.0, 0.38]], 40, { swapUV: true }), M([7.42, 0, -3.98]));
  B.add('boucle', lathe([[0.0, 0.38], [0.17, 0.38], [0.18, 0.4], [0.175, 0.44], [0.13, 0.46], [0.0, 0.465]], 32), M([7.42, 0, -3.98]));
  S.add(7.42, 0, -3.98, 0.48, 0.48, 0, 0.55);
  // brass hooks on the −z partition's inner face + the catalogue dress on one of them
  for (const hx of [6.62, 7.28]) hook(F, [hx, 1.78, ZS[1] + PART_T / 2]);
  hangingDress(F, [7.28, 1.8, ZS[1] + PART_T / 2 + 0.075]);
  // a folded knit waiting on the stool (catalogue product)
  {
    const kp = pickLike(ctx.catalog, 'knit', 'fit-stool', ['jumper', 'knitwear']);
    const m = M([7.42, 0.465, -3.98], [0, 0.5, 0]);
    const hs = [];
    for (let i = 0; i < 2; i++) {
      const g = rbox(0.3 - i * 0.02, 0.035, 0.24 - i * 0.02, 0.014, 3);
      hs.push(B.add('satin', g, m.clone().multiply(M([0, 0.018 + i * 0.034, 0], [0, i * 0.08, 0])), swatch(kp, 0, '#d8cfc0')));
    }
    P.box([7.42, 0.53, -3.98], [0.32, 0.1, 0.32], 0.5, productCard(F, kp, { at: [7.42, 0.6, -3.98], recolor: (sw) => hs.forEach(h => recolor(h, sw)) }));
  }

  // ---------------------------------------------------------------- halo-lit sign on the fascia
  B.add('glow', plane(1.3, 1.3 * 116 / 640, A.regions.sign), M([XF - 0.047, 2.37, zc], [0, -Math.PI / 2, 0]), [1.3, 1.14, 0.95]);
  // a warm LED line under the fascia washes the curtain heads
  B.add('glow', box(0.01, 0.005, zMax - zMin - 0.1), M([XF - 0.035, 2.236, zc]), [2.2, 1.8, 1.3]);
  // --- tap: curtains
  const names = ['Fitting room 1', 'Fitting room 2', 'Fitting room 3'];
  F.curtains.forEach((cur, i) => {
    P.box([RAIL_X, 1.1, (cur.zA + cur.zB) / 2], [0.14, 2.2, cur.len], 0, () => ({
      title: names[i] + (i === 0 ? ' — occupied' : ''),
      subtitle: i === 0 ? COPY.fittingOccupied : COPY.fitting,
      tag: 'Fitting rooms · ' + ctx.brand.name,
      onTap: () => {
        if (i === 0) { ctx.ui.toast('Occupied! Someone is falling in love with a new outfit in here'); ctx.fx.burst(new THREE.Vector3(RAIL_X - 0.2, 1.6, (cur.zA + cur.zB) / 2), { color: '#ffd58a', count: 20 }); return false; }
        F.animateCurtain(cur, cur.f > 0.3 ? 0.04 : 0.72);
        ctx.fx.burst(new THREE.Vector3(RAIL_X - 0.15, 1.9, cur.zA + 0.3), { color: '#ffd58a', count: 22 });
        return false;
      },
    }));
  });
  P.box([XF - 0.06, 2.37, zc], [0.06, 0.26, 1.3], 0, { title: 'Fitting rooms', subtitle: COPY.fitting, tag: ctx.brand.name,
    actions: [{ label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') }] });
  F.col.addBox(XF + (8 - XF) / 2 + 0.05, zc, 8 - XF + 0.1, zMax - zMin);

  // ---------------------------------------------------------------- freestanding arched mirror + pouf
  const mRot = Math.atan2(-1.0, 0.55) + Math.PI;
  const mx = 5.3, mz = -2.02;
  standingMirror(F, [mx, 0, mz], mRot + Math.PI, 0.72, 1.92);
  F.col.addBox(mx, mz, 0.8, 0.45, mRot);
  B.add('boucle', lathe([[0, 0.012], [0.2, 0.012], [0.235, 0.03], [0.25, 0.08], [0.25, 0.33], [0.24, 0.38], [0.2, 0.405], [0.1, 0.415], [0.0, 0.41]], 44), M([5.12, 0, -2.85]));
  B.add('brass', lathe([[0.0, 0.0], [0.17, 0.0], [0.175, 0.012], [0.0, 0.012]], 32), M([5.12, 0, -2.85]));
  S.add(5.12, 0, -2.85, 0.66, 0.66, 0, 0.55);
  F.col.addCircle(5.12, -2.85, 0.27);
  P.box([5.12, 0.22, -2.85], [0.5, 0.44, 0.5], 0, { title: 'The waiting pouf', subtitle: COPY.pouf, tag: 'Fitting rooms' });

  // ---------------------------------------------------------------- back-right corner: grand arched mirror
  // (left of the corner plant with a clear gap — the pot used to cut through the frame's right leg)
  leaningMirror(F, [6.64, 0, -10.955], 0.88, 2.24);
  F.col.addBox(6.64, -10.8, 1.0, 0.35);
}

// ------------------------------------------------------------------------------------------ pieces
/** Rectangular wall mirror: centre, width, height, rotY (normal = local +z after rotation). */
function mirrorRect(F, c, w, h, rotY, frameKey = 'brass') {
  const { B } = F;
  const m = M(c, [0, rotY, 0]);
  const t = 0.035;
  const frame = [[0, h / 2 - t / 2, w, t], [0, -h / 2 + t / 2, w, t], [-w / 2 + t / 2, 0, t, h - 2 * t], [w / 2 - t / 2, 0, t, h - 2 * t]];
  for (const [x, y, fw, fh] of frame) B.add(frameKey, rbox(fw, fh, 0.03, 0.008, 2, { vertical: fh > fw }), m.clone().multiply(M([x, y, 0.015])));
  B.add('mirror', plane(w - 2 * t + 0.01, h - 2 * t + 0.01), m.clone().multiply(M([0, 0, 0.008])));
}

function hook(F, [x, y, z]) {
  const { B } = F;
  B.add('brass', cyl(0.016, 0.016, 0.01, 16), M([x, y, z + 0.005], [Math.PI / 2, 0, 0]));
  const pts = [[0, 0, 0.01], [0, 0, 0.05], [0, -0.01, 0.07], [0, 0.015, 0.08], [0, 0.03, 0.075]].map(p => new THREE.Vector3(...p));
  B.add('brass', tube(pts, 0.0045, 16, 6), M([x, y, z]));
}

/** A catalogue dress hanging from a black hanger on a hook (lofted elliptical sections, library satin). */
function hangingDress(F, [x, y, z]) {
  const { B, ctx, P } = F;
  const p = pickLike(ctx.catalog, 'dress', 'fit-hook', ['satin', 'slip']);
  const col = swatch(p, lightest(p), '#e3d2bd');
  // hanger: black oak bar + brass hook
  const hp = [[-0.2, -0.07, 0], [-0.1, -0.035, 0], [0, -0.025, 0], [0.1, -0.035, 0], [0.2, -0.07, 0]].map(v => new THREE.Vector3(...v));
  B.add('smoked', tube(hp, 0.009, 16, 8), M([x, y, z]));
  const hk = [[0, -0.028, 0], [0, 0.0, 0], [0.004, 0.02, -0.01], [0, 0.03, -0.035], [-0.004, 0.018, -0.05]].map(v => new THREE.Vector3(...v));
  B.add('brass', tube(hk, 0.0028, 12, 5), M([x, y, z]));
  // body: rows [drop from hanger, half-width, half-depth]
  const rows = [[0.12, 0.13, 0.05], [0.16, 0.165, 0.075], [0.24, 0.17, 0.085], [0.38, 0.14, 0.065], [0.52, 0.18, 0.08], [0.78, 0.23, 0.095], [1.02, 0.27, 0.1], [1.05, 0.268, 0.1]];
  const N = 28; const pos = [], idx = [], uv = [];
  rows.forEach(([dy, hw, hd], i) => {
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2;
      const wob = i > 4 ? Math.sin(a * 5 + i) * 0.008 : 0;
      pos.push(Math.cos(a) * (hw + wob), -0.07 - dy, Math.sin(a) * (hd + wob * 0.6));
      uv.push((j / N) * 1.3, dy);
    }
  });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // straps
  const mat = ctx.mats.fabric('satin', col);
  const mesh = new THREE.Mesh(g, mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'fixtures:dress'; mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
  F.root.add(mesh);
  for (const s of [-1, 1]) {
    const sp = [new THREE.Vector3(s * 0.12, -0.05, 0.02), new THREE.Vector3(s * 0.1, -0.12, 0.04), new THREE.Vector3(s * 0.085, -0.195, 0.045)];
    const st = tube(sp, 0.004, 8, 5);
    const sm = new THREE.Mesh(st, mat); sm.position.set(x, y, z); sm.updateMatrix(); sm.matrixAutoUpdate = false; F.root.add(sm);
  }
  F.S.add(x, 0, z + 0.05, 0.6, 0.3, 0, 0.33);
  F.dress = { mesh, p };
  const recolorDress = (sw) => { const m2 = ctx.mats.fabric('satin', sw); mesh.material = m2; F.root.traverse(o => { if (o.isMesh && o.material === mat) o.material = m2; }); };
  P.box([x, y - 0.6, z], [0.5, 1.1, 0.24], 0, productCard(F, p, { at: [x, y - 0.4, z + 0.1], recolor: recolorDress }));
}

/** Freestanding cheval mirror: arched brass frame, easel strut behind, feet. rotY turns local +z to face out. */
function standingMirror(F, pos, rotY, w, h) {
  const { B, S } = F;
  const lean = 7 * DEG;
  const base = M(pos, [0, rotY, 0]);
  const tilt = base.clone().multiply(M([0, 0.02, 0], [-lean, 0, 0]));
  archFrame(F, tilt, w, h, 0.04, 'brass');
  const top = new THREE.Vector3(0, h * 0.72, -0.03).applyMatrix4(M([0, 0.02, 0], [-lean, 0, 0]));
  const foot = new THREE.Vector3(0, 0.0, -0.46);
  const mid = top.clone().add(foot).multiplyScalar(0.5);
  const len = top.distanceTo(foot);
  const dir = top.clone().sub(foot).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  B.add('brass', cyl(0.009, 0.011, len, 10), base.clone().multiply(M(mid.toArray(), [e.x, e.y, e.z])));
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) B.add('brass', cyl(0.018, 0.022, 0.03, 14), base.clone().multiply(M([sx, 0.015, 0.02])));
  const p = new THREE.Vector3(0, 0, -0.18).applyMatrix4(base);
  S.add(p.x, 0, p.z, w + 0.25, 0.75, rotY, 0.44);
  F.P.box(new THREE.Vector3(0, h / 2, 0).applyMatrix4(base).toArray(), [w, h, 0.08], rotY, () => mirrorInfo(F, 'The cheval mirror'));
}

/** Tall arched mirror leaning against a wall (back at wallZ, facing +z). */
function leaningMirror(F, [x, , wallZ], w, h) {
  const { S } = F;
  const lean = Math.asin(0.2 / h);
  const base = M([x, 0.0, wallZ + 0.2 + 0.03], [-lean, 0, 0]);
  archFrame(F, base, w, h, 0.07, 'brass', true);
  S.add(x, 0, wallZ + 0.24, w + 0.3, 0.42, 0, 0.55);
  F.P.box([x, h / 2, wallZ + 0.12], [w, h, 0.25], 0, () => mirrorInfo(F, 'The grand mirror'));
}

function archFrame(F, m, w, h, t, key, ornate = false) {
  const { B } = F;
  const outer = archShape(w, h, 0), inner = archShape(w, h, t);
  const ring = new THREE.Shape(outer.getPoints(20));
  ring.holes.push(new THREE.Path(inner.getPoints(20).reverse()));
  const fg = new THREE.ExtrudeGeometry(ring, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 12 });
  uvXY(fg, 1, 1);
  B.add(key, fg, m.clone().multiply(M([0, 0, -0.01])));
  if (ornate) {
    const bead = new THREE.Shape(archShape(w, h, t - 0.012).getPoints(20));
    bead.holes.push(new THREE.Path(archShape(w, h, t).getPoints(20).reverse()));
    const bg = new THREE.ExtrudeGeometry(bead, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 12 });
    uvXY(bg); B.add('brass', bg, m.clone().multiply(M([0, 0, 0.026])));
  }
  const gg = new THREE.ShapeGeometry(archShape(w, h, t - 0.004), 24); uvXY(gg);
  B.add('mirror', gg, m.clone().multiply(M([0, 0, 0.004])));
  const back = new THREE.ShapeGeometry(archShape(w, h, 0.004), 24); uvXY(back);
  const bb = back.clone(); bb.scale(1, 1, -1);
  const idx = bb.index.array; for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = tmp; }
  bb.computeVertexNormals();
  B.add('smoked', bb, m.clone().multiply(M([0, 0, -0.018])));
}

function mirrorInfo(F, title) {
  return {
    title, subtitle: COPY.mirror, tag: F.ctx.brand.slogan,
    onTap: (hit) => {
      F.ctx.ui.toast(F.rngLine(COPY.mirrorLines));
      if (hit && hit.point) F.ctx.fx.burst(hit.point.clone(), { color: '#ffd58a', count: 26 });
      return false;
    },
  };
}
