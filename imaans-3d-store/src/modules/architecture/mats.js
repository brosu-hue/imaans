// Architecture material set — built for the shader-program budget (phones compile every program on
// first view). Every architecture surface uses one of FIVE programs:
//
//   std   MeshStandardMaterial  map + normalMap + roughnessMap + lightMap(uv1) + aoMap(uv1)
//         floors, walls, ceiling, mouldings, joinery, sign boards AND the metals (brass / black steel
//         get neutral dummy maps + a black light map, so they share the program; metalness is a uniform)
//   gild  MeshStandardMaterial  map + emissiveMap + alphaTest, transparent — glass panes, gold vinyl,
//         the IMAANS metal letters, decals
//   glow  MeshBasicMaterial     map — LED lenses / globes / cove (an intensity ramp texture, see RAMP),
//         and the painted exterior (facade, street, sky)
//   add   MeshBasicMaterial     map, additive — sign halos, neon script, bokeh
//   refl  MeshBasicMaterial     envMap cube, additive — faint night reflection on the storefront glass
//
// Environment capture: when the scene is NOT drawn through a render target, capturing it would compile
// a second (linear, un-tone-mapped) variant of every material. So the capture swaps the shell onto
// `proxy` materials — MeshBasicMaterial map + lightMap + aoMap, ONE program — that reproduce the baked
// lighting exactly (basic lightMap = standard's lightMap term) and skips everything else.
import * as THREE from 'three';

const WARM = new THREE.Color(1.0, 0.83, 0.64);
export const RAMP_MAX = 8; // glow ramp: u in [0,1] → intensity 0..RAMP_MAX × WARM

function dataTex(rgba, w = 1, h = 1, srgb = false) {
  const t = new THREE.DataTexture(new Uint8Array(rgba), w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export function createArchMats(ctx, LM) {
  const { mats } = ctx;
  const K = LM.intensity;
  const white = dataTex([255, 255, 255, 255]);
  const flatN = dataTex([128, 128, 255, 255]);
  const white1 = white.clone(); white1.channel = 1; white1.needsUpdate = true;   // light/AO maps read uv1
  const black1 = dataTex([0, 0, 0, 255]); black1.channel = 1;
  // intensity ramp for the glow parts (linear): 256 texels 0..1, material colour = WARM × RAMP_MAX
  const rampData = []; for (let i = 0; i < 256; i++) rampData.push(i, i, i, 255);
  const ramp = dataTex(rampData, 256, 1);
  ramp.magFilter = THREE.LinearFilter; ramp.minFilter = THREE.LinearFilter; ramp.generateMipmaps = false;

  const all = [];
  const reg = (m) => { all.push(m); return m; };

  /**
   * Standard surface on the shared program. lib = library surface name (textures, calibrated colour and
   * roughness are copied — the library material itself is never mutated). o: {libOpts, color (sRGB hex:
   * re-tint so the AVERAGE albedo = color), roughness, roughnessScale, metalness, lm: {light, ao} | null,
   * normalScale, flat (drop the colour/roughness texture: smooth paint), env (envMapIntensity)}
   */
  function std(name, lib, o = {}) {
    const base = lib ? mats.get(lib, o.libOpts || (o.color ? { color: o.color } : undefined)) : null;
    const m = new THREE.MeshStandardMaterial();
    m.name = 'arch:' + name;
    const map = base && base.map && !o.flat ? base.map : white;
    m.map = map;
    m.roughnessMap = base && base.roughnessMap && !o.flat ? base.roughnessMap : white;
    m.normalMap = base && base.normalMap ? base.normalMap : flatN;
    const ns = o.normalScale ?? (base && base.normalMap ? base.normalScale.x : 1);
    m.normalScale.set(ns, ns);
    if (base) m.color.copy(base.color); else m.color.set(o.color || '#ffffff');
    if (o.flat && o.color) m.color.set(o.color);
    const def = lib ? mats.info(lib) : null;
    m.roughness = o.roughness ?? (o.flat && def ? def.roughness : (base ? base.roughness : 0.8));
    if (o.roughnessScale) m.roughness *= o.roughnessScale;
    m.metalness = o.metalness ?? (base ? base.metalness : 0);
    if (base && base.envMapIntensity !== undefined) m.envMapIntensity = base.envMapIntensity;
    if (o.env !== undefined) m.envMapIntensity = o.env;
    if (o.lm) { m.lightMap = o.lm.light; m.lightMapIntensity = o.lm.k ?? K; m.aoMap = o.lm.ao; m.aoMapIntensity = 1; }
    else { m.lightMap = black1; m.lightMapIntensity = 0; m.aoMap = white1; }
    // capture proxy: same albedo × the same baked light (metals: a dim flat tint)
    const p = new THREE.MeshBasicMaterial({ map, color: m.color.clone() });
    if (o.lm) { p.lightMap = o.lm.light; p.lightMapIntensity = (o.lm.k ?? K) * 1.25; p.aoMap = o.lm.ao; }
    else { p.lightMap = white1; p.lightMapIntensity = Math.PI * (m.metalness > 0.5 ? 0.35 : 0.6); p.aoMap = white1; }
    p.name = m.name + ':proxy';
    m.userData.proxy = p;
    return reg(m);
  }

  /** Transparent standard (glass, gold vinyl, metal letters). tex = canvas atlas or null (clear glass). */
  function gild(name, tex, o = {}) {
    const m = new THREE.MeshStandardMaterial({
      map: tex || white, emissiveMap: tex || white,
      color: o.color ?? '#ffffff', emissive: o.emissive ?? new THREE.Color(0, 0, 0),
      metalness: o.metalness ?? 0, roughness: o.roughness ?? 0.3,
      transparent: true, alphaTest: 0.02, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? false,
    });
    if (o.env !== undefined) m.envMapIntensity = o.env;
    m.name = 'arch:' + name;
    m.userData.proxy = null; // not captured
    return reg(m);
  }

  /** Opaque unlit (painted exterior, glow ramp). */
  function glow(name, tex, color = '#ffffff') {
    const m = new THREE.MeshBasicMaterial({ map: tex || ramp, color });
    m.name = 'arch:' + name;
    const p = new THREE.MeshBasicMaterial({ map: tex || ramp, color: m.color.clone(), lightMap: white1, lightMapIntensity: Math.PI, aoMap: white1 });
    p.name = m.name + ':proxy';
    m.userData.proxy = p;
    return reg(m);
  }

  /** Additive unlit (halos, neon, bokeh). */
  function add(name, tex, color = '#ffffff') {
    const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    m.name = 'arch:' + name;
    m.userData.proxy = null;
    return reg(m);
  }

  const glowMat = glow('glow', null, WARM.clone().multiplyScalar(RAMP_MAX));
  const opalMat = reg(opal());
  return { std, gild, glow, add, glowMat, opalMat, white, ramp, all, K };
}

/**
 * Lit opal-glass pendant globe (one tiny program, the 6 globes only). An unlit flat colour reads as a
 * white paper disc; real opal glass glows hottest where you look straight through it at the lamp and
 * falls off toward the silhouette, the brass cap shades the crown, and the glossy skin catches a small
 * glint of the ceiling light. World-space normals (the batch is merged in world space).
 */
function opal() {
  const m = new THREE.ShaderMaterial({
    name: 'arch:opal',
    uniforms: {
      uWarm: { value: new THREE.Color(1.0, 0.8, 0.58) },
      uCore: { value: 3.1 }, uRim: { value: 0.46 },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uWarm; uniform float uCore; uniform float uRim;
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float f = clamp(dot(n, v), 0.0, 1.0);
        float k = uRim + (uCore - uRim) * pow(f, 1.8);           // hot core → soft limb
        k *= 1.0 - 0.34 * smoothstep(0.35, 0.98, n.y);            // the crown sits in the cap's shadow
        vec3 col = uWarm * k;
        col = mix(col, uWarm * uWarm * 0.55 * uCore, 0.18 * (1.0 - f)); // warmer, deeper tint at the rim
        vec3 r = reflect(-v, n);                                   // glossy skin: a glint of the ceiling
        col += vec3(1.0, 0.94, 0.86) * 1.6 * pow(max(dot(r, normalize(vec3(0.25, 1.0, 0.35))), 0.0), 90.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // env capture proxy: none (the globes are tiny in a 256 px cube; hidden while the shell is captured)
  m.userData.proxy = null;
  return m;
}

/** Glow batch: the per-vertex intensity colours become ramp UVs (u = k / RAMP_MAX); colour attr dropped. */
export function colorsToRamp(geo) {
  const c = geo.attributes.color; if (!c) return geo;
  const n = c.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = Math.min(1, c.getX(i) / RAMP_MAX); uv[i * 2 + 1] = 0.5; } // colours are WARM × k (WARM.r = 1)
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.deleteAttribute('color');
  return geo;
}

/** Does ctx.render() draw the scene into a render target (post chain)? Then a full capture is free. */
export function sceneRendersToTarget(ctx) {
  const r = ctx.renderer, orig = r.render;
  let seen = false, viaRT = false;
  r.render = function (s, c) { if (s === ctx.scene && !seen) { seen = true; viaRT = r.getRenderTarget() !== null; } return orig.call(this, s, c); };
  try { ctx.render(); } catch (e) { /* ignore */ } finally { r.render = orig; }
  return viaRT;
}

/**
 * Swap `root`'s meshes onto their capture proxies (null proxy / none → hidden). Returns restore().
 */
export function useProxies(root) {
  const swapped = [], hidden = [];
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const p = o.material && o.material.userData ? o.material.userData.proxy : undefined;
    if (p) { swapped.push([o, o.material]); o.material = p; } else { hidden.push(o); o.visible = false; }
  });
  return () => { for (const [o, m] of swapped) o.material = m; for (const o of hidden) o.visible = true; };
}
