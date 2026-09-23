// Garment materials for apparelRails: a CLONE of the library fabric (the shared one is never mutated)
// plus one small vertex-shader patch that makes a packed rail read like a real one.
//
//  • `cav`   (vertex attribute, garments.js) — baked self-occlusion: fold valleys, under collars,
//            sleeve/body contact, cuff and hem openings, pleat valleys.
//  • `aRail` (per-instance vec4) — rail occlusion. x = how tightly packed the neighbours are (0 free … 1
//            dense), y / z = 1 when the front / back face is exposed (end of a run, face-out front),
//            w = 1 when both sides face an aisle (single rail) or the garment is face-out. Faces turned to
//            the neighbours darken with depth away from the exposed +x edge, faces turned to the wall darken
//            more, and the lower garment slightly more (the shoulders of the neighbours shade it).
//  • `aDrape` (per-instance vec3) — twist (rad), sway (m) and lean (m) of the hem, ∝ depth², applied in
//            the garment frame before the instance matrix: every instance of one geometry hangs differently.
//  • micro drape — per-fragment vertical fold shading (a slanted-sine height field in the garment frame,
//            fading in below the shoulders, phase varied per instance, strength uFold per fabric: liquid
//            for silk, crisp for cotton, soft for knits). Cloth reads as cloth at any mesh density.
//  Missing attributes (plain Mesh) read as (0,0,0,1) / (0,0,0) → only `cav` applies.
//
// The library's own onBeforeCompile (fabric sheen tint on mid/high, cheap rim on low) runs first and the
// program cache key is explicit, so all garment materials of a tier share one program variant.
import * as THREE from 'three';
import { rimPatch } from './imaans.js';

const HEAD = `attribute float cav;
attribute vec4 aRail;
attribute vec3 aDrape;
uniform float uRailW;
uniform float uDrapeLen;
varying float vRailAO;
varying vec3 vGLocal;
varying vec3 vGX;
varying vec3 vGPh;
varying float vGSide;
vec3 arDrape( vec3 p, float e ) {
  float e2 = e * e, a = aDrape.x * e2, c = cos( a ), s = sin( a );
  return vec3( p.x * c + p.z * s + aDrape.z * e2, p.y, -p.x * s + p.z * c + aDrape.y * e2 );
}
`;
const NORMAL = `#include <beginnormal_vertex>
float arE = clamp( ( -0.071 - position.y ) / uDrapeLen, 0.0, 1.2 );
{
  float a = aDrape.x * arE * arE, c = cos( a ), s = sin( a );
  objectNormal = vec3( objectNormal.x * c + objectNormal.z * s, objectNormal.y, -objectNormal.x * s + objectNormal.z * c );
  objectNormal.y += ( 2.0 * aDrape.y * arE / uDrapeLen ) * objectNormal.z + ( 2.0 * aDrape.z * arE / uDrapeLen ) * objectNormal.x;
}`;
const BEGIN = `#include <begin_vertex>
transformed = arDrape( transformed, arE );
{
  vec3 rn = normalize( objectNormal );
  float occ = aRail.x;
  float d = mix( clamp( ( uRailW - position.x ) / ( 2.0 * uRailW ), 0.0, 1.0 ),
                 clamp( 1.0 - abs( position.x ) / uRailW, 0.0, 1.0 ) * 0.7, aRail.w );
  float open = rn.z > 0.0 ? aRail.y : aRail.z;
  float a = 1.0 - occ * abs( rn.z ) * ( 1.0 - open ) * ( 0.2 + 0.6 * smoothstep( 0.04, 0.75, d ) );
  a *= 1.0 - occ * 0.5 * max( 0.0, -rn.x ) * ( 1.0 - aRail.w );
  a *= 1.0 - occ * 0.16 * smoothstep( -0.35, -1.1, position.y );
  vRailAO = a * mix( 1.0, cav, 0.9 );
  vGLocal = transformed;
  vGSide = clamp( rn.z * 3.0, -1.0, 1.0 );
#ifdef USE_INSTANCING
  vGX = normalize( ( modelViewMatrix * ( instanceMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ) ).xyz );
#else
  vGX = normalize( ( modelViewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz );
#endif
  vGPh = vec3( aDrape.x * 37.0 + aDrape.y * 91.0, aDrape.y * 53.0 + aDrape.z * 71.0 + 1.7, aDrape.z * 29.0 + aDrape.x * 17.0 + 4.1 );
}`;
const FRAG_HEAD = 'uniform float uFold;\nuniform float uDrapeLen;\nvarying float vRailAO;\nvarying vec3 vGLocal;\nvarying vec3 vGX;\nvarying vec3 vGPh;\nvarying float vGSide;\n';
const FOLDS = `#include <normal_fragment_maps>
{
  float fe = clamp( ( -0.071 - vGLocal.y ) / uDrapeLen, 0.0, 1.0 );
  float fw = smoothstep( 0.03, 0.4, fe ) * ( 0.35 + 0.65 * fe );
  float fx = vGLocal.x, fy = vGLocal.y;
  float sl = 0.55 * cos( fx * 41.0 + fy * 7.0 + vGPh.x ) + 0.33 * cos( fx * 73.0 - fy * 11.0 + vGPh.y ) + 0.2 * cos( fx * 127.0 + fy * 19.0 + vGPh.z );
  normal = normalize( normal - vGX * ( sl * uFold * fw * vGSide ) );
}`;

function patch(shader) {
  shader.uniforms.uRailW = { value: this.userData.railW || 0.3 };
  shader.uniforms.uDrapeLen = { value: this.userData.drapeLen || 0.8 };
  shader.uniforms.uFold = { value: this.userData.fold ?? 0.25 };
  shader.vertexShader = HEAD + shader.vertexShader
    .replace('#include <beginnormal_vertex>', NORMAL)
    .replace('#include <begin_vertex>', BEGIN);
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
    .replace('#include <normal_fragment_maps>', FOLDS)
    .replace('#include <opaque_fragment>', 'outgoingLight *= vRailAO;\n#include <opaque_fragment>');
}

const cache = new Map();
/**
 * Material for one garment InstancedMesh. kind = library fabric kind (+ opts), railW = garment half-width,
 * drapeLen = neck→hem length (m). White base: colour instances with setColorAt (the library makes the
 * instance colour the average albedo and tints the sheen with it).
 */
const FOLD = { silk: 0.6, satin: 0.55, jersey: 0.58, cotton: 0.42, linen: 0.42, denim: 0.36, knit: 0.22, cable: 0.14, fleece: 0.28,
  wool: 0.26, tweed: 0.2, canvas: 0.32, puffer: 0.06, velvet: 0.3, leather: 0.1, suede: 0.15, corduroy: 0.18, boucle: 0.1 };
export function garmentMaterial(mats, kind, opts = {}, railW = 0.3, drapeLen = 0.8, key = '', { low = false } = {}) {
  const k = [kind, JSON.stringify(opts), railW.toFixed(3), drapeLen.toFixed(3), key, low].join('|');
  if (cache.has(k)) return cache.get(k);
  // low tier: every fabric on one program (no normal map, the shared rim term) — see imaans.rimPatch
  const base = mats.fabric(kind, '#ffffff', low ? { ...opts, flat: true } : opts);
  const m = base.clone();
  const orig = low ? rimPatch : base.onBeforeCompile;
  m.userData.railW = railW; m.userData.drapeLen = drapeLen; m.userData.fold = FOLD[kind] ?? 0.25;
  m.onBeforeCompile = function (shader, renderer) { orig.call(this, shader, renderer); patch.call(this, shader); };
  const origKey = orig.toString();
  m.customProgramCacheKey = () => 'apparelRails-garment|' + origKey;
  m.name = 'apparelRails:' + kind + (key ? ':' + key : '');
  cache.set(k, m);
  return m;
}

/** Per-instance attribute from rows of numbers ([[a,b,c,d], …] → itemSize = row length). */
export function instAttr(rows, size) {
  const a = new Float32Array(rows.length * size);
  rows.forEach((v, i) => { for (let j = 0; j < size; j++) a[i * size + j] = v[j] ?? 0; });
  return new THREE.InstancedBufferAttribute(a, size);
}
