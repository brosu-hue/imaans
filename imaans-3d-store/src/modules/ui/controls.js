// First-person controls for phones and desktops.
//  touch  : floating joystick where the left thumb lands (lower-left), drag elsewhere to look,
//           tap = interact (press < 250 ms, travel < 8 px), double-tap floor = glide there.
//  desktop: WASD / arrows (+Shift), ← → turn, drag to look, click = interact, wheel = small step.
// Collision via ctx.colliders.resolve every frame; eye height layout.EYE with a very subtle head-bob.
import * as THREE from 'three';
import { wrapAngle } from './nav.js';

const DEG = Math.PI / 180;
const PITCH_MAX = 55 * DEG;
const WALK = 1.4, RUN = 2.6;           // m/s
const TAP_MS = 250, TAP_PX = 8;
const JOY_R = 46;                      // knob travel (px)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createControls(ctx, hud, nav, api) {
  const { camera, renderer, layout } = ctx;
  const canvas = renderer.domElement;
  const EYE = layout.EYE;
  const reduced = hud.reduced;

  camera.rotation.order = 'YXZ';
  const P = new THREE.Vector3();           // logical eye position (no bob)
  const pose = { pos: P, yaw: 0, pitch: 0 };
  const vel = new THREE.Vector3(), tgt = new THREE.Vector3(), prev = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let needSync = true;
  function syncFromCamera() {
    P.copy(camera.position);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    pose.yaw = euler.y; pose.pitch = clamp(euler.x, -PITCH_MAX, PITCH_MAX);
    vel.set(0, 0, 0); inYaw = inPitch = 0; wheelAcc = 0;
  }
  ctx.events.addEventListener('camset', () => { needSync = true; });

  // ---------------------------------------------------------------- input state
  const keys = new Set();
  let inYaw = 0, inPitch = 0;                 // look inertia (rad/s)
  let wheelAcc = 0;
  let joyVec = { x: 0, y: 0 }, joyActive = false;
  const pointers = new Map();                 // pointerId → {role, x0,y0,x,y,t0,travel, ox,oy, lastT, vYaw, vPitch}
  let lookId = null, joyId = null;
  let lastMiss = null;
  let aimT = null;                             // {y0,p0,dy,dp,t,dur}: a gentle re-aim (product framed above its card)
  // Event timestamps (not handler time): a slow frame between down and up must not turn a tap into a drag.
  const evTime = (e) => (e && e.timeStamp > 0 && Math.abs(e.timeStamp - performance.now()) < 60000 ? e.timeStamp : performance.now());
  const lookGain = () => 1.9 / Math.max(320, Math.min(innerWidth, innerHeight));

  function inJoyZone(x, y) {
    const W = innerWidth, H = innerHeight;
    if (W > H) return x < W * 0.45 && y > H * 0.3;
    return x < W * 0.5 && y > H * 0.42;
  }

  function onDown(e) {
    if (!ctx.controlsEnabled) return;
    api.userActivity(e.pointerType === 'touch' ? 'touch' : 'mouse');
    if (nav.active && nav.kind !== 'glide') api.stopFlight('user');
    const ts = evTime(e);
    const p = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: ts, travel: 0,
      role: null, lastT: ts, vYaw: 0, vPitch: 0, ox: 0, oy: 0, shown: false };
    if (e.pointerType === 'touch' && joyId === null && inJoyZone(e.clientX, e.clientY)) {
      p.role = 'joy'; joyId = e.pointerId;
      p.ox = clamp(e.clientX, 70, innerWidth - 70); p.oy = clamp(e.clientY, 70, innerHeight - 70);
    } else if (lookId === null) {
      p.role = 'look'; lookId = e.pointerId; inYaw = inPitch = 0; aimT = null;
      if (e.pointerType === 'mouse') canvas.style.cursor = 'grabbing';
    }
    pointers.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse' && !e.buttons) api.hover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.travel = Math.max(p.travel, Math.hypot(p.x - p.x0, p.y - p.y0));
    const now = evTime(e);
    if (p.role === 'look') {
      if (p.travel < 4) return;
      if (nav.active && nav.kind !== 'glide') api.stopFlight('user');
      const k = lookGain();
      const dYaw = dx * k, dPitch = dy * k * 0.85;
      pose.yaw = wrapAngle(pose.yaw + dYaw);
      pose.pitch = clamp(pose.pitch + dPitch, -PITCH_MAX, PITCH_MAX);
      const dt = Math.max(1, now - p.lastT) / 1000;
      p.vYaw = p.vYaw * 0.5 + (dYaw / dt) * 0.5; p.vPitch = p.vPitch * 0.5 + (dPitch / dt) * 0.5;
      p.lastT = now;
    } else if (p.role === 'joy') {
      if (!p.shown && (p.travel > 5 || now - p.t0 > 140)) { p.shown = true; hud.joy.show(p.ox, p.oy); }
      let jx = p.x - p.ox, jy = p.y - p.oy; const m = Math.hypot(jx, jy);
      // "follow" stick: drag past the rim and the base trails the thumb
      if (m > JOY_R * 1.35) { const s = (m - JOY_R * 1.35) / m; p.ox += jx * s; p.oy += jy * s; jx = p.x - p.ox; jy = p.y - p.oy; if (p.shown) hud.joy.move(p.ox, p.oy); }
      const mm = Math.hypot(jx, jy), cl = Math.min(1, JOY_R / Math.max(mm, 1e-6));
      if (p.shown) hud.joy.knob(jx * cl, jy * cl);
      let vx = (jx * cl) / JOY_R, vy = -(jy * cl) / JOY_R;
      const mag = Math.hypot(vx, vy), dz = 0.14;
      if (mag < dz) { vx = vy = 0; } else { const s = (mag - dz) / (1 - dz) / mag; vx *= s; vy *= s; }
      joyVec.x = vx; joyVec.y = vy; joyActive = true;
      if (mag > dz && nav.active) api.stopFlight('user');
    }
  }
  function onUp(e, cancelled) {
    const p = pointers.get(e.pointerId); if (!p) return;
    pointers.delete(e.pointerId);
    const now = evTime(e);
    if (p.role === 'look') {
      lookId = null;
      // light inertia: a flick coasts ~10–20°, a slow drag stops dead
      if (now - p.lastT < 70 && p.travel > 12) { inYaw = clamp(p.vYaw * 0.5, -2.6, 2.6); inPitch = clamp(p.vPitch * 0.3, -1.2, 1.2); }
      if (p.type === 'mouse') canvas.style.cursor = 'grab';
    } else if (p.role === 'joy') {
      joyId = null; joyVec.x = joyVec.y = 0; joyActive = false; hud.joy.hide();
    }
    if (!cancelled && now - p.t0 < TAP_MS && p.travel < TAP_PX) tap(e.clientX, e.clientY, now);
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', (e) => onUp(e, false));
  canvas.addEventListener('pointercancel', (e) => onUp(e, true));
  canvas.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) onUp(e, true); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!ctx.controlsEnabled) return;
    e.preventDefault();
    api.userActivity('wheel');
    if (nav.active) api.stopFlight('user');
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    wheelAcc = clamp(wheelAcc - Math.sign(d) * Math.min(1, Math.abs(d) / 100) * 0.35, -1.4, 1.4);
  }, { passive: false });
  if (!ctx.isMobile) canvas.style.cursor = 'grab';

  function tap(x, y, now) {
    const res = api.pick(x, y);
    if (res) { lastMiss = null; api.onPick(res, x, y); return; }
    hud.ripple(x, y, false);
    if (lastMiss && now - lastMiss.t < 380 && Math.hypot(x - lastMiss.x, y - lastMiss.y) < 44) { lastMiss = null; api.glideTo(x, y); return; }
    lastMiss = { t: now, x, y };
    api.onMiss();
  }

  // ---------------------------------------------------------------- keyboard
  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE']);
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Escape') { api.escape(); return; }
    if (!ctx.controlsEnabled || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Shift') { keys.add(e.code); return; }
    if (MOVE_KEYS.has(e.code)) {
      if (t && t.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
      keys.add(e.code); e.preventDefault();
      api.userActivity('key');
      if (nav.active) api.stopFlight('user');
    }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  window.addEventListener('blur', () => { keys.clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); for (const id of [...pointers.keys()]) onUp({ pointerId: id }, true); } });

  // ---------------------------------------------------------------- per frame
  let bobPhase = 0, bobAmp = 0, spdS = 0;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function update(dt) {
    if (!ctx.controlsEnabled) { needSync = true; return; }
    if (needSync) { syncFromCamera(); needSync = false; }
    prev.copy(P);
    const flying = nav.active && nav.step(dt, pose);
    if (aimT && (flying || lookId !== null)) aimT = null;
    if (aimT) {
      aimT.t += dt; const u = Math.min(1, aimT.t / aimT.dur), e = u * u * (3 - 2 * u);
      pose.yaw = wrapAngle(aimT.y0 + aimT.dy * e); pose.pitch = clamp(aimT.p0 + aimT.dp * e, -PITCH_MAX, PITCH_MAX);
      if (u >= 1) aimT = null;
    }
    if (!flying) {
      const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw);
      fwd.set(-sy, 0, -cy); right.set(cy, 0, -sy);
      let mz = 0, mx = 0, turn = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
      if (keys.has('KeyD')) mx += 1;
      if (keys.has('KeyA')) mx -= 1;
      if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn += 1;
      if (keys.has('ArrowRight') || keys.has('KeyE')) turn -= 1;
      if (joyActive) { mx += joyVec.x; mz += joyVec.y; }
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? RUN : WALK;
      tgt.set(0, 0, 0).addScaledVector(fwd, mz * speed).addScaledVector(right, mx * speed);
      const accel = tgt.lengthSq() > vel.lengthSq() ? 0.2 : 0.14;
      vel.lerp(tgt, 1 - Math.exp(-dt / accel));
      if (vel.lengthSq() < 1e-6 && tgt.lengthSq() === 0) vel.set(0, 0, 0);
      P.addScaledVector(vel, dt);
      if (turn) pose.yaw = wrapAngle(pose.yaw + turn * 1.9 * dt);
      if (Math.abs(wheelAcc) > 1e-4) { const m = wheelAcc * (1 - Math.exp(-dt / 0.12)); wheelAcc -= m; P.addScaledVector(fwd, m); }
      P.y += (EYE - P.y) * (1 - Math.exp(-dt / 0.35));
    }
    // look inertia
    if (lookId === null && (inYaw || inPitch)) {
      pose.yaw = wrapAngle(pose.yaw + inYaw * dt); pose.pitch = clamp(pose.pitch + inPitch * dt, -PITCH_MAX, PITCH_MAX);
      const k = Math.exp(-dt / 0.12); inYaw *= k; inPitch *= k;
      if (Math.abs(inYaw) < 0.01) inYaw = 0; if (Math.abs(inPitch) < 0.01) inPitch = 0;
    }
    ctx.colliders.resolve(P);
    // head-bob from the real (post-collision) ground speed
    const spd = dt > 0 ? Math.hypot(P.x - prev.x, P.z - prev.z) / dt : 0;
    spdS += (Math.min(spd, 3) - spdS) * (1 - Math.exp(-dt / 0.12));
    if (!flying) {
      if (Math.abs(vel.x) + Math.abs(vel.z) > 0.01) { const blocked = Math.min(1, spd / Math.max(0.01, vel.length())); if (blocked < 0.5) vel.multiplyScalar(0.9); }
      const target = reduced ? 0 : 0.0075 * clamp(spdS / WALK, 0, 1.25);
      bobAmp += (target - bobAmp) * (1 - Math.exp(-dt / 0.25));
      bobPhase += dt * spdS * 8.3;
    } else bobAmp *= Math.exp(-dt / 0.2);
    camera.position.set(P.x, P.y + Math.sin(bobPhase) * bobAmp, P.z);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
  }

  return {
    update, pose, vel,
    get moving() { return spdS > 0.05; },
    get joyActive() { return joyActive; },
    keys, pointers,
    resync() { needSync = true; },
    /** turn the view to yaw/pitch over `dur` s (0 = cut); cancelled by a look drag or a flight */
    aim(yaw, pitch, dur = 0.6) {
      if (needSync) { syncFromCamera(); needSync = false; }
      pitch = clamp(pitch, -PITCH_MAX, PITCH_MAX);
      if (!(dur > 0)) { aimT = null; pose.yaw = wrapAngle(yaw); pose.pitch = pitch; return; }
      inYaw = inPitch = 0;
      aimT = { y0: pose.yaw, p0: pose.pitch, dy: wrapAngle(yaw - pose.yaw), dp: pitch - pose.pitch, t: 0, dur };
    },
    get aiming() { return !!aimT; },
  };
}
