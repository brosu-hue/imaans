// Lighting: baked light/AO maps (painted from the fixture plan), the real light rig, and the
// environment map (RoomEnvironment fallback → PMREM capture of the finished store in onReady).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { H, X0, X1, Z0, Z1, BULK, DOOR, TRACK_Y, HEADS, DOWNLIGHTS, PENDANTS, RIG, WASHES, LIGHT_PANEL, UPLIGHT, COVES } from './plan.js';
import { blob, dither } from './util.js';

const WARM = [255, 224, 192], WARM2 = [255, 234, 212];
const BEAM = Math.tan(15 * Math.PI / 180);
const W_ = X1 - X0, D_ = Z1 - Z0;   // 4.9 × 6.6 m

// ---- uv1 mappings (must match the painters below) ----
export const UV1 = {
  floor: (x, y, z) => [(x - X0) / W_, (z - Z0) / D_],
  ceiling: (x, y, z) => [(x - X0) / W_, (z - Z0) / D_],
  walls: (x, y, z) => [x < 0 ? 0.5 * (z - Z0) / D_ : 0.5 + 0.5 * (Z1 - z) / D_, y / H],
  back: (x, y) => [(x - X0) / W_, y / H],                     // the fluted partition
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.channel = 1; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

/** Where a spot head's beam lands: the first room surface hit past its target. */
function beamHit(head) {
  const [x, z, tx, ty, tz] = head;
  const P = new THREE.Vector3(x, TRACK_Y - 0.14, z), d = new THREE.Vector3(tx, ty, tz).sub(P).normalize();
  const cands = [];
  if (d.y < 0) cands.push(['floor', -P.y / d.y]);
  if (d.x < 0) cands.push(['left', (X0 - P.x) / d.x]);
  if (d.x > 0) cands.push(['right', (X1 - P.x) / d.x]);
  if (d.z < 0) cands.push(['back', (Z0 - P.z) / d.z]);
  if (d.z > 0) cands.push(['front', (Z1 - P.z) / d.z]);
  cands.sort((a, b) => a[1] - b[1]);
  const [surf, t] = cands[0];
  return { surf, t, p: P.clone().addScaledVector(d, t), d, P };
}

/** Paint all light + AO maps. Returns {floor, walls, back, ceiling} each {light, ao} + intensity. */
export function paintLightmaps(ctx) {
  const low = ctx.tier === 'low';
  const out = {};
  const hits = HEADS.map(h => ({ h, ...beamHit(h) }));
  const LP = LIGHT_PANEL, lpx = (LP.x0 + LP.x1) / 2, lpz = (LP.z0 + LP.z1) / 2;

  // ---------------- floor (marble) ----------------
  {
    const W = 256, Hh = 352, c = canvas(W, Hh), g = c.getContext('2d');
    const px = (x, z) => [(x - X0) / W_ * W, (1 - (z - Z0) / D_) * Hh], sx = W / W_, sz = Hh / D_;
    g.fillStyle = 'rgb(34,29,25)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    { const [cx, cy] = px(0, 1.0); blob(g, cx, cy, 3.2 * sx, 4.4 * sz, [44, 38, 32], 1, 0, [[0, 1], [0.6, 0.7], [1, 0]]); }   // bounce
    // the light panel over the island: a broad soft pool
    { const [cx, cy] = px(lpx, lpz); blob(g, cx, cy, 1.5 * sx, 1.9 * sz, WARM2, 0.55, 0, [[0, 1], [0.5, 0.7], [0.85, 0.25], [1, 0]]); }
    for (const k of hits) {
      if (k.surf !== 'floor') continue;
      const D = k.t, r = D * BEAM, cosI = Math.abs(k.d.y), s = k.h[5];
      const [cx, cy] = px(k.p.x, k.p.z);
      blob(g, cx, cy, r * sx / Math.max(0.45, cosI), r * sz, WARM, 0.6 * s * Math.min(1, 6 / (D * D)), Math.atan2(-k.d.z * sz, k.d.x * sx));
    }
    // spill from wall-aimed spots lands along the wall base
    for (const k of hits) {
      if (k.surf === 'floor' || k.surf === 'front') continue;
      const q = k.p.clone();
      if (k.surf === 'left') q.x = X0 + 0.4; if (k.surf === 'right') q.x = X1 - 0.4; if (k.surf === 'back') q.z = Z0 + 0.35;
      const [cx, cy] = px(q.x, q.z); blob(g, cx, cy, 0.7 * sx, 0.7 * sz, WARM, 0.26 * k.h[5]);
    }
    for (const [x, z, y] of DOWNLIGHTS) { const r = 0.45 * y; const [cx, cy] = px(x, z); blob(g, cx, cy, r * sx, r * sz, WARM2, 0.3); }
    for (const [x, , z] of PENDANTS) { const [cx, cy] = px(x - 0.25, z); blob(g, cx, cy, 0.7 * sx, 0.7 * sz, WARM, 0.2); }
    for (const [surf, x, z, rx, rz, st] of WASHES) { if (surf !== 'floor') continue; const [cx, cy] = px(x, z); blob(g, cx, cy, rx * sx, rz * sz, WARM, 0.55 * st); }
    // LED coves wash the floor edge a little; the uplight strip glows along the partition
    { const [x0, y0] = px(UPLIGHT.x0, UPLIGHT.z), [x1] = px(UPLIGHT.x1, UPLIGHT.z); const grd = g.createLinearGradient(0, y0 - 0.5 * sz, 0, y0 + 0.2 * sz);
      grd.addColorStop(0, 'rgba(255,214,168,0)'); grd.addColorStop(0.7, 'rgba(255,214,168,0.35)'); grd.addColorStop(1, 'rgba(255,214,168,0.15)'); g.fillStyle = grd; g.fillRect(x0, y0 - 0.5 * sz, x1 - x0, 0.7 * sz); }
    // cool dusk light through the storefront
    { const grd = g.createLinearGradient(0, px(0, Z1)[1], 0, px(0, Z1 - 1.4)[1]); grd.addColorStop(0, 'rgba(60,78,118,0.55)'); grd.addColorStop(1, 'rgba(60,78,118,0)'); g.fillStyle = grd; g.fillRect(0, px(0, Z1)[1], W, px(0, Z1 - 1.4)[1] - px(0, Z1)[1]); }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 11);
    const a = canvas(128, 176), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 128, 176);
    edgeAO(ga, 128, 176, { left: 0.25 / W_, right: 0.25 / W_, top: 0.06 / D_, bottom: 0.25 / D_ }, 0.5);
    out.floor = { light: tex(c), ao: tex(a, false) };
  }

  // ---------------- side walls (atlas: left | right) ----------------
  {
    const W = 512, Hh = 128, c = canvas(W, Hh), g = c.getContext('2d');
    const half = W / 2, sy = Hh / H, szm = half / D_;
    const px = (side, z, y) => [side === 'left' ? (z - Z0) / D_ * half : half + (Z1 - z) / D_ * half, (1 - y / H) * Hh];
    g.fillStyle = 'rgb(60,50,41)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    const vg = g.createLinearGradient(0, 0, 0, Hh); vg.addColorStop(0, 'rgba(40,32,26,0.2)'); vg.addColorStop(0.55, 'rgba(60,48,38,0.9)'); vg.addColorStop(1, 'rgba(50,40,32,0.6)');
    g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
    // LED cove at the ceiling line: a bright warm band fading down the wall (up to the bulkhead)
    for (const side of ['left', 'right']) {
      const [xa] = px(side, Z0, 0), [xb] = px(side, BULK.z0, 0);
      const grd = g.createLinearGradient(0, 0, 0, 0.9 * sy);
      grd.addColorStop(0, 'rgba(255,214,164,0.95)'); grd.addColorStop(0.25, 'rgba(255,206,156,0.5)'); grd.addColorStop(1, 'rgba(255,200,150,0)');
      g.fillStyle = grd; g.fillRect(Math.min(xa, xb), 0, Math.abs(xb - xa), 0.9 * sy);
    }
    for (const k of hits) {
      if (k.surf !== 'left' && k.surf !== 'right') continue;
      const D = k.t, r = D * BEAM, s = k.h[5];
      const [cx, cy] = px(k.surf, k.p.z, k.p.y);
      blob(g, cx, cy, r * 0.95 * szm, r * 1.9 * sy, WARM, 0.7 * s);
      blob(g, cx, cy - 0.25 * sy, r * 0.45 * szm, r * 0.9 * sy, WARM2, 0.4 * s);
    }
    for (const [surf, u, y, rx, ry, st] of WASHES) {
      if (surf !== 'left' && surf !== 'right') continue;
      const [cx, cy] = px(surf, u, y); blob(g, cx, cy, rx * szm, ry * sy, WARM, 0.75 * st); blob(g, cx, cy - 0.1 * sy, rx * 0.5 * szm, ry * 0.5 * sy, WARM2, 0.4 * st);
    }
    // pendants over the counter warm the right wall behind them
    for (const [, y, z] of PENDANTS) { const [cx, cy] = px('right', z, y); blob(g, cx, cy, 0.6 * szm, 0.8 * sy, WARM, 0.35); }
    // the storefront end gets a cool tint
    for (const side of ['left', 'right']) {
      const [x0] = px(side, Z1, 0), [x1] = px(side, Z1 - 1.2, 0);
      const grd = g.createLinearGradient(x0, 0, x1, 0); grd.addColorStop(0, 'rgba(60,80,120,0.5)'); grd.addColorStop(1, 'rgba(60,80,120,0)');
      g.fillStyle = grd; g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), Hh);
    }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 12);
    const a = canvas(256, 64), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 256, 64);
    wallAO(ga, 0, 128, 64, D_); wallAO(ga, 128, 128, 64, D_);
    // the bulkhead shades the wall top over the first 1.5 m
    for (const side of ['left', 'right']) { const [xa] = px(side, BULK.z0, 0), [xb] = px(side, Z1, 0); ga.fillStyle = 'rgba(0,0,0,0.35)'; ga.fillRect(Math.min(xa, xb) / 2, 0, Math.abs(xb - xa) / 2, (1 - BULK.y / H) * 64); }
    out.walls = { light: tex(c), ao: tex(a, false) };
  }

  // ---------------- partition (dark flutes) ----------------
  {
    const W = 256, Hh = 128, c = canvas(W, Hh), g = c.getContext('2d');
    const sx = W / W_, sy = Hh / H, px = (x, y) => [(x - X0) / W_ * W, (1 - y / H) * Hh];
    g.fillStyle = 'rgb(56,47,39)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    // cove at the top, floor uplight grazing up from the bottom
    { const grd = g.createLinearGradient(0, 0, 0, 0.8 * sy); grd.addColorStop(0, 'rgba(255,214,164,0.9)'); grd.addColorStop(0.3, 'rgba(255,206,156,0.4)'); grd.addColorStop(1, 'rgba(255,200,150,0)'); g.fillStyle = grd; g.fillRect(0, 0, W, 0.8 * sy); }
    { const [x0] = px(UPLIGHT.x0, 0), [x1] = px(UPLIGHT.x1, 0); const grd = g.createLinearGradient(0, Hh, 0, Hh - 1.5 * sy);
      grd.addColorStop(0, 'rgba(255,214,168,0.95)'); grd.addColorStop(0.3, 'rgba(255,206,160,0.45)'); grd.addColorStop(1, 'rgba(255,200,150,0)');
      g.fillStyle = grd; g.fillRect(x0 - 0.2 * sx, Hh - 1.5 * sy, x1 - x0 + 0.4 * sx, 1.5 * sy); }
    for (const k of hits) {
      if (k.surf !== 'back') continue;
      const D = k.t, r = D * BEAM, s = k.h[5];
      const [cx, cy] = px(k.p.x, k.p.y);
      blob(g, cx, cy, r * 1.1 * sx, r * 1.7 * sy, WARM, 0.7 * s);
    }
    { const [cx, cy] = px(0.2, 1.3); blob(g, cx, cy, 2.2 * sx, 1.3 * sy, WARM, 0.3); }                      // the 'back' rig spot
    { const [cx, cy] = px(DOOR.cx, DOOR.h + 0.2); blob(g, cx, cy, 0.3 * sx, 0.2 * sy, [80, 255, 140], 0.3); }   // exit sign glow
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 13);
    const a = canvas(128, 64), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 128, 64);
    wallAO(ga, 0, 128, 64, W_);
    out.back = { light: tex(c), ao: tex(a, false) };
  }

  // ---------------- ceiling (+ bulkhead underside) ----------------
  {
    const W = 256, Hh = 352, c = canvas(W, Hh), g = c.getContext('2d');
    const px = (x, z) => [(x - X0) / W_ * W, (1 - (z - Z0) / D_) * Hh], sx = W / W_, sz = Hh / D_;
    g.fillStyle = 'rgb(46,42,39)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    { const [cx, cy] = px(0, 1.0); blob(g, cx, cy, 3 * sx, 4.2 * sz, [40, 35, 30], 1, 0, [[0, 1], [0.6, 0.7], [1, 0]]); }
    // LED cove slots: halo spilling onto the ceiling along the walls + the partition
    for (const [x0, z0, x1, z1] of COVES) {
      const alongZ = Math.abs(z1 - z0) > Math.abs(x1 - x0);
      const [ax, ay] = px(Math.min(x0, x1), Math.max(z0, z1)), [bx, by] = px(Math.max(x0, x1), Math.min(z0, z1));
      const R = 0.45;
      if (alongZ) { const inward = x0 < 0 ? 1 : -1; const grd = g.createLinearGradient(ax, 0, ax + inward * R * sx, 0);
        grd.addColorStop(0, 'rgba(255,212,166,0.8)'); grd.addColorStop(1, 'rgba(255,212,166,0)'); g.fillStyle = grd; g.fillRect(Math.min(ax, ax + inward * R * sx), ay, R * sx, by - ay); }
      else { const grd = g.createLinearGradient(0, ay, 0, ay - R * sz); grd.addColorStop(0, 'rgba(255,212,166,0.8)'); grd.addColorStop(1, 'rgba(255,212,166,0)'); g.fillStyle = grd; g.fillRect(ax, ay - R * sz, bx - ax, R * sz); }
    }
    // the island light panel glows around its frame
    { const [cx, cy] = px(lpx, lpz); blob(g, cx, cy, 1.0 * sx, 1.2 * sz, WARM2, 0.55); }
    for (const [x, , z, r, cy0] of PENDANTS) { if (cy0 < H) continue; const [cx, cy] = px(x, z); blob(g, cx, cy, 0.6 * sx, 0.6 * sz, WARM2, 0.45 * (r / 0.1)); }
    for (const h of HEADS) { const [cx, cy] = px(h[0], h[1]); blob(g, cx, cy, 0.2 * sx, 0.2 * sz, WARM, 0.07); }
    for (const [x, z] of DOWNLIGHTS) { const [cx, cy] = px(x, z); blob(g, cx, cy, 0.2 * sx, 0.2 * sz, WARM2, 0.18); }
    // bulkhead underside (z 2.9 … 4.4): the pendants hang from it; a cool edge from the storefront
    for (const [x, , z, r, cy0] of PENDANTS) { if (cy0 >= H) continue; const [cx, cy] = px(x, z); blob(g, cx, cy, 0.5 * sx, 0.5 * sz, WARM2, 0.5 * (r / 0.1)); }
    { const grd = g.createLinearGradient(0, px(0, Z1)[1], 0, px(0, Z1 - 0.8)[1]); grd.addColorStop(0, 'rgba(55,70,110,0.35)'); grd.addColorStop(1, 'rgba(55,70,110,0)'); g.fillStyle = grd; g.fillRect(0, px(0, Z1)[1], W, px(0, Z1 - 0.8)[1] - px(0, Z1)[1]); }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 14);
    const a = canvas(128, 176), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 128, 176);
    edgeAO(ga, 128, 176, { left: 0.2 / W_, right: 0.2 / W_, top: 0.15 / D_, bottom: 0.2 / D_ }, 0.35);
    out.ceiling = { light: tex(c), ao: tex(a, false) };
  }
  out.intensity = low ? 5.2 : 4.2;
  return out;
}

function edgeAO(g, W, Hh, f, k) {
  const edge = (x0, y0, x1, y1) => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(0,0,0,${k})`); grd.addColorStop(0.35, `rgba(0,0,0,${k * 0.45})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
  };
  // left (x = X0) is canvas x=0; right x=W; the partition (z = Z0) is the canvas bottom; the storefront the top.
  edge(0, 0, f.left * W, 0); g.fillRect(0, 0, f.left * W, Hh);
  edge(W, 0, W - f.right * W, 0); g.fillRect(W - f.right * W, 0, f.right * W, Hh);
  edge(0, Hh, 0, Hh - f.bottom * Hh); g.fillRect(0, Hh - f.bottom * Hh, W, f.bottom * Hh);
  edge(0, 0, 0, f.top * Hh); g.fillRect(0, 0, W, f.top * Hh);
}
function wallAO(g, x0, W, Hh, lenM) {
  const lin = (ax, ay, bx, by, k, rx, ry, rw, rh) => {
    const grd = g.createLinearGradient(ax, ay, bx, by);
    grd.addColorStop(0, `rgba(0,0,0,${k})`); grd.addColorStop(0.4, `rgba(0,0,0,${k * 0.4})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(rx, ry, rw, rh);
  };
  const fb = 0.25 / H * Hh, ft = 0.18 / H * Hh, fc = 0.25 / lenM * W;
  lin(0, Hh, 0, Hh - fb, 0.5, x0, Hh - fb, W, fb);      // floor junction
  lin(0, 0, 0, ft, 0.3, x0, 0, W, ft);                  // ceiling junction
  lin(x0, 0, x0 + fc, 0, 0.4, x0, 0, fc, Hh);           // corners
  lin(x0 + W, 0, x0 + W - fc, 0, 0.4, x0 + W - fc, 0, fc, Hh);
}

/** The real light rig — the only lights in the scene. */
export function buildRig(ctx, root) {
  const { q, layout } = ctx;
  const rig = RIG.slice(0, q.maxLights);
  const lights = [];
  // shadow casters by rank, within q.maxShadowLights
  const shadowNames = new Set(rig.filter(r => r[7] > 0).sort((a, b) => a[7] - b[7]).slice(0, q.shadows ? q.maxShadowLights : 0).map(r => r[0]));
  for (const [name, pos, tgt, angle, pen, cd, col] of rig) {
    const L = new THREE.SpotLight(col, cd, 0, angle, pen, 2);
    L.name = 'spot:' + name;
    L.position.fromArray(pos);
    const t = typeof tgt === 'string' ? layout.LIGHT_TARGETS[tgt] : tgt;
    L.target.position.fromArray(t);
    root.add(L, L.target);
    if (shadowNames.has(name)) {
      L.castShadow = true;
      L.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      const dist = new THREE.Vector3().fromArray(pos).distanceTo(new THREE.Vector3().fromArray(t));
      L.shadow.camera.near = Math.max(0.5, dist - 3.2); L.shadow.camera.far = dist + 3.4;
      L.shadow.bias = -0.0004; L.shadow.normalBias = 0.025; L.shadow.radius = 3;
      L.shadow.focus = 0.95;
    }
    lights.push(L);
  }
  // Warm ambient fill (not counted against maxLights); the PMREM environment does most of the fill.
  const amb = new THREE.AmbientLight('#ffe9d2', ctx.tier === 'low' ? 0.2 : 0.1);
  amb.name = 'ambient'; root.add(amb);
  return { lights, amb };
}

/**
 * Fallback environment until the store capture is ready. Rendered through a cube of the SAME size as
 * the final capture so every material's program (envMapCubeUVHeight is a define) survives the swap.
 */
export function fallbackEnvironment(ctx) {
  const size = ctx.q.envSize;
  const room = new RoomEnvironment();
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.1, 100, cubeRT);
  cam.update(ctx.renderer, room);
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  const rt = pmrem.fromCubemap(cubeRT.texture);
  pmrem.dispose(); cubeRT.dispose();
  room.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  ctx.scene.environment = rt.texture;
  ctx.scene.environmentIntensity = 0.3;
  return rt;
}

/** Capture the finished store into a PMREM environment (hides 'magic' + 'ui'). */
export function captureEnvironment(ctx, prevRT, { intensity = 1.0, only = null } = {}) {
  const { renderer, scene, q } = ctx;
  const hidden = [];
  // never capture the particles / ui; with `only`, capture just that module group (see architecture.js)
  for (const g of scene.children) {
    if (!g.isGroup || !g.visible) continue;
    if (g.name === 'magic' || g.name === 'ui' || (only && g.name !== only)) { g.visible = false; hidden.push(g); }
  }
  const size = q.envSize;
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.05, 60, cubeRT);
  cam.position.fromArray(ctx.layout.ROOM.envProbe);   // the middle of the shop floor
  scene.add(cam);
  const auto = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  const tm = renderer.toneMapping;
  cam.update(renderer, scene);
  renderer.toneMapping = tm;
  renderer.shadowMap.autoUpdate = auto;
  scene.remove(cam);
  for (const g of hidden) g.visible = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromCubemap(cubeRT.texture);
  pmrem.dispose();
  scene.environment = rt.texture;
  scene.environmentIntensity = intensity;
  if (prevRT) prevRT.dispose();
  return { rt, cube: cubeRT };
}
