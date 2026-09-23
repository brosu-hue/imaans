// fixtures — geometry helpers, a merge-by-material batcher with item ranges, merged contact shadows,
// cheap hit proxies. Owner: fixtures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DEG = Math.PI / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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
 * Reeded (fluted) cylinder band: convex half-round reeds around the circumference.
 * rBot/rTop = radius at the reed bottoms (valley), reed depth d, n reeds, k samples per reed.
 * UV: vertical grain (u = y, v = arc) for oak.
 */
export function reededCylinder(rBot, rTop, y0, y1, n = 24, d = 0.012, k = 6) {
  const N = n * k; const pos = [], uv = [], idx = [];
  const rows = [[y0, rBot], [y1, rTop]];
  for (let row = 0; row < 2; row++) {
    const [y, R] = rows[row];
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const s = 2 * ((i % k) / k) - 1; const r = R + d * Math.sqrt(Math.max(0, 1 - s * s));
      pos.push(Math.cos(th) * r, y, -Math.sin(th) * r);
      uv.push(y, th * R);
    }
  }
  for (let i = 0; i < N; i++) { const a = i, b = i + 1, c = N + 1 + i, e = N + 2 + i; idx.push(a, b, e, a, e, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals(); // smooth reed shading from the actual geometry (seam duplicated → tiny crease)
  return g;
}

/**
 * Reeded flat panel in XY (width w along x centred, height h from y=0), reeds bulge toward +z.
 * pitch = reed width, d = depth. Vertical grain UVs.
 */
export function reededPanel(w, h, pitch = 0.032, d = 0.009, k = 6) {
  const n = Math.max(1, Math.round(w / pitch)); const p = w / n; const N = n * k;
  const pos = [], uv = [], idx = [];
  for (let row = 0; row < 2; row++) {
    const y = row ? h : 0;
    for (let i = 0; i <= N; i++) {
      const x = -w / 2 + (i / N) * w; const ph = (i % k) / k; const s = 2 * ph - 1;
      const z = d * Math.sqrt(Math.max(0, 1 - s * s));
      pos.push(x, y, z); uv.push(y, x);
    }
  }
  for (let i = 0; i < N; i++) { const a = i, b = i + 1, c = N + 1 + i, e = N + 2 + i; idx.push(a, b, e, a, e, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Arched frame outline (flat, XY): rectangle w × h whose top is a semicircle; returns THREE.Shape. */
export function archShape(w, h, inset = 0) {
  const r = w / 2 - inset, x0 = -r, x1 = r, yTop = h - w / 2; const s = new THREE.Shape();
  s.moveTo(x0, inset); s.lineTo(x1, inset); s.lineTo(x1, yTop);
  s.absarc(0, yTop, r, 0, Math.PI, false); s.lineTo(x0, inset);
  return s;
}

/** Planar UVs in metres for an extruded/flat XY geometry (u = x, v = y). */
export function uvXY(g, sx = 1, sy = 1, ox = 0, oy = 0) {
  const p = g.attributes.position; const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { a[i * 2] = (p.getX(i) + ox) * sx; a[i * 2 + 1] = (p.getY(i) + oy) * sy; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
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
/** Vertical colour gradient (y-based) — e.g. baked darkening toward a surface. */
export function gradeColor(g, fn) {
  const p = g.attributes.position; const c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const k = fn(p.getX(i), p.getY(i), p.getZ(i)); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
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
/** Snapshot of a handle's per-vertex luminance ratio relative to its first colour (to preserve grading). */
export function shadeOf(handle) {
  const attr = handle.mesh.geometry.attributes.color; const out = new Float32Array(handle.count);
  let ref = 0; for (let i = 0; i < handle.count; i++) ref = Math.max(ref, attr.getX(handle.start + i) + attr.getY(handle.start + i) + attr.getZ(handle.start + i));
  for (let i = 0; i < handle.count; i++) { const j = handle.start + i; out[i] = (attr.getX(j) + attr.getY(j) + attr.getZ(j)) / (ref || 1); }
  return out;
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
