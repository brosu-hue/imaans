// apparelDisplay — SDF mannequin rig + primitives (Node-side, used by tools/apparelDisplay-bake.mjs).
// Owner: apparelDisplay.  Units: metres, y up, the figure faces +z, its LEFT is +x.
//
// A figure = a posed skeleton (FK torso chain + analytic 2-bone IK limbs) dressed in SDF primitives
// (oriented ellipsoids + round cones) that are smooth-unioned per body part. Garments reuse the same
// part distances (inflated, cut and folded) so every garment is an offset shell of the body.
import * as THREE from 'three';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function smin(a, b, k) {
  if (k <= 1e-6) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }
const DEG = Math.PI / 180;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------------
// Primitives (closures over precomputed constants; no allocation per evaluation)
// ------------------------------------------------------------------------------------------------
/** Oriented ellipsoid: centre c (Vector3), basis (Matrix4 rotation, columns = local axes), radii r. */
export function ellipsoid(c, basis, r) {
  const e = basis.elements; // column major: col0 = e[0..2], col1 = e[4..6], col2 = e[8..10]
  const ax = e[0], ay = e[1], az = e[2], bx = e[4], by = e[5], bz = e[6], cx_ = e[8], cy_ = e[9], cz_ = e[10];
  const ox = c.x, oy = c.y, oz = c.z, rx = r[0], ry = r[1], rz = r[2];
  const irx = 1 / rx, iry = 1 / ry, irz = 1 / rz, irx2 = irx * irx, iry2 = iry * iry, irz2 = irz * irz;
  const f = (x, y, z) => {
    const px = x - ox, py = y - oy, pz = z - oz;
    const lx = px * ax + py * ay + pz * az, ly = px * bx + py * by + pz * bz, lz = px * cx_ + py * cy_ + pz * cz_;
    const k0 = Math.sqrt(lx * lx * irx2 + ly * ly * iry2 + lz * lz * irz2);
    const k1 = Math.sqrt(lx * lx * irx2 * irx2 + ly * ly * iry2 * iry2 + lz * lz * irz2 * irz2);
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  };
  f.kind = 'ell'; f.c = c.clone(); f.r = r;
  return f;
}

/** Round cone (iq) between a (radius r1) and b (radius r2). */
export function roundCone(a, b, r1, r2) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const axx = a.x, ayy = a.y, azz = a.z;
  const f = (x, y, z) => {
    const pax = x - axx, pay = y - ayy, paz = z - azz;
    const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
  f.kind = 'cone'; f.a = a.clone(); f.b = b.clone(); f.r1 = r1; f.r2 = r2;
  return f;
}

/** Smooth union of a list of primitive closures. */
export function group(prims, k) {
  const n = prims.length;
  return (x, y, z) => { let d = prims[0](x, y, z); for (let i = 1; i < n; i++) d = smin(d, prims[i](x, y, z), k); return d; };
}

// ------------------------------------------------------------------------------------------------
// Rig
// ------------------------------------------------------------------------------------------------
const BODY = {
  // lengths below are multiplied by s (except ankleH / footL, absolute)
  f: { s: 1.0, shoulderX: 0.163, hipX: 0.088, thigh: 0.44, shin: 0.43, upper: 0.305, fore: 0.255, ankleH: 0.072, footL: 0.235 },
  m: { s: 1.034, shoulderX: 0.182, hipX: 0.089, thigh: 0.44, shin: 0.43, upper: 0.305, fore: 0.255, ankleH: 0.076, footL: 0.262 },
};

function euler(d) { return new THREE.Quaternion().setFromEuler(new THREE.Euler((d[0] || 0) * DEG, (d[1] || 0) * DEG, (d[2] || 0) * DEG, 'YXZ')); }
function frame(pos, quat) { const m = new THREE.Matrix4().compose(pos, quat, v3(1, 1, 1)); return { pos: pos.clone(), quat: quat.clone(), m }; }
function apply(fr, x, y, z) { return v3(x, y, z).applyMatrix4(fr.m); }
function dirOf(fr, x, y, z) { return v3(x, y, z).applyQuaternion(fr.quat).normalize(); }
/** Orthonormal basis (Matrix4) with local y along `yAxis` and local z as close as possible to `zHint`. */
export function basisY(yAxis, zHint) {
  const y = yAxis.clone().normalize();
  let z = zHint.clone().sub(y.clone().multiplyScalar(zHint.dot(y)));
  if (z.lengthSq() < 1e-8) z = Math.abs(y.x) < 0.9 ? v3(1, 0, 0) : v3(0, 0, 1);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}
/** Analytic 2-bone IK: root a, target t, lengths l1, l2, pole hint → joint position. Clamps reach. */
function ik(a, t, l1, l2, pole) {
  const at = t.clone().sub(a); let d = at.length();
  const dirv = at.clone().divideScalar(d || 1);
  d = clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().sub(dirv.clone().multiplyScalar(pole.dot(dirv))).normalize();
  const joint = a.clone().add(dirv.clone().multiplyScalar(x)).add(p.multiplyScalar(h));
  const end = a.clone().add(dirv.clone().multiplyScalar(d));
  return { joint, end };
}

/**
 * Pose spec (degrees, metres):
 *  body 'f'|'m', pelvis {pos:[x,y,z], rot:[x,y,z]}, spine, chest, neck, head: rot [x,y,z] (YXZ order)
 *  feet L/R: {heel:[x,z], yaw, pitch (heel raise, rotates about the toe), lift}
 *  hands L/R: {wrist:[x,y,z] (world), pole:[x,y,z], dir:[x,y,z] (hand pointing), palm:[x,y,z] (palm normal hint)}
 */
export function buildRig(spec) {
  const B = BODY[spec.body || 'f'], s = B.s;
  const R = { spec, B, s };
  // ---- feet first (they fix where the legs must reach)
  R.foot = {};
  for (const side of ['L', 'R']) {
    const f = spec.feet[side], sx = side === 'L' ? 1 : -1;
    const yaw = (f.yaw || 0) * DEG, pitch = (f.pitch || 0) * DEG;
    const fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
    const L = B.footL;
    // toe contact point on the ground; heel raised by pitch around it
    const heel0 = v3(f.heel[0], 0, f.heel[1]);
    const toe = heel0.clone().add(fwd.clone().multiplyScalar(L * 0.86));
    const dir = fwd.clone().multiplyScalar(Math.cos(pitch)).add(v3(0, -Math.sin(pitch), 0)).normalize(); // heel → toe
    const heel = toe.clone().sub(dir.clone().multiplyScalar(L * 0.86)).add(v3(0, f.lift || 0, 0));
    const up = v3(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y)).normalize();
    const ankle = heel.clone().add(dir.clone().multiplyScalar(0.05 * s)).add(up.clone().multiplyScalar(B.ankleH));
    R.foot[side] = { heel, toe, dir, up, ankle, fwd, sx };
  }
  // ---- torso chain (FK)
  const pr = spec.pelvis;
  const pelvisPos = v3(...pr.pos);
  // auto-lower the pelvis so both legs can reach their ankles (knees never hyper-extend)
  const pq = euler(pr.rot || []);
  for (let it = 0; it < 4; it++) {
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const hip = v3(sx * B.hipX * s, -0.068 * s, 0).applyQuaternion(pq).add(pelvisPos);
      const an = R.foot[side].ankle, reach = (B.thigh + B.shin) * s * (spec.feet[side].bend ? 0.985 : 0.998);
      const hz = Math.hypot(hip.x - an.x, hip.z - an.z);
      const maxY = an.y + Math.sqrt(Math.max(0, reach * reach - hz * hz));
      if (hip.y > maxY) pelvisPos.y -= hip.y - maxY;
    }
  }
  R.pelvis = frame(pelvisPos, pq);
  const chain = (parent, off, rot) => { const pos = apply(parent, ...off); const q = parent.quat.clone().multiply(euler(rot || [])); return frame(pos, q); };
  R.spine = chain(R.pelvis, [0, 0.12 * s, 0], spec.spine);
  R.chest = chain(R.spine, [0, 0.19 * s, 0], spec.chest);
  R.neck = chain(R.chest, [0, 0.19 * s, -0.012 * s], spec.neck);
  R.head = chain(R.neck, [0, 0.105 * s, 0.012 * s], spec.head);
  // ---- legs (IK)
  R.leg = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1, F = R.foot[side];
    const hip = apply(R.pelvis, sx * B.hipX * s, -0.068 * s, 0);
    const kneePole = F.fwd.clone().add(v3(sx * 0.12, 0, 0)).normalize();
    const { joint: knee, end: ankle } = ik(hip, F.ankle, B.thigh * s, B.shin * s, kneePole);
    R.leg[side] = { hip, knee, ankle, sx };
    F.ankle = ankle; // clamped
  }
  // ---- arms (IK)
  R.arm = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1, h = spec.hands[side];
    const shoulder = apply(R.chest, sx * B.shoulderX * s, 0.132 * s, -0.014 * s);
    const target = v3(...h.wrist);
    const pole = v3(...(h.pole || [sx * 0.3, 0, -1])).normalize();
    const { joint: elbow, end: wrist } = ik(shoulder, target, B.upper * s, B.fore * s, pole);
    const fore = wrist.clone().sub(elbow).normalize();
    const hdir = h.dir ? v3(...h.dir).normalize() : fore.clone();
    const palm = v3(...(h.palm || [-sx, 0, 0])).normalize();
    R.arm[side] = { shoulder, elbow, wrist, hdir, palm, sx, fore };
  }
  return R;
}

// ------------------------------------------------------------------------------------------------
// Body parts → primitive groups. Part indices (D[]):
// ------------------------------------------------------------------------------------------------
export const P = { torso: 0, neck: 1, head: 2, upL: 3, foreL: 4, handL: 5, upR: 6, foreR: 7, handR: 8, thighL: 9, shinL: 10, footL: 11, thighR: 12, shinR: 13, footR: 14 };
export const NPARTS = 15;

export function buildBody(R) {
  const { B, s } = R, male = R.spec.body === 'm';
  const E = (fr, c, r, basis) => ellipsoid(apply(fr, c[0] * s, c[1] * s, c[2] * s), basis || new THREE.Matrix4().makeRotationFromQuaternion(fr.quat), r.map(x => x * s));
  const parts = new Array(NPARTS);
  // torso: pelvis + waist + ribcage (+ bust / pecs) + shoulder girdle + scapulae
  const T = [];
  if (!male) {
    T.push(E(R.pelvis, [0, -0.012, -0.004], [0.156, 0.112, 0.1]));
    T.push(E(R.pelvis, [0.064, -0.05, -0.046], [0.074, 0.082, 0.068]), E(R.pelvis, [-0.064, -0.05, -0.046], [0.074, 0.082, 0.068]));
    T.push(E(R.pelvis, [0, 0.03, 0.028], [0.118, 0.08, 0.072]));
    T.push(E(R.spine, [0, 0.0, -0.004], [0.106, 0.1, 0.077]));
    T.push(E(R.chest, [0, 0.02, -0.012], [0.126, 0.158, 0.09]));
    T.push(E(R.chest, [0.056, -0.018, 0.056], [0.06, 0.056, 0.05]), E(R.chest, [-0.056, -0.018, 0.056], [0.06, 0.056, 0.05]));
    T.push(E(R.chest, [0, 0.116, -0.018], [0.138, 0.046, 0.062]));
    T.push(E(R.chest, [0, 0.07, -0.04], [0.125, 0.1, 0.058]));
  } else {
    T.push(E(R.pelvis, [0, -0.01, -0.004], [0.15, 0.11, 0.1]));
    T.push(E(R.pelvis, [0.06, -0.05, -0.044], [0.068, 0.078, 0.064]), E(R.pelvis, [-0.06, -0.05, -0.044], [0.068, 0.078, 0.064]));
    T.push(E(R.pelvis, [0, 0.035, 0.03], [0.12, 0.08, 0.072]));
    T.push(E(R.spine, [0, 0.0, -0.002], [0.13, 0.1, 0.088]));
    T.push(E(R.chest, [0, 0.02, -0.01], [0.148, 0.165, 0.1]));
    T.push(E(R.chest, [0.062, 0.035, 0.046], [0.068, 0.046, 0.03]), E(R.chest, [-0.062, 0.035, 0.046], [0.068, 0.046, 0.03]));
    T.push(E(R.chest, [0, 0.12, -0.018], [0.16, 0.052, 0.068]));
    T.push(E(R.chest, [0, 0.07, -0.045], [0.14, 0.11, 0.06]));
  }
  parts[P.torso] = group(T, 0.065 * s);
  const neckBase = apply(R.neck, 0, 0, 0), headJ = apply(R.head, 0, 0, 0);
  parts[P.neck] = roundCone(neckBase, apply(R.head, 0, 0.02 * s, 0), (male ? 0.056 : 0.049) * s, (male ? 0.05 : 0.043) * s);
  parts[P.head] = group([E(R.head, [0, 0.1, -0.006], [0.074, 0.098, 0.09]), E(R.head, [0, 0.052, 0.03], [0.058, 0.074, 0.062])], 0.05 * s);
  // arms
  for (const side of ['L', 'R']) {
    const A = R.arm[side], sx = A.sx;
    const up = A.elbow.clone().sub(A.shoulder).normalize();
    const delt = ellipsoid(A.shoulder.clone().add(up.clone().multiplyScalar(0.036 * s)), basisY(up, v3(0, 0, 1)), [(male ? 0.05 : 0.042) * s, (male ? 0.068 : 0.06) * s, (male ? 0.052 : 0.044) * s]);
    const upper = roundCone(A.shoulder, A.elbow, (male ? 0.047 : 0.04) * s, (male ? 0.037 : 0.031) * s);
    const fore = roundCone(A.elbow, A.wrist, (male ? 0.037 : 0.031) * s, (male ? 0.026 : 0.021) * s);
    parts[side === 'L' ? P.upL : P.upR] = group([delt, upper], 0.03 * s);
    parts[side === 'L' ? P.foreL : P.foreR] = fore;
    // hand: palm + fingers + thumb, in a frame with y = hand direction, z = palm normal
    const hb = basisY(A.hdir, A.palm);
    const hy = A.hdir.clone(), hz = v3().setFromMatrixColumn(hb, 2), hx = v3().setFromMatrixColumn(hb, 0);
    const at = (a, b, c) => A.wrist.clone().add(hx.clone().multiplyScalar(a * s)).add(hy.clone().multiplyScalar(b * s)).add(hz.clone().multiplyScalar(c * s));
    const hs = male ? 1.1 : 1;
    const palm = ellipsoid(at(0, 0.047 * hs, 0), hb, [0.041 * hs * s, 0.052 * hs * s, 0.0155 * hs * s]);
    const fingers = ellipsoid(at(0, 0.12 * hs, 0.005), hb, [0.037 * hs * s, 0.056 * hs * s, 0.0115 * hs * s]);
    const ts = -sx; // hand frame x = y × z: the thumb sits on +x for the right hand, −x for the left
    const thumb = roundCone(at(0.022 * ts, 0.02 * hs, 0.012), at(0.036 * ts, 0.085 * hs, 0.02), 0.0115 * hs * s, 0.0085 * hs * s);
    parts[side === 'L' ? P.handL : P.handR] = group([palm, fingers, thumb], 0.014 * s);
  }
  // legs
  for (const side of ['L', 'R']) {
    const L = R.leg[side], F = R.foot[side];
    const th = L.knee.clone().sub(L.hip).normalize(), sh = L.ankle.clone().sub(L.knee).normalize();
    const fwdK = F.fwd.clone();
    const thigh = roundCone(L.hip, L.knee, (male ? 0.08 : 0.074) * s, (male ? 0.05 : 0.045) * s);
    const knee = ellipsoid(L.knee.clone().add(fwdK.clone().multiplyScalar(0.006 * s)), basisY(th, fwdK), [0.04 * s, 0.046 * s, 0.038 * s]);
    const shin = roundCone(L.knee, L.ankle, (male ? 0.047 : 0.043) * s, (male ? 0.031 : 0.027) * s);
    const calf = ellipsoid(L.knee.clone().add(sh.clone().multiplyScalar(0.15 * s)).add(fwdK.clone().multiplyScalar(-0.01 * s)), basisY(sh, fwdK), [(male ? 0.045 : 0.04) * s, 0.13 * s, (male ? 0.047 : 0.042) * s]);
    parts[side === 'L' ? P.thighL : P.thighR] = group([thigh, knee], 0.04 * s);
    parts[side === 'L' ? P.shinL : P.shinR] = group([shin, calf], 0.06 * s);
    // foot: heel + arch + toe box, frame y = up, z = toe direction
    const fb = basisY(F.up, F.dir);
    const fz = F.dir.clone(), fy = F.up.clone();
    const at = (b, c) => F.heel.clone().add(fy.clone().multiplyScalar(b * s)).add(fz.clone().multiplyScalar(c * s));
    const heel = ellipsoid(at(0.034, 0.035), fb, [0.031 * s, 0.036 * s, 0.042 * s]);
    const arch = roundCone(at(0.058, 0.065), at(0.028, 0.175), 0.033 * s, 0.024 * s);
    const toe = ellipsoid(at(0.022, 0.19), fb, [0.037 * s, 0.021 * s, 0.045 * s]);
    parts[side === 'L' ? P.footL : P.footR] = group([heel, arch, toe], 0.03 * s);
  }
  R.parts = parts;
  R.neckBase = neckBase; R.headJ = headJ;
  return parts;
}

/** Fill D with every part distance at (x,y,z). */
export function evalParts(parts, D, x, y, z) { for (let i = 0; i < NPARTS; i++) D[i] = parts[i](x, y, z); }

/** Localised smooth-union weight: 1 near joint j, 0 beyond r1. */
export function wNear(x, y, z, j, r0, r1) { const d = Math.hypot(x - j.x, y - j.y, z - j.z); return 1 - smoothstep(r0, r1, d); }

/** Whole-body SDF from part distances. opts.noFeet: legs end at the ankle (shoes); opts.noHead. */
export function bodyFrom(R, D, x, y, z, opts = {}) {
  const s = R.s;
  let t = smin(D[P.torso], D[P.neck], 0.045 * s);
  if (!opts.noHead) t = smin(t, D[P.head], 0.03 * s);
  for (const side of ['L', 'R']) {
    const A = R.arm[side];
    const up = side === 'L' ? D[P.upL] : D[P.upR], fo = side === 'L' ? D[P.foreL] : D[P.foreR], ha = side === 'L' ? D[P.handL] : D[P.handR];
    const arm = smin(smin(up, fo, 0.014 * s), ha, 0.012 * s);
    t = smin(t, arm, 0.055 * s * wNear(x, y, z, A.shoulder, 0.06, 0.17));
  }
  for (const side of ['L', 'R']) {
    const L = R.leg[side];
    const th = side === 'L' ? D[P.thighL] : D[P.thighR], sh = side === 'L' ? D[P.shinL] : D[P.shinR], fo = side === 'L' ? D[P.footL] : D[P.footR];
    let leg = smin(th, sh, 0.022 * s);
    if (opts.noFeet) leg = Math.max(leg, -(y - (L.ankle.y + 0.02)));
    else leg = smin(leg, fo, 0.028 * s);
    t = smin(t, leg, 0.075 * s * wNear(x, y, z, L.hip, 0.1, 0.26));
  }
  return t;
}

// ------------------------------------------------------------------------------------------------
// Garment helpers
// ------------------------------------------------------------------------------------------------
/** Centre (x,z) of a leg's axis at height y (thigh above the knee, shin below). */
export function legCentreAt(R, side, y, out) {
  const L = R.leg[side];
  let a = L.hip, b = L.knee;
  if (y < L.knee.y) { a = L.knee; b = L.ankle; }
  const t = clamp((y - a.y) / (b.y - a.y || 1e-6), 0, 1.4);
  out[0] = a.x + (b.x - a.x) * t; out[1] = a.z + (b.z - a.z) * t;
  return out;
}
/** Leg radius (approx) at height y. */
export function legRadiusAt(R, side, y) {
  const L = R.leg[side], male = R.spec.body === 'm', s = R.s;
  if (y >= L.knee.y) return lerp((male ? 0.084 : 0.08) * s, (male ? 0.052 : 0.047) * s, clamp((L.hip.y - y) / (L.hip.y - L.knee.y), 0, 1));
  const t = clamp((L.knee.y - y) / (L.knee.y - L.ankle.y), 0, 1);
  return lerp((male ? 0.052 : 0.048) * s, (male ? 0.034 : 0.03) * s, t) + 0.012 * Math.sin(Math.PI * clamp(t * 1.3, 0, 1));
}
/** 2-D distance from (px,pz) to segment (ax,az)-(bx,bz). */
export function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
/** Signed distance to plane through point p0 with unit normal n (positive on the n side). */
export function plane(x, y, z, p0, n) { return (x - p0.x) * n.x + (y - p0.y) * n.y + (z - p0.z) * n.z; }
/** Seeded fold function around an axis: sum of sines in angle θ with phase drifting with y. */
export function foldFn(seed, terms) {
  let a = seed * 9301 + 49297;
  const rnd = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  const T = terms.map(([n, amp]) => ({ n, amp, ph: rnd() * Math.PI * 2, dr: (rnd() - 0.5) * 6 }));
  return (theta, y) => { let s = 0; for (const t of T) s += t.amp * (0.5 + 0.5 * Math.sin(t.n * theta + t.ph + t.dr * y)); return s; };
}
