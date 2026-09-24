// Geometry generators for the ambient magic systems. Everything here runs ONCE at build time; all
// motion happens in the shader (magic/shader.js). Colours are linear RGB with HDR brightness folded in.
import * as THREE from 'three';
import { KIND } from './shader.js';

// IMAANS gold first; rare champagne-rose and soft aqua hints.
export const GOLD = { light: '#f6dd8c', mid: '#d9ab48', deep: '#b08d57', dark: '#a97a1f', white: '#fff3dc', cream: '#ffe7b8', rose: '#f3c3b4', aqua: '#bfeee6' };
const _c = new THREE.Color();
function lin(hex, k = 1) { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; }
function pickColor(r, table) { let u = r(), acc = 0; for (const [hex, w] of table) { acc += w; if (u <= acc) return hex; } return table[0][0]; }

const DUST_COLORS = [[GOLD.light, 0.46], [GOLD.mid, 0.2], [GOLD.white, 0.2], [GOLD.deep, 0.07], [GOLD.cream, 0.035], [GOLD.rose, 0.02], [GOLD.aqua, 0.015]];
const HELIX_COLORS = [[GOLD.light, 0.5], [GOLD.mid, 0.22], [GOLD.white, 0.22], [GOLD.rose, 0.04], [GOLD.aqua, 0.02]];

/** A particle buffer builder (position + aA + aB + aColor). */
export class Buf {
  constructor(n) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.A = new Float32Array(n * 4); this.B = new Float32Array(n * 4); this.C = new Float32Array(n * 3);
  }
  push(p, a, b, c) {
    const i = this.i++; if (i >= this.n) return;
    this.pos.set(p, i * 3); this.A.set(a, i * 4); this.B.set(b, i * 4); this.C.set(c, i * 3);
  }
  geometry({ dynamic = false } = {}) {
    const g = new THREE.BufferGeometry();
    const n = Math.min(this.i, this.n);
    const mk = (arr, k) => { const at = new THREE.BufferAttribute(dynamic ? arr : arr.subarray(0, n * k), k); if (dynamic) at.setUsage(THREE.DynamicDrawUsage); return at; };
    g.setAttribute('position', mk(this.pos, 3));
    g.setAttribute('aA', mk(this.A, 4));
    g.setAttribute('aB', mk(this.B, 4));
    g.setAttribute('aColor', mk(this.C, 3));
    return g;
  }
}

/**
 * Spot-head beams for "denser in the light cones": [{P, d, len, tan, w}]. Uses the architecture plan's
 * track heads when available (narrow 15° beams), else the scene's real spot lights.
 */
export function collectBeams(ctx, plan) {
  const beams = [];
  if (plan && Array.isArray(plan.HEADS)) {
    const y = (plan.TRACK_Y || 4.57) - 0.14;
    for (const h of plan.HEADS) {
      const P = new THREE.Vector3(h[0], y, h[1]), T = new THREE.Vector3(h[2], h[3], h[4]);
      const d = T.clone().sub(P), len = d.length(); if (len < 0.5) continue;
      beams.push({ P, d: d.normalize(), len, tan: Math.tan(15 * Math.PI / 180), w: h[5] ?? 1 });
    }
  }
  if (!beams.length) {
    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverse(o => {
      if (!o.isSpotLight) return;
      const P = o.getWorldPosition(new THREE.Vector3());
      const T = o.target.parent ? o.target.getWorldPosition(new THREE.Vector3()) : o.target.position.clone();
      const d = T.clone().sub(P), len = d.length(); if (len < 0.5) return;
      beams.push({ P, d: d.normalize(), len, tan: Math.tan(Math.min(o.angle, 0.6) * 0.6), w: 1 });
    });
  }
  return beams;
}

/** (1) ambient gold dust — a share of it inside the spot beams (and brighter there). In the 3 m shop the beams are
 *  short (≈ 3 m³ in all) and the camera is 1-4 m from the shelves, so a fifth of the motes go to the beams (the old
 *  store's beam : room density contrast) and the motes are 25 % smaller than in the first, 4.6 m tall store. */
export function buildDust(ctx, n, beams, r) {
  const { ROOM } = ctx.layout;
  const buf = new Buf(n);
  const wsum = beams.reduce((s, b) => s + b.w, 0);
  const nBeam = beams.length ? Math.round(n * 0.2) : 0;
  const tmp = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    let p, boost = 0;
    if (i < nBeam) {
      let x = r() * wsum, b = beams[0];
      for (const bb of beams) { x -= bb.w; if (x <= 0) { b = bb; break; } }
      const t = b.len * Math.max(0.18, Math.cbrt(r()));        // uniform in the cone's volume
      const rad = t * b.tan * 0.8 * Math.sqrt(r()), a = r() * Math.PI * 2;
      u.set(0, 1, 0).cross(b.d); if (u.lengthSq() < 1e-4) u.set(1, 0, 0); u.normalize(); v.copy(b.d).cross(u);
      tmp.copy(b.P).addScaledVector(b.d, t).addScaledVector(u, Math.cos(a) * rad).addScaledVector(v, Math.sin(a) * rad);
      p = [tmp.x, Math.max(0.15, tmp.y), tmp.z]; boost = 0.8 + r() * 1.0;
    } else {
      p = [r.range(ROOM.minX + 0.3, ROOM.maxX - 0.3), 0.25 + (ROOM.height - 0.45) * Math.pow(r(), 0.9), r.range(ROOM.minZ + 0.3, ROOM.maxZ - 0.3)];
    }
    const col = pickColor(r, DUST_COLORS);
    const k = col === GOLD.deep ? 0.55 : 0.8;
    buf.push(p, [r(), r.range(0.018, 0.038), r.range(0.1, 0.42), r()], [boost, r() < 0.16 ? 1 : 0, 0, KIND.dust], lin(col, k * 2.2));
  }
  return buf;
}

export const GLITTER_R = [0.55, 1.15];   // glitter falls through this annulus round the glass island (m)
/** (2) gold helix spiralling up around the glass island + glitter drifting down from its light panel. */
export function buildVortex(ctx, nHelix, nGlitter, r) {
  const buf = new Buf(nHelix + nGlitter);
  const STRANDS = 3;
  for (let i = 0; i < nHelix; i++) {
    const strand = i % STRANDS;
    const glint = r() < 0.1;
    const ang0 = strand * Math.PI * 2 / STRANDS + (r() + r() - 1) * 0.07;
    const rj = (r() + r() - 1) * 0.035, yj = (r() + r() - 1) * 0.04;
    const col = pickColor(r, HELIX_COLORS);
    buf.push([ang0, r(), rj], [r(), glint ? r.range(0.08, 0.12) : r.range(0.034, 0.066), (1 / 30) * r.range(0.92, 1.08), r()],
      [yj, glint ? 1 : 0, 0, KIND.helix], lin(col, glint ? 3.2 : 2.8));
  }
  const { cx, cz } = ctx.layout.ZONES.glassIsland;
  for (let i = 0; i < nGlitter; i++) {
    const rad = Math.sqrt(r.range(GLITTER_R[0] ** 2, GLITTER_R[1] ** 2)), a = r() * Math.PI * 2;
    const col = pickColor(r, [[GOLD.light, 0.5], [GOLD.white, 0.3], [GOLD.mid, 0.2]]);
    buf.push([cx + Math.cos(a) * rad, 0, cz + Math.sin(a) * rad], [r(), r.range(0.026, 0.045), r.range(0.09, 0.16), r()],
      [r(), 0, 0, KIND.glitter], lin(col, 1.8));
  }
  return buf;
}

/** (3) soft bokeh orbs wandering at 0.9 m … the ceiling (sized for a 3 m room seen from 1-4 m). */
export function buildBokeh(ctx, n, r) {
  const buf = new Buf(n);
  const table = [[GOLD.light, 0.5], [GOLD.cream, 0.3], [GOLD.mid, 0.12], [GOLD.rose, 0.05], [GOLD.aqua, 0.03]];
  for (let i = 0; i < n; i++) {
    // keep them where people look: inside the shop (a few drift over the pavement by the door)
    const { ROOM } = ctx.layout;
    const x = r.range(ROOM.minX + 0.3, ROOM.maxX - 0.3), z = r.range(ROOM.minZ + 0.3, ROOM.maxZ + (r() < 0.15 ? 1.5 : -0.3)), y = r.range(0.9, ROOM.height - 0.2);
    buf.push([x, y, z], [r(), r.range(0.032, 0.066), r.range(0.4, 1.1), r()], [0, 0, 0, KIND.bokeh], lin(pickColor(r, table), r.range(0.14, 0.3)));
  }
  return buf;
}

/**
 * (5) shimmer sweeping across the lit IMAANS logo on the fascia outside (the start view): glints that
 * light up as the band passes, and a few soft sheen discs travelling with it. Positions follow the
 * lockup's bands (signage.js: crown over IMAANS over SHOES & CLOTHING) as fractions of ZONES.signage.logo.
 */
export function buildShimmer(ctx, n, r) {
  const buf = new Buf(n + 9);
  const L = ctx.layout.ZONES.signage.logo;
  const Z = ctx.layout.ZONES.storefront.z + 0.23;               // just in front of the gold letters on the fascia
  const X = (v) => L.cx + v * L.w / 2, Yy = (f) => L.cy + (f - 0.5) * L.h;   // v: -1…1 across, f: 0…1 up
  for (let i = 0; i < n; i++) {
    const u = r();
    let p, idle = 0;
    if (u < 0.62) p = [X(r.range(-0.97, 0.97)), Yy(r.range(0.15, 0.46)), Z];           // the IMAANS capitals
    else if (u < 0.82) p = [X(r.range(-0.26, 0.26)), Yy(r.range(0.56, 0.92)), Z];       // the crown
    else p = [X(r.range(-0.72, 0.72)), Yy(r.range(0.02, 0.075)), Z];                     // SHOES & CLOTHING
    if (u < 0.8 && r() < 0.2) idle = 1;                                                  // a few glint now and then
    const col = pickColor(r, [[GOLD.light, 0.5], [GOLD.white, 0.35], [GOLD.mid, 0.15]]);
    buf.push(p, [r(), r.range(0.03, 0.07), 0, r()], [idle, 0, 0, KIND.glint], lin(col, 2.8));
  }
  for (let i = 0; i < 9; i++) {
    buf.push([X(-1.0 + i * 0.25), Yy(0.3 + (i % 2) * 0.1), Z + 0.02], [r(), 0.2 * L.w, 0, i / 9 * 0.5], [0, 0, 0, KIND.sheen], lin(GOLD.light, 1.0));
  }
  return buf;
}

/** (4) a few tiny glowing crowns + butterflies — instanced two-half quads (wings / crown halves). */
export function buildCritters(ctx, r) {
  const Z = ctx.layout.ZONES;
  const gi = Z.glassIsland, sw = Z.shoeWall1, cr = Z.clothingRail, co = Z.counter, man = Z.windowMannequins.items;
  const wx = (man[0].cx + man[1].cx) / 2, wz = (man[0].cz + man[1].cz) / 2;
  const list = [
    // butterflies: anchor, orbit radius, half-span (m), colour
    { k: KIND.butterfly, at: [gi.cx, 1.35, gi.cz], R: 0.75, s: 0.044, c: lin(GOLD.light, 1.5) },
    { k: KIND.butterfly, at: [gi.cx + 0.1, 1.8, gi.cz + 0.1], R: 0.55, s: 0.04, c: lin(GOLD.rose, 1.35) },
    { k: KIND.butterfly, at: [sw.x[1] + 0.35, 2.0, sw.cz], R: 0.4, s: 0.038, c: lin(GOLD.mid, 1.6) },
    { k: KIND.butterfly, at: [wx + 0.2, 1.9, wz - 0.3], R: 0.35, s: 0.042, c: lin(GOLD.light, 1.5) },
    { k: KIND.butterfly, at: [cr.x[0] - 0.35, 1.7, cr.cz], R: 0.4, s: 0.04, c: lin(GOLD.aqua, 1.2) },
    { k: KIND.butterfly, at: [0.0, 2.3, 5.6], R: 0.6, s: 0.038, c: lin(GOLD.cream, 1.45) },            // outside, by the door
    // crowns: hover + turn gently toward the viewer (the island crown "crowns" the hero shoes)
    { k: KIND.crown, at: [gi.cx, 1.02, gi.cz], R: 0, s: 0.066, c: lin(GOLD.light, 1.8) },
    { k: KIND.crown, at: [wx, 2.1, wz], R: 0, s: 0.064, c: lin(GOLD.light, 1.6) },
    { k: KIND.crown, at: [co.cx - 0.1, 1.5, co.cz], R: 0, s: 0.06, c: lin(GOLD.light, 1.6) },
  ];
  const n = list.length;
  const g = new THREE.InstancedBufferGeometry();
  // two quads (the halves): x span 0..1 from the body, y -1..1, z side ±1
  const corner = [], index = [];
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1, o = s * 4;
    corner.push(0, -1, side, 1, -1, side, 0, 1, side, 1, 1, side);
    index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(corner, 3));
  g.setIndex(index);
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 3);
  list.forEach((it, i) => {
    A.set([r(), it.s, it.R, i / n * 0.5], i * 4);     // rank: crowns/butterflies stay until the slider is low
    B.set([...it.at, it.k], i * 4);
    C.set(it.c, i * 3);
  });
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(C, 3));
  g.instanceCount = n;
  return g;
}
