#!/usr/bin/env node
// Footwear asset pipeline (owner: footwear).
//   node tools/footwear-lod.mjs
// Reads the original Shopify sneaker (../raw/MaterialsVariantsShoe.glb, read-only) and writes
//   assets/models/shoe-lod.glb — decimated wall LODs of the 'shoe' model + a colourway atlas:
//     mesh 'lod1'  ≈ 1.6k tris (near: < ~4.5 m), mesh 'lod2' ≈ 0.7k tris (far views)
//     material 'shoe-atlas' whose baseColor is a 1024² atlas of 4 generic colourways (2×2 tiles of 512 px,
//     each tile = 480 px of the original map + 16 px edge-extended padding so mips don't bleed):
//       solid · onBlack · onWhite · tonal — recoloured from 'midnight' region by region; ALPHA carries the
//       tint mask (0.5 + 0.5·mask) so the runtime paints any catalogue colour onto the right panels.
// Geometry is baked into the same space as ctx.assets.flatten('shoe') (node transforms applied), so the
// runtime can pair it with the full model's normal / ORM maps (identical UV layout).
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('../raw/MaterialsVariantsShoe.glb');
const OUT = path.resolve('assets/models/shoe-lod.glb');
const TILE = 512, PAD = 16, INNER = TILE - 2 * PAD;
const TARGETS = { lod1: 1600, lod2: 700 };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const src = await io.read(RAW);
const root = src.getRoot();

// ---------------------------------------------------------------- geometry (world space)
const node = root.listNodes().find(n => n.getMesh());
const M = node.getWorldMatrix();
const prim = node.getMesh().listPrimitives()[0];
const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
const idx0 = prim.getIndices();
const vc = P.getCount();
const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
const e = [0, 0, 0], f = [0, 0];
for (let i = 0; i < vc; i++) {
  P.getElement(i, e);
  pos[i * 3] = M[0] * e[0] + M[4] * e[1] + M[8] * e[2] + M[12];
  pos[i * 3 + 1] = M[1] * e[0] + M[5] * e[1] + M[9] * e[2] + M[13];
  pos[i * 3 + 2] = M[2] * e[0] + M[6] * e[1] + M[10] * e[2] + M[14];
  N.getElement(i, e);
  let nx = M[0] * e[0] + M[4] * e[1] + M[8] * e[2], ny = M[1] * e[0] + M[5] * e[1] + M[9] * e[2], nz = M[2] * e[0] + M[6] * e[1] + M[10] * e[2];
  const l = Math.hypot(nx, ny, nz) || 1; nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
  T.getElement(i, f); uv[i * 2] = f[0]; uv[i * 2 + 1] = f[1];
}
let umin = 9, umax = -9, vmin = 9, vmax = -9;
for (let i = 0; i < vc; i++) { umin = Math.min(umin, uv[i * 2]); umax = Math.max(umax, uv[i * 2]); vmin = Math.min(vmin, uv[i * 2 + 1]); vmax = Math.max(vmax, uv[i * 2 + 1]); }
console.log('source', vc, 'verts', idx0.getCount() / 3, 'tris; uv range', umin.toFixed(3), umax.toFixed(3), vmin.toFixed(3), vmax.toFixed(3));

// weld identical (pos, uv, normal) vertices so the simplifier sees connected topology
const key = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]].map(v => Math.round(v * 1e5)).join(',') + '|' + Math.round(uv[i * 2] * 1e4) + ',' + Math.round(uv[i * 2 + 1] * 1e4)
  + '|' + [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]].map(v => Math.round(v * 50)).join(',');
const remap = new Uint32Array(vc); const seen = new Map(); const keep = [];
for (let i = 0; i < vc; i++) { const k = key(i); let j = seen.get(k); if (j === undefined) { j = keep.length; seen.set(k, j); keep.push(i); } remap[i] = j; }
const wc = keep.length;
const wpos = new Float32Array(wc * 3), wnor = new Float32Array(wc * 3), wuv = new Float32Array(wc * 2);
keep.forEach((i, j) => { wpos.set(pos.subarray(i * 3, i * 3 + 3), j * 3); wnor.set(nor.subarray(i * 3, i * 3 + 3), j * 3); wuv.set(uv.subarray(i * 2, i * 2 + 2), j * 2); });
const srcIdx = idx0.getArray();
const widx = new Uint32Array(srcIdx.length); for (let i = 0; i < srcIdx.length; i++) widx[i] = remap[srcIdx[i]];
console.log('welded', wc, 'verts');

// attributes for the simplifier: normal (xyz) + uv (xy)
const attr = new Float32Array(wc * 5);
for (let i = 0; i < wc; i++) { attr.set(wnor.subarray(i * 3, i * 3 + 3), i * 5); attr[i * 5 + 3] = wuv[i * 2]; attr[i * 5 + 4] = wuv[i * 2 + 1]; }
const lods = {};
for (const [name, tris] of Object.entries(TARGETS)) {
  const [ind, err] = MeshoptSimplifier.simplifyWithAttributes(widx, wpos, 3, attr, 5, [0.35, 0.35, 0.35, 2.0, 2.0], null, tris * 3, 0.05, []);
  // compact
  const map = new Map(); const out = new Uint32Array(ind.length);
  const vp = [], vn = [], vt = [];
  for (let i = 0; i < ind.length; i++) {
    const v = ind[i]; let j = map.get(v);
    if (j === undefined) { j = map.size; map.set(v, j); vp.push(wpos[v * 3], wpos[v * 3 + 1], wpos[v * 3 + 2]); vn.push(wnor[v * 3], wnor[v * 3 + 1], wnor[v * 3 + 2]); vt.push(wuv[v * 2], wuv[v * 2 + 1]); }
    out[i] = j;
  }
  lods[name] = { idx: out, pos: new Float32Array(vp), nor: new Float32Array(vn), uv: new Float32Array(vt) };
  console.log(name, ind.length / 3, 'tris', map.size, 'verts', 'error', err.toFixed(4));
}

// ---------------------------------------------------------------- atlas
function srcImage(name) {
  const t = root.listTextures().find(t => t.getName().toLowerCase().includes(name));
  return Buffer.from(t.getImage());
}
async function rawRGB(buf) {
  const { data, info } = await sharp(buf).resize(INNER, INNER, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}
/**
 * Recolour the 'midnight' map by region: a = blue accent panels, k = black knit panels, w = whites (sole, trims).
 * Each region keeps its own shading/detail relative to its mean, so the knit and mesh survive.
 */
function recolor({ data, w, h }, { a, k, wm = [1, 0.975, 0.935], ma = 1, mk = 0 }) {
  // RGBA out: alpha = 0.5 + 0.5·mask, where mask = how much of the runtime product colour a texel takes
  // (the sneaker material multiplies by mix(1, colour, mask)). Never alpha 0, so lossy webp keeps the RGB.
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3] / 255, g = data[i * 3 + 1] / 255, b = data[i * 3 + 2] / 255;
    const [hue, s, v] = rgb2hsv(r, g, b);
    const blue = s > 0.28 && hue > 170 && hue < 250 ? Math.min(1, (s - 0.28) / 0.2) : 0;
    const dark = v < 0.42 ? Math.min(1, (0.42 - v) / 0.12) * (1 - blue) : 0;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const base = [r * wm[0], g * wm[1], b * wm[2]];
    let c = base;
    if (blue > 0 && a) {
      const kk = Math.pow(Math.max(0.05, v / 0.64), 0.9);
      c = a.map((x, j) => x * kk * blue + base[j] * (1 - blue));
    } else if (dark > 0 && k) {
      const kk = Math.pow(Math.max(0.05, lum / 0.15), 0.6);
      c = k.map((x, j) => x * kk * dark + base[j] * (1 - dark));
    }
    const mask = blue * ma + dark * mk;
    for (let j = 0; j < 3; j++) out[i * 4 + j] = Math.max(0, Math.min(255, Math.round(c[j] * 255)));
    out[i * 4 + 3] = Math.round(255 * (0.5 + 0.5 * Math.min(1, mask)));
  }
  return { data: out, w, h, ch: 4 };
}
const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
async function tile({ data, w, h, ch = 3 }) {
  return sharp(data, { raw: { width: w, height: h, channels: ch } })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).png().toBuffer();
}
const mid = await rawRGB(srcImage('midnight'));
// Generic, product-tintable colourways (order must match TILES in src/modules/footwear/sneakers.js):
//   0 solid  — whole upper takes the product colour (accent white, knit a shade lighter grey), white sole
//   1 onBlack — accent panels take the colour, black knit ("Red/black")
//   2 onWhite — accent panels take the colour, white knit ("Navy/white")
//   3 tonal  — whole upper takes the colour, knit a darker shade (depth for mid / dark colours)
const tiles = [
  recolor(mid, { a: hex('#f6f4f0'), k: hex('#cfccc6'), ma: 1, mk: 1 }),
  recolor(mid, { a: hex('#f6f4f0'), k: hex('#232325'), ma: 1, mk: 0 }),
  recolor(mid, { a: hex('#f6f4f0'), k: hex('#e9e6e0'), ma: 1, mk: 0 }),
  recolor(mid, { a: hex('#f6f4f0'), k: hex('#8d8a85'), ma: 1, mk: 1 }),
];
const COLS = 2, ROWS = 2;
const comps = [];
for (let k = 0; k < tiles.length; k++) comps.push({ input: await tile(tiles[k]), left: (k % COLS) * TILE, top: Math.floor(k / COLS) * TILE });
const atlasPng = await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 0.5 } } }).composite(comps).png().toBuffer();
const atlas = await sharp(atlasPng).webp({ quality: 88, alphaQuality: 100 }).toBuffer();
fs.mkdirSync('shots/footwear', { recursive: true });
await sharp(atlasPng).resize(768).toFile('shots/footwear/atlas-preview.png');

// ---------------------------------------------------------------- write GLB
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('shoe-lod');
const tex = doc.createTexture('shoe-atlas').setImage(atlas).setMimeType('image/webp');
const mat = doc.createMaterial('shoe-atlas').setBaseColorTexture(tex).setRoughnessFactor(0.8).setMetallicFactor(0);
doc.createExtension(ALL_EXTENSIONS.find(E => E.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true);
for (const [name, L] of Object.entries(lods)) {
  const p = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(L.pos).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(L.nor).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(L.uv).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(L.pos.length / 3 < 65535 ? new Uint16Array(L.idx) : L.idx).setBuffer(buffer))
    .setMaterial(mat);
  const mesh = doc.createMesh(name).addPrimitive(p);
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
await io.write(OUT, doc);
console.log('wrote', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024).toFixed(0), 'KB; atlas', (atlas.length / 1024).toFixed(0), 'KB');
