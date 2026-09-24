// Exterior: an evening street in Woodstock, Cape Town. The visit starts OUT HERE on the pavement.
//  • our building's street face (z = 4.465): the upper storey above the fascia, the two neighbouring shops
//    and the pier ends, one painted plane with a hole for the storefront (the fascia + logo are real
//    geometry, storefront.js / signage.js);
//  • the pavement in front of the shop (z 4.46 … 9.2): 450 mm pavers, warm spill from our windows;
//  • far plane (z = 53): blue-hour sky, Devil's Peak and the Table (with a wisp of its "tablecloth"),
//    Lion's Head at the edge, city lights on the lower slopes — far enough to barely parallax;
//  • the opposite side of the street (z = 19.5): Victorian single/double-storey shopfronts in faded
//    pastel paint with cast-iron verandas ("broekie lace"), parapets and gables, lit and shuttered
//    shops, a protea mural. The roofline is real geometry so the mountain shows above it;
//  • the street: wet asphalt with SA road markings (yellow edge lines), pavements, kerbs;
//  • real 3-D veranda posts/roofs, heritage lamp posts and bollards for parallax (shared steel/glow).
// Everything is cheap unlit painted planes (glow / add programs) painted procedurally (seeded rng).
import * as THREE from 'three';
import { mat4 } from './util.js';

const FAR = { z: 53, x0: -50, x1: 50, y0: -2, y1: 48 };
const FAC = { z: 19.5, x0: -40, x1: 40, y0: -0.6, y1: 9.4 };
const PAVE = { z0: 4.46, z1: 9.2, x0: -12, x1: 12 };             // our pavement (kerb at z1)
const GROUND = { z0: PAVE.z1, z1: FAC.z };                        // kerb, road, far kerb + pavement
const ROAD0 = 9.36, ROAD1 = 15.64, KERB_FAR = 15.8, VERANDA_Z = 16.25, LAMPS = [[-5.4, 8.55], [5.8, 8.55]];
const NEAR = { z: 4.465, x0: -12, x1: 12, y0: 0, y1: 9, hole: [-2.45, 2.45, 2.6] };   // our building's street face

const PAINT = [[127, 174, 156], [205, 146, 146], [206, 170, 92], [128, 160, 196], [220, 208, 184], [186, 106, 76], [156, 128, 178], [232, 200, 124], [104, 150, 140]];
const SHOP_LIGHT = { cafe: [255, 186, 112], boutique: [255, 214, 170], gallery: [244, 240, 255], barber: [220, 236, 255], deli: [255, 200, 130], studio: [255, 224, 190], closed: [60, 58, 60] };

function streetPlan(rng) {
  const list = []; let x = FAC.x0;
  const kinds = ['cafe', 'boutique', 'gallery', 'barber', 'closed', 'deli', 'studio', 'closed', 'boutique'];
  while (x < FAC.x1 - 0.5) {
    const w = rng.range(5.4, 8.4), cx = x + w / 2;
    const central = Math.abs(cx) < 12;                  // keep the view to the mountain open
    const storeys = !central && rng() < 0.65 ? 2 : 1;
    const h = storeys === 2 ? rng.range(7.3, 8.6) : rng.range(4.5, 5.5);
    list.push({ x0: x, x1: Math.min(FAC.x1, x + w), h, storeys, gable: rng.pick(['flat', 'flat', 'pediment', 'curved', 'stepped']),
      col: rng.pick(PAINT), kind: rng.pick(kinds), veranda: rng() < 0.75, seed: rng() * 1e6 | 0 });
    x += w;
  }
  // opposite the door: a lit café with a veranda; a protea mural on a nearby double storey
  let best = list[0]; for (const b of list) if (Math.abs((b.x0 + b.x1) / 2) < Math.abs((best.x0 + best.x1) / 2)) best = b;
  best.kind = 'cafe'; best.veranda = true; best.storeys = 1; best.h = Math.min(best.h, 5.2);
  const m = list.find(b => b.storeys === 2 && (b.x0 + b.x1) / 2 > 12) || list[list.length - 2]; if (m) m.mural = true;
  return list;
}

/** Roofline points of one building (parapet + optional gable) left→right. */
function roofline(b) {
  const pts = [[b.x0, b.h]], xc = (b.x0 + b.x1) / 2, w = b.x1 - b.x0;
  if (b.gable === 'pediment') pts.push([xc - w * 0.22, b.h], [xc, b.h + 0.85], [xc + w * 0.22, b.h]);
  else if (b.gable === 'curved') { const r = w * 0.2; for (let i = 0; i <= 8; i++) { const a = Math.PI - (i / 8) * Math.PI; pts.push([xc + Math.cos(a) * r, b.h + Math.sin(a) * 0.75]); } }
  else if (b.gable === 'stepped') pts.push([xc - 1.3, b.h], [xc - 1.3, b.h + 0.35], [xc - 0.7, b.h + 0.35], [xc - 0.7, b.h + 0.7], [xc + 0.7, b.h + 0.7], [xc + 0.7, b.h + 0.35], [xc + 1.3, b.h + 0.35], [xc + 1.3, b.h]);
  pts.push([b.x1, b.h]);
  return pts;
}

const rgb = (c, k = 1) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ---------------------------------------------------------------- the far plane: sky + mountain
function mountainY(x) { // silhouette height (m) on the far plane
  const P = [[-50, 7.5], [-40, 10], [-31, 14.2], [-24, 18.8], [-19, 23], [-15.5, 26.6], [-14, 27.4], [-12.5, 26.2], [-9.5, 22.4], [-6.5, 20.2],
    [-4.2, 20.6], [-2.4, 21.9], [0, 22.2], [6, 22.35], [12, 22.1], [18, 22.4], [23, 22.2], [26.2, 21.6], [28.4, 18.6], [31, 15], [34.5, 12.6],
    [37.5, 13.2], [40.5, 15.8], [42.6, 17.2], [44.2, 16.6], [46.5, 13.4], [50, 10.4]];
  for (let i = 0; i < P.length - 1; i++) if (x <= P[i + 1][0]) { const t = (x - P[i][0]) / (P[i + 1][0] - P[i][0]); const s = t * t * (3 - 2 * t); return P[i][1] + (P[i + 1][1] - P[i][1]) * (0.35 * t + 0.65 * s); }
  return P[P.length - 1][1];
}
function paintFar(g, W, H, rng) {
  const X = x => (x - FAR.x0) / (FAR.x1 - FAR.x0) * W, Y = y => H - (y - FAR.y0) / (FAR.y1 - FAR.y0) * H, sx = W / (FAR.x1 - FAR.x0);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a1430'); sky.addColorStop(0.28, '#152a5a'); sky.addColorStop(0.5, '#2d4a8c'); sky.addColorStop(0.66, '#5668a8');
  sky.addColorStop(0.8, '#8a7ea4'); sky.addColorStop(0.9, '#c6908c'); sky.addColorStop(1, '#e6a27a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // afterglow behind the Table (west = right)
  { const gx = X(-30), gy = Y(14), grd = g.createRadialGradient(gx, gy, 0, gx, gy, W * 0.45); grd.addColorStop(0, 'rgba(255,170,120,0.35)'); grd.addColorStop(1, 'rgba(255,170,120,0)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
  for (let i = 0; i < 70; i++) { const y = rng() * Y(30); g.fillStyle = `rgba(255,255,255,${rng.range(0.12, 0.55) * (1 - y / Y(30))})`; g.fillRect(rng() * W, y, 1, 1); }
  // mountain body with atmospheric haze toward the base
  g.beginPath(); g.moveTo(0, H);
  // mountain coordinates v = -x run left→right as seen from inside (Devil's Peak left, the Table right = west)
  for (let px = 0; px <= W; px += 2) g.lineTo(px, Y(mountainY(-(FAR.x0 + px / sx)) + Math.sin(px * 0.37) * 0.06 + (rng() - 0.5) * 0.08));
  g.lineTo(W, H); g.closePath();
  const mg = g.createLinearGradient(0, Y(28), 0, Y(0));
  mg.addColorStop(0, '#1a2037'); mg.addColorStop(0.55, '#20263f'); mg.addColorStop(1, '#353a5a');
  g.fillStyle = mg; g.fill();
  g.save(); g.clip();
  // gullies / buttresses: faint darker vertical streaks on the face of the Table and the Peak
  // last light on the upper crags (the north faces keep a faint cool glow)
  { const lg = g.createLinearGradient(0, Y(28), 0, Y(12)); lg.addColorStop(0, 'rgba(120,130,180,0.16)'); lg.addColorStop(1, 'rgba(120,130,180,0)'); g.fillStyle = lg; g.fillRect(0, Y(28), W, Y(12) - Y(28)); }
  for (let i = 0; i < 30; i++) { const v = rng.range(-30, 30), top = mountainY(v); g.fillStyle = `rgba(8,10,22,${rng.range(0.05, 0.12)})`; g.fillRect(X(-v), Y(top - 0.4), rng.range(1, 3), Y(top - rng.range(4, 10)) - Y(top - 0.4)); }
  // city lights on the lower slopes (Walmer Estate, Vredehoek, Zonnebloem)
  for (let i = 0; i < 260; i++) {
    const v = rng.range(-48, 48), top = mountainY(v), y = rng.range(0.5, Math.min(top - 3, 9 + rng() * 5));
    const c = rng() < 0.8 ? [255, rng.range(170, 210) | 0, 120] : [220, 230, 255];
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${rng.range(0.35, 0.9)})`; g.fillRect(X(-v), Y(y), rng() < 0.2 ? 2 : 1, 1);
  }
  g.restore();
  // the tablecloth: a thin soft cloud lying on the plateau, spilling over the edge
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const v = rng.range(-2, 24), x = -v, y = mountainY(v) + rng.range(-0.8, 0.9), rx = rng.range(2, 4.5) * sx, ry = rng.range(0.35, 0.8) * sx;
    const grd = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), rx); grd.addColorStop(0, 'rgba(120,118,150,0.12)'); grd.addColorStop(1, 'rgba(120,118,150,0)');
    g.fillStyle = grd; g.save(); g.translate(X(x), Y(y)); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  g.restore();
  // ridge rim light from the afterglow
  g.strokeStyle = 'rgba(200,160,170,0.22)'; g.lineWidth = 1; g.beginPath();
  for (let px = 0; px <= W; px += 2) { const y = Y(mountainY(-(FAR.x0 + px / sx))); if (px) g.lineTo(px, y); else g.moveTo(px, y); }
  g.stroke();
}

// ---------------------------------------------------------------- the opposite shopfronts
function paintFacade(g, W, H, plan, rng) {
  const sx = W / (FAC.x1 - FAC.x0), sy = H / (FAC.y1 - FAC.y0);
  const X = x => (x - FAC.x0) * sx, Y = y => H - (y - FAC.y0) * sy;
  g.fillStyle = '#10121c'; g.fillRect(0, 0, W, H);
  const dusk = [44, 54, 86];
  for (const b of plan) {
    const r = mulberry(b.seed);
    const x0 = X(b.x0), x1 = X(b.x1), w = x1 - x0, top = Y(b.h + 1);
    const wall = mix(b.col.map(v => v * 0.6), dusk, 0.16);
    // wall: blue-hour above, warm street/shop light below
    const f = g.createLinearGradient(0, Y(b.h + 1), 0, Y(0));
    f.addColorStop(0, rgb(wall, 0.72)); f.addColorStop(0.45, rgb(wall, 0.9)); f.addColorStop(0.8, rgb(mix(wall, [120, 84, 60], 0.3), 1.12)); f.addColorStop(1, rgb(mix(wall, [150, 100, 70], 0.4), 1.2));
    g.fillStyle = f; g.fillRect(x0, top, w, Y(0) - top + 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x1 - 1, top, 1.5, Y(0) - top); // party wall
    // parapet cornice + moulded panel
    g.fillStyle = rgb(mix(wall, [230, 225, 215], 0.25), 1.0); g.fillRect(x0, Y(b.h - 0.35), w, 2); g.fillRect(x0, Y(b.h - 0.9), w, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0 + w * 0.2, Y(b.h - 0.4), w * 0.6, Y(b.h - 0.85) - Y(b.h - 0.4));
    if (b.storeys === 2) { // first floor: tall sash windows (some lit), a balcony
      const n = Math.max(2, Math.round((b.x1 - b.x0) / 2.1)), pitch = w / n;
      for (let i = 0; i < n; i++) {
        const wx = x0 + pitch * (i + 0.5) - 0.45 * sx, lit = r() < 0.62, k = r() * 0.4 + 0.65;
        g.fillStyle = lit ? rgb([255, 196, 128], k * 0.9) : 'rgb(24,28,44)'; g.fillRect(wx, Y(6.6), 0.9 * sx, Y(4.4) - Y(6.6));
        g.fillStyle = 'rgba(16,14,20,0.6)'; g.fillRect(wx + 0.43 * sx, Y(6.6), 1, Y(4.4) - Y(6.6)); g.fillRect(wx, Y(5.5), 0.9 * sx, 1);
        g.fillStyle = rgb(mix(wall, [235, 230, 220], 0.4)); g.fillRect(wx - 1, Y(4.4), 0.9 * sx + 2, 1.5);
      }
      g.fillStyle = 'rgba(210,205,190,0.55)'; for (let px = x0 + 2; px < x1 - 2; px += 3) g.fillRect(px, Y(4.35), 1, Y(3.75) - Y(4.35)); // balcony lace rail
      g.fillRect(x0, Y(4.35), w, 1.5);
    }
    if (b.mural) { // a protea in bold street-art colours on the upper wall
      const cx = (x0 + x1) / 2, cy = Y(b.storeys === 2 ? 5.6 : 4.2), R = Math.min(w * 0.32, 1.9 * sy);
      g.fillStyle = 'rgba(40,120,110,0.85)'; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 11; i++) { const a = -Math.PI * 0.95 + (i / 10) * Math.PI * 0.9; g.fillStyle = i % 2 ? 'rgb(214,92,120)' : 'rgb(236,140,150)';
        g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a) * R * 0.25 + R * 0.3); g.lineTo(cx + Math.cos(a - 0.14) * R, cy + Math.sin(a - 0.14) * R + R * 0.25); g.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1 + R * 0.2); g.closePath(); g.fill(); }
      g.fillStyle = 'rgb(250,210,120)'; g.beginPath(); g.arc(cx, cy + R * 0.32, R * 0.3, 0, Math.PI * 2); g.fill();
    }
    // veranda: corrugated roof edge + cast-iron lace frieze (the posts/roof are real geometry)
    const L = SHOP_LIGHT[b.kind];
    const sy0 = Y(2.95), sy1 = Y(0.15);
    // shopfront under the veranda
    const kk = b.kind === 'closed' ? 0.55 : 0.85;
    if (b.kind === 'closed') { // roller shutter + tags
      g.fillStyle = 'rgb(70,72,80)'; g.fillRect(x0 + 0.5 * sx, sy0, w - 1 * sx, sy1 - sy0);
      g.fillStyle = 'rgba(20,20,26,0.45)'; for (let y = sy0; y < sy1; y += 3) g.fillRect(x0 + 0.5 * sx, y, w - 1 * sx, 1);
      { const c = rng.pick([[150, 60, 70], [50, 110, 120], [170, 130, 50]]); g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.35)`; g.fillRect(x0 + w * 0.2, Y(2.2), w * 0.6, Y(0.7) - Y(2.2)); }
    } else {
      const grd = g.createLinearGradient(0, sy0, 0, sy1);
      grd.addColorStop(0, rgb(L, 0.55 * kk)); grd.addColorStop(1, rgb(L, kk));
      g.fillStyle = grd; g.fillRect(x0 + 0.45 * sx, sy0, w - 0.9 * sx, sy1 - sy0);
      g.fillStyle = 'rgba(40,24,18,0.35)'; // interior silhouettes: shelves, rails, people
      for (let i = 0; i < 5; i++) { const px = x0 + 0.6 * sx + r() * (w - 2 * sx); const hh = r() * 0.7 + 1.2; g.fillRect(px, Y(hh), r() * 5 + 3, Y(0.15) - Y(hh)); }
      g.fillStyle = 'rgba(14,12,14,0.8)'; for (let mx = x0 + 0.45 * sx; mx <= x1 - 0.4 * sx; mx += (w - 0.9 * sx) / 3) g.fillRect(mx - 0.5, sy0, 1.3, sy1 - sy0);
      g.fillStyle = 'rgba(22,16,14,0.6)'; g.fillRect(x0 + w * 0.68, Y(2.4), 1.0 * sx, sy1 - Y(2.4)); // door
    }
    // signboard above the veranda: a painted fascia with a light "lettering" stripe
    g.fillStyle = b.kind === 'closed' ? 'rgb(30,32,40)' : rng.pick(['rgb(22,52,44)', 'rgb(70,24,30)', 'rgb(24,30,60)', 'rgb(28,26,24)']); g.fillRect(x0 + 0.3 * sx, Y(3.75), w - 0.6 * sx, Y(3.3) - Y(3.75));
    if (b.kind !== 'closed') { g.fillStyle = 'rgba(245,225,180,0.65)'; g.fillRect((x0 + x1) / 2 - w * 0.2, Y(3.56), w * 0.4, 1.6); }
    if (b.veranda) {
      g.fillStyle = 'rgba(210,205,195,0.5)';
      for (let px = x0; px < x1; px += 5) { g.beginPath(); g.arc(px + 2.5, Y(3.0), 2.3, Math.PI, 0); g.lineWidth = 1; g.strokeStyle = 'rgba(215,210,200,0.55)'; g.stroke(); }
      g.fillRect(x0, Y(3.02), w, 1);
    }
    if (b.kind === 'barber') { // pole
      const bx = x1 - 0.35 * sx; for (let y = Y(2.3); y < Y(0.9); y += 4) { g.fillStyle = ((y / 4) | 0) % 2 ? 'rgb(220,60,60)' : 'rgb(235,235,240)'; g.fillRect(bx, y, 3, 4); }
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, Y(0.15), w, Y(0) - Y(0.15) + 3); // plinth
  }
  // far-side street lights: slim poles at the kerb with warm pools washing the facades
  g.globalCompositeOperation = 'lighter';
  for (let lx = FAC.x0 + 6; lx < FAC.x1; lx += 13) {
    const cx = X(lx), cy = Y(4.8), grd = g.createRadialGradient(cx, cy, 0, cx, cy, 5.5 * sx);
    grd.addColorStop(0, 'rgba(255,190,120,0.28)'); grd.addColorStop(0.5, 'rgba(255,180,110,0.1)'); grd.addColorStop(1, 'rgba(255,180,110,0)');
    g.fillStyle = grd; g.fillRect(cx - 5.5 * sx, cy - 5.5 * sx, 11 * sx, 11 * sx);
  }
  g.globalCompositeOperation = 'source-over';
  for (let lx = FAC.x0 + 6; lx < FAC.x1; lx += 13) {
    const cx = X(lx); g.fillStyle = 'rgba(14,14,20,0.9)'; g.fillRect(cx - 1, Y(6.2), 2, Y(0) - Y(6.2)); g.fillRect(cx - 1, Y(6.2), 0.8 * sx, 2);
    g.fillStyle = 'rgb(255,226,170)'; g.fillRect(cx + 0.5 * sx, Y(6.15), 0.35 * sx, 2);
  }
}

function paintGround(g, W, H, plan) {
  const sx = W / (FAC.x1 - FAC.x0), sz = H / (GROUND.z1 - GROUND.z0);
  const X = x => (x - FAC.x0) * sx, Zp = z => (z - GROUND.z0) * sz; // near edge (our kerb) at the canvas top
  g.fillStyle = '#15171e'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (const b of plan) { // wet reflections of the lit shops
    if (b.kind === 'closed') continue; const L = SHOP_LIGHT[b.kind];
    const cx = X((b.x0 + b.x1) / 2), w = (b.x1 - b.x0) * sx * 0.55;
    const grd = g.createLinearGradient(0, Zp(ROAD1 - 0.2), 0, Zp(ROAD0));
    grd.addColorStop(0, `rgba(${L[0]},${L[1]},${L[2]},0.3)`); grd.addColorStop(0.5, `rgba(${L[0]},${L[1]},${L[2]},0.08)`); grd.addColorStop(1, `rgba(${L[0]},${L[1]},${L[2]},0)`);
    g.fillStyle = grd; g.fillRect(cx - w / 2, Zp(ROAD1 - 0.2), w, Zp(ROAD0) - Zp(ROAD1 - 0.2));
  }
  for (const [lx] of LAMPS) { const cx = X(lx); const grd = g.createLinearGradient(0, Zp(ROAD0 + 4.7), 0, Zp(ROAD0)); grd.addColorStop(0, 'rgba(255,196,130,0)'); grd.addColorStop(0.7, 'rgba(255,196,130,0.18)'); grd.addColorStop(1, 'rgba(255,196,130,0.05)'); g.fillStyle = grd; g.fillRect(cx - 12, Zp(ROAD0 + 4.7), 24, Zp(ROAD0) - Zp(ROAD0 + 4.7)); }
  // our own shop's glow reaching over the road
  { g.save(); g.translate(X(0), Zp(GROUND.z0)); g.scale(7 * sx, 3.2 * sz);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1); grd.addColorStop(0, 'rgba(255,200,150,0.22)'); grd.addColorStop(1, 'rgba(255,190,140,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore(); }
  g.globalCompositeOperation = 'source-over';
  // road markings: broken white centre line, solid yellow edge lines (South Africa)
  const mid = (ROAD0 + ROAD1) / 2;
  g.fillStyle = 'rgba(200,200,190,0.26)'; for (let x = FAC.x0 + 1; x < FAC.x1; x += 9) g.fillRect(X(x), Zp(mid - 0.06), 3 * sx, 0.12 * sz);
  g.fillStyle = 'rgba(220,180,60,0.34)'; g.fillRect(0, Zp(ROAD0 + 0.39), W, 0.1 * sz); g.fillRect(0, Zp(ROAD1 - 0.34), W, 0.1 * sz);
  // our kerb, the far kerb + far pavement
  g.fillStyle = '#6a655e'; g.fillRect(0, 0, W, Zp(ROAD0));
  g.fillStyle = '#5a5650'; g.fillRect(0, Zp(ROAD1), W, Zp(KERB_FAR) - Zp(ROAD1));
  g.fillStyle = '#35333a'; g.fillRect(0, Zp(KERB_FAR), W, Zp(GROUND.z1) - Zp(KERB_FAR));
  const lw = Math.max(1, 0.012 * sx); g.fillStyle = 'rgba(0,0,0,0.11)';
  for (let z = KERB_FAR; z < GROUND.z1; z += 0.45) g.fillRect(0, Zp(z), W, lw);
  for (let x = FAC.x0; x < FAC.x1; x += 0.45) g.fillRect(X(x), Zp(KERB_FAR), lw, Zp(GROUND.z1) - Zp(KERB_FAR));
  g.globalCompositeOperation = 'lighter';
  for (const b of plan) { if (b.kind === 'closed') continue; const L = SHOP_LIGHT[b.kind];
    const grd = g.createLinearGradient(0, Zp(GROUND.z1), 0, Zp(KERB_FAR + 0.6)); grd.addColorStop(0, `rgba(${L[0]},${L[1]},${L[2]},0.32)`); grd.addColorStop(1, `rgba(${L[0]},${L[1]},${L[2]},0)`);
    g.fillStyle = grd; g.fillRect(X(b.x0), Zp(KERB_FAR + 0.6), X(b.x1) - X(b.x0), Zp(GROUND.z1) - Zp(KERB_FAR + 0.6)); }
  g.globalCompositeOperation = 'source-over';
}

/** Our pavement: 450 mm pavers, the warm pool from the shop windows + fascia, lamp pools. */
function paintPavement(g, W, H) {
  const sx = W / (PAVE.x1 - PAVE.x0), sz = H / (PAVE.z1 - PAVE.z0);
  const X = x => (x - PAVE.x0) * sx, Zp = z => (z - PAVE.z0) * sz;   // canvas top = the shop front
  g.fillStyle = '#3d3a38'; g.fillRect(0, 0, W, H);
  const r = mulberry(4401);
  for (let z = PAVE.z0; z < PAVE.z1; z += 0.45) for (let x = PAVE.x0; x < PAVE.x1; x += 0.45) {   // paver-to-paver tone
    const k = (r() - 0.5) * 10; g.fillStyle = `rgba(${k > 0 ? '255,250,240' : '0,0,0'},${Math.abs(k) / 255 * 3})`; g.fillRect(X(x), Zp(z), 0.45 * sx, 0.45 * sz);
  }
  g.fillStyle = 'rgba(0,0,0,0.28)';
  const lw = Math.max(1, 0.01 * sx);
  for (let z = PAVE.z0; z < PAVE.z1; z += 0.45) g.fillRect(0, Zp(z), W, lw);
  for (let x = PAVE.x0; x < PAVE.x1; x += 0.45) g.fillRect(X(x), 0, lw, H);
  g.fillStyle = '#6a655e'; g.fillRect(0, Zp(PAVE.z1 - 0.16), W, H - Zp(PAVE.z1 - 0.16)); // kerb stones
  g.globalCompositeOperation = 'lighter';
  const pool = (x, z, rx, rz, c, a) => { g.save(); g.translate(X(x), Zp(z)); g.scale(rx * sx, rz * sz);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1); grd.addColorStop(0, `rgba(${c},${a})`); grd.addColorStop(0.45, `rgba(${c},${a * 0.5})`); grd.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore(); };
  pool(0, PAVE.z0, 3.6, 2.6, '255,206,156', 0.5);          // the lit shop
  pool(-1.7, PAVE.z0, 1.2, 1.6, '255,214,170', 0.25);       // …through each window
  pool(1.7, PAVE.z0, 1.2, 1.6, '255,214,170', 0.25);
  pool(0, PAVE.z0 + 0.4, 1.4, 1.1, '255,190,110', 0.2);      // fascia halo spill
  for (const [lx, lz] of LAMPS) pool(lx, lz, 3.4, 2.2, '255,196,130', 0.3);
  g.globalCompositeOperation = 'source-over';
}

/** Our building's street face: the upper storey over the fascia + the two neighbouring shops (u runs -x → +x as seen from the pavement). */
function paintNear(g, W, H) {
  const sx = W / (NEAR.x1 - NEAR.x0), sy = H / (NEAR.y1 - NEAR.y0);
  const X = x => (x - NEAR.x0) * sx, Y = y => H - (y - NEAR.y0) * sy;
  const sky = g.createLinearGradient(0, 0, 0, H * 0.4); sky.addColorStop(0, '#152a5a'); sky.addColorStop(1, '#2d4a8c');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const r = mulberry(4466);
  const bldg = (x0, x1, top, col) => {
    const f = g.createLinearGradient(0, Y(top), 0, Y(0));
    f.addColorStop(0, rgb(col, 0.55)); f.addColorStop(0.55, rgb(col, 0.78)); f.addColorStop(1, rgb(mix(col, [150, 100, 70], 0.3), 1.0));
    g.fillStyle = f; g.fillRect(X(x0), Y(top), X(x1) - X(x0), Y(0) - Y(top));
    g.fillStyle = rgb(mix(col, [235, 230, 220], 0.3), 0.85); g.fillRect(X(x0), Y(top - 0.3), X(x1) - X(x0), 0.12 * sy);   // cornice
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X(x0), Y(top - 0.3) + 0.12 * sy, X(x1) - X(x0), 0.05 * sy);
  };
  const sash = (x, y0, lit) => {
    g.fillStyle = lit ? rgb([255, 196, 128], 0.85) : 'rgb(26,30,46)'; g.fillRect(X(x - 0.45), Y(y0 + 1.7), 0.9 * sx, 1.7 * sy);
    g.fillStyle = 'rgba(20,16,18,0.7)'; g.fillRect(X(x) - 1, Y(y0 + 1.7), 2, 1.7 * sy); g.fillRect(X(x - 0.45), Y(y0 + 0.85), 0.9 * sx, 2);
    g.fillStyle = 'rgba(235,230,220,0.6)'; g.fillRect(X(x - 0.52), Y(y0), 1.04 * sx, 0.07 * sy);
  };
  // our building: warm cream plaster, two sash windows upstairs, the fascia halo washing the wall
  bldg(-2.95, 2.95, 8.6, [214, 200, 176]);
  sash(-1.2, 5.2, true); sash(1.2, 5.2, false);
  g.globalCompositeOperation = 'lighter';
  { const cx = X(0), cy = Y(3.45), grd = g.createRadialGradient(cx, cy, 0, cx, cy, 3.4 * sx); grd.addColorStop(0, 'rgba(255,190,110,0.32)'); grd.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = grd; g.fillRect(cx - 3.4 * sx, cy - 3.4 * sx, 6.8 * sx, 6.8 * sx); }
  g.globalCompositeOperation = 'source-over';
  // neighbours: left a closed boutique (roller shutter), right a lit café with an awning
  for (const [x0, x1, top, col, lit] of [[-12, -2.95, 7.6, [150, 172, 150], false], [2.95, 12, 7.9, [196, 140, 128], true]]) {
    bldg(x0, x1, top, col);
    for (let x = x0 + 1.4; x < x1 - 0.8; x += 2.2) sash(x, 4.9, r() < 0.45);
    const s0 = lit ? 3.4 : 3.2, a = x0 + 0.5, b = x1 - 0.5;
    g.fillStyle = 'rgb(28,26,24)'; g.fillRect(X(a), Y(s0 + 0.55), X(b) - X(a), 0.5 * sy);            // their signboard
    g.fillStyle = 'rgba(245,225,180,0.55)'; g.fillRect(X((a + b) / 2 - 1), Y(s0 + 0.33), 2 * sx, 2);
    if (lit) {
      const grd = g.createLinearGradient(0, Y(s0), 0, Y(0.2)); grd.addColorStop(0, 'rgb(170,120,80)'); grd.addColorStop(1, 'rgb(250,196,130)');
      g.fillStyle = grd; g.fillRect(X(a), Y(s0), X(b) - X(a), Y(0.2) - Y(s0));
      g.fillStyle = 'rgba(40,24,18,0.45)'; for (let i = 0; i < 7; i++) { const px = X(a + 0.4 + r() * (b - a - 1)); const hh = 0.9 + r() * 0.8; g.fillRect(px, Y(hh), 4 + r() * 6, Y(0.2) - Y(hh)); }
      g.fillStyle = 'rgba(14,12,14,0.85)'; for (let mx = a; mx <= b + 0.01; mx += (b - a) / 4) g.fillRect(X(mx) - 1, Y(s0), 3, Y(0.2) - Y(s0));
      g.fillStyle = 'rgb(92,34,38)'; g.fillRect(X(a - 0.2), Y(s0 + 0.05), X(b + 0.2) - X(a - 0.2), 0.34 * sy);                    // awning
      g.fillStyle = 'rgba(255,255,255,0.12)'; for (let x = a; x < b; x += 0.5) g.fillRect(X(x), Y(s0 + 0.05), 0.25 * sx, 0.34 * sy);
    } else {
      g.fillStyle = 'rgb(66,68,76)'; g.fillRect(X(a), Y(s0), X(b) - X(a), Y(0.15) - Y(s0));
      g.fillStyle = 'rgba(20,20,26,0.4)'; for (let y = Y(s0); y < Y(0.15); y += 3) g.fillRect(X(a), y, X(b) - X(a), 1);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X(x0), Y(0.15), X(x1) - X(x0), 0.15 * sy + 2);
  }
  // our pier ends: plaster pilasters either side of the storefront, a dark plinth line
  g.fillStyle = rgb([214, 200, 176], 0.72); g.fillRect(X(-2.95), Y(2.6), X(-2.45) - X(-2.95), Y(0) - Y(2.6)); g.fillRect(X(2.45), Y(2.6), X(2.95) - X(2.45), Y(0) - Y(2.6));
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X(-2.95), Y(0.12), X(2.95) - X(-2.95), 0.12 * sy);
}

function paintBokeh(g, W, H, rng) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const disc = (x, y, r, c, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.8})`); grd.addColorStop(0.75, `rgba(${c[0]},${c[1]},${c[2]},${a})`); grd.addColorStop(0.92, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.5})`); grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  g.globalCompositeOperation = 'lighter';
  const AW = W * 0.75;
  const pal = [[255, 200, 140], [255, 176, 110], [255, 226, 190], [150, 190, 255]];
  for (let i = 0; i < 44; i++) { const c = rng.pick(pal), low = rng() < 0.5; disc(rng() * AW, low ? H * rng.range(0.72, 0.9) : H * rng.range(0.25, 0.6), rng.range(5, low ? 11 : 14), c, rng.range(0.05, 0.16)); }
  for (const x of [0.2, 0.62]) { const cx = AW * x; disc(cx, H * 0.84, 7, [255, 60, 50], 0.32); disc(cx + 26, H * 0.84, 7, [255, 60, 50], 0.32); } // parked cars
  const bx = AW + (W - AW) / 2, by = H / 2, br = Math.min(W - AW, H) / 2;
  const grd = g.createRadialGradient(bx, by, 0, bx, by, br);
  grd.addColorStop(0, 'rgba(255,236,200,1)'); grd.addColorStop(0.08, 'rgba(255,214,160,0.8)'); grd.addColorStop(0.3, 'rgba(255,190,130,0.22)'); grd.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = grd; g.fillRect(AW, 0, W - AW, H);
  g.globalCompositeOperation = 'source-over';
}

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Plane facing -z (the viewer is inside, looking +z) whose u runs -x→+x as seen from inside. */
function planeZ(x0, x1, y0, y1, z) {
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateY(Math.PI).translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  return geo;
}

export function buildExterior(ctx, batch, AM) {
  const { kit, tier } = ctx;
  const rng = kit.rng(20260923);
  const plan = streetPlan(rng);
  const big = tier !== 'low';
  const farTex = kit.canvasTexture(big ? 1024 : 512, big ? 512 : 256, (g, w, h) => paintFar(g, w, h, kit.rng(76)));
  const facTex = kit.canvasTexture(big ? 2048 : 1024, big ? 256 : 128, (g, w, h) => paintFacade(g, w, h, plan, kit.rng(77)));
  const gndTex = kit.canvasTexture(big ? 2048 : 1024, big ? 256 : 128, (g, w, h) => paintGround(g, w, h, plan));
  gndTex.anisotropy = ctx.q.anisotropy;
  const paveTex = kit.canvasTexture(big ? 1024 : 512, big ? 256 : 128, (g, w, h) => paintPavement(g, w, h));
  paveTex.anisotropy = ctx.q.anisotropy;
  const nearTex = kit.canvasTexture(big ? 1024 : 512, big ? 512 : 256, (g, w, h) => paintNear(g, w, h));
  const bokTex = kit.canvasTexture(1024, 256, (g, w, h) => paintBokeh(g, w, h, kit.rng(79)));
  const group = new THREE.Group(); group.name = 'exterior';
  const far = new THREE.Mesh(planeZ(FAR.x0, FAR.x1, FAR.y0, FAR.y1, FAR.z), AM.glow('sky', farTex, new THREE.Color(0.9, 0.9, 0.96)));
  far.name = 'sky';
  // opposite shopfronts: the roofline is real geometry (the mountain shows above it)
  const pts = [[FAC.x0, FAC.y0]];
  for (const b of plan) pts.push(...roofline(b));
  pts.push([FAC.x1, FAC.y0]);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(-x, y))); // mirrored: the mesh is turned to face -z
  const fg = new THREE.ShapeGeometry(shape).rotateY(Math.PI).translate(0, 0, FAC.z);
  { const p = fg.attributes.position, uv = fg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - FAC.x0) / (FAC.x1 - FAC.x0), (p.getY(i) - FAC.y0) / (FAC.y1 - FAC.y0)); }
  const fac = new THREE.Mesh(fg, AM.glow('facade', facTex, new THREE.Color(0.9, 0.88, 0.92)));
  fac.name = 'facade';
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(FAC.x1 - FAC.x0, GROUND.z1 - GROUND.z0).rotateX(-Math.PI / 2).translate(0, -0.012, (GROUND.z0 + GROUND.z1) / 2),
    AM.glow('street', gndTex, new THREE.Color(0.8, 0.8, 0.86)));
  gnd.name = 'street';
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(PAVE.x1 - PAVE.x0, PAVE.z1 - PAVE.z0).rotateX(-Math.PI / 2).translate((PAVE.x0 + PAVE.x1) / 2, -0.004, (PAVE.z0 + PAVE.z1) / 2),
    AM.glow('pavement', paveTex, new THREE.Color(0.95, 0.93, 0.92)));
  pave.name = 'pavement';
  // our building's street face: a plane facing +z (the pavement) with the storefront hole; u runs -x → +x
  const nearShape = new THREE.Shape([[NEAR.x0, NEAR.y0], [NEAR.hole[0], NEAR.y0], [NEAR.hole[0], NEAR.hole[2]], [NEAR.hole[1], NEAR.hole[2]], [NEAR.hole[1], NEAR.y0],
    [NEAR.x1, NEAR.y0], [NEAR.x1, NEAR.y1], [NEAR.x0, NEAR.y1]].map(([x, y]) => new THREE.Vector2(x, y)));
  const ng = new THREE.ShapeGeometry(nearShape).translate(0, 0, NEAR.z);
  { const p = ng.attributes.position, uv = ng.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - NEAR.x0) / (NEAR.x1 - NEAR.x0), (p.getY(i) - NEAR.y0) / (NEAR.y1 - NEAR.y0)); }
  const near = new THREE.Mesh(ng, AM.glow('streetFace', nearTex, new THREE.Color(0.92, 0.9, 0.9)));
  near.name = 'streetFace';
  const bparts = [];
  const bq = (w, h, x, y, z, u0, u1) => { const g = new THREE.PlaneGeometry(w, h).rotateY(Math.PI); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) > 0.5 ? u0 : u1); g.translate(x, y, z); bparts.push(g); };
  bq(60, 7, 0, 3.2, 14.2, 0.0, 0.75);
  for (const [lx, lz] of LAMPS) bq(1.9, 1.9, lx, 3.95, lz - 0.02, 0.75, 1.0);
  const bokeh = new THREE.Mesh(kit.mergeGeometries(bparts), AM.add('bokeh', bokTex, new THREE.Color(1.1, 1.05, 1.0))); bokeh.name = 'bokeh'; bokeh.renderOrder = -1;
  group.add(far, fac, gnd, pave, near, bokeh);
  for (const m of [far, fac, gnd, pave, near, bokeh]) m.raycast = () => {}; // backdrop: never intercept taps

  // 3-D street furniture for parallax → shared steel / glow batches
  const post = kit.lathe([[0.16, 0], [0.16, 0.08], [0.11, 0.14], [0.09, 0.5], [0.07, 0.6], [0.055, 0.7], [0.05, 3.6], [0.065, 3.66], [0.065, 3.72], [0, 3.72]], 14);
  for (const [lx, lz] of LAMPS) {
    batch.add('steel', post, mat4([lx, 0, lz]));
    batch.add('steel', kit.lathe([[0.02, 0], [0.13, 0.02], [0.15, 0.05], [0.02, 0.1], [0, 0.1]], 8), mat4([lx, 4.24, lz]));
    batch.add('steel', new THREE.CylinderGeometry(0.035, 0.05, 0.12, 8), mat4([lx, 3.78, lz]));
    batch.add('glow', new THREE.CylinderGeometry(0.13, 0.07, 0.4, 8), mat4([lx, 4.04, lz]), { color: [2.6, 2.0, 1.3] });
  }
  for (let x = -7.2; x <= 7.3; x += 1.6) {
    if (LAMPS.some(([lx]) => Math.abs(x - lx) < 0.5)) continue;
    batch.add('steel', kit.lathe([[0.05, 0], [0.05, 0.62], [0.065, 0.64], [0.065, 0.69], [0.04, 0.74], [0, 0.76]], 10), mat4([x, 0, PAVE.z1 - 0.15]));
  }
  // cast-iron verandas over the far pavement: slim posts at the kerb + a thin roof
  const vpost = new THREE.CylinderGeometry(0.04, 0.05, 3.05, 8);
  for (const b of plan) {
    if (!b.veranda || b.x1 < -22 || b.x0 > 22) continue;
    const w = b.x1 - b.x0, n = Math.max(2, Math.round(w / 2.6));
    for (let i = 0; i <= n; i++) batch.add('steel', vpost, mat4([b.x0 + 0.12 + (w - 0.24) * i / n, 1.525, VERANDA_Z]));
    const depth = FAC.z - VERANDA_Z;
    batch.add('steel', new THREE.BoxGeometry(w - 0.06, 0.05, depth + 0.1), mat4([(b.x0 + b.x1) / 2, 3.12, VERANDA_Z + depth / 2], [-0.05, 0, 0]));
  }
  kit.freeze(group);
  return group;
}
