// footwear — materials built on the SAME shader-program recipes the architecture uses (see
// architecture/mats.js), so the shoe fixtures' joinery, LED lines, tier wash, shadows and glass compile
// no programs of their own. A program is shared when the material type + the set of maps (and their
// uv channels) + flags match; colours / roughness / metalness / map contents are uniforms.
//
//   std   MeshStandardMaterial  map + normalMap + roughnessMap (uv0) + lightMap + aoMap (uv1)
//         → geometry needs `uv` (metres) AND `uv1` (any; the dummy light/AO maps are 1×1)
//   glow  MeshBasicMaterial     map — LED lines (intensity ramp, see rampUV) and the painted tier wash
//   add   MeshBasicMaterial     map, transparent — contact shadows
//   gild  MeshStandardMaterial  map + emissiveMap, alphaTest, transparent — the island's glass
//
// If architecture ever changes its recipe these simply become footwear's own (≤ 4) programs.
import * as THREE from 'three';

function dataTex(rgba, w = 1, h = 1, channel = 0) {
  const t = new THREE.DataTexture(new Uint8Array(rgba), w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.channel = channel; t.needsUpdate = true;
  return t;
}
const WARM = new THREE.Color(1.0, 0.83, 0.64);
export const RAMP_MAX = 8;

let _shared = null;
function shared() {
  if (_shared) return _shared;
  const rampData = []; for (let i = 0; i < 256; i++) rampData.push(i, i, i, 255);
  const ramp = dataTex(rampData, 256, 1);
  ramp.magFilter = THREE.LinearFilter; ramp.minFilter = THREE.LinearFilter; ramp.generateMipmaps = false;
  _shared = {
    white: dataTex([255, 255, 255, 255]), flatN: dataTex([128, 128, 255, 255]),
    white1: dataTex([255, 255, 255, 255], 1, 1, 1), black1: dataTex([0, 0, 0, 255], 1, 1, 1), ramp,
  };
  return _shared;
}

/**
 * Standard surface on the shared std program. lib = library surface name (its textures, calibrated colour
 * and roughness are copied — the library material is never mutated). o: { libOpts, color, roughness,
 * metalness, normalScale, env, flat (drop colour + roughness texture), map (own colour texture),
 * lightMap:{tex, k} (e.g. the floor's baked light) }.
 */
export function stdMat(ctx, name, lib, o = {}) {
  const S = shared();
  const base = lib ? ctx.mats.get(lib, o.libOpts) : null;
  const m = new THREE.MeshStandardMaterial();
  m.name = 'footwear:' + name;
  m.map = o.map || (base && base.map && !o.flat ? base.map : S.white);
  m.roughnessMap = base && base.roughnessMap && !o.flat ? base.roughnessMap : S.white;
  m.normalMap = o.normalMap || (base && base.normalMap ? base.normalMap : S.flatN);
  const ns = o.normalScale ?? (base && base.normalMap ? base.normalScale.x : 1);
  m.normalScale.set(ns, ns);
  if (base) m.color.copy(base.color); else m.color.set('#ffffff');
  if (o.color) m.color.set(o.color);
  m.roughness = o.roughness ?? (base ? base.roughness : 0.8);
  m.metalness = o.metalness ?? (base ? base.metalness : 0);
  if (base && base.envMapIntensity !== undefined) m.envMapIntensity = base.envMapIntensity;
  if (o.env !== undefined) m.envMapIntensity = o.env;
  if (o.lightMap) { m.lightMap = o.lightMap.tex; m.lightMapIntensity = o.lightMap.k; }
  else { m.lightMap = S.black1; m.lightMapIntensity = 0; }
  m.aoMap = S.white1;
  return m;
}

/** Unlit opaque (glow program): LED ramp (map = ramp, colour = WARM × RAMP_MAX) or a painted texture. */
export function glowMat(name, tex = null, color = null) {
  const S = shared();
  const m = new THREE.MeshBasicMaterial({ map: tex || S.ramp, color: color || WARM.clone().multiplyScalar(RAMP_MAX) });
  m.name = 'footwear:' + name;
  return m;
}
/** Per-vertex LED intensity k (0..RAMP_MAX, relative to WARM) → ramp uv (for glowMat without a texture). */
export function rampUV(geo, k) {
  const n = geo.attributes.position.count, uv = new Float32Array(n * 2);
  const u = Math.min(1, k / RAMP_MAX);
  for (let i = 0; i < n; i++) { uv[i * 2] = u; uv[i * 2 + 1] = 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Transparent unlit (add program): contact shadows (normal blending, black). */
export function addMat(name, tex, { color = '#ffffff' } = {}) {
  const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.name = 'footwear:' + name;
  return m;
}

/** Transparent standard with an emissive map (gild program): clear acrylic, gold-on-black plaques. */
export function gildMat(name, tex = null, o = {}) {
  const S = shared();
  const m = new THREE.MeshStandardMaterial({
    map: tex || S.white, emissiveMap: tex || S.white,
    color: o.color ?? '#ffffff', emissive: o.emissive ?? new THREE.Color(0, 0, 0),
    metalness: o.metalness ?? 0, roughness: o.roughness ?? 0.3,
    transparent: true, alphaTest: 0.02, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? false,
  });
  if (o.env !== undefined) m.envMapIntensity = o.env;
  m.name = 'footwear:' + name;
  return m;
}
