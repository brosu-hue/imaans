// Tap-to-swing for instanced garments. A record is one garment instance plus the instances that ride on
// the same hanger (hook, hanger body, clip hanger, swing tag). On tap the garment swings on its hook —
// a damped pendulum about the rail axis, a twist about the hook and a small tilt along the rail — and its
// neighbours on the run get a smaller, delayed nudge. Only active records are touched per frame (≤ ~6),
// no allocations, matrices restored exactly when the motion ends (~2.6 s).
import * as THREE from 'three';

export function createSwing(ctx) {
  const active = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QL = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  const ONE = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), V = new THREE.Vector3();
  const dirty = new Set();
  let seq = 0;

  function compose(rec, ql) {
    Q.copy(rec.quat).multiply(ql);
    P.copy(rec.pos);
    if (rec.pivot) {   // rotate about a local pivot (e.g. trousers folded over a ring swing about the ring)
      P.add(V.copy(rec.pivot).applyQuaternion(rec.quat)).sub(V.copy(rec.pivot).applyQuaternion(Q));
    }
    M.compose(P, Q, rec.scl);
    rec.mesh.setMatrixAt(rec.id, M); dirty.add(rec.mesh);
    for (let i = 0; i < rec.links.length; i++) {
      const L = rec.links[i];
      M.compose(P, Q, L.scaled ? rec.scl : ONE);
      if (L.offset) M.multiply(L.offset);
      L.mesh.setMatrixAt(L.id, M); dirty.add(L.mesh);
    }
  }

  /** amp 1 = a direct tap; dir = ±1 pushes the along-rail tilt away from the tapped neighbour. */
  function start(rec, { amp = 1, delay = 0, dir = 1 } = {}) {
    if (!rec) return;
    let s = null;
    for (const a of active) if (a.rec === rec) s = a;
    if (s && s.t < 0.35 && s.amp >= amp) return;         // already swinging harder
    if (!s) { s = { rec }; active.push(s); }
    seq++;
    s.t = -delay; s.amp = amp; s.dir = dir;
    s.tw = (seq % 2 ? 1 : -1) * (0.26 + 0.06 * ((seq * 7) % 5) / 4);   // alternate twist direction
  }

  ctx.onUpdate(dt => {
    if (!active.length) return;
    for (let i = active.length - 1; i >= 0; i--) {
      const s = active[i];
      s.t += dt;
      if (s.t < 0) continue;
      const t = s.t, A = s.amp;
      if (t > 2.8) { QL.identity(); compose(s.rec, QL); active.splice(i, 1); continue; }
      const env = Math.exp(-t * 1.5) * Math.min(1, t * 8);             // soft attack, damped decay
      const pend = A * 0.09 * env * Math.sin(t * 4.2);                 // about the rail axis (local z)
      const twist = A * s.tw * env * Math.sin(t * 4.6 + 0.4);          // about the hook (local y)
      const tilt = s.dir * A * 0.11 * env * Math.sin(t * 4.4 + 0.2);   // swing along the rail (local x)
      E.set(tilt, twist, pend); QL.setFromEuler(E);
      compose(s.rec, QL);
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    dirty.clear();
  });

  /** Swing a record and nudge its run neighbours. */
  function tap(rec) {
    start(rec, { amp: 1 });
    const run = rec.run;
    if (!run) return;
    const i = rec.runIdx;
    for (const [d, a, del] of [[1, 0.45, 0.07], [-1, 0.45, 0.07], [2, 0.18, 0.15], [-2, 0.18, 0.15]]) {
      const n = run[i + d];
      if (n) start(n, { amp: a, delay: del, dir: Math.sign(d) });
    }
  }
  return { start, tap, get busy() { return active.length > 0; } };
}
