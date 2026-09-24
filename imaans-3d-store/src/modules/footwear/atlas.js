// footwear — the print atlas: ONE 512² canvas texture read through uv1 by the shoe material. Holds the print /
// textile patches (snake print, floral print, jute braid, raffia weave) that procedural shoes map onto
// their uppers and soles. Everything not printed samples the white block.

export const ATLAS_SIZE = 512;
// canvas pixel rects [x, y, w, h] (y down)
export const REGION = {
  white: [0, 0, 32, 32],
  snake: [8, 40, 244, 244],
  floral: [260, 40, 244, 244],
  jute: [8, 292, 244, 120],
  weave: [260, 292, 244, 120],
};
/** uv1 for (u, v) ∈ [0,1]² inside a region (v = 0 at the region's top). CanvasTexture flipY → v up. */
export function ruv(name, u, v) {
  const [x, y, w, h] = REGION[name];
  const pad = 2;
  const uu = x + pad + Math.min(1, Math.max(0, u)) * (w - 2 * pad), vv = y + pad + Math.min(1, Math.max(0, v)) * (h - 2 * pad);
  return [uu / ATLAS_SIZE, 1 - vv / ATLAS_SIZE];
}
export const WHITE_UV = ruv('white', 0.5, 0.5);

/** Paint the atlas (kit = ctx.kit). */
export function printAtlas(kit) {
  const S = ATLAS_SIZE;
  const tex = kit.canvasTexture(S, S, (g) => {
    const R = kit.rng(4242);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
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
  });
  tex.channel = 1;
  tex.anisotropy = 4;
  tex.name = 'footwear:printAtlas';
  return tex;
}
