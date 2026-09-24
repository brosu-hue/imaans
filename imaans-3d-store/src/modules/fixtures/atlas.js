// fixtures — ONE painted canvas atlas (1024×512 design space; 512×256 on low tier) shared by every printed /
// painted surface of the module: the IMAANS crown lockup on the shopping bags, the till (POS) and
// card-machine screens, the counter's announcement card, and the small product patterns
// (tortoiseshell, straw weave, silk prints, knit rib, straw hat, sock band, tissue). All text that is shop data
// comes from ctx.brand / ctx.catalog, painted at build time. Regions are returned as UV rects [u0, v0, u1, v1].
import { drawCrown, goldGradient } from '../../core/catalog.js';

const W = 1024, H = 512;

function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// pixel rects [x, y, w, h] (design space, y down)
const R = {
  bag: [0, 0, 200, 250], tortoise: [368, 0, 128, 128], straw: [500, 0, 128, 128],
  silk: [632, 0, 128, 128], silk2: [764, 0, 128, 128], hat: [896, 0, 128, 128],
  knit: [368, 132, 90, 86], sockband: [462, 132, 140, 56], rope: [462, 192, 40, 40], white: [506, 192, 40, 40],
  dark: [550, 192, 40, 40], tissue: [638, 132, 150, 120],
  pos: [0, 256, 300, 206], announce: [304, 256, 330, 146], reader: [436, 406, 90, 60],
};

/**
 * @param kit    ctx.kit
 * @param o      { fonts:{display,sans}, brand, catalog, tier }
 */
export function makeAtlas(kit, o) {
  const regions = {};
  // low tier: paint at half resolution (512×256, the tier's texture cap). Everything is painted in the design
  // space through a scale transform, so regions / UVs are unchanged.
  const sc = o.tier === 'low' ? 0.5 : 1;
  const tex = kit.canvasTexture(W * sc, H * sc, (g) => {
    if (sc !== 1) g.scale(sc, sc);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const P = new Painter(g, o);
    P.bag(R.bag); P.tortoise(R.tortoise); P.straw(R.straw); P.tissue(R.tissue);
    P.silk(R.silk, 1); P.silk(R.silk2, 2); P.hat(R.hat); P.knit(R.knit); P.sockband(R.sockband); P.rope(R.rope);
    P.flat(R.white, '#ffffff'); P.flat(R.dark, '#0e0e10');
    P.pos(R.pos); P.reader(R.reader); P.announce(R.announce);
  });
  tex.anisotropy = o.tier === 'low' ? 2 : 4;
  tex.generateMipmaps = true;
  for (const [k, [x, y, w, h]] of Object.entries(R)) {
    const e = 1.5; // inset so mips don't bleed between regions
    regions[k] = [(x + e) / W, 1 - (y + h - e) / H, (x + w - e) / W, 1 - (y + e) / H];
  }
  const centre = (k) => { const r = regions[k]; return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]; };
  /** sub-rect of a region: fractions fx0..fx1, fy0..fy1 (fy from the region's top). */
  const sub = (k, fx0, fy0, fx1, fy1) => { const r = regions[k]; return [r[0] + (r[2] - r[0]) * fx0, r[3] - (r[3] - r[1]) * fy1, r[0] + (r[2] - r[0]) * fx1, r[3] - (r[3] - r[1]) * fy0]; };
  return { tex, regions, centre, sub };
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
  /** IMAANS lockup centred at (cx, cy): crown above the wide serif wordmark, the line in spaced sans caps. */
  logo(cx, cy, h, { fill = 'gold', line = true, crown = true, rules = true } = {}) {
    const g = this.g;
    const grad = fill === 'gold' ? goldGradient(g, cy - h * 2.0, cy + h * 1.1) : fill;
    if (crown) drawCrown(g, cx, cy - h * 1.32, h * 1.25, grad);
    const tw = this.spaced(this.brand.name.toUpperCase(), cx, cy, h * 1.34, this.serif, grad, 0.16, '500');
    if (line) {
      const ls = h * 0.25, txt = String(this.brand.line || '').toUpperCase();
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
  // ---------------------------------------------------------------- retail print
  bag(r) {
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#121213'; g.fillRect(x, y, w, h);
    this.grain(r, 0.05, 9);
    g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x, y, w, h * 0.1); // turned-over top band
    this.logo(x + w / 2, y + h * 0.52, w * 0.085);
  }
  tortoise(r) {
    const [x, y, w, h] = r; const g = this.g; const rr = rngOf(23);
    g.fillStyle = '#6b3a1c'; g.fillRect(x, y, w, h);
    this.clip(r, () => {
      for (let i = 0; i < 50; i++) {
        const cx = x + rr() * w, cy = y + rr() * h, s = 5 + rr() * 19;
        const c = rr() < 0.45 ? `rgba(24,12,6,${0.5 + rr() * 0.4})` : rr() < 0.7 ? `rgba(196,128,52,${0.4 + rr() * 0.4})` : 'rgba(120,62,24,0.6)';
        g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy, s, s * (0.5 + rr() * 0.5), rr() * 3, 0, Math.PI * 2); g.fill();
      }
    });
  }
  straw(r) {
    // light neutral basket weave; vertex colour = the product swatch (natural / black trim)
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#f2ead9'; g.fillRect(x, y, w, h);
    const s = 8;
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
    // light neutral silk print (the vertex colour tints it to the product's colour): border + motif
    const [x, y, w, h] = r; const g = this.g;
    g.fillStyle = '#f7f3ee'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#d9cdbb'; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.strokeStyle = '#c9a45c'; g.lineWidth = 2; g.strokeRect(x + 14, y + 14, w - 28, h - 28);
    g.strokeStyle = 'rgba(80,70,90,0.35)'; g.lineWidth = 2;
    const n = v === 1 ? 4 : 3;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = x + 22 + (i + 0.5) * (w - 44) / n, cy = y + 22 + (j + 0.5) * (h - 44) / n, s = (w - 44) / n * 0.34;
      g.beginPath();
      if (v === 1) g.ellipse(cx, cy, s, s * 0.6, (i + j) % 2 ? 0.8 : -0.8, 0, Math.PI * 2);
      else { g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath(); }
      g.stroke();
    }
    drawCrown(g, x + w / 2, y + h / 2, w * 0.14, 'rgba(201,164,92,0.85)');
  }
  pos([x, y, w, h]) {
    // the till tablet: a real basket preview (three catalogue products) + "Send order on WhatsApp"
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
    // woven straw hat (light neutral: tinted by the product colour)
    const g = this.g; g.fillStyle = '#efe6d2'; g.fillRect(x, y, w, h);
    for (let j = 0; j < h; j += 6) { g.fillStyle = j % 12 ? 'rgba(120,100,70,0.22)' : 'rgba(255,255,255,0.35)'; g.fillRect(x, y + j, w, 3); }
    for (let i = 0; i < w; i += 8) { g.fillStyle = 'rgba(90,70,40,0.12)'; g.fillRect(x + i, y, 1.5, h); }
  }
  rope([x, y, w, h]) {
    const g = this.g; g.fillStyle = '#2a2a2c'; g.fillRect(x, y, w, h);
    for (let i = -h; i < w; i += 5) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke(); }
  }
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
