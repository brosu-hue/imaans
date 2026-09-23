// footwear — procedural dress shoes lofted from a parametric "last".
//
// A shoe is a stack of vertical cross-sections along its length (t = 0 heel → 1 toe, local +x = toe,
// y up, floor at y = 0, symmetric about z = 0). Each section is a rounded U over the footbed:
//     z = b(t)·sgn(sinφ)|sinφ|^p(t),   y = s(t) + h(t)·|cosφ|^q(t),   φ ∈ [-π/2, π/2]
// b = half width, s = footbed height (top of sole), h = upper height above the footbed.
// The foot opening is cut where the upper would rise above the topline T(t): the covered range is
// |φ| ≥ acos((T/h)^(1/q)), so the opening edge is a clean grid column (no staircase). Open stations
// get a lining (inner offset shell) and a rolled rim. Soles / heels are extruded from the outline.
//
// Output attributes: position, normal, uv (metres), uv1 (brand atlas: prints / textiles, else the white
// block), color (rgb), aTint = tint + 2·surf: tint ∈ [0,1] (1 = takes the product colour, 0 = keeps its
// vertex colour: linings, soles, elastic, top-lifts), surf = surface class read by the shoe material's
// patch (SURF below: calf · patent · suede · gold metal · rubber · satin rubber · textile).
import * as THREE from 'three';
import { clamp01, smooth, lerp } from './util.js';
import { WHITE_UV, ruv } from './atlas.js';

export const SURF = { calf: 0, patent: 1, suede: 2, metal: 3, rubber: 4, gloss: 5, textile: 6 };

const HALF_PI = Math.PI / 2;

/** Monotone-ish cubic interpolation through [t, v] control points (Catmull-Rom, clamped ends). */
export function curve(pts) {
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0; while (t > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const u = (t - p1[0]) / (p2[0] - p1[0]);
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0]);
    const m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0]);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
}
/** Rounds the ends of a half-width curve: quarter-ellipse over the first rh and last rt of the length. */
export function rounded(bfn, rh = 0.11, rt = 0.16, tipPow = 1) {
  return (t) => {
    let k = 1;
    if (t < rh) { const a = 1 - t / rh; k *= Math.sqrt(Math.max(0, 1 - a * a)); }
    if (t > 1 - rt) { const a = (t - (1 - rt)) / rt; k *= Math.pow(Math.max(0, 1 - Math.pow(a, 2)), 0.5 * tipPow); }
    return Math.max(0.0012, bfn(t) * k);
  };
}

export class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.u1 = []; this.c = []; this.k = []; this.i = []; this.surf = 0; this.uv1Fn = null; }
  v(P, N, uv, col, tint) {
    this.p.push(P[0], P[1], P[2]); this.n.push(N[0], N[1], N[2]); this.uv.push(uv[0], uv[1]);
    this.c.push(col[0], col[1], col[2]);
    const t = col.length > 3 ? col[3] : tint, sf = col.length > 4 ? col[4] : this.surf;
    this.k.push(Math.min(1, Math.max(0, t)) + 2 * sf);
    const q = this.uv1Fn ? this.uv1Fn(P, uv) : WHITE_UV; this.u1.push(q[0], q[1]);
    return this.p.length / 3 - 1;
  }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  pos(i) { return [this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]]; }
  tri(a, b, c) { this.i.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.u1, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.k, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Station distribution: denser at heel, toe and around the vamp (opening front). */
function stations(n, vamp, breaks = []) {
  const base = stationsBase(n, vamp);
  if (!breaks.length) return base;
  const out = base.filter(t => breaks.every(b => Math.abs(t - b) > 0.006));
  for (const b of breaks) out.push(b - 1e-4, b + 1e-4);
  return out.sort((a, b) => a - b);
}
function stationsBase(n, vamp) {
  const M = 800, cum = [0];
  const dens = t => 1 + 2.6 * Math.exp(-(((t - vamp) / 0.045) ** 2)) + 2.2 * Math.exp(-((t / 0.07) ** 2)) + 1.6 * Math.exp(-(((1 - t) / 0.09) ** 2));
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + dens((i - 0.5) / M));
  const out = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = cum[M] * k / n;
    while (j < M && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.push(Math.min(1, (j + f) / M));
  }
  out[0] = 0; out[n] = 1;
  return out;
}

/** The virtual last as a parametric surface: P(t, φ) → point, N(t, φ) → outward normal. */
export function lastFns({ L, b, s, h, p, q }) {
  const X = t => -L / 2 + t * L;
  const P = (t, phi) => {
    t = Math.min(1, Math.max(0, t)); phi = Math.max(-HALF_PI, Math.min(HALF_PI, phi));
    const sp = Math.sin(phi), cp = Math.cos(phi);
    return [X(t), s(t) + h(t) * Math.pow(Math.abs(cp), q(t)), b(t) * Math.sign(sp) * Math.pow(Math.abs(sp), p(t))];
  };
  const N = (t, phi) => {
    const dt = 0.002, dp = 0.004;
    const Pt = sub(P(Math.min(1, t + dt), phi), P(Math.max(0, t - dt), phi));
    const Pp = sub(P(t, Math.min(HALF_PI, phi + dp)), P(t, Math.max(-HALF_PI, phi - dp)));
    let n = norm(cross(Pp, Pt));
    const c = P(t, phi), mid = [X(t), s(t) + h(t) * 0.45, 0];
    if ((c[0] - mid[0]) * n[0] + (c[1] - mid[1]) * n[1] + (c[2] - mid[2]) * n[2] < 0) n = [-n[0], -n[1], -n[2]];
    if (!isFinite(n[0])) n = [0, 1, 0];
    return n;
  };
  return { X, P, N };
}

/**
 * Build a shoe. spec: { L, b, s, h, p, q, T, th, vamp, NI, NJ, upper:[r,g,b], lining:[r,g,b], surf, print,
 *   decorate?(t, phi, yrel) → {col?, tint?, disp?, surf?}, sole:{ welt, bottom(t), col(y, part, t)→[rgb(,tint,surf)],
 *   tint, surf, rows, sideUv1 }, stiletto?, extras?(G, P, N, s, X) }
 */
export function buildShoe(spec) {
  const { L, b, s, h, p, q, T, th = 0.0025, vamp = 0.6 } = spec;
  // lite = far LOD: ~40% of the triangles, same silhouette and colour zones
  const NI = spec.lite ? Math.round((spec.NI || 30) * 0.5) : (spec.NI || 30), NJ = spec.lite ? Math.max(3, (spec.NJ || 7) - 2) : (spec.NJ || 7);
  if (spec.lite && spec.stiletto) { spec.stiletto.seg = 8; spec.stiletto.rings = 5; }
  if (spec.lite && spec.sole) spec.sole.bands = 1;
  const G = new Geo();
  const { X, P, N } = lastFns({ L, b, s, h, p, q });
  const phiOpen = (t) => {
    const top = T(t); if (!isFinite(top)) return 0;
    const r = Math.max(0, top) / h(t);
    return r >= 1 ? 0 : Math.acos(Math.pow(r, 1 / q(t)));
  };

  const ts = stations(NI, vamp, spec.breaks || []);
  const NS = ts.length - 1;
  const cols = 2 * NJ + 2;
  const phiOf = (t, c) => {
    const po = phiOpen(t);
    if (c <= NJ) return -(HALF_PI - (c / NJ) * (HALF_PI - po));
    return po + ((c - NJ - 1) / NJ) * (HALF_PI - po);
  };
  const upper = spec.upper || [1, 1, 1], lining = spec.lining || [0.8, 0.68, 0.55];
  const deco = spec.decorate || null;
  const SU = spec.surf || 0;
  // prints (snake / floral / weave): the upper's (x, arc) mapped into the atlas patch
  const printFn = spec.print ? (P0, uv) => ruv(spec.print, (uv[0] + L / 2) / L, 0.5 + uv[1] / 0.2) : null;

  // --- outer upper
  G.surf = SU; G.uv1Fn = printFn;
  const outer = [];
  for (let i = 0; i <= NS; i++) {
    const t = ts[i], row = [];
    for (let c = 0; c < cols; c++) {
      const phi = phiOf(t, c);
      let Pv = P(t, phi); const Nv = N(t, phi);
      let col = upper, tint = 1;
      G.surf = SU;
      if (deco) {
        const d = deco(t, phi, Pv[1] - s(t), Pv);
        if (d) {
          if (d.col) col = d.col; if (d.tint !== undefined) tint = d.tint; if (d.surf !== undefined) G.surf = d.surf;
          if (d.disp) Pv = [Pv[0] + Nv[0] * d.disp, Pv[1] + Nv[1] * d.disp, Pv[2] + Nv[2] * d.disp];
        }
      }
      const arc = (phi / HALF_PI) * (b(t) + h(t)) * 0.8;
      row.push(G.v(Pv, Nv, [Pv[0], arc], col, tint));
    }
    outer.push(row);
  }
  for (let i = 0; i < NS; i++) for (let c = 0; c < cols - 1; c++) {
    if (c === NJ) continue; // opening gap (zero width where closed)
    G.quad(outer[i][c], outer[i][c + 1], outer[i + 1][c + 1], outer[i + 1][c]);
  }

  // --- lining + rim where the upper is open
  G.surf = 0; G.uv1Fn = null;
  const open = ts.map(t => phiOpen(t) > 0.002);
  const need = open.map((o, i) => o || open[i - 1] || open[i + 1]);
  const inner = [];
  for (let i = 0; i <= NS; i++) {
    if (!need[i]) { inner.push(null); continue; }
    const t = ts[i], row = [];
    for (let c = 0; c < cols; c++) {
      const phi = phiOf(t, c);
      const Pv = P(t, phi), Nv = N(t, phi);
      const Pi = [Pv[0] - Nv[0] * th, Pv[1] - Nv[1] * th, Pv[2] - Nv[2] * th];
      if (Pi[2] * phi < 0) Pi[2] = 0; // near the heel point the two lining halves would cross
      const depth = clamp01((Pv[1] - s(t)) / Math.max(0.01, h(t)));
      const k = 0.55 + 0.45 * depth; // darker towards the footbed (cavity)
      row.push(G.v(Pi, [-Nv[0], -Nv[1], -Nv[2]], [Pv[0], phi * 0.05], [lining[0] * k, lining[1] * k, lining[2] * k], 0));
    }
    inner.push(row);
  }
  for (let i = 0; i < NS; i++) {
    if (!inner[i] || !inner[i + 1]) continue;
    for (let c = 0; c < cols - 1; c++) {
      if (c === NJ) continue;
      G.quad(inner[i][c], inner[i + 1][c], inner[i + 1][c + 1], inner[i][c + 1]);
    }
  }
  // rim: rolled edge joining outer and inner along both opening edges
  const rimCol = spec.rimCol || upper.map(x => x * 0.9);
  G.surf = spec.rimSurf ?? SU;
  for (const c of [NJ, NJ + 1]) {
    const rimO = [], rimI = [];
    for (let i = 0; i <= NS; i++) {
      if (!inner[i]) { rimO.push(-1); rimI.push(-1); continue; }
      const t = ts[i], phi = phiOf(t, c);
      const Pv = P(t, phi), Nv = N(t, phi);
      const dir = c === NJ ? 1 : -1; // towards the opening
      const tan = norm(sub(P(t, phi + dir * 0.02), P(t, phi)));
      const up = isFinite(tan[0]) ? tan : [0, 1, 0];
      rimO.push(G.v(Pv, up, [Pv[0], 0], rimCol, spec.rimTint ?? 1));
      const Pi = [Pv[0] - Nv[0] * th, Pv[1] - Nv[1] * th, Pv[2] - Nv[2] * th];
      if (Pi[2] * phi < 0) Pi[2] = 0;
      rimI.push(G.v(Pi, up, [Pv[0], th], rimCol, spec.rimTint ?? 1));
    }
    for (let i = 0; i < NS; i++) {
      if (rimO[i] < 0 || rimO[i + 1] < 0 || !(open[i] || open[i + 1])) continue;
      if (c === NJ) G.quad(rimO[i], rimI[i], rimI[i + 1], rimO[i + 1]);
      else G.quad(rimO[i], rimO[i + 1], rimI[i + 1], rimI[i]);
    }
  }

  // optional collar roll along the opening edge (faux-fur cuff): a tube through the outer rim points
  if (spec.collar) {
    const pts = [];
    const idx = []; for (let i = 0; i <= NS; i++) if (inner[i] && open[i]) idx.push(i);
    const edge = (i, c) => { const t = ts[i], phi = phiOf(t, c); const Pv = P(t, phi), Nv = N(t, phi); return new THREE.Vector3(Pv[0] - Nv[0] * th * 0.5, Pv[1], Pv[2] - Nv[2] * th * 0.5); };
    for (let k = idx.length - 1; k >= 0; k--) pts.push(edge(idx[k], NJ));
    for (let k = 0; k < idx.length; k++) pts.push(edge(idx[k], NJ + 1));
    if (pts.length > 3) {
      const cu = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const tg = new THREE.TubeGeometry(cu, spec.lite ? 24 : 48, spec.collar.r, spec.lite ? 5 : 7, true);
      const tp = tg.attributes.position, tn = tg.attributes.normal;
      const base = G.p.length / 3;
      G.surf = spec.collar.surf ?? 0;
      for (let v = 0; v < tp.count; v++) G.v([tp.getX(v), tp.getY(v), tp.getZ(v)], [tn.getX(v), tn.getY(v), tn.getZ(v)], [tp.getX(v), tp.getY(v)], spec.collar.col, spec.collar.tint ?? 0);
      const ti = tg.index.array; for (let v = 0; v < ti.length; v += 3) G.tri(base + ti[v], base + ti[v + 1], base + ti[v + 2]);
    }
  }

  // --- insole (visible through the opening)
  G.surf = 0;
  const insole = spec.insole || lining.map(x => x * 0.92);
  {
    const L0 = [], R0 = [];
    for (let i = 0; i <= NS; i++) {
      const t = ts[i], w = Math.max(0.001, b(t) - th * 1.2), y = s(t) + 0.0012;
      const dsdx = (s(Math.min(1, t + 0.01)) - s(Math.max(0, t - 0.01))) / (0.02 * L);
      const n = norm([-dsdx, 1, 0]);
      L0.push(G.v([X(t), y, -w], n, [X(t), -w], insole, 0));
      R0.push(G.v([X(t), y, w], n, [X(t), w], insole, 0));
    }
    for (let i = 0; i < NS; i++) G.quad(L0[i], R0[i], R0[i + 1], L0[i + 1]);
  }

  // --- sole slab (+ integrated block heel via sole.bottom(t))
  if (spec.sole) {
    G.surf = spec.sole.surf ?? 0;
    solid(G, ts, X, { w: t => b(t) + spec.sole.welt, top: s, bottom: spec.sole.bottom, col: spec.sole.col, tint: spec.sole.tint ?? 0, L,
      up: spec.sole.edgeUp ?? 0.0006, bands: spec.sole.bands ?? 3, rows: spec.lite ? 0 : spec.sole.rows || 0, sideUv1: spec.sole.sideUv1 });
  }
  // --- stiletto heel
  if (spec.stiletto) { G.surf = spec.stiletto.surf ?? SU; stiletto(G, spec.stiletto, L); }
  G.surf = SU;
  if (spec.extras) spec.extras(G, P, N, s, X, !!spec.lite);

  const geo = G.build();
  geo.userData.P = P; geo.userData.N = N; geo.userData.L = L;
  return geo;
}

/**
 * Extruded solid between top(t) and bottom(t) over the outline half-width w(t). col(y, part, t) → [r,g,b(,tint,surf)].
 * rows > 0 adds that many horizontal rows to the side walls (for striped / printed sides); sideUv1(x, y, z) maps
 * the side walls into the atlas (jute braid).
 */
function solid(G, ts, X, o) {
  const { w, top, bottom, col: colFn, tint, L, up, bands = 3, rows = 0, sideUv1 = null } = o;
  const NI = ts.length - 1;
  const d = (f, t) => (f(Math.min(1, t + 0.01)) - f(Math.max(0, t - 0.01))) / (0.02 * L);
  const Lt = [], Rt = [], Lb = [], Rb = [];
  for (let i = 0; i <= NI; i++) {
    const t = ts[i], x = X(t), ww = w(t), yt = top(t) + up, yb = bottom(t);
    const nt = norm([-d(top, t), 1, 0]), nb = norm([d(bottom, t), -1, 0]);
    Lt.push(G.v([x, yt, -ww], nt, [x, -ww], colFn(yt, 'top', t), tint)); Rt.push(G.v([x, yt, ww], nt, [x, ww], colFn(yt, 'top', t), tint));
    Lb.push(G.v([x, yb, -ww], nb, [x, -ww], colFn(yb, 'bottom', t), tint)); Rb.push(G.v([x, yb, ww], nb, [x, ww], colFn(yb, 'bottom', t), tint));
  }
  for (let i = 0; i < NI; i++) { G.quad(Lt[i], Rt[i], Rt[i + 1], Lt[i + 1]); G.quad(Lb[i], Lb[i + 1], Rb[i + 1], Rb[i]); }
  // end caps (heel back, toe tip) so the slab is closed even where the outline keeps some width
  for (const [i, dir] of [[0, -1], [NI, 1]]) {
    const n = [dir, 0, 0];
    const a = G.v(G.pos(Lt[i]), n, [0, 0], colFn(top(ts[i]), 'edge', ts[i]), tint), bq = G.v(G.pos(Rt[i]), n, [1, 0], colFn(top(ts[i]), 'edge', ts[i]), tint);
    const c = G.v(G.pos(Rb[i]), n, [1, 1], colFn(bottom(ts[i]), 'lift', ts[i]), tint), e = G.v(G.pos(Lb[i]), n, [0, 1], colFn(bottom(ts[i]), 'lift', ts[i]), tint);
    if (dir > 0) G.quad(a, bq, c, e); else G.quad(a, e, c, bq);
  }
  // side walls: 3 bands (top-lift line / edge) or `rows` even rows (prints)
  const prevUv1 = G.uv1Fn;
  for (const sg of [-1, 1]) {
    const grid = [];
    for (let i = 0; i <= NI; i++) {
      const t = ts[i], x = X(t), ww = w(t), yt = top(t) + up, yb = bottom(t);
      const dw = d(w, t); const n = norm([-dw, 0, sg]);
      let ys;
      if (rows > 0) { ys = []; for (let k = 0; k <= rows; k++) ys.push(yb + (yt - yb) * k / rows); }
      else ys = bands === 3 ? [yb, Math.min(yt, yb + 0.004), Math.min(yt, yb + 0.0045), yt] : [yb, yt];
      grid.push(ys.map((y, k) => {
        G.uv1Fn = sideUv1 ? () => sideUv1(x, y, sg * ww, yt, yb) : prevUv1;
        return G.v([x, y, sg * ww], n, [x, y], colFn(y, rows === 0 && bands === 3 && (k === 0 || k === 1) ? 'lift' : 'edge', t), tint);
      }));
    }
    const nb = grid[0].length - 1;
    for (let i = 0; i < NI; i++) for (let k = 0; k < nb; k++) {
      if (sg > 0) G.quad(grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]);
      else G.quad(grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]);
    }
  }
  G.uv1Fn = prevUv1;
}

/** Tapered, slightly curved stiletto column from the heel seat down to a fine top-lift. */
function stiletto(G, o, L) {
  const { x0 = -L / 2 + 0.022, top, rx0 = 0.02, rz0 = 0.017, r1 = 0.0048, drift = 0.012, col, liftCol, seg = 14, rings = 9 } = o;
  const sf = G.surf;
  const ringsIdx = [];
  for (let k = 0; k <= rings; k++) {
    const u = k / rings, y = top * (1 - u);
    const f = Math.pow(u, 0.62);
    const rx = lerp(rx0, r1, f), rz = lerp(rz0, r1, f), cx = x0 + drift * Math.pow(u, 1.6);
    const lift = y < 0.007;
    G.surf = lift ? SURF.rubber : sf;
    const ring = [];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      ring.push(G.v([cx + rx * ca, y, rz * sa], norm([ca / rx, 0.12, sa / rz]), [a * 0.02, y], lift ? liftCol : col, lift ? 0 : 1));
    }
    ringsIdx.push(ring);
    if (k === rings - 1) { // extra ring at the top-lift line for a crisp colour change
      const y2 = 0.0065, u2 = 1 - y2 / top, f2 = Math.pow(u2, 0.62);
      const rx2 = lerp(rx0, r1, f2), rz2 = lerp(rz0, r1, f2), cx2 = x0 + drift * Math.pow(u2, 1.6);
      for (const cc of [col, liftCol]) {
        G.surf = cc === liftCol ? SURF.rubber : sf;
        const r2 = [];
        for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2; r2.push(G.v([cx2 + rx2 * Math.cos(a), y2, rz2 * Math.sin(a)], norm([Math.cos(a) / rx2, 0.1, Math.sin(a) / rz2]), [a * 0.02, y2], cc, cc === liftCol ? 0 : 1)); }
        ringsIdx.push(r2);
      }
    }
  }
  // connect sequential rings, skipping the zero-height colour split pair
  for (let k = 0; k < ringsIdx.length - 1; k++) {
    if (k === rings) continue; // between the two coincident split rings
    const A = ringsIdx[k], B = ringsIdx[k + 1];
    for (let j = 0; j < seg; j++) G.quad(A[j], A[j + 1], B[j + 1], B[j]);
  }
  // tip cap
  G.surf = SURF.rubber;
  const last = ringsIdx[ringsIdx.length - 1];
  const c = G.v([x0 + drift, 0, 0], [0, -1, 0], [0, 0], liftCol, 0);
  for (let j = 0; j < seg; j++) G.tri(last[j + 1], last[j], c);
  G.surf = sf;
}

/** Leather pull loop standing up at the back of a boot shaft. */
function pullTab(G, xBack, yTop, col) {
  const w = 0.0105, t = 0.0028, y0 = yTop - 0.028, y1 = yTop + 0.021, x0 = xBack - 0.0012, lean = 0.006;
  const faces = [
    [[x0, y0, -w], [x0, y0, w], [x0 - lean, y1, w], [x0 - lean, y1, -w], [1, 0.15, 0]],
    [[x0 - t, y0, w], [x0 - t, y0, -w], [x0 - t - lean, y1, -w], [x0 - t - lean, y1, w], [-1, -0.1, 0]],
    [[x0 - lean, y1, -w], [x0 - lean, y1, w], [x0 - t - lean, y1, w], [x0 - t - lean, y1, -w], [0, 1, 0]],
    [[x0, y0, w], [x0 - t, y0, w], [x0 - t - lean, y1, w], [x0 - lean, y1, w], [0, 0, 1]],
    [[x0 - t, y0, -w], [x0, y0, -w], [x0 - lean, y1, -w], [x0 - t - lean, y1, -w], [0, 0, -1]],
  ];
  for (const [a, b, c, d, n] of faces) {
    const nn = norm(n);
    const ids = [a, b, c, d].map(P => G.v(P, nn, [P[2], P[1]], col, 1));
    G.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

// ------------------------------------------------------------------------------------------------
// Part builders (straps, rings, shafts, boxes, bows, laces) — all write into a Geo
// ------------------------------------------------------------------------------------------------
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Oriented box: centre c, orthonormal right-handed axes [ax, ay, az], half sizes [hx, hy, hz]. */
export function obox(G, c, axes, hs, col, tint = 1) {
  const [ax, ay, az] = axes, [hx, hy, hz] = hs;
  const F = [[ax, hx, ay, hy, az, hz], [ax.map(v => -v), hx, az, hz, ay, hy], [ay, hy, az, hz, ax, hx],
    [ay.map(v => -v), hy, ax, hx, az, hz], [az, hz, ax, hx, ay, hy], [az.map(v => -v), hz, ay, hy, ax, hx]];
  for (const [n, hn, u, hu, v, hv] of F) {
    const o = add3(c, n, hn);
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => G.v(add3(add3(o, u, su * hu), v, sv * hv), n, [su * hu + c[0], sv * hv + c[2]], col, tint));
    G.quad(q[0], q[1], q[2], q[3]);
  }
}
/** Flat strap (a thin box) from point a to point b, width w, thickness th; `out` ≈ the face normal. */
export function strapLine(G, a, b, out, w, th, col, tint = 1) {
  const ax = norm(sub(b, a)); let az = norm(cross(ax, out)); const ay = cross(az, ax);
  if (!isFinite(az[0])) return;
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  obox(G, add3(c, ay, th / 2), [ax, ay, az], [len / 2, th / 2, w / 2], col, tint);
}

/**
 * Strap lying on the virtual last between stations t0..t1 and angles phi0..phi1 (full U = ±π/2),
 * `th` thick, lifted `lift` off the skin. Closed band: outer, inner, front/back and end walls.
 */
export function band(G, P, N, o) {
  const { t0, t1, phi0 = -HALF_PI, phi1 = HALF_PI, th = 0.0035, lift = 0.0006, nt = 3, np = 14, col, tint = 1, uv1 = null } = o;
  const prev = G.uv1Fn;
  const out = [], inn = [];
  const pt = (i, j, k) => {
    const t = t0 + (t1 - t0) * i / nt, phi = phi0 + (phi1 - phi0) * j / np;
    const Pv = P(t, phi), Nv = N(t, phi);
    return { P: add3(Pv, Nv, lift + k * th), N: Nv, t, phi };
  };
  const vx = (v, n, i, j) => {
    if (uv1) G.uv1Fn = () => uv1(i / nt, j / np);
    return G.v(v, n, [v[0], (j / np) * 0.1], col, tint);
  };
  for (let i = 0; i <= nt; i++) {
    const ro = [], ri = [];
    for (let j = 0; j <= np; j++) {
      const a = pt(i, j, 1), c = pt(i, j, 0);
      ro.push(vx(a.P, a.N, i, j)); ri.push(vx(c.P, a.N.map(v => -v), i, j));
    }
    out.push(ro); inn.push(ri);
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
    G.quad(out[i][j], out[i][j + 1], out[i + 1][j + 1], out[i + 1][j]);
    G.quad(inn[i][j], inn[i + 1][j], inn[i + 1][j + 1], inn[i][j + 1]);
  }
  // edge walls (front/back): flat normals along ±t
  for (const [i, sg] of [[0, -1], [nt, 1]]) {
    const t = t0 + (t1 - t0) * i / nt;
    const row = [];
    for (let j = 0; j <= np; j++) {
      const phi = phi0 + (phi1 - phi0) * j / np;
      const d = norm(sub(P(Math.min(1, t + 0.01), phi), P(Math.max(0, t - 0.01), phi))).map(v => v * sg);
      row.push([vx(pt(i, j, 0).P, d, i, j), vx(pt(i, j, 1).P, d, i, j)]);
    }
    for (let j = 0; j < np; j++) {
      if (sg < 0) G.quad(row[j][0], row[j + 1][0], row[j + 1][1], row[j][1]);
      else G.quad(row[j][0], row[j][1], row[j + 1][1], row[j + 1][0]);
    }
  }
  // end walls where the band stops short of the footbed
  for (const [j, sg] of [[0, -1], [np, 1]]) {
    const row = [];
    for (let i = 0; i <= nt; i++) {
      const t = t0 + (t1 - t0) * i / nt, phi = phi0 + (phi1 - phi0) * j / np;
      const d = norm(sub(P(t, Math.min(HALF_PI, phi + 0.02)), P(t, Math.max(-HALF_PI, phi - 0.02)))).map(v => v * sg);
      row.push([vx(pt(i, j, 0).P, d, i, j), vx(pt(i, j, 1).P, d, i, j)]);
    }
    for (let i = 0; i < nt; i++) {
      if (sg > 0) G.quad(row[i][0], row[i + 1][0], row[i + 1][1], row[i][1]);
      else G.quad(row[i][0], row[i][1], row[i + 1][1], row[i + 1][0]);
    }
  }
  G.uv1Fn = prev;
}

/** Elliptical strap ring (ankle strap): centre (xc, yc), radii rx/rz, width w, thickness th, front drop `slope`. */
export function ring(G, o) {
  const { xc, yc, rx, rz, w = 0.011, th = 0.0035, seg = 26, col, tint = 1, slope = 0 } = o;
  const P = (i, r, k) => { const a = (i / seg) * Math.PI * 2; const y = yc + slope * Math.cos(a) + (k - 0.5) * w; return [xc + Math.cos(a) * r * rx, y, Math.sin(a) * r * rz]; };
  const Nr = (i) => { const a = (i / seg) * Math.PI * 2; return norm([Math.cos(a) / rx, 0, Math.sin(a) / rz]); };
  const ro = 1 + th / (2 * Math.min(rx, rz)), ri = 1 - th / (2 * Math.min(rx, rz));
  const grid = (r, nsg) => { const o2 = []; for (let i = 0; i <= seg; i++) { const n = Nr(i).map(v => v * nsg); o2.push([0, 1].map(k => G.v(P(i, r, k), n, [i / seg * 0.3, k * w], col, tint))); } return o2; };
  const O = grid(ro, 1), I = grid(ri, -1);
  for (let i = 0; i < seg; i++) {
    G.quad(O[i][0], O[i][1], O[i + 1][1], O[i + 1][0]);
    G.quad(I[i][0], I[i + 1][0], I[i + 1][1], I[i][1]);
  }
  for (const [k, ny] of [[1, 1], [0, -1]]) {
    const r = []; for (let i = 0; i <= seg; i++) r.push([G.v(P(i, ri, k), [0, ny, 0], [0, 0], col, tint), G.v(P(i, ro, k), [0, ny, 0], [0, 0], col, tint)]);
    for (let i = 0; i < seg; i++) {
      if (ny > 0) G.quad(r[i][0], r[i + 1][0], r[i + 1][1], r[i][1]);
      else G.quad(r[i][0], r[i][1], r[i + 1][1], r[i + 1][0]);
    }
  }
  return { at: (a) => [xc + Math.cos(a) * rx, yc + slope * Math.cos(a), Math.sin(a) * rz] };
}

/** Tall boot shaft: elliptical tube from y0 to y1 (centre cx(u), radii rx(u) / rz(u), u = 0..1), open top with a rim. */
export function shaft(G, o) {
  const { y0, y1, cx, rx, rz, th = 0.003, seg = 22, rings = 8, col, tint = 1, rimCol } = o;
  const P = (i, k, inset) => {
    const u = k / rings, a = (i / seg) * Math.PI * 2, y = lerp(y0, y1, u);
    return [cx(u) + Math.cos(a) * (rx(u) - inset), y, Math.sin(a) * (rz(u) - inset)];
  };
  const Nn = (i, k) => { const u = k / rings, a = (i / seg) * Math.PI * 2; return norm([Math.cos(a) / rx(u), 0, Math.sin(a) / rz(u)]); };
  const O = [], I = [];
  for (let i = 0; i <= seg; i++) {
    const ro = [], ri = [];
    for (let k = 0; k <= rings; k++) {
      const n = Nn(i, k);
      ro.push(G.v(P(i, k, 0), n, [i / seg * 0.35, lerp(y0, y1, k / rings)], col, tint));
      ri.push(G.v(P(i, k, th), n.map(v => -v), [i / seg * 0.35, lerp(y0, y1, k / rings)], col.map(v => v * 0.7), tint));
    }
    O.push(ro); I.push(ri);
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < rings; k++) {
    G.quad(O[i][k], O[i][k + 1], O[i + 1][k + 1], O[i + 1][k]);
    G.quad(I[i][k], I[i + 1][k], I[i + 1][k + 1], I[i][k + 1]);
  }
  const rc = rimCol || col;
  const r = []; for (let i = 0; i <= seg; i++) r.push([G.v(P(i, rings, th), [0, 1, 0], [0, 0], rc, tint), G.v(P(i, rings, 0), [0, 1, 0], [0, 0], rc, tint)]);
  for (let i = 0; i < seg; i++) G.quad(r[i][0], r[i + 1][0], r[i + 1][1], r[i][1]);
}

/** Ellipsoid (for bows, knots, fur pom-poms). c centre, axes frame, radii [a, b, c]. */
export function ellipsoid(G, c, axes, rad, col, tint = 1, nu = 10, nv = 6) {
  const [ax, ay, az] = axes, [ra, rb, rc] = rad;
  const V = [];
  for (let j = 0; j <= nv; j++) {
    const ph = -HALF_PI + Math.PI * j / nv, row = [];
    for (let i = 0; i <= nu; i++) {
      const th = Math.PI * 2 * i / nu;
      const l = [Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)];
      const pl = [l[0] * ra, l[1] * rb, l[2] * rc], nl = norm([l[0] / ra, l[1] / rb, l[2] / rc]);
      const P = add3(add3(add3(c, ax, pl[0]), ay, pl[1]), az, pl[2]);
      const Nw = norm(add3(add3(ax.map(v => v * nl[0]), ay, nl[1]), az, nl[2]));
      row.push(G.v(P, Nw, [i / nu * 0.05, j / nv * 0.03], col, tint));
    }
    V.push(row);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) G.quad(V[j][i], V[j + 1][i], V[j + 1][i + 1], V[j][i + 1]);
}

/** Bow on the vamp: two flattened loops + a knot, sitting on the last at (t, 0). */
export function bow(G, P, N, t, size, col, tint = 1, lite = false) {
  const c = P(t, 0), n = N(t, 0);
  const fwd = norm(sub(P(Math.min(1, t + 0.02), 0), c));
  const side = norm(cross(n, fwd)), up = norm(cross(fwd, side));
  const base = add3(c, n, size * 0.18);
  const nu = lite ? 6 : 10, nv = lite ? 4 : 6;
  for (const sg of [-1, 1]) {
    const tilt = 0.35 * sg;
    const ax = norm(add3(side.map(v => v * sg), fwd, -0.25)), az = norm(cross(ax, up)), ay = cross(az, ax);
    const ay2 = norm(add3(ay, ax, tilt * 0.3));
    ellipsoid(G, add3(base, ax, size * 0.44), [ax, ay2, norm(cross(ax, ay2))], [size * 0.46, size * 0.14, size * 0.3], col, tint, nu, nv);
  }
  ellipsoid(G, add3(base, up, size * 0.02), [side, up, fwd], [size * 0.16, size * 0.16, size * 0.2], col.map(v => v * 0.9), tint, nu, nv);
}

/** Small gold buckle frame at point c facing n (w × h), lying along `along`. */
export function buckle(G, c, n, along, w = 0.016, h = 0.012, col = GOLD) {
  const ax = norm(along), az = norm(cross(ax, n)), ay = cross(az, ax);
  const sf = G.surf; G.surf = SURF.metal;
  const t = 0.0022, d = 0.0018;
  const at = (u, v) => add3(add3(add3(c, ax, u), az, v), ay, d / 2);
  obox(G, at(0, h / 2 - t / 2), [ax, ay, az], [w / 2, d / 2, t / 2], col, 0);
  obox(G, at(0, -h / 2 + t / 2), [ax, ay, az], [w / 2, d / 2, t / 2], col, 0);
  obox(G, at(w / 2 - t / 2, 0), [ax, ay, az], [t / 2, d / 2, h / 2], col, 0);
  obox(G, at(-w / 2 + t / 2, 0), [ax, ay, az], [t / 2, d / 2, h / 2], col, 0);
  G.surf = sf;
}

/** Laces across the front opening at stations ts (±phi), bowed out a little. */
function laces(G, P, N, ts, hp, col) {
  const sf = G.surf; G.surf = SURF.textile;
  for (const t of ts) {
    const a = add3(P(t, -hp), N(t, -hp), 0.0028), m = add3(P(t, 0), N(t, 0), 0.004), b = add3(P(t, hp), N(t, hp), 0.0028);
    strapLine(G, a, m, N(t, -hp * 0.5), 0.0038, 0.0018, col, 0);
    strapLine(G, m, b, N(t, hp * 0.5), 0.0038, 0.0018, col, 0);
  }
  G.surf = sf;
}

// ------------------------------------------------------------------------------------------------
// Styles
// ------------------------------------------------------------------------------------------------
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const GOLD = hex('#d6b36a');
const OUTLINES = {
  round: () => rounded(curve([[0, 0.029], [0.3, 0.031], [0.5, 0.035], [0.68, 0.042], [0.84, 0.04], [0.95, 0.031], [1, 0.02]]), 0.11, 0.16, 1),
  almond: () => rounded(curve([[0, 0.029], [0.3, 0.03], [0.5, 0.034], [0.68, 0.041], [0.82, 0.037], [0.93, 0.025], [1, 0.01]]), 0.1, 0.14, 1.2),
  point: () => rounded(curve([[0, 0.029], [0.3, 0.03], [0.5, 0.034], [0.68, 0.041], [0.82, 0.034], [0.93, 0.02], [1, 0.004]]), 0.1, 0.12, 1.4),
  square: () => rounded(curve([[0, 0.031], [0.3, 0.033], [0.5, 0.037], [0.7, 0.044], [0.86, 0.044], [0.95, 0.039], [1, 0.03]]), 0.13, 0.11, 0.8),
  boot: () => rounded(curve([[0, 0.033], [0.3, 0.035], [0.5, 0.037], [0.68, 0.045], [0.84, 0.042], [0.95, 0.031], [1, 0.02]]), 0.13, 0.17, 1),
  western: () => rounded(curve([[0, 0.033], [0.3, 0.035], [0.5, 0.037], [0.68, 0.044], [0.82, 0.037], [0.93, 0.022], [1, 0.006]]), 0.13, 0.16, 1.5),
};
const heeledBed = (H, base = 0.004, t0 = 0.16, t1 = 0.7) => t => base + H * Math.pow(1 - smooth(t0, t1, t), 1.15) + 0.004 * smooth(0.86, 1, t) ** 2;
/** Block heel via the sole: floor under t < tb, a thin sole under the rest. */
const blockBottom = (s, tb, sole) => t => (t < tb ? 0 : t < tb + 0.012 ? lerp(0, s(tb + 0.012) - sole, (t - tb) / 0.012) : s(t) - sole);

/** Court shoe. o: { H (heel height), heel: 'stiletto'|'kitten'|'block', toe, surf } */
function court(o = {}) {
  const L = o.L || 0.252, H = o.H ?? 0.088, heel = o.heel || 'stiletto';
  const b = OUTLINES[o.toe || 'point']();
  const s = heeledBed(H);
  const h = curve([[0, 0.05], [0.25, 0.055], [0.45, 0.05], [0.6, 0.04], [0.75, 0.03], [0.9, 0.018], [0.97, 0.009], [1, 0.003]]);
  const top = curve([[0, 0.046], [0.12, 0.041], [0.3, 0.028], [0.46, 0.022]]);
  const tv = o.vamp || 0.62;
  const T = t => (t < 0.46 ? top(t) : t < tv ? lerp(0.022, h(tv) + 0.0015, (t - 0.46) / (tv - 0.46)) : Infinity);
  const liftCol = hex('#18130f'), soleCol = hex('#231914');
  const spec = {
    lite: !!o.lite, L, b, s, h, T, vamp: tv - 0.04, NI: 24, NJ: 5, th: 0.0022, surf: o.surf || 0,
    p: t => lerp(0.5, 0.72, smooth(0.5, 1, t)), q: () => 0.95,
    lining: hex('#d9b596'), insole: hex('#caa07c'),
    sole: { welt: 0.0006, bottom: t => s(t) - 0.0038, col: () => soleCol, tint: 0, bands: 1 },
  };
  if (heel === 'block') {
    const tb = 0.19;
    spec.breaks = [tb, tb + 0.012];
    spec.sole = { welt: 0.0008, bottom: blockBottom(s, tb, 0.0038), tint: 0, surf: o.surf || 0,
      col: (y, part, t) => (t < tb + 0.012 && y > 0.0055 ? [1, 1, 1, 1] : part === 'lift' || y < 0.0055 ? [...liftCol, 0, SURF.rubber] : soleCol) };
  } else {
    const kitten = heel === 'kitten';
    spec.stiletto = kitten
      ? { top: s(0.08) - 0.003, col: [1, 1, 1], liftCol, rx0: 0.015, rz0: 0.013, r1: 0.0062, drift: 0.007, seg: 10, rings: 6 }
      : { top: s(0.08) - 0.003, col: [1, 1, 1], liftCol, rx0: 0.018, rz0: 0.015, r1: 0.0045, seg: 10, rings: 7 };
  }
  return buildShoe(spec);
}

/**
 * Boots. o: { heel (m), toe ('boot'|'western'), shaft (topline height above the footbed), gusset, zip, laces,
 * fur, crepe, western, tall (m, shaft tube top), rubber, surf, tab }
 */
function boot(o = {}) {
  const L = o.western ? 0.278 : 0.272;
  const b = OUTLINES[o.western ? 'western' : 'boot']();
  const heel = o.heel || 0;
  const SH = o.shaft ?? 0.13;
  let s, bottom, sb;
  if (heel > 0) {
    s = t => 0.011 + heel * Math.pow(1 - smooth(0.17, 0.66, t), 1.1) + 0.006 * smooth(0.84, 1, t) ** 2;
    bottom = blockBottom(s, 0.2, 0.009);
  } else {
    const crepe = o.crepe ? 0.006 : 0;
    sb = t => 0.006 * smooth(0.225, 0.25, t) - 0.004 * smooth(0.36, 0.56, t) + 0.011 * smooth(0.8, 1, t) ** 2;
    s = t => sb(t) + 0.018 + crepe + 0.012 * (1 - smooth(0.2, 0.34, t)) - 0.003 * smooth(0.8, 1, t);
    bottom = o.crepe ? (t => 0.004 * smooth(0.82, 1, t) ** 2) : sb;
  }
  const hc = curve([[0, 0.146], [0.16, 0.15], [0.26, 0.143], [0.32, 0.128], [0.37, 0.102], [0.42, 0.082], [0.5, 0.067], [0.62, 0.056], [0.78, 0.046], [0.9, 0.035], [0.97, 0.02], [1, 0.006]]);
  const k = (SH + 0.016) / 0.146;
  const h = t => hc(t) * lerp(k, 1, smooth(0.28, 0.5, t));
  const T = () => SH;
  const gus = hex('#1c1a19'), cream = hex('#efe6d6');
  const surf = o.surf ?? (o.rubber ? SURF.gloss : SURF.calf);
  const decorate = (t, phi, yrel) => {
    if (o.gusset) {
      const half = 0.065 - 0.02 * (1 - smooth(0.05, 0.13, yrel));
      if (Math.abs(t - 0.2) < half && yrel > 0.05 && Math.abs(phi) > 0.45) return { col: gus, tint: 0.1, surf: SURF.textile };
    }
    if (o.zip && phi < -0.5 && Math.abs(t - 0.2) < 0.012 && yrel > 0.02) return { col: [0.35, 0.35, 0.35], tint: 1 };
    if (o.western) {
      const yl = 0.075 + 0.018 * Math.sin(t * 38 + 1.2);
      if (Math.abs(yrel - yl) < 0.0035 && t < 0.4) return { col: [1.35, 1.25, 1.1], tint: 1 };
    }
    if (o.laces && t > 0.3 && t < 0.47 && Math.abs(phi) < 0.2) return { col: [0.62, 0.62, 0.62], tint: 1 };
    if (o.rubber && yrel < 0.022 && t > 0.2) return { col: [0.72, 0.72, 0.72], tint: 1 };
    return null;
  };
  const soleCol = o.crepe ? hex('#c49a62') : o.rubber ? hex('#161514') : hex('#1b1917');
  const stack = hex('#4a2f1e');
  const sole = { welt: o.crepe ? 0.0042 : 0.0032, bottom, tint: 0, edgeUp: 0.001, surf: o.crepe ? SURF.rubber : SURF.calf,
    col: (y, part, t) => {
      if (heel > 0 && t < 0.212 && y > 0.012) return o.western ? [...stack.map((v, i) => v * (0.92 + 0.12 * ((Math.floor(y / 0.006) % 2)))), 0, SURF.calf] : [0.85, 0.85, 0.85, 1, surf];
      return part === 'lift' ? [...hex('#0f0e0d'), 0, SURF.rubber] : soleCol;
    }, rows: o.western && heel > 0 ? 8 : 0 };
  const lining = o.fur ? cream : hex('#b98d63');
  return buildShoe({
    lite: !!o.lite, L, b, s, h, T, vamp: 0.3, NI: 24, NJ: 6, th: o.fur ? 0.005 : 0.003, breaks: o.gusset ? [0.135, 0.265] : heel > 0 ? [0.2, 0.212] : [],
    p: t => lerp(0.5, 0.62, smooth(0.3, 0.75, t)), q: t => lerp(0.8, 0.9, smooth(0.3, 0.7, t)),
    lining, insole: o.fur ? cream.map(v => v * 0.9) : hex('#a07650'), surf, decorate, sole,
    rimCol: o.fur ? cream : undefined, rimTint: o.fur ? 0 : undefined, rimSurf: o.fur ? SURF.suede : undefined,
    collar: o.fur ? { r: 0.011, col: cream, tint: 0, surf: SURF.suede } : null,
    extras: (G, P, N, sfn, X, lite) => {
      if (o.tab !== false && !o.tall && !o.fur) pullTab(G, -L / 2, sfn(0) + SH, [0.55, 0.55, 0.55]);
      if (o.laces) laces(G, P, N, lite ? [0.34, 0.42] : [0.33, 0.38, 0.43], 0.26, hex('#3b2a1e'));
      if (o.zip) { const zp = add3(P(0.2, -1.2), N(0.2, -1.2), 0.002); obox(G, [zp[0], sfn(0.2) + SH - 0.012, zp[2] - 0.0015], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.0028, 0.007, 0.0015], GOLD, 0); }
      if (o.tall) {
        const y0 = sfn(0.15) + SH - 0.035, top = o.tall;
        const cx0 = -L / 2 + 0.056;
        const rr = o.rubber;
        shaft(G, { y0, y1: top, seg: lite ? 12 : 22, rings: lite ? 4 : 8, th: 0.003,
          cx: u => cx0 + 0.006 * u, rx: u => (rr ? 0.056 : 0.049) + (rr ? 0.004 : 0.008) * Math.sin(Math.PI * u * 0.85), rz: u => (rr ? 0.043 : 0.034) + (rr ? 0.008 : 0.015) * Math.sin(Math.PI * Math.min(1, u * 1.1)),
          col: [1, 1, 1], tint: 1, rimCol: [0.8, 0.8, 0.8] });
        if (rr) { // gloss rubber buckle strap near the top, outer side
          const yb = top - 0.035, a = [cx0 - 0.02, yb, 0.057], c2 = [cx0 + 0.035, yb - 0.004, 0.05];
          strapLine(G, a, c2, [0, 0, 1], 0.014, 0.003, [0.9, 0.9, 0.9], 1);
          buckle(G, [cx0 + 0.02, yb - 0.002, 0.057], [0, 0, 1], [1, -0.08, -0.2], 0.018, 0.016);
        }
      }
    },
  });
}

/** Flats. o: { kind: 'ballet'|'maryjane', toe, surf, bow, tbar } */
function flat(o = {}) {
  const L = 0.25;
  const b = OUTLINES[o.toe || 'round']();
  const s = t => 0.008 + 0.006 * (1 - smooth(0.16, 0.3, t)) + 0.003 * smooth(0.86, 1, t) ** 2;
  const h = curve([[0, 0.048], [0.25, 0.054], [0.45, 0.058], [0.6, 0.05], [0.75, 0.038], [0.9, 0.026], [0.97, 0.015], [1, 0.004]]);
  const top = curve([[0, 0.036], [0.14, 0.03], [0.34, 0.021], [0.5, 0.02]]);
  const tv = 0.655;
  const T = t => (t < 0.5 ? top(t) : t < tv ? lerp(0.02, h(tv) + 0.0015, Math.pow((t - 0.5) / (tv - 0.5), 1.3)) : Infinity);
  const soleCol = hex('#2a1d15');
  return buildShoe({
    lite: !!o.lite, L, b, s, h, T, vamp: 0.6, NI: 22, NJ: 5, th: 0.0022, surf: o.surf || 0, breaks: [0.17, 0.182],
    p: t => lerp(0.46, 0.66, smooth(0.5, 1, t)), q: () => 0.92,
    lining: hex('#dcbf9f'), insole: hex('#cfa983'),
    sole: { welt: 0.001, bottom: t => (t < 0.17 ? 0 : t < 0.182 ? lerp(0, s(0.182) - 0.0045, (t - 0.17) / 0.012) : s(t) - 0.0045), tint: 0,
      col: (y, part) => (part === 'lift' ? [...hex('#141110'), 0, SURF.rubber] : soleCol) },
    extras: (G, P, N, sfn, X, lite) => {
      if (o.bow) bow(G, P, N, tv + 0.012, 0.024, [0.9, 0.9, 0.9], 1, lite);
      if (o.kind === 'maryjane') {
        band(G, P, N, { t0: 0.41, t1: 0.455, th: 0.003, nt: 2, np: lite ? 8 : 14, col: [1, 1, 1] });
        const bp = P(0.432, 1.15), bn = N(0.432, 1.15);
        buckle(G, add3(bp, bn, 0.0035), bn, [1, 0, 0], 0.013, 0.011);
        if (o.tbar !== false) band(G, P, N, { t0: 0.44, t1: tv + 0.005, phi0: -0.16, phi1: 0.16, th: 0.003, nt: 4, np: 2, col: [1, 1, 1] });
      }
    },
  });
}

/** Loafer family. o: { kind: 'penny'|'monk'|'brogue', surf } */
function loafer(o = {}) {
  const kind = o.kind || 'penny';
  const L = 0.272;
  const b = rounded(curve([[0, 0.03], [0.3, 0.032], [0.5, 0.035], [0.68, 0.043], [0.84, 0.04], [0.95, 0.029], [1, 0.016]]), 0.11, 0.16, 1);
  const sb = t => 0.006 * smooth(0.225, 0.25, t) - 0.004 * smooth(0.36, 0.56, t) + 0.009 * smooth(0.8, 1, t) ** 2;
  const s = t => sb(t) + 0.011 + 0.016 * (1 - smooth(0.2, 0.34, t)) - 0.002 * smooth(0.85, 1, t);
  const h = curve([[0, 0.05], [0.2, 0.057], [0.4, 0.066], [0.52, 0.064], [0.64, 0.053], [0.8, 0.041], [0.92, 0.029], [0.97, 0.017], [1, 0.005]]);
  const top = curve([[0, 0.045], [0.18, 0.042], [0.34, 0.043]]);
  const t0 = kind === 'brogue' ? 0.3 : 0.33, tv = kind === 'brogue' ? 0.36 : 0.5;
  const T = t => (t < t0 ? top(t) : t < tv ? lerp(top(t0), h(tv) + 0.0015, Math.pow((t - t0) / (tv - t0), 1.7)) : Infinity);
  const slot = hex('#1d120c');
  const decorate = (t, phi) => {
    const ap = Math.abs(phi);
    if (kind === 'penny' && t > 0.53 && t < 0.615 && ap < 1.25) {
      if (ap < 0.36 && t > 0.545 && t < 0.575) return { col: slot, tint: 0.3 };
      return { col: t > 0.6 ? [0.6, 0.6, 0.6] : [0.84, 0.84, 0.84], tint: 1 };
    }
    if (kind === 'monk' && t > 0.47 && t < 0.56 && phi > -1.0) return { col: [0.74, 0.74, 0.74], tint: 1 };
    if (kind === 'brogue') {
      if (t > 0.36 && t < 0.5 && ap < 0.2) return { col: [0.5, 0.5, 0.5], tint: 1 };          // lace gap
      const wing = 0.74 + 0.1 * Math.min(1, ap / 0.9);                                         // wingtip seam
      if (Math.abs(t - wing) < 0.008 && ap < 1.3) return { col: [0.62, 0.62, 0.62], tint: 1 };
      if (Math.abs(t - 0.5) < 0.006) return { col: [0.66, 0.66, 0.66], tint: 1 };               // facing seam
    }
    const seamPhi = 0.66 + 0.55 * smooth(0.82, 0.98, t);
    if (kind !== 'brogue' && t > 0.62 && t < 0.98 && Math.abs(ap - seamPhi) < 0.06) return { col: [0.7, 0.7, 0.7], tint: 1 };
    return null;
  };
  return buildShoe({
    lite: !!o.lite, L, b, s, h, T, vamp: kind === 'brogue' ? 0.36 : 0.49, NI: 22, NJ: 5, th: 0.0026, surf: o.surf || 0,
    breaks: kind === 'penny' ? [0.53, 0.545, 0.575, 0.6, 0.615] : kind === 'monk' ? [0.47, 0.56] : [0.5],
    p: t => lerp(0.42, 0.62, smooth(0.4, 0.9, t)), q: () => 0.9,
    lining: hex('#c79a6c'), insole: hex('#b48258'), decorate,
    sole: { welt: 0.0028, bottom: sb, tint: 0, edgeUp: 0.0008,
      col: (y, part) => (part === 'lift' ? [...hex('#141110'), 0, SURF.rubber] : part === 'edge' ? hex('#5a3a24') : hex('#3b261a')) },
    extras: (G, P, N, sfn, X, lite) => {
      if (kind === 'monk') { const bp = P(0.515, 1.05), bn = N(0.515, 1.05); buckle(G, add3(bp, bn, 0.003), bn, [0.3, 0.9, 0], 0.017, 0.013); }
      if (kind === 'brogue') laces(G, P, N, lite ? [0.39, 0.46] : [0.38, 0.42, 0.46], 0.24, hex('#1f1712'));
    },
  });
}

/** Backless mule, low block heel. o: { surf, print } */
function mule(o = {}) {
  const L = 0.258;
  const b = rounded(curve([[0, 0.03], [0.3, 0.031], [0.5, 0.035], [0.68, 0.041], [0.84, 0.039], [0.95, 0.03], [1, 0.02]]), 0.12, 0.14, 1);
  const sb = t => 0.005 * smooth(0.22, 0.25, t) - 0.003 * smooth(0.36, 0.56, t) + 0.006 * smooth(0.84, 1, t) ** 2;
  const s = t => sb(t) + 0.01 + 0.016 * (1 - smooth(0.2, 0.34, t));
  const h = curve([[0, 0.05], [0.4, 0.056], [0.52, 0.056], [0.62, 0.049], [0.78, 0.038], [0.92, 0.026], [0.97, 0.016], [1, 0.005]]);
  const t0 = 0.44, tv = 0.575;
  const T = t => (t < t0 ? 0 : t < tv ? (h(tv) + 0.0015) * Math.pow((t - t0) / (tv - t0), 0.8) : Infinity);
  return buildShoe({
    lite: !!o.lite, L, b, s, h, T, vamp: 0.52, NI: 24, NJ: 5, th: 0.0028, surf: o.surf || 0, print: o.print,
    p: t => lerp(0.5, 0.6, smooth(0.5, 0.9, t)), q: () => 0.88,
    lining: hex('#c9a27a'), insole: hex('#c29a6f'),
    sole: { welt: 0.0018, bottom: sb, col: () => hex('#3a2519'), tint: 0, edgeUp: 0.0006, bands: 1 },
  });
}

/**
 * Sandals: a footbed slab (flat / wedge / platform) + straps on a virtual foot.
 * o: { kind: 'slide'|'twostrap'|'gladiator'|'espadrille'|'wedge'|'platform', print, bow, ankle, surf }
 */
function sandal(o = {}) {
  const kind = o.kind || 'slide';
  const L = 0.255;
  const b = OUTLINES.square();
  let s, bottom = t => 0.004 * smooth(0.9, 1, t) ** 2;
  if (kind === 'espadrille' || kind === 'wedge') s = t => 0.02 + 0.056 * Math.pow(1 - smooth(0.1, 0.8, t), 1.1) + 0.003 * smooth(0.88, 1, t) ** 2;
  else if (kind === 'platform') s = t => 0.032 + 0.045 * (1 - smooth(0.14, 0.7, t)) + 0.003 * smooth(0.88, 1, t) ** 2;
  else { s = t => 0.013 + 0.006 * (1 - smooth(0.15, 0.35, t)) + 0.003 * smooth(0.88, 1, t) ** 2; bottom = t => 0.002 * smooth(0.9, 1, t) ** 2; }
  const h = curve([[0, 0.055], [0.3, 0.065], [0.45, 0.062], [0.6, 0.048], [0.75, 0.035], [0.88, 0.024], [0.96, 0.014], [1, 0.004]]);
  const p = t => lerp(0.46, 0.6, smooth(0.5, 0.95, t)), q = () => 0.85;
  const lite = !!o.lite;
  const NI = lite ? 10 : 20;
  const G = new Geo();
  const { X, P, N } = lastFns({ L, b, s, h, p, q });
  const ts = stations(NI, 0.5, []);
  // footbed slab
  const jute = kind === 'espadrille' || kind === 'wedge';
  const bed = hex('#c9a27a'), edge = hex('#8b6446'), dark = hex('#2a1d15');
  G.surf = kind === 'platform' ? SURF.rubber : SURF.calf;
  solid(G, ts, X, { w: t => b(t) + 0.002, top: s, bottom, L, up: 0.0005, bands: jute ? 3 : 1, rows: jute && !lite ? 6 : 0, tint: 0,
    col: (y, part) => {
      if (part === 'top') return [...bed, 0, SURF.calf];
      if (part === 'bottom') return [...dark, 0, SURF.rubber];
      if (jute) return y < 0.0055 ? [...hex('#2b2320'), 0, SURF.rubber] : [1, 1, 1, 0, SURF.textile];
      if (kind === 'platform') return [0.95, 0.95, 0.95, 1, SURF.rubber];
      return edge;
    },
    sideUv1: jute ? (x, y, z, yt, yb) => (y < 0.0055 ? WHITE_UV : ruv('jute', (x + L / 2) / L, 1 - (y - 0.0055) / Math.max(0.01, yt - 0.0055))) : null });
  G.surf = o.surf || 0;
  const np = lite ? 8 : 14, nt = lite ? 2 : 3;
  const printUv = o.print ? (u, v) => ruv(o.print, u, v) : null;
  const B = (t0, t1, extra = {}) => band(G, P, N, { t0, t1, th: 0.0035, nt, np, col: [1, 1, 1], uv1: printUv, ...extra });
  const ankle = (quarters = false, hgt = 0.052) => {
    const xc = -L / 2 + 0.054, yc = s(0.1) + hgt;
    const r = ring(G, { xc, yc, rx: 0.05, rz: 0.035, w: 0.01, th: 0.0032, seg: lite ? 14 : 26, col: [1, 1, 1], slope: -0.012 });
    // back strap (heel counter strip) + (gladiators) quarter straps down to the footbed
    strapLine(G, [X(0) + 0.004, s(0.02), 0], [xc - 0.05, yc + 0.009, 0], [-1, 0, 0], 0.022, 0.003, [1, 1, 1]);
    if (quarters) for (const sg of [-1, 1]) strapLine(G, [xc + 0.002, yc - 0.004, sg * 0.035], [X(0.3), s(0.3) + 0.002, sg * (b(0.3) + 0.0005)], [0, 0, sg], 0.009, 0.003, [1, 1, 1]);
    buckle(G, add3(r.at(Math.PI / 2 - 0.35), [0, 0, 1], 0.002), [0.25, 0, 1], [1, 0, -0.25], 0.012, 0.012);
  };
  switch (kind) {
    case 'slide': B(0.5, 0.77, { th: 0.004 }); break;
    case 'twostrap': B(0.5, 0.565); B(0.69, 0.755); if (o.ankle) ankle(); break;
    case 'gladiator':
      for (const [a, c] of [[0.36, 0.395], [0.5, 0.535], [0.64, 0.675], [0.77, 0.8]]) B(a, c, { th: 0.003 });
      band(G, P, N, { t0: 0.36, t1: 0.8, phi0: -0.14, phi1: 0.14, th: 0.0036, nt: lite ? 4 : 8, np: 2, col: [1, 1, 1] });
      ankle(true, 0.07);
      break;
    case 'espadrille': B(0.54, 1.0, { th: 0.003, nt: lite ? 4 : 7 }); ankle(); break;
    case 'wedge': B(0.55, 0.63); B(0.71, 0.79); ankle(); break;
    case 'platform': B(0.52, 0.72, { th: 0.0045 }); ankle(); break;
    default: B(0.5, 0.77);
  }
  if (o.bow) bow(G, P, N, 0.64, 0.03, [1, 1, 1], 1, lite);
  const geo = G.build();
  geo.userData.P = P; geo.userData.N = N; geo.userData.L = L;
  return geo;
}

/**
 * The style catalogue. Every entry → a function (opt) → BufferGeometry (opt.lite = far LOD, opt.print =
 * atlas print patch for printed colourways: 'snake' | 'floral').
 * `foot` = [length, width] of the contact-shadow footprint, `h` = display height (m), `tall` = needs a tall slot.
 */
export const STYLES = {
  pump: { build: (o) => court({ ...o }), foot: [0.27, 0.09], h: 0.1 },
  patentPump: { build: (o) => court({ ...o, surf: SURF.patent }), foot: [0.27, 0.09], h: 0.1 },
  blockHeel: { build: (o) => court({ ...o, heel: 'block', H: 0.066, toe: 'almond' }), foot: [0.27, 0.09], h: 0.09 },
  kitten: { build: (o) => court({ ...o, heel: 'kitten', H: 0.038, toe: 'point', vamp: 0.63 }), foot: [0.27, 0.09], h: 0.07 },
  chelsea: { build: (o) => boot({ ...o, gusset: true }), foot: [0.31, 0.11], h: 0.17 },
  ankleHeel: { build: (o) => boot({ ...o, heel: 0.052, shaft: 0.14, zip: true, tab: false }), foot: [0.3, 0.1], h: 0.21 },
  western: { build: (o) => boot({ ...o, heel: 0.045, shaft: 0.155, western: true }), foot: [0.31, 0.1], h: 0.22 },
  desert: { build: (o) => boot({ ...o, shaft: 0.1, laces: true, crepe: true, tab: false, surf: SURF.suede }), foot: [0.3, 0.11], h: 0.14 },
  furBoot: { build: (o) => boot({ ...o, shaft: 0.15, fur: true, surf: SURF.suede, tab: false }), foot: [0.31, 0.11], h: 0.19 },
  riding: { build: (o) => boot({ ...o, shaft: 0.12, tall: 0.37, tab: false, surf: SURF.suede }), foot: [0.31, 0.11], h: 0.37, tall: true },
  rain: { build: (o) => boot({ ...o, shaft: 0.12, tall: 0.31, rubber: true, tab: false }), foot: [0.31, 0.12], h: 0.31, tall: true },
  ballet: { build: (o) => flat({ ...o, bow: true }), foot: [0.27, 0.09], h: 0.06 },
  maryjane: { build: (o) => flat({ ...o, kind: 'maryjane', surf: SURF.suede }), foot: [0.27, 0.09], h: 0.07 },
  loafer: { build: (o) => loafer({ ...o, kind: 'penny' }), foot: [0.3, 0.1], h: 0.08 },
  monk: { build: (o) => loafer({ ...o, kind: 'monk', surf: SURF.suede }), foot: [0.3, 0.1], h: 0.08 },
  brogue: { build: (o) => loafer({ ...o, kind: 'brogue' }), foot: [0.3, 0.1], h: 0.08 },
  mule: { build: (o) => mule({ ...o }), foot: [0.28, 0.1], h: 0.07 },
  slide: { build: (o) => sandal({ ...o, kind: 'slide' }), foot: [0.28, 0.1], h: 0.06 },
  wovenSlide: { build: (o) => sandal({ ...o, kind: 'slide', print: 'weave' }), foot: [0.28, 0.1], h: 0.06 },
  bowSlide: { build: (o) => sandal({ ...o, kind: 'slide', bow: true, surf: SURF.gloss }), foot: [0.28, 0.1], h: 0.07 },
  twostrap: { build: (o) => sandal({ ...o, kind: 'twostrap' }), foot: [0.28, 0.1], h: 0.06 },
  strapAnkle: { build: (o) => sandal({ ...o, kind: 'twostrap', ankle: true }), foot: [0.28, 0.1], h: 0.09 },
  gladiator: { build: (o) => sandal({ ...o, kind: 'gladiator' }), foot: [0.28, 0.1], h: 0.09 },
  espadrille: { build: (o) => sandal({ ...o, kind: 'espadrille', surf: SURF.textile }), foot: [0.28, 0.1], h: 0.1 },
  wedge: { build: (o) => sandal({ ...o, kind: 'wedge' }), foot: [0.28, 0.1], h: 0.1 },
  platform: { build: (o) => sandal({ ...o, kind: 'platform' }), foot: [0.28, 0.1], h: 0.1 },
};
