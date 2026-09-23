// fixtures — lounge (right wall, z −1.2 … 2.9): round wool rug (ivory, black band, gold line), travertine
// coffee + side table with IMAANS lookbooks and magazines, brass floor lamp with a glowing linen shade, and the
// brand campaign (assets/brand/campaign-*.webp) framed as two lightboxes above the sofa. The GLB furniture
// (sofa, chairs, plant, vase) is placed by glb.js at the positions exported here.
import * as THREE from 'three';
import { M, rbox, box, cyl, lathe, tube, plane, mapUV, solidUV, DEG } from './util.js';
import { COPY } from './copy.js';

export const LOUNGE = {
  sofa: { pos: [7.3, 0, 0.87], rotY: -Math.PI / 2 },
  table: [6.1, 0.87], sideTable: [7.5, -0.62], lamp: [7.6, -1.08], plant: [7.42, 2.47],
  chairV: { pos: [4.96, 0, 0.1], rotY: Math.atan2(1.14, 0.77) },
  chairD: { pos: [4.96, 0, 1.68], rotY: Math.atan2(1.14, -0.81) },
  rug: [6.02, 0.87, 1.46],
};

export function buildLounge(F) {
  const { B, S, P, A, ctx } = F;
  const rng = ctx.kit.rng(203);
  // ---------------------------------------------------------------- round rug (vertex-coloured bands)
  const [rx, rz, R] = LOUNGE.rug;
  F.rug = rugGeometry(R);
  // ---------------------------------------------------------------- coffee table (travertine drum)
  const [tx, tz] = LOUNGE.table;
  const TH = 0.4;
  B.add('trav', lathe([[0.0, 0.012], [0.33, 0.012], [0.33, 0.05], [0.36, 0.055], [0.37, TH - 0.05], [0.42, TH - 0.045], [0.43, TH - 0.02], [0.425, TH], [0.0, TH]], 56), M([tx, 0, tz]));
  S.add(tx, 0.012, tz, 1.05, 1.05, 0, 0.6);
  F.col.addCircle(tx, tz, 0.44);
  // books (stack of two big coffee-table books) + magazine + brass tray + candle
  const top = TH;
  bookStack(F, [tx - 0.1, top, tz - 0.05], 0.35, [['cover1', 0.33, 0.26, 0.036, '#1b1b1b'], ['cover0', 0.3, 0.24, 0.03, '#121213']]);
  magazine(F, [tx + 0.12, top, tz + 0.2], 0.9, 'mag0');
  magazine(F, [tx + 0.16, top + 0.004, tz + 0.23], 1.25, 'mag2');
  B.add('brass', rbox(0.2, 0.012, 0.13, 0.004), M([tx + 0.16, top + 0.006, tz - 0.2], [0, -0.3, 0]));
  candle(F, [tx + 0.18, top + 0.012, tz - 0.2], 0.042, 0.07, '#141415', true);
  S.add(tx - 0.1, top, tz - 0.05, 0.42, 0.34, 0.35, 0.45);
  const promo = (ctx.brand.promos && ctx.brand.promos[0]) || null;
  P.box([tx - 0.1, top + 0.05, tz - 0.05], [0.36, 0.1, 0.3], 0.35, {
    title: ctx.brand.name + ' lookbook', subtitle: promo && promo.headline ? promo.headline + ' — ' + (promo.sub || COPY.book) : COPY.book, tag: 'Lounge reading',
    actions: [{ label: 'About us', run: () => ctx.ui.showInfo('about') }],
  });
  P.box([tx + 0.14, top + 0.01, tz + 0.21], [0.3, 0.03, 0.3], 0.3, { title: 'Magazines', subtitle: COPY.magazine, tag: 'Lounge reading' });
  // ---------------------------------------------------------------- side table + lamp
  const [sx, sz] = LOUNGE.sideTable;
  B.add('trav', lathe([[0, 0], [0.16, 0], [0.13, 0.02], [0.1, 0.1], [0.085, 0.45], [0.11, 0.52], [0.21, 0.53], [0.22, 0.55], [0.0, 0.55]], 44), M([sx, 0, sz]));
  S.add(sx, 0, sz, 0.55, 0.55, 0, 0.55); F.col.addCircle(sx, sz, 0.24);
  bookStack(F, [sx - 0.02, 0.55, sz + 0.01], 1.1, [['mag1', 0.22, 0.29, 0.008, '#1b1b1b'], ['mag0', 0.22, 0.29, 0.008, '#e9dfcf'], ['mag2', 0.22, 0.29, 0.008, '#c9b79c']], true);
  P.box([sx, 0.3, sz], [0.45, 0.6, 0.45], 0, { title: 'Travertine side table', subtitle: COPY.travertine, tag: 'Lounge' });
  const [lx, lz] = LOUNGE.lamp;
  B.add('gloss', lathe([[0, 0], [0.15, 0], [0.155, 0.01], [0.15, 0.03], [0.02, 0.035], [0, 0.035]], 40), M([lx, 0, lz]), F.ink);
  B.add('brass', cyl(0.011, 0.011, 1.42, 12), M([lx, 0.035 + 0.71, lz]));
  B.add('brass', lathe([[0.0, 1.44], [0.03, 1.44], [0.03, 1.47], [0.0, 1.47]], 16), M([lx, 0, lz]));
  const shade = [[0.19, 1.44], [0.185, 1.5], [0.175, 1.62], [0.165, 1.72]];
  const shadeOut = lathe(shade, 48); mapUV(shadeOut, A.sub('white', 0.2, 0.2, 0.8, 0.8));
  F.lamp = { outer: B.add('glow', shadeOut, M([lx, 0, lz]), [1.25, 0.95, 0.66]) };
  const shadeIn = lathe(shade.slice().reverse().map(([r, y]) => [r - 0.004, y]), 48); mapUV(shadeIn, A.sub('white', 0.2, 0.2, 0.8, 0.8));
  F.lamp.inner = B.add('glow', shadeIn, M([lx, 0, lz]), [2.4, 1.85, 1.2]);
  B.add('glow', solidUV(new THREE.CircleGeometry(0.03, 16), A.centre('white')), M([lx, 1.5, lz], [-Math.PI / 2, 0, 0]), [4, 3.4, 2.4]);
  S.add(lx, 0, lz, 0.45, 0.45, 0, 0.55); F.col.addCircle(lx, lz, 0.18);
  F.lamp.on = true;
  P.box([lx, 0.9, lz], [0.4, 1.8, 0.4], 0, () => ({
    title: 'The floor lamp', subtitle: COPY.lamp, tag: 'Lounge',
    actions: [{ label: F.lamp.on ? 'Switch it off' : 'Switch it on', run: () => F.toggleLamp() }],
  }));
  // ---------------------------------------------------------------- the campaign, framed as two lightboxes above the sofa
  const wall = 7.972;
  const fw = 1.06, fh = fw / A.aspect('camp1');
  const frames = [
    { z: LOUNGE.sofa.pos[2] - 0.6, art: 'camp1', title: ctx.brand.name + ' — Clothes' },
    { z: LOUNGE.sofa.pos[2] + 0.6, art: 'camp2', title: ctx.brand.name + ' — Shoes' },
  ];
  const fy = 1.72;
  for (const f of frames) {
    const m = M([wall, fy, f.z], [0, -Math.PI / 2, 0]);
    const t = 0.03, d = 0.06;
    // black lightbox case with a fine brass fillet
    for (const [x, y, w2, h2] of [[0, fh / 2 + t / 2, fw + 2 * t, t], [0, -fh / 2 - t / 2, fw + 2 * t, t], [-fw / 2 - t / 2, 0, t, fh], [fw / 2 + t / 2, 0, t, fh]]) {
      B.add('gloss', rbox(w2, h2, d, 0.005, 2), m.clone().multiply(M([x, y, d / 2 - 0.028 + 0.028])), F.ink);
    }
    B.add('brass', rbox(fw + 0.012, fh + 0.012, 0.004, 0.002), m.clone().multiply(M([0, 0, d - 0.006])));
    B.add('glow', plane(fw, fh, A.regions[f.art]), m.clone().multiply(M([0, 0, d - 0.0035])), [0.92, 0.9, 0.86]);
    P.box([wall - 0.03, fy, f.z], [0.06, fh, fw], 0, {
      title: f.title, subtitle: COPY.art + ' ' + ctx.brand.slogan, tag: ctx.brand.line,
      actions: [{ label: 'About us', run: () => ctx.ui.showInfo('about') }],
    });
  }
  S.add(wall - 0.2, 0, LOUNGE.sofa.pos[2], 0.4, 2.3, 0, 0.33);
  void rng;
}

/** Stack of books/magazines: items = [[region, w, d, h, spineColour]] bottom→top. flat=true → magazines. */
function bookStack(F, [x, y, z], rot, items, flat = false) {
  const { B, A } = F;
  let yy = y;
  const r = F.ctx.kit.rng(Math.round(x * 100 + z * 10));
  items.forEach(([reg, w, d, h, spine], i) => {
    const a = rot + (r() - 0.5) * (flat ? 0.5 : 0.18);
    const m = M([x + (r() - 0.5) * 0.02, yy + h / 2, z + (r() - 0.5) * 0.02], [0, a, 0]);
    // block: page edges (paper) + cover top with the painted cover
    const body = box(w, h * 0.86, d * 0.985); solidUV(body, A.centre('paper'));
    B.add('print', body, m, '#f3efe6');
    const cov = plane(w, d, A.regions[reg]); cov.rotateX(-Math.PI / 2);
    B.add('print', cov, m.clone().multiply(M([0, h / 2 + 0.0008, 0])));
    const back = box(w + 0.004, h * 0.08, d + 0.004); solidUV(back, A.centre('white'));
    B.add('print', back, m.clone().multiply(M([0, h / 2 - h * 0.04, 0])), spine);
    B.add('print', back.clone(), m.clone().multiply(M([0, -h / 2 + h * 0.04, 0])), spine);
    const sp = box(0.004, h, d + 0.004); solidUV(sp, A.centre('white'));
    B.add('print', sp, m.clone().multiply(M([-w / 2 - 0.001, 0, 0])), spine);
    yy += h;
  });
}
function magazine(F, [x, y, z], rot, reg) {
  const { B, A } = F;
  const w = 0.22, d = 0.29, h = 0.006;
  const m = M([x, y + h / 2, z], [0, rot, 0]);
  const body = box(w, h, d); solidUV(body, A.centre('paper')); B.add('print', body, m, '#f4f1ea');
  const cov = plane(w, d, A.regions[reg]); cov.rotateX(-Math.PI / 2); B.add('print', cov, m.clone().multiply(M([0, h / 2 + 0.0008, 0])));
}

/** Candle in a glossy black vessel with a gold rim; lit → a small glowing flame. */
export function candle(F, [x, y, z], r, h, color, lit = false) {
  const { B } = F;
  B.add('gloss', lathe([[0, 0], [r, 0], [r * 1.02, h * 0.1], [r, h * 0.9], [r * 0.92, h], [r * 0.9, h * 0.95], [0, h * 0.95]], 28), M([x, y, z]), color);
  B.add('metal', lathe([[r * 1.005, h * 0.88], [r * 1.012, h * 0.9], [r * 0.93, h * 1.0], [r * 0.92, h * 0.99]], 28), M([x, y, z]), F.gold);
  B.add('gloss', cyl(0.0012, 0.0012, 0.012, 5), M([x, y + h * 0.95 + 0.006, z]), '#111111');
  if (lit) {
    const fl = new THREE.SphereGeometry(0.006, 8, 6); fl.scale(1, 2.3, 1);
    B.add('glow', fl, M([x, y + h * 0.95 + 0.022, z]), [5, 3.4, 1.4]);
  }
}

/** The rug's painted texture: ivory wool field, taupe ring, black band + thin gold line, fringe-less edge. */
export function rugTexture(kit, F) {
  const S = 1024;
  const t = kit.canvasTexture(S, S, (g) => {
    const c = S / 2, R = S / 2;
    const ring = (r0, r1, col) => { g.beginPath(); g.arc(c, c, r1 * R, 0, Math.PI * 2); g.arc(c, c, r0 * R, 0, Math.PI * 2, true); g.fillStyle = col; g.fill(); };
    g.fillStyle = '#e9e1d4'; g.fillRect(0, 0, S, S);
    ring(0.0, 1.0, '#ebe3d6');
    ring(0.52, 0.56, '#b6a58c');
    ring(0.8, 0.935, '#1d1b1a');
    ring(0.86, 0.868, '#c9a45c');
    ring(0.935, 1.0, '#e4dccf');
    // wool: fine noise + soft tufts
    const r = kit.rng(77);
    for (let i = 0; i < 26000; i++) { const x = r() * S, y = r() * S; g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.06})` : `rgba(60,45,30,${0.04 + r() * 0.06})`; g.fillRect(x, y, 1.5, 1.5); }
    for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S, rr = 20 + r() * 60; const grd = g.createRadialGradient(x, y, 0, x, y, rr); grd.addColorStop(0, `rgba(80,60,40,${0.03 * r()})`); grd.addColorStop(1, 'rgba(80,60,40,0)'); g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  });
  t.anisotropy = 8;
  void F;
  return t;
}

function rugGeometry(R) {
  const seg = 96, pos = [], col = [], idx = [], uv = [];
  const Y = 0.012;
  const rings = [0, 0.25, 0.5, 0.75, 0.9, 0.97, 1.0].map(k => k * (R - 0.006));
  const pushRing = (r, y, shade) => {
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, y, z); col.push(shade, shade, shade); uv.push(0.5 + x / (2 * R), 0.5 - z / (2 * R));
    }
  };
  rings.forEach(r => pushRing(r, Y, 1));
  pushRing(R, 0.003, 0.82); // rolled edge down to the floor
  const nr = rings.length + 1;
  for (let i = 0; i < nr - 1; i++) for (let s = 0; s < seg; s++) {
    const a = i * (seg + 1) + s, b = a + 1, cc = a + seg + 1, d = cc + 1;
    idx.push(a, b, cc, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
