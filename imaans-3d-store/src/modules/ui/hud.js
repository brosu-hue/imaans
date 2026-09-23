// DOM overlay: loader, IMAANS wordmark, bag button, bottom bar, product card, sheets (Go to / Info / Bag),
// toasts, first-run hint, tour caption, joystick visual, tap ripples and the fly-to-bag flourish.
// All shop copy (names, prices, pages, contact, hours, announcement) comes from ctx.brand / ctx.catalog.
import { ICON, crown } from './icons.js';
import { CSS } from './style.js';
import { createPages, esc, safeUrl } from './pages.js';
import { legacyCents } from './bag.js';

const safeHex = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) || /^(rgb|hsl)a?\([\d\s.,%]+\)$/i.test(String(c || '')) ? c : '#888');
const LOADING_LINES = {
  architecture: 'Raising the walls', footwear: 'Lining up the shoes', apparelRails: 'Steaming the rails',
  apparelDisplay: 'Dressing the mannequins', fixtures: 'Plumping the cushions', magic: 'Summoning the sparkles',
  ui: 'Polishing the glass', ready: 'Opening the doors',
};
const HINT_KEY = 'imaans:hint:v1';
const MAGIC_KEY = 'imaans:magic:v1';
export const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
export { HINT_KEY, MAGIC_KEY };

export function createHud(ctx, handlers) {
  const brand = ctx.brand || {}, cat = ctx.catalog;
  const bag = handlers.bag;
  const money = (c) => cat.formatPrice(c);
  /** A display price: catalogue strings pass through; legacy numbers / foreign-currency strings become Rand. */
  const priceText = (p) => (p === undefined || p === null || p === '' ? '' : typeof p === 'string' && /^R\s?\d/.test(p.trim()) ? p : money(legacyCents(p)));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchUI = ctx.isMobile || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  const pages = createPages(ctx, { touchUI });
  const embedded = () => { try { return !!(window.IS && (window.IS.router || window.IS.cart)); } catch (e) { return false; } };

  const style = document.createElement('style');
  style.id = 'me-ui-css'; style.textContent = CSS;
  document.head.appendChild(style);

  const name = esc(brand.name || ''), line = esc(brand.line || ''), slogan = esc(brand.slogan || ''), ann = esc(brand.announcement || '');
  const root = document.createElement('div');
  root.id = 'me-ui';
  root.className = 'is-loading' + (ctx.tier === 'low' ? ' me-lowfx' : '');
  root.innerHTML = `
  <div class="me-loader me-i" role="progressbar" aria-label="Loading ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <div class="me-ld-crown">${crown('me-cg-ld')}</div>
    <div class="me-ld-word">${name}</div>
    <div class="me-ld-low">
      <div class="me-ld-line"><i></i><span>${line}</span><i></i></div>
      <div class="me-ld-bar"><i></i></div>
      <div class="me-ld-lbl">Opening the doors…</div>
      <div class="me-ld-pct">0%</div>
    </div>
    <div class="me-ld-foot">${slogan ? `<div class="me-ld-slogan">${slogan}</div>` : ''}${ann ? `<div class="me-ld-ann">${ann}</div>` : ''}</div>
  </div>
  <div class="me-top">
    <button class="me-brand glass me-i" data-act="brand" aria-label="${name} ${line} — about the shop">${ICON.crown}<span class="me-word">${name}</span><span class="me-sub">${line}</span></button>
    ${ann ? `<div class="me-annbar" aria-hidden="true"><span>${ann}</span></div>` : ''}
    <button class="me-bagbtn glass me-i" data-act="bag" aria-label="Shopping bag, empty">${ICON.bag}<span class="me-badge" aria-hidden="true">0</span></button>
  </div>
  ${ann ? `<div class="me-annchip" role="note"><span>${ann}</span></div>` : ''}
  <div class="me-toasts" aria-live="polite" aria-atomic="false"></div>
  <div class="me-vh me-sr" aria-live="polite"></div>
  <div class="me-ghost" aria-hidden="true"><i></i></div>
  <div class="me-chip me-hint glass" role="note"></div>
  <div class="me-chip me-cap glass" aria-live="polite"><span class="me-cap-k"></span><span class="me-cap-t"></span><span class="me-cap-p"><i></i></span></div>
  <nav class="me-bar glass me-i" aria-label="Store controls">
    <button class="me-btn" data-act="tour" aria-label="Start guided tour" aria-pressed="false">${ICON.play}<span class="lbl">Tour</span></button>
    <button class="me-btn" data-act="goto" aria-label="Go to a department" aria-haspopup="dialog">${ICON.pin}<span class="lbl">Go to</span></button>
    <span class="me-sep" aria-hidden="true"></span>
    <label class="me-magic" title="Magic">${ICON.magic}<input class="me-range" type="range" min="0" max="100" step="1" value="70" aria-label="Magic intensity"></label>
    <button class="me-btn me-sq" data-act="info" aria-label="Shop information, size guide, delivery, returns and credits" aria-haspopup="dialog">${ICON.info}</button>
  </nav>
  <div class="me-joy" aria-hidden="true"><div class="me-joy-k"></div></div>
  <div class="me-scrim me-i" data-act="close-sheets"></div>
  <section class="me-card me-panel me-i" role="dialog" aria-modal="false" aria-labelledby="me-card-title" aria-hidden="true">
    <div class="me-handle"></div>
    <div class="me-card-hd"><span class="me-tag"></span><button class="me-x" data-act="close-card" aria-label="Close">${ICON.close}</button></div>
    <div class="me-card-bd"></div>
    <div class="me-acts"></div>
  </section>
  <section class="me-sheet me-panel me-i" data-sheet="goto" role="dialog" aria-modal="true" aria-labelledby="me-goto-h" aria-hidden="true">
    <div class="me-handle"></div>
    <div class="me-card-hd"><span class="me-tag">Departments</span><button class="me-x" data-act="close-sheets" aria-label="Close">${ICON.close}</button></div>
    <h2 id="me-goto-h">Where to?</h2>
    <div class="me-scroll"><div class="me-goto-list"></div></div>
  </section>
  <section class="me-sheet me-panel me-i" data-sheet="info" role="dialog" aria-modal="true" aria-labelledby="me-info-h" aria-hidden="true">
    <div class="me-handle"></div>
    <div class="me-card-hd"><button class="me-back" data-act="info-back" aria-label="Back to the info menu">${ICON.back}<span>Info</span></button><span class="me-tag me-info-tag">Info</span><button class="me-x" data-act="close-sheets" aria-label="Close">${ICON.close}</button></div>
    <h2 id="me-info-h" class="me-vh">Info</h2>
    <div class="me-scroll me-info-bd"></div>
  </section>
  <section class="me-sheet me-panel me-i" data-sheet="bag" role="dialog" aria-modal="true" aria-labelledby="me-bag-h" aria-hidden="true">
    <div class="me-handle"></div>
    <div class="me-card-hd"><span class="me-tag">${name}</span><button class="me-x" data-act="close-sheets" aria-label="Close">${ICON.close}</button></div>
    <h2 id="me-bag-h">Your bag <small class="me-bag-n"></small></h2>
    ${ann ? `<p class="me-ann">${ann}</p>` : ''}
    <div class="me-scroll"><ul class="me-bag-list"></ul></div>
    <div class="me-bag-foot"></div>
  </section>`;
  // inside the canvas's container (#app), so the HUD always stacks with the store — also when a website
  // mounts that container in its own stacking context
  const host = ctx.renderer.domElement.parentNode;
  (host && host.nodeType === 1 ? host : document.body).appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  const el = {
    loader: $('.me-loader'), ldBar: $('.me-ld-bar i'), ldLbl: $('.me-ld-lbl'), ldPct: $('.me-ld-pct'),
    bagBtn: $('.me-bagbtn'), badge: $('.me-badge'), toasts: $('.me-toasts'), hint: $('.me-hint'), ghost: $('.me-ghost'), annChip: $('.me-annchip'),
    cap: $('.me-cap'), capK: $('.me-cap-k'), capT: $('.me-cap-t'), capP: $('.me-cap-p i'),
    tourBtn: $('[data-act="tour"]'), range: $('.me-range'), magic: $('.me-magic'), joy: $('.me-joy'), joyK: $('.me-joy-k'),
    scrim: $('.me-scrim'), card: $('.me-card'), cardTag: $('.me-card .me-tag'), cardBd: $('.me-card-bd'), cardActs: $('.me-card .me-acts'),
    gotoList: $('.me-goto-list'), info: $('[data-sheet="info"]'), infoBd: $('.me-info-bd'), infoH: $('#me-info-h'), infoTag: $('.me-info-tag'),
    bagList: $('.me-bag-list'), bagFoot: $('.me-bag-foot'), bagN: $('.me-bag-n'),
  };
  // each phrase is unbreakable, so a narrow phone wraps only at a separator
  const hintParts = touchUI ? ['Drag to look', 'Left thumb to walk', 'Tap anything'] : ['Drag to look', 'WASD to walk', 'Click anything'];
  el.hint.innerHTML = hintParts.map((t, i) => `<span>${t}${i < hintParts.length - 1 ? '<b>·</b>' : ''}</span>`).join('');

  // ------------------------------------------------------------------ loader
  let ldShown = 0, ldModules = 0, ldAssets = 0, ldDone = false, ldFallback = 0;
  function paintLoader() {
    const f = Math.max(ldShown, Math.min(0.97, ldModules * 0.82 + ldAssets * 0.15));
    ldShown = f;
    el.ldBar.style.transform = `scaleX(${f.toFixed(3)})`;
    const pct = Math.round(f * 100); el.ldPct.textContent = pct + '%';
    el.loader.setAttribute('aria-valuenow', String(pct));
  }
  function setLoading(f, label) {
    ldModules = Math.max(0, Math.min(1, +f || 0));
    const l = LOADING_LINES[label] || (label ? 'Setting out the rails' : null);
    if (l) el.ldLbl.textContent = l + '…';
    paintLoader();
    if (ldModules >= 1 && !ldFallback) ldFallback = setTimeout(() => finishLoading(), 20000); // never trap the visitor
  }
  function assetProgress(loaded, total) { if (total > 0) { ldAssets = loaded / total; paintLoader(); } }
  function finishLoading() {
    if (ldDone) return; ldDone = true; clearTimeout(ldFallback);
    ldShown = 1; el.ldBar.style.transform = 'scaleX(1)'; el.ldPct.textContent = '100%';
    setTimeout(() => {
      el.loader.classList.add('is-done');
      root.classList.remove('is-loading');
      setTimeout(() => { el.loader.remove(); if (handlers.onRevealed) handlers.onRevealed(); }, reduced ? 50 : 1050);
    }, reduced ? 0 : 280);
  }
  /** Phones: the announcement slides in under the top row for a few seconds after the doors open. */
  function flashAnnouncement(ms = 6500) {
    if (!el.annChip) return;
    el.annChip.classList.add('is-on');
    setTimeout(() => el.annChip.classList.remove('is-on'), ms);
  }

  // ------------------------------------------------------------------ toasts
  const toastQ = [];
  function toast(msg) {
    if (!msg) return;
    const t = document.createElement('div');
    t.className = 'me-toast glass'; t.setAttribute('role', 'status');
    t.innerHTML = ICON.crown + '<span>' + esc(msg) + '</span>';
    toastQ.push(t);
    while (toastQ.length > 2) { const old = toastQ.shift(); old.remove(); }
    el.toasts.appendChild(t);
    if (el.annChip) el.annChip.classList.remove('is-on');
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-on')));
    setTimeout(() => {
      t.classList.remove('is-on');
      setTimeout(() => { t.remove(); const i = toastQ.indexOf(t); if (i >= 0) toastQ.splice(i, 1); }, 450);
    }, Math.min(5200, 2200 + String(msg).length * 30));
  }

  // ------------------------------------------------------------------ hint + caption
  let hintOn = false;
  function showHint() {
    if (store.get(HINT_KEY)) return;
    hintOn = true; el.hint.classList.add('is-on');
    if (touchUI) el.ghost.classList.add('is-on');
  }
  function dismissHint() {
    if (!hintOn) return; hintOn = false;
    el.hint.classList.remove('is-on'); el.ghost.classList.remove('is-on');
    store.set(HINT_KEY, '1');
  }
  let capTimer = 0;
  function caption(kicker, title, progress, autoHideMs) {
    clearTimeout(capTimer);
    if (kicker === null) { el.cap.classList.remove('is-on'); return; }
    el.capK.textContent = kicker; el.capT.textContent = title || '';
    el.capP.parentNode.style.display = progress === undefined || progress === null ? 'none' : '';
    if (progress !== undefined && progress !== null) el.capP.style.width = (progress * 100).toFixed(1) + '%';
    el.cap.classList.add('is-on');
    if (hintOn) dismissHint();
    if (autoHideMs) capTimer = setTimeout(() => el.cap.classList.remove('is-on'), autoHideMs);
  }
  function captionProgress(p) { el.capP.style.width = (p * 100).toFixed(1) + '%'; }
  function setTourState(on) {
    el.tourBtn.classList.toggle('is-on', on);
    el.tourBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.tourBtn.setAttribute('aria-label', on ? 'Stop the tour' : 'Start guided tour');
    el.tourBtn.innerHTML = (on ? ICON.stop : ICON.play) + `<span class="lbl">${on ? 'Stop' : 'Tour'}</span>`;
  }

  // ------------------------------------------------------------------ joystick + effects
  const joy = {
    show(x, y) { el.joy.style.left = x + 'px'; el.joy.style.top = y + 'px'; el.joyK.style.transform = ''; el.joy.classList.add('is-on'); },
    move(x, y) { el.joy.style.left = x + 'px'; el.joy.style.top = y + 'px'; },
    knob(dx, dy) { el.joyK.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`; },
    hide() { el.joy.classList.remove('is-on'); },
  };
  function ripple(x, y, hit) {
    if (reduced) return;
    const r = document.createElement('div'); r.className = 'me-ripple' + (hit ? ' hit' : '');
    r.style.left = x + 'px'; r.style.top = y + 'px'; root.appendChild(r);
    if (r.animate) r.animate([{ transform: 'scale(.35)', opacity: 0.95 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: hit ? 620 : 480, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => r.remove();
    else setTimeout(() => r.remove(), 500);
  }
  function flyToBag(fromX, fromY, color, done) {
    const b = el.bagBtn.getBoundingClientRect();
    const tx = b.left + b.width / 2, ty = b.top + b.height / 2;
    if (reduced || !Element.prototype.animate) { done(); return; }
    const f = document.createElement('div'); f.className = 'me-fly';
    f.style.background = safeHex(color); root.appendChild(f);
    const mx = fromX + (tx - fromX) * 0.35, my = Math.min(fromY, ty) - Math.max(60, Math.abs(fromY - ty) * 0.35);
    const anim = f.animate([
      { transform: `translate(${fromX}px,${fromY}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${fromX}px,${fromY - 18}px) scale(1.25)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx}px,${ty}px) scale(.35)`, opacity: 0.9 },
    ], { duration: 820, easing: 'cubic-bezier(.45,.05,.3,1)' });
    anim.onfinish = () => { f.remove(); done(); };
  }
  function bump() { el.bagBtn.classList.remove('bump'); void el.bagBtn.offsetWidth; el.bagBtn.classList.add('bump'); }

  // ------------------------------------------------------------------ bag
  let badgeN = -1;
  function renderBadge() {
    const n = bag.count();
    if (n !== badgeN) { badgeN = n; el.badge.textContent = n > 99 ? '99+' : String(n); }
    el.bagBtn.classList.toggle('has', n > 0);
    el.bagBtn.setAttribute('aria-label', n ? `Shopping bag, ${n} item${n > 1 ? 's' : ''}` : 'Shopping bag, empty');
  }
  function renderBag() {
    renderBadge();
    const lines = bag.lines(), n = lines.reduce((a, l) => a + l.qty, 0);
    el.bagN.textContent = n ? `(${n})` : '';
    if (!lines.length) {
      el.bagList.innerHTML = `<li class="me-empty">${ICON.crown}<em>Your bag is empty</em><small>Tap anything in the store and choose “Add to bag”.</small></li>`;
      el.bagFoot.innerHTML = `<div class="me-acts"><button class="me-cta sec" data-act="goto">${ICON.pin}<span>Explore the departments</span></button></div>`;
      return;
    }
    el.bagList.innerHTML = lines.map((l) => {
      const detail = [l.sizeLabel ? (/size/i.test(l.sizeLabel) ? l.sizeLabel : 'Size ' + l.sizeLabel) : '', l.colourLabel].filter(Boolean).join(' · ');
      const ph = l.image ? `<img src="${esc(l.image)}" alt="" decoding="async"${/\.svg(\?|$)/i.test(l.image) ? ' class="svg"' : ''}>` : `<i style="background:${esc(safeHex(l.swatch || '#b08d57'))}"></i>`;
      return `<li class="me-bl" data-id="${esc(l.lineId)}"><span class="me-bl-ph">${ph}</span>
        <span class="me-bl-t"><b>${esc(l.name)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}${l.qty > 1 ? `<small>${esc(money(l.unitCents))} each</small>` : ''}</span>
        <span class="me-bl-p">${esc(money(l.lineCents))}</span>
        <span class="me-qty" role="group" aria-label="Quantity of ${esc(l.name)}"><button data-act="qty" data-d="-1" data-id="${esc(l.lineId)}" aria-label="One fewer">${ICON.minus}</button><output>${l.qty}</output><button data-act="qty" data-d="1" data-id="${esc(l.lineId)}" aria-label="One more">${ICON.plus}</button></span>
        <button class="me-rm" data-act="bag-remove" data-id="${esc(l.lineId)}" aria-label="Remove ${esc(l.name)}">${ICON.close}</button></li>`;
    }).join('');
    for (const img of el.bagList.querySelectorAll('img')) img.addEventListener('error', () => img.remove(), { once: true });
    const url = safeUrl(bag.orderUrl());
    const wa = /^https:\/\/wa\.me\//.test(url);
    el.bagFoot.innerHTML = `<div class="me-total"><small>Total</small><b>${esc(money(bag.totalCents()))}</b></div>
      <div class="me-acts">${url ? `<a class="me-cta pri me-wa" data-act="send" href="${esc(url)}" target="_blank" rel="noopener">${wa ? ICON.whatsapp : ICON.mail}<span>${wa ? 'Send order on WhatsApp' : 'Send order by email'}</span></a>` : ''}
      ${embedded() ? `<a class="me-cta sec" href="#/cart" data-act="site-cart">${ICON.bag}<span>Basket on website</span></a>` : ''}</div>`;
  }
  bag.onChange((removed) => { renderBadge(); if (sheetOpen === 'bag') renderBag(); if (removed && removed.length) toast(removed[0]); });

  function centerOf(node) { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  /** ctx.ui.addToBag: items {productId,sizeId,colourId,qty} (or older info-style objects). from = [x,y] or a DOM node. */
  function addItems(items, hit, from, colour, quiet) {
    const res = bag.add(items);
    if (res.refused.length) {
      const why = { 'sold-out': 'has sold out', size: 'is sold out in that size', unavailable: 'is no longer available', full: 'did not fit — your bag is full' };
      toast(res.refused.length === 1 ? `${res.refused[0]} ${why[res.reasons[0]] || 'is not available right now'}` : `${res.refused.join(', ')} are not available right now`);
    }
    if (!res.added) return res;
    const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
    const first = list[0] || {};
    const p = first.productId ? cat.get(first.productId) : null;
    const col = colour || first.swatch || (p && first.colourId ? ((p.colours || []).find(c => c.id === first.colourId) || {}).swatch : null) || '#d9ab48';
    let xy = null;
    if (from && from.getBoundingClientRect) xy = centerOf(from); else if (Array.isArray(from)) xy = from;
    else if (hit && hit.point && handlers.project) xy = handlers.project(hit.point);
    if (!xy) xy = [innerWidth / 2, innerHeight * 0.55];
    if (hit && hit.point) handlers.burst(hit.point, { color: '#ffd58a', count: 70 });
    const titleOf = (it) => (it.productId && cat.get(it.productId) ? cat.get(it.productId).name : it.title) || 'Your piece';
    const msg = res.lines.length === 1 ? `${titleOf(list.find(it => it.productId === res.lines[0].productId) || first)} — added to your bag` : `${res.added} pieces added to your bag`;
    // from the card's own button the feedback is in place ("✓ Added to bag"): no toast over the framed piece
    flyToBag(xy[0], xy[1], col, () => { renderBadge(); if (sheetOpen === 'bag') renderBag(); bump(); if (quiet) { const sr = root.querySelector('.me-sr'); if (sr) sr.textContent = msg; } else toast(msg); });
    try { window.dispatchEvent(new CustomEvent('imaans:add-to-bag', { detail: { items: res.lines, count: bag.count(), embedded: bag.embedded, source: 'imaans-3d-store' } })); } catch (e) { /* old browsers */ }
    return res;
  }

  // ------------------------------------------------------------------ Back button closes the open panel
  // Standalone only (inside the website its hash router owns history): while a card or sheet is open ONE
  // history entry is pushed, so the phone's Back / swipe-back closes the panel instead of leaving the store.
  // Closing it any other way pops that entry again (a card → sheet swap keeps the same entry).
  let histOn = false, skipPopUntil = 0, histCheck = 0;
  const canHist = () => !embedded() && !ctx.shotMode && !!(window.history && history.pushState);
  function histSync() {
    clearTimeout(histCheck);
    histCheck = setTimeout(() => {
      const open = cardOpen || !!sheetOpen;
      if (open && !histOn && canHist()) { try { history.pushState({ imaansPanel: Date.now() }, ''); histOn = true; } catch (e) { /* sandboxed frame */ } }
      else if (!open && histOn) { histOn = false; skipPopUntil = performance.now() + 700; try { history.back(); } catch (e) { /* */ } }
    }, 0);
  }
  window.addEventListener('popstate', () => {
    if (performance.now() < skipPopUntil) { skipPopUntil = 0; return; }  // our own back()
    if (!histOn) return;
    histOn = false;
    if (sheetOpen) closeSheets(); else if (cardOpen) hideCard();
  });

  // ------------------------------------------------------------------ product card
  let cardOpen = false, cardInfo = null, cardHit = null, cardSwatch = -1, cardSize = -1;
  const swatchMemo = new Map(); // owner uuid (+instance) → chosen colourway index
  const memoKey = (hit, info) => (hit && hit.object ? hit.object.uuid + ':' + (hit.instanceId ?? '') : 'x') + ':' + (info.productId || info.title || '');
  /** [{id?, label, out}] from info.sizeOptions (catalogue) or info.sizes (['XS','M (sold out)'] / [{label, soldOut}]) */
  function sizesOf(info) {
    if (Array.isArray(info.sizeOptions) && info.sizeOptions.length) return info.sizeOptions.filter(Boolean).slice(0, 12).map(z => ({ id: z.id, label: String(z.label ?? ''), out: z.inStock === false }));
    if (!Array.isArray(info.sizes)) return [];
    return info.sizes.filter(v => v !== null && v !== undefined && v !== '').slice(0, 12).map((v) => {
      if (typeof v === 'object') return { id: v.id, label: String(v.label ?? v.name ?? ''), out: !!(v.soldOut || v.out || v.inStock === false) };
      const str = String(v), out = /\((sold[\s-]*out|épuisé|epuise)\)/i.test(str);
      return { label: str.replace(/\s*\((sold[\s-]*out|épuisé|epuise)\)\s*/i, '').trim(), out };
    });
  }
  const colorwaysOf = (info) => (Array.isArray(info.colorways) ? info.colorways.filter(Boolean) : []);
  const buyable = (info) => info.price !== undefined && info.price !== null && info.price !== '' && info.buyable !== false;
  const soldOut = (info) => info.inStock === false || (sizesOf(info).length > 0 && sizesOf(info).every(z => z.out));
  const imgOf = (src) => (src ? cat.imageUrl({ image: src }, ctx.assets.base) : null);
  function photo(src, alt, cls = 'me-ph', fill = '') {
    const u = imgOf(src);
    if (!u) return fill ? `<span class="${cls} is-broken" style="background:${esc(safeHex(fill))}"></span>` : '';
    return `<span class="${cls}${/\.svg(\?|$)/i.test(u) ? ' is-svg' : ''}"${fill ? ` data-fill="${esc(safeHex(fill))}"` : ''}><img src="${esc(u)}" alt="${esc(alt || '')}" decoding="async"></span>`;
  }
  function renderCard(info, hit) {
    const cws = colorwaysOf(info);
    cardSwatch = swatchMemo.has(memoKey(hit, info)) ? swatchMemo.get(memoKey(hit, info)) : (cws.length ? 0 : -1);
    const sizes = sizesOf(info);
    const avail = sizes.map((z, i) => (z.out ? -1 : i)).filter(i => i >= 0);
    cardSize = avail.length === 1 ? avail[0] : -1;    // one size → chosen; otherwise the visitor picks
    const tag = info.tag || '';
    el.cardTag.textContent = tag;
    el.cardTag.classList.toggle('is-sale', /sale/i.test(tag));
    const price = priceText(info.price), was = info.wasPrice ? priceText(info.wasPrice) : '';
    const look = Array.isArray(info.lookItems) ? info.lookItems.filter(Boolean) : [];
    el.cardBd.innerHTML = `
      <div class="me-pc">${look.length ? '' : photo(info.image, info.imageAlt || info.title)}
        <div class="me-pc-t"><h2 class="me-title" id="me-card-title">${esc(info.title || '')}</h2>
          ${price ? `<div class="me-price${was ? ' is-sale' : ''}">${info.priceLabel ? `<small class="me-price-l">${esc(info.priceLabel)}</small>` : ''}<span>${esc(price)}</span>${was ? `<s aria-label="was ${esc(was)}">${esc(was)}</s>` : ''}</div>` : ''}
          ${info.subtitle && !look.length ? `<p class="me-subt">${esc(info.subtitle)}</p>` : ''}</div></div>
      ${look.length ? `<ul class="me-look">${look.map((it, i) => `<li><button class="me-lk-i" data-act="look" data-i="${i}"${it.productId ? '' : ' disabled'}>
          ${photo(it.image, '', 'me-lk-ph', it.swatch || '#d8cbb4')}<span class="t"><b>${esc(it.title || '')}</b>${it.colour || it.inStock === false ? `<small>${esc([it.colour, it.inStock === false ? 'Sold out' : ''].filter(Boolean).join(' · '))}</small>` : ''}</span><span class="p">${esc(priceText(it.price))}</span>${it.productId ? ICON.chevron : ''}</button></li>`).join('')}</ul>` : ''}
      ${cws.length ? `<div class="me-cw"><div class="me-cw-l">Colour — <span class="me-cw-n">${esc(cws[Math.max(0, cardSwatch)].name || '')}</span></div>
        <div class="me-sw" role="radiogroup" aria-label="Colours">${cws.map((c, i) => `<button class="me-swb${i === cardSwatch ? ' is-on' : ''}" role="radio" aria-checked="${i === cardSwatch}" data-act="swatch" data-i="${i}" aria-label="${esc(c.name || 'Colour ' + (i + 1))}"><i style="background:${esc(safeHex(c.swatch))}"></i></button>`).join('')}</div></div>` : ''}
      ${sizes.length ? `<div class="me-cw me-szw"><div class="me-cw-l">Size — <span class="me-sz-l">${cardSize >= 0 ? esc(sizes[cardSize].label) : avail.length ? 'choose yours' : 'sold out'}</span></div>
        <div class="me-sz" role="radiogroup" aria-label="Sizes">${sizes.map((z, i) => `<button class="me-szb${i === cardSize ? ' is-on' : ''}${z.out ? ' out' : ''}" role="radio" aria-checked="${i === cardSize}"${z.out ? ' aria-disabled="true"' : ''} data-act="size" data-i="${i}" aria-label="Size ${esc(z.label)}${z.out ? ', sold out' : ''}">${esc(z.label)}</button>`).join('')}</div></div>` : ''}
      ${info.subtitle && look.length && !look.every(it => it.title && String(info.subtitle).includes(it.title)) ? `<p class="me-subt">${esc(info.subtitle)}</p>` : ''}`;
    for (const img of el.cardBd.querySelectorAll('img')) img.addEventListener('error', () => { const s = img.parentNode; if (s) { s.classList.add('is-broken'); if (s.dataset.fill) s.style.background = s.dataset.fill; } img.remove(); }, { once: true });
    const acts = Array.isArray(info.actions) ? info.actions.filter(a => a && a.label) : [];
    let html = '';
    const canBuy = buyable(info);
    if (canBuy) html += soldOut(info) ? `<button class="me-cta pri" data-act="add" aria-disabled="true" disabled><span>Sold out</span></button>` : `<button class="me-cta pri" data-act="add">${ICON.bag}<span>Add to bag</span></button>`;
    acts.forEach((a, i) => { html += `<button class="me-cta ${!canBuy && i === 0 ? 'pri' : 'sec'}" data-act="action" data-i="${i}"><span>${esc(a.label)}</span></button>`; });
    const url = safeUrl(info.url);
    if (url && embedded()) html += `<a class="me-cta sec me-site" href="${esc(url)}" data-act="site"><span>View on website</span>${ICON.link}</a>`;
    el.cardActs.innerHTML = html;
    el.cardActs.style.display = html ? '' : 'none';
    // primary + 2 or more secondary buttons: the primary gets its own row, the others share the next one
    el.cardActs.classList.toggle('is-stack', canBuy && el.cardActs.querySelectorAll('.me-cta.sec').length >= 2);
    el.cardBd.scrollTop = 0; requestAnimationFrame(fades);
    if (!reduced && el.cardBd.animate && cardOpen) el.cardBd.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }
  function showCard(info, hit) {
    if (!info) return;
    closeSheets();
    cardInfo = info; cardHit = hit || null;
    renderCard(info, hit);
    cardOpen = true;
    el.card.classList.add('is-open'); el.card.setAttribute('aria-hidden', 'false'); histSync();
    root.classList.add('is-card');
    if (hintOn) dismissHint();
    if (info.productId) {
      try { window.dispatchEvent(new CustomEvent('imaans:view-product', { detail: { productId: info.productId, slug: info.slug, title: info.title, url: info.url, source: 'imaans-3d-store' } })); } catch (e) { /* */ }
    }
  }
  function hideCard() {
    if (!cardOpen) return;
    cardOpen = false; cardInfo = null; cardHit = null; histSync();
    el.card.classList.remove('is-open'); el.card.setAttribute('aria-hidden', 'true');
    root.classList.remove('is-card');
    if (document.activeElement && el.card.contains(document.activeElement)) document.activeElement.blur();
  }
  function nudgeSizes() {
    const w = el.cardBd.querySelector('.me-szw'); if (!w) return;
    const l = w.querySelector('.me-sz-l'); if (l) l.textContent = 'choose yours';
    w.classList.remove('is-nudge'); void w.offsetWidth; w.classList.add('is-nudge');
    if (w.scrollIntoView) try { w.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { /* */ }
  }
  function addFromCard(btn) {
    const info = cardInfo, hit = cardHit; if (!info) return;
    const cws = colorwaysOf(info), sizes = sizesOf(info);
    if (sizes.length && cardSize < 0) { nudgeSizes(); toast('Choose your size first'); return; }
    const cw = cardSwatch >= 0 ? cws[cardSwatch] : null, sz = cardSize >= 0 ? sizes[cardSize] : null;
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    const item = info.productId
      ? { productId: info.productId, sizeId: sz && sz.id ? sz.id : null, colourId: cw && cw.id ? cw.id : null, qty: 1 }
      : { title: info.title || 'Piece', price: info.price, priceCents: info.priceCents, colour: cw ? cw.name : '', size: sz ? sz.label : '', swatch: cw ? cw.swatch : '', qty: 1 };
    const res = addItems(item, hit, btn, cw ? cw.swatch : null, true);
    // feedback where the thumb is: "Added ✓" for a moment, then the button is ready for another size
    if (res && res.added) {
      clearTimeout(btn._done); btn.classList.add('is-done'); btn.innerHTML = ICON.check + '<span>Added to bag</span>';
      btn._done = setTimeout(() => { if (btn.isConnected) { btn.classList.remove('is-done'); btn.innerHTML = ICON.bag + '<span>Add to bag</span>'; } }, 1700);
    }
  }

  // ------------------------------------------------------------------ sheets
  let sheetOpen = null, sheetReturn = null, infoView = 'menu';
  function openSheet(name, opts = {}) {
    hideCard();
    if (sheetOpen === name && !opts.force) { closeSheets(); return; }
    closeSheets(true);
    if (name === 'goto') renderGoto();
    if (name === 'bag') renderBag();
    if (name === 'info') renderInfo(opts.slug || 'menu');
    requestAnimationFrame(fades);
    const s = root.querySelector(`[data-sheet="${name}"]`); if (!s) return;
    if (!sheetReturn) sheetReturn = document.activeElement;
    sheetOpen = name; histSync();
    s.classList.add('is-open'); s.setAttribute('aria-hidden', 'false');
    el.scrim.classList.add('is-on'); root.classList.add('is-sheet');
    if (hintOn) dismissHint();
    const first = s.querySelector('.me-go, .me-mi, .me-scroll button, .me-x');
    if (first && lastInputKeyboard) first.focus();
  }
  function closeSheets(quiet) {
    if (!sheetOpen) return;
    for (const s of root.querySelectorAll('.me-sheet.is-open')) { s.classList.remove('is-open'); s.setAttribute('aria-hidden', 'true'); }
    sheetOpen = null; histSync();
    if (!quiet) { el.scrim.classList.remove('is-on'); root.classList.remove('is-sheet'); }
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.me-sheet')) document.activeElement.blur();
    if (!quiet) { const r = sheetReturn; sheetReturn = null; if (r && lastInputKeyboard && r.focus && root.contains(r)) r.focus(); }
  }
  // keep keyboard focus inside an open (modal) sheet
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !sheetOpen) return;
    const s = root.querySelector(`[data-sheet="${sheetOpen}"]`); if (!s) return;
    const f = [...s.querySelectorAll('button, [href], input')].filter(n => n.offsetParent !== null && !n.disabled);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  });
  let gotoStops = [];
  function renderGoto() {
    const groups = handlers.departments ? handlers.departments() : [];
    const here = handlers.nearestHotspot ? handlers.nearestHotspot() : null;
    gotoStops = [];
    const stop = (h) => { gotoStops.push(h); return gotoStops.length - 1; };
    el.gotoList.innerHTML = groups.length ? groups.map((g, gi) => {
      const [main, ...rest] = g.stops;
      const isHere = g.stops.some(h => (h.src || h) === here);
      return `<div class="me-dept${isHere ? ' is-here' : ''}">
        <button class="me-go" data-act="go" data-i="${stop(main)}"><span class="n">${String(gi + 1).padStart(2, '0')}</span>
          <span class="t">${esc(g.name)}${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span>${ICON.chevron}</button>
        ${rest.length ? `<div class="me-stops">${rest.map(h => `<button class="me-stop${(h.src || h) === here ? ' is-here' : ''}" data-act="go" data-i="${stop(h)}">${esc(h.short || h.label || h.id)}</button>`).join('')}</div>` : ''}</div>`;
    }).join('') : '<p style="padding:12px 4px">The rooms are still being dressed — check back in a moment.</p>';
  }

  // ---- Info sheet: menu + the website's pages
  function renderInfo(slug) {
    const pg = slug && slug !== 'menu' ? pages.page(slug) : null;
    infoView = pg ? slug : 'menu';
    el.info.classList.toggle('is-page', !!pg);
    el.infoTag.textContent = pg ? '' : 'Info';
    el.infoH.textContent = pg ? pg.title : 'Info';
    el.infoBd.innerHTML = pg ? `<h2 class="me-pt" aria-hidden="true">${esc(pg.title)}</h2>` + pg.html : pages.menu();
    el.infoBd.scrollTop = 0; requestAnimationFrame(fades);
    if (infoView === 'credits' && handlers.onCredits) handlers.onCredits();
    if (!reduced && el.infoBd.animate && sheetOpen === 'info') el.infoBd.animate([{ opacity: 0, transform: `translateX(${pg ? 14 : -14}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
  }
  function showInfo(slug) {
    const s = String(slug || 'menu');
    if (sheetOpen === 'info') { renderInfo(s); return; }
    openSheet('info', { slug: s, force: true });
  }
  function setCredits(html) { const c = el.infoBd.querySelector('.me-credits'); if (c) c.innerHTML = html; }

  // ------------------------------------------------------------------ events (one delegated listener)
  let lastInputKeyboard = false;
  window.addEventListener('keydown', () => { lastInputKeyboard = true; }, true);
  window.addEventListener('pointerdown', () => { lastInputKeyboard = false; }, true);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t || !root.contains(t)) return;
    const act = t.getAttribute('data-act'), i = +t.getAttribute('data-i');
    switch (act) {
      case 'tour': handlers.onTour(); break;
      case 'goto': openSheet('goto', { force: sheetOpen !== 'goto' }); break;
      case 'info': if (sheetOpen === 'info') closeSheets(); else showInfo('menu'); break;
      case 'brand': showInfo('about'); break;
      case 'bag': openSheet('bag'); break;
      case 'close-sheets': closeSheets(); break;
      case 'close-card': hideCard(); break;
      case 'go': { const h = gotoStops[i]; closeSheets(); if (h) handlers.onGoto(h); break; }
      case 'page': showInfo(t.getAttribute('data-slug')); break;
      case 'info-back': renderInfo('menu'); { const f = el.infoBd.querySelector('.me-mi'); if (f && lastInputKeyboard) f.focus(); } break;
      case 'faq': {
        const open = t.getAttribute('aria-expanded') !== 'true';
        t.setAttribute('aria-expanded', String(open));
        const a = document.getElementById(t.getAttribute('aria-controls')); if (a) a.hidden = !open;
        fades();
        break;
      }
      case 'swatch': {
        const cws = cardInfo ? colorwaysOf(cardInfo) : []; const c = cws[i]; if (!c) break;
        cardSwatch = i; swatchMemo.set(memoKey(cardHit, cardInfo), i);
        for (const b of el.cardBd.querySelectorAll('.me-swb')) { const on = +b.getAttribute('data-i') === i; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); }
        const lbl = el.cardBd.querySelector('.me-cw-n'); if (lbl) lbl.textContent = c.name || '';
        try { const r = c.apply && c.apply(cardHit); if (r && r.catch) r.catch(err => console.warn('[ui] colourway', err)); } catch (err) { console.warn('[ui] colourway', err); }
        handlers.onSwatch(cardHit, c);
        break;
      }
      case 'size': {
        const z = cardInfo ? sizesOf(cardInfo)[i] : null; if (!z) break;
        if (z.out) { toast(`${z.label} is sold out — message us and we will tell you if it is coming back`); break; }
        cardSize = i;
        for (const b of el.cardBd.querySelectorAll('.me-szb')) { const on = +b.getAttribute('data-i') === i; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); }
        const l = el.cardBd.querySelector('.me-sz-l'); if (l) l.textContent = z.label;
        break;
      }
      case 'add': if (!t.disabled) addFromCard(t); break;
      case 'look': {
        const it = cardInfo && cardInfo.lookItems && cardInfo.lookItems[i]; if (!it || !it.productId) break;
        const p = cat.get(it.productId); const card = p && cat.card(p);
        if (card) { const hit = cardHit; showCard(card, hit); }
        break;
      }
      case 'action': {
        const a = cardInfo && cardInfo.actions && cardInfo.actions.filter(x => x && x.label)[i]; if (!a) break;
        try { const r = a.run && a.run(cardHit); if (r && r.catch) r.catch(err => console.warn('[ui] action', err)); } catch (err) { console.warn('[ui] action', err); }
        break;
      }
      case 'qty': { const id = t.getAttribute('data-id'), d = +t.getAttribute('data-d'); const l = bag.lines().find(x => x.lineId === id); if (l) bag.setQty(id, l.qty + d); renderBag(); break; }
      case 'bag-remove': bag.remove(t.getAttribute('data-id')); renderBag(); break;
      case 'send': {
        // a real <a target=_blank>: the browser opens WhatsApp; refresh the link first so it carries today's prices
        const u = safeUrl(bag.orderUrl()); if (u) t.setAttribute('href', u);
        handlers.onSend && handlers.onSend(bag.count());
        break;
      }
      case 'site': case 'site-cart': closeSheets(); hideCard(); break; // let the website's router take the hash link
    }
  });
  // a soft fade at the bottom of a scroll area says "there is more below"
  function fades() {
    for (const n of root.querySelectorAll('.me-scroll, .me-card-bd')) n.classList.toggle('is-more', n.clientHeight > 0 && n.scrollHeight - n.scrollTop - n.clientHeight > 6);
  }
  for (const n of root.querySelectorAll('.me-scroll, .me-card-bd')) n.addEventListener('scroll', () => n.classList.toggle('is-more', n.scrollHeight - n.scrollTop - n.clientHeight > 6), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(fades));
  // swipe the card / sheets down to dismiss (phones)
  for (const panel of root.querySelectorAll('.me-card, .me-sheet')) {
    let y0 = null, t0 = 0;
    panel.addEventListener('touchstart', (e) => { const sc = e.target.closest('.me-scroll, .me-card-bd'); y0 = (!sc || sc.scrollTop <= 0) ? e.touches[0].clientY : null; t0 = performance.now(); }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null;
      if (dy > 60 && performance.now() - t0 < 600 && innerHeight > 500) { if (panel.classList.contains('me-card')) hideCard(); else closeSheets(); }
    }, { passive: true });
  }
  // Magic slider
  const setRangeFill = () => el.range.style.setProperty('--v', el.range.value + '%');
  let hotT = 0;
  el.range.addEventListener('input', () => {
    setRangeFill(); handlers.onMagic(el.range.value / 100);
    el.magic.classList.add('hot'); clearTimeout(hotT); hotT = setTimeout(() => el.magic.classList.remove('hot'), 400);
  });
  el.range.addEventListener('change', () => store.set(MAGIC_KEY, String(el.range.value)));
  setRangeFill();
  renderBadge();

  return {
    root, el, reduced, touchUI, pages,
    setLoading, assetProgress, finishLoading, flashAnnouncement, toast,
    showHint, dismissHint, get hintOn() { return hintOn; },
    caption, captionProgress, setTourState,
    joy, ripple,
    showCard, hideCard, get cardOpen() { return cardOpen; }, get cardInfo() { return cardInfo; },
    openSheet, closeSheets, get sheetOpen() { return sheetOpen; }, get infoView() { return infoView; },
    showInfo, setCredits, addItems, renderBag, renderBadge,
    setMagicValue(v) { el.range.value = String(Math.round(v * 100)); setRangeFill(); },
  };
}
