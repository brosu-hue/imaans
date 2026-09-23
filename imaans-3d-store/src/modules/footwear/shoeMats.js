// footwear — ONE material (one shader program) for every procedural shoe, shoe box and tissue sheet.
//   MeshStandardMaterial · map = brand atlas (uv1) · normalMap = leather pebble (uv0, metres) · vertex
//   colours · instancing + instance colour. A small patch decodes aTint = tint + 2·surf per vertex:
//     tint → how much of the instance colour the vertex takes (linings / soles / gold keep their own),
//     surf → roughness / metalness / normal strength (calf · patent · suede · gold · rubber · gloss · textile).
// Merged shoe banks bake the product colour into the vertex colours and use a white instance colour;
// boxes + floaters take theirs from instanceColor. Same program either way.
import * as THREE from 'three';
import { brandAtlas } from './atlas.js';

// roughness, metalness, normal-map strength per surface class (see lasts.js SURF)
const SURFS = [
  [0.36, 0, 1.0],   // 0 calf (base)
  [0.1, 0, 0.08],   // 1 patent
  [0.9, 0, 1.7],    // 2 suede / nubuck
  [0.26, 1, 0.15],  // 3 gold hardware
  [0.62, 0, 0.6],   // 4 rubber / soles
  [0.3, 0, 0.2],    // 5 gloss rubber
  [0.88, 0, 1.4],   // 6 textile (canvas, jute, raffia)
];

function shoePatch(shader) {
  const lut = (i) => SURFS.map((s, k) => `s == ${k}.0 ? ${s[i].toFixed(3)} :`).join(' ') + ' 0.5';
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aTint;\nvarying vec3 vFwSurf;')
    .replace('#include <color_vertex>', [
      'float fwS = floor( aTint * 0.5 + 0.001 );',
      'float fwT = clamp( aTint - 2.0 * fwS, 0.0, 1.0 );',
      THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, fwT );'),
      '{ float s = fwS; vFwSurf = vec3( ' + lut(0) + ', ' + lut(1) + ', ' + lut(2) + ' ); }',
    ].join('\n'));
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFwSurf;')
    .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vFwSurf.z;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vFwSurf.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vFwSurf.y;');
}

/** The shared shoe/box material + its brand atlas. */
export function shoeMaterials(ctx) {
  const { mats } = ctx;
  const leatherTex = mats.textures('fab-leather') || {};
  // the box end label shows a mid size of the catalogue's shoe size guide (EU 36–41 → 38)
  const guide = ((ctx.catalog && ctx.catalog.sizeGuides) || []).find(g => /shoe/i.test((g.name || '') + (g.id || '')));
  const sizes = (guide && guide.sizes) || [];
  const atlas = brandAtlas(ctx.kit, ctx.fonts, ctx.brand, sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : '');
  atlas.anisotropy = ctx.q.anisotropy;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.36, metalness: 0, map: atlas });
  if (leatherTex.normalMap) { m.normalMap = leatherTex.normalMap; m.normalScale.set(0.35, 0.35); }
  else { const n = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); n.needsUpdate = true; m.normalMap = n; }
  m.envMapIntensity = 1.35;          // a little more sheen on the leather: shoes should look desirable under the spots
  m.onBeforeCompile = shoePatch;
  m.customProgramCacheKey = () => 'fw-shoe-2';
  m.name = 'footwear:shoe';
  return { shoe: m, atlas };
}
