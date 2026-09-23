// fixtures — ONE painted 2048×1024 canvas atlas shared by every printed / painted surface of the module:
// the brand campaign prints (lightboxes), the IMAANS crown wordmark on bags / boxes / plaque / signs, the
// POS + card-reader screens, counter cards (announcement, size guide), lookbooks, magazines, book spines and
// the small product patterns (tortoiseshell, straw weave, silk print). All text that is shop data comes from
// ctx.brand / ctx.catalog, painted at build time. Regions are returned as UV rects [u0, v0, u1, v1].
import * as THREE from 'three';
import { drawCrown, goldGradient } from '../../core/catalog.js';

const W = 2048, H = 1024;

function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// pixel rects [x, y, w, h] (canvas space, y down)
const R = {
  camp1: [0, 0, 640, 428], camp2: [644, 0, 640, 428],
  bag: [1288, 0, 240, 300], box: [1532, 0, 200, 200], tortoise: [1736, 0, 150, 150], straw: [1890, 0, 150, 150],
  tissue: [1736, 154, 150, 120], silk: [1890, 154, 150, 150],
  plaque: [1288, 304, 560, 200], silk2: [1852, 308, 190, 190],
  sign: [0, 432, 640, 116],
  cover0: [0, 552, 250, 320], cover1: [254, 552, 250, 320],
  mag0: [508, 552, 200, 270], mag1: [712, 552, 200, 270], mag2: [916, 552, 200, 270],
  spines: [1120, 508, 480, 200],
  pos: [1604, 508, 300, 206],
  announce: [0, 876, 330, 146], sizeguide: [334, 876, 270, 146],
  reader: [608, 876, 90, 60], card: [608, 940, 128, 80],
  sockband: [740, 876, 140, 56], knit: [740, 936, 90, 86],
  mat: [884, 876, 100, 80], paper: [988, 876, 100, 100], rope: [1092, 876, 40, 40],
  white: [1136, 876, 40, 40], dark: [1180, 876, 40, 40], gold: [1224, 876, 40, 40], ivory: [1268, 876, 40, 40],
  hat: [1120, 712, 200, 160], leather: [1324, 712, 140, 140], wood: [1468, 712, 130, 160],
  lookspine: [1602, 718, 300, 40], tag: [1602, 762, 120, 70],
};

/**
 * @param kit    ctx.kit
 * @param o      { fonts:{display,sans}, brand, catalog, images:{camp1, camp2} (loaded <img> or null) }
 */
export function makeAtlas(kit, o) {
  const regions = {};
  let P = null;
  // low tier: paint at half resolution (≈2.7 MB instead of ≈10.7 MB of GPU memory with mips). Everything is
  // painted in the 2048×1024 design space through a scale transform, so regions / UVs are unchanged.
  const sc = o.tier === 'low' ? 0.5 : 1;
  const tex = kit.canvasTexture(W * sc, H * sc, (g) => {
    if (sc !== 1) g.scale(sc, sc);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    P = new Painter(g, o);
    P.campaign(R.camp1, o.images && o.images.camp1, 'clothing');
    P.campaign(R.camp2, o.images && o.images.camp2, 'shoes');
    P.bag(R.bag); P.box(R.box); P.tortoise(R.tortoise); P.straw(R.straw); P.tissue(R.tissue);
    P.silk(R.silk, 1); P.silk(R.silk2, 2);
    P.plaque(R.plaque); P.sign(R.sign);
    P.cover(R.cover0, o.images && o.images.camp1, 0); P.cover(R.cover1, o.images && o.images.camp2, 1);
    P.mag(R.mag0, '#e9dfcf', 'CAPE', 'STYLE', '#1b1b1b', 0); P.mag(R.mag1, '#1b1b1b', 'STRIDE', 'SHOES ISSUE', '#d9ab48', 1); P.mag(R.mag2, '#c9b79c', 'LINEN', 'SUMMER ISSUE', '#1b1b1b', 2);
    P.spines(R.spines); P.pos(R.pos); P.announce(R.announce); P.sizeguide(R.sizeguide);
    P.reader(R.reader); P.card(R.card); P.sockband(R.sockband); P.knit(R.knit);
    P.flat(R.mat, '#f4efe6'); P.paper(R.paper); P.rope(R.rope);
    P.flat(R.white, '#ffffff'); P.flat(R.dark, '#0e0e10'); P.flat(R.gold, '#d9ab48'); P.flat(R.ivory, '#faf7f2');
    P.hat(R.hat); P.leather(R.leather); P.wood(R.wood); P.lookspine(R.lookspine); P.tag(R.tag);
  });
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  for (const [k, [x, y, w, h]] of Object.entries(R)) {
    const e = 1.5; // inset so mips don't bleed between regions
    regions[k] = [(x + e) / W, 1 - (y + h - e) / H, (x + w - e) / W, 1 - (y + e) / H];
  }
  const centre = (k) => { const r = regions[k]; return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]; };
  /** sub-rect of a region: fractions fx0..fx1, fy0..fy1 (fy from the region's top). */
  const sub = (k, fx0, fy0, fx1, fy1) => { const r = regions[k]; return [r[0] + (r[2] - r[0]) * fx0, r[3] - (r[3] - r[1]) * fy1, r[0] + (r[2] - r[0]) * fx1, r[3] - (r[3] - r[1]) * fy0]; };
  /** Paint the campaign photos in once they have loaded (the store does not wait for them). */
  const setImages = (images) => {
    if (!images || (!images.camp1 && !images.camp2)) return;
    P.campaign(R.camp1, images.camp1, 'clothing'); P.campaign(R.camp2, images.camp2, 'shoes');
    P.cover(R.cover0, images.camp1, 0); P.cover(R.cover1, images.camp2, 1);
    tex.needsUpdate = true;
  };
  return { tex, regions, centre, sub, setImages, spineCount: 12, aspect: (k) => R[k][2] / R[k][3] };
}

// ------------------------------------------------------------------------------------------ painter
class Painter {
  constructor(g, o) {
    this.g = g; this.o = o;
    this.serif = (o.fonts && o.fonts.display) || 'Georgia, "Times New Roman", serif';
    this.sans = (o.fonts && o.fonts.sans) || 'system-ui, -apple-system, "Segoe UI", sans-serif';
    this.brand = o.brand; this.cat = o.catalog;
  }
  clip([x, y, w, h], fn) { const g = this.g; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(); g.restore(); }
  flat([x, y, w, h], c) { this.g.fillStyle = c; this.g.fillRect(x, y, w, h); }
  spaced(text, cx, cy, size, font, color, track = 0.18, weight = '400') {
    const g = this.g;
    g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left';
    const chars = [...text]; const ws = chars.map(c => g.measureText(c).width);
    const tw = ws.reduce((a, b) => a + b, 0) + track * size * (chars.length - 1);
    let x = cx - tw / 2; chars.forEach((c, i) => { g.fillText(c, x, cy); x += ws[i] + track * size; });
    return tw;
  }
  /** Fit text into maxW by shrinking the font; returns the size used. */
  fit(text, maxW, size, font, track = 0, weight = '400') {
    const g = this.g; let s = size;
    for (let i = 0; i < 12; i++) {
      g.font = `${weight} ${s}px ${font}`;
      const w = g.measureText(text).width + track * s * Math.max(0, [...text].length - 1);
      if (w <= maxW) break; s *= 0.92;
    }
    return s;
  }
  grain([x, y, w, h], amt, seed, dark = true) {
    const g = this.g; const r = rngOf(seed); const n = Math.floor(w * h / 16);
    for (let i = 0; i < n; i++) { const v = r(); g.fillStyle = (dark ? v > 0.5 : v > 0.2) ? `rgba(255,255,255,${amt * r()})` : `rgba(0,0,0,${amt * r()})`; g.fillRect(x + r() * w, y + r() * h, 1 + r() * 1.4, 1 + r() * 1.4); }
  }
  /**
   * IMAANS logo lockup centred at (cx, cy): crown above the wide serif wordmark, "SHOES & CLOTHING" in spaced
   * sans caps with fine rules. h = wordmark cap height (px). fill: 'gold' (logo gradient) or a colour.
   */
  logo(cx, cy, h, { fill = 'gold', line = true, crown = true, rules = true, lineText } = {}) {
    const g = this.g;
    const grad = fill === 'gold' ? goldGradient(g, cy - h * 2.0, cy + h * 1.1) : fill;
    if (crown) drawCrown(g, cx, cy - h * 1.32, h * 1.25, grad);
    const s = h * 1.34;
    const tw = this.spaced(this.brand.name.toUpperCase(), cx, cy, s, this.serif, grad, 0.16, '500');
    if (line) {
      const ls = h * 0.25, txt = (lineText || this.brand.line).toUpperCase();
      const lw = this.spaced(txt, cx, cy + h * 1.02, ls, this.sans, fill === 'gold' ? '#c9a45c' : fill, 0.42, '500');
      if (rules) {
        g.fillStyle = fill === 'gold' ? '#b08d57' : fill;
        const gap = h * 0.28, rl = Math.max(h * 0.5, (tw - lw) / 2 - gap);
        g.fillRect(cx - lw / 2 - gap - rl, cy + h * 1.02 - 0.75, rl, 1.5);
        g.fillRect(cx + lw / 2 + gap, cy + h * 1.02 - 0.75, rl, 1.5);
      }
    }
    return tw;
  }

  // ---------------------------------------------------------------- campaign prints (brand imagery)
  campaign(r, img, kind) {
    const [x, y, w, h] = r;
    this.clip(r, () => {
      const g = this.g;
      if (img && img.width) {
        const s = Math.max(w / img.width, h / img.height);
        const dw = img.width * s, dh = img.height * s;
        g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } else {
        // fallback: the campaign's dark-luxe look (charcoal wall, warm light, logo)
        const grd = g.createLinearGradient(x, y, x + w, y + h); grd.addColorStop(0, '#3a332c'); grd.addColorStop(1, '#141210');
        g.fillStyle = grd; g.fillRect(x, y, w, h);
        const sp = g.createRadialGradient(x + w * 0.7, y + h * 0.2, 10, x + w * 0.7, y + h * 0.2, w * 0.7);
        sp.addColorStop(0, 'rgba(255,220,170,0.35)'); sp.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = sp; g.fillRect(x, y, w, h);
        this.logo(x + w * 0.3, y + h * 0.45, h * 0.08, { fill: '#f4efe6' });
        g.fillStyle = kind === 'shoes' ? '#e9e3d8' : '#cdbb9e';
        g.beginPath(); g.ellipse(x + w * 0.72, y + h * 0.78, w * 0.14, h * 0.07, 0, 0, Math.PI * 2); g.fill();
      }
    });
  }

  // ---------------------------------------------------------------- retail print
  bag(r) {
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#121213'; g.fillRect(x, y, w, h);
    this.grain(r, 0.05, 9);
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x, y, w, h * 0.1); // turned-over top band
    this.logo(x + w / 2, y + h * 0.52, w * 0.085);
  }
  box(r) {
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#121213'; g.fillRect(x, y, w, h); this.grain(r, 0.04, 17);
    const grad = goldGradient(g, y + h * 0.2, y + h * 0.8);
    drawCrown(g, x + w / 2, y + h * 0.4, w * 0.3, grad);
    this.spaced(this.brand.name.toUpperCase(), x + w / 2, y + h * 0.66, w * 0.1, this.serif, grad, 0.16, '500');
  }
  tortoise(r) {
    const [x, y, w, h] = r; const g = this.g; const rr = rngOf(23);
    g.fillStyle = '#6b3a1c'; g.fillRect(x, y, w, h);
    this.clip(r, () => {
      for (let i = 0; i < 60; i++) {
        const cx = x + rr() * w, cy = y + rr() * h, s = 6 + rr() * 22;
        const c = rr() < 0.45 ? `rgba(24,12,6,${0.5 + rr() * 0.4})` : rr() < 0.7 ? `rgba(196,128,52,${0.4 + rr() * 0.4})` : `rgba(120,62,24,0.6)`;
        g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy, s, s * (0.5 + rr() * 0.5), rr() * 3, 0, Math.PI * 2); g.fill();
      }
    });
  }
  straw(r) {
    // light neutral basket weave; vertex colour = the product swatch (natural / black trim)
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#f2ead9'; g.fillRect(x, y, w, h);
    const s = 10;
    for (let j = 0; j * s < h; j++) for (let i = 0; i * s < w; i++) {
      const hor = (i + j) % 2 === 0;
      const px = x + i * s, py = y + j * s;
      const grd = hor ? g.createLinearGradient(px, py, px, py + s) : g.createLinearGradient(px, py, px + s, py);
      grd.addColorStop(0, '#b9ad96'); grd.addColorStop(0.5, '#fbf6ea'); grd.addColorStop(1, '#a89b83');
      g.fillStyle = grd; g.fillRect(px + 0.5, py + 0.5, s - 1, s - 1);
    }
  }
  tissue(r) {
    const [x, y, w, h] = r; const g = this.g; const rr = rngOf(81);
    g.fillStyle = '#f6f1e8'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 22; i++) { g.strokeStyle = `rgba(150,130,100,${0.06 + rr() * 0.06})`; g.lineWidth = 1 + rr() * 2; g.beginPath(); const sx = x + rr() * w, sy = y + rr() * h; g.moveTo(sx, sy); g.lineTo(sx + (rr() - 0.5) * 70, sy + (rr() - 0.5) * 50); g.stroke(); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) drawCrown(g, x + 16 + i * 30 + (j % 2) * 15, y + 18 + j * 28, 12, 'rgba(201,164,92,0.75)');
  }
  silk(r, v) {
    // light neutral silk print (the vertex colour tints it to the product's colour): border + chain motif
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#f7f3ee'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#d9cdbb'; g.lineWidth = 8; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    g.strokeStyle = '#c9a45c'; g.lineWidth = 2; g.strokeRect(x + 18, y + 18, w - 36, h - 36);
    g.strokeStyle = 'rgba(80,70,90,0.35)'; g.lineWidth = 2;
    const n = v === 1 ? 5 : 4;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = x + 30 + (i + 0.5) * (w - 60) / n, cy = y + 30 + (j + 0.5) * (h - 60) / n, s = (w - 60) / n * 0.34;
      g.beginPath();
      if (v === 1) { g.ellipse(cx, cy, s, s * 0.6, (i + j) % 2 ? 0.8 : -0.8, 0, Math.PI * 2); }
      else { g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath(); }
      g.stroke();
    }
    g.fillStyle = 'rgba(201,164,92,0.8)'; drawCrown(g, x + w / 2, y + h / 2, w * 0.14, 'rgba(201,164,92,0.85)');
  }
  plaque(r) {
    // halo-lit brand plaque (painted for the unlit glow material: black stays black, the gold glows)
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#050506'; g.fillRect(x, y, w, h);
    this.logo(x + w / 2, y + h * 0.56, h * 0.2);
  }
  sign(r) {
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#050506'; g.fillRect(x, y, w, h);
    const grad = goldGradient(g, y + h * 0.1, y + h * 0.9);
    drawCrown(g, x + w * 0.12, y + h * 0.5, h * 0.42, grad);
    this.spaced('FITTING ROOMS', x + w * 0.56, y + h * 0.52, h * 0.34, this.serif, grad, 0.2, '500');
  }
  cover([x, y, w, h], img, v) {
    const g = this.g;
    this.clip([x, y, w, h], () => {
      if (img && img.width) {
        // crop the right half of the campaign (rails / shoes) for a portrait cover
        const sx = img.width * (v ? 0.42 : 0.47), sw = img.width * 0.5, sh = img.height;
        const s = Math.max(w / sw, h / sh);
        g.drawImage(img, sx, 0, sw, sh, x + (w - sw * s) / 2, y + (h - sh * s) / 2, sw * s, sh * s);
      } else { g.fillStyle = v ? '#2b2622' : '#e9e1d4'; g.fillRect(x, y, w, h); }
      g.fillStyle = 'rgba(8,8,9,0.35)'; g.fillRect(x, y, w, h * 0.3);
      this.logo(x + w / 2, y + h * 0.16, w * 0.055, { fill: '#f7f2ea', rules: false });
      const promo = (this.brand.promos && this.brand.promos[0] && this.brand.promos[0].name) || 'Lookbook';
      const t = v ? this.brand.slogan : ('The ' + promo.replace(/^the\s+/i, '')).toUpperCase();
      const s = this.fit(t, w * 0.84, w * 0.07, this.serif, 0.1, '500');
      g.fillStyle = 'rgba(8,8,9,0.5)'; g.fillRect(x, y + h * 0.84, w, h * 0.16);
      this.spaced(t, x + w / 2, y + h * 0.92, s, this.serif, '#f7f2ea', 0.1, '500');
    });
  }
  mag([x, y, w, h], bg, title, sub, ink, seed) {
    const g = this.g;
    const grd = g.createLinearGradient(x, y, x, y + h); grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -0.25));
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.fillStyle = shade(bg, seed === 1 ? 0.22 : -0.4);
    g.beginPath(); g.ellipse(x + w * 0.52, y + h * 0.42, w * 0.11, h * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x + w * 0.2, y + h); g.bezierCurveTo(x + w * 0.25, y + h * 0.62, x + w * 0.4, y + h * 0.54, x + w * 0.52, y + h * 0.54);
    g.bezierCurveTo(x + w * 0.66, y + h * 0.54, x + w * 0.8, y + h * 0.62, x + w * 0.84, y + h); g.closePath(); g.fill();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `700 ${Math.round(w * 0.2)}px ${this.serif}`; g.fillText(title, x + w / 2, y + h * 0.2);
    g.font = `500 ${Math.round(w * 0.06)}px ${this.sans}`; g.fillText(sub, x + w / 2, y + h * 0.92);
    g.textAlign = 'start';
  }
  spines([x, y, w, h]) {
    const g = this.g; const r = rngOf(41);
    const sp = [['#1b1b1b', '#d9ab48', 'THE SHOE BOOK'], ['#e9e1d4', '#1b1b1b', 'LINEN'], ['#6b4a36', '#f4efe6', 'CAPE TOWN STYLE'], ['#141416', '#c9a45c', 'ICONS'],
      ['#cdbb9e', '#1b1b1b', 'WOODSTOCK'], ['#faf7f2', '#6b4a36', 'TAILORING'], ['#2b2f36', '#f4efe6', 'STREET'], ['#b08d57', '#141416', 'GOLD'],
      ['#8a7a64', '#141416', 'DENIM'], ['#f4efe6', '#141416', 'KNIT'], ['#43423f', '#e9e1d4', 'SNEAKERS'], ['#1b1b1b', '#f4efe6', 'IMAANS']];
    const sw = w / sp.length;
    sp.forEach(([bg, ink, t], i) => {
      const sx = x + i * sw; g.fillStyle = bg; g.fillRect(sx, y, sw, h);
      g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(sx, y, 2, h); g.fillRect(sx + sw - 2, y, 2, h);
      g.fillStyle = ink; g.fillRect(sx + 4, y + 10, sw - 8, 1.5); g.fillRect(sx + 4, y + h - 12, sw - 8, 1.5);
      g.save(); g.translate(sx + sw / 2, y + h / 2); g.rotate(Math.PI / 2);
      g.font = `500 ${Math.round(sw * 0.34)}px ${this.serif}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, 0, 0); g.restore();
      if (r() < 0.4) drawCrown(g, sx + sw / 2, y + h - 28, sw * 0.4, ink);
    });
    g.textAlign = 'start';
  }
  pos([x, y, w, h]) {
    // the till tablet: a real basket preview (two catalogue products) + "Send order on WhatsApp"
    const g = this.g; const cat = this.cat;
    g.fillStyle = '#faf7f2'; g.fillRect(x, y, w, h);
    g.fillStyle = '#050506'; g.fillRect(x, y, w, 30);
    const grad = goldGradient(g, y + 4, y + 26);
    drawCrown(g, x + 20, y + 15, 16, grad);
    this.spaced(this.brand.name.toUpperCase(), x + 70, y + 15, 12, this.serif, grad, 0.18, '500');
    this.spaced('YOUR BAG', x + w - 44, y + 15, 8, this.sans, '#c9a45c', 0.3, '500');
    const items = [cat.pick('sneaker', 'pos-1'), cat.pick('tote', 'pos-2'), cat.pick('scarf', 'pos-3')].filter(Boolean);
    let total = 0;
    g.textBaseline = 'middle';
    items.forEach((p, i) => {
      const yy = y + 48 + i * 26; const c = cat.priceOf(p); total += c;
      g.fillStyle = (p.colours[0] && p.colours[0].swatch) || '#cccccc'; g.fillRect(x + 12, yy - 9, 18, 18);
      g.fillStyle = '#1b1b1b'; g.font = `500 11px ${this.sans}`; g.textAlign = 'left';
      let name = p.name; while (g.measureText(name).width > w - 130 && name.length > 6) name = name.slice(0, -2);
      g.fillText(name === p.name ? name : name + '…', x + 38, yy);
      g.textAlign = 'right'; g.fillText(cat.formatPrice(c), x + w - 12, yy);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x + 12, yy + 13, w - 24, 1);
    });
    g.fillStyle = '#1b1b1b'; g.font = `600 13px ${this.sans}`; g.textAlign = 'left'; g.fillText('Total', x + 12, y + 132);
    g.textAlign = 'right'; g.fillText(cat.formatPrice(total), x + w - 12, y + 132);
    g.fillStyle = '#25a65a'; roundRect(g, x + 12, y + 150, w - 24, 38, 8); g.fill();
    g.fillStyle = '#ffffff'; g.font = `600 13px ${this.sans}`; g.textAlign = 'center'; g.fillText('Send my order on WhatsApp', x + w / 2, y + 169);
    g.textAlign = 'start';
    this._posTotal = total;
  }
  reader([x, y, w, h]) {
    const g = this.g;
    g.fillStyle = '#0c0d10'; g.fillRect(x, y, w, h);
    g.fillStyle = '#e8d49a'; g.font = `600 11px ${this.sans}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(this.cat.formatPrice(this._posTotal || 0).replace(/\.00$/, ''), x + w / 2, y + h * 0.4);
    g.fillStyle = '#b9b9c0'; g.font = `400 8px ${this.sans}`; g.fillText('Tap to pay', x + w / 2, y + h * 0.74); g.textAlign = 'start';
  }
  announce([x, y, w, h]) {
    // counter card: "Pay & collect" + the site's own announcement text (split on its separators)
    const g = this.g;
    g.fillStyle = '#faf7f2'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#b08d57'; g.lineWidth = 2; g.strokeRect(x + 7, y + 7, w - 14, h - 14);
    drawCrown(g, x + w / 2, y + 26, 24, goldGradient(g, y + 14, y + 38));
    this.spaced('PAY & COLLECT', x + w / 2, y + 52, 15, this.serif, '#1b1b1b', 0.2, '500');
    const parts = String(this.brand.announcement || '').split(/\s[·•|]\s|\.\s/).map(s => s.trim()).filter(Boolean).slice(0, 2);
    g.fillStyle = '#3a3531'; g.textAlign = 'center'; g.textBaseline = 'middle';
    parts.forEach((t, i) => { const s = this.fit(t, w - 36, 13, this.sans); g.font = `400 ${s}px ${this.sans}`; g.fillText(t, x + w / 2, y + 82 + i * 22); });
    g.fillStyle = '#b08d57'; g.fillRect(x + w / 2 - 30, y + h - 22, 60, 1.5);
    g.textAlign = 'start';
  }
  sizeguide([x, y, w, h]) {
    const g = this.g; const guides = this.cat.sizeGuides || [];
    g.fillStyle = '#121213'; g.fillRect(x, y, w, h);
    const grad = goldGradient(g, y + 10, y + 40);
    this.spaced('SIZE GUIDE', x + w / 2, y + 26, 18, this.serif, grad, 0.22, '500');
    g.fillStyle = '#b08d57'; g.fillRect(x + w / 2 - 40, y + 44, 80, 1.2);
    guides.slice(0, 2).forEach((sg, i) => {
      const yy = y + 66 + i * 36;
      g.fillStyle = '#9d968c'; g.font = `500 9px ${this.sans}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(sg.name || '').toUpperCase(), x + w / 2, yy);
      const sizes = (sg.sizes || []).slice(0, 7); const cw = (w - 30) / Math.max(1, sizes.length);
      sizes.forEach((s, k) => { g.fillStyle = '#f4efe6'; g.font = `500 12px ${this.sans}`; g.fillText(String(s), x + 15 + cw * (k + 0.5), yy + 16); });
    });
    g.fillStyle = '#c9a45c'; g.font = `500 9px ${this.sans}`; g.fillText('TAP FOR THE FULL GUIDE', x + w / 2, y + h - 12);
    g.textAlign = 'start';
  }
  card([x, y, w, h]) {
    const g = this.g;
    g.fillStyle = '#faf7f2'; g.fillRect(x, y, w, h);
    g.font = `italic 400 20px ${this.serif}`; g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Thank you', x + w / 2, y + h * 0.42);
    this.spaced(this.brand.name.toUpperCase(), x + w / 2, y + h * 0.72, 8, this.serif, '#b08d57', 0.3, '500');
    g.textAlign = 'start';
  }
  sockband([x, y, w, h]) {
    const g = this.g;
    g.fillStyle = '#f4efe6'; g.fillRect(x, y, w, h);
    drawCrown(g, x + 18, y + h / 2, 16, '#b08d57');
    this.spaced(this.brand.name.toUpperCase(), x + w * 0.55, y + h * 0.36, 11, this.serif, '#1b1b1b', 0.2, '500');
    this.spaced('3 PAIRS · COTTON', x + w * 0.55, y + h * 0.7, 7, this.sans, '#6b6b6b', 0.2, '500');
  }
  knit([x, y, w, h]) {
    const g = this.g; g.fillStyle = '#e8e2d8'; g.fillRect(x, y, w, h);
    for (let i = 0; i < w; i += 6) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + i, y, 2, h); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + i + 3, y, 1.5, h); }
  }
  hat([x, y, w, h]) {
    // woven straw hat crown (light neutral: tinted by the product colour)
    const g = this.g; g.fillStyle = '#efe6d2'; g.fillRect(x, y, w, h);
    for (let j = 0; j < h; j += 7) { g.fillStyle = j % 14 ? 'rgba(120,100,70,0.22)' : 'rgba(255,255,255,0.35)'; g.fillRect(x, y + j, w, 3); }
    for (let i = 0; i < w; i += 9) { g.fillStyle = 'rgba(90,70,40,0.12)'; g.fillRect(x + i, y, 1.5, h); }
  }
  leather(r) { this.flat(r, '#f2eee9'); this.grain(r, 0.12, 5, false); }
  wood([x, y, w, h]) {
    const g = this.g; g.fillStyle = '#8a6a50'; g.fillRect(x, y, w, h); const rr = rngOf(3);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(40,24,14,${0.1 + rr() * 0.2})`; g.lineWidth = 1 + rr() * 2; g.beginPath(); const xx = x + rr() * w; g.moveTo(xx, y); g.bezierCurveTo(xx + 6, y + h * 0.3, xx - 6, y + h * 0.7, xx + 3, y + h); g.stroke(); }
  }
  lookspine([x, y, w, h]) {
    const g = this.g; g.fillStyle = '#121213'; g.fillRect(x, y, w, h);
    this.spaced(this.brand.name.toUpperCase() + '  ·  LOOKBOOK', x + w / 2, y + h / 2, h * 0.42, this.serif, '#c9a45c', 0.2, '500');
  }
  tag([x, y, w, h]) {
    const g = this.g; g.fillStyle = '#faf7f2'; g.fillRect(x, y, w, h);
    drawCrown(g, x + w / 2, y + h * 0.36, w * 0.22, '#b08d57');
    this.spaced(this.brand.name.toUpperCase(), x + w / 2, y + h * 0.7, h * 0.18, this.serif, '#1b1b1b', 0.2, '500');
  }
  paper(r) { this.flat(r, '#f2ede4'); this.grain(r, 0.05, 71, false); }
  rope([x, y, w, h]) { const g = this.g; g.fillStyle = '#2a2a2c'; g.fillRect(x, y, w, h); for (let i = -h; i < w; i += 5) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke(); } }
}

function shade(hex, k) {
  const c = new THREE.Color(hex); const t = k < 0 ? new THREE.Color(0, 0, 0) : new THREE.Color(1, 1, 1);
  c.lerp(t, Math.abs(k)); return '#' + c.getHexString();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** Load brand images (campaign prints) for the atlas; resolves {key: img|null} within `timeout` ms. */
export function loadImages(urls, timeout = 5000) {
  const out = {};
  const jobs = Object.entries(urls).map(([k, url]) => new Promise((res) => {
    const img = new Image();
    let done = false; const fin = (ok) => { if (done) return; done = true; out[k] = ok ? img : null; res(); };
    img.onload = () => { if (img.decode) img.decode().then(() => fin(true), () => fin(true)); else fin(true); };
    img.onerror = () => fin(false);
    setTimeout(() => fin(false), timeout);
    img.src = url;
  }));
  return Promise.all(jobs).then(() => out);
}
