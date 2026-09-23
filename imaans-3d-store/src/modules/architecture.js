// Module: architecture — the IMAANS shell (floor, walls, ceiling, storefront, the evening street in
// Woodstock outside), ALL lighting, the environment map and the brand signage. Zones: entrance,
// storefront, staffDoor (+ the wordmark above the shoe wall and the department signs). See CONTRACT.md.
//
// Look strategy: every static surface is merged by material and carries a baked light map painted from
// the fixture plan (pools under every spot head / downlight / globe, wall scallops, cove halo, sign
// spill) + an AO map — so the store reads as lit on every tier, including 'low' where shadow maps are
// off. Real lights (≤ q.maxLights spots) add the key/specular shaping.
// Palette (IMAANS): warm-ivory limewash + oak herringbone, deep-charcoal back wall behind the shoe niches
// and a charcoal feature wall on the Accessories side, black steel, brass/gold accents.
// Shader programs: all surfaces share FIVE programs (architecture/mats.js); the environment capture
// adds one more (proxy) unless the post chain already renders the scene into a target.
import * as THREE from 'three';
import { Batch } from './architecture/util.js';
import { buildShell, buildCeiling } from './architecture/shell.js';
import { buildCeilingFixtures } from './architecture/ceiling.js';
import { buildStorefront, buildExterior } from './architecture/storefront.js';
import { buildSignage } from './architecture/signage.js';
import { buildNeonScript } from './architecture/neon.js';
import { paintLightmaps, buildRig, fallbackEnvironment, captureEnvironment, UV1 } from './architecture/lighting.js';
import { createArchMats, colorsToRamp, sceneRendersToTarget, useProxies } from './architecture/mats.js';

const EXPOSURE = { low: 1.15, mid: 1.1, high: 1.1 };
const ENV_INTENSITY = { low: 0.5, mid: 0.4, high: 0.4 };

export async function build(ctx) {
  const { THREE: T, kit, tier, q, brand } = ctx;
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
  buildCeiling(ctx, batch);
  buildCeilingFixtures(ctx, batch); lap('ceiling');
  buildStorefront(ctx, batch); lap('storefront');
  const exterior = buildExterior(ctx, batch, AM); lap('exterior');
  root.add(exterior);
  const signs = buildSignage(ctx, batch, AM); lap('signage');
  const neon = buildNeonScript(ctx, AM); lap('neon');

  const U1c = () => [0.5, 0.5]; // metals + free-hanging boards: constant uv1 (their light map is black)
  const CHARCOAL = '#2a2724', LACQUER = '#1c1b1a';
  const dark = (name, lm, roughness = 0.42) => AM.std(name, 'paint-white', { color: LACQUER, roughness, normalScale: 0.12, lm });
  const MATS = {
    floor: [AM.std('floor', 'oak-floor', { lm: LM.floor }), UV1.floor],
    marble: [AM.std('marble', 'marble', { lm: LM.floor }), UV1.floor],
    marbleDark: [AM.std('marbleDark', 'marble', { lm: LM.floor, color: '#242221', roughnessScale: 1.4 }), UV1.floor],
    stone: [AM.std('stone', 'travertine', { lm: LM.floor }), UV1.floor],
    mat: [AM.std('mat', 'rug-wool', { lm: LM.floor, color: '#4a4540' }), UV1.floor],
    walls: [AM.std('walls', 'plaster', { lm: LM.walls }), UV1.walls],
    feature: [AM.std('feature', 'plaster-green', { lm: LM.walls, color: CHARCOAL }), UV1.walls],
    back: [AM.std('back', 'plaster-green', { lm: LM.back, color: CHARCOAL }), UV1.back],
    ceiling: [AM.std('ceiling', 'paint-white', { lm: LM.ceiling, flat: true, color: '#f1eee8' }), UV1.ceiling],
    trim: [AM.std('trim', 'paint-white', { lm: LM.walls }), UV1.walls],
    dark: [dark('dark', LM.back), UV1.back],
    darkWall: [dark('darkWall', LM.walls), UV1.walls],
    darkFree: [dark('darkFree', null, 0.85), U1c],   // matte sign boards (no spot glare over the lettering)
    brass: [AM.std('brass', 'brass'), U1c],
    steel: [AM.std('steel', 'steel-black'), U1c],
    glass: [AM.gild('glass', null, { roughness: 0.02, opacity: 0.12, env: 1.4 }), null],
    glow: [AM.glowMat, null],
  };
  MATS.door = MATS.dark;
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
  if (neon) root.add(neon.mesh);
  // night glass: a faint additive reflection of the interior (the env capture cube), same geometry
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

  // ---------- hotspot, interactions (all copy from ctx.brand) ----------
  ctx.hotspots.add({ id: 'entrance', label: 'Entrance', pos: [0, ctx.layout.EYE, 8.4], look: [0, 1.45, -4], order: 0 });
  const addr = (brand.contact && brand.contact.addressLines) || [];
  const si = Math.max(0, addr.findIndex(l => /\d/.test(l) && /road|street|avenue|lane|drive|rd\b|st\b/i.test(l)));
  const street = addr[si] || '', suburb = (addr[si + 1] || '').split(',')[0].trim();
  const signInfo = {
    title: brand.name, subtitle: `${brand.line} · ${brand.slogan}`, tag: brand.legalName,
    actions: [
      { label: 'Our story', run: () => ctx.ui.showInfo('about') },
      { label: 'Make it sparkle ✦', run: () => { signs.pulse(1.6); ctx.fx.burst(new T.Vector3(0, 3.95, -10.8), { color: '#ffd58a', count: 90 }); } },
    ],
    onTap: () => signs.pulse(1.2),
  };
  // one merged gold mesh carries the wordmark, the department boards and the storefront vinyl: pick by hit
  const deptInfo = (id) => {
    const cat = (brand.departments || []).find(c => c.id === id) || {};
    const acts = [];
    if (id !== 'accessories') acts.push({ label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') });
    acts.push({ label: 'Delivery & returns', run: () => ctx.ui.showInfo('shipping-delivery') });
    return { title: cat.name || (ctx.layout.DEPARTMENTS[id] || {}).name || id, subtitle: cat.description || brand.tagline, tag: 'Department', actions: acts };
  };
  const signPick = (hit) => {
    const p = hit && hit.point; if (!p) return signInfo;
    if (p.z < -10.8 || p.z > 10.8) return signInfo;           // wordmark above the shoe wall / storefront vinyl
    if (p.z < -5) return deptInfo('shoes');
    return deptInfo(p.x < 0 ? 'clothes' : 'accessories');
  };
  if (signs.out.gold) ctx.interact.add(signs.out.gold, signPick);
  if (meshes.door) ctx.interact.add(meshes.door, { title: 'Staff only', subtitle: 'The stockroom is strictly backstage — ask us and we will fetch your size.', tag: 'Stockroom', onTap: () => ctx.ui.toast('Staff only — ask us for your size ✦') });
  const today = (() => { const d = (brand.hours && brand.hours.days) || []; const i = (new Date().getDay() + 6) % 7; return d[i]; })();
  if (meshes.glass) ctx.interact.add(meshes.glass, {
    title: [street, suburb].filter(Boolean).join(', ') || brand.legalName,
    subtitle: today ? (today.closed ? `Closed today (${today.label}). ` : `Open today ${today.open} – ${today.close}. `) + (brand.story || '') : (brand.story || ''),
    tag: 'Visit us',
    actions: [{ label: 'Hours & directions', run: () => ctx.ui.showInfo('visit') }],
  });
  if (neon) ctx.interact.add(neon.mesh, { title: brand.slogan, subtitle: brand.tagline || brand.line, tag: brand.name, onTap: () => neon.flicker(0.8) });

  ctx.onUpdate((dt) => { signs.update(dt); if (neon) neon.update(dt); });
  ctx.events.addEventListener('ready', () => { if (!ctx.shotMode) { signs.pulse(1.8); if (neon) neon.flicker(1.4); } });

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
  void q;
}
