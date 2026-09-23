// footwear — the shoe wall: seven arched niches in front of the charcoal back wall. Each niche: a carcass
// (black lacquer or warm oak) with a gold bead round the arch, a warm backlit panel, oak shelves with brass
// nosing + under-shelf LED lines, a stock cubby of IMAANS boxes in the plinth, and a small gold-on-black
// section plaque (Sneakers · Boots · Heels · Flats · Sandals) in the arch crown.
// Also: the branded shoe-box geometry and the merchandising plan (which catalogue shoe sits where).
import * as THREE from 'three';
import { mat4, rbox, uvBox } from './util.js';
import { rampUV } from './progs.js';
import { ruv } from './atlas.js';
import { STYLES } from './lasts.js';

export const WALL = {
  z0: -11, depth: 0.42, W: 1.38, IW: 1.1, spring: 2.72, floor: 0.5, cubby: [0.075, 0.425],
  cx: [-5.16, -3.44, -1.72, 0, 1.72, 3.44, 5.16],
  shelves: [0.93, 1.36, 1.79, 2.22, 2.65], shelfT: 0.03, shelfD: 0.34,
  plaque: { y: 3.02, w: 0.46, h: 0.092 },
};
WALL.front = WALL.z0 + WALL.depth;                    // -10.58
WALL.archTop = WALL.spring + WALL.IW / 2;             // 3.27 inner
WALL.outerTop = WALL.spring + WALL.W / 2;             // 3.41 outer (< 3.45 zone / neon clearance)
WALL.shelfBack = WALL.z0 + 0.025;                     // -10.975 (panel face)
WALL.shelfFront = WALL.shelfBack + WALL.shelfD;       // -10.635
WALL.itemZ = WALL.shelfBack + 0.17;                   // centre line for shoes

function archPath(path, halfW, y0, spring, bevel, isHole) {
  const hw = halfW + (isHole ? bevel : -bevel);
  path.moveTo(-hw, y0 + (isHole ? bevel : 0));
  path.lineTo(hw, y0 + (isHole ? bevel : 0));
  path.lineTo(hw, spring);
  path.absarc(0, spring, hw, 0, Math.PI, false);
  path.lineTo(-hw, y0 + (isHole ? bevel : 0));
  return path;
}

/** The carcass of one niche unit: outer arch-topped slab with the niche opening + the base cubby cut out. */
function carcassGeometry() {
  const { W, IW, spring, floor, cubby, depth } = WALL;
  const bv = 0.006;
  const shape = archPath(new THREE.Shape(), W / 2, 0, spring, bv, false);
  shape.holes.push(archPath(new THREE.Path(), IW / 2, floor, spring, bv, true));
  const hole2 = new THREE.Path();
  hole2.moveTo(-IW / 2 - bv, cubby[0] - bv); hole2.lineTo(IW / 2 + bv, cubby[0] - bv); hole2.lineTo(IW / 2 + bv, cubby[1] + bv); hole2.lineTo(-IW / 2 - bv, cubby[1] + bv); hole2.lineTo(-IW / 2 - bv, cubby[0] - bv);
  shape.holes.push(hole2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bv - 0.004, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 1, curveSegments: 16 });
  g.translate(0, 0, WALL.z0 + 0.004 + bv);
  // metre UVs with the grain running up the stiles (material is rotated 90°): caps (x, y), sides (depth, along)
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nz = Math.abs(n.getZ(i));
    if (nz > 0.5) uv.setXY(i, p.getX(i), p.getY(i));
    else if (Math.abs(n.getY(i)) > 0.7) uv.setXY(i, p.getZ(i), p.getX(i));   // horizontal reveals: grain along x
    else uv.setXY(i, p.getZ(i), p.getY(i));                                   // vertical reveals: grain up
  }
  return g;
}

/** Backlit panel behind the niche opening (UV 0..1 over the opening for the glow map). */
function panelGeometry() {
  const { IW, floor, spring } = WALL;
  const s = archPath(new THREE.Shape(), IW / 2, floor, spring, 0, false);
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + IW / 2) / IW, (p.getY(i) - floor) / (WALL.archTop - floor));
  g.translate(0, 0, WALL.z0 + 0.012);
  return g;
}

/** Painted light on the back panel (unlit): a pool under every shelf, a crown glow in the arch, soft reveals. */
export function panelGlowTexture(kit) {
  const Wt = 256, Ht = 640;
  const { floor, shelves, shelfT } = WALL, H = WALL.archTop - floor;
  const vOf = (y) => (1 - (y - floor) / H) * Ht; // canvas y (top = arch)
  return kit.canvasTexture(Wt, Ht, (g, w, h) => {
    // warm taupe stone base, like the campaign's plaster
    g.fillStyle = 'rgb(62,52,43)'; g.fillRect(0, 0, w, h);
    const R = kit.rng(99);
    // soft stone mottling (round, feathered — square specks read as pixels when the panel fills the screen)
    // (kept faint: up close the specks read as dust / bokeh on the glass-smooth panel)
    for (let i = 0; i < 300; i++) {
      const x = R() * w, y = R() * h, r = 4 + R() * 10, light = R() < 0.5;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, light ? 'rgba(255,246,232,0.03)' : 'rgba(0,0,0,0.04)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = 'lighter';
    // pools below each shelf (and the niche floor lit by the lowest one): hot line under the shelf, long falloff
    for (const y of [...shelves].reverse()) {
      const y0 = vOf(y - shelfT), y1 = vOf(y - shelfT - 0.4);
      const grd = g.createLinearGradient(0, y0, 0, y1);
      grd.addColorStop(0, 'rgba(255,222,176,1)'); grd.addColorStop(0.05, 'rgba(250,200,145,0.8)'); grd.addColorStop(0.24, 'rgba(230,172,118,0.42)');
      grd.addColorStop(0.6, 'rgba(200,140,92,0.14)'); grd.addColorStop(1, 'rgba(180,120,80,0)');
      g.fillStyle = grd; g.fillRect(0, y0, w, y1 - y0);
    }
    // crown glow from a hidden strip in the arch soffit
    const cx = w / 2, cy = vOf(WALL.archTop);
    const rg = g.createRadialGradient(cx, cy, 4, cx, cy, h * 0.3);
    rg.addColorStop(0, 'rgba(255,220,170,0.95)'); rg.addColorStop(0.35, 'rgba(250,190,135,0.42)'); rg.addColorStop(1, 'rgba(255,180,120,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h * 0.45);
    // side falloff towards the reveals
    g.globalCompositeOperation = 'multiply';
    const sg = g.createLinearGradient(0, 0, w, 0);
    sg.addColorStop(0, 'rgb(110,100,92)'); sg.addColorStop(0.16, 'rgb(232,228,222)'); sg.addColorStop(0.5, 'rgb(255,255,255)');
    sg.addColorStop(0.84, 'rgb(232,228,222)'); sg.addColorStop(1, 'rgb(110,100,92)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
  });
}

/** Section plaques atlas: one row per label, gold lettering + keyline on black (drawn in the brand fonts). */
export function plaqueTexture(kit, fonts, labels) {
  const W = 1024, RH = 200, H = 1024;
  const tex = kit.canvasTexture(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    labels.forEach((label, i) => {
      const y = i * RH;
      g.fillStyle = '#0d0d0e'; g.fillRect(0, y, W, RH);
      const gold = g.createLinearGradient(0, y + 30, 0, y + RH - 30);
      gold.addColorStop(0, '#f6dd8c'); gold.addColorStop(0.55, '#d9ab48'); gold.addColorStop(1, '#a97a1f');
      g.strokeStyle = gold; g.lineWidth = 4; g.strokeRect(14, y + 14, W - 28, RH - 28);
      g.lineWidth = 1.5; g.strokeRect(26, y + 26, W - 52, RH - 52);
      const text = String(label).toUpperCase();
      g.font = `500 ${Math.round(RH * 0.44)}px ${fonts.display}`; g.textBaseline = 'middle'; g.fillStyle = gold;
      const chars = [...text], sp = RH * 0.1;
      const ws = chars.map(c => g.measureText(c).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
      const scale = Math.min(1, (W * 0.66) / tw);
      g.save(); g.translate(W / 2, y + RH / 2 + 4); g.scale(scale, 1);
      let x = -tw / 2; chars.forEach((c, k) => { g.fillText(c, x, 0); x += ws[k] + sp; });
      g.restore();
      // small rules either side of the word
      const half = (tw * scale) / 2 + 36;
      g.fillStyle = gold; g.fillRect(W / 2 - half - 90, y + RH / 2, 90, 2); g.fillRect(W / 2 + half, y + RH / 2, 90, 2);
      // tiny diamonds at the rule ends
      for (const x of [W / 2 - half - 96, W / 2 + half + 96]) { g.save(); g.translate(x, y + RH / 2 + 1); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore(); }
    });
  });
  tex.anisotropy = 8;
  return { tex, rows: labels.length, rowH: RH / H };
}

/** Adds the joinery of all niches to the batch. Keys: carcass, shelf, brass, panel, glow, cubby, plaque, label. */
export function buildWall(ctx, batch, { labels = [], plaqueRow = [] } = {}) {
  const { IW, floor, spring, shelves, shelfT, shelfD, cubby } = WALL;
  const carcass = carcassGeometry(), panel = panelGeometry();
  const shelf = swapUV(rbox(IW - 0.004, shelfT, shelfD, 0.004, 1));
  const nosing = uvBox(new THREE.BoxGeometry(IW - 0.004, shelfT + 0.004, 0.007));
  const led = rampUV(new THREE.BoxGeometry(IW - 0.03, 0.006, 0.012), 2.4);
  const cubbyBack = rbox(IW, cubby[1] - cubby[0], 0.01, 0.002, 1);
  const cubbyFloor = rbox(IW, 0.012, 0.36, 0.002, 1);
  // gold bead around the arch, set into the front face
  const beadPts = [];
  const hw = IW / 2 + 0.018;
  beadPts.push(new THREE.Vector3(hw, floor, 0));
  for (let k = 0; k <= 28; k++) { const a = (k / 28) * Math.PI; beadPts.push(new THREE.Vector3(Math.cos(a) * hw, spring + Math.sin(a) * hw, 0)); }
  beadPts.push(new THREE.Vector3(-hw, floor, 0));
  const bead = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beadPts, false, 'centripetal', 0.1), 44, 0.0065, 5, false);
  // outer gold bead tracing the carcass outline (the "gold edge" of the black-lacquer unit)
  const obPts = [];
  const ow = WALL.W / 2 - 0.004;
  obPts.push(new THREE.Vector3(ow, 0.01, 0));
  for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI; obPts.push(new THREE.Vector3(Math.cos(a) * ow, spring + Math.sin(a) * ow, 0)); }
  obPts.push(new THREE.Vector3(-ow, 0.01, 0));
  const obead = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(obPts, false, 'centripetal', 0.1), 52, 0.004, 4, false);
  // hidden LED channel tracing the opening at the back of the reveal: the niche's warm halo
  const haloPts = [];
  const hr = IW / 2 - 0.012;
  haloPts.push(new THREE.Vector3(hr, floor + 0.01, 0));
  for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI; haloPts.push(new THREE.Vector3(Math.cos(a) * hr, spring + Math.sin(a) * hr, 0)); }
  haloPts.push(new THREE.Vector3(-hr, floor + 0.01, 0));
  const halo = rampUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPts, false, 'centripetal', 0.1), 40, 0.0035, 4, false), 2.2);
  // cubby LED (under the niche floor, lighting the box labels)
  const cubbyLed = rampUV(new THREE.BoxGeometry(IW - 0.04, 0.005, 0.01), 1.6);
  // section plaque: black lacquer plate + gold-on-black face (gild) inside the arch crown
  const P = WALL.plaque;
  const plate = rbox(P.w + 0.012, P.h + 0.012, 0.012, 0.003, 1);
  const fz = WALL.front;
  WALL.cx.forEach((cx, n) => {
    batch.add('glow', halo, mat4([cx, 0, WALL.z0 + 0.02]));
    batch.add('carcass', carcass, mat4([cx, 0, 0]));
    batch.add('panel', panel, mat4([cx, 0, 0]));
    batch.add('brass', bead, mat4([cx, 0, fz + 0.0035]));
    batch.add('brass', obead, mat4([cx, 0, fz + 0.0025]));
    for (const y of shelves) {
      batch.add('shelf', shelf, mat4([cx, y - shelfT / 2, WALL.shelfBack + shelfD / 2]));
      batch.add('brass', nosing, mat4([cx, y - shelfT / 2, WALL.shelfFront + 0.0035]));
      batch.add('glow', led, mat4([cx, y - shelfT - 0.004, WALL.shelfFront - 0.022]));
    }
    batch.add('brass', nosing, mat4([cx, floor - shelfT / 2 + 0.004, fz + 0.002]));
    batch.add('glow', cubbyLed, mat4([cx, cubby[1] - 0.006, fz - 0.03]));
    batch.add('cubby', cubbyBack, mat4([cx, (cubby[0] + cubby[1]) / 2, WALL.z0 + 0.03]));
    batch.add('cubby', cubbyFloor, mat4([cx, cubby[0] + 0.006, WALL.z0 + 0.035 + 0.18]));
    const row = plaqueRow[n];
    if (row !== undefined && row >= 0 && labels.length) {
      batch.add('plaque', plate, mat4([cx, P.y, WALL.z0 + 0.012 + 0.006]));
      const face = new THREE.PlaneGeometry(P.w, P.h);
      const uv = face.attributes.uv, rh = 1 / 5.12; // rows of 200 px in a 1024 px canvas
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - (row + 1 - uv.getY(i)) * rh);
      batch.add('label', face, mat4([cx, P.y, WALL.z0 + 0.012 + 0.0125]));
    }
  });
}

function swapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, uv.getY(i), u); }
  return g;
}

// ------------------------------------------------------------------------------------------------
// IMAANS shoe box (lying flat: length x 0.33, height y 0.128, width z 0.2): matte black board, the lid
// top printed with the gold crown + wordmark, a gold foil line round the lid skirt, the end label on ±x.
// Attributes for the shoe program: position, normal, uv (metres), uv1 (brand atlas), color, aTint (0).
// ------------------------------------------------------------------------------------------------
function boxBuilder() {
  const P = [], N = [], U = [], U1 = [], C = [], K = [], I = [];
  /** face: centre c, right axis r (unit), up axis u (unit), half sizes hr, hu, atlas region, colour. */
  const face = (c, r, u, hr, hu, region, col = 1) => {
    const n = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
    const b = P.length / 3;
    for (const [sr, su] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [c[0] + r[0] * sr * hr + u[0] * su * hu, c[1] + r[1] * sr * hr + u[1] * su * hu, c[2] + r[2] * sr * hr + u[2] * su * hu];
      P.push(...p); N.push(...n); U.push(sr * hr, su * hu);
      const q = ruv(region, (sr + 1) / 2, (1 - su) / 2); U1.push(q[0], q[1]);
      C.push(col, col, col); K.push(0);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  /** Axis-aligned box: centre, half sizes, per-face regions {top, bottom, px, nx, pz, nz}. */
  const box = (c, [hx, hy, hz], R, col = 1, skip = {}) => {
    if (!skip.top) face([c[0], c[1] + hy, c[2]], [1, 0, 0], [0, 0, -1], hx, hz, R.top, col);
    if (!skip.bottom) face([c[0], c[1] - hy, c[2]], [1, 0, 0], [0, 0, 1], hx, hz, R.bottom || 'side', col * 0.8);
    face([c[0] + hx, c[1], c[2]], [0, 0, -1], [0, 1, 0], hz, hy, R.px, col);
    face([c[0] - hx, c[1], c[2]], [0, 0, 1], [0, 1, 0], hz, hy, R.nx, col);
    face([c[0], c[1], c[2] + hz], [1, 0, 0], [0, 1, 0], hx, hy, R.pz, col);
    face([c[0], c[1], c[2] - hz], [-1, 0, 0], [0, 1, 0], hx, hy, R.nz, col);
  };
  const build = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(U1, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(K, 1));
    g.setIndex(I);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  };
  return { face, box, build, P, N, U, U1, C, K, I };
}

export function shoeBoxGeometry() {
  const B = boxBuilder();
  B.box([0, 0.047, 0], [0.162, 0.047, 0.097], { top: 'side', px: 'end', nx: 'end', pz: 'side', nz: 'side' }, 0.93, { top: true });
  B.box([0, 0.111, 0], [0.166, 0.017, 0.101], { top: 'lid', px: 'rim', nx: 'rim', pz: 'rim', nz: 'rim' }, 1, { bottom: true });
  return B.build();
}

/** Open box (base only) standing on its upturned lid, lined with an ivory IMAANS tissue sheet. */
export function openBoxGeometry(rng) {
  const B = boxBuilder();
  const L = 0.324, H = 0.094, D = 0.194, t = 0.004;
  const lidY = 0.034;
  // lid (upside down under the box): its skirt shows
  B.box([0, 0.017, 0], [0.166, 0.017, 0.101], { top: 'side', px: 'rim', nx: 'rim', pz: 'rim', nz: 'rim' }, 1, { bottom: true });
  // base: floor + four thin walls (outer + inner faces)
  B.box([0.012, lidY + t / 2, -0.006], [L / 2, t / 2, D / 2], { top: 'side', px: 'side', nx: 'side', pz: 'side', nz: 'side' }, 0.8);
  for (const sx of [-1, 1]) B.box([0.012 + sx * (L - t) / 2, lidY + H / 2, -0.006], [t / 2, H / 2, D / 2], { top: 'side', px: sx > 0 ? 'end' : 'side', nx: sx < 0 ? 'end' : 'side', pz: 'side', nz: 'side' }, 0.9);
  for (const sz of [-1, 1]) B.box([0.012, lidY + H / 2, -0.006 + sz * (D - t) / 2], [L / 2 - t, H / 2, t / 2], { top: 'side', px: 'side', nx: 'side', pz: 'side', nz: 'side' }, 0.9);
  // tissue: a crumpled sheet lining the box, climbing the long walls, crossing the rims (clear of the board
  // so no black edge pokes through) and drooping outside. Rows are placed at the fold lines.
  const nx = 18, W = 0.5, Smax = 0.21;
  const inner = D / 2 - 0.012, floorY = lidY + t + 0.012, top = lidY + H + 0.009, climb = top - floorY, cross = 0.02;
  const sRows = new Set();
  for (let k = 0; k <= 16; k++) sRows.add(+((k / 16 - 0.5) * 2 * Smax).toFixed(4));
  for (const sg of [-1, 1]) for (const b of [inner, inner + climb * 0.5, inner + climb, inner + climb + cross * 0.5, inner + climb + cross]) if (b < Smax) sRows.add(+(sg * b).toFixed(4));
  const rows = [...sRows].sort((a, b) => a - b), nz = rows.length - 1;
  const pos = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = (i / nx - 0.5) * W * 0.62, zz = rows[j], az = Math.abs(zz), sg = Math.sign(zz) || 1;
    let y = floorY, z = zz, jit = 1;
    if (az > inner) {
      const over = az - inner; jit = 0.35;
      if (over < climb) { y = floorY + over; z = sg * inner; }
      else if (over < climb + cross) { y = top; z = sg * (inner + (over - climb)); jit = 0.15; }
      else { const o2 = over - climb - cross; y = top - o2 * 0.8; z = sg * (inner + cross + o2 * 0.45); }
    }
    y += ((rng() - 0.5) * 0.008 + Math.sin(i * 1.7 + j * 0.9) * 0.003) * jit;
    pos.push(x + 0.012, y, z - 0.006);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const sheet = new THREE.BufferGeometry(); sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sheet.setIndex(idx); sheet.computeVertexNormals();
  const addSheet = (g, flip, col) => {
    const p = g.attributes.position, n = g.attributes.normal, base = B.P.length / 3;
    for (let i = 0; i < p.count; i++) {
      B.P.push(p.getX(i), p.getY(i) - (flip ? 0.0012 : 0), p.getZ(i));
      B.N.push(n.getX(i) * (flip ? -1 : 1), n.getY(i) * (flip ? -1 : 1), n.getZ(i) * (flip ? -1 : 1));
      B.U.push(p.getX(i), p.getZ(i));
      const q = ruv('tissue', (i % (nx + 1)) / nx, Math.floor(i / (nx + 1)) / nz); B.U1.push(q[0], q[1]);
      B.C.push(col, col, col); B.K.push(0);
    }
    const ia = g.index.array;
    for (let k = 0; k < ia.length; k += 3) { if (flip) B.I.push(base + ia[k], base + ia[k + 2], base + ia[k + 1]); else B.I.push(base + ia[k], base + ia[k + 1], base + ia[k + 2]); }
  };
  addSheet(sheet, false, 1); addSheet(sheet, true, 0.9);
  return B.build();
}

// ------------------------------------------------------------------------------------------------
// Merchandising plan — the catalogue decides what sits where
// ------------------------------------------------------------------------------------------------
// per level (floor, 4 shelves, arch): 'F' floor (boxes + single), 'S3' three singles, 'PS' pair + single,
// 'S2' two singles toe-out, 'P' one pair, 'S1' one single
// Eye-level shelves (1.36 / 1.79 m) carry three shoes — a full, merchandised wall, still ~0.1 m air between.
const LAYOUTS = [
  ['F', 'PS', 'S3', 'PS', 'S2', 'S1'],
  ['F', 'S3', 'PS', 'S3', 'P', 'S1'],
  ['F', 'S2', 'S3', 'PS', 'PS', 'S1'],
];

/**
 * niches: [{section, products}] (see catalog.js wallSections). styleOf(product) → style key ('sneaker' = GLB).
 * Returns { shoes: [{product, ci, style, pos, yaw, mirror, niche, level, pairId?}], boxes: [{pos, yaw}] }.
 * Real spacing on 1.1 m shelves; singles angled 18–28° toe-out; density < 1 thins some shelves.
 */
export function wallMerch(rng, density, niches, styleOf) {
  const shoes = [], boxes = [];
  const levelsY = [WALL.floor, ...WALL.shelves];
  let pairId = 0;
  const SIZE = { F: 1, S3: 3, PS: 3, S2: 2, P: 2, S1: 1 };
  const DOWN = { S3: 'S2', PS: 'P', S2: 'S1' };
  const kinds = WALL.cx.map((_, n) => LAYOUTS[n % LAYOUTS.length].slice());
  const target = Math.round(91 - (1 - Math.min(1, density)) * 60);
  let total = kinds.flat().reduce((a, k) => a + SIZE[k], 0);
  const order = [];
  for (let lv = 4; lv >= 1; lv--) for (let n = 0; n < 7; n++) order.push([(n * 3 + lv) % 7, lv]);
  // product draws per slot kind (a pair shows one product; the arch spot 'S1' always shows the lead one) —
  // thinning never takes a niche below one slot per product, so every shoe stays on the wall at every tier
  const DRAWS = { F: 1, S3: 3, PS: 2, S2: 2, P: 1, S1: 0 };
  const draws = (n) => kinds[n].reduce((a, k) => a + (DRAWS[k] || 0), 0);
  const need = (n) => (niches[n] && niches[n].products ? niches[n].products.length : 0);
  for (let pass = 0; pass < 2 && total > target; pass++) {
    for (const [n, lv] of order) {
      if (total <= target) break;
      const k = kinds[n][lv], d = DOWN[k];
      if (!d || (pass === 0 && k === 'S2')) continue;   // first pass thins the triples, then the doubles
      if (draws(n) - DRAWS[k] + DRAWS[d] < need(n)) continue;
      kinds[n][lv] = d; total -= SIZE[k] - SIZE[d];
    }
  }
  WALL.cx.forEach((cx, n) => {
    const plan = niches[n]; if (!plan) return;
    const prods = plan.products;
    const seen = new Map();                     // product id → appearances (→ colour index)
    let qi = 0;
    const isTall = p => { const st = styleOf(p); return st !== 'sneaker' && !!(STYLES[st] && STYLES[st].tall); };
    /** next product for a slot; tallOk = the slot has the height for a tall boot. */
    const next = (tallOk) => {
      if (tallOk) { const t = prods.find(p => isTall(p) && !seen.has(p.id)); if (t) return t; }
      const u = prods.find(p => !seen.has(p.id) && (tallOk || !isTall(p))); if (u) return u;   // each product once before repeats
      for (let k = 0; k < prods.length; k++) { const p = prods[(qi + k) % prods.length]; if (tallOk || !isTall(p)) { qi = (qi + k + 1) % prods.length; return p; } }
      return prods[0];
    };
    const colourOf = (p) => { const c = seen.get(p.id) || 0; seen.set(p.id, c + 1); return c; };
    // toes point towards the centre aisle (the centre niche alternates per level)
    const aisle = cx < -0.5 ? 1 : cx > 0.5 ? -1 : 0;
    levelsY.forEach((y, lv) => {
      const kind = kinds[n][lv];
      const dir = aisle || ((lv % 2) ? 1 : -1);
      const z = WALL.itemZ + rng.range(-0.01, 0.01);
      const angle = () => (18 + rng() * 10) * Math.PI / 180;
      const tallOk = lv === 0;
      const single = (x, d, p = next(tallOk)) => {
        const a = angle();
        const yaw = Math.atan2(-Math.sin(a), d * Math.cos(a));
        // viewer sees the outside of the foot: toes → +x ⇒ right foot (mirrored model)
        shoes.push({ product: p, ci: colourOf(p), style: styleOf(p), pos: [x, y, z + rng.range(-0.012, 0.012)], yaw, mirror: d > 0, niche: n, level: lv });
      };
      const pair = (x, d) => {
        const p = next(false), ci = colourOf(p);
        const a = angle();
        const yaw = Math.atan2(-Math.sin(a), d * Math.cos(a));
        const tx = d * Math.cos(a), tz = Math.sin(a);
        const px = -d * Math.sin(a), pz = Math.cos(a);        // perpendicular towards the viewer
        const off = 0.058, stag = 0.04, id = pairId++;
        const st = styleOf(p);
        shoes.push({ product: p, ci, style: st, pos: [x + px * off, y, z + pz * off], yaw, mirror: d > 0, niche: n, level: lv, pairId: id });
        shoes.push({ product: p, ci, style: st, pos: [x - px * off + tx * stag, y, z - pz * off + tz * stag], yaw: yaw + d * 0.05, mirror: d < 0, niche: n, level: lv, pairId: id });
      };
      const j = () => rng.range(-0.012, 0.012);
      switch (kind) {
        case 'F': {
          const bs = n % 2 ? 1 : -1;                           // box stack side alternates
          single(cx - bs * 0.22 + j(), -bs);
          boxes.push({ pos: [cx + bs * 0.28, y, WALL.itemZ - 0.02], yaw: rng.range(-0.05, 0.05) });
          boxes.push({ pos: [cx + bs * 0.28 + rng.range(-0.008, 0.008), y + 0.128, WALL.itemZ - 0.02], yaw: rng.range(-0.1, 0.1) });
          if (rng() < 0.5) boxes.push({ pos: [cx + bs * 0.28 + rng.range(-0.01, 0.01), y + 0.256, WALL.itemZ - 0.02], yaw: rng.range(-0.12, 0.12) });
          break;
        }
        case 'S3': for (const k of [-1, 0, 1]) single(cx + k * 0.365 + j(), dir); break;
        case 'PS': pair(cx - dir * 0.2 + j(), dir); single(cx + dir * 0.33 + j(), dir); break;
        case 'P': pair(cx + j(), dir); break;
        case 'S2': single(cx - 0.27 + j(), -1); single(cx + 0.27 + j(), 1); break;
        default: single(cx + j(), dir, prods[0]); break;      // the arch spot: the section's lead product
      }
    });
  });
  // stock cubbies: two rows of boxes end-on, five across
  WALL.cx.forEach((cx) => {
    for (let row = 0; row < 2; row++) for (let c = 0; c < 5; c++) {
      const x = cx - 0.42 + c * 0.21 + rng.range(-0.004, 0.004);
      boxes.push({ pos: [x, WALL.cubby[0] + 0.012 + row * 0.13, WALL.z0 + 0.19 + rng.range(-0.012, 0.018)], yaw: -Math.PI / 2 + rng.range(-0.015, 0.015) });
    }
  });
  return { shoes, boxes };
}
