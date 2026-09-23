// footwear — the brand atlas: ONE 1024² canvas texture read through uv1 by the shoe material (shoes,
// boxes, tissue). Holds the IMAANS box artwork (matte black + gold crown + wordmark), the ivory tissue,
// and print / textile patches (snake print, floral print, jute braid, raffia weave) that procedural
// shoes map onto their uppers and soles. Everything not printed samples the white block.
import * as THREE from 'three';
import { drawCrown, goldGradient } from '../../core/catalog.js';

export const ATLAS_SIZE = 1024;
// canvas pixel rects [x, y, w, h] (y down)
export const REGION = {
  white: [0, 0, 32, 32],
  lid: [40, 8, 624, 380],          // lid top (0.332 × 0.202 m)
  end: [672, 8, 344, 168],         // box end label (0.194 × 0.094 m)
  rim: [672, 184, 344, 64],        // lid skirt: black with a fine gold foil line
  side: [672, 256, 344, 132],      // long side of the base (0.324 × 0.094 m)
  tissue: [8, 400, 496, 496],
  snake: [512, 400, 248, 248],
  floral: [768, 400, 248, 248],
  jute: [512, 656, 248, 120],
  weave: [768, 656, 248, 120],
  suedeNap: [512, 784, 248, 112],
};
/** uv1 for (u, v) ∈ [0,1]² inside a region (v = 0 at the region's top). CanvasTexture flipY → v up. */
export function ruv(name, u, v) {
  const [x, y, w, h] = REGION[name];
  const pad = 2;
  const uu = x + pad + Math.min(1, Math.max(0, u)) * (w - 2 * pad), vv = y + pad + Math.min(1, Math.max(0, v)) * (h - 2 * pad);
  return [uu / ATLAS_SIZE, 1 - vv / ATLAS_SIZE];
}
export const WHITE_UV = ruv('white', 0.5, 0.5);

/** Paint the atlas. fonts = ctx.fonts; brand = ctx.brand; size = the size printed on the box end label (from the catalogue's size guide). */
export function brandAtlas(kit, fonts, brand, size = '') {
  const S = ATLAS_SIZE;
  const tex = kit.canvasTexture(S, S, (g) => {
    const R = kit.rng(4242);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    const disp = fonts.display, sans = fonts.sans;
    const name = (brand && brand.name) || 'IMAANS';
    const line = ((brand && brand.line) || 'Shoes & Clothing').toUpperCase();
    const BOARD = '#1b1b1c';
    // subtle board grain for matte black card
    const board = (x, y, w, h) => {
      g.fillStyle = BOARD; g.fillRect(x, y, w, h);
      g.globalAlpha = 0.05;
      for (let i = 0; i < (w * h) / 90; i++) { g.fillStyle = R() < 0.5 ? '#000000' : '#3a3a3c'; g.fillRect(x + R() * w, y + R() * h, 1 + R() * 2, 1); }
      g.globalAlpha = 1;
    };
    const spaced = (text, x, y, size, family, spacing, fill, weight = 500) => {
      g.font = `${weight} ${size}px ${family}`; g.fillStyle = fill; g.textBaseline = 'middle';
      const chars = [...text]; const widths = chars.map(c => g.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
      let cx = x - total / 2;
      chars.forEach((c, i) => { g.fillText(c, cx, y); cx += widths[i] + spacing; });
      return total;
    };
    // ---- lid top: crown + wordmark + line, a gold keyline
    {
      const [x, y, w, h] = REGION.lid; board(x, y, w, h);
      const gold = goldGradient(g, y + h * 0.16, y + h * 0.84);
      g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(x + 16, y + 16, w - 32, h - 32);
      g.lineWidth = 1; g.strokeRect(x + 24, y + 24, w - 48, h - 48);
      drawCrown(g, x + w / 2, y + h * 0.3, w * 0.12, gold);
      spaced(name, x + w / 2, y + h * 0.56, Math.round(h * 0.2), disp, h * 0.05, gold);
      g.fillStyle = gold; g.fillRect(x + w / 2 - w * 0.2, y + h * 0.7, w * 0.4, 1.5);
      spaced(line, x + w / 2, y + h * 0.78, Math.round(h * 0.055), sans, h * 0.028, gold);
    }
    // ---- end label: crown + wordmark left, size box right
    {
      const [x, y, w, h] = REGION.end; board(x, y, w, h);
      const gold = goldGradient(g, y + h * 0.1, y + h * 0.9);
      drawCrown(g, x + w * 0.3, y + h * 0.28, w * 0.1, gold);
      spaced(name, x + w * 0.3, y + h * 0.55, Math.round(h * 0.2), disp, h * 0.04, gold);
      spaced(line, x + w * 0.3, y + h * 0.77, Math.round(h * 0.075), sans, h * 0.03, gold);
      g.strokeStyle = gold; g.lineWidth = 2; g.strokeRect(x + w * 0.64, y + h * 0.22, w * 0.26, h * 0.56);
      g.fillStyle = '#e9e1d0'; g.font = `500 ${Math.round(h * 0.1)}px ${sans}`; g.textAlign = 'center';
      const eu = /^\d/.test(String(size));
      g.fillText(eu ? 'EU' : 'SIZE', x + w * 0.77, y + h * 0.37);
      if (size) { g.font = `500 ${Math.round(h * 0.24)}px ${disp}`; g.fillText(String(size), x + w * 0.77, y + h * 0.6); }
      g.textAlign = 'left';
    }
    // ---- lid skirt + base sides: black with a fine gold foil line
    {
      let [x, y, w, h] = REGION.rim; board(x, y, w, h);
      g.fillStyle = goldGradient(g, y, y + h); g.fillRect(x, y + h * 0.62, w, 2);
      [x, y, w, h] = REGION.side; board(x, y, w, h);
    }
    // ---- ivory tissue with a tone-on-tone crown repeat
    {
      const [x, y, w, h] = REGION.tissue;
      g.fillStyle = '#f2e9d7'; g.fillRect(x, y, w, h);   // ivory (reads ivory, not white, under the warm spots)
      g.globalAlpha = 0.07;
      for (let i = 0; i < 900; i++) { g.fillStyle = R() < 0.5 ? '#d8cdb8' : '#ffffff'; g.fillRect(x + R() * w, y + R() * h, 2 + R() * 30, 1); }
      g.globalAlpha = 1;
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        const cx = x + (i + (j % 2) * 0.5) * (w / 7) + 18, cy = y + j * (h / 7) + 30;
        if (cx > x + w - 10) continue;
        drawCrown(g, cx, cy, 22, 'rgba(176,141,87,0.28)');
      }
    }
    // ---- snake print (scales; tinted by the product colour)
    {
      const [x, y, w, h] = REGION.snake;
      g.fillStyle = '#d9d4cc'; g.fillRect(x, y, w, h);
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      const s = 11;
      for (let j = -1; j < h / (s * 0.8) + 1; j++) for (let i = -1; i < w / s + 1; i++) {
        const cx = x + i * s + (j % 2) * s / 2, cy = y + j * s * 0.8;
        const band = 0.5 + 0.5 * Math.sin((cx - x) / w * 9 + Math.sin((cy - y) / h * 5) * 1.8);
        const v = Math.round(90 + band * 150 + R() * 20);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.beginPath(); g.ellipse(cx, cy, s * 0.46, s * 0.38, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(40,34,30,0.55)'; g.lineWidth = 1; g.stroke();
      }
      g.restore();
    }
    // ---- floral print (cream blossoms on a light ground; the product colour tints it)
    {
      const [x, y, w, h] = REGION.floral;
      g.fillStyle = '#e6e1dc'; g.fillRect(x, y, w, h);
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      for (let i = 0; i < 46; i++) {
        const cx = x + R() * w, cy = y + R() * h, r = 7 + R() * 9;
        g.fillStyle = 'rgba(110,120,80,0.55)';
        g.beginPath(); g.ellipse(cx + r * 0.9, cy + r * 0.4, r * 0.55, r * 0.22, 0.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = R() < 0.5 ? '#ffffff' : '#fff4e2';
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + i; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.42, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#e8b64c'; g.beginPath(); g.arc(cx, cy, r * 0.22, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    // ---- jute braid (espadrille wedge sides), natural colour (untinted)
    {
      const [x, y, w, h] = REGION.jute;
      g.fillStyle = '#c9ae82'; g.fillRect(x, y, w, h);
      const rows = 9, rh = h / rows;
      for (let r = 0; r < rows; r++) for (let i = 0; i < w / 7 + 1; i++) {
        const cx = x + i * 7 + (r % 2) * 3.5, cy = y + r * rh + rh / 2;
        g.fillStyle = `rgba(${150 + (R() * 40) | 0},${118 + (R() * 30) | 0},${72 + (R() * 20) | 0},1)`;
        g.beginPath(); g.ellipse(cx, cy, 4.2, rh * 0.46, r % 2 ? 0.6 : -0.6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(80,60,35,0.45)'; g.lineWidth = 1; g.stroke();
      }
    }
    // ---- raffia / woven leather basket weave (tinted)
    {
      const [x, y, w, h] = REGION.weave;
      g.fillStyle = '#9a948c'; g.fillRect(x, y, w, h);
      const c = 12;
      for (let j = 0; j < h / c + 1; j++) for (let i = 0; i < w / c + 1; i++) {
        const horiz = (i + j) % 2 === 0;
        const gg = g.createLinearGradient(x + i * c, y + j * c, horiz ? x + i * c : x + i * c + c, horiz ? y + j * c + c : y + j * c);
        gg.addColorStop(0, '#bdb7ae'); gg.addColorStop(0.5, '#f4efe7'); gg.addColorStop(1, '#bdb7ae');
        g.fillStyle = gg; g.fillRect(x + i * c + 1, y + j * c + 1, c - 2, c - 2);
      }
    }
    // ---- suede nap (very subtle mottling)
    {
      const [x, y, w, h] = REGION.suedeNap;
      g.fillStyle = '#f2f2f2'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 500; i++) { const cx = x + R() * w, cy = y + R() * h, r = 4 + R() * 14; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, R() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(200,200,200,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); }
    }
  });
  tex.channel = 1;
  tex.anisotropy = 4;
  tex.name = 'footwear:brandAtlas';
  return tex;
}
