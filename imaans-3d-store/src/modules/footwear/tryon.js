// footwear — "Try it on": a shelf shoe (one InstancedMesh instance) floats out towards the viewer, turns
// once, and settles back. Only active animations cost anything per frame.
import * as THREE from 'three';

const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function createTryOn(ctx) {
  const active = [];
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const qSpin = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function start(mesh, index, { followers = [], dur = 3.0, color = '#ffd58a', onDone = null } = {}) {
    if (active.some(a => a.mesh === mesh && a.index === index)) return false;
    const base = new THREE.Matrix4(); mesh.getMatrixAt(index, base);
    const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3();
    base.decompose(p0, q0, s0);
    // out: towards the viewer (horizontal), a little up, and a touch towards eye height
    const cam = ctx.camera.position;
    const dir = tmp.set(cam.x - p0.x, 0, cam.z - p0.z); const dist = dir.length() || 1; dir.divideScalar(dist);
    const reach = Math.min(0.55, 0.22 + dist * 0.08);
    const out = new THREE.Vector3(dir.x * reach, 0.13 + (cam.y - 0.15 - p0.y) * 0.18, dir.z * reach);
    const tiltAxis = new THREE.Vector3(-dir.z, 0, dir.x);  // tip the toe box towards the viewer a little
    active.push({ mesh, index, base, p0, q0, s0, out, tiltAxis, followers, t: 0, dur, color, burst2: false, onDone });
    ctx.fx.burst(p0.clone().add(new THREE.Vector3(0, 0.08, 0)), { color, count: 36 });
    return true;
  }

  function write(a, matrix) {
    a.mesh.setMatrixAt(a.index, matrix); a.mesh.instanceMatrix.needsUpdate = true;
    for (const f of a.followers) { f.mesh.setMatrixAt(f.index, matrix); f.mesh.instanceMatrix.needsUpdate = true; }
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.t += dt;
      const u = a.t / a.dur;
      if (u >= 1) { write(a, a.base); active.splice(i, 1); if (a.onDone) a.onDone(); continue; }
      const k = u < 0.22 ? ease(u / 0.22) : u < 0.8 ? 1 : 1 - ease((u - 0.8) / 0.2);
      const spin = ease((u - 0.2) / 0.62) * Math.PI * 2;
      pos.copy(a.p0).addScaledVector(a.out, k);
      pos.y += Math.sin(a.t * 5.2) * 0.006 * k;
      qSpin.setFromAxisAngle(Y, spin);
      qTilt.setFromAxisAngle(axis.copy(a.tiltAxis), -0.22 * k);
      quat.copy(qTilt).multiply(qSpin).multiply(a.q0);
      scl.copy(a.s0).multiplyScalar(1 + 0.1 * k);
      write(a, m4.compose(pos, quat, scl));
      if (!a.burst2 && u > 0.5) { a.burst2 = true; ctx.fx.burst(pos.clone().add(tmp.set(0, 0.06, 0)), { color: '#f6dd8c', count: 24 }); }
    }
  }

  function isActive(mesh, index) { return active.some(a => a.mesh === mesh && a.index === index); }
  return { start, update, isActive, get busy() { return active.length > 0; } };
}
