// apparelDisplay — shared helpers: merge-by-material batcher, the "figure turn" shader patch, metre-UV
// geometry helpers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

/** Matrix from position, euler (radians), scale. */
export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.fromArray(scale); else _s.setScalar(scale);
  return new THREE.Matrix4().compose(_p.fromArray(pos), _q, _s);
}

/** Metre box-projected UVs that keep smooth normals + index. */
export function uvBox(geo, scale = 1, swap = false) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    if (swap) { const t = u; u = v; v = t; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
/** Rounded box (smooth bevels, metre UVs). */
export function rbox(w, h, d, r = 0.006, seg = 2, swapUV = false) {
  const rr = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return uvBox(new RoundedBoxGeometry(w, h, d, seg, rr), 1, swapUV);
}
/** Cylinder along y with metre UVs (u around, v along). */
export function cyl(rTop, rBot, h, seg = 20, open = false, hSeg = 1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, hSeg, open);
  const uv = g.attributes.uv, circ = Math.PI * 2 * Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}
/** Lathe with metre UVs from [r, y] points. */
export function lathe(points, seg = 48, phiStart = 0, phiLen = Math.PI * 2) {
  // three's lathe faces outward when the profile runs bottom → top; accept either order
  if (points.length > 1 && points[0][1] > points[points.length - 1][1]) points = points.slice().reverse();
  const pts = points.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
  let len = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); cum.push(len); }
  const maxR = Math.max(...points.map(p => p[0]));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const s = Math.round(uv.getX(i) * seg), j = Math.round(uv.getY(i) * (pts.length - 1));
    uv.setXY(i, (s / seg) * phiLen * maxR, cum[j] ?? 0);
  }
  return g;
}
/** Strip a geometry down to position/normal/uv (non-indexed ok) so everything merges. */
export function clean(geo, keep = ['position', 'normal', 'uv']) {
  let g = geo;
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv && keep.includes('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  g.morphAttributes = {};
  return g;
}

// ------------------------------------------------------------------------------------------------
// Figure turn: every mannequin in a merged mesh carries `aFig` (float index); uFigTurn[i] = (pivot x,
// pivot z, angle). Slot 0 is static. One uniform object shared by every turn material.
// ------------------------------------------------------------------------------------------------
export const MAX_FIGS = 12;
export function createTurnUniform() {
  return { value: Array.from({ length: MAX_FIGS }, () => new THREE.Vector3(0, 0, 0)) };
}
const TURN_HEAD = `attribute float aFig;
uniform vec3 uFigTurn[${MAX_FIGS}];
`;
const TURN_NORMAL = `#include <beginnormal_vertex>
vec3 adFt = uFigTurn[ int( aFig + 0.5 ) ];
float adC = cos( adFt.z ), adS = sin( adFt.z );
objectNormal.xz = vec2( adC * objectNormal.x + adS * objectNormal.z, -adS * objectNormal.x + adC * objectNormal.z );`;
const TURN_BEGIN = `#include <begin_vertex>
{ vec2 adD = transformed.xz - adFt.xy;
  transformed.xz = adFt.xy + vec2( adC * adD.x + adS * adD.y, -adS * adD.x + adC * adD.y ); }`;
function turnPatchShader(shader, uniform) {
  shader.uniforms.uFigTurn = uniform;
  shader.vertexShader = TURN_HEAD + shader.vertexShader
    .replace('#include <beginnormal_vertex>', TURN_NORMAL)
    .replace('#include <begin_vertex>', TURN_BEGIN);
}
/** Clone a (library) material into a turnable, vertex-coloured variant; keeps its onBeforeCompile. */
export function turnable(base, uniform, { vertexColors = true, tweak, before } = {}) {
  const m = base.clone();
  const orig = before || (base.onBeforeCompile && base.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? base.onBeforeCompile : null);
  m.userData = { ...base.userData };
  m.vertexColors = vertexColors;
  m.onBeforeCompile = function (shader, renderer) { if (orig) orig.call(this, shader, renderer); turnPatchShader(shader, uniform); };
  const key = 'adTurn|' + (orig ? orig.toString() : '');
  m.customProgramCacheKey = () => key;
  if (tweak) tweak(m);
  m.name = 'apparelDisplay:turn:' + (base.name || '');
  return m;
}

// ------------------------------------------------------------------------------------------------
// Batcher: collect geometries per key → one Mesh per key. Items: geometry (transformed), optional
// colour (linear THREE.Color or per-vertex Float32Array), optional fig index.
// ------------------------------------------------------------------------------------------------
export class Batch {
  constructor() { this.groups = new Map(); }
  add(key, geo, { matrix = null, color = null, fig = null, material = null } = {}) {
    let g = this.groups.get(key);
    if (!g) { g = { items: [], material, fig: fig !== null, color: !!color }; this.groups.set(key, g); }
    if (material && !g.material) g.material = material;
    let gg = geo.clone();
    if (matrix) gg.applyMatrix4(matrix);
    gg = clean(gg, ['position', 'normal', 'uv', 'color']);
    const n = gg.attributes.position.count;
    if (fig !== null) { g.fig = true; gg.setAttribute('aFig', new THREE.BufferAttribute(new Float32Array(n).fill(fig), 1)); }
    if (color) {
      g.color = true;
      if (color.isColor) { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b; } gg.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
      else if (!gg.attributes.color) gg.setAttribute('color', new THREE.BufferAttribute(color, 3));
    }
    g.items.push(gg);
    return this;
  }
  /** Build meshes → [{key, mesh}]. materialFor(key, group) supplies missing materials. */
  build(parent, materialFor, { castShadow = true, receiveShadow = true, renderOrder = 0 } = {}) {
    const out = [];
    this.times = {};
    for (const [key, g] of this.groups) {
      const t0 = performance.now();
      for (const it of g.items) {
        const n = it.attributes.position.count;
        if (g.fig && !it.attributes.aFig) it.setAttribute('aFig', new THREE.BufferAttribute(new Float32Array(n), 1));
        if (g.color && !it.attributes.color) { const a = new Float32Array(n * 3).fill(1); it.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
        if (it.attributes.color && it.attributes.color.itemSize !== 3) {
          const src = it.attributes.color, a = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { a[i * 3] = src.getX(i); a[i * 3 + 1] = src.getY(i); a[i * 3 + 2] = src.getZ(i); }
          it.setAttribute('color', new THREE.BufferAttribute(a, 3));
        }
      }
      const geo = mergeGeometries(g.items, false);
      if (!geo) { console.warn('[apparelDisplay] merge failed', key); continue; }
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mat = g.material || materialFor(key, g);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'ad:' + key; mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow; mesh.renderOrder = renderOrder;
      parent.add(mesh);
      out.push({ key, mesh });
      this.times[key] = Math.round(performance.now() - t0) + 'ms/' + g.items.length;
    }
    return out;
  }
}
