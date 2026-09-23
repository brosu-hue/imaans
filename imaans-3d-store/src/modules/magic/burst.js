// Pooled tap bursts (ring + rising sparkles) and object shimmers. One THREE.Points ring buffer; a burst
// writes only its own slots (addUpdateRange) — the only per-frame buffer upload in the magic module,
// and only on the frame something is tapped. Idle → the Points object is hidden (0 draw calls).
import * as THREE from 'three';
import { KIND } from './shader.js';
import { Buf, GOLD } from './systems.js';

const _g = new THREE.Color(), _box = new THREE.Box3(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _min = new THREE.Vector3(0.12, 0.12, 0.12);
const GOLDS = [GOLD.light, GOLD.mid, GOLD.white, GOLD.light].map(h => new THREE.Color(h));

/** Any colour input → a glowing (normalised, lifted) linear colour. Dark swatches become light sparkles. */
function glowColor(input, out) {
  try { out.set(input ?? GOLD.light); } catch (e) { out.set(GOLD.light); }
  const luma = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  out.lerp(_g.setRGB(1, 1, 1), 0.3 * (1 - Math.min(1, luma * 1.6)));   // lift dark swatches only; gold stays gold
  const m = Math.max(out.r, out.g, out.b, 1e-3);
  return out.multiplyScalar(1 / m);
}

export function createBursts(ctx, material, { size = 640, r }) {
  const buf = new Buf(size);
  for (let i = 0; i < size; i++) buf.push([0, -50, 0], [0, 0, -100, 1], [0, 0, 0, KIND.spark], [0, 0, 0]);
  const geo = buf.geometry({ dynamic: true });
  const points = new THREE.Points(geo, material);
  points.name = 'magic:bursts';
  points.frustumCulled = false; points.visible = false; points.renderOrder = 5;
  points.raycast = () => {};
  const P = geo.attributes.position, A = geo.attributes.aA, B = geo.attributes.aB, C = geo.attributes.aColor;
  let head = 0, aliveUntil = -1, first = -1, written = 0;

  function begin() { first = head; written = 0; }
  function put(p, a, b, c) {
    const i = head; head = (head + 1) % size; written++;
    P.array.set(p, i * 3); A.array.set(a, i * 4); B.array.set(b, i * 4); C.array.set(c, i * 3);
  }
  function end(until) {
    if (!written) return;
    const n = Math.min(written, size);
    const ranges = first + n <= size ? [[first, n]] : [[first, size - first], [0, first + n - size]];
    for (const at of [[P, 3], [A, 4], [B, 4], [C, 3]]) {
      for (const [s, k] of ranges) at[0].addUpdateRange(s * at[1], k * at[1]);
      at[0].needsUpdate = true;
    }
    aliveUntil = Math.max(aliveUntil, until);
    points.visible = true;
  }

  const U = material.uniforms;
  const cam = ctx.camera;
  /** flash + ring + rising sparkles at `point`. opts {color, count, age (dev: pre-age the burst, s)} */
  function burst(point, opts = {}) {
    if (!point) return;
    const age = opts.age || 0, now = U.uTime.value - age;
    const magic = U.uMagic.value;
    const col = glowColor(opts.color, new THREE.Color());
    const px = point.x, py = point.y, pz = point.z;
    // keep the burst a similar size on screen whether the tap was 1 m or 6 m away
    const k = THREE.MathUtils.clamp(cam.position.distanceTo(point) / 2.6, 0.6, 2.2);
    const nSpark = Math.max(14, Math.min(size >> 1, Math.round(Math.min(200, opts.count ?? 40) * (0.55 + 0.45 * magic) * (ctx.tier === 'low' ? 0.8 : 1))));
    const nRing = Math.round(THREE.MathUtils.clamp(14 + nSpark * 0.25, 16, 30)), ringR = (0.16 + Math.min(0.14, nSpark / 800)) * k;
    begin();
    put([px, py, pz], [r(), 0.34 * k, now, 0.55], [0, 0, 0, KIND.flash], [col.r * 0.5 + 0.25, col.g * 0.5 + 0.2, col.b * 0.5 + 0.1]);
    for (let i = 0; i < nRing; i++) {
      const cc = i % 3 === 0 ? GOLDS[i & 3] : col;
      const a = (i / nRing) * Math.PI * 2 + r() * 0.15, rr = ringR * (0.94 + r() * 0.12);
      put([px, py, pz], [r(), r.range(0.04, 0.06) * k, now, r.range(0.8, 1.05)], [Math.cos(a) * rr, Math.sin(a) * rr, 0, KIND.ring], [cc.r * 2.0, cc.g * 2.0, cc.b * 2.0]);
    }
    for (let i = 0; i < nSpark; i++) {
      const cc = r() < 0.4 ? GOLDS[i & 3] : col;
      const a = r() * Math.PI * 2, sp = r.range(0.35, 1.0) * Math.sqrt(k), up = r.range(0.35, 1.0);
      const life = r.range(1.2, 2.2), b = r.range(1.4, 2.2);
      put([px + (r() - 0.5) * 0.04, py + (r() - 0.5) * 0.04, pz + (r() - 0.5) * 0.04],
        [r(), (r() < 0.3 ? r.range(0.055, 0.085) : r.range(0.03, 0.05)) * Math.sqrt(k), now + r() * 0.1, life],
        [Math.cos(a) * sp * 0.6, up * sp, Math.sin(a) * sp * 0.6, KIND.spark], [cc.r * b, cc.g * b, cc.b * b]);
    }
    end(now + 2.4 + age);
  }

  /** short shimmer over an object's bounds. opts {color, count} */
  function sparkle(object, opts = {}) {
    if (!object) return;
    try { object.updateWorldMatrix(true, true); _box.setFromObject(object); } catch (e) { return; }
    if (_box.isEmpty()) return;
    _box.getCenter(_v); _box.getSize(_s);
    // clamp huge merged meshes to a sensible shimmer volume around their centre
    _s.set(Math.min(_s.x, 2.4), Math.min(_s.y, 2.4), Math.min(_s.z, 2.4)).max(_min);
    const now = U.uTime.value;
    const count = Math.round(Math.max(10, Math.min(120, opts.count ?? (24 + 30 * Math.min(1, (_s.x + _s.y + _s.z) / 3)))) * (0.5 + 0.5 * U.uMagic.value));
    const col = opts.color != null ? glowColor(opts.color, new THREE.Color()) : null;
    const areas = [_s.y * _s.z, _s.x * _s.z, _s.x * _s.y], at = areas[0] + areas[1] + areas[2];
    begin();
    for (let i = 0; i < count; i++) {
      // random point on the box surface (area-weighted face)
      let u = r() * at, axis = 0; while (axis < 2 && u > areas[axis]) { u -= areas[axis]; axis++; }
      const p = [(r() - 0.5) * _s.x, (r() - 0.5) * _s.y, (r() - 0.5) * _s.z];
      p[axis] = (r() < 0.5 ? -0.5 : 0.5) * [_s.x, _s.y, _s.z][axis] * 1.04;
      p[0] += _v.x; p[1] += _v.y; p[2] += _v.z;
      const cc = col && r() < 0.6 ? col : GOLDS[i & 3], k = r.range(1.4, 2.2);
      put(p, [r(), r.range(0.03, 0.06), now + r() * 0.55, r.range(0.7, 1.3)], [0, r.range(0.04, 0.14), 0, KIND.sparkle], [cc.r * k, cc.g * k, cc.b * k]);
    }
    end(now + 2.0);
  }

  function update(t) { if (points.visible && t > aliveUntil) points.visible = false; }
  return { points, burst, sparkle, update };
}
