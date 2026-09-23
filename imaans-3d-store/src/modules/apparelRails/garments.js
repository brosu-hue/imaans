// =====================================================================================================
// garments.js — procedural garment, hanger and folded-stack geometry for the IMAANS store.
// Owner: apparelRails.  Other modules (apparelDisplay…) may IMPORT this file read-only.
//
// ── Garment frame (every generator uses it) ───────────────────────────────────────────────────────────
//   origin = centre of the RAIL the hanger hook sits on (the swing pivot). +y up. +x across the shoulders.
//   +z = the garment FRONT. The hanger neck sits at y = HANGER.neckY (−0.087); its arms end at x = ±0.215.
//   → a garment on a rail running along world z needs no rotation (its front faces +z);
//     a face-out garment on an arm pointing +x needs rotation.y = +π/2.
//
// ── API ────────────────────────────────────────────────────────────────────────────────────────────────
//   makeGarment(type, { variant = 0, seed = 1 }) → { geometry, info }
//       geometry : indexed BufferGeometry with position, normal, uv (METRE UVs, v = up the garment so the
//                  library fabrics' weave/rib/baffle directions are right) and `cav` (float 0..1 baked
//                  cavity / self-occlusion: fold valleys, under collars, sleeve/body contact, cuff openings).
//       info     : { type, variant, hanger:'wood'|'clip', halfW, halfT, top, bottom, tag:[x,y,z] (where a
//                  swing tag can hang), tris }
//   GARMENT_TYPES  : ['tee','shirt','sweater','hoodie','blazer','coat','dress','skirt','trousers','puffer']
//   GARMENT_VARIANTS[type] : variant names (index = variant). E.g. coat: ['overcoat','trench','car'].
//   makeHanger('wood'|'clip') → { body: geometry|null (wood), metal: geometry (hook, + bar/clips for clip) }
//   makeFolded({ w, h, d, seed }) → a folded-garment slab for shelves/tables (origin = bottom centre,
//       width along x, depth along z, v runs front-to-back so knit ribs read correctly on top).
//   prng(seed) → deterministic 0..1 generator (same algorithm as kit.rng).
//
// ── Technique ─────────────────────────────────────────────────────────────────────────────────────────
//   Everything is built from one primitive, `sweep`: a stack of closed "lens" cross-sections (flat front
//   and back faces meeting in a rounded side seam — an inflated 2-D silhouette) connected into a shell.
//   The body's top row has zero thickness so the fabric closes over the hanger along the shoulder line
//   (which follows the hanger's curve); sleeves drop from the shoulder tips with gravity and a slight bow;
//   drape folds are a seeded sum of slanted sinusoids applied to front+back together (so the garment
//   waves like cloth instead of thickening), fading in from the shoulders and deepening towards the hem;
//   hems flare and wave. Collars, plackets, lapels, pockets, cuffs, bands, belts, hoods and buttons are
//   separate thin shells draped on the body surface (`patch`) or around the neck (`neckRing`).
//   Winding is fixed automatically (signed volume), normals are smooth and welded across closed creases.
// =====================================================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HANGER = Object.freeze({ neckY: -0.087, tipX: 0.215, drop: 0.055, barY: -0.265, railR: 0.016, clipY: -0.1, clipX: 0.155 });
const TOP = -0.071;             // fabric crease line at the neck (≈5 mm above the hanger's top surface)
const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Lens thickness profile: 1 in the middle, 0 at the side seam (s = ±1). */
const prof = (s, ex) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(s)), ex)), 1 / ex);

/** Deterministic PRNG (mulberry32, identical to kit.rng). */
export function prng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------------------------------
// Cross-section loops
// -----------------------------------------------------------------------------------------------------
/**
 * Closed lens cross-section: front face (T > 0) s = −1 → 1, back face (T < 0) back again.
 * F = segments per face, ex = superellipse flatness (2 = ellipse, 4 = flat with round edges),
 * mix = 0 Chebyshev spacing (dense at the seams) … 1 uniform. `pair` = index of the opposite-face twin.
 */
export function lensLoop(F = 7, ex = 3, mix = 0.45) {
  const sj = j => lerp(-Math.cos(Math.PI * j / F), -1 + 2 * j / F, mix);
  const loop = [];
  for (let j = 0; j <= F; j++) { const s = sj(j); loop.push({ s, T: prof(s, ex), pair: j === 0 || j === F ? -1 : 2 * F - j }); }
  for (let j = F - 1; j >= 1; j--) { const s = sj(j); loop.push({ s, T: -prof(s, ex), pair: j }); }
  return loop;
}
/** Round loop of n points (rods, cords, buttons). */
function circleLoop(n) {
  const loop = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; loop.push({ s: Math.cos(a), T: Math.sin(a), pair: -1 }); }
  return loop;
}

// -----------------------------------------------------------------------------------------------------
// sweep — the one primitive. P(i, v, s, T, out) fills out.{x,y,z,u,v,c} for row i (v = 0..1 row param)
// and loop point (s, T). Options: capStart/capEnd (fan caps, capStartCav/capEndCav = cavity at the cap
// centre), ring (rows wrap around), closeStart/closeEnd (row has zero thickness → weld twin normals),
// bulge (cap centre pushed out along the tube axis).
// -----------------------------------------------------------------------------------------------------
function sweep(nRows, loop, P, o = {}) {
  const L = loop.length, ring = !!o.ring, R = ring ? nRows + 1 : nRows;
  const nCap = (o.capStart ? 1 : 0) + (o.capEnd ? 1 : 0);
  const N = R * L + nCap;
  const pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), cav = new Float32Array(N);
  const q = { x: 0, y: 0, z: 0, u: 0, v: 0, c: 1 };
  let p = 0;
  for (let i = 0; i < R; i++) {
    const ii = ring ? i % nRows : i;
    const v = ring ? i / nRows : nRows > 1 ? i / (nRows - 1) : 0;
    for (let k = 0; k < L; k++, p++) {
      q.c = 1; P(ii, v, loop[k].s, loop[k].T, q, k);
      pos[p * 3] = q.x; pos[p * 3 + 1] = q.y; pos[p * 3 + 2] = q.z;
      uv[p * 2] = q.u; uv[p * 2 + 1] = q.v; cav[p] = q.c;
    }
  }
  const idx = [];
  for (let i = 0; i < R - 1; i++) for (let k = 0; k < L; k++) {
    const a = i * L + k, b = i * L + (k + 1) % L, c = a + L, d = b + L;
    idx.push(a, b, c, b, d, c);
  }
  const rowC = i => {
    let x = 0, y = 0, z = 0, u = 0, w = 0, cc = 0;
    for (let k = 0; k < L; k++) { const j = i * L + k; x += pos[j * 3]; y += pos[j * 3 + 1]; z += pos[j * 3 + 2]; u += uv[j * 2]; w += uv[j * 2 + 1]; cc += cav[j]; }
    return [x / L, y / L, z / L, u / L, w / L, cc / L];
  };
  const cap = (row, nb, cc, start) => {
    const C0 = rowC(row), C1 = rowC(nb);
    let dx = C0[0] - C1[0], dy = C0[1] - C1[1], dz = C0[2] - C1[2];
    const dl = Math.hypot(dx, dy, dz) || 1, b = o.bulge || 0;
    pos[p * 3] = C0[0] + dx / dl * b; pos[p * 3 + 1] = C0[1] + dy / dl * b; pos[p * 3 + 2] = C0[2] + dz / dl * b;
    uv[p * 2] = C0[3]; uv[p * 2 + 1] = C0[4]; cav[p] = cc ?? C0[5];
    for (let k = 0; k < L; k++) {
      const a = row * L + k, bb = row * L + (k + 1) % L;
      if (start) idx.push(p, bb, a); else idx.push(p, a, bb);
    }
    p++;
  };
  if (o.capStart) cap(0, 1, o.capStartCav, true);
  if (o.capEnd) cap(R - 1, R - 2, o.capEndCav, false);
  // outward winding: signed volume about the centroid must be positive
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < N; j++) { cx += pos[j * 3]; cy += pos[j * 3 + 1]; cz += pos[j * 3 + 2]; }
  cx /= N; cy /= N; cz /= N;
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = pos[a] - cx, ay = pos[a + 1] - cy, az = pos[a + 2] - cz;
    const bx = pos[b] - cx, by = pos[b + 1] - cy, bz = pos[b + 2] - cz;
    const qx = pos[c] - cx, qy = pos[c + 1] - cy, qz = pos[c + 2] - cz;
    vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('cav', new THREE.BufferAttribute(cav, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal.array;
  const weld = (a, b) => {
    const x = nr[a * 3] + nr[b * 3], y = nr[a * 3 + 1] + nr[b * 3 + 1], z = nr[a * 3 + 2] + nr[b * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nr[a * 3] = nr[b * 3] = x / l; nr[a * 3 + 1] = nr[b * 3 + 1] = y / l; nr[a * 3 + 2] = nr[b * 3 + 2] = z / l;
  };
  if (ring) for (let k = 0; k < L; k++) weld(k, (R - 1) * L + k);
  const weldRow = row => { for (let k = 0; k < L; k++) if (loop[k].pair > k) weld(row * L + k, row * L + loop[k].pair); };
  if (o.closeStart) weldRow(0);
  if (o.closeEnd) weldRow(R - 1);
  return g;
}

// -----------------------------------------------------------------------------------------------------
// Drape helpers
// -----------------------------------------------------------------------------------------------------
/** Seeded vertical drape folds: sum of slanted sinusoids across x. Returns (x, y) → displacement. */
function foldField(rnd, { amp = 0.012, n = 3, lam = [0.13, 0.32], slant = 0.35 } = {}) {
  const waves = [];
  for (let k = 0; k < n; k++) {
    waves.push({ k: 2 * Math.PI / lerp(lam[0], lam[1], rnd()), ph: rnd() * 6.283, a: (0.6 + 0.4 * rnd()) / (1 + 0.45 * k), sl: (rnd() - 0.5) * slant });
  }
  const norm = Math.sqrt(waves.reduce((s, w) => s + w.a * w.a, 0)) || 1;
  const f = (x, y) => { let z = 0; for (const w of waves) z += w.a * Math.sin(w.k * (x + w.sl * y) + w.ph); return z * amp / norm; };
  f.amp = amp;
  return f;
}
/** Gentle hem undulation (y offset along x). */
function hemWaveFn(rnd, a) {
  const k1 = 9 + rnd() * 6, k2 = 21 + rnd() * 9, p1 = rnd() * 6.3, p2 = rnd() * 6.3;
  return x => a * (0.7 * Math.sin(k1 * x + p1) + 0.3 * Math.sin(k2 * x + p2));
}
/** Standard thickness ramp: 0 at the neck crease, tMid by rampEnd, → tHem, thin rolled hem edge. */
function thick(r, tMid, tHem = tMid, rampEnd = 0.055) {
  return Math.pow(smooth(0, rampEnd, r), 0.5) * lerp(tMid, tHem, smooth(0.15, 0.96, r)) * (1 - 0.72 * smooth(0.93, 1.0, r));
}
/** Puffer baffle bulge (1 mid-channel, ~0 at a stitch line), stitch lines at v ≡ 0 (mod pitch). */
function baffle(v, pitch = 0.12) { return Math.pow(Math.abs(Math.sin(Math.PI * v / pitch)), 0.55); }

// -----------------------------------------------------------------------------------------------------
// Body shell
// -----------------------------------------------------------------------------------------------------
/**
 * spec: len (neck → hem), w(r) half-width, t(r, y, s) half-thickness, top (crease y), tipX, drop (shoulder
 * slope at the tip), dropOut (slope beyond the tip), topY(x, T) (custom top edge, e.g. a slip bodice),
 * hem(s, T) (hem y offset, e.g. shirt tail), fold {amp,n,lam,slant}, foldW(r) (fold weight), hemWave,
 * cut(r, s) (front recess, e.g. the V inside lapels), zExtra(r, s, T) (pleats), cav(r, s, T), rows, F, ex, mix.
 * Returns { at(r, s, T, out, dw, dt), rsAt(x, y), geo, S, w, len }.
 */
function makeBody(spec, rnd) {
  const S = Object.assign({ F: 6, ex: 2.4, mix: 0.45, rows: 11, rowPow: 1.22, top: TOP, len: 0.7, tipX: HANGER.tipX, drop: 0.052,
    dropOut: 0.55, w: () => 0.25, t: r => thick(r, 0.014), fold: {}, hemWave: 0.006, hemCorner: 0.005, sideWave: 0.01 }, spec);
  const fold = foldField(rnd, S.fold);
  const swk = 11 + rnd() * 7, swp = rnd() * 6.3, swq = rnd() * 6.3;
  const hw = hemWaveFn(rnd, S.hemWave);
  const yEdge = (x, T = 0) => {
    if (S.topY) return S.topY(x, T);
    const a = Math.abs(x), k = Math.min(a / S.tipX, 1);
    return S.top - S.drop * Math.pow(k, 1.5) - Math.max(0, a - S.tipX) * S.dropOut;
  };
  const yHem = (x, s, T) => S.top - S.len + (S.hem ? S.hem(s, T) : 0) + hw(x) + S.hemCorner * Math.pow(Math.abs(s), 6);
  function at(r, s, T, o, dw = 0, dt = 0) {
    const w = S.w(r) + dw, x = s * w;
    const y = lerp(yEdge(x, T), yHem(x, s, T), r);
    const depth = smooth(0.03, 0.55, r) * (0.35 + 0.65 * r) * (S.foldW ? S.foldW(r) : 1);
    const f = fold(x, y) * depth;
    const tt = S.t(r, y, s) + (dt ? dt * Math.pow(smooth(0, 0.09, r), 0.55) : 0);
    let z = T * tt + f;
    let c = 1;
    if (S.cut && T > 0) { const k = S.cut(r, s); z -= k * T; c *= 1 - clamp(22 * k, 0, 0.45); }
    if (S.zExtra) z += S.zExtra(r, s, T);
    // side seams ripple a little (cloth never hangs ruler-straight)
    const sw = S.sideWave * depth * Math.pow(Math.abs(s), 4) * Math.sin(swk * y + (s > 0 ? swp : swq));
    o.x = x + f * 0.12 + Math.sign(s) * sw; o.y = y; o.z = z; o.u = x; o.v = y;
    if (Math.abs(T) > 0.25) c -= 0.32 * clamp(-f * Math.sign(T) / fold.amp, 0, 1) * depth;
    if (S.cav) c *= S.cav(r, s, T);
    o.c = c;
    return o;
  }
  const rsAt = (x, y) => {
    const y0 = yEdge(x), y1 = S.top - S.len;
    const r = clamp((y - y0) / (y1 - y0), 0, 1);
    return [r, clamp(x / S.w(r), -1, 1)];
  };
  // rows: two extra rows just under the crease (round shoulder profile), then a power distribution
  const RR = [0, 0.012, 0.032];
  const n2 = Math.max(3, S.rows - 2);
  for (let k = 1; k < n2; k++) RR.push(lerp(0.065, 1, Math.pow(k / (n2 - 1), S.rowPow)));
  const geo = sweep(RR.length, lensLoop(S.F, S.ex, S.mix), (i, v, s, T, o) => at(RR[i], s, T, o), { closeStart: true, capEnd: true, capEndCav: 0.55 });
  return { at, rsAt, geo, S, yEdge, surfZ: (r, s, side) => at(r, s, side * prof(s, S.ex), {}).z };
}

/** Band re-swept over the body between r0 and r1, inflated by dw/dt (rib hems, waistbands, belts). */
function bodyBand(B, r0, r1, dw, dt, { rows = 3, uScale = 1, cav = 1 } = {}) {
  return sweep(rows, lensLoop(B.S.F, B.S.ex, B.S.mix), (i, v, s, T, o) => {
    B.at(lerp(r0, r1, v), s, T, o, dw, dt);
    o.u *= uScale; o.c *= cav;
  }, {});
}

// -----------------------------------------------------------------------------------------------------
// Sleeves / legs
// -----------------------------------------------------------------------------------------------------
/**
 * Sleeve hanging from the shoulder tip. side = ±1. P: rootX, rootDy (below the shoulder line), angle (deg from
 * vertical, outward), len, bow (outward bulge), z (forward offset), hw(r), ht(r) (half width / thickness),
 * wrinkle, rows, F, ex, pitch (quilting: baffle pitch along the sleeve, 0 = none).
 * Returns { at, geo, end:[x,y,z] (cuff centre) }.
 */
function makeSleeve(B, side, P, rnd) {
  P = Object.assign({ rootX: 0.2, rootDy: -0.018, angle: 5, len: 0.6, bow: 0.02, z: 0.007, rows: 7, F: 3, ex: 2.2,
    hw: r => lerp(0.07, 0.05, r), ht: r => lerp(0.016, 0.011, r), wrinkle: 0.05, pitch: 0, slopeExtra: 0.12, cuffCav: 0.3 }, P);
  const x0 = side * P.rootX, y0 = B.yEdge(x0) + Math.min(P.rootDy, -0.006);
  // the sleeve's top crease is laid along the body's own shoulder line (+ a little droop) so it never pokes above it
  if (P.slope === undefined) P.slope = (B.yEdge(x0 - side * 0.012) - B.yEdge(x0 + side * 0.012)) / 0.024 + P.slopeExtra;
  const a = P.angle * DEG;
  const x1 = x0 + side * Math.sin(a) * P.len, y1 = y0 - Math.cos(a) * P.len;
  const mx = (x0 + x1) / 2 + side * P.bow, my = (y0 + y1) / 2;
  const ph = rnd() * 6.28, ph2 = rnd() * 6.28, zs = P.z + (rnd() - 0.5) * 0.004;
  const bez = r => [(1 - r) * (1 - r) * x0 + 2 * (1 - r) * r * mx + r * r * x1, (1 - r) * (1 - r) * y0 + 2 * (1 - r) * r * my + r * r * y1];
  const der = r => [2 * (1 - r) * (mx - x0) + 2 * r * (x1 - mx), 2 * (1 - r) * (my - y0) + 2 * r * (y1 - my)];
  const sl = Math.hypot(1, P.slope), sa = [side / sl, -P.slope / sl];
  const arcLen = r => { let l = 0, prev = bez(0); const n = 12; for (let k = 1; k <= n; k++) { const c = bez(r * k / n); l += Math.hypot(c[0] - prev[0], c[1] - prev[1]); prev = c; } return l; };
  function at(r, s, T, o, dw = 0, dt = 0) {
    const c = bez(r), d = der(r), dl = Math.hypot(d[0], d[1]) || 1;
    const pe = [side * (-d[1] / dl), side * (d[0] / dl)];
    const b = smooth(0, 0.3, r);
    let ax = lerp(sa[0], pe[0], b), ay = lerp(sa[1], pe[1], b); const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const vv = y0 - arcLen(r);
    let w = P.hw(r) * (1 + P.wrinkle * Math.sin(r * 23 + ph) * smooth(0.2, 1, r)) + dw;
    let t = P.ht(r) * Math.pow(smooth(0, 0.1, r), 0.55) * (1 + 0.6 * P.wrinkle * Math.sin(r * 31 + ph2)) + dt;
    if (P.pitch) { const bf = baffle(vv, P.pitch); t *= 0.6 + 0.4 * bf; w *= 0.96 + 0.04 * bf; }
    o.x = c[0] + ax * s * w; o.y = c[1] + ay * s * w;
    o.z = zs + T * t + 0.006 * Math.sin(r * 5 + ph) * r;
    o.u = s * w; o.v = vv;
    o.c = 1 - 0.3 * clamp(-s * side, 0, 1) * smooth(0.05, 0.3, r);
    return o;
  }
  const loop = lensLoop(P.F, P.ex, 0.35);
  const geo = sweep(P.rows, loop, (i, v, s, T, o) => at(v, s, T, o), { closeStart: true, capEnd: true, capEndCav: P.cuffCav });
  return { at, geo, end: [x1, y1, zs], P };
}
/** Band over the last part of a sleeve (cuffs). */
function sleeveBand(Sv, r0, r1, dw, dt, { rows = 3, uScale = 1, caps = false } = {}) {
  return sweep(rows, lensLoop(Sv.P.F, Sv.P.ex, 0.35), (i, v, s, T, o) => { Sv.at(lerp(r0, r1, v), s, T, o, dw, dt); o.u *= uScale; o.c = 1; },
    { capEnd: caps, capEndCav: 0.3 });
}
/** Straight vertical-ish tube (trouser legs). */
function makeLeg(P, rnd) {
  P = Object.assign({ x0: 0.1, x1: 0.1, y0: -0.3, y1: -1.1, z: 0, hw: r => 0.1, ht: r => 0.018, rows: 9, F: 4, ex: 2.4, crease: 0.005, fold: 0.006 }, P);
  const ph = rnd() * 6.28;
  const fz = foldField(rnd, { amp: P.fold, n: 2, lam: [0.2, 0.4] });
  function at(r, s, T, o, dw = 0, dt = 0) {
    const x = lerp(P.x0, P.x1, r), y = lerp(P.y0, P.y1, r);
    const w = P.hw(r) + dw, t = P.ht(r) * Math.pow(smooth(0, 0.08, r), 0.5) + dt;
    const cr = T > 0 ? P.crease * Math.max(0, 1 - Math.abs(s) * 3) * smooth(0.05, 0.3, r) : 0;
    o.x = x + s * w; o.y = y; o.z = P.z + T * t + cr + fz(x + s * w, y) * r + 0.004 * Math.sin(ph + r * 6) * r;
    o.u = o.x; o.v = y; o.c = 1;
    return o;
  }
  const geo = sweep(P.rows, lensLoop(P.F, P.ex, 0.4), (i, v, s, T, o) => at(v, s, T, o), { closeStart: true, capEnd: true, capEndCav: 0.35 });
  return { at, geo, P };
}

// -----------------------------------------------------------------------------------------------------
// Surface details
// -----------------------------------------------------------------------------------------------------
/**
 * Thin pillow draped on a surface (body or any object with at()/S). pts = [[r, s, halfWidthMetres], …]
 * along the patch's length; across: 's' (the width runs across the garment) or 'r' (the width runs down).
 * side ±1 (front/back). lift = gap above the surface at the patch edge, th = half thickness.
 */
function patch(B, pts, { side = 1, lift = 0.0012, th = 0.0022, F = 2, rows = 0, across = 's', caps = true, cav = null, capCav, seam = 0.78 } = {}) {
  const n = rows || pts.length;
  const samp = t => {
    const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u), lerp(pts[i][2], pts[i + 1][2], u)];
  };
  const len = B.S.len || 1;
  const tmp = {}, prm = [];
  const g = sweep(n, lensLoop(F, 3, 0.4), (i, v, s, T, o) => {
    const [r0, s0, hw] = samp(v);
    let r = r0, sb = s0;
    if (across === 's') sb = s0 + s * hw / B.S.w(r0); else r = r0 + s * hw / len;
    r = clamp(r, 0, 1);
    B.at(r, sb, side * prof(sb, B.S.ex), tmp);
    o.x = tmp.x; o.y = tmp.y; o.z = tmp.z + side * (lift + T * th);
    o.u = tmp.u; o.v = tmp.v; o.c = (cav ? cav(v, s, T) : 1) * (Math.abs(T) < 0.2 ? seam : 1);
    prm.push(r, sb);
  }, { capStart: caps, capEnd: caps, capStartCav: capCav, capEndCav: capCav });
  // shade like the fabric underneath: normals = surface normals (finite differences on B.at)
  const nr = g.attributes.normal.array, a = {}, b = {}, c = {}, e = 1e-3;
  const cnt = prm.length / 2;
  for (let j = 0; j < cnt; j++) {
    const r = prm[j * 2], sb = prm[j * 2 + 1];
    const sp = clamp(sb + e, -0.999, 0.999), sm = clamp(sb - e, -0.999, 0.999), rp = Math.min(1, r + e), rm = Math.max(0, r - e);
    B.at(r, sp, side * prof(sp, B.S.ex), a); B.at(r, sm, side * prof(sm, B.S.ex), b);
    const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
    B.at(rp, sb, side * prof(sb, B.S.ex), a); B.at(rm, sb, side * prof(sb, B.S.ex), c);
    const vx = a.x - c.x, vy = a.y - c.y, vz = a.z - c.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz * side < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    nr[j * 3] = nx / l; nr[j * 3 + 1] = ny / l; nr[j * 3 + 2] = nz / l;
  }
  for (let j = cnt; j < g.attributes.normal.count; j++) { nr[j * 3] = 0; nr[j * 3 + 1] = 0; nr[j * 3 + 2] = side; }
  return g;
}
/** Small domed buttons on a surface. list = [[r, s], …]. */
function buttons(B, list, rad = 0.0075, side = 1) {
  const loop = circleLoop(5), tmp = {};
  return list.map(([r, s]) => {
    B.at(r, s, side * prof(s, B.S.ex), tmp);
    const cx = tmp.x, cy = tmp.y, cz = tmp.z;
    const ring = [[rad * 0.55, 0.0032], [rad, 0.0018]];
    return sweep(2, loop, (i, v, ss, T, o) => {
      o.x = cx + ss * ring[i][0]; o.y = cy + T * ring[i][0]; o.z = cz + side * ring[i][1];
      o.u = o.x; o.v = o.y; o.c = i ? 0.85 : 1;
    }, { capStart: true });
  });
}
/**
 * Band around the neck opening that hugs the body (crew ribs, collar stands, fold-down collars, hood rims).
 * y = height at the back, rx = half-width, h = band half-height, th = half thickness, dipF/dipB = how much
 * lower the front/back runs, vneck = V instead of a round front, tilt = outward roll (deg), arc = [a0,a1]
 * (partial collar in degrees; 0 = centre back, 180 = centre front).
 */
function neckRing(B, { y = TOP - 0.012, rx = 0.074, h = 0.009, th = 0.004, dipF = 0.018, dipB = 0.003, vneck = 0, tilt = 0, rows = 10, F = 2, uScale = 1, gap = 0.001, arc = null, cav = 1 } = {}) {
  const loop = lensLoop(F, 3, 0.3), tmp = {};
  const tl = tilt * DEG, per = Math.PI * 2 * rx * 0.8;
  const partial = !!arc;
  return sweep(rows, loop, (i, v, s, T, o) => {
    const ang = partial ? lerp(arc[0], arc[1], v) * DEG : v * Math.PI * 2;
    const sz = -Math.cos(ang);                  // ang 0 → back centre (sz −1), 180° → front centre (sz +1)
    const x = rx * Math.sin(ang);
    const dip = sz > 0 ? (vneck ? vneck * Math.max(0, 1 - Math.abs(x) / rx) : dipF * sz * sz) : dipB * sz * sz;
    const yc = y - dip;
    const [r, sb] = B.rsAt(x, yc);
    const sideZ = sz >= 0 ? 1 : -1;
    B.at(r, sb, sideZ * prof(sb, B.S.ex), tmp);
    const wgt = Math.pow(Math.abs(sz), 0.6);
    const zc = (tmp.z + sideZ * (th + gap)) * wgt;
    let nx = Math.sin(ang) / rx, nz = sz / 0.03; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const ax = nx * Math.sin(tl), ay = Math.cos(tl), az = nz * Math.sin(tl);
    const tx = nx * Math.cos(tl), ty = -Math.sin(tl), tz = nz * Math.cos(tl);
    o.x = x + ax * s * h + tx * T * th; o.y = yc + ay * s * h + ty * T * th; o.z = zc + az * s * h + tz * T * th;
    o.u = v * per * uScale; o.v = s * h; o.c = cav;
  }, partial ? { capStart: true, capEnd: true } : { ring: true });
}
/** Free-form tube along a 3-D polyline (cords, straps, hooks, rods). pts = [[x,y,z]…], r = radius or fn(t). */
function rod(pts, r, { n = 4, rows = 0, caps = true, cav = 1, flat = 1, normal = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const N = rows || Math.max(2, pts.length);
  const P = [], Tg = [];
  for (let i = 0; i < N; i++) { const t = i / (N - 1); P.push(curve.getPointAt(t)); Tg.push(curve.getTangentAt(t)); }
  const len = curve.getLength();
  const up = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
  return sweep(N, circleLoop(n), (i, v, s, T, o) => {
    const t = Tg[i];
    up.set(...(normal || [0, 0, 1]));
    if (Math.abs(up.dot(t)) > 0.95) up.set(1, 0, 0);
    A.crossVectors(t, up).normalize(); B.crossVectors(A, t).normalize();
    const rr = typeof r === 'function' ? r(v) : r;
    o.x = P[i].x + (A.x * s * flat + B.x * T) * rr; o.y = P[i].y + (A.y * s * flat + B.y * T) * rr; o.z = P[i].z + (A.z * s * flat + B.z * T) * rr;
    o.u = s * rr; o.v = -v * len; o.c = cav;
  }, { capStart: caps, capEnd: caps });
}

// -----------------------------------------------------------------------------------------------------
// Shared garment pieces
// -----------------------------------------------------------------------------------------------------
const NECK_CAV = (r, s) => 1 - 0.3 * (1 - smooth(0.0, 0.06, r)) * (1 - smooth(0.15, 0.45, Math.abs(s)));
const UNDERARM = (r, s) => 1 - 0.28 * smooth(0.72, 1, Math.abs(s)) * smooth(0.02, 0.1, r) * (1 - smooth(0.45, 0.7, r));
/** V recess inside lapels, closing at rV. */
const vCut = (rV, s0, depth) => (r, s) => r >= rV ? 0 : depth * smooth(0, 0.08, Math.max(0, lerp(s0, 0.0, r / rV) - Math.abs(s)) * 4) * (1 - smooth(rV - 0.06, rV, r));
function lapels(B, { rV = 0.46, s0 = 0.26, wide = 0.05, peak = false, th = 0.005, offset = 0 } = {}) {
  const out = [];
  for (const sd of [1, -1]) {
    const o = offset * sd;
    const pts = [[0.012, sd * (s0 * 0.9) + o, 0.022], [0.07, sd * (s0 + 0.05) + o, wide * (peak ? 1.15 : 1)], [0.13, sd * (s0 * 0.88) + o, wide * 0.82],
      [0.28, sd * (s0 * 0.45) + o, wide * 0.55], [rV + 0.01, sd * 0.012 + o, 0.004]];
    out.push(patch(B, pts, { rows: 7, F: 3, th, lift: th * 0.9, capCav: 0.8, seam: 0.62 }));
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------
// Garment generators — each returns { parts:[geometry], hanger, tag:[x,y,z] }
// -----------------------------------------------------------------------------------------------------
const GEN = {};

GEN.tee = (variant, rnd) => {
  const boxy = variant === 1, vn = variant === 2;
  const W = boxy ? 0.29 : 0.262 + (rnd() - 0.5) * 0.01;
  const B = makeBody({
    len: boxy ? 0.62 : 0.7, rows: 11, F: 7, ex: 3.4,
    w: r => lerp(0.228, W, smooth(0, 0.12, r)) + 0.006 * smooth(0.6, 1, r),
    t: r => thick(r, 0.013, 0.012), fold: { amp: 0.021, n: 4, lam: [0.13, 0.34] }, cav: (r, s) => NECK_CAV(r, s), hemWave: 0.011, sideWave: 0.014,
  }, rnd);
  const P = { rootX: 0.2, rootDy: -0.008, angle: boxy ? 32 : 26, len: 0.18, bow: 0.004, z: 0.003, rows: 5, F: 3, ex: 3.0, hw: r => lerp(0.08, 0.072, r), ht: r => lerp(0.011, 0.01, r), wrinkle: 0.08, cuffCav: 0.5 };
  const sR = makeSleeve(B, 1, P, rnd), sL = makeSleeve(B, -1, P, rnd);
  const parts = [B.geo, sR.geo, sL.geo,
    neckRing(B, { y: TOP - 0.012, rx: vn ? 0.068 : 0.072, h: 0.008, th: 0.0035, dipF: 0.03, vneck: vn ? 0.09 : 0, rows: 8 }),
    bodyBand(B, 0.955, 1.0, 0.0015, 0.0018, { rows: 2 }),                                   // stitched hem
    sleeveBand(sR, 0.82, 1, 0.002, 0.0016, { rows: 2, caps: true }), sleeveBand(sL, 0.82, 1, 0.002, 0.0016, { rows: 2, caps: true })];
  return { parts, hanger: 'wood', tag: [sR.end[0], sR.end[1] - 0.01, sR.end[2]] };
};

GEN.shirt = (variant, rnd) => {
  const over = variant === 1, camp = variant === 2;
  const W = over ? 0.285 : 0.255;
  const B = makeBody({
    len: over ? 0.82 : 0.78, rows: 12, F: 6, ex: 3.4, drop: 0.05,
    w: r => lerp(0.228, W, smooth(0, 0.14, r)) - 0.008 * smooth(0.55, 0.95, r),
    t: r => thick(r, 0.012, 0.011), fold: { amp: 0.019, n: 4, lam: [0.13, 0.34] },
    hem: camp ? null : (s) => -0.05 * Math.pow(1 - s * s, 1.3) + 0.012,
    cav: (r, s) => NECK_CAV(r, s) * UNDERARM(r, s),
  }, rnd);
  const parts = [B.geo];
  let tag;
  if (camp) {
    const P = { rootX: 0.205, rootDy: -0.008, angle: 28, len: 0.2, rows: 5, ex: 3.0, hw: r => lerp(0.085, 0.078, r), ht: r => lerp(0.012, 0.01, r), wrinkle: 0.03, cuffCav: 0.45 };
    const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd); parts.push(a.geo, b.geo); tag = a.end;
    parts.push(neckRing(B, { y: TOP - 0.02, rx: 0.082, h: 0.024, th: 0.0025, tilt: 70, dipF: 0.05, vneck: 0.1, rows: 11, F: 2 }));
  } else {
    const P = { rootX: over ? 0.25 : 0.212, rootDy: over ? -0.035 : -0.016, angle: over ? 9 : 5, len: over ? 0.58 : 0.6, rows: 8, bow: 0.014,
      hw: r => lerp(0.072, 0.048, r), ht: r => lerp(0.013, 0.01, r), wrinkle: 0.06 };
    const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
    parts.push(a.geo, b.geo, sleeveBand(a, 0.9, 1, 0.004, 0.0035, { caps: true }), sleeveBand(b, 0.9, 1, 0.004, 0.0035, { caps: true }));
    tag = a.end;
    // collar stand + fold-down leaf + points
    parts.push(neckRing(B, { y: TOP - 0.004, rx: 0.068, h: 0.014, th: 0.0028, dipF: 0.014, rows: 8 }));
    parts.push(neckRing(B, { y: TOP - 0.02, rx: 0.078, h: 0.02, th: 0.0026, tilt: 62, dipF: 0.025, rows: 9 }));
    for (const sd of [1, -1]) parts.push(patch(B, [[0.02, sd * 0.05, 0.012], [0.06, sd * 0.14, 0.024], [0.105, sd * 0.24, 0.004]], { rows: 4, th: 0.0022, lift: 0.004, F: 2 }));
  }
  // placket + buttons + pocket
  const r0 = camp ? 0.14 : 0.07;
  parts.push(patch(B, [[r0, 0, 0.016], [0.985, 0, 0.016]], { rows: 3, th: 0.0018, lift: 0.0014 }));
  const bl = []; for (let r = r0 + 0.05; r < 0.93; r += 0.15) bl.push([r, 0]);
  parts.push(...buttons(B, bl, 0.0058));
  if (variant !== 1) parts.push(patch(B, [[0.2, -0.42, 0.055], [0.34, -0.42, 0.055]], { rows: 2, th: 0.0015, lift: 0.001, F: 2, cav: (v) => v < 0.1 ? 0.7 : 1 }));
  return { parts, hanger: 'wood', tag };
};

GEN.sweater = (variant, rnd) => {
  const roll = variant === 1, cardi = variant === 2;
  const W = 0.262 + (rnd() - 0.5) * 0.01;
  const B = makeBody({
    len: 0.66, rows: 11, F: 6, ex: 2.9, drop: 0.058, dropOut: 0.65,
    w: r => lerp(0.222, W - 0.012, smooth(0, 0.12, r)) + 0.008 * smooth(0.3, 0.8, r) - 0.03 * smooth(0.88, 0.95, r),
    t: r => thick(r, 0.024, 0.022), fold: { amp: 0.016, n: 3, lam: [0.16, 0.36] },
    cut: cardi ? vCut(0.5, 0.22, 0.006) : null,
    cav: (r, s) => NECK_CAV(r, s) * UNDERARM(r, s),
  }, rnd);
  const P = { rootX: 0.218, rootDy: -0.03, angle: 4, len: 0.56, rows: 8, bow: 0.012, hw: r => lerp(0.074, 0.05, r) - 0.01 * smooth(0.88, 0.93, r), ht: r => lerp(0.022, 0.016, r), wrinkle: 0.07 };
  const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
  const parts = [B.geo, a.geo, b.geo,
    bodyBand(B, 0.9, 1.0, 0.002, 0.003, { uScale: 1.7 }),
    sleeveBand(a, 0.88, 1, 0.003, 0.003, { uScale: 1.7, caps: true }), sleeveBand(b, 0.88, 1, 0.003, 0.003, { uScale: 1.7, caps: true })];
  if (roll) {
    parts.push(neckRing(B, { y: TOP + 0.012, rx: 0.075, h: 0.034, th: 0.014, dipF: 0.012, dipB: 0, rows: 10, F: 3, uScale: 1.3 }));
    parts.push(neckRing(B, { y: TOP - 0.026, rx: 0.088, h: 0.02, th: 0.012, tilt: 55, dipF: 0.016, rows: 16, F: 2, uScale: 1.3 }));
  } else if (cardi) {
    parts.push(neckRing(B, { y: TOP - 0.01, rx: 0.07, h: 0.011, th: 0.005, vneck: 0.26, rows: 11, uScale: 1.7 }));
    parts.push(patch(B, [[0.46, 0, 0.022], [0.985, 0, 0.022]], { rows: 3, th: 0.003, lift: 0.002 }));
    const bl = []; for (let r = 0.5; r < 0.93; r += 0.1) bl.push([r, 0]); parts.push(...buttons(B, bl, 0.007));
  } else {
    parts.push(neckRing(B, { y: TOP - 0.012, rx: 0.076, h: 0.013, th: 0.006, dipF: 0.03, rows: 16, uScale: 1.7 }));
  }
  return { parts, hanger: 'wood', tag: a.end };
};

GEN.hoodie = (variant, rnd) => {
  const zip = variant === 1;
  const B = makeBody({
    len: 0.68, rows: 11, F: 6, ex: 2.8, drop: 0.06, dropOut: 0.7,
    w: r => lerp(0.228, 0.258, smooth(0, 0.12, r)) - 0.025 * smooth(0.89, 0.95, r),
    t: r => thick(r, 0.026, 0.024), fold: { amp: 0.012, n: 3, lam: [0.16, 0.36] },
    cav: (r, s) => NECK_CAV(r, s) * UNDERARM(r, s),
  }, rnd);
  const P = { rootX: 0.222, rootDy: -0.035, angle: 5, len: 0.56, rows: 8, bow: 0.012, hw: r => lerp(0.078, 0.055, r) - 0.012 * smooth(0.87, 0.92, r), ht: r => lerp(0.024, 0.018, r), wrinkle: 0.08 };
  const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
  const parts = [B.geo, a.geo, b.geo, bodyBand(B, 0.9, 1, 0.002, 0.003, { uScale: 1.8 }),
    sleeveBand(a, 0.87, 1, 0.003, 0.003, { uScale: 1.8, caps: true }), sleeveBand(b, 0.87, 1, 0.003, 0.003, { uScale: 1.8, caps: true })];
  // hood lying down the back + its rim around the neck
  parts.push(patch(B, [[0.0, 0, 0.12], [0.07, 0, 0.165], [0.2, 0, 0.16], [0.33, 0, 0.1], [0.42, 0, 0.012]], { side: -1, rows: 6, F: 3, th: 0.011, lift: 0.009, caps: true, cav: (v, s, T) => 1 - 0.15 * (1 - v) }));
  parts.push(neckRing(B, { y: TOP + 0.004, rx: 0.1, h: 0.022, th: 0.012, vneck: 0.075, dipB: 0.0, rows: 11, F: 3, cav: 0.9 }));
  if (zip) {
    parts.push(patch(B, [[0.07, 0, 0.007], [0.985, 0, 0.007]], { rows: 2, th: 0.0022, lift: 0.0015 }));
    for (const sd of [1, -1]) parts.push(patch(B, [[0.64, sd * 0.3, 0.004], [0.8, sd * 0.42, 0.004]], { rows: 2, th: 0.0012, lift: 0.0006, cav: () => 0.55 }));
  } else {
    parts.push(patch(B, [[0.79, -0.56, 0.075], [0.79, 0.56, 0.075]], { across: 'r', rows: 3, th: 0.0032, lift: 0.0022, cav: (v, s) => s > 0.6 ? 0.8 : 1 }));
    for (const sd of [1, -1]) parts.push(rod([[sd * 0.032, TOP - 0.07, 0.03], [sd * 0.036, TOP - 0.17, 0.034], [sd * 0.034, TOP - 0.27, 0.03]], 0.0028, { n: 3, rows: 4 }));
  }
  return { parts, hanger: 'wood', tag: a.end };
};

GEN.blazer = (variant, rnd) => {
  const db = variant === 1, long = variant === 2;
  const B = makeBody({
    len: long ? 0.82 : 0.74, rows: 12, F: 6, ex: 3.2, drop: 0.028, dropOut: 0.35,
    w: r => lerp(0.238, 0.265, smooth(0, 0.1, r)) - 0.012 * smooth(0.35, 0.55, r) + 0.008 * smooth(0.7, 1, r),
    t: (r, y, s) => thick(r, 0.03, 0.024) * (1 + 0.18 * (1 - smooth(0.05, 0.35, r))),
    fold: { amp: 0.009, n: 3, lam: [0.18, 0.4] },
    hem: (s, T) => (T > 0 ? 0.03 * Math.max(0, 1 - Math.abs(s) / 0.3) : 0),
    cut: vCut(db ? 0.4 : 0.47, 0.25, 0.018),
    cav: (r, s, T) => NECK_CAV(r, s) * UNDERARM(r, s),
  }, rnd);
  const P = { rootX: 0.232, rootDy: -0.012, angle: 4, len: 0.6, rows: 9, bow: 0.008, hw: r => lerp(0.078, 0.056, r), ht: r => lerp(0.024, 0.02, r), wrinkle: 0.04 };
  const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
  const parts = [B.geo, a.geo, b.geo, ...lapels(B, { rV: db ? 0.41 : 0.47, s0: 0.26, wide: 0.05, peak: db, offset: db ? 0.06 : 0 })];
  parts.push(neckRing(B, { y: TOP - 0.006, rx: 0.075, h: 0.02, th: 0.0035, tilt: 58, arc: [-100, 100], rows: 10 }));
  for (const sd of [1, -1]) parts.push(patch(B, [[0.72, sd * 0.38, 0.026], [0.72, sd * 0.76, 0.026]], { across: 'r', rows: 2, th: 0.0022, lift: 0.0015, cav: (v, s) => s > 0.7 ? 0.7 : 1 }));
  parts.push(patch(B, [[0.3, -0.62, 0.012], [0.3, -0.35, 0.012]], { across: 'r', rows: 2, th: 0.0016, lift: 0.001 }));
  const bl = db ? [[0.44, 0.2], [0.44, -0.08], [0.58, 0.2], [0.58, -0.08], [0.3, 0.26], [0.3, -0.14]] : [[0.52, 0.03], [0.66, 0.03]];
  parts.push(...buttons(B, bl, 0.0095));
  return { parts, hanger: 'wood', tag: a.end };
};

GEN.coat = (variant, rnd) => {
  const trench = variant === 1, car = variant === 2;
  const L = car ? 0.86 : 1.06;
  const B = makeBody({
    len: L, rows: 13, F: 6, ex: 3.1, drop: 0.035, dropOut: 0.45,
    w: r => lerp(0.24, 0.272, smooth(0, 0.08, r)) - (trench ? 0.02 * smooth(0.25, 0.4, r) * (1 - smooth(0.42, 0.6, r)) : 0) + 0.05 * smooth(0.45, 1, r),
    t: (r, y, s) => thick(r, 0.032, 0.026),
    fold: { amp: trench ? 0.02 : 0.016, n: 4, lam: [0.14, 0.36] },
    cut: vCut(trench ? 0.28 : 0.36, 0.25, 0.018),
    hem: (s, T) => (T > 0 ? 0.015 * Math.max(0, 1 - Math.abs(s) / 0.25) : 0),
    cav: (r, s, T) => NECK_CAV(r, s) * UNDERARM(r, s),
  }, rnd);
  const P = { rootX: 0.228, rootDy: -0.02, angle: 4, len: 0.62, rows: 8, bow: 0.01, hw: r => lerp(0.082, 0.062, r), ht: r => lerp(0.026, 0.021, r), wrinkle: 0.05 };
  const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
  const parts = [B.geo, a.geo, b.geo, sleeveBand(a, 0.86, 1, 0.005, 0.003, { caps: true }), sleeveBand(b, 0.86, 1, 0.005, 0.003, { caps: true })];
  const rV = trench ? 0.28 : 0.36;
  parts.push(...lapels(B, { rV, s0: 0.28, wide: trench ? 0.06 : 0.055, th: 0.0055, offset: trench ? 0.07 : 0 }));
  parts.push(neckRing(B, { y: TOP - 0.004, rx: 0.08, h: trench ? 0.03 : 0.024, th: 0.004, tilt: 55, arc: [-105, 105], rows: 10 }));
  for (const sd of [1, -1]) parts.push(patch(B, [[0.56, sd * 0.42, 0.032], [0.56, sd * 0.8, 0.032]], { across: 'r', rows: 2, th: 0.0025, lift: 0.0015, cav: (v, s) => s > 0.7 ? 0.7 : 1 }));
  if (trench) {
    const bRow = 0.37;
    parts.push(bodyBand(B, bRow, bRow + 0.042, 0.006, 0.0055, { rows: 3 }));
    parts.push(patch(B, [[bRow + 0.02, 0.16, 0.022], [bRow + 0.02, 0.26, 0.022]], { across: 'r', rows: 2, th: 0.004, lift: 0.006 }));      // buckle
    parts.push(patch(B, [[bRow + 0.03, 0.24, 0.02], [bRow + 0.2, 0.3, 0.019], [bRow + 0.26, 0.29, 0.017]], { rows: 4, th: 0.0035, lift: 0.009 })); // belt tail
    parts.push(patch(B, [[0.06, -0.22, 0.07], [0.28, -0.3, 0.075]], { rows: 3, th: 0.0022, lift: 0.0016, F: 2 }));                           // gun flap
    parts.push(...buttons(B, [[0.14, 0.24], [0.14, -0.1], [0.25, 0.24], [0.25, -0.1], [0.52, 0.24], [0.52, -0.1], [0.66, 0.24], [0.66, -0.1]], 0.009));
    parts.push(sleeveBand(a, 0.82, 0.85, 0.009, 0.006), sleeveBand(b, 0.82, 0.85, 0.009, 0.006));
  } else {
    parts.push(...buttons(B, [[0.4, 0.03], [0.52, 0.03], [0.64, 0.03]], 0.011));
  }
  return { parts, hanger: 'wood', tag: a.end };
};

GEN.dress = (variant, rnd) => {
  if (variant === 0 || variant === 2 || variant === 3) { // slip (0) / long slip (2) / camisole (3)
    const top = -0.235, cami = variant === 3;
    const B = makeBody({
      top, len: variant === 2 ? 1.14 : cami ? 0.44 : 0.98, rows: cami ? 8 : 13, F: 7, ex: 3.2, rowPow: 1.1,
      topY: (x, T) => top - (T > 0 ? 0.06 * Math.max(0, 1 - Math.abs(x) / 0.12) : 0.012 * Math.max(0, 1 - Math.abs(x) / 0.15)),
      w: r => cami ? lerp(0.19, 0.205, smooth(0.1, 1, r)) : r < 0.2 ? lerp(0.19, 0.168, smooth(0, 0.2, r)) : lerp(0.168, variant === 2 ? 0.36 : 0.34, Math.pow(smooth(0.2, 1, r), 0.9)),
      t: r => thick(r, 0.012, 0.01, 0.06), fold: { amp: 0.024, n: 4, lam: [0.09, 0.24], slant: 0.25 }, foldW: r => 0.5 + 0.9 * r, hemWave: 0.012,
      tipX: 1, drop: 0,
    }, rnd);
    const parts = [B.geo];
    for (const sd of [1, -1]) {
      const zF = B.surfZ(0.005, sd * 0.47, 1), zB = B.surfZ(0.005, sd * 0.47, -1);
      parts.push(rod([[sd * 0.085, top - 0.006, zF + 0.001], [sd * 0.13, -0.16, 0.009], [sd * 0.155, -0.104, 0.0], [sd * 0.13, -0.16, -0.009], [sd * 0.085, top - 0.006, zB - 0.001]], 0.0032, { n: 4, rows: 9, flat: 1.8, caps: true }));
    }
    parts.push(patch(B, [[0.015, -0.9, 0.006], [0.015, 0.9, 0.006]], { across: 'r', rows: 7, th: 0.002, lift: 0.001 }));
    return { parts, hanger: 'wood', tag: [0.16, -0.12, 0] };
  }
  // midi with cap sleeves, waist seam and a full skirt
  const B = makeBody({
    len: 1.12, rows: 14, F: 7, ex: 3.2, rowPow: 1.1,
    w: r => r < 0.3 ? lerp(0.21, 0.168, smooth(0.08, 0.3, r)) : lerp(0.168, 0.34, Math.pow(smooth(0.3, 1, r), 0.8)),
    t: r => thick(r, 0.013, 0.011), fold: { amp: 0.026, n: 4, lam: [0.1, 0.26], slant: 0.2 }, foldW: r => 0.15 + 1.1 * smooth(0.28, 0.6, r), hemWave: 0.012,
    cav: (r, s) => NECK_CAV(r, s),
  }, rnd);
  const P = { rootX: 0.198, rootDy: -0.012, angle: 36, len: 0.09, rows: 4, bow: 0, z: 0.003, hw: r => lerp(0.074, 0.07, r), ht: r => 0.011, wrinkle: 0.02, cuffCav: 0.5 };
  const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
  const parts = [B.geo, a.geo, b.geo, bodyBand(B, 0.29, 0.315, 0.002, 0.0025, { rows: 2 }),
    neckRing(B, { y: TOP - 0.012, rx: 0.1, h: 0.006, th: 0.003, dipF: 0.04, rows: 10 })];
  return { parts, hanger: 'wood', tag: a.end };
};

GEN.skirt = (variant, rnd) => {
  const mini = variant === 1, top = -0.113;
  const NP = 9;
  const B = makeBody({
    top, len: mini ? 0.46 : 0.68, rows: mini ? 8 : 10, F: mini ? 8 : 2 * NP, mix: mini ? 0.45 : 1, rowPow: 1.05, tipX: 1, drop: 0, hemWave: 0.004,
    w: r => lerp(0.17, mini ? 0.27 : 0.31, Math.pow(smooth(0.03, 1, r), 0.85)),
    t: r => thick(r, 0.006, 0.005, 0.05),
    fold: { amp: mini ? 0.014 : 0.006, n: 3, lam: [0.12, 0.3] },
    zExtra: mini ? null : (r, s) => (0.0035 + 0.011 * r) * smooth(0.05, 0.22, r) * Math.cos(Math.PI * (s + 1) * NP),
    cav: mini ? null : (r, s, T) => 1 - 0.28 * smooth(0.05, 0.3, r) * Math.max(0, -Math.cos(Math.PI * (s + 1) * NP) * Math.sign(T)),
  }, rnd);
  const parts = [B.geo, bodyBand(B, 0.0, 0.06, 0.003, 0.004, { rows: 2 })];
  return { parts, hanger: 'clip', tag: [0.17, top - 0.02, 0.01] };
};

GEN.trousers = (variant, rnd) => {
  if (variant === 0) return jeansFolded(rnd);
  const wide = variant === 2, top = -0.113;
  const B = makeBody({ top, len: 0.3, rows: 5, F: 7, tipX: 1, drop: 0, hemWave: 0, w: r => lerp(0.19, 0.205, r), t: r => thick(r, 0.014, 0.016, 0.1), fold: { amp: 0.002, n: 1 }, rowPow: 1 }, rnd);
  const parts = [B.geo, bodyBand(B, 0.0, 0.14, 0.003, 0.0035, { rows: 2 })];
  const legLen = wide ? 0.98 : 1.0;
  for (const sd of [1, -1]) {
    const L = makeLeg({ x0: sd * 0.098, x1: sd * (wide ? 0.13 : 0.1), y0: top - 0.2, y1: top - 0.2 - legLen, hw: r => wide ? lerp(0.1, 0.145, r) : lerp(0.1, 0.085, r), ht: r => lerp(0.018, 0.012, r), crease: wide ? 0.002 : 0.005, fold: wide ? 0.014 : 0.005 }, rnd);
    parts.push(L.geo);
  }
  return { parts, hanger: 'clip', tag: [0.2, top - 0.03, 0.01] };
};

function jeansFolded(rnd) {
  const bar = HANGER.barY, R = 0.0125;
  const LA = 0.5 + (rnd() - 0.5) * 0.03, LB = 0.39 + (rnd() - 0.5) * 0.03;
  const arc = Math.PI * R, total = LA + arc + LB;
  const sp = (rnd() - 0.5) * 0.01;
  const path = d => {
    if (d < LA) { const e = LA - d; return { y: bar - e, z: R + 0.012 * (e / LA) ** 1.5 + sp * e, ny: 0, nz: 1 }; }
    if (d < LA + arc) { const th = (d - LA) / R; return { y: bar + R * Math.sin(th), z: R * Math.cos(th), ny: Math.sin(th), nz: Math.cos(th) }; }
    const e = d - LA - arc; return { y: bar - e, z: -R - 0.01 * (e / LB) ** 1.5, ny: 0, nz: -1 };
  };
  const hwAt = d => d < LA ? lerp(0.17, 0.12, smooth(0, 1, (d / LA) ** 0.8)) : d < LA + arc ? 0.12 : lerp(0.12, 0.098, (d - LA - arc) / LB);
  const fz = foldField(rnd, { amp: 0.005, n: 2, lam: [0.12, 0.3] });
  const surf = {
    S: { ex: 2.8, len: total, w: r => hwAt(r * total) },
    at(r, s, T, o, dw = 0, dt = 0) {
      const d = r * total, p = path(d), w = hwAt(d) + dw;
      const t = (d < LA ? lerp(0.0085, 0.0068, d / LA) : 0.0065) + dt;
      const f = fz(s * w, p.y) * (d < LA ? (LA - d) / LA : d > LA + arc ? (d - LA - arc) / LB : 0);
      o.x = s * w + f * 0.5; o.y = p.y + p.ny * (T * t + f); o.z = p.z + p.nz * (T * t + f);
      o.u = o.x; o.v = p.y; o.c = T < -0.3 ? 0.72 : 1;   // inner faces look at each other across the bar
      return o;
    },
  };
  const rowsD = [];
  for (let i = 0; i <= 6; i++) rowsD.push(LA * i / 6);
  for (let i = 1; i <= 4; i++) rowsD.push(LA + arc * i / 5);
  for (let i = 0; i <= 5; i++) rowsD.push(LA + arc + LB * i / 5);
  const loop = lensLoop(6, 2.8, 0.4);
  const parts = [sweep(rowsD.length, loop, (i, v, s, T, o) => surf.at(rowsD[i] / total, s, T, o), { capStart: true, capEnd: true, capStartCav: 0.5, capEndCav: 0.4 })];
  const band = (d0, d1, dw, dt, uS = 1) => sweep(2, loop, (i, v, s, T, o) => { surf.at(lerp(d0, d1, v) / total, s, T, o, dw, dt); o.u *= uS; }, { capStart: true, capEnd: true });
  parts.push(band(0, 0.04, 0.003, 0.0028));                                  // waistband
  parts.push(band(total - 0.045, total, 0.006, 0.004));                        // turn-up cuff
  for (const sd of [1, -1]) parts.push(patch(surf, [[0.07 / total, sd * 0.4, 0.06], [0.2 / total, sd * 0.4, 0.056]], { rows: 2, th: 0.0015, lift: 0.001, F: 2 }));
  return { parts, hanger: 'wood', tag: [0.12, bar - 0.2, 0.03] };
}

GEN.puffer = (variant, rnd) => {
  const long = variant === 1, gilet = variant === 2;
  const pitch = 0.12;
  const len = long ? 0.98 : 0.66;
  const B = makeBody({
    len, rows: Math.round(len / 0.04) + 2, rowPow: 1.0, F: 6, ex: 2.6, drop: 0.06, dropOut: 0.7,
    w: r => lerp(0.24, 0.272, smooth(0, 0.1, r)) + (long ? 0.02 * smooth(0.5, 1, r) : 0) - 0.02 * smooth(0.9, 1, r),
    t: (r, y) => thick(r, 0.05, 0.045, 0.1) * (0.62 + 0.38 * baffle(y, pitch)),
    fold: { amp: 0.006, n: 2, lam: [0.25, 0.45] },
    cav: (r, s, T) => NECK_CAV(r, s) * UNDERARM(r, s),
  }, rnd);
  const parts = [B.geo];
  let tag = [0.3, -0.5, 0];
  if (!gilet) {
    const P = { rootX: 0.232, rootDy: -0.05, angle: 5, len: 0.58, rows: 14, bow: 0.018, z: 0.01, F: 3, ex: 2.2, pitch, hw: r => lerp(0.088, 0.068, r), ht: r => lerp(0.042, 0.034, r), wrinkle: 0.02 };
    const a = makeSleeve(B, 1, P, rnd), b = makeSleeve(B, -1, P, rnd);
    parts.push(a.geo, b.geo, sleeveBand(a, 0.94, 1, 0.0, 0.002, { caps: true, uScale: 2 }), sleeveBand(b, 0.94, 1, 0.0, 0.002, { caps: true, uScale: 2 }));
    tag = a.end;
  }
  parts.push(neckRing(B, { y: TOP + 0.03, rx: 0.088, h: 0.042, th: 0.018, dipF: 0.006, dipB: 0, rows: 10, F: 3 }));
  parts.push(patch(B, [[0.03, 0, 0.006], [0.99, 0, 0.006]], { rows: 3, th: 0.003, lift: 0.004 }));
  return { parts, hanger: 'wood', tag };
};

export const GARMENT_TYPES = Object.keys(GEN);
export const GARMENT_VARIANTS = {
  tee: ['crew', 'boxy', 'v-neck'], shirt: ['classic', 'oversized', 'camp-collar'], sweater: ['crew', 'roll-neck', 'cardigan'],
  hoodie: ['pullover', 'zip'], blazer: ['single-breasted', 'double-breasted', 'long'], coat: ['overcoat', 'trench', 'car-coat'],
  dress: ['slip', 'midi', 'long-slip', 'camisole'], skirt: ['pleated-midi', 'a-line-mini'], trousers: ['jeans-folded', 'tailored', 'wide-leg'],
  puffer: ['short', 'long', 'gilet'],
};

/**
 * Natural hang: the lower garment twists a little about the hook axis, swings forward/back and leans
 * sideways (all ∝ depth²), so no two instances of a rail read as perfectly planar clones.
 */
function deform(g, rnd, { twist = 0.09, sway = 0.022, lean = 0.012 } = {}, bottom) {
  const tw = (rnd() - 0.5) * 2 * twist, sw = (rnd() - 0.5) * 2 * sway, ln = (rnd() - 0.5) * 2 * lean;
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  const H = Math.max(0.2, TOP - bottom);
  for (let i = 0; i < p.length; i += 3) {
    const e = clamp((TOP - p[i + 1]) / H, 0, 1.2), e2 = e * e;
    const th = tw * e2, c = Math.cos(th), sn = Math.sin(th);
    const x = p[i], z = p[i + 2];
    p[i] = x * c + z * sn + ln * e2; p[i + 2] = -x * sn + z * c + sw * e2;
    const nx = n[i], nz = n[i + 2];
    n[i] = nx * c + nz * sn; n[i + 2] = -nx * sn + nz * c;
    n[i + 1] += (2 * sw * e / H) * n[i + 2] + (2 * ln * e / H) * n[i];
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
}

/** Build one garment geometry. Deterministic for (type, variant, seed). */
export function makeGarment(type, { variant = 0, seed = 1 } = {}) {
  const gen = GEN[type];
  if (!gen) throw new Error('unknown garment type ' + type);
  const rnd = prng(seed * 7919 + variant * 104729 + type.length * 31);
  const { parts, hanger, tag, stiff } = gen(variant, rnd);
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geometry.computeBoundingBox();
  deform(geometry, rnd, stiff ? { twist: 0.03, sway: 0.008, lean: 0.004 } : {}, geometry.boundingBox.min.y);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const bb = geometry.boundingBox;
  const info = {
    type, variant, variantName: (GARMENT_VARIANTS[type] || [])[variant], hanger,
    halfW: Math.max(-bb.min.x, bb.max.x), halfT: Math.max(-bb.min.z, bb.max.z), top: bb.max.y, bottom: bb.min.y,
    tag, tris: geometry.index.count / 3,
  };
  return { geometry, info };
}

// -----------------------------------------------------------------------------------------------------
// Hangers
// -----------------------------------------------------------------------------------------------------
function hookGeo() {
  const pts = [[0, -0.079, 0], [0, -0.056, 0], [-0.006, -0.038, 0], [-0.018, -0.024, 0], [-0.0226, -0.004, 0],
    [-0.016, 0.0119, 0], [0, 0.0186, 0], [0.016, 0.0119, 0], [0.0226, -0.004, 0], [0.0205, -0.017, 0], [0.015, -0.024, 0]];
  return rod(pts, 0.0025, { n: 3, rows: 8, caps: true });
}
/**
 * 'wood': contoured suit hanger with a trouser bar → { body (wood), metal (brass hook) }.
 * 'clip': metal bar hanger with two clips → { body: null, metal }.
 */
export function makeHanger(kind = 'wood') {
  const hook = hookGeo();
  if (kind === 'clip') {
    const y = -0.085;
    const bar = rod([[-0.19, y, 0], [0.19, y, 0]], 0.0038, { n: 4, rows: 2 });
    const neck = rod([[0, -0.079, 0], [0, y, 0]], 0.004, { n: 4, rows: 2 });
    const clips = [];
    for (const sd of [1, -1]) {
      clips.push(sweep(2, lensLoop(2, 6, 0.5), (i, v, s, T, o) => {
        o.x = sd * HANGER.clipX + s * 0.014; o.y = y + 0.006 - v * 0.04; o.z = T * 0.0075; o.u = o.x; o.v = o.y; o.c = 1;
      }, { capStart: true, capEnd: true }));
    }
    const metal = mergeGeometries([hook, bar, neck, ...clips], false);
    return { body: null, metal };
  }
  const loop = lensLoop(2, 3.2, 0.5);
  const arms = sweep(11, loop, (i, v, s, T, o) => {
    const u = v * 2 - 1, x = u * HANGER.tipX;
    const y = HANGER.neckY - HANGER.drop * Math.pow(Math.abs(u), 1.5);
    const d = 1.5 * HANGER.drop * Math.sqrt(Math.abs(u)) * Math.sign(u) / HANGER.tipX;
    const dl = Math.hypot(1, d), nx = -d / dl, ny = 1 / dl;
    const hh = lerp(0.0105, 0.0085, Math.abs(u)), ht = lerp(0.0068, 0.0048, Math.abs(u));
    o.x = x + nx * s * hh; o.y = y + ny * s * hh; o.z = T * ht; o.u = x; o.v = o.y; o.c = 1;
  }, { capStart: true, capEnd: true });
  const tipY = HANGER.neckY - HANGER.drop;
  const parts = [arms];
  for (const sd of [1, -1]) parts.push(rod([[sd * 0.2, tipY + 0.004, 0], [sd * 0.188, HANGER.barY, 0]], 0.0042, { n: 4, rows: 2 }));
  parts.push(rod([[-0.19, HANGER.barY, 0], [0.19, HANGER.barY, 0]], 0.0058, { n: 4, rows: 2 }));
  const body = mergeGeometries(parts, false);
  return { body, metal: hook };
}

// -----------------------------------------------------------------------------------------------------
// Folded garment slab (shelves / tables)
// -----------------------------------------------------------------------------------------------------
/** Folded garment: w along x, h tall, d deep (z). Origin = bottom centre. Seeded sag / roll. */
export function makeFolded({ w = 0.3, h = 0.05, d = 0.26, seed = 1 } = {}) {
  const rnd = prng(seed * 131 + 7);
  const sag = 0.004 + rnd() * 0.004, roll = 0.004 + rnd() * 0.004;
  return sweep(5, lensLoop(4, 4.5, 0.5), (i, v, s, T, o) => {
    const x = (v - 0.5) * w, e = 1 - Math.pow(Math.abs(v - 0.5) * 2, 4);
    const hh = h / 2 * (0.82 + 0.18 * e) + (s > 0.6 ? roll * (s - 0.6) / 0.4 : 0);
    o.x = x; o.y = h / 2 + T * hh - sag * e * (T > 0 ? 1 : 0.2); o.z = s * d / 2 * (0.97 + 0.03 * e);
    o.u = x; o.v = o.z; o.c = Math.abs(T) < 0.3 && s < 0.5 ? 0.8 : 1;
  }, { capStart: true, capEnd: true });
}
