#!/usr/bin/env node
// apparelDisplay — OFFLINE mannequin bake (owner: apparelDisplay).
//
//   node tools/apparelDisplay-bake.mjs [figureId …] [--h 0.005] [--nosimplify]
//
// Writes assets/models/mannequin-<id>.glb: one dressed retail mannequin per file, in its own frame
// (origin = the stand rod axis on the floor, the figure faces +z, its left is +x). Each GLB node is one
// part: 'body' (the finish), each garment layer, and trims ('trimDark' horn/leather, 'trimBrass').
//   node.extras = { part, mat, color }   root 'figure' node extras = { id, rodTop, shoes:[{p,q,mirror}] }
// Geometry: SDF body (tools/apparelDisplay-sdf.mjs) → sparse marching cubes (tools/apparelDisplay-mc.mjs)
// → hidden-surface cull (every part is a closed solid, so any surface inside another part is invisible)
// → meshoptimizer simplify → SDF-gradient normals, metre UV charts (v up the garment), baked AO (COLOR_0.r).
// Positions/normals are quantised (KHR_mesh_quantization: no decoder needed at runtime).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { buildRig, buildBody, evalParts, bodyFrom, P, NPARTS, smin, smax, clamp, lerp, smoothstep, wNear, legCentreAt, legRadiusAt, segDist2, plane, foldFn, basisY } from './apparelDisplay-sdf.mjs';
import { extract, refine, cull, compact, simplify, gradient } from './apparelDisplay-mc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const H = Number(opt('h', 0.005));
const ONLY = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && argv[i - 1] !== '--nosimplify'));
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ================================================================================================
// Poses
// ================================================================================================
const POSES = {
  contraR: () => ({
    body: 'f',
    pelvis: { pos: [0.012, 1.0, 0], rot: [0, -4, -3.5] },
    spine: [2, 2, 3], chest: [-3, 3, 3.5], neck: [7, 0, -2], head: [-7, 12, -4],
    feet: { R: { heel: [-0.075, -0.04], yaw: -8 }, L: { heel: [0.105, 0.065], yaw: 17, pitch: 14, bend: true } },
    hands: {
      R: { wrist: [-0.215, 0.9, 0.025], pole: [-0.3, 0, -1], dir: [0.12, -1, 0.14], palm: [1, 0, 0.1] },
      L: { wrist: [0.225, 0.915, 0.055], pole: [0.3, 0, -1], dir: [-0.1, -1, 0.2], palm: [-1, 0, 0.1] },
    },
  }),
  hipR: () => ({
    body: 'f',
    pelvis: { pos: [-0.01, 1.0, 0], rot: [0, 6, 4] },
    spine: [1, -2, -3], chest: [-2, -3, -3.5], neck: [6, 0, 2], head: [-6, -16, 5],
    feet: { L: { heel: [0.07, -0.035], yaw: 10 }, R: { heel: [-0.135, 0.06], yaw: -26, pitch: 11, bend: true } },
    hands: {
      R: { wrist: [-0.212, 1.035, -0.03], pole: [-1, 0.25, -0.55], dir: [0.42, -0.72, 0.55], palm: [1, 0, 0] },
      L: { wrist: [0.272, 0.93, 0.075], pole: [0.35, 0, -1], dir: [0.02, -1, 0.22], palm: [-1, 0, 0.1] },
    },
  }),
  walkM: () => ({
    body: 'm',
    pelvis: { pos: [0, 1.04, 0.03], rot: [3, -7, 1] },
    spine: [0, 4, 0], chest: [-3, 6, -1], neck: [6, 0, 0], head: [-6, -5, 0],
    feet: { L: { heel: [0.085, 0.19], yaw: 7 }, R: { heel: [-0.09, -0.33], yaw: -4, pitch: 27, bend: true } },
    hands: {
      R: { wrist: [-0.215, 0.965, 0.16], pole: [-0.25, 0, -1], dir: [0.1, -1, 0.3], palm: [1, 0, 0] },
      L: { wrist: [0.225, 0.955, -0.13], pole: [0.25, 0, -1], dir: [-0.1, -1, 0.05], palm: [-1, 0, 0] },
    },
  }),
  walkF: () => ({
    body: 'f',
    pelvis: { pos: [0, 1.0, 0.03], rot: [2, 7, -1] },
    spine: [0, -3, 0], chest: [-3, -5, 1], neck: [7, 0, 0], head: [-7, 6, 0],
    feet: { R: { heel: [-0.05, 0.2], yaw: -4 }, L: { heel: [0.07, -0.3], yaw: 6, pitch: 30, bend: true } },
    hands: {
      L: { wrist: [0.205, 0.93, 0.13], pole: [0.25, 0, -1], dir: [-0.1, -1, 0.3], palm: [-1, 0, 0] },
      R: { wrist: [-0.21, 0.92, -0.1], pole: [-0.25, 0, -1], dir: [0.1, -1, 0.05], palm: [1, 0, 0] },
    },
  }),
};
/** Mirror a pose (x → −x, L ↔ R). */
function mirror(sp) {
  const m = JSON.parse(JSON.stringify(sp));
  const fr = r => [r[0] || 0, -(r[1] || 0), -(r[2] || 0)];
  m.pelvis.pos[0] *= -1; m.pelvis.rot = fr(m.pelvis.rot);
  for (const k of ['spine', 'chest', 'neck', 'head']) m[k] = fr(m[k] || []);
  const f = m.feet, h = m.hands;
  m.feet = { L: { ...f.R, heel: [-f.R.heel[0], f.R.heel[1]], yaw: -(f.R.yaw || 0) }, R: { ...f.L, heel: [-f.L.heel[0], f.L.heel[1]], yaw: -(f.L.yaw || 0) } };
  const mh = o => ({ ...o, wrist: [-o.wrist[0], o.wrist[1], o.wrist[2]], pole: o.pole && [-o.pole[0], o.pole[1], o.pole[2]], dir: o.dir && [-o.dir[0], o.dir[1], o.dir[2]], palm: o.palm && [-o.palm[0], o.palm[1], o.palm[2]] });
  m.hands = { L: mh(h.R), R: mh(h.L) };
  return m;
}
POSES.contraL = () => mirror(POSES.contraR());
POSES.contraML = () => { const p = mirror(POSES.contraR()); p.body = 'm'; p.pelvis.pos[1] = 1.04; p.hands.L.wrist[0] += 0.02; p.hands.R.wrist[0] -= 0.02; return p; };

// ================================================================================================
// Garment toolkit (all closures precompute their constants; the hot path only does arithmetic)
// ================================================================================================
function frames(R) {
  const nb = R.neckBase, axis = R.headJ.clone().sub(nb).normalize();
  const cf = v3(0, 0, 1).applyQuaternion(R.chest.quat); const fwd = cf.clone().sub(axis.clone().multiplyScalar(cf.dot(axis))).normalize();
  const side = new THREE.Vector3().crossVectors(axis, fwd).normalize(); // figure's left
  const chestInv = R.chest.quat.clone().invert(), pelvInv = R.pelvis.quat.clone().invert();
  return { nb, axis, fwd, side, chestInv, pelvInv };
}
/** Neck-frame coordinates: a = height up the neck from its base, rad = distance from the neck axis, th = angle (0 front, +left). */
function neckCoords(Fm, x, y, z, out) {
  const qx = x - Fm.nb.x, qy = y - Fm.nb.y, qz = z - Fm.nb.z, A = Fm.axis;
  const a = qx * A.x + qy * A.y + qz * A.z;
  const rx = qx - A.x * a, ry = qy - A.y * a, rz = qz - A.z * a;
  out[0] = a; out[1] = Math.hypot(rx, ry, rz);
  out[2] = Math.atan2(rx * Fm.side.x + ry * Fm.side.y + rz * Fm.side.z, rx * Fm.fwd.x + ry * Fm.fwd.y + rz * Fm.fwd.z);
  return out;
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function localIn(fr, inv, x, y, z, out) { _v.set(x - fr.pos.x, y - fr.pos.y, z - fr.pos.z).applyQuaternion(inv); out[0] = _v.x; out[1] = _v.y; out[2] = _v.z; return out; }

/** Sleeve distances per side (arm group cut at fraction cutT along the forearm; cutT < 0 → upper arm at −cutT). */
function sleeveFns(R, cutT) {
  const out = {};
  for (const side of ['L', 'R']) {
    const A = R.arm[side], iu = side === 'L' ? P.upL : P.upR, iF = side === 'L' ? P.foreL : P.foreR;
    if (cutT < 0) {
      const n = A.elbow.clone().sub(A.shoulder).normalize(), p0 = A.shoulder.clone().lerp(A.elbow, -cutT);
      out[side] = (D, x, y, z) => Math.max(D[iu], plane(x, y, z, p0, n));
    } else {
      const n = A.fore.clone(), p0 = A.elbow.clone().lerp(A.wrist, cutT), k = 0.014 * R.s;
      out[side] = (D, x, y, z) => Math.max(smin(D[iu], D[iF], k), plane(x, y, z, p0, n));
      out[side].cuff = { p0, n };
    }
  }
  return out;
}
/** Torso + neck + sleeves, joined at the shoulders like the body is. */
function upperFn(R, sl) {
  const s = R.s, shL = R.arm.L.shoulder, shR = R.arm.R.shoulder;
  return (D, x, y, z) => {
    let t = smin(D[P.torso], D[P.neck], 0.045 * s);
    if (sl) {
      t = smin(t, sl.L(D, x, y, z), 0.055 * s * wNear(x, y, z, shL, 0.06, 0.17));
      t = smin(t, sl.R(D, x, y, z), 0.055 * s * wNear(x, y, z, shR, 0.06, 0.17));
    }
    return t;
  };
}
/** Distance along the cuff normal from the cuff plane (negative = up the sleeve). */
function cuffDist(sl, side, x, y, z) { const c = sl[side].cuff; return c ? plane(x, y, z, c.p0, c.n) : 1; }

/** Neckline removal: g stays where (a < h(th)) or outside the cylinder of radius rc. */
function neckline(g, nc, hFront, hBack, rc, vDepth = 0, vWidth = 0.5) {
  const th = Math.abs(nc[2]);
  let h = lerp(hFront, hBack, smoothstep(0.35, 2.4, th));
  if (vDepth) h -= vDepth * Math.max(0, 1 - th / vWidth);
  return smax(g, Math.min(nc[0] - h, rc - nc[1]), 0.004);
}
/** Skirt hull between both legs at height y: 2-D distance to the stadium minus radius. */
const _cl = [0, 0], _cr = [0, 0];
function hull(R, x, y, z, ease) {
  legCentreAt(R, 'L', y, _cl); legCentreAt(R, 'R', y, _cr);
  const r = 0.5 * (legRadiusAt(R, 'L', y) + legRadiusAt(R, 'R', y));
  return segDist2(x, z, _cl[0], _cl[1], _cr[0], _cr[1]) - r - ease;
}
/** Angle around the pelvis vertical axis (0 = front). */
function pelvisTheta(R, x, z) { const f = R.pelvisFwd; const dx = x - R.pelvis.pos.x, dz = z - R.pelvis.pos.z; return Math.atan2(dx * f.z - dz * f.x, dx * f.x + dz * f.z); }
const band = (x, a, b, soft) => smoothstep(a - soft, a + soft, x) * (1 - smoothstep(b - soft, b + soft, x));

// ================================================================================================
// Garments. Each returns { name, mat, color, sd:(D,x,y,z)=>d, charts:[…], kind }.
// charts: part ids allowed for UV charts ('torso','upL','foreL','upR','foreR','thighL','shinL','thighR','shinR','neck')
// ================================================================================================
const ARM_CHARTS = ['torso', 'neck', 'upL', 'foreL', 'upR', 'foreR'];
const LEG_CHARTS = ['torso', 'thighL', 'shinL', 'thighR', 'shinR'];

function knitTop(R, { color, cut = 0.97, neck = 'roll', hem, ease = 0.0085, name = 'knit', mat = 'knit' }) {
  const Fm = frames(R), sl = sleeveFns(R, cut), up = upperFn(R, sl), nc = [0, 0, 0];
  const hemY = hem ?? R.pelvis.pos.y - 0.05;
  return {
    name, mat, color, charts: ARM_CHARTS,
    sd(D, x, y, z) {
      neckCoords(Fm, x, y, z, nc);
      let e = ease;
      if (neck === 'roll') e += 0.012 * Math.pow(Math.sin(Math.PI * clamp((nc[0] - 0.008) / 0.07, 0, 1)), 0.7) * (nc[1] < 0.11 ? 1 : 0);
      else e += 0.0025 * band(nc[0], -0.03, 0.03, 0.004) * (nc[1] < 0.12 ? 1 : 0);
      e += 0.0022 * (1 - smoothstep(-0.05, -0.044, Math.min(cuffDist(sl, 'L', x, y, z), cuffDist(sl, 'R', x, y, z))));
      e += 0.0022 * (1 - smoothstep(hemY + 0.05, hemY + 0.056, y));
      let g = up(D, x, y, z) - e;
      g = neck === 'roll' ? neckline(g, nc, 0.078, 0.078, 0.12) : neckline(g, nc, -0.03, 0.004, 0.11);
      return smax(g, hemY - y, 0.004);
    },
  };
}

/** Coat / trench / wrap / blazer (upper + hull skirt, V front, lapels, collar, optional belt). */
function coat(R, o) {
  const Fm = frames(R), sl = sleeveFns(R, o.cut ?? 0.86), up = upperFn(R, sl), nc = [0, 0, 0], lc = [0, 0, 0];
  const s = R.s, yBelt = o.yBelt ?? R.spine.pos.y - 0.012, yV = o.yV ?? yBelt, hemY = o.hem, hipY = R.pelvis.pos.y;
  const topSkirt = hipY - 0.035, nbY = Fm.nb.y, xOff = o.xOff ?? 0.012;
  const folds = foldFn(o.seed || 3, [[5, 0.5], [8, 0.3], [13, 0.2]]);
  const ease = o.ease ?? 0.02, lapW = o.lapel ?? [0.028, 0.068], lapH = o.lapelH ?? 0.0055;
  const flare = o.flare ?? [0.006, 0.1];
  return {
    name: o.name || 'coat', mat: o.mat || 'wool', color: o.color, charts: ARM_CHARTS, skirt: true,
    sd(D, x, y, z) {
      neckCoords(Fm, x, y, z, nc);
      localIn(R.chest, Fm.chestInv, x, y, z, lc);
      const th = pelvisTheta(R, x, z);
      // V opening + lapels (front half only)
      const vOn = y > yV + 0.004 ? 1 : 0;
      const w = lerp(0.006, o.vTop ?? 0.078, smoothstep(yV, nbY + 0.015, y)) + (y > nbY ? (y - nbY) * 0.6 : 0);
      const eV = Math.abs(lc[0] - xOff) - w;
      let e = ease;
      if (lc[2] > 0 && y > yV && y < nbY + 0.04) {
        const lw = lerp(lapW[0], lapW[1], smoothstep(yV, nbY, y));
        e += lapH * (1 - smoothstep(lw - 0.006, lw + 0.006, eV)) * smoothstep(yV + 0.005, yV + 0.06, y);
      }
      if (o.cuffStrap) e += 0.0035 * band(Math.min(cuffDist(sl, 'L', x, y, z), cuffDist(sl, 'R', x, y, z)), -0.085, -0.045, 0.004);
      if (o.pockets) { // flap pockets at the hips
        const py = hipY + o.pockets[0];
        e += 0.004 * band(y, py - 0.03, py + 0.02, 0.002) * band(Math.abs(lc[0]), 0.06, 0.17, 0.003) * (lc[2] > 0 ? 1 : 0);
      }
      let g = up(D, x, y, z) - e;
      g = neckline(g, nc, 0.012, 0.015, 0.105);
      // skirt below the waist
      if (y < topSkirt + 0.06) {
        const t = clamp((topSkirt - y) / (topSkirt - hemY), 0, 1);
        const sk = hull(R, x, y, z, lerp(flare[0], flare[1], t) + (0.003 + (o.foldAmp ?? 0.03) * t) * folds(th, y));
        g = smin(g, Math.max(sk, y - topSkirt), 0.06 * s);
      }
      // collar ring
      if (o.collar !== false) {
        const cH = o.collarH ?? 0.055, Rc = (o.collarR ?? 0.078) + (o.collarFlare ?? 0.25) * nc[0];
        const ring = Math.max(Math.abs(nc[1] - Rc) - 0.0065, Math.max(-0.004 - nc[0], nc[0] - cH));
        g = smin(g, ring, 0.012);
      }
      if (o.belt) g -= 0.0065 * band(y, yBelt - 0.021, yBelt + 0.021, 0.003);
      // front V removal
      if (vOn) g = smax(g, -Math.max(eV, -lc[2] + 0.01, y - (nbY + 0.2)), 0.004);
      return smax(g, hemY + 0.008 * Math.sin(2 * th + 0.7) + 0.004 * Math.sin(5 * th) - y, 0.005);
    },
  };
}

function trousers(R, o) {
  const s = R.s, hipY = R.pelvis.pos.y, waistY = hipY + (o.rise ?? 0.07), hemY = o.hem ?? 0.012;
  const kn = { L: R.leg.L.knee, R: R.leg.R.knee }, hp = { L: R.leg.L.hip, R: R.leg.R.hip };
  const folds = foldFn(o.seed || 5, [[4, 0.5], [7, 0.3], [11, 0.2]]), c = [0, 0];
  const wide = o.wide ?? [0.104, 0.13];
  return {
    name: o.name || 'trousers', mat: o.mat || 'wool', color: o.color, charts: LEG_CHARTS,
    sd(D, x, y, z) {
      let legs = Infinity;
      for (const side of ['L', 'R']) {
        const K = kn[side];
        legCentreAt(R, side, y, c);
        let r;
        if (y > K.y) r = lerp(legRadiusAt(R, side, y) + 0.017, wide[0], smoothstep(hp[side].y, K.y, y));
        else {
          const t = clamp((K.y - y) / K.y, 0, 1);
          c[0] = lerp(c[0], K.x, 0.6 * t); c[1] = lerp(c[1], K.z, 0.6 * t);
          r = lerp(wide[0], wide[1], t);
        }
        const t2 = clamp((hp[side].y - y) / hp[side].y, 0, 1);
        const th = Math.atan2(x - c[0], z - c[1]);
        r += (0.002 + 0.012 * t2 * t2) * folds(th + (side === 'L' ? 0 : 2), y) + 0.004 * band(y, hemY, hemY + 0.05, 0.01) * (0.5 + 0.5 * Math.sin(y * 150 + th));
        const d = Math.max(Math.hypot(x - c[0], z - c[1]) - r, y - (hp[side].y + 0.03));
        legs = Math.min(legs, d);
      }
      const pel = Math.max(D[P.torso] - 0.014 - 0.0035 * band(y, waistY - 0.04, waistY, 0.002), y - waistY);
      return smax(smin(pel, legs, 0.045 * s), hemY - y, 0.004);
    },
  };
}

function slipDress(R, o) {
  const s = R.s, hipY = R.pelvis.pos.y, hemY = o.hem ?? 0.31, lc = [0, 0, 0], Fm = frames(R);
  const folds = foldFn(o.seed || 11, [[5, 0.5], [8, 0.3], [12, 0.2]]);
  return {
    name: 'dress', mat: o.mat || 'velvet', color: o.color, charts: ['torso'], skirt: true,
    sd(D, x, y, z) {
      localIn(R.chest, Fm.chestInv, x, y, z, lc);
      const thc = Math.atan2(lc[0], lc[2]), ath = Math.abs(thc);
      let h = lerp(0.03, -0.035, smoothstep(0.5, 2.3, ath)) - 0.022 * Math.max(0, 1 - ath / 0.35);
      let g = D[P.torso] - 0.0038 - 0.004 * smoothstep(0.9, 1.6, ath) * smoothstep(-0.06, 0.02, lc[1]);
      g = Math.max(g, lc[1] - h);
      const th = pelvisTheta(R, x, z);
      if (y < hipY + 0.03) {
        const t = clamp((hipY - 0.04 - y) / (hipY - 0.04 - hemY), 0, 1);
        const sk = hull(R, x, y, z, lerp(-0.004, 0.075, t * t * 0.4 + t * 0.6) + (0.002 + 0.04 * t) * folds(th, y));
        g = smin(g, Math.max(sk, y - (hipY - 0.04)), 0.06 * s);
      }
      // never let the hip crest / a bent knee poke through: the skirt always covers torso + legs by 3.5 mm
      if (y < hipY + 0.08) g = Math.min(g, torsoLegs(R, D, x, y, z) - 0.0035);
      return smax(g, hemY + 0.012 * Math.sin(th + 1) - y, 0.004);
    },
  };
}

/** Torso + legs of the body SDF (bodyFrom without head / arms): what a skirt must always cover. */
function torsoLegs(R, D, x, y, z) {
  const s = R.s;
  let t = D[P.torso];
  for (const side of ['L', 'R']) {
    const L = R.leg[side], th = side === 'L' ? D[P.thighL] : D[P.thighR], sh = side === 'L' ? D[P.shinL] : D[P.shinR];
    t = smin(t, smin(th, sh, 0.022 * s), 0.075 * s * wNear(x, y, z, L.hip, 0.1, 0.26));
  }
  return t;
}

function croppedJacket(R, o) {
  const Fm = frames(R), sl = sleeveFns(R, o.cut ?? 0.62), up = upperFn(R, sl), nc = [0, 0, 0], lc = [0, 0, 0];
  const hemY = o.hem ?? R.spine.pos.y - 0.005, nbY = Fm.nb.y;
  const gap = y => lerp(0.052, 0.03, smoothstep(hemY, nbY, y));
  return {
    name: 'jacket', mat: o.mat || 'boucle', color: o.color, charts: ARM_CHARTS, gap, hemY,
    sd(D, x, y, z) {
      neckCoords(Fm, x, y, z, nc); localIn(R.chest, Fm.chestInv, x, y, z, lc);
      const eg = Math.abs(lc[0]) - gap(y);
      let e = 0.016;
      // braid trim along the edges
      const cd = Math.min(cuffDist(sl, 'L', x, y, z), cuffDist(sl, 'R', x, y, z));
      let tr = 0;
      if (lc[2] > 0) tr = Math.max(tr, 1 - smoothstep(0.009, 0.013, eg));
      tr = Math.max(tr, 1 - smoothstep(hemY + 0.009, hemY + 0.013, y), 1 - smoothstep(-0.013, -0.009, cd));
      tr = Math.max(tr, (1 - smoothstep(-0.032, -0.026, nc[0])) * (nc[1] < 0.12 ? 1 : 0) * smoothstep(-0.07, -0.05, nc[0]));
      e += 0.0028 * tr;
      // chest patch pockets
      e += 0.003 * band(y, hemY + 0.03, hemY + 0.1, 0.003) * band(Math.abs(lc[0]), 0.07, 0.13, 0.003) * (lc[2] > 0 ? 1 : 0);
      let g = up(D, x, y, z) - e;
      g = neckline(g, nc, -0.028, 0.006, 0.11);
      if (lc[2] > 0) g = smax(g, -eg, 0.004);
      return smax(g, hemY - y, 0.004);
    },
  };
}

function hoodie(R, o) {
  const s = R.s, Fm = frames(R), sl = sleeveFns(R, 0.965), up = upperFn(R, sl), nc = [0, 0, 0], lc = [0, 0, 0], lp = [0, 0, 0];
  const hemY = R.pelvis.pos.y - 0.075, hfold = foldFn(23, [[5, 0.5], [9, 0.35], [14, 0.15]]);
  // a hoodie hangs straight from the chest: a vertical prism of the ribcage cross-section fills the waist
  const yc = R.chest.pos.y - 0.01, pcx = R.chest.pos.x, torsoF = R.parts[P.torso];
  const hoodC = v3(0, 0.205 * s, -0.085 * s).applyQuaternion(R.chest.quat).add(R.chest.pos);
  const hb = new THREE.Matrix4().makeRotationFromQuaternion(R.chest.quat);
  const e0 = hb.elements, hr = [0.118 * s, 0.088 * s, 0.078 * s];
  const cords = [1, -1].map(sd => {
    const top = Fm.nb.clone().add(Fm.fwd.clone().multiplyScalar(0.078 * s)).add(Fm.side.clone().multiplyScalar(0.036 * sd)).add(Fm.axis.clone().multiplyScalar(-0.03));
    const bot = top.clone().add(v3(0, -0.2, 0)).add(Fm.fwd.clone().multiplyScalar(0.05)).add(Fm.side.clone().multiplyScalar(0.006 * sd));
    return [top, bot];
  });
  const cap = (x, y, z, a, b, r) => { const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z, l2 = bax * bax + bay * bay + baz * baz; const t = clamp(((x - a.x) * bax + (y - a.y) * bay + (z - a.z) * baz) / l2, 0, 1); return Math.hypot(x - a.x - bax * t, y - a.y - bay * t, z - a.z - baz * t) - r; };
  return {
    name: 'hoodie', mat: o.mat || 'jersey', color: o.color, charts: ARM_CHARTS,
    sd(D, x, y, z) {
      neckCoords(Fm, x, y, z, nc); localIn(R.pelvis, Fm.pelvInv, x, y, z, lp);
      const cd = Math.min(cuffDist(sl, 'L', x, y, z), cuffDist(sl, 'R', x, y, z));
      const thp = pelvisTheta(R, x, z), tdr = smoothstep(Fm.nb.y - 0.12, hemY + 0.08, y) * (1 - smoothstep(hemY + 0.04, hemY + 0.07, y) * 0) ;
      let e = lerp(0.012, 0.03, smoothstep(hemY + 0.058, hemY + 0.11, y)) + 0.012 * (y < Fm.nb.y - 0.08 ? 1 : 0) * smoothstep(Fm.nb.y - 0.08, hemY + 0.12, y) * hfold(thp, y) * (y > hemY + 0.06 ? 1 : 0);
      void tdr;
      e -= 0.008 * (1 - smoothstep(-0.07, -0.062, cd));                 // rib cuffs
      e += 0.004 * Math.max(0, Math.sin(cd * 70)) * smoothstep(-0.22, -0.08, cd) * (1 - smoothstep(-0.075, -0.06, cd)); // bunching
      // kangaroo pocket (pelvis frame)
      if (lp[2] > 0) { const w = 0.125 - 0.3 * Math.max(0, lp[1] - 0.02); e += 0.005 * band(lp[1], 0.0, 0.13, 0.008) * (1 - smoothstep(w - 0.008, w + 0.008, Math.abs(lp[0]))); }
      let g = up(D, x, y, z) - e;
      if (y < yc + 0.02 && y > hemY - 0.02) {
        const ramp = smoothstep(yc, yc - 0.16, y);
        const pr = torsoF(pcx + (x - pcx) * 1.07, yc, z) - lerp(-0.02, 0.026, ramp) - 0.01 * hfold(pelvisTheta(R, x, z) + 1.3, y) * smoothstep(yc, hemY + 0.1, y);
        g = smin(g, Math.max(pr, y - yc), 0.06 * s);
      }
      g = neckline(g, nc, -0.035, 0.02, 0.1, 0.03, 0.4);
      // hood lump on the upper back
      const px = x - hoodC.x, py = y - hoodC.y, pz = z - hoodC.z;
      const hx = (px * e0[0] + py * e0[1] + pz * e0[2]) / hr[0], hy = (px * e0[4] + py * e0[5] + pz * e0[6]) / hr[1], hz = (px * e0[8] + py * e0[9] + pz * e0[10]) / hr[2];
      const hood = (Math.hypot(hx, hy, hz) - 1) * Math.min(...hr);
      g = smin(g, hood, 0.045 * s);
      // hood rim around the neck, open at the front
      const rim = Math.hypot(nc[1] - 0.088 * s, nc[0] - 0.012) - 0.021;
      g = smin(g, Math.max(rim, 0.42 - Math.abs(nc[2])), 0.02);
      g = smax(g, hemY - y, 0.004);
      for (const [a, b] of cords) g = Math.min(g, cap(x, y, z, a, b, 0.0058));
      return g;
    },
  };
}

function cargos(R, o) {
  const s = R.s, hipY = R.pelvis.pos.y, waistY = hipY + 0.055;
  const L = R.leg, cfold = foldFn(29, [[4, 0.5], [7, 0.35], [11, 0.15]]);
  const pocket = {};
  for (const side of ['L', 'R']) {
    const sd = L[side].sx, dir = L[side].knee.clone().sub(L[side].hip).normalize();
    const out = v3(sd, 0, 0).sub(dir.clone().multiplyScalar(dir.x * sd)).normalize();
    pocket[side] = { dir, out, hip: L[side].hip, len: L[side].hip.distanceTo(L[side].knee) };
  }
  return {
    name: 'cargos', mat: o.mat || 'canvas', color: o.color, charts: LEG_CHARTS,
    sd(D, x, y, z) {
      let legs = Infinity;
      for (const side of ['L', 'R']) {
        const K = L[side].knee, A = L[side].ankle, pk = pocket[side];
        const th = side === 'L' ? D[P.thighL] : D[P.thighR], sh = side === 'L' ? D[P.shinL] : D[P.shinR];
        const tk = (y - K.y);
        const thl = Math.atan2(x - K.x, z - K.z);
        let e = y > K.y ? lerp(0.042, 0.024, smoothstep(K.y, L[side].hip.y, y)) : lerp(0.042, 0.02, smoothstep(K.y, A.y + 0.1, y));
        e += 0.011 * cfold(thl + (side === 'L' ? 0 : 1.7), y) * smoothstep(L[side].hip.y - 0.05, K.y, y) * (1 - smoothstep(A.y + 0.09, A.y + 0.12, y) * 0) * (y > A.y + 0.085 ? 1 : 0);
        e += 0.007 * Math.max(0, Math.sin(tk * 48 + thl)) * (1 - smoothstep(0.05, 0.14, Math.abs(tk)));      // knee creases
        e -= 0.007 * (1 - smoothstep(A.y + 0.075, A.y + 0.085, y));                                       // rib cuff
        e += 0.002 * Math.max(0, Math.sin((y - A.y) * 90)) * band(y, A.y + 0.08, A.y + 0.2, 0.01);        // stacking above the cuff
        // cargo pocket on the outer thigh
        const qx = x - pk.hip.x, qy = y - pk.hip.y, qz = z - pk.hip.z;
        const ta = (qx * pk.dir.x + qy * pk.dir.y + qz * pk.dir.z) / pk.len, lat = qx * pk.out.x + qy * pk.out.y + qz * pk.out.z;
        e += 0.009 * band(ta, 0.42, 0.72, 0.02) * smoothstep(0.03, 0.05, lat);
        e += 0.003 * band(ta, 0.41, 0.49, 0.008) * smoothstep(0.03, 0.05, lat);                            // flap
        const d = smax(smin(th, sh, 0.022 * s) - e, (A.y + 0.028) - y, 0.004);
        legs = Math.min(legs, d);
      }
      const pel = Math.max(D[P.torso] - 0.016 - 0.004 * band(y, waistY - 0.04, waistY, 0.002), y - waistY);
      return smin(pel, legs, 0.045 * s);
    },
  };
}

function knitDress(R, o) {
  const s = R.s, Fm = frames(R), sl = sleeveFns(R, 0.965), up = upperFn(R, sl), nc = [0, 0, 0];
  const hipY = R.pelvis.pos.y, hemY = o.hem ?? 0.27;
  const folds = foldFn(o.seed || 17, [[6, 0.6], [9, 0.4]]);
  return {
    name: 'dress', mat: 'knit@0.45', color: o.color, charts: ARM_CHARTS, skirt: true,
    sd(D, x, y, z) {
      neckCoords(Fm, x, y, z, nc);
      const cd = Math.min(cuffDist(sl, 'L', x, y, z), cuffDist(sl, 'R', x, y, z));
      let e = 0.0065 + 0.0022 * (1 - smoothstep(-0.07, -0.064, cd)) + 0.01 * Math.pow(Math.sin(Math.PI * clamp((nc[0] + 0.005) / 0.055, 0, 1)), 0.7) * (nc[1] < 0.11 ? 1 : 0);
      let g = up(D, x, y, z) - e;
      g = neckline(g, nc, 0.05, 0.05, 0.11);
      const th = pelvisTheta(R, x, z);
      if (y < hipY + 0.03) {
        const t = clamp((hipY - 0.04 - y) / (hipY - 0.04 - hemY), 0, 1);
        const sk = hull(R, x, y, z, lerp(-0.006, 0.034, t) + (0.001 + 0.008 * t) * folds(th, y) + 0.0025 * (1 - smoothstep(hemY + 0.04, hemY + 0.046, y)));
        g = smin(g, Math.max(sk, y - (hipY - 0.04)), 0.06 * s);
      }
      return smax(g, hemY - y, 0.004);
    },
  };
}
/** Thin belt band sitting on another garment. */
function beltOn(garment, R, o) {
  const yB = o.y ?? R.spine.pos.y - 0.01, hw = o.h ?? 0.012;
  return { name: o.name || 'belt', mat: o.mat || 'trimDark', color: o.color || '#1d1715', charts: ['torso'], skirt: true, trim: true,
    sd(D, x, y, z) { return Math.max(garment.sd(D, x, y, z) - (o.t ?? 0.0045), Math.abs(y - yB) - hw); } };
}

// ================================================================================================
// Looks
// ================================================================================================
const LOOKS = {
  trench: { pose: 'contraR', finish: 'matte',
    layers: R => {
      const tr = trousers(R, { color: '#1b1b1f', wide: [0.105, 0.128] }); tr.tris = 2200;
      const kn = knitTop(R, { color: '#efe6d6', neck: 'roll' }); kn.tris = 1500;
      const co = coat(R, { name: 'trench', color: '#b88c5c', hem: R.leg.L.knee.y - 0.035, belt: true, cuffStrap: true, seed: 3, foldAmp: 0.036 }); co.tris = 4200;
      return { layers: [tr, kn, co], buttons: { coat: co, mat: 'trimDark', color: '#2a1d14', list: [[0.075, 0.075], [-0.051, 0.075], [0.075, -0.075], [-0.051, -0.075], [0.075, -0.17], [-0.051, -0.17]].map(([x, dy]) => [x, R.spine.pos.y - 0.012 + dy]) },
        buckle: { garment: co, y: R.spine.pos.y - 0.012, x: 0.012 } };
    } },
  slip: { pose: 'hipR', finish: 'pearl',
    layers: R => {
      const dr = slipDress(R, { color: '#521925' });
      const jk = croppedJacket(R, { color: '#1f1d20' });
      const btn = [];
      for (const sd of [1, -1]) for (const k of [0.045, 0.115, 0.185]) btn.push({ side: sd, dy: k });
      return { layers: [dr, jk], brassButtons: { garment: jk, list: btn } };
    } },
  street: { pose: 'walkM', finish: 'chrome', noFeet: true, shoes: true,
    layers: R => [cargos(R, { color: '#c4a57a' }), hoodie(R, { color: '#b7a3d4' })] },
  wrap: { pose: 'walkF', finish: 'walnut',
    layers: R => {
      const tr = trousers(R, { color: '#1b1b1f', wide: [0.1, 0.12] }); tr.tris = 1600;
      const kn = knitTop(R, { color: '#1c1c20', neck: 'roll' }); kn.tris = 1400;
      const co = coat(R, { name: 'coat', color: '#6a2228', hem: 0.3, belt: true, seed: 7, flare: [0.036, 0.075], lapel: [0.03, 0.085], lapelH: 0.006, collarR: 0.08, collarH: 0.05, foldAmp: 0.026 }); co.tris = 4200;
      return { layers: [tr, kn, co], knot: { garment: co, y: R.spine.pos.y - 0.012 } };
    } },
  suit: { pose: 'contraML', finish: 'matte', noFeet: true, shoes: true,
    layers: R => {
      const tr = trousers(R, { color: '#27384a', wide: [0.098, 0.105], hem: 0.03 }); tr.tris = 2400;
      const kn = knitTop(R, { color: '#e8dcc6', neck: 'crew', ease: 0.0075 }); kn.tris = 1200;
      const yV = R.spine.pos.y + 0.01;
      const co = coat(R, { name: 'blazer', color: '#2a3b4f', hem: R.pelvis.pos.y - 0.2, yV, yBelt: yV, ease: 0.017, cut: 0.9, flare: [0.024, 0.034], lapel: [0.035, 0.085], lapelH: 0.005, collarR: 0.074, collarH: 0.036, collarFlare: 0.12, foldAmp: 0.004, pockets: [-0.02], xOff: 0.018, vTop: 0.085, seed: 9 }); co.tris = 3600;
      return { layers: [tr, kn, co], buttons: { coat: co, mat: 'trimDark', color: '#1a1a1c', list: [[0.078, 0], [-0.042, 0], [0.078, -0.085], [-0.042, -0.085], [0.09, 0.1], [-0.054, 0.1]].map(([x, dy]) => [x, yV + dy]) } };
    } },
  knitdress: { pose: 'contraL', finish: 'pearl',
    layers: R => {
      const dr = knitDress(R, { color: '#c09a6b' });
      return { layers: [dr, beltOn(dr, R, { color: '#2a1a12' })] };
    } },
};

// ================================================================================================
// Bake one figure
// ================================================================================================
async function bakeFigure(id) {
  const t0 = Date.now();
  const look = LOOKS[id];
  const spec = POSES[look.pose]();
  const R = buildRig(spec);
  R.pelvisFwd = v3(0, 0, 1).applyQuaternion(R.pelvis.quat).setY(0).normalize();
  const parts = buildBody(R);
  const D = new Float64Array(NPARTS);
  const got = look.layers(R);
  const layers = Array.isArray(got) ? got : got.layers;
  const bodyPart = { name: 'body', mat: look.finish, color: '#ffffff', charts: 'body',
    sd: (D2, x, y, z) => bodyFrom(R, D2, x, y, z, { noFeet: look.noFeet }) };
  const all = argv.includes('--bodyonly') ? [bodyPart] : [bodyPart, ...layers];
  const outId = argv.includes('--bodyonly') ? id + '-nude' : id;
  // shared evaluation cache: D for the last point
  let lx = NaN, ly = NaN, lz = NaN;
  const evalD = (x, y, z) => { if (x !== lx || y !== ly || z !== lz) { evalParts(parts, D, x, y, z); lx = x; ly = y; lz = z; } return D; };
  const sdOf = p => (x, y, z) => p.sd(evalD(x, y, z), x, y, z);
  for (const p of all) p.f = sdOf(p);
  if (opt('probe') || opt('probefile')) {
    for (const pt of (opt('probe') || fs.readFileSync(opt('probefile'), 'utf8').trim()).split(';')) { const [x, y, z] = pt.split(',').map(Number); console.log(pt, all.map(p => p.name + '=' + p.f(x, y, z).toFixed(4)).join(' ')); }
    process.exit(0);
  }
  const union = (x, y, z) => { const d = evalD(x, y, z); let m = Infinity; for (const p of all) { const v = p.sd(d, x, y, z); if (v < m) m = v; } return m; };
  // bounds
  const bmin = [-0.55, -0.01, -0.55], bmax = [0.55, 1.95, 0.55];
  const meshes = [];
  for (const p of all) {
    const t1 = Date.now();
    let m = extract(p.f, bmin, bmax, p.trim ? H * 0.8 : H);
    const raw = m.indices.length / 3;
    refine(m, p.f, H);
    const others = all.filter(q => q !== p);
    m = cull(m, (x, y, z) => { const d = evalD(x, y, z); let mn = Infinity; for (const q of others) { const v = q.sd(d, x, y, z); if (v < mn) mn = v; } return mn; }, 0.0025);
    m = compact(m);
    const culled = m.indices.length / 3;
    if (!argv.includes('--nosimplify')) m = await simplify(m, p.tris || (p.trim ? 800 : p.name === 'body' ? 2000 : 3000), p.err || 0.002);
    // re-derive normals from the SDF after simplification (vertices are a subset → still exact)
    const g = [0, 0, 0];
    for (let i = 0; i < m.positions.length; i += 3) { gradient(p.f, m.positions[i], m.positions[i + 1], m.positions[i + 2], H * 0.35, g); m.normals[i] = g[0]; m.normals[i + 1] = g[1]; m.normals[i + 2] = g[2]; }
    m.part = p;
    meshes.push(m);
    console.log(`  ${id}/${p.name}: raw ${raw} → culled ${culled} → ${m.indices.length / 3} tris (${Date.now() - t1} ms, ${m.evals} evals)`);
  }
  // trims: buttons / buckles as analytic geometry on the garment surface
  const trims = argv.includes('--bodyonly') ? [] : buildTrims(R, got, evalD);
  // AO + UV charts
  for (const m of meshes) { bakeAO(m, union, R); m.uv = null; charts(m, R, parts, new Float64Array(NPARTS)); }
  for (const t of trims) meshes.push(t);
  // pivot = stand rod (into the calf of the standing leg)
  const rod = rodFor(R, look);
  const shoes = look.shoes ? shoeXforms(R) : [];
  await writeGLB(outId, meshes, rod, shoes, look, R);
  console.log(`${id}: ${meshes.reduce((a, m) => a + m.indices.length / 3, 0)} tris, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ------------------------------------------------------------------------------------------------
function bakeAO(m, union, R) {
  const p = m.positions, n = m.normals, cnt = p.length / 3;
  const ao = new Float32Array(cnt);
  const ds = [0.006, 0.013, 0.025, 0.045, 0.075];
  for (let i = 0; i < cnt; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
    let occ = 0, wsum = 0;
    for (let k = 0; k < ds.length; k++) {
      const d = ds[k], w = 1 / (1 + k * 0.6);
      const v = union(x + nx * d, y + ny * d, z + nz * d);
      occ += w * clamp((d - v) / d, 0, 1); wsum += w;
    }
    let a = 1 - 0.85 * occ / wsum;
    a *= lerp(0.55, 1, smoothstep(0.0, 0.16, y)) ;
    ao[i] = clamp(a, 0.18, 1);
  }
  m.ao = ao;
}

/** UV charts: cylindrical per body segment (v up the garment, u around, seam at the back). */
function charts(m, R, parts, D) {
  const L = R.leg, A = R.arm, ground = v3(R.pelvis.pos.x, 0, R.pelvis.pos.z);
  const fwd = R.pelvisFwd;
  const defs = {
    torso: { a: ground, b: R.neckBase, r: 0.14, idx: P.torso },
    neck: { a: R.neckBase, b: R.headJ.clone().add(v3(0, 0.2, 0)), r: 0.06, idx: P.neck },
    head: { a: R.headJ, b: R.headJ.clone().add(v3(0, 0.25, 0)), r: 0.08, idx: P.head },
    upL: { a: A.L.elbow, b: A.L.shoulder, r: 0.05, idx: P.upL }, foreL: { a: A.L.wrist, b: A.L.elbow, r: 0.04, idx: P.foreL },
    upR: { a: A.R.elbow, b: A.R.shoulder, r: 0.05, idx: P.upR }, foreR: { a: A.R.wrist, b: A.R.elbow, r: 0.04, idx: P.foreR },
    handL: { a: A.L.wrist.clone().add(A.L.hdir.clone().multiplyScalar(0.18)), b: A.L.wrist, r: 0.03, idx: P.handL },
    handR: { a: A.R.wrist.clone().add(A.R.hdir.clone().multiplyScalar(0.18)), b: A.R.wrist, r: 0.03, idx: P.handR },
    thighL: { a: L.L.knee, b: L.L.hip, r: 0.075, idx: P.thighL }, shinL: { a: L.L.ankle, b: L.L.knee, r: 0.05, idx: P.shinL },
    thighR: { a: L.R.knee, b: L.R.hip, r: 0.075, idx: P.thighR }, shinR: { a: L.R.ankle, b: L.R.knee, r: 0.05, idx: P.shinR },
    footL: { a: R.foot.L.toe, b: R.foot.L.heel, r: 0.04, idx: P.footL }, footR: { a: R.foot.R.toe, b: R.foot.R.heel, r: 0.04, idx: P.footR },
  };
  for (const d of Object.values(defs)) {
    d.dir = d.b.clone().sub(d.a).normalize();
    let f = fwd.clone().sub(d.dir.clone().multiplyScalar(fwd.dot(d.dir)));
    if (f.lengthSq() < 1e-4) f = v3(0, 0, 1).sub(d.dir.clone().multiplyScalar(d.dir.z));
    d.f = f.normalize(); d.s = new THREE.Vector3().crossVectors(d.dir, d.f).normalize();
    d.v0 = d.a.y;
  }
  const isBody = m.part.charts === 'body';
  const allowed = isBody ? Object.keys(defs) : m.part.charts;
  const p = m.positions, cnt = p.length / 3;
  const chartOf = new Int32Array(cnt), keys = allowed.map(k => defs[k]);
  const hipY = R.pelvis.pos.y;
  for (let i = 0; i < cnt; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    evalParts(parts, D, x, y, z);
    let best = 0, bd = Infinity;
    for (let k = 0; k < keys.length; k++) {
      let d = D[keys[k].idx];
      if (keys[k].idx === P.torso && m.part.skirt && y < hipY + 0.05) d -= 1; // skirts stay on the torso chart
      if (d < bd) { bd = d; best = k; }
    }
    chartOf[i] = best;
  }
  const uvOf = (k, i, ref) => {
    const c = keys[k]; const x = p[i * 3] - c.a.x, y = p[i * 3 + 1] - c.a.y, z = p[i * 3 + 2] - c.a.z;
    const t = x * c.dir.x + y * c.dir.y + z * c.dir.z;
    let th = Math.atan2(x * c.s.x + y * c.s.y + z * c.s.z, x * c.f.x + y * c.f.y + z * c.f.z);
    if (ref !== undefined) { while (th - ref > Math.PI) th -= 2 * Math.PI; while (th - ref < -Math.PI) th += 2 * Math.PI; }
    return [th * c.r, c.v0 + t, th];
  };
  // split vertices per (chart, wrap) so no triangle straddles a seam
  const newPos = [], newNrm = [], newAO = [], newUV = [], map = new Map();
  const ix = m.indices, out = new Uint32Array(ix.length);
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const ca = chartOf[a], cb = chartOf[b], cc = chartOf[c];
    const ch = cb === cc ? cb : ca;
    const ref = uvOf(ch, a)[2];
    for (let q = 0; q < 3; q++) {
      const vi = ix[t + q];
      const [u, v, th] = uvOf(ch, vi, ref);
      const wrap = Math.round((th - uvOf(ch, vi)[2]) / (2 * Math.PI));
      const key = vi * 64 + ch * 3 + (wrap + 1);
      let ni = map.get(key);
      if (ni === undefined) {
        ni = newPos.length / 3; map.set(key, ni);
        newPos.push(p[vi * 3], p[vi * 3 + 1], p[vi * 3 + 2]);
        newNrm.push(m.normals[vi * 3], m.normals[vi * 3 + 1], m.normals[vi * 3 + 2]);
        newAO.push(m.ao[vi]);
        if (isBody) newUV.push(v, u); else newUV.push(u, v);
      }
      out[t + q] = ni;
    }
  }
  m.positions = new Float32Array(newPos); m.normals = new Float32Array(newNrm); m.ao = new Float32Array(newAO); m.uv = new Float32Array(newUV); m.indices = out;
}

// ------------------------------------------------------------------------------------------------
// Trims: buttons, buckles, knots (analytic little meshes placed on the garment surface)
// ------------------------------------------------------------------------------------------------
function surfaceHit(garment, evalD, x0, y0, zStart, dirZ = -1) {
  // march along −z from the front until the garment surface
  let z = zStart;
  for (let i = 0; i < 400; i++) {
    const d = garment.sd(evalD(x0, y0, z), x0, y0, z);
    if (d < 0.0005) break;
    z += dirZ * Math.max(0.0008, d * 0.8);
  }
  const f = (x, y, zz) => garment.sd(evalD(x, y, zz), x, y, zz);
  const g = [0, 0, 0]; gradient(f, x0, y0, z, 0.002, g);
  return { p: v3(x0, y0, z), n: v3(...g) };
}
function lathePts(pts, seg) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function placeGeo(geo, p, n, spin = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n.clone().normalize());
  const m = new THREE.Matrix4().compose(p, q.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), spin)), v3(1, 1, 1));
  return geo.clone().applyMatrix4(m);
}
function geoToMesh(geos, part) {
  const pos = [], nrm = [], idx = [], uv = [];
  for (const g0 of geos) {
    const g = g0.index ? g0 : g0; const base = pos.length / 3;
    const P3 = g.attributes.position, N3 = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P3.count; i++) { pos.push(P3.getX(i), P3.getY(i), P3.getZ(i)); nrm.push(N3.getX(i), N3.getY(i), N3.getZ(i)); uv.push(U ? U.getX(i) * 0.05 : 0, U ? U.getY(i) * 0.05 : 0); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); else for (let i = 0; i < P3.count; i++) idx.push(base + i);
  }
  const m = { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint32Array(idx), uv: new Float32Array(uv), ao: new Float32Array(pos.length / 3).fill(0.9), part };
  return m;
}
function buildTrims(R, got, evalD) {
  const out = [];
  if (Array.isArray(got)) return out;
  const dark = [], brass = [];
  const button = (r, h) => { const g = lathePts([[0, 0], [r * 0.98, 0.0], [r, h * 0.35], [r * 0.9, h * 0.75], [r * 0.55, h], [0, h * 0.92]], 14); g.computeVertexNormals(); return g; };
  if (got.buttons) {
    const b = button(0.0105, 0.0045);
    for (const [x, y] of got.buttons.list) { const h = surfaceHit(got.buttons.coat, evalD, x + R.chest.pos.x, y, 0.45); dark.push(placeGeo(b, h.p.add(h.n.clone().multiplyScalar(-0.0008)), h.n)); }
  }
  if (got.buckle) {
    const h = surfaceHit(got.buckle.garment, evalD, got.buckle.x + R.chest.pos.x, got.buckle.y, 0.45);
    const ring = new THREE.TorusGeometry(0.024, 0.0045, 6, 18); ring.scale(1, 0.72, 0.6); ring.rotateX(Math.PI / 2); ring.computeVertexNormals();
    dark.push(placeGeo(ring, h.p.add(h.n.clone().multiplyScalar(0.003)), h.n));
    const prong = new THREE.CylinderGeometry(0.0022, 0.0022, 0.04, 6); prong.rotateZ(Math.PI / 2);
    dark.push(placeGeo(prong, h.p.add(h.n.clone().multiplyScalar(0.005)), h.n));
  }
  if (got.knot) {
    const h = surfaceHit(got.knot.garment, evalD, R.pelvis.pos.x + 0.1, got.knot.y, 0.45);
    const k = new THREE.SphereGeometry(0.024, 12, 8); k.scale(1.2, 0.8, 0.7);
    const tail = new THREE.CylinderGeometry(0.018, 0.016, 0.26, 10, 4); tail.scale(1, 1, 0.3); tail.translate(0, -0.14, 0);
    const knotGeos = [placeGeo(k, h.p.clone().add(h.n.clone().multiplyScalar(0.012)), h.n)];
    for (const [dx, a] of [[-0.012, 0.12], [0.014, -0.08]]) {
      const tq = tail.clone(); tq.rotateZ(a); tq.rotateY(Math.atan2(h.n.x, h.n.z));
      tq.translate(h.p.x + dx + h.n.x * 0.018, h.p.y - 0.01, h.p.z + h.n.z * 0.018);
      knotGeos.push(tq);
    }
    for (const g of knotGeos) g.computeVertexNormals();
    const coatP = got.knot.garment;
    const tm = geoToMesh(knotGeos, { name: 'knot', mat: coatP.mat, color: coatP.color, trim: true });
    out.push(tm);
  }
  if (got.brassButtons) {
    const b = button(0.0085, 0.004), jk = got.brassButtons.garment;
    for (const { side, dy } of got.brassButtons.list) {
      const y = jk.hemY + dy, x = side * (jk.gap(y) + 0.018);
      const lx = v3(x, 0, 0).applyQuaternion(R.chest.quat);
      const h = surfaceHit(jk, evalD, R.chest.pos.x + lx.x, y, 0.45);
      brass.push(placeGeo(b, h.p.add(h.n.clone().multiplyScalar(-0.0006)), h.n));
    }
  }
  if (dark.length) out.push(geoToMesh(dark, { name: 'trimDark', mat: 'trimDark', color: got.buttons ? got.buttons.color : '#1d1715', trim: true }));
  if (brass.length) out.push(geoToMesh(brass, { name: 'trimBrass', mat: 'trimBrass', color: '#ffffff', trim: true }));
  return out;
}

// ------------------------------------------------------------------------------------------------
function rodFor(R, look) {
  // standing leg = the one whose heel is lower / pitch 0
  const sp = R.spec;
  const side = (sp.feet.L.pitch || 0) <= (sp.feet.R.pitch || 0) ? 'L' : 'R';
  const L = R.leg[side];
  const yR = 0.27 * R.s;
  const c = [0, 0]; legCentreAt(R, side, yR, c);
  const back = R.pelvisFwd.clone().multiplyScalar(-1);
  const r = legRadiusAt(R, side, yR);
  return { x: c[0] + back.x * r * 0.55, z: c[1] + back.z * r * 0.55, top: yR + 0.02, side };
}
function shoeXforms(R) {
  const out = [];
  for (const side of ['L', 'R']) {
    const F = R.foot[side];
    const dir = F.dir.clone(), up = F.up.clone(), rt = new THREE.Vector3().crossVectors(dir, up).normalize();
    const m = new THREE.Matrix4().makeBasis(dir, up, rt);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const p = F.heel.clone().add(dir.clone().multiplyScalar(0.147 - 0.018)).add(up.clone().multiplyScalar(-0.001));
    out.push({ p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], mirror: side === 'L' });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
async function writeGLB(id, meshes, rod, shoes, look, R) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(id);
  const root = doc.createNode('figure');
  scene.addChild(root);
  const ox = rod.x, oz = rod.z;
  let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const pos = m.positions.slice();
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= ox; pos[i + 2] -= oz; for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], pos[i + k]); bb[k + 3] = Math.max(bb[k + 3], pos[i + k]); } }
    const col = new Uint8Array(pos.length / 3 * 4);
    for (let i = 0; i < pos.length / 3; i++) { col[i * 4] = Math.round(clamp(m.ao[i], 0, 1) * 255); col[i * 4 + 1] = 255; col[i * 4 + 2] = 255; col[i * 4 + 3] = 255; }
    const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc(pos, 'VEC3'))
      .setAttribute('NORMAL', acc(m.normals, 'VEC3'))
      .setAttribute('TEXCOORD_0', acc(m.uv, 'VEC2'))
      .setAttribute('COLOR_0', acc(col, 'VEC4').setNormalized(true))
      .setIndices(acc(pos.length / 3 < 65535 ? new Uint16Array(m.indices) : new Uint32Array(m.indices), 'SCALAR'));
    const mesh = doc.createMesh(m.part.name).addPrimitive(prim);
    const node = doc.createNode(m.part.name).setMesh(mesh).setExtras({ part: m.part.name, mat: m.part.mat, color: m.part.color });
    root.addChild(node);
  }
  root.setExtras({ id, rodTop: rod.top, rodSide: rod.side, finish: look.finish, bbox: bb.map(v => +v.toFixed(4)),
    shoes: shoes.map(s => ({ p: [s.p[0] - ox, s.p[1], s.p[2] - oz], q: s.q, mirror: s.mirror })),
    feet: ['L', 'R'].map(sd => { const F = R.foot[sd]; return [+(F.heel.x - ox).toFixed(3), +(F.heel.z - oz).toFixed(3), +(F.toe.x - ox).toFixed(3), +(F.toe.z - oz).toFixed(3)]; }) });
  await doc.transform(quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 10 }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const file = path.join(ROOT, 'assets/models', `mannequin-${id}.glb`);
  await io.write(file, doc);
  console.log(`  wrote ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

const ids = ONLY.length ? ONLY : Object.keys(LOOKS);
for (const id of ids) {
  if (!LOOKS[id]) { console.error('unknown figure', id); continue; }
  await bakeFigure(id);
}
