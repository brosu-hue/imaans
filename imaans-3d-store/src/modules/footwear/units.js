// footwear — the real shop's shoe fixtures, built from core/layout.js ZONES (docs/REAL-LAYOUT.md):
//   shoeWall1 / shoeWall2  espresso wall units on the left wall: lit tiers × 4 shoes, a warm LED line on every
//                          shelf lip + a strip under it, a pelmet LED; the back is painted with each tier's LED
//                          wash (unlit 'wash' texture, see tierWashTexture) so the tiers read as lit
//   shoeShelfBack          the narrow unit on the partition (same build): 8 tiers × 2
//   shoeStep1              ivory satin three-step podium: one pair per step
//   glassIsland            ivory body on a black kick, black-metal posts + rim, a glass vitrine and glass top
//                          (plain transparent glass, no transmission): 5 shoes under the glass, 5 on top
// Every fixture is built facing +z (w on local x, d on local z, back against the wall at −d/2) and baked straight
// into world space (yaw + centre from its zone) in the caller's Batch. Batch keys: wood · ivory · metal · glass ·
// glow (LED ramp) · wash. Each builder returns its display units, one per shoe (or per pair on the step):
//   { fixture, tier, maxH (clear height above the surface), prime (lower = better seen), outer (floor/top tier),
//     shoes: [{ pos, yaw, mirror }] }  — world space; mirror = right foot (the viewer sees the outer side).
import * as THREE from 'three';
import { mat4, rbox, uvBox } from './util.js';
import { rampUV } from './progs.js';

/** Joinery sizes (m): carcass sides, shelf, lip, back panel inset, recessed kick, pelmet, top cap, gap to the wall. */
export const U = { side: 0.028, shelfT: 0.02, lipH: 0.036, lipD: 0.018, back: 0.012, kick: 0.08, pelmet: 0.1, cap: 0.022, off: 0.005 };
const EYE_Y = 1.2;          // the best-seen shelf height: prime slots first
const LED_FACE = 1.6, LED_UNDER = 3.0, LED_PELMET = 3.2, LED_VITRINE = 2.4;   // glow ramp levels (× warm white)

/** Local (fixture) → world transform for a zone. */
function frame(Z) {
  const T = mat4([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  const c = Math.cos(Z.yaw), s = Math.sin(Z.yaw);
  return {
    add: (batch, key, geo, pos, rot = [0, 0, 0]) => batch.add(key, geo, T.clone().multiply(mat4(pos, rot))),
    pos: (x, y, z) => [Z.cx + x * c + z * s, y, Z.cz - x * s + z * c],
    yaw: (a) => a + Z.yaw,
  };
}

/**
 * A shoe at local (x, y, z), toe along local (tx, tz). Shoes are modelled as a left foot (toe +x, medial +z);
 * the right foot's outer side lies to the right of its toe, so the foot is picked for a viewer at local (vx, vz).
 */
function pose(F, x, y, z, tx, tz, vx = 0, vz = 1) {
  return { pos: F.pos(x, y, z), yaw: F.yaw(Math.atan2(-tz, tx)), mirror: (-tz * vx + tx * vz) > 0 };
}

/**
 * Wall unit (shoeWall1 / shoeWall2 / shoeShelfBack). Equal clear height on every tier, the top one under the pelmet.
 * toes(i) → −1 / +1: toe towards local −x / +x for column i (angled `angle` rad towards the viewer).
 */
export function wallUnit(batch, id, Z, { tiers, perTier, angle = 0.42, toes = () => -1, rng }) {
  const F = frame(Z);
  const { side, shelfT, lipH, lipD, back, kick, pelmet, cap, off } = U;
  const w = Z.w, h = Z.h, zb = -Z.d / 2 + off, zf = Z.d / 2, D = zf - zb, zc = (zb + zf) / 2;
  const iw = w - 2 * side;
  const y0 = kick + shelfT;                                  // floor of the bottom tier
  const pitch = (h - pelmet - y0 + shelfT) / tiers;          // tier pitch
  const clear = pitch - shelfT;
  // carcass: two sides, top cap, pelmet board + its LED, a recessed black kick
  const sideG = rbox(side, h, D, 0.004, 1);
  for (const sx of [-1, 1]) F.add(batch, 'wood', sideG, [sx * (w / 2 - side / 2), h / 2, zc]);
  F.add(batch, 'wood', rbox(w, cap, D, 0.004, 1), [0, h - cap / 2, zc]);
  F.add(batch, 'wood', rbox(iw, pelmet - cap, 0.02, 0.003, 1), [0, h - cap - (pelmet - cap) / 2, zf - 0.01]);
  F.add(batch, 'glow', rampUV(new THREE.BoxGeometry(iw - 0.02, 0.006, 0.014), LED_PELMET), [0, h - pelmet - 0.003, zf - 0.03]);
  F.add(batch, 'metal', uvBox(new THREE.BoxGeometry(iw, kick, 0.018)), [0, kick / 2, zf - 0.035]);
  // back: ONE quad, v = tier coordinate (0 = a tier's floor, 1 = the next floor), so the wash repeats per tier
  const ph = h - pelmet - kick, py = kick + ph / 2;
  const panel = new THREE.PlaneGeometry(iw, ph);
  { const p = panel.attributes.position, uv = panel.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / iw + 0.5, (p.getY(i) + py - y0) / pitch); }
  F.add(batch, 'wash', panel, [0, py, zb + back]);
  // shelves: board + lip (a 6 mm fence above the surface) + a warm line on the lip face + the strip under the lip
  const sd = D - back - lipD;
  const shelf = uvBox(new THREE.BoxGeometry(iw, shelfT, sd));          // plain boxes: 12 triangles a board
  const lip = uvBox(new THREE.BoxGeometry(iw, lipH, lipD));
  const ledFace = rampUV(new THREE.BoxGeometry(iw - 0.012, 0.004, 0.003), LED_FACE);
  const ledUnder = rampUV(new THREE.BoxGeometry(iw - 0.02, 0.005, 0.012), LED_UNDER);
  const units = [];
  const slotW = iw / perTier;
  for (let k = 0; k < tiers; k++) {
    const y = y0 + k * pitch, lipTop = y + 0.006;
    F.add(batch, 'wood', shelf, [0, y - shelfT / 2, zb + back + sd / 2]);
    F.add(batch, 'wood', lip, [0, lipTop - lipH / 2, zf - lipD / 2]);
    F.add(batch, 'glow', ledFace, [0, lipTop - lipH + 0.008, zf + 0.0015]);
    if (k > 0) F.add(batch, 'glow', ledUnder, [0, lipTop - lipH - 0.0025, zf - lipD - 0.008]);   // washes the tier below
    const zs = zb + back + sd / 2;
    for (let i = 0; i < perTier; i++) {
      const d = toes(i), a = angle + rng.range(-0.06, 0.06);
      const x = -iw / 2 + (i + 0.5) * slotW + rng.range(-0.01, 0.01);
      units.push({ fixture: id, tier: k, col: i, maxH: clear, outer: k === 0 || k >= tiers - 1 || (tiers > 8 && k === 1),
        prime: Math.round(Math.abs(y + 0.1 - EYE_Y) * 100) + i * 1e-3,
        shoes: [pose(F, x, y, zs + rng.range(-0.01, 0.01), d * Math.cos(a), Math.sin(a))] });
    }
  }
  return { units: units.sort((a, b) => a.prime - b.prime), clear, pitch };
}

/** Ivory three-step podium against the wall: a pair per step, toes towards local −x (the door), the pair side by side. */
export function stepUnit(batch, id, Z, { steps = 3, rng }) {
  const F = frame(Z);
  const zb = -Z.d / 2 + U.off, zf = Z.d / 2, dd = (zf - zb) / steps, rise = Z.h / steps;
  const units = [];
  for (let j = 0; j < steps; j++) {                         // j = 0: the front (lowest) step
    const top = (j + 1) * rise, z1 = zf - j * dd, zc = z1 - dd / 2;
    F.add(batch, 'ivory', rbox(Z.w, top, dd, 0.008, 2), [0, top / 2, zc]);
    const a = 0.12 + rng.range(-0.03, 0.03), tx = -Math.cos(a), tz = Math.sin(a);
    const nx = Math.sin(a), nz = Math.cos(a);                // across the pair, towards the viewer
    const x = 0.02 + rng.range(-0.02, 0.02), off = 0.058, stag = 0.035;
    const A = pose(F, x + nx * off, top, zc + nz * off, tx, tz);
    const B = pose(F, x - nx * off + tx * stag, top, zc - nz * off + tz * stag, tx, tz);
    B.mirror = !A.mirror;                                    // a real pair: the other foot
    B.yaw += 0.05;
    units.push({ fixture: id, tier: j, maxH: Infinity, outer: false, pair: true, prime: Math.abs(top - 0.9), shoes: [A, B] });
  }
  return { units: units.sort((a, b) => a.prime - b.prime) };
}

/**
 * Glass island: ivory body (to the deck), black kick, a glass vitrine with black posts, channel and rim, glass top.
 * Five shoes on the deck under the glass, five on the top; all angled for the front-left aisle (the Tour view),
 * toes to the front-right.
 */
export function islandUnit(batch, id, Z, { perTier = 5, rng }) {
  const F = frame(Z);
  const W = Z.w, L = Z.d, H = Z.h;
  const kick = 0.06, deck = 0.42, rim = 0.02, post = 0.022, gT = 0.01, pane = 0.008;
  const vh = H - rim - deck;                                 // vitrine glass height
  F.add(batch, 'metal', rbox(W - 0.06, kick, L - 0.06, 0.004, 1), [0, kick / 2, 0]);
  F.add(batch, 'ivory', rbox(W, deck - kick, L, 0.01, 2), [0, (deck + kick) / 2, 0]);
  const postG = rbox(post, vh, post, 0.002, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.add(batch, 'metal', postG, [sx * (W / 2 - post / 2), deck + vh / 2, sz * (L / 2 - post / 2)]);
  const rimX = rbox(W, rim, rim, 0.002, 1), rimZ = rbox(rim, rim, L - 2 * rim, 0.002, 1);
  const chX = rbox(W - 2 * post, 0.012, 0.016, 0.002, 1), chZ = rbox(0.016, 0.012, L - 2 * post, 0.002, 1);
  for (const s of [-1, 1]) {
    F.add(batch, 'metal', rimX, [0, H - rim / 2, s * (L / 2 - rim / 2)]);
    F.add(batch, 'metal', rimZ, [s * (W / 2 - rim / 2), H - rim / 2, 0]);
    F.add(batch, 'metal', chX, [0, deck + 0.006, s * (L / 2 - post / 2)]);
    F.add(batch, 'metal', chZ, [s * (W / 2 - post / 2), deck + 0.006, 0]);
    // glass sides + ends, and a warm LED line under each long rim (lights the shoes in the case)
    F.add(batch, 'glass', new THREE.BoxGeometry(pane, vh - 0.012, L - 2 * post), [s * (W / 2 - post / 2), deck + 0.012 + (vh - 0.012) / 2, 0]);
    F.add(batch, 'glass', new THREE.BoxGeometry(W - 2 * post, vh - 0.012, pane), [0, deck + 0.012 + (vh - 0.012) / 2, s * (L / 2 - post / 2)]);
    F.add(batch, 'glow', rampUV(new THREE.BoxGeometry(0.006, 0.005, L - 0.12), LED_VITRINE), [s * (W / 2 - post - 0.006), H - rim - 0.004, 0]);
  }
  F.add(batch, 'glass', new THREE.BoxGeometry(W - 2 * rim + 0.004, gT, L - 2 * rim + 0.004), [0, H - gT / 2, 0]);
  const units = [];
  const view = [-0.63, 0.78];                                 // towards the front-left aisle
  const pitch = (L - 0.2) / (perTier - 1);
  for (const [tier, y, maxH] of [[1, H, Infinity], [0, deck, vh - 0.012]]) {
    for (let k = 0; k < perTier; k++) {
      const a = Math.atan2(0.63, 0.78) + rng.range(-0.12, 0.12) + (tier ? 0 : 0.1);
      const x = rng.range(-0.02, 0.02) + (tier ? 0 : 0.015), z = (k - (perTier - 1) / 2) * pitch + rng.range(-0.01, 0.01);
      units.push({ fixture: id, tier, col: k, maxH, outer: false, glass: tier === 1, prime: (1 - tier) * 10 + k,
        shoes: [pose(F, x, y, z, Math.cos(a), Math.sin(a), view[0], view[1])] });
    }
  }
  return { units, deck, top: H };
}

/**
 * The tier wash painted on the wall units' backs (unlit): dark espresso with a fine vertical grain, a warm LED wash
 * falling from under each shelf, darker towards the uprights. v = tier coordinate (repeats), u = across the unit.
 */
export function tierWashTexture(kit, pitchClear = 0.92) {
  const tex = kit.canvasTexture(256, 128, (g, w, h) => {
    const R = kit.rng(5656);
    const v = g.createLinearGradient(0, 0, 0, h);                // canvas top = v 1 (under the next shelf)
    const t = 1 - pitchClear;                                   // the next shelf covers v > pitchClear
    v.addColorStop(0, '#caa982'); v.addColorStop(t + 0.02, '#c9a47a'); v.addColorStop(t + 0.12, '#8d7258');
    v.addColorStop(t + 0.4, '#56483c'); v.addColorStop(0.85, '#3b332d'); v.addColorStop(1, '#302a25');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.06;                                        // vertical grain
    for (let i = 0; i < 160; i++) { g.fillStyle = R() < 0.5 ? '#000000' : '#ffe7c4'; g.fillRect(R() * w, 0, 1 + R() * 2, h); }
    g.globalAlpha = 1;
    const e = g.createLinearGradient(0, 0, w, 0);                // darker into the corners by the uprights
    e.addColorStop(0, 'rgba(18,14,11,0.55)'); e.addColorStop(0.08, 'rgba(18,14,11,0.1)'); e.addColorStop(0.2, 'rgba(18,14,11,0)');
    e.addColorStop(0.8, 'rgba(18,14,11,0)'); e.addColorStop(0.92, 'rgba(18,14,11,0.1)'); e.addColorStop(1, 'rgba(18,14,11,0.55)');
    g.fillStyle = e; g.fillRect(0, 0, w, h);
  }, { repeat: true });
  tex.name = 'footwear:tierWash';
  return tex;
}
