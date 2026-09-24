// Module: architecture — the shell of the real Imaan's Shoes shop (docs/REAL-LAYOUT.md): marble floor,
// ivory wall panels, 3.0 m ceiling with the bulkhead, the storefront with its open double glass door, the
// dark fluted partition with the closed staff door, the pavement + evening street outside, ALL lighting,
// the environment map and the brand signage (the lit fascia logo, the logo panel inside). Zones:
// storefront, entrance, pavement, partition, signage, ceiling. See CONTRACT.md + docs/REBUILD-MAP.md.
//
// Look strategy: every static surface is merged by material and carries a baked light map painted from
// the fixture plan (pools under every spot head / downlight / the island light panel, wall scallops, LED
// cove bands, uplight graze) + an AO map — so the shop reads as lit on every tier, including 'low' where
// shadow maps are off. Real lights (≤ q.maxLights spots) add the key/specular shaping.
// Shader programs: all surfaces share FIVE programs (architecture/mats.js); the environment capture
// adds one more (proxy) unless the post chain already renders the scene into a target.
import * as THREE from 'three';
import { Batch } from './architecture/util.js';
import { buildShell } from './architecture/shell.js';
import { buildCeilingFixtures } from './architecture/ceiling.js';
import { buildStorefront, buildExterior, storefrontColliders } from './architecture/storefront.js';
import { buildSignage } from './architecture/signage.js';
import { paintLightmaps, buildRig, fallbackEnvironment, captureEnvironment, UV1 } from './architecture/lighting.js';
import { createArchMats, colorsToRamp, sceneRendersToTarget, useProxies } from './architecture/mats.js';

const EXPOSURE = { low: 1.15, mid: 1.1, high: 1.1 };
const ENV_INTENSITY = { low: 0.5, mid: 0.4, high: 0.4 };

export async function build(ctx) {
  const { THREE: T, kit, tier, brand, layout } = ctx;
  const root = ctx.group('architecture');
  const times = {}; let _t = performance.now(); const lap = (k) => { const n = performance.now(); times[k] = Math.round(n - _t); _t = n; };
  window.__archTimes = times;
  ctx.renderer.toneMappingExposure = EXPOSURE[tier] ?? 1.05;
  const envRT = fallbackEnvironment(ctx); lap('fallbackEnv');

  // ---------- baked light + the material set ----------
  const LM = paintLightmaps(ctx); lap('lightmaps');
  const AM = createArchMats(ctx, LM);

  // ---------- geometry ----------
  const batch = new Batch();
  buildShell(ctx, batch); lap('shell');
  buildCeilingFixtures(ctx, batch); lap('ceiling');
  buildStorefront(ctx, batch); lap('storefront');
  const exterior = buildExterior(ctx, batch, AM); lap('exterior');
  root.add(exterior);
  const signs = buildSignage(ctx, batch, AM); lap('signage');

  const U1c = () => [0.5, 0.5]; // metals + free-hanging boards: constant uv1 (their light map is black)
  const P = layout.PALETTE;
  const MATS = {
    marble: [AM.std('marble', 'marble', { lm: LM.floor }), UV1.floor],
    walls: [AM.std('walls', 'plaster', { lm: LM.walls, color: P.shopIvoryPanel, normalScale: 0.35 }), UV1.walls],
    groove: [AM.std('groove', 'paint-white', { lm: LM.walls, color: '#5d554b', flat: true, roughness: 0.9 }), UV1.walls],
    ceiling: [AM.std('ceiling', 'paint-white', { lm: LM.ceiling, flat: true, color: '#f1eee8' }), UV1.ceiling],
    flutes: [AM.std('flutes', 'paint-white', { lm: LM.back, color: P.shopFlute, flat: true, roughness: 0.55 }), UV1.back],
    door: [AM.std('door', 'paint-white', { lm: LM.back, color: '#1c1b1a', roughness: 0.4, normalScale: 0.12 }), UV1.back],
    darkFree: [AM.std('darkFree', 'paint-white', { color: '#1c1b1a', roughness: 0.85, normalScale: 0.12 }), U1c],   // matte boards: fascia, logo panel
    brass: [AM.std('brass', 'brass'), U1c],
    steel: [AM.std('steel', 'steel-black'), U1c],
    glass: [AM.gild('glass', null, { roughness: 0.02, opacity: 0.12, env: 1.4, side: T.DoubleSide }), null],
    glow: [AM.glowMat, null],
  };
  const meshes = {};
  for (const key of batch.keys()) {
    const def = MATS[key];
    if (!def) { console.warn('[architecture] no material for batch', key); continue; }
    const geo = batch.merge(key, def[1]);
    if (!geo) continue;
    if (key === 'glow') colorsToRamp(geo);
    const m = new T.Mesh(geo, def[0]);
    m.name = 'arch:' + key;
    m.receiveShadow = !['glow', 'glass'].includes(key);
    m.castShadow = false;
    if (key === 'glass') m.renderOrder = 1;
    root.add(m); meshes[key] = m;
  }
  lap('merge');
  for (const m of signs.meshes) root.add(m);
  // night glass: a faint additive reflection of the interior (the env capture cube) on the inside faces
  // (a vertical specularMap fades it out over the lower part of each pane: that is where the low-res cube
  //  would mirror the floor at grazing angles, which magnifies into stair-stepped edges up close)
  const fade = kit.canvasTexture(4, 64, (g) => { const grd = g.createLinearGradient(0, 64, 0, 0); grd.addColorStop(0, '#000'); grd.addColorStop(0.32, '#000'); grd.addColorStop(0.62, '#fff'); grd.addColorStop(1, '#fff'); g.fillStyle = grd; g.fillRect(0, 0, 4, 64); }, { srgb: false });
  const reflMat = new T.MeshBasicMaterial({ color: 0x000000, combine: T.AddOperation, reflectivity: 0.085, specularMap: fade, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
  reflMat.name = 'arch:glassReflect';
  const refl = new T.Mesh(meshes.glass.geometry, reflMat); refl.name = 'arch:glassReflect'; refl.renderOrder = 2; refl.visible = false;
  refl.raycast = () => {}; // taps go to the real glass / whatever is behind
  root.add(refl);

  // ---------- lights + environment ----------
  const rig = buildRig(ctx, root);
  kit.freeze(root);

  // ---------- colliders (walls + glass are the walk limits in layout.WALK; the open door leaves) ----------
  storefrontColliders(ctx);

  // ---------- interactions (all copy from ctx.brand) ----------
  const addr = (brand.contact && brand.contact.addressLines) || [];
  const si = Math.max(0, addr.findIndex(l => /\d/.test(l) && /road|street|avenue|lane|drive|rd\b|st\b/i.test(l)));
  const street = addr[si] || '', suburb = (addr[si + 1] || '').split(',')[0].trim();
  const logo = layout.ZONES.signage.logo;
  const signInfo = {
    title: brand.name, subtitle: `${brand.line} · ${brand.slogan}`, tag: brand.legalName,
    actions: [
      { label: 'Our story', run: () => ctx.ui.showInfo('about') },
      { label: 'Make it sparkle ✦', run: () => { signs.pulse(1.6); ctx.fx.burst(new T.Vector3(logo.cx, logo.cy, layout.ZONES.storefront.z + 0.3), { color: '#ffd58a', count: 90 }); } },
    ],
    onTap: () => signs.pulse(1.2),
  };
  if (signs.out.gold) ctx.interact.add(signs.out.gold, signInfo);   // the fascia logo + the logo panel inside
  if (meshes.door) ctx.interact.add(meshes.door, { title: 'Staff only', subtitle: 'The stockroom is strictly backstage — ask us and we will fetch your size.', tag: 'Stockroom', onTap: () => ctx.ui.toast('Staff only — ask us for your size ✦') });
  const today = (() => { const d = (brand.hours && brand.hours.days) || []; const i = (new Date().getDay() + 6) % 7; return d[i]; })();
  if (meshes.glass) ctx.interact.add(meshes.glass, {
    title: [street, suburb].filter(Boolean).join(', ') || brand.legalName,
    subtitle: today ? (today.closed ? `Closed today (${today.label}). ` : `Open today ${today.open} – ${today.close}. `) + (brand.story || '') : (brand.story || ''),
    tag: 'Visit us',
    actions: [{ label: 'Hours & directions', run: () => ctx.ui.showInfo('visit') }],
  });

  ctx.onUpdate((dt) => { signs.update(dt); });
  ctx.events.addEventListener('ready', () => { if (!ctx.shotMode) signs.pulse(1.8); });

  // ---------- capture the finished store as the environment ----------
  let rt = envRT, reflCube = null;
  const dbg = new Set((ctx.params.get('archdbg') || '').split(','));
  ctx.onReady(async () => {
    // No asset wait: modules await their own models in build() and the materials library holds the
    // onReady phase until its textures are decoded (its hook runs first). Lazy extras don't matter here.
    const _t0c = performance.now();
    // Rendering the cube compiles a render-target (linear) variant of every captured material. When the
    // post chain already renders the scene into a target those variants exist anyway → capture the whole
    // finished store. Otherwise capture only the shell, on its one-program proxy materials.
    const full = sceneRendersToTarget(ctx);
    const restore = full ? null : useProxies(root);
    const cap = captureEnvironment(ctx, rt, { intensity: ENV_INTENSITY[tier] ?? 0.85, only: full ? null : 'architecture' });
    if (restore) restore();
    times.captureFull = full;
    rt = cap.rt; times.capture = Math.round(performance.now() - _t0c);
    if (reflCube) reflCube.dispose();
    reflCube = cap.cube; reflMat.envMap = reflCube.texture; reflMat.needsUpdate = true; refl.visible = true;
    // dev-only switches for lighting balance (?archdbg=nolm,noenv,nospot,noamb)
    if (dbg.has('noenv')) ctx.scene.environmentIntensity = 0;
    if (dbg.has('nospot')) for (const L of rig.lights) L.intensity = 0;
    if (dbg.has('noamb')) rig.amb.intensity = 0;
    if (dbg.has('nolm')) for (const m of Object.values(meshes)) if (m.material.lightMap) m.material.lightMapIntensity = 0;
    const hide = new Set((ctx.params.get('archhide') || '').split(',').filter(Boolean));
    if (hide.size) root.traverse(o => { if (o.isMesh && [...hide].some(h => o.name.includes(h))) o.visible = false; });
  });
}
