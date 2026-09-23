// Camera flights for the Tour, "Go to" and double-tap glide.
// Paths never pass through furniture: a coarse occupancy grid is built from ctx.colliders (lazily,
// rebuilt when the collider count changes), A* finds a route, string-pulling shortens it, and a
// centripetal Catmull-Rom curve through the remaining waypoints gives the smooth, eased flight.
import * as THREE from 'three';

const CELL = 0.2;          // grid resolution (m)
const MARGIN = 0.07;       // extra clearance beyond the player radius
const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/** yaw / pitch of a camera at `pos` looking at `look` (yaw 0 = looking toward -z). */
export function orientTo(pos, look, pitchMax) {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(dy, Math.hypot(dx, dz)), -pitchMax, pitchMax) };
}

export function createNav(ctx, opts) {
  const { layout, colliders } = ctx;
  const ROOM = layout.ROOM;
  const R = (layout.PLAYER_RADIUS || 0.28) + MARGIN;
  // walkable rectangle — mirrors the clamp in colliders.resolve()
  const WX0 = ROOM.minX + 0.35 + R - MARGIN, WX1 = ROOM.maxX - 0.35 - R + MARGIN;
  const WZ0 = ROOM.minZ + 0.6 + R - MARGIN, WZ1 = ROOM.maxZ - 0.35 - R + MARGIN;
  const NX = Math.ceil((ROOM.maxX - ROOM.minX) / CELL), NZ = Math.ceil((ROOM.maxZ - ROOM.minZ) / CELL);
  let grid = null, gridKey = '';

  function blockedAt(x, z, r = R) {
    if (x < WX0 || x > WX1 || z < WZ0 || z > WZ1) return true;
    for (const c of colliders.circles) { const dx = x - c.x, dz = z - c.z, m = c.r + r; if (dx * dx + dz * dz < m * m) return true; }
    for (const b of colliders.boxes) {
      const dx = x - b.cx, dz = z - b.cz;
      const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
      const ox = Math.max(0, Math.abs(lx) - b.hw), oz = Math.max(0, Math.abs(lz) - b.hd);
      if (ox * ox + oz * oz < r * r) return true;
    }
    return false;
  }
  function ensureGrid() {
    const key = colliders.circles.length + ':' + colliders.boxes.length;
    if (grid && key === gridKey) return grid;
    gridKey = key; grid = new Uint8Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) grid[j * NX + i] = blockedAt(cx(i), cz(j)) ? 1 : 0;
    return grid;
  }
  const cx = (i) => ROOM.minX + (i + 0.5) * CELL, cz = (j) => ROOM.minZ + (j + 0.5) * CELL;
  const ci = (x) => clamp(Math.floor((x - ROOM.minX) / CELL), 0, NX - 1), cj = (z) => clamp(Math.floor((z - ROOM.minZ) / CELL), 0, NZ - 1);

  function nearestFree(i, j) {
    const g = ensureGrid();
    if (!g[j * NX + i]) return [i, j];
    for (let rad = 1; rad < 40; rad++) {
      let best = null, bd = 1e9;
      for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ || g[b * NX + a]) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) return best;
    }
    return [i, j];
  }

  /** Straight segment clear of obstacles? (sampled every 8 cm) */
  function clearLine(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.08));
    for (let k = 1; k < n; k++) { const t = k / n; if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t, R - 0.03)) return false; }
    return true;
  }

  /** A* on the grid (8-connected, no corner cutting). Returns [[x,z],…] from a to b, or null. */
  function astar(ax, az, bx, bz) {
    const g = ensureGrid();
    const [si, sj] = nearestFree(ci(ax), cj(az)), [gi, gj] = nearestFree(ci(bx), cj(bz));
    const N = NX * NZ, start = sj * NX + si, goal = gj * NX + gi;
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], fs = [];
    const push = (n, f) => { heap.push(n); fs.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (fs[p] <= fs[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [fs[p], fs[k]] = [fs[k], fs[p]]; k = p; } };
    const pop = () => {
      const top = heap[0], ln = heap.pop(), lf = fs.pop();
      if (heap.length) { heap[0] = ln; fs[0] = lf; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && fs[l] < fs[m]) m = l; if (r < heap.length && fs[r] < fs[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [fs[m], fs[k]] = [fs[k], fs[m]]; k = m; } }
      return top;
    };
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    gs[start] = 0; push(start, h(si, sj));
    let found = false, iter = 0;
    while (heap.length && iter++ < N) {
      const n = pop(); if (closed[n]) continue; closed[n] = 1;
      if (n === goal) { found = true; break; }
      const i = n % NX, j = (n / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        const m = b * NX + a; if (g[m] || closed[m]) continue;
        if (di && dj && (g[j * NX + a] || g[b * NX + i])) continue;
        const ng = gs[n] + (di && dj ? Math.SQRT2 : 1);
        if (ng < gs[m]) { gs[m] = ng; came[m] = n; push(m, ng + h(a, b)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let n = goal; n !== -1; n = came[n]) cells.push(n);
    cells.reverse();
    const pts = cells.map(n => [cx(n % NX), cz((n / NX) | 0)]);
    pts[0] = [ax, az]; pts[pts.length - 1] = [bx, bz];
    // string pulling: keep only the farthest visible point each time
    const out = [pts[0]]; let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (clearLine(pts[k][0], pts[k][1], pts[m][0], pts[m][1])) { far = m; break; }
      out.push(pts[far]); k = far;
    }
    return out;
  }

  /** Free position closest to (x,z), as the walking controller would settle there. */
  function settle(x, z) {
    const v = new THREE.Vector3(x, 0, z); colliders.resolve(v);
    if (!blockedAt(v.x, v.z, R - MARGIN - 0.01)) return [v.x, v.z];
    const [i, j] = nearestFree(ci(x), cj(z)); return [cx(i), cz(j)];
  }

  function route(ax, az, bx, bz) {
    if (clearLine(ax, az, bx, bz)) return [[ax, az], [bx, bz]];
    return astar(ax, az, bx, bz) || [[ax, az], [bx, bz]];
  }

  // ---------------------------------------------------------------------------------------------
  // Flight playback
  // ---------------------------------------------------------------------------------------------
  let flight = null;
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();

  /** One leg from pose a {x,y,z,yaw,pitch} to pose b; opts {kind, hold, crane, lookAhead, keepLook} */
  function makeLeg(a, b, o = {}) {
    const [bx, bz] = o.exact ? [b.x, b.z] : settle(b.x, b.z);
    const pts = route(a.x, a.z, bx, bz).map(([x, z]) => new THREE.Vector3(x, 0, z));
    let curve = null, L = 0;
    if (pts.length >= 2) {
      // drop near-duplicate points (they break centripetal parametrisation)
      const clean = [pts[0]]; for (const p of pts.slice(1)) if (p.distanceTo(clean[clean.length - 1]) > 0.05) clean.push(p);
      if (clean.length === 1) clean.push(clean[0].clone().add(new THREE.Vector3(0.001, 0, 0)));
      curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5);
      curve.arcLengthDivisions = 120;
      L = curve.getLength();
    }
    const dYaw = o.keepLook ? 0 : wrapAngle(b.yaw - a.yaw);
    const turnT = Math.abs(dYaw) * 0.55;
    const dur = o.dur ?? clamp((o.kind === 'glide' ? 0.5 + L / 2.1 : 1.5 + L / 1.75) + (o.kind === 'glide' ? 0 : turnT), o.kind === 'glide' ? 0.7 : 2.0, 9);
    return { curve, L, a: { ...a }, b: { ...b, x: bx, z: bz }, dYaw, dur, hold: o.hold || 0, crane: o.crane ?? clamp(L * 0.028, 0, 0.3),
      lookAhead: o.lookAhead ?? clamp((L - 3) / 7, 0, 0.55), keepLook: !!o.keepLook, label: o.label, stop: o.stop };
  }

  /**
   * Start a flight: legs = [{to:{x,y,z,yaw,pitch}, label, hold, keepLook, kind}], from = current pose.
   * cb: {onLeg(i, leg), onArrive(i, leg), onDone(completed), onFrame(progress)}
   */
  function start(kind, from, stops, cb = {}) {
    const legs = []; let a = { ...from };
    for (const s of stops) { const leg = makeLeg(a, s.to, { kind, hold: s.hold, keepLook: s.keepLook, label: s.label, stop: s.stop, exact: s.exact }); legs.push(leg); a = { ...leg.b }; }
    flight = { kind, legs, i: 0, t: 0, phase: 'move', cb };
    if (cb.onLeg) cb.onLeg(0, legs[0]);
    return flight;
  }

  function stop(reason) {
    if (!flight) return;
    const f = flight; flight = null;
    if (f.cb.onDone) f.cb.onDone(reason === 'done', reason);
  }

  /** Advance; writes pose {pos:Vector3, yaw, pitch}. Returns true while flying. */
  function step(dt, pose) {
    const f = flight; if (!f) return false;
    const leg = f.legs[f.i];
    f.t += dt;
    if (f.phase === 'move') {
      const u = clamp(f.t / leg.dur, 0, 1), e = smooth(u);
      if (leg.curve) {
        leg.curve.getPointAt(e, tmp);
        pose.pos.x = tmp.x; pose.pos.z = tmp.z;
      }
      pose.pos.y = leg.a.y + (leg.b.y - leg.a.y) * e + leg.crane * Math.sin(Math.PI * e);
      if (!leg.keepLook) {
        const eo = smooth(clamp(u / 0.88, 0, 1));
        let yaw = leg.a.yaw + leg.dYaw * eo;
        if (leg.lookAhead > 0 && leg.curve && leg.L > 0.5) {
          leg.curve.getTangentAt(clamp(e, 0.001, 0.999), tan);
          const travelYaw = Math.atan2(-tan.x, -tan.z);
          const w = leg.lookAhead * Math.pow(Math.sin(Math.PI * clamp(u / 0.9, 0, 1)), 2);
          yaw += wrapAngle(travelYaw - yaw) * w;
        }
        pose.yaw = yaw;
        pose.pitch = leg.a.pitch + (leg.b.pitch - leg.a.pitch) * eo;
      }
      if (f.cb.onFrame) f.cb.onFrame((f.i + u * 0.8) / f.legs.length);
      if (u >= 1) {
        f.phase = 'hold'; f.t = 0;
        if (f.cb.onArrive) f.cb.onArrive(f.i, leg);
      }
    } else {
      if (f.cb.onFrame) f.cb.onFrame((f.i + 0.8 + 0.2 * clamp(f.t / Math.max(leg.hold, 0.001), 0, 1)) / f.legs.length);
      if (f.t >= leg.hold) {
        if (f.i + 1 >= f.legs.length) { stop('done'); return false; }
        f.i++; f.t = 0; f.phase = 'move';
        const nl = f.legs[f.i];
        // re-anchor the leg on the live pose (the user may have looked around during the hold)
        nl.a.yaw = pose.yaw; nl.a.pitch = pose.pitch; nl.dYaw = nl.keepLook ? 0 : wrapAngle(nl.b.yaw - pose.yaw);
        if (f.cb.onLeg) f.cb.onLeg(f.i, nl);
      }
    }
    return true;
  }

  return {
    start, stop, step, route, settle, blockedAt,
    get active() { return !!flight; },
    get kind() { return flight ? flight.kind : null; },
    get flight() { return flight; },
    rebuild() { grid = null; },
  };
}
