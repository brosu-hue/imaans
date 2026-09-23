// Canvas-drawn textures for apparelRails: one PRINT ATLAS (IMAANS black + gold plaques for the bay
// friezes and rail toppers, ivory size dividers, swing tags, the gold / black texels the hooks and hangers
// sample, the black IMAANS hat-box print — one material, one shader program) and one GLOW texture (warm
// LED wash under shelves and a soft spot scallop, drawn additively).
//
// The mask canvas (half resolution) carries roughness in G and metalness in B, so gold lettering reads as
// foil and the hooks as polished brass while the black ground stays matte.
import * as THREE from 'three';
import { IM, paintPlaque, paintBox, spaced, fitSpaced, drawCrown } from './imaans.js';

export const ATLAS_W = 1024, ATLAS_H = 1024;

/**
 * words: plaque texts (bay names, rail edits). sizes: size-divider labels. Returns
 * { map, mask, rects: { words[i], sizes{label}, tag, gold, black, box }, redraw() } — rects are [u0,v0,u1,v1].
 */
export function makeAtlas(fonts, words, sizes, { scale = 1 } = {}) {
  const S = scale;
  const c = document.createElement('canvas'); c.width = ATLAS_W * S; c.height = ATLAS_H * S;
  const mc = document.createElement('canvas'); mc.width = ATLAS_W * S / 2; mc.height = ATLAS_H * S / 2;
  const rect = (x, y, w, h) => [x / ATLAS_W, 1 - (y + h) / ATLAS_H, (x + w) / ATLAS_W, 1 - y / ATLAS_H];
  const inset = (r, px) => [r[0] + px / ATLAS_W, r[1] + px / ATLAS_H, r[2] - px / ATLAS_W, r[3] - px / ATLAS_H];
  const rects = { words: [], sizes: {}, tag: null, gold: null, black: null, box: null };
  // layout (atlas px): plaques 512 × 64 in two columns (16 max) · size discs 64² at y 512 · tag + texels at
  // y 640 · the hat-box print 512 × 256 at (512, 640)
  const wordCell = i => [(i % 2) * 512, Math.floor(i / 2) * 64, 512, 64];
  words.slice(0, 16).forEach((w, i) => rects.words.push(inset(rect(...wordCell(i)), 1)));
  sizes.slice(0, 32).forEach((s, i) => { rects.sizes[s] = rect((i % 16) * 64, 512 + Math.floor(i / 16) * 64, 64, 64); });
  rects.tag = rect(0, 640, 48, 80);
  rects.gold = inset(rect(64, 640, 32, 32), 8); rects.black = inset(rect(96, 640, 32, 32), 8); rects.ivory = inset(rect(128, 640, 32, 32), 8);
  rects.box = inset(rect(512, 640, 512, 256), 2);

  const draw = () => {
    const g = c.getContext('2d'), m = mc.getContext('2d');
    g.setTransform(S, 0, 0, S, 0, 0); m.setTransform(S / 2, 0, 0, S / 2, 0, 0);
    g.clearRect(0, 0, ATLAS_W, ATLAS_H);
    m.fillStyle = 'rgb(0,200,0)'; m.fillRect(0, 0, ATLAS_W, ATLAS_H);
    // ---- plaques: black ground, gold keyline, gold spaced serif caps
    words.slice(0, 16).forEach((w, i) => paintPlaque(g, m, fonts, wordCell(i), w));
    // ---- size dividers: ivory disc, gold keyline, black size mark in the lower half (the rail runs through the top)
    sizes.slice(0, 32).forEach((s, i) => {
      const x = (i % 16) * 64, y = 512 + Math.floor(i / 16) * 64;
      g.fillStyle = '#f1ece3'; g.beginPath(); g.arc(x + 32, y + 32, 31, 0, Math.PI * 2); g.fill();
      g.strokeStyle = IM.gold; g.lineWidth = 1.6; g.beginPath(); g.arc(x + 32, y + 32, 28.5, 0, Math.PI * 2); g.stroke();
      m.strokeStyle = 'rgb(0,90,255)'; m.lineWidth = 3; m.beginPath(); m.arc(x + 32, y + 32, 28.5, 0, Math.PI * 2); m.stroke();
      const f = fitSpaced(g, s, fonts.sans, 500, 40, s.length > 2 ? 12 : 15, 0.05);
      spaced(g, s, x + 32, y + 52, f.font, f.track, '#141414');
    });
    // ---- swing tag: black card, gold crown + IMAANS, string hole
    {
      const x = 0, y = 640, w = 48, h = 80;
      g.fillStyle = IM.black; g.fillRect(x, y, w, h);
      drawCrown(g, x + w / 2, y + 30, 22, IM.goldHi); drawCrown(m, x + w / 2, y + 30, 22, IM.foil);
      const f = fitSpaced(g, 'IMAANS', fonts.display, 500, w - 8, 9, 0.18);
      spaced(g, 'IMAANS', x + w / 2, y + 52, f.font, f.track, IM.goldHi);
      g.fillStyle = IM.gold; g.fillRect(x + 10, y + 60, w - 20, 1.2);
      g.beginPath(); g.fillStyle = '#8f8a82'; g.arc(x + w / 2, y + 8, 2.4, 0, Math.PI * 2); g.fill();
    }
    // ---- flat texels: polished gold (hooks), satin black (hangers), ivory
    g.fillStyle = '#d9b46a'; g.fillRect(64, 640, 32, 32); m.fillStyle = 'rgb(0,70,255)'; m.fillRect(64, 640, 32, 32);
    g.fillStyle = '#141416'; g.fillRect(96, 640, 32, 32); m.fillStyle = 'rgb(0,120,0)'; m.fillRect(96, 640, 32, 32);
    g.fillStyle = '#efe8dc'; g.fillRect(128, 640, 32, 32); m.fillStyle = 'rgb(0,200,0)'; m.fillRect(128, 640, 32, 32);
    // ---- the IMAANS hat box (black, gold crown + wordmark)
    paintBox(g, m, fonts, [512, 640, 512, 256]);
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
