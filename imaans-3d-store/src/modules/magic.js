// Module: magic — IMAANS gold dust, the glass-island vortex, bokeh, crowns & butterflies, the fascia-logo
// shimmer, tap bursts, and the post-processing chain (HDR bloom). Owns ctx.fx + ctx.render.
//
// Budget: ONE particle shader program (magic/shader.js) shared by every draw, + three post programs
// (magic/post.js: EffectComposer → RenderPass [HalfFloat, MSAA 4] → GlowPass, a lean dual-filter HDR
// bloom that also does the ACES + sRGB output; UnrealBloomPass + OutputPass would compile 9) → 4 programs
// on bloom tiers, 1 on 'low' (direct render, sprites self-glow). Draw calls: dust, vortex (helix + glitter around the glass island), bokeh, shimmer, critters,
// bursts (only while alive) → ≤ 6. All motion on the GPU (time uniform); the only buffer upload is the
// few slots a tap burst writes. Everything lives in ctx.group('magic') (hidden by the env capture).
//
// ctx.fx (same object, methods replaced):
//   burst(point: Vector3, {color, count})   pooled ring + rising sparkles
//   sparkle(object, {color, count})         short shimmer over the object's bounds
//   setMagic(level 0..1) / getMagic()       global intensity (the ui slider); 0 hides the ambient systems
// Dev: ?magic=0..1 initial level · ?bloom=0 direct render · ?magicdbg=bloom|thr post debug views.
import * as THREE from 'three';
import { createUniforms, createMaterial } from './magic/shader.js';
import { collectBeams, buildDust, buildVortex, buildBokeh, buildShimmer, buildCritters, GLITTER_R } from './magic/systems.js';
import { createBursts } from './magic/burst.js';
import { createPost } from './magic/post.js';

const BLOOM = {
  // linear-radiance threshold, soft knee, strength (per tier)
  high: { threshold: 2.2, knee: 0.8, strength: 0.55 },
  mid: { threshold: 2.2, knee: 0.8, strength: 0.55 },
};
const DEFAULT_LEVEL = 0.75;
// Particle density. The counts were first tuned for an invented 16 × 22 × 4.6 m shop (REF: 5000 dust motes and 52
// bokeh in 1619 m³, a 1600-mote helix on a vortex ≈ 1.92 m round × 3.95 m tall, 240 glitter flakes falling
// through an annulus 1.05 … 2.2 m round, 420 glints on a 6.8 m wide wordmark). The real shop is 4.9 × 6.6 × 3.0 m
// (97 m³): every system is sized to its own volume / surface / width at DENSITY × that old density (at q.particles),
// so the dust reads as a gentle shimmer over the products instead of a snowfall 10× too thick.
const REF = { vol: 16 * 22 * 4.6, dust: 5000, bokeh: 52, helixArea: 2 * Math.PI * 1.92 * 3.95, helix: 1600,
  glitterVol: Math.PI * (2.2 * 2.2 - 1.05 * 1.05) * 3.95, glitter: 240, signW: 6.8, glints: 420 };
const DENSITY = 1.5;
const perDensity = (n, ratio) => n * Math.min(1, DENSITY * ratio);

export async function build(ctx) {
  const { renderer, q, tier, kit } = ctx;
  const root = ctx.group('magic');
  const r = kit.rng(0x1a4a5);
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const scale = q.particles * (reduce ? 0.5 : 1);

  // ---------------- shared uniforms + the one program ----------------
  const U = createUniforms(THREE);
  const Z = ctx.layout.ZONES;
  // the vortex rises around the glass island into the light panel above it
  const GI = Z.glassIsland;
  U.uVortex.value.set(GI.cx, GI.cz, GI.h + 0.1, ctx.layout.ROOM.height - 0.1);
  U.uVortexR.value.set(Math.hypot(GI.w, GI.d) / 2 + 0.12, Math.hypot(GI.w, GI.d) / 2 + 0.35);
  const LG = Z.signage.logo;
  U.uSweep.value.set(LG.cx - LG.w / 2, LG.cx + LG.w / 2, 14, 0.4);
  U.uCalm.value = reduce ? 1 : 0;
  const lvl = parseFloat(ctx.params.get('magic'));
  U.uMagic.value = isFinite(lvl) ? THREE.MathUtils.clamp(lvl, 0, 1) : DEFAULT_LEVEL;
  const matPts = () => createMaterial(THREE, U);
  const add = (obj, name, sphere) => {
    obj.name = 'magic:' + name;
    obj.raycast = () => {};              // never steal a tap from the products
    if (sphere) { obj.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(...sphere[0]), sphere[1]); obj.frustumCulled = true; }
    else obj.frustumCulled = false;
    obj.matrixAutoUpdate = false;
    root.add(obj);
    return obj;
  };

  // ---------------- (1) ambient gold dust ----------------
  let plan = null;
  try { plan = await import('./architecture/plan.js'); } catch (e) { plan = null; }
  const beams = collectBeams(ctx, plan);
  const RM = ctx.layout.ROOM;
  const roomVol = (RM.maxX - RM.minX) * (RM.maxZ - RM.minZ) * RM.height;
  const nDust = Math.round(perDensity(REF.dust, roomVol / REF.vol) * scale);
  const dust = add(new THREE.Points(buildDust(ctx, nDust, beams, r).geometry(), matPts()), 'dust');

  // ---------------- (2) helix + glitter around the glass island ----------------
  const vR = U.uVortexR.value, vH = U.uVortex.value.w - U.uVortex.value.z;
  const nHelix = Math.round(perDensity(REF.helix, 2 * Math.PI * (vR.x + vR.y) / 2 * vH / REF.helixArea) * scale);
  const nGlitter = Math.round(perDensity(REF.glitter, Math.PI * (GLITTER_R[1] ** 2 - GLITTER_R[0] ** 2) * vH / REF.glitterVol) * scale);
  const vortex = add(new THREE.Points(buildVortex(ctx, nHelix, nGlitter, r).geometry(), matPts()), 'vortex',
    [[GI.cx, 1.9, GI.cz], 2.0]);

  // ---------------- (3) bokeh ----------------
  const nBokeh = Math.max(4, Math.round(perDensity(REF.bokeh, roomVol / REF.vol) * scale));
  const bokeh = add(new THREE.Points(buildBokeh(ctx, nBokeh, r).geometry(), matPts()), 'bokeh');

  // ---------------- (5) wordmark / shoe-niche shimmer ----------------
  const nShim = Math.round(perDensity(REF.glints, LG.w / REF.signW) * Math.max(0.5, scale));
  const shimmer = add(new THREE.Points(buildShimmer(ctx, nShim, r).geometry(), matPts()), 'shimmer', [[LG.cx, LG.cy, Z.storefront.z + 0.23], 1.4]);

  // ---------------- (4) crowns + butterflies (instanced halves) ----------------
  const critters = add(new THREE.Mesh(buildCritters(ctx, r), createMaterial(THREE, U, { mesh: true })), 'critters');

  // ---------------- (6) bursts + sparkles ----------------
  const bursts = createBursts(ctx, matPts(), { size: tier === 'low' ? 420 : 640, r });
  bursts.points.matrixAutoUpdate = false;
  root.add(bursts.points);

  const ambient = [dust, vortex, bokeh, shimmer, critters];
  for (const o of ambient) o.renderOrder = 4;

  // ---------------- ctx.fx (keep the object, replace the methods) ----------------
  const fx = ctx.fx;
  fx.burst = (point, opts) => { try { bursts.burst(point, opts || {}); } catch (e) { console.warn('[magic] burst', e); } };
  fx.sparkle = (object, opts) => { try { bursts.sparkle(object, opts || {}); } catch (e) { console.warn('[magic] sparkle', e); } };
  fx.setMagic = (level) => {
    const v = THREE.MathUtils.clamp(Number(level) || 0, 0, 1);
    U.uMagic.value = v;
    for (const o of ambient) o.visible = v > 0.005;
  };
  fx.getMagic = () => U.uMagic.value;
  fx.setMagic(U.uMagic.value);

  // ---------------- post-processing (bloom) or direct render ----------------
  const dbg = ctx.params.get('magicdbg');
  let post = null;
  try { post = createPost(ctx, BLOOM[tier] || BLOOM.mid); } catch (e) { console.warn('[magic] post disabled', e); post = null; }
  U.uHalo.value = post ? 0 : 0.35;         // no bloom → sprites carry a little soft glow of their own
  U.uBright.value = post ? 1 : 0.9;
  if (post) {
    if (dbg === 'bloom') post.glow.comp.uniforms.uDebug.value = 1;
    if (dbg === 'thr') post.glow.comp.uniforms.uDebug.value = 2;
    const direct = ctx.render;
    let failed = false;
    ctx.render = () => {
      if (failed) return direct();
      try { post.composer.render(); }
      catch (e) { failed = true; console.warn('[magic] post failed, rendering directly', e); U.uHalo.value = 0.35; U.uBright.value = 0.9; direct(); }
    };
    // Everything is drawn into the HalfFloat target, so compile the render-target (linear) program
    // variants up front instead of the tone-mapped screen variants nobody would use (main.js calls
    // renderer.compileAsync(scene, camera) with no target bound). See coreRequests in the report.
    const origCompile = renderer.compile.bind(renderer);
    renderer.compile = function (scene, camera, target) {
      if (failed || renderer.getRenderTarget() !== null) return origCompile(scene, camera, target);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(post.rt);
      try { return origCompile(scene, camera, target); } finally { renderer.setRenderTarget(prev); }
    };
  }

  // ---------------- resize + update ----------------
  const onResize = (w, h) => {
    const pr = renderer.getPixelRatio();
    U.uViewH.value = h * pr;
    if (post) { post.composer.setPixelRatio(pr); post.composer.setSize(w, h); }
  };
  onResize(window.innerWidth, window.innerHeight);
  ctx.onResize(onResize);
  const dev = { timeOffset: 0 };            // shots: pin the sweep / helix phase (window.__magic.dev)
  ctx.onUpdate((dt, t) => { U.uTime.value = t + dev.timeOffset; bursts.update(U.uTime.value); });

  window.__magic = { U, post, bursts, dev, counts: { dust: nDust, helix: nHelix, glitter: nGlitter, bokeh: nBokeh, shimmer: nShim + 9, critters: 9, burstPool: bursts.points.geometry.attributes.position.count }, beams: beams.length };
}
