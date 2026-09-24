// fixtures — geometry helpers, a merge-by-material batcher with item ranges, merged contact shadows,
// cheap hit proxies. Owner: fixtures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const lerp = (a, b, t) => a + (b - a) * t;

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** Matrix from position, euler rotation [x,y,z] (rad, order XYZ unless given) and scale (number | [x,y,z]). */
export function M(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, order = 'XYZ') {
  _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, order); _q.setFromEuler(_e);
  if (Array.isArray(scale)) _s.fromArray(scale); else _s.setScalar(scale);
  return new THREE.Matrix4().compose(_p.fromArray(pos), _q, _s);
}

/**
 * Metre box-projected UVs that keep smooth normals + index. grain 'u' (default) → wood grain / weave along
 * the face's horizontal axis; 'v' → swaps u/v on side faces (vertical grain on tall panels).
 */
export function uvBox(geo, { scale = 1, vertical = false } = {}) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    if (vertical && ay < Math.max(ax, az)) { const t = u; u = v; v = t; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Rounded box, metre UVs, smooth bevels. */
export function rbox(w, h, d, r = 0.006, seg = 2, uvOpts) {
  const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  // thin trims and tiny radii read the same with a single chamfer segment (≈ 1/3 of the triangles)
  const s = (rr <= 0.0045 || Math.min(w, h, d) < 0.04) ? 1 : seg;
  return uvBox(new RoundedBoxGeometry(w, h, d, s, rr), uvOpts);
}

/** Plain box with metre UVs (flat faces). */
export function box(w, h, d, uvOpts) { return uvBox(new THREE.BoxGeometry(w, h, d), uvOpts); }

/** Cylinder with metre UVs (u around, v along y; caps planar). */
export function cyl(rTop, rBot, h, seg = 24, open = false, { vertical = false } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv, p = g.attributes.position, n = g.attributes.normal;
  const R = Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (vertical) uv.setXY(i, p.getY(i), uv.getX(i) * Math.PI * 2 * R);
    else uv.setXY(i, uv.getX(i) * Math.PI * 2 * R, p.getY(i));
  }
  return g;
}

/** Lathe from [r, y] pairs listed bottom → top (outward normals), metre UVs. swapUV → grain along the profile. */
export function lathe(points, seg = 40, { swapUV = false, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  let len = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); cum.push(len); }
  const maxR = Math.max(...points.map(p => p[0]), 1e-3);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const s = Math.round(uv.getX(i) * seg), j = Math.round(uv.getY(i) * (pts.length - 1));
    const u = (s / seg) * phiLength * maxR, v = cum[j] ?? 0;
    if (swapUV) uv.setXY(i, v, u); else uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}

/** Tube along points (Vector3[]), with metre UVs along its length. */
export function tube(points, r, seg = 24, radial = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, r, radial, closed);
  const L = curve.getLength();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * Math.PI * 2 * r, uv.getX(i) * L);
  return g;
}

/** Flat plane in XY facing +z; with rect, UVs map into that atlas rect [u0,v0,u1,v1]. */
export function plane(w, h, rect = null) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rect) mapUV(g, rect);
  return g;
}
/** Remap a geometry's 0..1 UVs into rect. */
export function mapUV(g, rect) {
  g.userData.atlas = true;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(rect[0], rect[2], uv.getX(i)), lerp(rect[1], rect[3], uv.getY(i)));
  return g;
}
/** Set every UV to one point (solid colour from an atlas swatch). */
export function solidUV(g, pt) {
  g.userData.atlas = true;
  const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pt[0], pt[1]);
  g.setAttribute('uv', uv);
  return g;
}

/**
 * Collects geometries per material key; bakes transforms; keeps position/normal/uv (+color);
 * returns handles so items can later be found (raycast faceIndex) or recoloured (vertex range).
 */
export class Batch {
  /** atlasKeys: batch keys whose material samples the shared atlas — geometry without atlas UVs gets the white texel. */
  constructor(atlasKeys = [], whiteUV = [0, 0]) { this.parts = new Map(); this.meshes = new Map(); this.atlasKeys = new Set(atlasKeys); this.whiteUV = whiteUV; }
  /** color: hex / THREE.Color / [r,g,b] (linear multiplier, may exceed 1 for glow). Returns a handle. */
  add(key, geo, matrix = null, color = null) {
    const needWhite = this.atlasKeys.has(key) && !geo.userData.atlas;
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (needWhite) solidUV(g, this.whiteUV);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (color !== null && color !== undefined) setColor(g, color);
    if (!this.parts.has(key)) this.parts.set(key, []);
    const list = this.parts.get(key);
    const handle = { key, index: list.length, start: 0, count: n, mesh: null };
    list.push({ g, handle });
    return handle;
  }
  /** Merge every key into a Mesh (materials: {key: material}; keys with vertexColors materials get colour). */
  build(materials, parent) {
    const out = [];
    for (const [key, list] of this.parts) {
      const mat = materials[key]; if (!mat) { console.warn('[fixtures] no material for batch key', key); continue; }
      const wantColor = !!mat.vertexColors;
      let off = 0;
      for (const { g, handle } of list) {
        if (wantColor && !g.attributes.color) setColor(g, 0xffffff);
        if (!wantColor && g.attributes.color) g.deleteAttribute('color');
        handle.start = off; off += g.attributes.position.count;
      }
      const geo = mergeGeometries(list.map(x => x.g), false);
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'fixtures:' + key; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.castShadow = true; mesh.receiveShadow = true;
      for (const { handle } of list) handle.mesh = mesh;
      this.meshes.set(key, mesh);
      if (parent) parent.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

const _c = new THREE.Color();
function toColor(color) {
  if (Array.isArray(color)) return _c.setRGB(color[0], color[1], color[2]);
  if (color && color.isColor) return _c.copy(color);
  return _c.set(color);
}
export function setColor(g, color) {
  const c = toColor(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** Recolour a batch handle after build (vertex colour range). mul keeps any baked shading ratio. */
export function recolor(handle, color, shade = null) {
  if (!handle || !handle.mesh) return;
  const attr = handle.mesh.geometry.attributes.color; if (!attr) return;
  const c = toColor(color).clone();
  for (let i = handle.start; i < handle.start + handle.count; i++) {
    const k = shade ? shade[i - handle.start] : 1;
    attr.setXYZ(i, c.r * k, c.g * k, c.b * k);
  }
  attr.needsUpdate = true;
}
/**
 * Hide (on = true) / restore a batch handle's triangles by collapsing its vertex range onto one point — how a
 * merged item (a pair of sunglasses) leaves its stand without a mesh of its own. Uploads only that range.
 */
export function collapse(handle, on) {
  if (!handle || !handle.mesh) return;
  const a = handle.mesh.geometry.attributes.position, s = handle.start * 3, n = handle.count * 3;
  if (!handle.orig) handle.orig = a.array.slice(s, s + n);
  const o = handle.orig;
  for (let i = 0; i < n; i++) a.array[s + i] = on ? o[i % 3] : o[i];
  if (a.addUpdateRange) { a.clearUpdateRanges(); a.addUpdateRange(s, n); }
  a.needsUpdate = true;
}

/**
 * Prism from a footprint polygon: pts = [[x, z], …] (counter-clockwise seen from above, local metres),
 * extruded from y0 to y1. Flat sides, caps top and bottom.
 */
export function prismXZ(pts, y0, y1, bevel = 0) {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(sh, bevel
    ? { depth: y1 - y0 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 1 }
    : { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);   // shape (x, −z) → footprint; extrusion → +y
  g.translate(0, y0 + bevel, 0);
  return g;
}

/**
 * Soft blob shadows merged into ONE mesh. The material has exactly the shape of kit.contactShadow's
 * (MeshBasic + map + transparent, no vertex colours) so it compiles to the SAME program every other module's
 * contact shadows use; per-blob strength comes from a 2×2 cell texture (4 pre-scaled blob strengths).
 */
const SHADOW_LEVELS = [0.68, 0.55, 0.44, 0.33];
let _shadowCells = null;
function shadowCells(kit) {
  if (_shadowCells) return _shadowCells;
  _shadowCells = kit.canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    SHADOW_LEVELS.forEach((a, i) => {
      const cx = (i % 2) * 128 + 64, cy = Math.floor(i / 2) * 128 + 64;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 62);
      grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(0.45, `rgba(0,0,0,${a * 0.55})`);
      grd.addColorStop(0.75, `rgba(0,0,0,${a * 0.18})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(cx - 64, cy - 64, 128, 128);
    });
  }, { srgb: false });
  _shadowCells.anisotropy = 1;
  return _shadowCells;
}
export class ShadowBatch {
  constructor(kit) { this.kit = kit; this.quads = []; }
  /** x,y,z centre (y = surface height), w,d footprint, rotY, opacity (0.3 … 0.7) */
  add(x, y, z, w, d, rotY = 0, opacity = 0.5) { this.quads.push([x, y + 0.0015, z, w, d, rotY, opacity]); return this; }
  mesh(name) {
    const n = this.quads.length; if (!n) return null;
    const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    const corners = [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];
    this.quads.forEach(([x, y, z, w, d, r, o], q) => {
      let li = 0, best = 9; SHADOW_LEVELS.forEach((a, i) => { if (Math.abs(a - o) < best) { best = Math.abs(a - o); li = i; } });
      const cu = (li % 2) * 0.5, cv = 0.5 - Math.floor(li / 2) * 0.5; // canvas y down → v up
      const c = Math.cos(r), s = Math.sin(r);
      corners.forEach(([cx, cz, u, v], k) => {
        const lx = cx * w, lz = cz * d;
        pos.set([x + lx * c + lz * s, y, z - lx * s + lz * c], (q * 4 + k) * 3);
        uv.set([cu + (0.01 + u * 0.48), cv + (0.01 + v * 0.48)], (q * 4 + k) * 2);
      });
      const b = q * 4; idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.MeshBasicMaterial({ map: shadowCells(this.kit), color: 0x000000, transparent: true, opacity: 1, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.name = 'contactShadow';
    const mesh = new THREE.Mesh(g, m); mesh.name = name || 'fixtures:shadows'; mesh.renderOrder = 1;
    mesh.raycast = () => {}; mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/**
 * Invisible hit volumes for taps: plain Object3Ds with an oriented-box raycast — not meshes, so they cost
 * no draw call AND no shader program (renderer.compile() prepares every Mesh's material, visible or not).
 */
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _unit = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)), _hit = new THREE.Vector3();
function boxRaycast(raycaster, intersects) {
  _inv.copy(this.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inv);
  if (!_ray.intersectBox(_unit, _hit)) return;
  _hit.applyMatrix4(this.matrixWorld);
  const d = raycaster.ray.origin.distanceTo(_hit);
  if (d < raycaster.near || d > raycaster.far) return;
  intersects.push({ distance: d, point: _hit.clone(), object: this, face: null, faceIndex: null });
}
export class Proxies {
  constructor(parent, interact) {
    this.group = new THREE.Group(); this.group.name = 'fixtures:proxies'; parent.add(this.group);
    this.interact = interact;
  }
  /** Box proxy: centre [x,y,z], size [w,h,d], rotY. Returns the proxy object. */
  box(c, s, rotY, info) {
    const m = new THREE.Object3D(); m.name = 'fixtures:hit';
    m.position.fromArray(c); m.scale.fromArray(s); m.rotation.y = rotY || 0;
    m.raycast = boxRaycast;
    this.group.add(m); m.updateMatrixWorld(true); m.matrixAutoUpdate = false;
    this.interact.add(m, info);
    return m;
  }
}

/** Copy the library material's patch hooks onto a clone (keeps its shader patches + program key). */
export function cloneLib(src, extra = {}) {
  const m = src.clone();
  if (src.onBeforeCompile) m.onBeforeCompile = src.onBeforeCompile;
  if (src.customProgramCacheKey) m.customProgramCacheKey = src.customProgramCacheKey;
  m.userData = { ...src.userData };
  Object.assign(m, extra);
  if (extra.vertexColors !== undefined) m.needsUpdate = true;
  return m;
}
