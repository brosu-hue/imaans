// Shared material library — THE place every module gets its surfaces from. Owner: MATERIALS.
//
// ─── API (names/signatures are stable; everything below is additive) ────────────────────────────
//   mats.get(name, opts?)            shared named surface. opts (optional, cached per combo):
//                                      { scale: n  (pattern size ×n), rotation: rad (turn the pattern,
//                                        e.g. Math.PI/2 for vertical wood grain), color: '#hex' (re-tint a
//                                        textured surface; its texture detail is kept) }
//   mats.fabric(kind, color, opts?)  shared garment fabric per kind+colour+opts.
//                                      opts: { doubleSide, scale, rotation, indigo (denim only: baked
//                                      indigo warp / ecru weft map; color then multiplies the wash),
//                                      flat (no normal map) }
//                                      fabric(kind,'#ffffff') + InstancedMesh.setColorAt() = cheapest way to
//                                      colour many garments: the instance colour becomes the garment's
//                                      average albedo AND tints the sheen (shader patch below).
//   mats.emissive(color, intensity)  glowing unlit material (bloom picks up intensity > 1).
//   mats.textures(name)              raw shared texture set for custom materials:
//                                      { map, normalMap, roughnessMap, aoMap:null, normalScale, roughness,
//                                        tile:[u,v] metres } — name = surface name or fabric kind
//                                      (also 'fabric:denim', 'denim-indigo'). {} if the name has none.
//                                      Textures already carry repeat = 1/tile, so metre UVs just work.
//   mats.ready()                     Promise → every texture requested so far is decoded (main's
//                                      onReady waits for this automatically, max 12 s).
//   mats.names, mats.fabricKinds, mats.info(name) (definition, for debug boards)
//
// ─── Surfaces (mats.get) ────────────────────────────────────────────────────────────────────────
//   woods      oak · oak-smoked · walnut (edge-glued boards, grain along u — use {rotation:Math.PI/2}
//              for vertical grain) · oak-floor (herringbone, 0.09×0.63 m planks, 1.78 m tile, spine
//              along v = the room's z axis)
//   mineral    plaster (limewash) · plaster-green · plaster-blush · paint-white · terrazzo (rosa chips)
//              · marble (Carrara) · marble-green (Verde) · travertine (vein-cut, bands along u)
//              · concrete · stone-checker (worn black/white stone) · ceramic
//   metals     brass (brushed, streaks along v) · brass-polished · steel-black · chrome · aluminium · mirror
//   glass      glass · glass-frosted · acrylic
//   finishes   lacquer-green · lacquer-black · lacquer-blush · plastic-white · rubber
//   soft       velvet-rose · velvet-green · velvet-ink · velvet-oxblood · velvet-blush · velvet-champagne
//              · boucle · linen-natural · canvas-natural · felt-grey · suede-tan · rug-wool
//              · leather-tan · leather-black · leather-cognac
//   paper      paper-kraft · paper-white · cardboard
//   organic    plant-leaf (double sided) · soil
// ─── Fabric kinds (mats.fabric) — real tile sizes ───────────────────────────────────────────────
//   cotton (poplin, 1.2 cm) · jersey (knit V's, 1.2 cm) · denim (3/1 twill, 2.4 cm, +indigo) · linen
//   (slub, 3.2 cm) · wool (2/2 twill, 1.6 cm) · knit (2×2 rib, 4 cm) · cable (aran, 12 cm) · silk (1 cm)
//   · satin (1 cm) · velvet (crush, 25 cm) · leather (pebble, 7 cm) · suede (8 cm) · canvas (duck,
//   3.2 cm) · tweed (herringbone + flecks, 4.5 cm) · corduroy (8-wale along v, 2.4 cm) · fleece (3 cm)
//   · puffer (horizontal 12 cm baffles along u, 24 cm) · boucle (12 cm)
//   Pattern directions assume garment UVs with v = up the garment (kit.boxUV on a front-facing panel).
//
// ─── Tiers ──────────────────────────────────────────────────────────────────────────────────────
//   low  : everything MeshStandardMaterial (no sheen / clearcoat); fine-weave fabrics drop normal maps.
//   mid  : fabrics MeshPhysical + sheen; clearcoat only on marble & lacquers.
//   high : mid + clearcoat on leather / puffer / ceramic.
//   every tier: texture files larger than ctx.q.texMax (low 512, mid 1024, high 2048) are downscaled once
//   when they decode (kit.capImage) — GPU memory, not detail: tiles are metre-scale, a phone never needs more.
//
// Conventions:
//  * All textured materials assume METRE-SCALE UVs (1 UV unit = 1 m). Use kit.boxUV()/kit.lathe().
//  * Materials are cached & shared: never mutate one you got from the library — clone() it first.
//  * Textures load lazily the first time a material that needs them is requested (assets/tex/*.webp,
//    sources + licences in assets/tex/CREDITS.json; generator: tools/materials-gen.py).
import * as THREE from 'three';
import { capImage } from './kit.js';

// ---------------------------------------------------------------------------------------------
// Texture sets. tile = metres covered by one texture repeat ([u, v] or number). nTile overrides the
// normal map tile. mean = linear mean RGB of the colour map (from the generator) → lets us tint a
// textured material so that its AVERAGE albedo equals the requested colour.
// ---------------------------------------------------------------------------------------------
const SETS = {
  'oak-floor':    { c: 'oak-floor_c', n: 'oak-floor_n', r: 'oak-floor_r', tile: 1.782, mean: [0.3982, 0.2565, 0.1394], rMean: 0.3957, aniso: 2 },
  'wood-oak':     { c: 'wood-oak_c', n: 'wood_n', r: 'wood_r', tile: 0.6, mean: [0.5208, 0.32, 0.1679], rMean: 0.7825 },
  'wood-walnut':  { c: 'wood-walnut_c', n: 'wood_n', r: 'wood_r', tile: 0.6, mean: [0.1062, 0.049, 0.0286], rMean: 0.7825 },
  'plaster':      { c: 'plaster_c', n: 'plaster_n', r: 'plaster_c', tile: 3.0, nTile: 1.0, mean: 0.8493, rMean: 0.8493 },
  'plaster-deep': { c: 'plaster-deep_c', n: 'plaster_n', r: 'plaster_c', tile: 3.0, nTile: 1.0, mean: 0.7894, rMean: 0.8493 },
  'terrazzo':     { c: 'terrazzo_c', n: 'terrazzo_n', r: 'terrazzo_r', tile: 1.2, mean: [0.658, 0.5716, 0.5114], rMean: 0.6052 },
  'marble':       { c: 'marble_c', r: 'marble_r', tile: 1.6, mean: [0.7935, 0.8007, 0.8297], rMean: 0.8534 },
  'marble-green': { c: 'marble-green_c', r: 'marble_r', tile: 1.2, mean: [0.0221, 0.0623, 0.0452], rMean: 0.8534 },
  'travertine':   { c: 'travertine_c', n: 'travertine_n', r: 'travertine_r', tile: 1.2, mean: [0.7128, 0.5915, 0.4429], rMean: 0.7248 },
  'concrete':     { c: 'concrete_c', n: 'concrete_n', r: 'concrete_r', tile: 2.0, mean: 0.787, rMean: 0.801 },
  'stone-checker':{ c: 'stone-checker_c', n: 'stone-checker_n', r: 'stone-checker_c', tile: 1.8, mean: [0.3147, 0.3094, 0.3068], rMean: 0.3094 },
  'brushed':      { n: 'brushed_n', r: 'brushed_r', tile: 0.3, rMean: 0.8183 },
  'rug':          { c: 'rug_c', n: 'rug_n', r: 'rug_c', tile: 0.3, mean: 0.5818, rMean: 0.5818 },
  'paper':        { c: 'paper_c', n: 'paper_n', r: 'paper_c', tile: 0.25, mean: 0.849, rMean: 0.849 },
  // fabrics
  'fab-cotton':   { c: 'fab-cotton_c', n: 'fab-cotton_n', r: 'fab-cotton_r', tile: 0.012, mean: 0.8417, rMean: 0.9317 },
  'fab-jersey':   { c: 'fab-jersey_c', n: 'fab-jersey_n', r: 'fab-jersey_r', tile: 0.012, mean: 0.778, rMean: 0.9707 },
  'fab-denim':    { c: 'fab-denim_c', n: 'fab-denim_n', r: 'fab-denim_r', tile: 0.024, mean: 0.7508, rMean: 0.9437 },
  'fab-denim-indigo': { c: 'fab-denim-indigo_c', n: 'fab-denim_n', r: 'fab-denim_r', tile: 0.024, mean: [0.0759, 0.1013, 0.1941], rMean: 0.9437 },
  'fab-linen':    { c: 'fab-linen_c', n: 'fab-linen_n', r: 'fab-linen_r', tile: 0.032, mean: 0.7155, rMean: 0.9615 },
  'fab-wool':     { c: 'fab-wool_c', n: 'fab-wool_n', r: 'fab-wool_r', tile: 0.016, mean: 0.751, rMean: 0.9675 },
  'fab-knit':     { c: 'fab-knit_c', n: 'fab-knit_n', r: 'fab-knit_r', tile: 0.04, mean: 0.6651, rMean: 0.98 },
  'fab-cable':    { c: 'fab-cable_c', n: 'fab-cable_n', r: 'fab-cable_r', tile: 0.12, mean: 0.6002, rMean: 0.98 },
  'fab-silk':     { c: 'fab-silk_c', n: 'fab-silk_n', r: 'fab-silk_r', tile: 0.01, mean: 0.8826, rMean: 0.9608 },
  'fab-satin':    { c: 'fab-satin_c', n: 'fab-satin_n', r: 'fab-satin_r', tile: 0.01, mean: 0.9094, rMean: 0.9219 },
  'fab-velvet':   { c: 'fab-velvet_c', n: 'fab-velvet_n', r: 'fab-velvet_r', tile: 0.25, mean: 0.8301, rMean: 0.9282 },
  'fab-leather':  { c: 'fab-leather_c', n: 'fab-leather_n', r: 'fab-leather_r', tile: 0.07, mean: 0.7543, rMean: 0.9021 },
  'fab-suede':    { c: 'fab-suede_c', n: 'fab-suede_n', r: 'fab-suede_r', tile: 0.08, mean: 0.8148, rMean: 0.967 },
  'fab-canvas':   { c: 'fab-canvas_c', n: 'fab-canvas_n', r: 'fab-canvas_r', tile: 0.032, mean: 0.7561, rMean: 0.9553 },
  'fab-tweed':    { c: 'fab-tweed_c', n: 'fab-tweed_n', r: 'fab-tweed_r', tile: 0.045, mean: 0.5509, rMean: 0.98 },
  'fab-corduroy': { c: 'fab-corduroy_c', n: 'fab-corduroy_n', r: 'fab-corduroy_r', tile: 0.024, mean: 0.8821, rMean: 0.9591 },
  'fab-fleece':   { c: 'fab-fleece_c', n: 'fab-fleece_n', r: 'fab-fleece_r', tile: 0.03, mean: 0.7887, rMean: 0.99 },
  'fab-puffer':   { c: 'fab-puffer_c', n: 'fab-puffer_n', r: 'fab-puffer_r', tile: 0.24, mean: 0.8962, rMean: 0.9003 },
  'fab-boucle':   { c: 'fab-boucle_c', n: 'fab-boucle_n', r: 'fab-boucle_r', tile: 0.12, mean: 0.6491, rMean: 0.99 },
};

// Surfaces. color = target AVERAGE albedo (sRGB hex) when the set is tinted (tint !== false), roughness =
// target average roughness. ns = normalScale. cc = clearcoat (mid+), ccHigh = clearcoat on high only.
const SURFACES = {
  // woods
  'oak':            { set: 'wood-oak', color: '#b48a62', roughness: 0.55, ns: 0.6 },
  'oak-smoked':     { set: 'wood-oak', color: '#5e4330', roughness: 0.5, ns: 0.6 },
  'walnut':         { set: 'wood-walnut', color: '#4a3226', roughness: 0.45, ns: 0.6 },
  'oak-floor':      { set: 'oak-floor', color: '#b08a66', tint: false, roughness: 0.42, ns: 1.0 },
  // stone / mineral
  'plaster':        { set: 'plaster', color: '#ece5da', roughness: 0.92, ns: 0.6 },
  'plaster-green':  { set: 'plaster-deep', color: '#1f3b33', roughness: 0.85, ns: 0.6 },
  'plaster-blush':  { set: 'plaster', color: '#e3c2b8', roughness: 0.9, ns: 0.6 },
  'paint-white':    { set: 'plaster', color: '#f3f1ed', roughness: 0.7, ns: 0.25, cScale: 3 },
  'terrazzo':       { set: 'terrazzo', color: '#e7e1d8', tint: false, roughness: 0.28, ns: 1.0 },
  'marble':         { set: 'marble', color: '#f1efeb', tint: false, roughness: 0.16, lowRoughness: 0.1, cc: 0.7, ccr: 0.06 },
  'marble-green':   { set: 'marble-green', color: '#2c4a40', tint: false, roughness: 0.16, lowRoughness: 0.1, cc: 0.7, ccr: 0.06 },
  'travertine':     { set: 'travertine', color: '#d8c7ae', tint: false, roughness: 0.6, ns: 1.0 },
  'concrete':       { set: 'concrete', color: '#b9b4ad', roughness: 0.85, ns: 0.8 },
  'stone-checker':  { set: 'stone-checker', color: '#9b9895', tint: false, roughness: 0.5, ns: 0.9 },
  'ceramic':        { color: '#f4f2ee', roughness: 0.18, ccHigh: 0.5 },
  // metals
  'brass':          { set: 'brushed', color: '#c9a45c', roughness: 0.32, metalness: 1, ns: 1.0 },
  'brass-polished': { set: 'brushed', color: '#d8b46a', roughness: 0.12, metalness: 1, ns: 0.3 },
  'steel-black':    { set: 'brushed', color: '#1d1d1f', roughness: 0.4, metalness: 0.85, ns: 0.6 },
  'chrome':         { color: '#e8e8ea', roughness: 0.05, metalness: 1 },
  'aluminium':      { set: 'brushed', color: '#c8cacc', roughness: 0.35, metalness: 1, ns: 0.8 },
  // glass & co
  'glass':          { color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.4 },
  'glass-frosted':  { color: '#f4f6f8', roughness: 0.35, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false },
  'acrylic':        { color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false },
  'mirror':         { color: '#ffffff', roughness: 0.0, metalness: 1, envMapIntensity: 1.2 },
  // paints / finishes
  'lacquer-green':  { color: '#1f3b33', roughness: 0.25, cc: 0.8, ccr: 0.15, lowRoughness: 0.2 },
  'lacquer-black':  { color: '#141416', roughness: 0.22, cc: 0.8, ccr: 0.15, lowRoughness: 0.18 },
  'lacquer-blush':  { color: '#d8a7a1', roughness: 0.3, cc: 0.6, ccr: 0.2, lowRoughness: 0.26 },
  'plastic-white':  { color: '#f2f2f2', roughness: 0.35 },
  'rubber':         { color: '#202022', roughness: 0.9 },
  // soft goods (non-garment)
  'velvet-rose':    { set: 'fab-velvet', color: '#b56b72', roughness: 0.85, ns: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: '#ffc9d0' },
  'velvet-green':   { set: 'fab-velvet', color: '#1e4a3c', roughness: 0.85, ns: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: '#7fd1ae' },
  'velvet-ink':     { set: 'fab-velvet', color: '#1c2233', roughness: 0.85, ns: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: '#8aa0d8' },
  'velvet-oxblood': { set: 'fab-velvet', color: '#5a1f24', roughness: 0.85, ns: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: '#e0808a' },
  'velvet-blush':   { set: 'fab-velvet', color: '#d8a7a1', roughness: 0.85, ns: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: '#ffe0dc' },
  'velvet-champagne': { set: 'fab-velvet', color: '#cbb593', roughness: 0.85, ns: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: '#fff0d6' },
  'boucle':         { set: 'fab-boucle', color: '#efe8dc', roughness: 0.95, ns: 1.0, sheen: 0.6, sheenRoughness: 0.6, sheenColor: '#ffffff' },
  'linen-natural':  { set: 'fab-linen', color: '#d8cfc0', roughness: 0.9, ns: 0.9, sheen: 0.3, sheenRoughness: 0.8, sheenColor: '#ffffff' },
  'canvas-natural': { set: 'fab-canvas', color: '#d6c9b0', roughness: 0.9, ns: 0.9, sheen: 0.2, sheenRoughness: 0.8, sheenColor: '#ffffff' },
  'felt-grey':      { set: 'fab-fleece', color: '#8c8883', roughness: 0.98, ns: 0.5, sheen: 0.5, sheenRoughness: 0.7, sheenColor: '#d0ccc6' },
  'suede-tan':      { set: 'fab-suede', color: '#a0714a', roughness: 0.97, ns: 0.5, sheen: 0.7, sheenRoughness: 0.5, sheenColor: '#e8c8a8' },
  'rug-wool':       { set: 'rug', color: '#d9cdb9', roughness: 1.0, ns: 1.0, sheen: 0.4, sheenRoughness: 0.7, sheenColor: '#ffffff' },
  'leather-tan':    { set: 'fab-leather', color: '#9a5b34', roughness: 0.45, ns: 0.7, ccHigh: 0.3, ccr: 0.4 },
  'leather-black':  { set: 'fab-leather', color: '#18171a', roughness: 0.4, ns: 0.7, ccHigh: 0.4, ccr: 0.35 },
  'leather-cognac': { set: 'fab-leather', color: '#7e4322', roughness: 0.42, ns: 0.7, ccHigh: 0.35, ccr: 0.35 },
  'paper-kraft':    { set: 'paper', color: '#b48a5a', roughness: 0.9, ns: 0.8 },
  'paper-white':    { set: 'paper', color: '#f6f4ef', roughness: 0.85, ns: 0.5 },
  'cardboard':      { set: 'paper', color: '#a8814f', roughness: 0.95, ns: 1.0, scale: 2 },
  'plant-leaf':     { color: '#3f6b3a', roughness: 0.55, side: THREE.DoubleSide },
  'soil':           { color: '#3a2b20', roughness: 1.0 },
};

// Garment fabrics. color multiplies (use white + instanceColor for many colours).
// lowN: keep the normal map on the low tier (coarse structure that still reads on a small screen).
const FABRICS = {
  cotton:   { set: 'fab-cotton',   roughness: 0.88, sheen: 0.3,  sheenRoughness: 0.8,  normalScale: 0.7 },
  jersey:   { set: 'fab-jersey',   roughness: 0.9,  sheen: 0.35, sheenRoughness: 0.75, normalScale: 0.7 },
  denim:    { set: 'fab-denim',    roughness: 0.86, sheen: 0.2,  sheenRoughness: 0.8,  normalScale: 1.0 },
  linen:    { set: 'fab-linen',    roughness: 0.92, sheen: 0.25, sheenRoughness: 0.8,  normalScale: 0.9 },
  wool:     { set: 'fab-wool',     roughness: 0.95, sheen: 0.55, sheenRoughness: 0.6,  normalScale: 0.8 },
  knit:     { set: 'fab-knit',     roughness: 0.96, sheen: 0.55, sheenRoughness: 0.55, normalScale: 1.0, lowN: true },
  cable:    { set: 'fab-cable',    roughness: 0.96, sheen: 0.55, sheenRoughness: 0.55, normalScale: 1.1, lowN: true },
  silk:     { set: 'fab-silk',     roughness: 0.35, sheen: 0.8,  sheenRoughness: 0.3,  normalScale: 0.3 },
  satin:    { set: 'fab-satin',    roughness: 0.28, sheen: 0.9,  sheenRoughness: 0.25, normalScale: 0.3 },
  velvet:   { set: 'fab-velvet',   roughness: 0.85, sheen: 1.0,  sheenRoughness: 0.35, normalScale: 0.6, lowN: true },
  leather:  { set: 'fab-leather',  roughness: 0.45, sheen: 0.0,  sheenRoughness: 0.5,  normalScale: 0.7, lowN: true, ccHigh: 0.25, ccr: 0.45 },
  suede:    { set: 'fab-suede',    roughness: 0.97, sheen: 0.75, sheenRoughness: 0.5,  normalScale: 0.5, lowN: true },
  canvas:   { set: 'fab-canvas',   roughness: 0.9,  sheen: 0.2,  sheenRoughness: 0.8,  normalScale: 0.9 },
  tweed:    { set: 'fab-tweed',    roughness: 0.97, sheen: 0.45, sheenRoughness: 0.6,  normalScale: 1.0, lowN: true },
  corduroy: { set: 'fab-corduroy', roughness: 0.92, sheen: 0.7,  sheenRoughness: 0.45, normalScale: 1.0, lowN: true },
  fleece:   { set: 'fab-fleece',   roughness: 0.98, sheen: 0.6,  sheenRoughness: 0.6,  normalScale: 0.6 },
  puffer:   { set: 'fab-puffer',   roughness: 0.38, sheen: 0.2,  sheenRoughness: 0.4,  normalScale: 1.0, lowN: true, ccHigh: 0.3, ccr: 0.3 },
  boucle:   { set: 'fab-boucle',   roughness: 0.96, sheen: 0.6,  sheenRoughness: 0.6,  normalScale: 1.0, lowN: true },
};

export const SURFACE_NAMES = Object.keys(SURFACES);
export const FABRIC_KINDS = Object.keys(FABRICS);

const WHITE = new THREE.Color(1, 1, 1);
const MAX_GAIN = 1.3; // cap on albedo compensation so deep knit crevices can't push peaks far above 1

// Shared shader patch for fabrics: the sheen follows the instance colour, so white-base + setColorAt
// garments get a coloured (not dusty-white) fabric rim. One function instance → one program key.
function fabricPatch(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', [
    '#include <lights_physical_fragment>',
    '#if defined( USE_SHEEN ) && defined( USE_COLOR )',
    '  material.sheenColor *= mix( vec3( 1.0 ), vColor.rgb, 0.75 );',
    '#endif',
  ].join('\n'));
}

// Low tier (MeshStandardMaterial, no sheen): a very cheap view-dependent rim that scales the lit
// result at grazing angles — keeps velvet / knits / suede from looking like matte plastic on iPhone 8.
// Strength per material via the fabricRim uniform (materials sharing this function share the program).
function lowSheenPatch(shader, renderer) {
  shader.uniforms.fabricRim = { value: this.userData.fabricRim || 0.3 };
  shader.fragmentShader = 'uniform float fabricRim;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', [
    'float fabricFres = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );',
    'outgoingLight *= 1.0 + fabricRim * fabricFres * fabricFres * fabricFres;',
    '#include <opaque_fragment>',
  ].join('\n'));
}

export function createMaterials(ctx) {
  const cache = new Map();
  const tier = ctx.tier;
  const q = ctx.q;
  const low = tier === 'low', high = tier === 'high';
  const maxAniso = ctx.renderer && ctx.renderer.capabilities ? ctx.renderer.capabilities.getMaxAnisotropy() : 4;

  // ---------------- lazy texture loading (one image per file, shared GPU texture per file) ----------
  const files = new Map();    // file -> {img, loaded, promise, texs:[]}
  const texCache = new Map(); // file|srgb|tu|tv|rot -> Texture
  const pending = new Set();
  let readyPassed = false;
  const loader = new THREE.ImageLoader();

  function fileEntry(file) {
    let e = files.get(file);
    if (e) return e;
    e = { img: null, loaded: false, texs: [], base: {} };
    const url = ctx.assets.url('tex/' + file + '.webp');
    e.promise = new Promise(resolve => {
      loader.load(url, img => {
        const done = () => {
          e.img = capImage(img, q.texMax); e.loaded = true;   // tier cap (low: 512) — one downscale per file
          for (const t of e.texs) { t.image = e.img; t.needsUpdate = true; }
          resolve(true);
        };
        if (img.decode) img.decode().then(done, done); else done();
      }, undefined, err => { console.warn('[materials] texture failed', file, err && err.message); resolve(false); });
    });
    pending.add(e.promise);
    e.promise.then(() => pending.delete(e.promise));
    files.set(file, e);
    return e;
  }

  /** Texture object for file with a given metre tile; srgb for colour maps. Shares the image source. */
  function tex(file, srgb, tileU, tileV, rot = 0, aniso = 1) {
    const key = file + '|' + (srgb ? 's' : 'l') + '|' + tileU.toFixed(5) + '|' + tileV.toFixed(5) + '|' + rot.toFixed(4);
    let t = texCache.get(key);
    if (t) return t;
    const e = fileEntry(file);
    const bkey = srgb ? 's' : 'l';
    const base = e.base[bkey];
    t = new THREE.Texture();
    if (base) t.source = base.source; else e.base[bkey] = t;   // share one Source → one GPU upload
    t.name = file;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(maxAniso, Math.max(1, Math.round((q.anisotropy || 1) * aniso)));
    t.repeat.set(1 / tileU, 1 / tileV);
    t.rotation = rot;
    t.center.set(0, 0);
    if (e.loaded) { t.image = e.img; t.needsUpdate = true; }
    e.texs.push(t);
    texCache.set(key, t);
    return t;
  }

  function tileOf(v) { return Array.isArray(v) ? v : [v, v]; }

  /** Raw set for a SETS key with optional scale/rotation. */
  function setTextures(setName, { scale = 1, rotation = 0, noNormal = false } = {}) {
    const s = SETS[setName];
    if (!s) return {};
    const [tu, tv] = tileOf(s.tile).map(x => x * scale);
    const [nu, nv] = tileOf(s.nTile || s.tile).map(x => x * scale);
    const a = s.aniso || 1;
    const out = {};
    if (s.c) out.map = tex(s.c, true, tu, tv, rotation, a);
    if (s.n && !noNormal) out.normalMap = tex(s.n, false, nu, nv, rotation, a);
    if (s.r) out.roughnessMap = s.r === s.c ? out.map || tex(s.r, true, tu, tv, rotation, a) : tex(s.r, false, tu, tv, rotation, a);
    return out;
  }

  /** Assign maps now (before ready: main waits for them) or once decoded (after ready: no black flash). */
  function bindMaps(m, maps) {
    const slots = Object.entries(maps).filter(([, t]) => t);
    const e = slots.map(([, t]) => files.get(t.name));
    const allLoaded = e.every(x => x && x.loaded);
    if (!readyPassed || allLoaded) { for (const [k, t] of slots) m[k] = t; return; }
    Promise.all(e.map(x => x.promise)).then(() => { for (const [k, t] of slots) m[k] = t; m.needsUpdate = true; });
  }

  function meanOf(set) {
    const s = SETS[set];
    if (!s || s.mean === undefined) return [1, 1, 1];
    return Array.isArray(s.mean) ? s.mean : [s.mean, s.mean, s.mean];
  }

  /** Linear colour such that colour × texture-mean = target (per channel), gain-capped for white bases. */
  function tinted(target, set, cap = Infinity) {
    const c = new THREE.Color(target);
    const m = meanOf(set);
    c.r = c.r / m[0]; c.g = c.g / m[1]; c.b = c.b / m[2];
    const mx = Math.max(c.r, c.g, c.b);
    if (mx > cap) c.multiplyScalar(cap / mx);
    return c;
  }

  // ---------------- surfaces ----------------
  function buildSurface(name, def, opts = {}) {
    const d = { ...def };
    if (opts.color) d.color = opts.color;
    const scale = (d.scale || 1) * (opts.scale || 1);
    const rotation = opts.rotation || 0;
    let cc = d.cc || 0;
    if (high && d.ccHigh) cc = d.ccHigh;
    if (low) cc = 0;
    const sheen = low ? 0 : (d.sheen || 0);
    const physical = cc > 0 || sheen > 0;
    const set = d.set ? SETS[d.set] : null;
    const p = {
      roughness: low && d.lowRoughness !== undefined ? d.lowRoughness : (d.roughness ?? 0.8),
      metalness: d.metalness ?? 0,
    };
    for (const k of ['transparent', 'opacity', 'depthWrite', 'side', 'envMapIntensity']) if (d[k] !== undefined) p[k] = d[k];
    let maps = {};
    if (set) {
      maps = setTextures(d.set, { scale, rotation });
      if (d.cScale && maps.map) { // paint-white: plaster detail at a finer, calmer scale
        const [tu, tv] = tileOf(set.tile);
        maps.map = tex(set.c, true, tu / d.cScale, tv / d.cScale, rotation);
        maps.roughnessMap = maps.map;
      }
      if (maps.roughnessMap && set.rMean) p.roughness = Math.min(1, p.roughness / set.rMean);
      if (maps.map) p.color = d.tint === false && !opts.color ? new THREE.Color(1, 1, 1) : tinted(d.color, d.set);
      else p.color = new THREE.Color(d.color);
    } else p.color = new THREE.Color(d.color ?? '#ffffff');
    if (physical) {
      if (cc) { p.clearcoat = cc; p.clearcoatRoughness = d.ccr ?? 0.1; }
      if (sheen) {
        p.sheen = sheen; p.sheenRoughness = d.sheenRoughness ?? 0.5;
        p.sheenColor = new THREE.Color(d.sheenColor || '#ffffff');
      }
    }
    const m = physical ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p);
    if (sheen) m.onBeforeCompile = fabricPatch;                      // same program as the garment fabrics
    else if (low && d.sheen >= 0.3) { m.userData.fabricRim = 0.5 + 1.1 * d.sheen; m.onBeforeCompile = lowSheenPatch; }
    if (maps.normalMap) m.normalScale.set(d.ns ?? 1, d.ns ?? 1);
    bindMaps(m, maps);
    m.name = name;
    return m;
  }

  // ---------------- fabrics ----------------
  function buildFabric(kind, color, opts) {
    const f = FABRICS[kind] || FABRICS.cotton;
    const setName = kind === 'denim' && opts.indigo ? 'fab-denim-indigo' : f.set;
    const dropN = opts.flat || (low && !f.lowN);
    const maps = setTextures(setName, { scale: opts.scale || 1, rotation: opts.rotation || 0, noNormal: dropN });
    const req = new THREE.Color(color);
    // average albedo == requested colour (white base → the instance colour is the average albedo)
    const m0 = meanOf(setName);
    const gain = new THREE.Color(Math.min(MAX_GAIN, 1 / m0[0]), Math.min(MAX_GAIN, 1 / m0[1]), Math.min(MAX_GAIN, 1 / m0[2]));
    if (setName === 'fab-denim-indigo') gain.setRGB(1, 1, 1); // baked wash: colour multiplies the wash as-is
    const col = req.clone().multiply(gain);
    const rough = Math.min(1, f.roughness / (SETS[setName].rMean || 1));
    const side = opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
    let m;
    const cc = high && f.ccHigh ? f.ccHigh : 0;
    if (low || (!f.sheen && !cc)) {
      m = new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0, side });
      if (low && f.sheen >= 0.3) { m.userData.fabricRim = 0.5 + 1.1 * f.sheen; m.onBeforeCompile = lowSheenPatch; }
    } else {
      m = new THREE.MeshPhysicalMaterial({
        color: col, roughness: rough, metalness: 0, side,
        sheen: f.sheen, sheenRoughness: f.sheenRoughness,
        sheenColor: WHITE.clone().lerp(req, 0.7),
        clearcoat: cc, clearcoatRoughness: f.ccr || 0,
      });
      if (f.sheen) m.onBeforeCompile = fabricPatch;
    }
    if (maps.normalMap) m.normalScale.set(f.normalScale, f.normalScale);
    bindMaps(m, maps);
    return m;
  }

  function keyOf(o) { return o && Object.keys(o).length ? JSON.stringify(o) : ''; }

  const api = {
    /** Named surface material (shared). Unknown names fall back to 'plaster' with a console warning. */
    get(name, opts) {
      const key = 'surf:' + name + ':' + keyOf(opts);
      if (cache.has(key)) return cache.get(key);
      let def = SURFACES[name];
      if (!def) { console.warn('[materials] unknown material', name); def = SURFACES.plaster; }
      const m = buildSurface(name, def, opts || {});
      cache.set(key, m); return m;
    },
    /** Garment fabric (shared per kind+colour+opts). kind ∈ FABRIC_KINDS, color = hex string/number. */
    fabric(kind, color = '#ffffff', opts = {}) {
      const key = 'fabric:' + kind + ':' + new THREE.Color(color).getHexString() + ':' + keyOf(opts);
      if (cache.has(key)) return cache.get(key);
      if (!FABRICS[kind]) console.warn('[materials] unknown fabric kind', kind);
      const m = buildFabric(kind, color, opts || {});
      m.name = key;
      cache.set(key, m); return m;
    },
    /** Glowing material (bloom picks it up). intensity > 1 blooms more. */
    emissive(color = '#ffe2b0', intensity = 2.0) {
      const key = 'emissive:' + color + ':' + intensity;
      if (cache.has(key)) return cache.get(key);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
      m.name = key; cache.set(key, m); return m;
    },
    /** Raw texture set for custom materials: {map, normalMap, roughnessMap, aoMap, normalScale, roughness, tile} or {}. */
    textures(name) {
      let n = String(name).replace(/^fabric:/, '');
      let setName, ns = 1, rough = 1;
      if (n === 'denim-indigo') { setName = 'fab-denim-indigo'; ns = FABRICS.denim.normalScale; rough = FABRICS.denim.roughness; }
      else if (FABRICS[n]) { setName = FABRICS[n].set; ns = FABRICS[n].normalScale; rough = FABRICS[n].roughness; }
      else if (SURFACES[n] && SURFACES[n].set) { setName = SURFACES[n].set; ns = SURFACES[n].ns ?? 1; rough = SURFACES[n].roughness ?? 1; }
      else if (SETS[n]) setName = n;
      if (!setName) return {};
      const s = SETS[setName];
      const t = setTextures(setName);
      return { map: t.map || null, normalMap: t.normalMap || null, roughnessMap: t.roughnessMap || null, aoMap: null,
        normalScale: ns, roughness: s.rMean ? Math.min(1, rough / s.rMean) : rough, tile: tileOf(s.tile), mean: meanOf(setName) };
    },
    /** Resolves when every texture requested so far has loaded (or failed). */
    ready() { return Promise.all([...pending]).then(() => true); },
    info(name) { return SURFACES[name] || FABRICS[name] || null; },
    names: SURFACE_NAMES,
    fabricKinds: FABRIC_KINDS,
  };

  // Hold the boot's onReady phase until textures requested during build are decoded, then upload them
  // so the first real frame has no black maps and no upload hitch. Registered first → runs first.
  if (ctx.onReady) ctx.onReady(async () => {
    const t0 = performance.now();
    while (pending.size && performance.now() - t0 < 12000) {
      await Promise.race([Promise.all([...pending]), new Promise(r => setTimeout(r, 250))]);
    }
    readyPassed = true;
    if (ctx.renderer && ctx.renderer.initTexture) {
      for (const e of files.values()) if (e.loaded && e.texs[0]) { try { ctx.renderer.initTexture(e.texs[0]); } catch (err) { /* optional */ } }
    }
  });
  return api;
}
