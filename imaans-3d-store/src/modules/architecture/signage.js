// IMAANS signage. One gold lettering atlas (gild program) + one additive glow atlas (add program):
//  • the lit logo on the black fascia outside (layout ZONES.signage.logo): crown, IMAANS in Roman
//    capitals (glyphs.js), rules + SHOES & CLOTHING in spaced caps. Gold metal faces stand off the board
//    on darker "returns"; LEDs behind them wash the fascia (halo quad, depth-occluded by the letters).
//  • the lit logo panel on the right wall inside (ZONES.signage.panel): the same lockup on a black board.
//  • STAFF ONLY lettering on the staff door, the exit sign face above it, and the opening-hours decal on
//    the right window (reads from the pavement), computed from brand.hours.
import * as THREE from 'three';
import { drawCrown, goldGradient } from '../../core/catalog.js';
import { drawWord, wordWidth } from './glyphs.js';
import { mat4 } from './util.js';
import { ZONES } from '../../core/layout.js';

// ---------------------------------------------------------------- metric layout of the wordmark (m)
// The crown is the big element of the real fascia sign (≈ 1.1 m tall on the 1.7 m fascia): at scale 1 the
// lockup is ≈ 2.0 × 0.98 m, so ZONES.signage.logo (h 1.10) scales it to ≈ 2.25 m — whole in the start view.
const CAP = 0.32, TRACK = 200, TAG_CAP = 0.06, CROWN_W = 0.7, PAD = 0.015;
const WW = wordWidth('IMAANS', TRACK) / 1000 * CAP;             // wordmark width ≈ 1.97 m
const CROWN_H = CROWN_W * 126 / 192;
const Y_WORD = TAG_CAP + 0.06, Y_CROWN = Y_WORD + CAP + 0.045;   // baselines above the tagline baseline
export const LOCKUP = { w: WW + 2 * PAD, h: Y_CROWN + CROWN_H + 2 * PAD };  // metric size at scale 1 (≈ 2.0 × 0.98 m)
const HALO_M = 0.2;                                               // halo quad margin around the letters (m, at scale 1)
const SG = ZONES.signage, FASCIA_Z = ZONES.storefront.z + 0.18;  // front face of the fascia board (storefront.js)
const DOOR = ZONES.partition.staffDoor, PZ = ZONES.partition.z;
const STAFF = { w: 0.34, h: 0.085, x: DOOR.cx, y: 1.6, z: PZ - 0.005 };

// ---------------------------------------------------------------- atlas regions (px @ 2048 × AH0)
// The lockup rect keeps the lockup's aspect (the quads map it 1:1); staff lettering + hours decal below it.
const LH = Math.ceil(2048 * LOCKUP.h / LOCKUP.w);
const AH0 = LH + 320;
const R = { lock: [0, 0, 2048, LH], staff: [0, LH + 10, 600, 150], hours: [640, LH + 10, 700, 302] };
const G = { halo: [0, 0, 1024, Math.ceil(1024 * (LOCKUP.h + 2 * HALO_M) / (LOCKUP.w + 2 * HALO_M))], exit: [0, 760, 256, 102] }; // glow atlas (px @ 1024²)

const GOLD_MID = '#d9ab48';

function spacedText(g, txt, cx, baseline, font, track, fill, align = 'center') {
  g.font = font; g.fillStyle = fill; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const ch = [...txt], ws = ch.map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + track * (ch.length - 1);
  let x = align === 'center' ? cx - total / 2 : align === 'right' ? cx - total : cx;
  ch.forEach((c, i) => { g.fillText(c, x, baseline); x += ws[i] + track; });
  return total;
}
/** Font size (px) whose cap height is `cap` px for this family (measured, falls back to 0.7 em). */
function capFont(g, family, weight, cap) {
  g.font = `${weight} 100px ${family}`;
  const m = g.measureText('H'); const a = m.actualBoundingBoxAscent;
  const k = a > 20 && a < 100 ? a / 100 : 0.7;
  return `${weight} ${(cap / k).toFixed(2)}px ${family}`;
}

/** The wordmark lockup painted into rect [x, y, w, h] (px) whose metric size is LOCKUP ± margin. */
function paintLockup(g, fonts, x, y, w, h, margin, mode) {
  const k = w / (LOCKUP.w + 2 * margin);                    // px per metre
  const X = xm => x + (margin + PAD + xm) * k, Y = ym => y + h - (margin + PAD + ym) * k;
  const gold = mode === 'gold';
  // IMAANS
  drawWord(g, 'IMAANS', X(0), Y(Y_WORD), CAP * k, TRACK, gold ? (gg) => goldGradient(gg, 1000, 0) : '#fff');
  // crown
  drawCrown(g, X(WW / 2), Y(Y_CROWN) - 59 / 192 * CROWN_W * k, CROWN_W * k, gold ? goldGradient(g, Y(Y_CROWN + CROWN_H), Y(Y_CROWN)) : '#fff');
  // tagline + rules
  const tagFont = capFont(g, fonts.sans, 500, TAG_CAP * k);
  const tw = spacedText(g, 'SHOES & CLOTHING', X(WW / 2), Y(0), tagFont, TAG_CAP * k * 0.62, gold ? '#e6c170' : '#fff');
  const gap = 0.05 * k, ry = Y(TAG_CAP * 0.5), rt = Math.max(1.5, 0.0045 * k);
  g.fillStyle = gold ? GOLD_MID : '#fff';
  g.fillRect(X(0), ry - rt / 2, X(WW / 2) - tw / 2 - gap - X(0), rt);
  g.fillRect(X(WW / 2) + tw / 2 + gap, ry - rt / 2, X(WW) - (X(WW / 2) + tw / 2 + gap), rt);
}

/** "Mon–Thu 09:00–17:30", … grouped from brand.hours.days (never typed). */
export function hoursLines(hours) {
  const days = (hours && hours.days) || [];
  const key = d => (d.closed ? 'closed' : `${d.open}–${d.close}`);
  const abbr = d => (d.label || d.day || '').slice(0, 3);
  const out = [];
  for (let i = 0; i < days.length;) {
    let j = i; while (j + 1 < days.length && key(days[j + 1]) === key(days[i])) j++;
    out.push({ days: i === j ? abbr(days[i]) : `${abbr(days[i])}–${abbr(days[j])}`, time: days[i].closed ? 'Closed' : `${days[i].open} – ${days[i].close}` });
    i = j + 1;
  }
  return out;
}

function paintHours(g, fonts, [x, y, w, h], brand) {
  const lines = hoursLines(brand.hours);
  // first sentence of the note ("Closed on public holidays.") — no regex lookbehind (iOS 15 Safari)
  const n0 = ((brand.hours && brand.hours.note) || '').trim(), dot = n0.indexOf('. ');
  const note = dot > 0 ? n0.slice(0, dot + 1) : n0.length <= 40 ? n0 : '';
  const cream = '#f4ecdc';
  // smoked-vinyl backing panel with a thin gold keyline: the cream type stays readable over the lit street
  // (bare thin type on clear glass vanished into the café opposite)
  {
    const r = h * 0.07, i0 = h * 0.035;
    const rr = (x0, y0, ww, hh, rad) => { g.beginPath(); g.moveTo(x0 + rad, y0); g.lineTo(x0 + ww - rad, y0); g.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + rad); g.lineTo(x0 + ww, y0 + hh - rad); g.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - rad, y0 + hh); g.lineTo(x0 + rad, y0 + hh); g.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - rad); g.lineTo(x0, y0 + rad); g.quadraticCurveTo(x0, y0, x0 + rad, y0); g.closePath(); };
    rr(x + 2, y + 2, w - 4, h - 4, r); g.fillStyle = 'rgba(9,8,8,0.7)'; g.fill();
    rr(x + i0, y + i0, w - 2 * i0, h - 2 * i0, r * 0.6); g.strokeStyle = GOLD_MID; g.lineWidth = Math.max(1.5, h * 0.006); g.stroke();
  }
  const rows = lines.length + (note ? 1 : 0) + 2;
  const lh = h / (rows + 0.9);
  const top = y + lh * 0.2;
  drawCrown(g, x + w / 2, top + lh * 0.66, lh * 0.82, goldGradient(g, top + lh * 0.3, top + lh * 1.0));
  spacedText(g, 'OPENING HOURS', x + w / 2, top + lh * 1.95, capFont(g, fonts.sans, 600, lh * 0.4), lh * 0.16, '#e6c170');
  const f = capFont(g, fonts.sans, 500, lh * 0.42);
  lines.forEach((l, i) => {
    const b = top + lh * (3.05 + i);
    g.font = f; g.fillStyle = cream; g.textBaseline = 'alphabetic';
    g.textAlign = 'left'; g.fillText(l.days, x + w * 0.12, b);
    g.textAlign = 'right'; g.fillText(l.time, x + w * 0.88, b);
  });
  if (note) { g.textAlign = 'center'; g.fillStyle = 'rgba(244,236,220,0.8)'; g.font = capFont(g, fonts.sans, 400, lh * 0.3); g.fillText(note, x + w / 2, top + lh * (3.1 + lines.length)); }
}

function paintExit(g, [x, y, w, h]) {
  g.save(); g.translate(x, y);
  g.fillStyle = '#0f8f4c'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, h * 0.08);
  const u = h / 10; g.fillStyle = '#f4fff8'; g.strokeStyle = '#f4fff8'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.fillRect(w - 3.2 * u, 1.5 * u, 2.2 * u, 7 * u); g.fillStyle = '#0f8f4c'; g.fillRect(w - 2.8 * u, 1.9 * u, 1.4 * u, 6.4 * u); g.fillStyle = '#f4fff8';
  const fx = w - 6.4 * u;
  g.beginPath(); g.arc(fx + 0.6 * u, 2.2 * u, 0.85 * u, 0, Math.PI * 2); g.fill();
  g.lineWidth = 1.25 * u;
  g.beginPath(); g.moveTo(fx, 3.6 * u); g.lineTo(fx - 0.6 * u, 6 * u); g.lineTo(fx + 0.9 * u, 7.1 * u); g.lineTo(fx + 1.2 * u, 8.8 * u); g.stroke();
  g.beginPath(); g.moveTo(fx - 0.6 * u, 6 * u); g.lineTo(fx - 1.9 * u, 7.4 * u); g.lineTo(fx - 3.0 * u, 7.2 * u); g.stroke();
  g.beginPath(); g.moveTo(fx - 2.0 * u, 4.6 * u); g.lineTo(fx - 0.5 * u, 3.6 * u); g.lineTo(fx + 1.0 * u, 4.2 * u); g.lineTo(fx + 1.9 * u, 5.6 * u); g.stroke();
  g.lineWidth = 1.1 * u; const ax = 1.6 * u, ay = 5 * u;
  g.beginPath(); g.moveTo(ax + 6 * u, ay); g.lineTo(ax, ay); g.moveTo(ax + 2 * u, ay - 2 * u); g.lineTo(ax, ay); g.lineTo(ax + 2 * u, ay + 2 * u); g.stroke();
  g.restore();
}

/** Soft glow of `paint` (white shapes) at three blur radii, via offscreen shadows (Safari-safe: no ctx.filter). */
function glowOf(g, [x, y, w, h], paint, passes, rgb) {
  const q = 2, c = document.createElement('canvas'); c.width = Math.ceil(w / q); c.height = Math.ceil(h / q);
  const m = c.getContext('2d'); m.scale(1 / q, 1 / q); paint(m, 0, 0, w, h);
  const off = 4 * (w + h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.globalCompositeOperation = 'lighter';
  for (const [blur, a] of passes) {
    g.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; g.shadowBlur = blur; g.shadowOffsetX = off; g.shadowOffsetY = 0;
    g.drawImage(c, x - off, y, w, h);
  }
  g.restore();
}

/** Gold lettering atlas (2048·sc × 1088·sc, transparent background). */
export function paintGoldAtlas(g, fonts, brand, sc = 1) {
  const rs = (r) => r.map(v => v * sc);
  g.clearRect(0, 0, 2048 * sc, AH0 * sc);
  const [lx, ly, lw, lh] = rs(R.lock); paintLockup(g, fonts, lx, ly, lw, lh, 0, 'gold');
  { const [x, y, w, h] = rs(R.staff);
    let cap = h * 0.36, tr = h * 0.14; g.font = capFont(g, fonts.sans, 500, cap);
    const w0 = [...'STAFF ONLY'].reduce((a, c) => a + g.measureText(c).width, 0) + tr * 9;
    if (w0 > w * 0.92) { cap *= w * 0.92 / w0; tr *= w * 0.92 / w0; }
    spacedText(g, 'STAFF ONLY', x + w / 2, y + h * 0.62, capFont(g, fonts.sans, 500, cap), tr, '#e6c170');
    g.fillStyle = GOLD_MID; g.fillRect(x + w * 0.34, y + h * 0.8, w * 0.32, Math.max(1, h * 0.03)); }
  paintHours(g, fonts, rs(R.hours), brand);
}

/** Additive glow atlas (1024·sc square, black background): wordmark halo + exit sign face. */
export function paintGlowAtlas(g, fonts, sc = 1) {
  const GW = 1024 * sc;
  g.fillStyle = '#000'; g.fillRect(0, 0, GW, GW);
  const hr = G.halo.map(v => v * sc);
  const kpx = hr[2] / (LOCKUP.w + 2 * HALO_M);
  glowOf(g, hr, (m, x, y, w, h) => paintLockup(m, fonts, x, y, w, h, HALO_M, 'mask'),
    [[0.012 * kpx, 1], [0.035 * kpx, 0.75], [0.1 * kpx, 0.45]], [255, 196, 112]);
  paintExit(g, G.exit.map(v => v * sc));
}

// ------------------------------------------------------------------------------------------------
export function buildSignage(ctx, batch, AM) {
  const { kit, tier, q, brand } = ctx;
  const fonts = ctx.fonts || { display: 'Georgia, serif', sans: 'sans-serif' };
  const sc = tier === 'low' ? 0.5 : 1;
  const AW = 2048 * sc, AH = AH0 * sc, GW = 1024 * sc;
  // ---------------- gold lettering atlas ----------------
  const goldTex = kit.canvasTexture(AW, AH, (g) => paintGoldAtlas(g, fonts, brand, sc));
  goldTex.anisotropy = q.anisotropy;
  // ---------------- additive glow atlas ----------------
  const glowTex = kit.canvasTexture(GW, GW, (g) => paintGlowAtlas(g, fonts, sc));
  glowTex.anisotropy = q.anisotropy;

  const gold = AM.gild('gold', goldTex, { metalness: 0.9, roughness: 0.3, emissive: new THREE.Color(0.34, 0.25, 0.12), depthWrite: true });
  const goldBack = AM.gild('goldReturn', goldTex, { color: '#6a5a45', metalness: 0.85, roughness: 0.4, emissive: new THREE.Color(0.05, 0.035, 0.02), depthWrite: true });
  const decal = AM.gild('decal', goldTex, { metalness: 0, roughness: 0.6, emissive: new THREE.Color(0.24, 0.22, 0.19) });
  const halo = AM.add('halo', glowTex, new THREE.Color(1, 1, 1).multiplyScalar(2.2));
  const exitM = AM.add('exit', glowTex, new THREE.Color(1, 1, 1).multiplyScalar(1.15));

  // ---------------- geometry helpers ----------------
  const parts = { gold: [], back: [], decal: [], halo: [], exit: [] };
  /** Quad w×h centred at pos, facing `face` ('+z','-z','+x','-x'), showing atlas rect r (px) of an atlas W×H. */
  const quad = (list, w, h, pos, face, r, W = 2048, Hh = AH0) => {
    const geo = new THREE.PlaneGeometry(w, h);
    if (face === '-z') geo.rotateY(Math.PI); else if (face === '+x') geo.rotateY(Math.PI / 2); else if (face === '-x') geo.rotateY(-Math.PI / 2);
    const uv = geo.attributes.uv, u0 = r[0] / W, u1 = (r[0] + r[2]) / W, v1 = 1 - r[1] / Hh, v0 = 1 - (r[1] + r[3]) / Hh;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
    geo.translate(pos[0], pos[1], pos[2]); list.push(geo);
  };

  // ---------------- the lit logo on the fascia (outside, facing the pavement) ----------------
  // Lockup scaled to the logo height (ZONES.signage.logo); letters 45 mm off the board on darker returns, halo behind.
  const lock = (k, c, face, off) => {    // off(d) → world position d metres out from the board at the centre c
    quad(parts.gold, LOCKUP.w * k, LOCKUP.h * k, off(0.045 * k), face, R.lock);
    quad(parts.back, LOCKUP.w * k, LOCKUP.h * k, off(0.025 * k), face, R.lock);
    quad(parts.halo, (LOCKUP.w + 2 * HALO_M) * k, (LOCKUP.h + 2 * HALO_M) * k, off(0.006), face, G.halo, 1024, 1024);
  };
  const kF = SG.logo.h / LOCKUP.h;
  lock(kF, null, '+z', (d) => [SG.logo.cx, SG.logo.cy, FASCIA_Z + d]);

  // ---------------- the lit logo panel on the right wall (inside, facing -x) ----------------
  {
    const P = SG.panel, py = (P.y[0] + P.y[1]) / 2, bx = P.x;                 // board centre (0.03 thick: front at P.x - 0.015)
    batch.add('darkFree', new kit.RoundedBoxGeometry(0.03, P.h, P.w, 2, 0.006), mat4([bx, py, P.cz]));
    batch.add('brass', new kit.RoundedBoxGeometry(0.012, P.h + 0.014, P.w + 0.014, 1, 0.003), mat4([bx + 0.012, py, P.cz]));
    const kP = Math.min((P.w - 0.14) / LOCKUP.w, (P.h - 0.1) / LOCKUP.h);   // the lockup fills the board (≈ 0.86 m wide)
    lock(kP, null, '-x', (d) => [bx - 0.015 - d, py, P.cz]);
  }

  // ---------------- staff door lettering + exit sign ----------------
  quad(parts.decal, STAFF.w, STAFF.h, [STAFF.x, STAFF.y, STAFF.z], '+z', R.staff); // matte gold paint: reads on the black door
  batch.add('steel', new kit.RoundedBoxGeometry(0.3, 0.12, 0.03, 1, 0.006), mat4([DOOR.cx, DOOR.h + 0.2, PZ + 0.015]));
  quad(parts.exit, 0.27, 0.108, [DOOR.cx, DOOR.h + 0.2, PZ + 0.0305], '+z', G.exit, 1024, 1024);

  // ---------------- opening hours on the right window (reads from the pavement) ----------------
  const hw = 0.5, hh = hw * R.hours[3] / R.hours[2], win = ZONES.storefront.windows[1];
  quad(parts.decal, hw, hh, [(win[0] + win[1]) / 2, 1.3, ZONES.storefront.z + 0.004], '+z', R.hours);

  // ---------------- meshes ----------------
  const out = {};
  const mk = (key, list, mat, order) => {
    if (!list.length) return null;
    const geo = kit.mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
    const m = new THREE.Mesh(geo, mat); m.name = 'arch:sign:' + key; m.renderOrder = order; out[key] = m; return m;
  };
  // returns first (depth), then gold faces, then the halo (occluded by the letters), decals last
  const meshes = [mk('back', parts.back, goldBack, 1), mk('gold', parts.gold, gold, 2), mk('halo', parts.halo, halo, 3), mk('exit', parts.exit, exitM, 3), mk('decal', parts.decal, decal, 3)].filter(Boolean);
  // halo "breathing" on tap (colour only — no per-frame work while idle)
  let pulse = 0; const base = halo.color.clone();
  return {
    meshes, out, gold, halo,
    pulse(d = 1.6) { pulse = d; },
    update(dt) {
      if (pulse <= 0) return;
      pulse = Math.max(0, pulse - dt);
      const k = 1 + 0.9 * Math.sin(Math.min(1, pulse / 1.6) * Math.PI);
      halo.color.copy(base).multiplyScalar(k);
    },
  };
}
