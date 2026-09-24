// Module: ui — IMAANS HUD (DOM overlay), controls, tour / go-to / glide, product card, bag + WhatsApp
// order, the website's info pages, loader, credits. Draws nothing in WebGL (0 draw calls).
//
// ctx.ui is replaced in setup():  toast(msg) · showCard(info, hit) · hideCard() · setLoading(f, label)
//   · addToBag(items, hit) · openBag() · showInfo(slug)   — see CONTRACT.md / INTEGRATION.md
// ctx.fonts.display / .sans are set in setup() and the webfonts are awaited (≤ 2.5 s) before any build().
// Interactables: info.onTap(hit) is called on every tap; the card opens when the info has a title or
// subtitle, unless onTap returns false. A card shows "Add to bag" when info.price is set (and
// info.buyable !== false); info.actions render as extra buttons; colorways[i].apply(hit) on swatch tap;
// info.priceLabel (optional) is a small caption over the price (e.g. "Look total · 3 pieces" on look cards).
import * as THREE from 'three';
import { loadFonts, STACKS } from './ui/fonts.js';
import { createHud, store, MAGIC_KEY } from './ui/hud.js';
import { createBag } from './ui/bag.js';
import { createNav, orientTo } from './ui/nav.js';
import { createControls } from './ui/controls.js';

const PITCH_MAX = 55 * Math.PI / 180;
const GOLD = '#ffd58a', AQUA = '#8ff3ff';

export async function setup(ctx) {
  hardenViewport(ctx);
  const fontsP = loadFonts();
  // canvas signage drawn by other modules in build() uses these (the faces are awaited at the end of setup)
  ctx.fonts = Object.assign(ctx.fonts || {}, { display: STACKS.display, sans: STACKS.sans, heading: STACKS.head });
  const bag = createBag(ctx);
  const handlers = {
    bag,
    onTour: () => (nav.active && nav.kind === 'tour' ? stopFlight('user') : startTour()),
    onGoto: (h) => goTo(h),
    onMagic: (v) => { try { ctx.fx.setMagic(v); } catch (e) { console.warn('[ui] setMagic', e); } },
    onSwatch: (hit, c) => {
      if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: c && c.swatch ? c.swatch : GOLD, count: 26 });
      else if (hit && hit.object && !hit.object.isInstancedMesh) ctx.fx.sparkle(hit.object);
    },
    onSend: () => {
      const p = new THREE.Vector3(0, -0.15, -1.3).applyMatrix4(ctx.camera.matrixWorld);
      ctx.fx.burst(p, { color: GOLD, count: 160 });
      hud.toast('Opening WhatsApp — we will confirm sizes and stock');
    },
    burst: (point, o) => ctx.fx.burst(point.clone ? point.clone() : point, o),
    project: (point) => {
      const v = new THREE.Vector3().copy(point); ctx.camera.updateMatrixWorld(); v.project(ctx.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null;
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
    },
    departments: () => departments(ctx, handlers.hotspots()),
    hotspots: () => ctx.hotspots.list.filter(h => h && Array.isArray(h.pos)),
    nearestHotspot: () => {
      let best = null, bd = 1.2; const p = ctx.camera.position;
      for (const h of ctx.hotspots.list) { if (!h || !h.pos) continue; const d = Math.hypot(h.pos[0] - p.x, h.pos[2] - p.z); if (d < bd) { bd = d; best = h; } }
      return best;
    },
    onCredits: () => loadCredits().then(html => hud.setCredits(html)),
    onRevealed: () => {
      if (ctx.shotMode) return;
      setTimeout(() => hud.showHint(), 150);
      if (hud.touchUI || innerWidth < 900) setTimeout(() => hud.flashAnnouncement(), 900);
      // the bag self-heals on load (sold-out / removed products): say what went, like the website does
      if (bag.initialRemoved.length) setTimeout(() => hud.toast(bag.initialRemoved[0] + (bag.initialRemoved.length > 1 ? ` (+${bag.initialRemoved.length - 1} more)` : '') + ' — removed from your bag'), 1200);
    },
  };
  const hud = createHud(ctx, handlers);
  const nav = createNav(ctx);
  // Tour stops + Go to targets are data (layout.TOUR / layout.GOTO): the 10 stops of the owner's old store
  // and one or more targets per department, framed on the real fixtures. Display modules add no hotspots.
  for (const h of [...(ctx.layout.TOUR || []), ...(ctx.layout.GOTO || [])]) ctx.hotspots.add({ ...h });

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  raycaster.far = 18; raycaster.params.Points.threshold = 0.04; raycaster.params.Line.threshold = 0.02;
  const ndc = new THREE.Vector2();
  const visibleChain = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  function rayAt(x, y) {
    const r = ctx.renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ctx.camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, ctx.camera);
    return raycaster;
  }
  function pick(x, y) {
    const items = ctx.interact.items; if (!items.length) return null;
    const hits = rayAt(x, y).intersectObjects(items, true);
    for (const h of hits) {
      if (!visibleChain(h.object)) continue;
      let r = null; try { r = ctx.interact.infoFor(h); } catch (e) { console.warn('[ui] info', e); }
      if (r && r.info) return { hit: h, owner: r.owner, info: r.info };
    }
    return null;
  }
  // desktop hover → pointer cursor over interactables (throttled; backs off if raycasts get slow)
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let hoverT = 0, hoverGap = 110, hoverPending = null;
  function hover(x, y) {
    if (!canHover || nav.active) return;
    hoverPending = [x, y];
    const now = performance.now(); if (now - hoverT < hoverGap) return;
    hoverT = now; const [hx, hy] = hoverPending; hoverPending = null;
    const t0 = performance.now(); const res = pick(hx, hy); const ms = performance.now() - t0;
    hoverGap = ms > 30 ? 1e9 : ms > 12 ? 350 : 110;
    ctx.renderer.domElement.style.cursor = res ? 'pointer' : 'grab';
  }

  // ---------------------------------------------------------------- flights
  const curPose = () => ({ x: controls.pose.pos.x, y: controls.pose.pos.y, z: controls.pose.pos.z, yaw: controls.pose.yaw, pitch: controls.pose.pitch });
  function poseOf(h) {
    const pos = h.pos, look = Array.isArray(h.look) ? h.look : [pos[0], pos[1], pos[2] - 1];
    return { x: pos[0], y: pos[1] ?? ctx.layout.EYE, z: pos[2], ...orientTo(pos, look, PITCH_MAX) };
  }
  function stopFlight(reason) { if (nav.active) nav.stop(reason); }
  function startTour() {
    const all = handlers.hotspots(), tourList = all.filter(h => h.tour);
    const list = tourList.length ? tourList : all;
    if (!list.length) { hud.toast('The tour is still being rehearsed — try again in a moment'); return; }
    stopFlight('replaced');
    hud.hideCard(); hud.closeSheets(); hud.dismissHint();
    const cur = curPose();
    const stops = list.map((h, i) => {
      const to = poseOf(h);
      const here = i === 0 && Math.hypot(to.x - cur.x, to.z - cur.z) < 0.8;
      return { to, label: h.label || h.id, hold: here ? 1.8 : 3.0, stop: h };
    });
    const n = stops.length, lbl = (i) => `Tour · ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    nav.start('tour', cur, stops, {
      onLeg: (i, leg) => hud.caption(lbl(i), leg.label, i / n),
      onArrive: (i, leg) => {
        hud.caption(lbl(i), leg.label, (i + 0.8) / n);
        const h = leg.stop; if (h && Array.isArray(h.look)) ctx.fx.burst(new THREE.Vector3().fromArray(h.look), { color: GOLD, count: 28 });
      },
      onFrame: (p) => hud.captionProgress(p),
      onDone: (completed) => {
        hud.setTourState(false);
        hud.caption(null);
        if (completed) hud.toast('That’s the tour — the floor is yours');
      },
    });
    hud.setTourState(true);
  }
  function goTo(h) {
    stopFlight('replaced');
    const label = h.label || h.id;
    nav.start('goto', curPose(), [{ to: poseOf(h), label, hold: 0, stop: h }], {
      onLeg: () => hud.caption('Heading to', label),
      onArrive: () => hud.caption('You are at', label, null, 2400),
      onDone: (completed) => { if (!completed) hud.caption(null); },
    });
  }
  function glideTo(x, y) {
    const rc = rayAt(x, y), o = rc.ray.origin, d = rc.ray.direction;
    if (d.y > -0.03) return;
    const t = -o.y / d.y; if (t > 12) return;
    const px = o.x + d.x * t, pz = o.z + d.z * t;
    const [sx, sz] = nav.settle(px, pz);
    const cur = curPose();
    if (Math.hypot(sx - cur.x, sz - cur.z) < 0.3) return;
    ctx.fx.burst(new THREE.Vector3(px, 0.05, pz), { color: AQUA, count: 22 });
    stopFlight('replaced');
    nav.start('glide', cur, [{ to: { x: sx, y: ctx.layout.EYE, z: sz, yaw: cur.yaw, pitch: cur.pitch }, keepLook: true, hold: 0 }], {});
  }

  // ---------------------------------------------------------------- keep the tapped piece in view
  // The card covers the lower half of a phone (the right side in landscape / on desktop): when the tapped
  // point would sit under it, the view turns gently so the piece lands in the middle of the free area.
  const aimCam = new THREE.PerspectiveCamera();
  function frameAbove(point) {
    if (!point || !hud.cardOpen || nav.active || ctx.shotMode) return;
    const card = hud.el.card, W = innerWidth, H = innerHeight;
    const cl = card.offsetLeft, ct = card.offsetTop, cw = card.offsetWidth, ch = card.offsetHeight;
    if (!cw || !ch) return;
    const top = hud.el.bagBtn.getBoundingClientRect().bottom + 10;
    const side = cl > W * 0.3;                             // side card (landscape phones, desktop)
    const fx0 = 0, fx1 = side ? cl - 8 : W, fy0 = top, fy1 = side ? H : ct - 8;
    if (fx1 - fx0 < 120 || fy1 - fy0 < 110) return;
    const at = (yaw, pitch) => {
      aimCam.fov = ctx.camera.fov; aimCam.aspect = ctx.camera.aspect; aimCam.near = ctx.camera.near; aimCam.far = ctx.camera.far;
      aimCam.updateProjectionMatrix(); aimCam.position.copy(ctx.camera.position); aimCam.rotation.set(pitch, yaw, 0, 'YXZ'); aimCam.updateMatrixWorld();
      const v = point.clone().project(aimCam); return v.z < 1 ? [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H] : null;
    };
    const p0 = controls.pose, s0 = at(p0.yaw, p0.pitch); if (!s0) return;
    const mx = 24, my = 30;
    if (s0[0] > fx0 + mx && s0[0] < fx1 - mx && s0[1] > fy0 + my && s0[1] < fy1 - my) return;   // already clear
    const gx = side ? (fx0 + fx1) / 2 : Math.max(fx0 + mx * 2, Math.min(fx1 - mx * 2, s0[0]));
    const gy = side ? Math.max(fy0 + my * 2, Math.min(fy1 - my * 2, s0[1])) : (fy0 + fy1) / 2;
    // solve yaw/pitch so the point projects at (gx, gy): a few small-angle corrections converge
    const tanV = Math.tan(ctx.camera.fov * Math.PI / 360), tanH = tanV * ctx.camera.aspect;
    let yaw = p0.yaw, pitch = p0.pitch;
    for (let k = 0; k < 4; k++) {
      const s = at(yaw, pitch); if (!s) return;
      const ex = (s[0] - gx) / W * 2, ey = (gy - s[1]) / H * 2;   // ndc error (+x: too far right, +y: too high)
      yaw -= Math.atan(ex * tanH); pitch += Math.atan(ey * tanV);   // turning right moves it left, looking up moves it down
      pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    }
    const d = Math.abs(yaw - p0.yaw) + Math.abs(pitch - p0.pitch);
    if (d < 0.01 || d > 1.4) return;
    controls.aim(yaw, pitch, hud.reduced ? 0 : 0.65);
  }

  const api = {
    userActivity: () => { if (hud.hintOn) hud.dismissHint(); },
    stopFlight, pick, hover, glideTo,
    onPick(res, x, y) {
      hud.ripple(x, y, true);
      const { info, hit } = res;
      let show = true;
      if (typeof info.onTap === 'function') { try { if (info.onTap(hit) === false) show = false; } catch (e) { console.warn('[ui] onTap', e); } }
      if (show && (info.title || info.subtitle)) { ctx.ui.showCard(info, hit); if (hit && hit.point) frameAbove(hit.point); }
      if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: GOLD, count: 14 });
    },
    onMiss() { if (hud.cardOpen) hud.hideCard(); },
    escape() { if (hud.sheetOpen) hud.closeSheets(); else if (hud.cardOpen) hud.hideCard(); else stopFlight('user'); },
    shift: () => false,
  };
  const controls = createControls(ctx, hud, nav, api);
  ctx.onUpdate((dt) => controls.update(dt));

  // ---------------------------------------------------------------- credits (lazy, once)
  let creditsP = null;
  function loadCredits() {
    if (creditsP) return creditsP;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const section = (t) => `<li style="border:0;padding:12px 0 2px"><small style="letter-spacing:.2em;text-transform:uppercase">${t}</small></li>`;
    creditsP = (async () => {
      let html = '';
      try {
        // exactly the models that ship: the build's manifest lists them (`shipped`); dev → the ones loaded +
        // the boot prefetch list. Derived files credit their original (manifest.credits[id].from), own work is
        // listed as such, and each credit says what it is in the store.
        const man = (await ctx.assets.manifest()) || {};
        const models = man.models || {}, cr = man.credits || {};
        const ids = Array.isArray(man.shipped) ? man.shipped
          : [...new Set([...ctx.assets.requested(), ...Object.values(window.__PREFETCH__ || {}).flat()])];
        const rows = new Map();   // credit text → notes
        for (const id of ids) {
          const c = cr[id] || {}, src = c.from ? models[c.from] : models[id];
          const text = c.own || (src && src.credit);
          if (!text) continue;
          if (!rows.has(text)) rows.set(text, new Set());
          if (c.note) rows.get(text).add(c.note);
        }
        const list = [...rows].sort((a, b) => (a[0].includes('own work') ? 1 : 0) - (b[0].includes('own work') ? 1 : 0));
        if (list.length) html += section('3D models') + list.map(([t, notes]) => `<li>${esc(t)}${notes.size ? `<br><small>${esc([...notes].join(' · '))}</small>` : ''}</li>`).join('');
      } catch (e) { /* manifest optional */ }
      try {
        const r = await fetch(ctx.assets.url('tex/CREDITS.json'));
        if (r.ok) {
          const arr = await r.json(); const groups = new Map();
          for (const t of Array.isArray(arr) ? arr : []) {
            if (!t) continue;
            const k = [t.source, t.license, t.author].filter(Boolean).join(' · ');
            groups.set(k, (groups.get(k) || 0) + 1);
          }
          if (groups.size) html += section('Textures') + [...groups].map(([k, n]) => `<li>${esc(k)} <small>(${n} map${n > 1 ? 's' : ''})</small></li>`).join('');
        }
      } catch (e) { /* optional */ }
      html += section('Products & imagery') + `<li>Product photography, illustrations and copy · ${esc(ctx.brand.legalName || ctx.brand.name)}</li>`;
      html += section('Typefaces') + '<li>Cinzel by Natanael Gama · Marcellus by Astigmatic (Brian J. Bonislawsky) · Jost by indestructible type* (Owen Earl) — SIL Open Font License 1.1</li>';
      html += section('Engine') + `<li>Built with three.js r${esc(THREE.REVISION)} · MIT License</li>`;
      return html;
    })();
    return creditsP;
  }

  // ---------------------------------------------------------------- public ctx.ui
  Object.assign(ctx.ui, {
    toast: (msg) => hud.toast(msg),
    showCard: (info, hit) => hud.showCard(info, hit),
    hideCard: () => hud.hideCard(),
    setLoading: (f, label) => hud.setLoading(f, label),
    /** items: {productId, sizeId?, colourId?, qty?} or an array of them — the website's IS.cart.add(opts) shape. */
    addToBag: (items, hit) => { try { return hud.addItems(items, hit); } catch (e) { console.warn('[ui] addToBag', e); return null; } },
    openBag: () => { hud.hideCard(); hud.openSheet('bag', { force: true }); },
    showInfo: (slug) => { hud.hideCard(); hud.showInfo(slug); },
    bagCount: () => bag.count(),
  });
  ctx.events.addEventListener('assetprogress', (e) => { const d = e.detail || {}; hud.assetProgress(d.loaded || 0, d.total || 0); });
  ctx.events.addEventListener('ready', () => hud.finishLoading());
  ctx.onResize(() => { if (!hud.touchUI) return; hud.joy.hide(); });

  // dev / test hooks (harmless in production)
  window.__ui = { hud, nav, controls, bag, startTour, goTo, stopFlight, pick, poseOf, curPose, loadCredits };

  // hold the build until the typefaces are in (max 2.5 s): the wordmark never flashes a fallback and
  // canvas signage drawn in build() gets the real brand fonts
  const ok = await Promise.race([fontsP, new Promise(r => setTimeout(() => r(null), 2500))]);
  if (ok === null) console.warn('[ui] webfonts still loading after 2.5 s — signage may use fallback fonts');
}

// ------------------------------------------------------------------ departments for "Go to"
// Groups the registered hotspots into the website's departments: by the stop's own `dept` (layout.TOUR /
// layout.GOTO), else the department (layout.DEPARTMENTS) whose zone lies nearest to the point it looks at.
// Names/descriptions from ctx.brand.
const GROUPS = ['welcome', 'shoes', 'clothes', 'accessories', 'checkout', 'around'];
const BY_ID = { entrance: 'welcome', windows: 'welcome' };
function zoneDist(z, x, y) {
  let x0, x1, z0, z1;
  if (Array.isArray(z.x)) { x0 = z.x[0]; x1 = z.x[1]; } else if (typeof z.x === 'number') { x0 = x1 = z.x; }
  if (Array.isArray(z.z)) { z0 = z.z[0]; z1 = z.z[1]; } else if (typeof z.z === 'number') { z0 = z1 = z.z; }
  if (x0 === undefined && typeof z.cx === 'number') {
    const hw = z.r || (z.w ? z.w / 2 : z.axis === 'x' ? (z.len || 1) / 2 : 0.4), hd = z.r || (z.d ? z.d / 2 : z.axis === 'z' ? (z.len || 1) / 2 : 0.4);
    x0 = z.cx - hw; x1 = z.cx + hw; z0 = z.cz - hd; z1 = z.cz + hd;
  }
  if (x0 === undefined || z0 === undefined) return Infinity;
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - y, 0, y - z1));
}
function departments(ctx, stops) {
  const { DEPARTMENTS = {}, ZONES = {} } = ctx.layout;
  const brandDept = (id) => (ctx.brand.departments || []).find(d => d && d.id === id) || null;
  const zoneGroup = [];
  for (const [id, d] of Object.entries(DEPARTMENTS)) for (const zn of d.zones || []) if (ZONES[zn]) zoneGroup.push([zn === 'counter' ? 'checkout' : id === 'windows' ? 'welcome' : id, ZONES[zn]]);
  const bucket = {};
  for (const h of stops) {
    let g = h.dept || BY_ID[h.id];
    if (!g) {
      const pt = Array.isArray(h.look) ? h.look : h.pos;
      let best = Infinity;
      for (const [gid, z] of zoneGroup) { const dd = zoneDist(z, pt[0], pt[2]); if (dd < best) { best = dd; g = gid; } }
      if (best > 3) g = 'welcome';
    }
    (bucket[g] = bucket[g] || []).push(h);
  }
  const nameOf = {
    clothes: (brandDept('clothes') || {}).name || (DEPARTMENTS.clothes || {}).name || 'Clothes',
    shoes: (brandDept('shoes') || {}).name || (DEPARTMENTS.shoes || {}).name || 'Shoes',
    accessories: (brandDept('accessories') || {}).name || (DEPARTMENTS.accessories || {}).name || 'Accessories',
    checkout: 'Checkout', welcome: 'Entrance', around: 'Around the shop',
  };
  const out = [];
  for (const gid of GROUPS.concat(Object.keys(bucket).filter(k => !GROUPS.includes(k)))) {
    const list = bucket[gid]; if (!list || !list.length) continue;
    const name = nameOf[gid] || gid;
    const strip = (l) => String(l || '').replace(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[—–:-]\\s*', 'i'), '');
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const stopsOut = list.map(h => Object.assign(Object.create(h), { short: cap(strip(h.label || h.id)), src: h }));
    const sub = ['clothes', 'shoes', 'accessories'].includes(gid) ? ((brandDept(gid) || {}).description || '')
      : [cap(strip(list[0].label || list[0].id))].filter(l => l && l.toLowerCase() !== name.toLowerCase()).join('');
    out.push({ id: gid, name, sub, stops: stopsOut });
  }
  return out;
}

export async function build(ctx) {
  ctx.group('ui'); // intentionally empty: the ui draws with DOM only (0 draw calls)
}

export async function ready(ctx) {
  // Restore the visitor's magic level (if they changed it before); otherwise mirror the magic
  // module's own default if it exposes one.
  const hud = window.__ui && window.__ui.hud; if (!hud) return;
  const saved = store.get(MAGIC_KEY);
  if (saved !== null && saved !== '' && !isNaN(+saved)) {
    const v = Math.max(0, Math.min(1, +saved / 100)); hud.setMagicValue(v);
    try { ctx.fx.setMagic(v); } catch (e) { /* magic optional */ }
  } else {
    let v = null;
    try { v = typeof ctx.fx.getMagic === 'function' ? ctx.fx.getMagic() : (typeof ctx.fx.magic === 'number' ? ctx.fx.magic : (typeof ctx.fx.level === 'number' ? ctx.fx.level : null)); } catch (e) { v = null; }
    if (typeof v === 'number' && isFinite(v)) hud.setMagicValue(Math.max(0, Math.min(1, v)));
  }
}

/** iOS Safari: no pinch-zoom, no rubber-band scroll of the page, no double-tap zoom — scoped to the store
 *  (canvas container + HUD) so the Imaan's website keeps normal scrolling when the store is embedded. */
function hardenViewport(ctx) {
  document.documentElement.classList.add('me-ui'); // hides the CSS-only pre-loader in page.html
  let embedded = false; try { embedded = !!(window.IS && window.IS.router); } catch (e) { /* */ }
  const m = document.querySelector('meta[name="viewport"]');
  if (!embedded && m && !/maximum-scale/.test(m.content)) m.setAttribute('content', m.content + ', maximum-scale=1, user-scalable=no');
  const canvas = ctx.renderer.domElement;
  const inStore = (t) => {
    if (!t || !t.closest) return false;
    const host = canvas.parentNode;
    return t === canvas || !!t.closest('#me-ui') || (host && host !== document.body && host.contains(t)) || (!embedded && host === document.body);
  };
  const stop = (e) => { if (inStore(e.target)) e.preventDefault(); };
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => {
    const t = e.target;
    if (!inStore(t)) return;
    if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
    if (t && t.closest && t.closest('.me-scroll, .me-card-bd, input')) return;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('orientationchange', () => { if (!embedded) setTimeout(() => window.scrollTo(0, 0), 300); });
}
