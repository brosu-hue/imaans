// Lighting: baked light/AO maps (painted from the fixture plan), the real light rig, and the
// environment map (RoomEnvironment fallback → PMREM capture of the finished store in onReady).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { H, COVE, TRACK_Y, HEADS, DOWNLIGHTS, GLOBES, RIG, WASHES } from './plan.js';
import { blob, dither } from './util.js';

const WARM = [255, 224, 192], WARM2 = [255, 234, 212], COOL = [120, 150, 210];
const BEAM = Math.tan(15 * Math.PI / 180);

// ---- uv1 mappings (must match the painters below) ----
export const UV1 = {
  floor: (x, y, z) => [(x + 8) / 16, (z + 11) / 22],
  ceiling: (x, y, z) => [(x + 8) / 16, (z + 11) / 22],
  walls: (x, y, z) => [x < 0 ? 0.5 * (z + 11) / 22 : 0.5 + 0.5 * (11 - z) / 22, y / H],
  back: (x, y) => [(x + 8) / 16, y / H],
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
  if (d.x < 0) cands.push(['left', (-8 - P.x) / d.x]);
  if (d.x > 0) cands.push(['right', (8 - P.x) / d.x]);
  if (d.z < 0) cands.push(['back', (-11 - P.z) / d.z]);
  if (d.z > 0) cands.push(['front', (11 - P.z) / d.z]);
  cands.sort((a, b) => a[1] - b[1]);
  const [surf, t] = cands[0];
  return { surf, t, p: P.clone().addScaledVector(d, t), d, P };
}

/** Paint all light + AO maps. Returns {floor, walls, back, ceiling} each {light, ao}. */
export function paintLightmaps(ctx) {
  const low = ctx.tier === 'low';
  const out = {};
  const hits = HEADS.map(h => ({ h, ...beamHit(h) }));

  // ---------------- floor ----------------
  {
    const W = 256, Hh = 352, c = canvas(W, Hh), g = c.getContext('2d');
    const px = (x, z) => [(x + 8) / 16 * W, (1 - (z + 11) / 22) * Hh], sx = W / 16, sz = Hh / 22;
    g.fillStyle = 'rgb(38,32,27)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    // broad room glow (bounce), stronger mid-store
    { const [cx, cy] = px(0, 0); blob(g, cx, cy, 9 * sx, 12 * sz, [48, 42, 36], 1, 0, [[0, 1], [0.6, 0.7], [1, 0]]); }
    // cove ring above the plinth → warm pool around the inlay
    { const [cx, cy] = px(COVE.x, COVE.z); blob(g, cx, cy, 3.4 * sx, 3.4 * sz, WARM, 0.4, 0, [[0, 1], [0.5, 0.75], [0.8, 0.3], [1, 0]]); }
    for (const k of hits) {
      if (k.surf !== 'floor') continue;
      const D = k.t, r = D * BEAM, cosI = Math.abs(k.d.y), s = k.h[5];
      const [cx, cy] = px(k.p.x, k.p.z);
      const rot = Math.atan2(-k.d.z * sz, k.d.x * sx);
      blob(g, cx, cy, r * sx / Math.max(0.45, cosI), r * sz, WARM, 0.62 * s * Math.min(1, 16 / (D * D)), rot);
    }
    // spill from wall-aimed spots lands near the wall base too
    for (const k of hits) {
      if (k.surf === 'floor' || k.surf === 'front') continue;
      const q = k.p.clone(); q.y = 0;
      if (k.surf === 'left') q.x = -7.6; if (k.surf === 'right') q.x = 7.6; if (k.surf === 'back') q.z = -10.6;
      const [cx, cy] = px(q.x, q.z); blob(g, cx, cy, 0.9 * sx, 0.9 * sz, WARM, 0.22 * k.h[5]);
    }
    for (const [x, z] of DOWNLIGHTS) { const [cx, cy] = px(x, z); blob(g, cx, cy, 1.2 * sx, 1.2 * sz, WARM2, 0.5); }
    for (const [x, y, z, r] of GLOBES) { const [cx, cy] = px(x, z); blob(g, cx, cy, 1.5 * sx, 1.5 * sz, WARM, 0.2 * (r / 0.18)); }
    for (const [surf, x, z, rx, rz, st] of WASHES) { if (surf !== 'floor') continue; const [cx, cy] = px(x, z); blob(g, cx, cy, rx * sx, rz * sz, WARM, 0.55 * st); }
    // cool dusk light through the storefront
    { const grd = g.createLinearGradient(0, px(0, 11)[1], 0, px(0, 8.5)[1]); grd.addColorStop(0, 'rgba(60,78,118,0.7)'); grd.addColorStop(1, 'rgba(60,78,118,0)'); g.fillStyle = grd; g.fillRect(0, px(0, 11)[1], W, px(0, 8.5)[1] - px(0, 11)[1]); }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 11);
    const light = tex(c);
    // AO: darken along walls
    const a = canvas(128, 176), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 128, 176);
    edgeAO(ga, 128, 176, { left: 0.3 / 16, right: 0.3 / 16, top: 0.3 / 22, bottom: 0.08 / 22 }, 0.5);
    out.floor = { light, ao: tex(a, false) };
  }

  // ---------------- side walls (atlas: left | right) ----------------
  {
    const W = 1024, Hh = 128, c = canvas(W, Hh), g = c.getContext('2d');
    const half = W / 2, sy = Hh / H, szm = half / 22;
    const px = (side, z, y) => [side === 'left' ? (z + 11) / 22 * half : half + (11 - z) / 22 * half, (1 - y / H) * Hh];
    g.fillStyle = 'rgb(58,48,39)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    // vertical gradient: brighter mid-height (bounce off the floor + spots)
    const vg = g.createLinearGradient(0, 0, 0, Hh); vg.addColorStop(0, 'rgba(40,32,26,0.2)'); vg.addColorStop(0.55, 'rgba(60,48,38,0.9)'); vg.addColorStop(1, 'rgba(50,40,32,0.6)');
    g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
    for (const k of hits) {
      if (k.surf !== 'left' && k.surf !== 'right') continue;
      const D = k.t, r = D * BEAM, s = k.h[5];
      const [cx, cy] = px(k.surf, k.p.z, k.p.y);
      // scallop: tall soft ellipse with a brighter core, hot spot slightly above the aim point
      blob(g, cx, cy, r * 0.95 * szm, r * 1.9 * sy, WARM, 0.75 * s);
      blob(g, cx, cy - 0.25 * sy, r * 0.45 * szm, r * 0.9 * sy, WARM2, 0.45 * s);
    }
    for (const [surf, u, y, rx, ry, st] of WASHES) {
      if (surf !== 'left' && surf !== 'right') continue;
      const [cx, cy] = px(surf, u, y); blob(g, cx, cy, rx * szm, ry * sy, WARM, 0.75 * st); blob(g, cx, cy - 0.3 * sy, rx * 0.5 * szm, ry * 0.5 * sy, WARM2, 0.4 * st);
    }
    // warm-white neon script in the frieze above the fitting rooms (right wall)
    { const [cx, cy] = px('right', -4.065, 3.94); blob(g, cx, cy, 1.15 * szm, 0.5 * sy, [255, 232, 200], 0.5); blob(g, cx, cy, 0.75 * szm, 0.28 * sy, [255, 240, 220], 0.35); }
    // globes/cove don't reach the side walls; storefront end gets a cool tint
    for (const side of ['left', 'right']) {
      const [x0] = px(side, 11, 0), [x1] = px(side, 9, 0);
      const grd = g.createLinearGradient(x0, 0, x1, 0); grd.addColorStop(0, 'rgba(60,80,120,0.55)'); grd.addColorStop(1, 'rgba(60,80,120,0)');
      g.fillStyle = grd; g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), Hh);
    }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 12);
    const a = canvas(512, 64), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 512, 64);
    // AO: base + ceiling line + corners
    wallAO(ga, 0, 256, 64, 22); wallAO(ga, 256, 256, 64, 22);
    out.walls = { light: tex(c), ao: tex(a, false) };
  }

  // ---------------- back wall (charcoal) ----------------
  {
    const W = 512, Hh = 160, c = canvas(W, Hh), g = c.getContext('2d');
    const sx = W / 16, sy = Hh / H, px = (x, y) => [(x + 8) / 16 * W, (1 - y / H) * Hh];
    g.fillStyle = 'rgb(52,44,36)'; g.fillRect(0, 0, W, Hh);
    g.globalCompositeOperation = 'lighter';
    for (const k of hits) {
      if (k.surf !== 'back') continue;
      const D = k.t, r = D * BEAM, s = k.h[5];
      const [cx, cy] = px(k.p.x, k.p.y);
      blob(g, cx, cy, r * 1.1 * sx, r * 1.7 * sy, WARM, 0.7 * s);
    }
    for (const [surf, u, y, rx, ry, st] of WASHES) { if (surf !== 'back') continue; const [cx, cy] = px(u, y); blob(g, cx, cy, rx * sx, ry * sy, WARM, 0.8 * st); blob(g, cx, cy - 0.35 * sy, rx * 0.5 * sx, ry * 0.5 * sy, WARM2, 0.5 * st); }
    // the real wide shoe-wall wash
    { const [cx, cy] = px(0, 1.8); blob(g, cx, cy, 7.5 * sx, 2.2 * sy, WARM, 0.35); }
    // halo-lit IMAANS wordmark: the LED wash spills warm gold over the charcoal around the letters
    { const [cx, cy] = px(0, 3.96); blob(g, cx, cy, 2.1 * sx, 0.8 * sy, [255, 186, 104], 0.42); blob(g, cx, cy, 1.25 * sx, 0.42 * sy, [255, 204, 130], 0.34); }
    // backlit shoe niches leak a little warm light onto the wall around their arches
    for (let i = -3; i <= 3; i++) { const [cx, cy] = px(i * 1.72, 1.95); blob(g, cx, cy, 0.95 * sx, 1.75 * sy, [255, 206, 150], 0.2); }
    // exit sign glow above the staff door
    { const [cx, cy] = px(-7.05, 2.42); blob(g, cx, cy, 0.5 * sx, 0.3 * sy, [80, 255, 140], 0.35); }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 13);
    const a = canvas(256, 80), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 256, 80);
    wallAO(ga, 0, 256, 80, 16);
    out.back = { light: tex(c), ao: tex(a, false) };
  }

  // ---------------- ceiling ----------------
  {
    const W = 256, Hh = 352, c = canvas(W, Hh), g = c.getContext('2d');
    const px = (x, z) => [(x + 8) / 16 * W, (1 - (z + 11) / 22) * Hh], sx = W / 16, sz = Hh / 22;
    g.fillStyle = 'rgb(45,41,38)'; g.fillRect(0, 0, W, Hh);   // a cleaner warm white, not taupe
    g.globalCompositeOperation = 'lighter';
    { const [cx, cy] = px(0, 0); blob(g, cx, cy, 9 * sx, 12 * sz, [42, 37, 32], 1, 0, [[0, 1], [0.6, 0.7], [1, 0]]); }
    // halo spilling out of the cove (ring of light just outside the LED line)
    {
      const [cx, cy] = px(COVE.x, COVE.z);
      g.save(); g.translate(cx, cy); g.scale(sx, sz);
      const grd = g.createRadialGradient(0, 0, COVE.rLip, 0, 0, COVE.rLed[1] + 1.1);
      grd.addColorStop(0, 'rgba(255,214,170,1)'); grd.addColorStop(0.12, 'rgba(255,208,160,0.85)'); grd.addColorStop(0.45, 'rgba(255,200,150,0.3)'); grd.addColorStop(1, 'rgba(255,200,150,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, COVE.rLed[1] + 1.1, 0, Math.PI * 2); g.fill(); g.restore();
    }
    for (const [x, y, z, r] of GLOBES) { const [cx, cy] = px(x, z); blob(g, cx, cy, 0.75 * sx, 0.75 * sz, WARM2, 0.55 * (r / 0.18)); }
    for (const h of HEADS) { const [cx, cy] = px(h[0], h[1]); blob(g, cx, cy, 0.22 * sx, 0.22 * sz, WARM, 0.07); }
    for (const [x, z] of DOWNLIGHTS) { const [cx, cy] = px(x, z); blob(g, cx, cy, 0.22 * sx, 0.22 * sz, WARM2, 0.2); }
    { const grd = g.createLinearGradient(0, px(0, 11)[1], 0, px(0, 9)[1]); grd.addColorStop(0, 'rgba(55,70,110,0.38)'); grd.addColorStop(1, 'rgba(55,70,110,0)'); g.fillStyle = grd; g.fillRect(0, px(0, 11)[1], W, px(0, 9)[1] - px(0, 11)[1]); }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, Hh, 2, 14);
    const a = canvas(128, 176), ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, 128, 176);
    edgeAO(ga, 128, 176, { left: 0.35 / 16, right: 0.35 / 16, top: 0.35 / 22, bottom: 0.2 / 22 }, 0.45);
    out.ceiling = { light: tex(c), ao: tex(a, false) };
  }
  out.intensity = low ? 5.2 : 4.2;
  return out;
}

function edgeAO(g, W, Hh, f, k) {
  const edge = (x0, y0, x1, y1, len) => {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(0,0,0,${k})`); grd.addColorStop(0.35, `rgba(0,0,0,${k * 0.45})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; return len;
  };
  // left (x=-8) is canvas x=0; right x=W; back (z=-11) is canvas bottom (v=0 → y=H); front top.
  edge(0, 0, f.left * W, 0); g.fillRect(0, 0, f.left * W, Hh);
  edge(W, 0, W - f.right * W, 0); g.fillRect(W - f.right * W, 0, f.right * W, Hh);
  edge(0, Hh, 0, Hh - f.top * Hh); g.fillRect(0, Hh - f.top * Hh, W, f.top * Hh);
  edge(0, 0, 0, f.bottom * Hh); g.fillRect(0, 0, W, f.bottom * Hh);
}
function wallAO(g, x0, W, Hh, lenM) {
  const lin = (ax, ay, bx, by, k, rx, ry, rw, rh) => {
    const grd = g.createLinearGradient(ax, ay, bx, by);
    grd.addColorStop(0, `rgba(0,0,0,${k})`); grd.addColorStop(0.4, `rgba(0,0,0,${k * 0.4})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(rx, ry, rw, rh);
  };
  const fb = 0.28 / H * Hh, ft = 0.22 / H * Hh, fc = 0.3 / lenM * W;
  lin(0, Hh, 0, Hh - fb, 0.5, x0, Hh - fb, W, fb);      // floor junction
  lin(0, 0, 0, ft, 0.35, x0, 0, W, ft);                 // ceiling junction
  lin(x0, 0, x0 + fc, 0, 0.4, x0, 0, fc, Hh);           // corners
  lin(x0 + W, 0, x0 + W - fc, 0, 0.4, x0 + W - fc, 0, fc, Hh);
}

/** Clone a library material and give it the baked light + AO maps (never mutates the shared one). */
export function lightmapped(ctx, name, maps, intensity, opts, { flat = null } = {}) {
  const base = ctx.mats.get(name, opts);
  const m = base.clone();
  if (flat) { m.map = null; m.roughnessMap = null; m.color = new THREE.Color(flat); m.roughness = 0.85; } // smooth paint
  if (Object.prototype.hasOwnProperty.call(base, 'onBeforeCompile')) m.onBeforeCompile = base.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(base, 'customProgramCacheKey')) m.customProgramCacheKey = base.customProgramCacheKey;
  m.lightMap = maps.light; m.lightMapIntensity = intensity;
  if (!base.aoMap) { m.aoMap = maps.ao; m.aoMapIntensity = 1; }
  m.name = name + '+baked';
  return m;
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
  cam.position.set(0, 1.8, 0);
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
