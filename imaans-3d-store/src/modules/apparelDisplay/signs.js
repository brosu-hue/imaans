// apparelDisplay — one 1024² canvas atlas for every printed thing in the zones: the Spring Edit easel on
// the plinth, the knitwear card on the table, the cubby plaque, the window card and the two IMAANS hat-box
// prints. All copy comes from ctx.brand / ctx.catalog (promo headline, group labels, sizes, "from" prices).
// A matching mask canvas drives roughness (G) + metalness (B) so the gold reads as foil. The material is
// the shared print program (apparelRails/imaans.printMaterial) — use it on InstancedMeshes only.
// Redrawn once the ui's brand webfonts have loaded.
import * as THREE from 'three';
import { IM, fontsOf, spaced, fitSpaced, wrapLines, drawCrown, goldGradient, paintPlaque, paintBox, printMaterial } from '../apparelRails/imaans.js';

export const REGIONS = {
  season: [0, 0, 512, 680],        // portrait easel card (0.3 × 0.4 m)
  knit: [512, 0, 512, 340],         // knitwear table card (0.18 × 0.12 m)
  denim: [512, 340, 512, 128],      // cubby plaque (0.46 × 0.115 m)
  window: [512, 468, 512, 212],     // window podium card (0.26 × 0.108 m)
  black: [8, 700, 48, 48],          // plain black (card backs)
  ivory: [72, 700, 48, 48],         // plain ivory (card backs)
  boxBlack: [0, 776, 512, 240],     // IMAANS hat box, black + gold
  boxIvory: [512, 776, 512, 240],   // IMAANS hat box, ivory + black
};
const W = 1024, H = 1024;

/**
 * copy: { season: {title, rest, sub}, knit: {label, line, from}, denim: {label, line}, window: {line, dept} }
 * Returns { material, plane(region, w, h), uv(region) → [u0,v0,u1,v1], redraw }.
 */
export function createSigns(ctx, copy) {
  const fonts = () => fontsOf(ctx);
  const sc = ctx.tier === 'low' ? 0.5 : 1;
  const cCol = document.createElement('canvas'); cCol.width = W * sc; cCol.height = H * sc;
  const cMsk = document.createElement('canvas'); cMsk.width = W * sc / 2; cMsk.height = H * sc / 2;
  const map = new THREE.CanvasTexture(cCol); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const msk = new THREE.CanvasTexture(cMsk); msk.colorSpace = THREE.NoColorSpace;
  const draw = () => {
    const F = fonts();
    const g = cCol.getContext('2d'), m = cMsk.getContext('2d');
    g.setTransform(sc, 0, 0, sc, 0, 0); m.setTransform(sc / 2, 0, 0, sc / 2, 0, 0);
    g.clearRect(0, 0, W, H); m.fillStyle = 'rgb(0,150,0)'; m.fillRect(0, 0, W, H);
    const FOIL = IM.foil;
    const both = (fn, fill) => { fn(g, fill); fn(m, FOIL); };
    // --- The Spring Edit: black lacquer card, gold double keyline, crown, serif caps
    {
      const [x, y, w, h] = REGIONS.season, S = copy.season || {};
      g.fillStyle = '#0f0f10'; g.fillRect(x, y, w, h);
      const sheen = g.createLinearGradient(x, y, x + w, y + h); sheen.addColorStop(0, 'rgba(255,255,255,0.05)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = sheen; g.fillRect(x, y, w, h);
      const gold = goldGradient(g, y + 40, y + h - 40);
      both((c, f) => { c.strokeStyle = f; c.lineWidth = 3; c.strokeRect(x + 24, y + 24, w - 48, h - 48); c.lineWidth = 1.2; c.strokeRect(x + 34, y + 34, w - 68, h - 68); }, gold);
      both((c, f) => drawCrown(c, x + w / 2, y + 118, 78, f), goldGradient(g, y + 92, y + 146));
      // title in one or two lines of spaced caps ("THE SPRING" / "EDIT")
      const T = String(S.title || 'The Edit').toUpperCase().split(/\s+/);
      const lines = T.length > 2 ? [T.slice(0, Math.ceil(T.length / 2)).join(' '), T.slice(Math.ceil(T.length / 2)).join(' ')] : T.length === 2 && T.join(' ').length > 11 ? [T[0], T[1]] : [T.join(' ')];
      const maxW = w - 110;
      const fit = lines.map(l => fitSpaced(g, l, F.display, 500, maxW, 66, 0.14));
      const px = Math.min(...fit.map(f => f.px));
      const ft = `500 ${px}px ${F.display}`, tr = px * 0.14;
      let by = y + 250;
      for (const l of lines) { both((c, f) => spaced(c, l, x + w / 2, by, ft, tr, f), goldGradient(g, by - px, by)); by += px * 1.22; }
      both((c, f) => { c.fillStyle = f; c.fillRect(x + w / 2 - 60, by - px * 0.55, 120, 2); }, IM.gold);
      if (S.rest) {
        g.font = `italic 500 40px ${F.display}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = IM.goldHi;
        g.fillText(S.rest, x + w / 2, by + 20, maxW);
      }
      if (S.sub) {
        const sub = S.sub.replace(/\s+[—–-]\s+.*$/, '');      // keep the first clause ("…live in")
        g.font = `400 23px ${F.sans}`; g.fillStyle = '#cbbd9e'; g.textAlign = 'center';
        wrapLines(g, sub, maxW - 20, 3).forEach((l, i) => g.fillText(l, x + w / 2, by + 78 + i * 32));
      }
      both((c, f) => spaced(c, 'IMAANS', x + w / 2, y + h - 78, `500 26px ${F.display}`, 26 * 0.3, f), goldGradient(g, y + h - 102, y + h - 78));
      spaced(g, 'SHOES & CLOTHING', x + w / 2, y + h - 52, `500 13px ${F.sans}`, 13 * 0.32, '#b9a67f');
    }
    g.fillStyle = '#121214'; g.fillRect(...REGIONS.black); g.fillStyle = '#efe8dc'; g.fillRect(...REGIONS.ivory);
    // --- knitwear table card: ivory card, black serif title, gold rule + "from" price
    {
      const [x, y, w, h] = REGIONS.knit, K = copy.knit || {};
      g.fillStyle = '#f3eee4'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#d9cfbd'; g.lineWidth = 2; g.strokeRect(x + 14, y + 14, w - 28, h - 28);
      drawCrown(g, x + w / 2, y + 62, 40, IM.black);
      const t = fitSpaced(g, String(K.label || 'Knitwear').toUpperCase(), F.display, 500, w - 90, 58, 0.16);
      spaced(g, String(K.label || 'Knitwear').toUpperCase(), x + w / 2, y + 160, t.font, t.track, '#1b1b1b');
      if (K.line) { const s = fitSpaced(g, K.line.toUpperCase(), F.sans, 500, w - 90, 20, 0.22); spaced(g, K.line.toUpperCase(), x + w / 2, y + 206, s.font, s.track, '#6b6358'); }
      both((c, f) => { c.fillStyle = f; c.fillRect(x + w / 2 - 50, y + 236, 100, 2); }, IM.gold);
      if (K.from) both((c, f) => spaced(c, 'FROM ' + K.from, x + w / 2, y + 282, `500 26px ${F.sans}`, 26 * 0.12, f), IM.gold);
    }
    // --- cubby plaque: IMAANS black + gold
    { const Dn = copy.denim || {}; paintPlaque(g, m, F, REGIONS.denim, Dn.label || 'Denim', { sub: Dn.line || '' }); }
    // --- window card: ivory, crown + the department line
    {
      const [x, y, w, h] = REGIONS.window, Wd = copy.window || {};
      g.fillStyle = '#efe7da'; g.fillRect(x, y, w, h);
      drawCrown(g, x + w / 2, y + 42, 34, IM.gold);
      g.font = `italic 500 52px ${F.display}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#1b1b1b';
      g.fillText(Wd.line || ctx.brand.slogan || '', x + w / 2, y + 128, w - 40);
      const s = fitSpaced(g, ('IMAANS · ' + (Wd.dept || '')).toUpperCase(), F.sans, 500, w - 80, 20, 0.3);
      spaced(g, ('IMAANS · ' + (Wd.dept || '')).toUpperCase(), x + w / 2, y + 176, s.font, s.track, '#6d5d52');
    }
    // --- hat-box prints
    paintBox(g, m, F, REGIONS.boxBlack);
    paintBox(g, m, F, REGIONS.boxIvory, { ground: '#efe8dc', band: '#e4dccd', ink: IM.black });
    map.needsUpdate = true; msk.needsUpdate = true;
  };
  draw();
  if (document.fonts) {
    let n = 0; const redraw = () => { if (n++ < 4) draw(); };
    if (document.fonts.ready) document.fonts.ready.then(redraw);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', redraw);
  }
  const material = printMaterial(map, msk, 'apparelDisplay:signs');
  const uv = region => { const [x, y, rw, rh] = REGIONS[region]; return [x / W, 1 - (y + rh) / H, (x + rw) / W, 1 - y / H]; };
  /** Plane geometry (w × h metres) mapped to a region, facing +z. */
  const plane = (region, w, h) => {
    const [x, y, rw, rh] = REGIONS[region];
    const g = new THREE.PlaneGeometry(w, h);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, (x + a.getX(i) * rw) / W, 1 - (y + (1 - a.getY(i)) * rh) / H);
    return g;
  };
  return { material, plane, uv, redraw: draw, copy };
}
