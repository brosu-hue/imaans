// Canvas-drawn textures for apparelRails: one small PRINT ATLAS (the black IMAANS swing tag and the gold / black
// texels the hooks and hanger bodies sample — one material, one shader program) and one GLOW texture (warm LED
// wash under a header / shelf lip, drawn additively).
//
// The mask canvas (half resolution) carries roughness in G and metalness in B, so the hooks read as polished
// brass and the crown as foil while the black card stays matte.
import * as THREE from 'three';
import { IM, spaced, fitSpaced, drawCrown } from './imaans.js';

const ATLAS = 128;

/** Returns { map, mask, rects: { tag, gold, black }, redraw() } — rects are [u0,v0,u1,v1]. */
export function makeAtlas(fonts) {
  const c = document.createElement('canvas'); c.width = c.height = ATLAS;
  const mc = document.createElement('canvas'); mc.width = mc.height = ATLAS / 2;
  const rect = (x, y, w, h) => [x / ATLAS, 1 - (y + h) / ATLAS, (x + w) / ATLAS, 1 - y / ATLAS];
  const inset = (r, px) => [r[0] + px / ATLAS, r[1] + px / ATLAS, r[2] - px / ATLAS, r[3] - px / ATLAS];
  // layout (px): tag 48 × 80 at (0, 0) · gold texel (64, 0) · black texel (96, 0)
  const rects = { tag: rect(0, 0, 48, 80), gold: inset(rect(64, 0, 32, 32), 8), black: inset(rect(96, 0, 32, 32), 8) };

  const draw = () => {
    const g = c.getContext('2d'), m = mc.getContext('2d');
    m.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.clearRect(0, 0, ATLAS, ATLAS);
    m.fillStyle = 'rgb(0,200,0)'; m.fillRect(0, 0, ATLAS, ATLAS);
    // swing tag: black card, gold crown + IMAANS, string hole
    const w = 48, h = 80;
    g.fillStyle = IM.black; g.fillRect(0, 0, w, h);
    drawCrown(g, w / 2, 30, 22, IM.goldHi); drawCrown(m, w / 2, 30, 22, IM.foil);
    const f = fitSpaced(g, 'IMAANS', fonts.display, 500, w - 8, 9, 0.18);
    spaced(g, 'IMAANS', w / 2, 52, f.font, f.track, IM.goldHi);
    g.fillStyle = IM.gold; g.fillRect(10, 60, w - 20, 1.2);
    g.beginPath(); g.fillStyle = '#8f8a82'; g.arc(w / 2, 8, 2.4, 0, Math.PI * 2); g.fill();
    // flat texels: polished gold (hooks), satin black (hanger bodies)
    g.fillStyle = '#d9b46a'; g.fillRect(64, 0, 32, 32); m.fillStyle = 'rgb(0,70,255)'; m.fillRect(64, 0, 32, 32);
    g.fillStyle = '#141416'; g.fillRect(96, 0, 32, 32); m.fillStyle = 'rgb(0,120,0)'; m.fillRect(96, 0, 32, 32);
    map.needsUpdate = true; mask.needsUpdate = true;
  };
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const mask = new THREE.CanvasTexture(mc); mask.colorSpace = THREE.NoColorSpace;
  draw();
  return { map, mask, rects, redraw: draw };
}

/** Additive glow sheet: left half = LED wash (bright at the top edge), right half = spot scallop. */
export function makeGlow() {
  const W = 128, H = 128, d = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const v = 1 - j / (H - 1);                    // 0 at the top of the quad (row H−1 = v 1 = top)
    for (let x = 0; x < W; x++) {
      let k;
      if (x < W / 2) {                             // LED wash: exponential falloff downwards, soft ends
        const u = x / (W / 2 - 1);
        const fall = Math.exp(-v * 4.2) * 0.85 + Math.exp(-v * 16) * 0.35;
        const e = Math.min(1, Math.min(u, 1 - u) / 0.12);
        k = fall * (0.2 + 0.8 * e * e * (3 - 2 * e));
      } else {                                     // scallop: hot spot near the top, widening and fading
        const u = (x - W / 2) / (W / 2 - 1) - 0.5;
        const width = 0.1 + 0.36 * Math.pow(v, 0.7);
        k = Math.exp(-Math.pow(u / width, 2) * 2.2) * Math.pow(Math.min(1, v / 0.08), 1.5) * Math.exp(-v * 2.6) * 1.35;
      }
      const c = Math.round(255 * Math.min(1, k)), i = (j * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
