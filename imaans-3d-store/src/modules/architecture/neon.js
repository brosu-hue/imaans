// "Step into style." — the IMAANS slogan as a warm-white hand-bent neon script on the fitting-room wall.
// Glyphs are authored in design units (x-height = 100, baseline y = 0, y up). Each stroke is a list of
// points [x, y] or [x, y, 1] (1 = sharp corner), rendered as Catmull-Rom splines → canvas beziers, so the
// lettering looks identical on every device (no reliance on installed script fonts).
import * as THREE from 'three';

const G = {
  S: { adv: 104, strokes: [[
    [88, 186], [74, 208], [46, 214], [22, 200], [16, 172], [32, 144], [58, 118], [76, 84], [74, 44], [56, 12], [30, 0], [10, 8],
    [6, 26], [18, 34], [42, 26], [72, 20], [104, 32]]] },
  t: { adv: 70, strokes: [[
    [0, 36], [16, 84], [34, 170, 1], [28, 92], [24, 34], [30, 6], [46, 0], [60, 12], [70, 32]]], bar: [[4, 112], [62, 118]] },
  e: { adv: 92, strokes: [[
    [0, 32], [26, 46], [52, 64], [58, 88], [46, 100], [28, 92], [14, 62], [14, 26], [30, 2], [56, 0], [76, 12], [92, 32]]] },
  eF: { adv: 110, strokes: [[
    [0, 32], [26, 46], [52, 64], [58, 88], [46, 100], [28, 92], [14, 62], [14, 26], [30, 2], [56, 0], [76, 14], [92, 36], [110, 64]]] },
  p: { adv: 96, strokes: [[
    [0, 32], [14, 66], [24, 102, 1], [21, 40], [17, -30], [14, -92, 1], [19, -30], [23, 40], [36, 84], [56, 100], [74, 88], [78, 52],
    [66, 16], [44, 1], [27, 9], [44, 16], [72, 18], [96, 34]]] },
  i: { adv: 50, strokes: [[
    [0, 32], [12, 62], [22, 98, 1], [19, 56], [18, 18], [26, 2], [38, 5], [50, 32]]], dot: [30, 146] },
  n: { adv: 102, strokes: [[
    [0, 32], [10, 64], [18, 98, 1], [16, 50], [14, 0, 1], [22, 48], [36, 86], [54, 99], [66, 86], [68, 52], [67, 16], [76, 1], [90, 6], [102, 30]]] },
  oF: { adv: 80, strokes: [[
    [0, 32], [10, 64], [28, 94], [46, 101], [60, 88], [62, 54], [52, 16], [34, 0], [16, 8], [12, 38], [22, 74], [42, 96], [60, 98], [80, 92]]] },
  s: { adv: 72, strokes: [[
    [0, 32], [14, 64], [28, 102, 1], [44, 74], [58, 46], [58, 16], [42, 0], [22, 2], [12, 14], [18, 22], [34, 14], [52, 12], [72, 32]]] },
  y: { adv: 94, strokes: [[
    [0, 32], [10, 64], [18, 98, 1], [16, 56], [16, 20], [26, 2], [42, 4], [56, 26], [64, 60], [68, 98, 1], [66, 40], [62, -30], [52, -80],
    [36, -96], [22, -86], [24, -60], [44, -30], [70, -2], [94, 32]]] },
  l: { adv: 76, strokes: [[
    [0, 32], [24, 92], [46, 160], [54, 202], [44, 218], [32, 204], [28, 150], [28, 82], [30, 26], [38, 3], [54, 2], [66, 14], [76, 32]]] },
};

const WORDS = [['S', 't', 'e', 'p'], ['i', 'n', 't', 'oF'], ['s', 't', 'y', 'l', 'eF']];
const SLANT = 0.2;
const SPACE = 70;

/** Layout → {strokes:[[{x,y,c}]], dots:[[x,y]], box} in design units (slanted, y up). */
export function neonLayout(words = WORDS) {
  const strokes = [], dots = [], accents = [];
  let pen = 0;
  words.forEach((word, wi) => {
    for (const name of word) {
      const g = G[name];
      for (const s of g.strokes) strokes.push(s.map(p => ({ x: pen + p[0], y: p[1], c: !!p[2] })));
      if (g.dot) dots.push([pen + g.dot[0], g.dot[1]]);
      if (g.bar) accents.push(g.bar.map(p => ({ x: pen + p[0], y: p[1], c: false })));
      pen += g.adv;
    }
    if (wi < words.length - 1) pen += SPACE;
  });
  const sl = p => ({ x: p.x + p.y * SLANT, y: p.y, c: p.c });
  const S = [...strokes, ...accents].map(s => s.map(sl));
  const D = dots.map(([x, y]) => [x + y * SLANT, y]);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const s of S) for (const p of s) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  for (const [, y] of D) maxY = Math.max(maxY, y);
  return { strokes: S, dots: D, box: { minX, maxX, minY, maxY } };
}

function splinePath(g, pts, tf) {
  const P = pts.map(tf);
  g.moveTo(P[0].x, P[0].y);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const k1 = p1.c ? 0 : 1 / 6, k2 = p2.c ? 0 : 1 / 6;
    g.bezierCurveTo(p1.x + (p2.x - p0.x) * k1, p1.y + (p2.y - p0.y) * k1, p2.x - (p3.x - p1.x) * k2, p2.y - (p3.y - p1.y) * k2, p2.x, p2.y);
  }
}

/** Draw the glowing script on an OPAQUE BLACK canvas region (use with additive blending). */
export function drawNeon(g, x0, y0, W, H, opts = {}) {
  const tube = opts.tube || [255, 226, 186];
  const L = neonLayout();
  const pad = opts.pad ?? 0.1;
  const bw = L.box.maxX - L.box.minX, bh = (L.box.maxY + 20) - L.box.minY;
  const s = Math.min(W * (1 - pad * 2) / bw, H * (1 - pad * 2) / bh);
  const ox = x0 + (W - bw * s) / 2 - L.box.minX * s, oy = y0 + H - (H - bh * s) / 2 + L.box.minY * s;
  const tf = p => ({ x: ox + p.x * s, y: oy - p.y * s, c: p.c });
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.fillStyle = '#000'; g.fillRect(x0, y0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const trace = (c) => {
    c.beginPath();
    for (const st of L.strokes) splinePath(c, st, tf);
    for (const [x, y] of L.dots) { const q = tf({ x, y }); c.moveTo(q.x - 0.01, q.y); c.lineTo(q.x + 0.01, q.y); }
  };
  const rgba = (a) => `rgba(${tube[0]},${tube[1]},${tube[2]},${a})`;
  const w = Math.max(1, s * 6.2); // tube width (px)
  // wide halo passes at quarter resolution (big shadowBlur is expensive), upscaled = free extra softness
  const q = 4, gc = document.createElement('canvas'); gc.width = Math.ceil(W / q); gc.height = Math.ceil(H / q);
  const gg = gc.getContext('2d'); gg.lineCap = 'round'; gg.lineJoin = 'round'; gg.scale(1 / q, 1 / q); gg.translate(-x0, -y0);
  for (const [lw, blur, a] of [[w * 5.5, w * 7, 0.06], [w * 2.6, w * 3, 0.2]]) { gg.lineWidth = lw; gg.shadowBlur = blur / q; gg.strokeStyle = rgba(a); gg.shadowColor = rgba(a); trace(gg); gg.stroke(); }
  g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.drawImage(gc, x0, y0, W, H);
  // crisp tube + white-hot core at full resolution
  g.lineWidth = w * 1.3; g.shadowBlur = w * 0.8; g.strokeStyle = rgba(0.95); g.shadowColor = rgba(0.95); trace(g); g.stroke();
  g.shadowBlur = 0; g.lineWidth = w * 0.5; g.strokeStyle = 'rgba(255,250,242,1)'; trace(g); g.stroke();
  g.restore();
  return { layout: L, scale: s };
}

// placement: framed by a frieze panel on the right wall above the fitting rooms (clear of their header
// fascia from anywhere in the aisle), facing the aisle (-x)
export const NEON = { x: 7.986, y: 3.94, z: -4.065, w: 1.52, h: 0.52 };

export function buildNeonScript(ctx, AM) {
  const { kit, tier } = ctx;
  const W = tier === 'low' ? 512 : 1024, H = Math.round(W * NEON.h / NEON.w);
  const tex = kit.canvasTexture(W, H, (g) => drawNeon(g, 0, 0, W, H, { pad: 0.06 }));
  tex.anisotropy = ctx.q.anisotropy;
  const mat = AM.add('neon', tex, new THREE.Color(1, 1, 1).multiplyScalar(1.7));
  const geo = new THREE.PlaneGeometry(NEON.w, NEON.h).rotateY(-Math.PI / 2).translate(NEON.x, NEON.y, NEON.z);
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'arch:neon'; mesh.renderOrder = 3;
  const base = mat.color.clone();
  const rng = kit.rng(4242);
  let fl = 0, seq = [];
  return {
    mesh,
    flicker(dur = 1.4) {
      seq = []; let t = 0;
      while (t < dur) { const on = rng() < 0.55; const len = on ? rng.range(0.03, 0.14) : rng.range(0.03, 0.11); seq.push([t, t + len, on ? rng.range(0.7, 1.05) : rng.range(0.04, 0.25)]); t += len; }
      fl = 0.0001;
    },
    update(dt) {
      if (!fl) return;
      fl += dt;
      const s = seq.find(([a, b]) => fl >= a && fl < b);
      if (!s) { fl = 0; mat.color.copy(base); return; }
      mat.color.copy(base).multiplyScalar(s[2]);
    },
  };
}
