// IMAANS glue shared by the two clothing modules (apparelRails + apparelDisplay).
//
//  • Catalogue → store: every 3-D garment / stack / look maps to a real product of ctx.catalog (which product
//    goes where: layout.splitClothes). lineOf(p) picks the hanging silhouette from the product's own tags.
//  • productCard(): catalog.card + colourways that recolour the 3-D item (current colour listed first).
//  • Canvas type helpers in the IMAANS style (spaced serif caps, crown, black + gold) for the swing tags.
//  • The shared, program-cheap materials both modules use (see CONTRACT: shader-program budget):
//      printMaterial   MeshStandard map + roughness/metalness mask + alphaTest, instanced (swing tags, hooks,
//                      hanger bodies) — ONE program
//      ledMaterial     MeshBasic + map, opaque — the same program as architecture's glow lenses
//      glowMaterial    MeshBasic + map, additive — the same program as architecture's halos
//      ShadowQuads     contact shadows: MeshBasic + map (opacity levels baked into a 4×2 atlas) —
//                      shares architecture's additive program (blending is not a program parameter)
import * as THREE from 'three';
import { drawCrown } from '../../core/catalog.js';

export const IM = { black: '#141414', ink: '#0b0b0c', gold: '#b08d57', goldHi: '#e6c170', ivory: '#faf7f2', border: '#e8e3da',
  // print mask (G = roughness, B = metalness): gold foil is part metal so it still reads gold where no
  // light hits it (a fully metallic letter only mirrors the — often dark — surroundings)
  foil: 'rgb(0,95,165)', matte: 'rgb(0,150,0)' };

// ---------------------------------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------------------------------
const _c = new THREE.Color(), _d = new THREE.Color();
/** Perceived lightness 0..1 of an sRGB hex. */
export function lum(hex) { _c.set(hex || '#888888'); return 0.3 * _c.r + 0.59 * _c.g + 0.11 * _c.b; }
/** Product colour indices ordered light → dark (a retail colour gradient). */
export function lightToDark(p) { return (p.colours || []).map((c, i) => i).sort((a, b) => lum(p.colours[b].swatch) - lum(p.colours[a].swatch)); }
export function swatchOf(p, i = 0, fb = '#8a8378') { const c = p && p.colours && p.colours.length ? p.colours[((i % p.colours.length) + p.colours.length) % p.colours.length] : null; return (c && c.swatch) || fb; }
/** Denim / black swatches read too dark as a flat albedo under warm light — lift them a touch. */
export function albedo(hex) { _c.set(hex); const l = 0.3 * _c.r + 0.59 * _c.g + 0.11 * _c.b; if (l < 0.03) _c.lerp(_d.set('#2a2a2c'), 0.35); return '#' + _c.getHexString(); }

// ---------------------------------------------------------------------------------------------------
// product → hanging silhouette (a line of apparelRails.LINES)
// ---------------------------------------------------------------------------------------------------
const words = p => { const t = new Set(p.tags || []); for (const w of String(p.name || '').toLowerCase().split(/[\s-]+/)) t.add(w); return t; };
/** Hanging silhouette for a clothing product, or null when it is only shown folded (e.g. shorts). */
export function lineOf(p) {
  const W = words(p), has = (...a) => a.some(w => W.has(w));
  if (has('jeans', 'jean')) return 'jeans';
  if (has('shorts')) return null;
  if (has('camisole', 'cami', 'vest')) return 'camisole';
  if (has('dresses', 'dress', 'jumpsuit')) return has('slip', 'satin', 'maxi', 'silk') ? 'slip' : 'midi';
  if (has('skirts', 'skirt')) return has('mini', 'a-line', 'corduroy') ? 'mini' : 'skirt';
  if (has('trousers', 'trouser', 'chino', 'chinos', 'pants')) return 'trouser';
  if (has('coats', 'coat', 'overcoat', 'outerwear', 'trench')) return 'coat';
  if (has('quilted', 'puffer', 'padded', 'gilet')) return 'puffer';
  if (has('blazers', 'blazer', 'waistcoats', 'waistcoat', 'suits')) return 'blazer';
  if (has('cable')) return 'cable';
  if (has('knitwear', 'jumpers', 'jumper', 'cardigans', 'cardigan', 'breton', 'sweater')) return 'knit';
  return 'shirt';   // shirts, blouses, tops, shirt-jackets, anything new
}

// ---------------------------------------------------------------------------------------------------
// brand copy (all from ctx.brand)
// ---------------------------------------------------------------------------------------------------
/** The seasonal promo (the one with a headline, e.g. "The Spring Edit has landed"). */
export function springPromo(brand) {
  const ps = (brand && brand.promos) || [];
  return ps.find(p => p.headline && /edit|season|new/i.test(p.name + ' ' + p.headline)) || ps.find(p => p.headline) || ps[0] || null;
}
/** {title:'The Spring Edit', rest:'has landed', sub} from the promo headline/name. */
export function promoCopy(brand) {
  const p = springPromo(brand);
  if (!p) return { title: (brand && brand.name) || 'IMAANS', rest: '', sub: (brand && brand.slogan) || '' };
  const name = String(p.name || '').trim(), head = String(p.headline || '').trim();
  let t = name, rest = '';
  const i = name ? head.toLowerCase().indexOf(name.toLowerCase()) : -1;
  if (i >= 0) { t = head.slice(0, i + name.length).trim(); rest = head.slice(i + name.length).trim(); }
  else if (head) { t = head; }
  return { title: t || name || head, rest, sub: String(p.sub || '').trim(), name };
}
// ---------------------------------------------------------------------------------------------------
// catalogue helpers
// ---------------------------------------------------------------------------------------------------
export function firstInStockSize(p) { return (p.sizes || []).find(s => s.inStock) || null; }
export function hasStock(p) { return !!(p && p.inStock !== false && firstInStockSize(p)); }
/**
 * A product of `kind` for a 3-D item: ranked by the `prefer` words (tags / name), in stock first,
 * avoiding `used` products when an unused good match exists. Stable (no randomness).
 */
export function pickLike(catalog, kind, { prefer = [], used = null, needStock = true, filter = null } = {}) {
  let pool = catalog.all(kind);
  if (filter) { const f = pool.filter(filter); if (f.length) pool = f; }
  const W = pool.map(words);
  const score = i => { const k = prefer.findIndex(w => W[i].has(w)); return (k < 0 ? 50 : k) + (needStock && !hasStock(pool[i]) ? 100 : 0); };
  const order = pool.map((p, i) => i).sort((a, b) => score(a) - score(b) || a - b);
  const pick = order.find(i => !used || !used.has(pool[i].id));
  const p = pool[pick !== undefined ? pick : order[0]] || null;
  if (p && used) used.add(p.id);
  return p;
}

/**
 * Card for a product shown by a 3-D item. `current` = the colour index (or swatch hex) the item shows now;
 * colourways are listed from it (the card's selected swatch is the item's colour). recolor(hex, i) repaints
 * the item; `at` (Vector3) gets a colour sparkle.
 */
export function productCard(ctx, p, { current = 0, recolor, at, tag, subtitle, actions, onTap } = {}) {
  if (!p) return null;
  const n = (p.colours || []).length;
  let ci = typeof current === 'string' ? (p.colours || []).findIndex(c => (c.swatch || '').toLowerCase() === current.toLowerCase()) : current;
  if (!(ci >= 0)) ci = 0;
  const hooks = (p.colours || []).map((c, i) => ({
    apply: () => { if (recolor) recolor(c.swatch, i); if (at) ctx.fx.burst(at.clone ? at.clone() : new THREE.Vector3(...at), { color: c.swatch, count: 20 }); },
  }));
  const info = ctx.catalog.card(p, { colorways: hooks, subtitle, tag, actions, onTap });
  if (n > 1 && ci > 0) info.colorways = info.colorways.slice(ci).concat(info.colorways.slice(0, ci));
  return info;
}

// ---------------------------------------------------------------------------------------------------
// canvas type in the IMAANS style
// ---------------------------------------------------------------------------------------------------
export function fontsOf(ctx) { return (ctx && ctx.fonts) || { display: 'Georgia, "Times New Roman", serif', sans: 'system-ui, sans-serif' }; }
/** Letter-spaced text (track in px). Returns the drawn width. */
export function spaced(g, txt, cx, base, font, track, fill, align = 'center') {
  g.font = font; g.fillStyle = fill; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const ch = [...String(txt)], ws = ch.map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + track * Math.max(0, ch.length - 1);
  let x = align === 'center' ? cx - total / 2 : align === 'right' ? cx - total : cx;
  ch.forEach((c, i) => { g.fillText(c, x, base); x += ws[i] + track; });
  return total;
}
/** Largest caps font (≤ maxPx) whose spaced width fits maxW. trackEm = tracking as a fraction of the size. */
export function fitSpaced(g, txt, family, weight, maxW, maxPx, trackEm = 0.18) {
  let px = maxPx;
  for (let k = 0; k < 24; k++) {
    g.font = `${weight} ${px}px ${family}`;
    const ch = [...String(txt)]; const w = ch.reduce((a, c) => a + g.measureText(c).width, 0) + px * trackEm * Math.max(0, ch.length - 1);
    if (w <= maxW) break;
    px *= Math.max(0.6, Math.min(0.97, maxW / w));
  }
  return { font: `${weight} ${px}px ${family}`, px, track: px * trackEm };
}
export { drawCrown };
// ---------------------------------------------------------------------------------------------------
// shared materials
// ---------------------------------------------------------------------------------------------------
/**
 * Low tier: ONE fabric look for every garment / figure fabric (the library's low-tier fabrics split into
 * three programs — with / without normal map, with / without the rim term — by kind). Use with
 * mats.fabric(kind, colour, { flat: true }) and as the material's onBeforeCompile: a cheap view-dependent
 * rim so cloth never reads as matte plastic on an iPhone 8. Strength per material in userData.fabricRim.
 */
export function rimPatch(shader) {
  shader.uniforms.fabricRim = { value: this.userData.fabricRim || 0.62 };
  shader.fragmentShader = 'uniform float fabricRim;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', [
    'float fabricFres = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );',
    'outgoingLight *= 1.0 + fabricRim * fabricFres * fabricFres * fabricFres;',
    '#include <opaque_fragment>',
  ].join('\n'));
}
/** The print program: map + roughness(G)/metalness(B) mask + alphaTest, double-sided. Use on InstancedMeshes. */
export function printMaterial(map, mask, name) {
  const m = new THREE.MeshStandardMaterial({ map, roughnessMap: mask, metalnessMap: mask, roughness: 1, metalness: 1, alphaTest: 0.5, side: THREE.DoubleSide });
  m.name = name || 'imaans:print';
  return m;
}
let _white = null;
function white() {
  if (!_white) { _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); _white.colorSpace = THREE.SRGBColorSpace; _white.needsUpdate = true; }
  return _white;
}
const _led = new Map();
/** LED strip / lit edge: basic + map, opaque (architecture's glow-lens program). Tone-mapped. */
export function ledMaterial(color = '#ffd6a0', intensity = 2.4) {
  const k = color + ':' + intensity;
  if (!_led.has(k)) { const m = new THREE.MeshBasicMaterial({ map: white(), color: new THREE.Color(color).multiplyScalar(intensity) }); m.name = 'imaans:led'; _led.set(k, m); }
  return _led.get(k);
}
/** Additive light sheet (architecture's halo program). */
export function glowMaterial(map, color = '#ffc98f', k = 0.55, name = 'imaans:glow') {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  m.name = name; return m;
}

// contact shadows: 4 × 2 radial blobs with different peak opacities (no vertex colours → shared program)
const LEVELS = [0.22, 0.3, 0.36, 0.42, 0.48, 0.55, 0.62, 0.7];
let _shadowTex = null;
function shadowAtlas() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  LEVELS.forEach((a, i) => {
    const cx = (i % 4) * 128 + 64, cy = Math.floor(i / 4) * 128 + 64;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 62);
    grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(0.45, `rgba(0,0,0,${a * 0.55})`);
    grd.addColorStop(0.75, `rgba(0,0,0,${a * 0.18})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(cx - 64, cy - 64, 128, 128);
  });
  _shadowTex = new THREE.CanvasTexture(c); _shadowTex.colorSpace = THREE.NoColorSpace;
  return _shadowTex;
}
let _shadowMat = null;
export function shadowMaterial() {
  if (!_shadowMat) {
    _shadowMat = new THREE.MeshBasicMaterial({ map: shadowAtlas(), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    _shadowMat.name = 'imaans:contactShadow';
  }
  return _shadowMat;
}
/** Every contact shadow of a module in one draw call. add() = floor/shelf blob, addWall() = on a vertical panel. */
export class ShadowQuads {
  constructor() { this.q = []; }
  /** Soft blob on a horizontal surface at (x, y, z), w (x) × d (z), opacity, rotY. */
  add(x, y, z, w, d, opacity = 0.5, rotY = 0) { this.q.push({ x, y, z, w, d, o: opacity, r: rotY, v: null }); return this; }
  /** Soft blob on a vertical panel facing the horizontal normal n = [nx, 0, nz] (default +x): h tall, d wide. */
  addWall(x, y, z, h, d, opacity = 0.4, n = [1, 0, 0]) { this.q.push({ x, y, z, w: h, d, o: opacity, r: 0, v: [-n[2], n[0]] }); return this; }
  build(parent, name = 'shadows') {
    if (!this.q.length) return null;
    const n = this.q.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = new Uint32Array(n * 6);
    this.q.forEach((s, i) => {
      let li = 0, bd = 9; LEVELS.forEach((a, k) => { const d = Math.abs(a - s.o); if (d < bd) { bd = d; li = k; } });
      const u0 = ((li % 4) * 128 + 1) / 512, u1 = ((li % 4) * 128 + 127) / 512, v1 = 1 - (Math.floor(li / 4) * 128 + 1) / 256, v0 = 1 - (Math.floor(li / 4) * 128 + 127) / 256;
      const c = Math.cos(s.r), sn = Math.sin(s.r);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], k) => {
        const lx = a * s.w / 2, lz = b * s.d / 2;
        if (s.v) pos.set([s.x + lz * s.v[0], s.y + lx, s.z + lz * s.v[1]], i * 12 + k * 3);   // v = n × up (across the panel)
        else pos.set([s.x + lx * c + lz * sn, s.y, s.z - lx * sn + lz * c], i * 12 + k * 3);
        uv.set([a < 0 ? u0 : u1, b < 0 ? v0 : v1], i * 8 + k * 2);
      });
      // floor quads face +y, wall quads face n
      if (s.v) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      else idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, shadowMaterial()); mesh.renderOrder = 1; mesh.name = name;
    mesh.castShadow = false; mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }
}
