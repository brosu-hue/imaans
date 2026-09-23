// The bag. Same shape as the Imaan's Shoes website basket (SITE/js/cart.js):
//   lines {lineId, productId, sizeId, colourId, qty}, localStorage key 'imaans_cart_v1' = {v:1, lines},
//   ids + qty ONLY (prices are re-resolved from the catalogue every render, so they are never stale).
//
// Embedded in the website (window.IS.cart exists) every call is forwarded to IS.cart — one basket for the
// shop and the 3-D store; standalone a local twin with the same rules is used (never add sold-out
// products / sizes, merge identical lines, qty 1…99, max 60 lines, self-heal on load) and the WhatsApp
// order message mirrors cart.js buildMessage() line for line.
//
// Info objects without a productId (older interactables) can still be bagged: they live in memory only
// (never written to the shared basket, which only knows real product ids).
const KEY = 'imaans_cart_v1', VERSION = 1, MAX_QTY = 99, MAX_LINES = 60, MESSAGE_MAX = 1500;

const clampQty = (v) => { let n = typeof v === 'number' ? v : parseInt(v, 10); if (!isFinite(n)) return 1; n = Math.round(n); return n < 1 ? 1 : n > MAX_QTY ? MAX_QTY : n; };
const same = (a, b) => (a == null ? '' : String(a)) === (b == null ? '' : String(b));
let _seq = 0;
const uid = () => 'ln_' + Date.now().toString(36) + (++_seq).toString(36);

export function createBag(ctx) {
  const cat = ctx.catalog, brand = ctx.brand || {};
  const listeners = new Set();
  const site = () => { try { const IS = window.IS; return IS && IS.cart && typeof IS.cart.add === 'function' ? IS : null; } catch (e) { return null; } };
  let busHooked = false;
  function hookSite() {
    const IS = site(); if (!IS || busHooked) return IS;
    busHooked = true;
    try { if (IS.bus && IS.bus.on) IS.bus.on('cart:change', (d) => emit(d && d.removed)); } catch (e) { /* optional */ }
    return IS;
  }

  // ------------------------------------------------------------------ local twin
  const ls = () => { try { return window.localStorage || null; } catch (e) { return null; } };
  function read() {
    const s = ls(); if (!s) return [];
    let raw; try { raw = s.getItem(KEY); } catch (e) { return []; }
    if (!raw) return [];
    let parsed; try { parsed = JSON.parse(raw); } catch (e) { return []; }
    const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.lines) ? parsed.lines : []);
    const out = [];
    for (const it of arr) {
      if (out.length >= MAX_LINES) break;
      if (!it || typeof it !== 'object' || typeof it.productId !== 'string') continue;
      out.push({ lineId: typeof it.lineId === 'string' && it.lineId ? it.lineId : uid(), productId: it.productId,
        sizeId: typeof it.sizeId === 'string' && it.sizeId ? it.sizeId : null,
        colourId: typeof it.colourId === 'string' && it.colourId ? it.colourId : null, qty: clampQty(it.qty) });
    }
    return out;
  }
  function write() { const s = ls(); if (!s) return; try { s.setItem(KEY, JSON.stringify({ v: VERSION, lines: store })); } catch (e) { /* quota / private mode */ } }
  let store = read();
  const extras = []; // {lineId, title, priceCents, detail, swatch, qty} — legacy, in memory only

  /** Resolve stored lines against the catalogue; drop what can no longer be sold (like cart.js resolveLines). */
  function resolve() {
    const lines = [], removed = [];
    for (const raw of store) {
      const p = cat.get(raw.productId);
      if (!p) { removed.push('An item in your bag is no longer available'); continue; }
      if (p.inStock === false) { removed.push(p.name + ' has sold out'); continue; }
      let size = null;
      if (raw.sizeId) {
        size = (p.sizes || []).find(z => z.id === raw.sizeId) || null;
        if (!size) { removed.push('Your size of ' + p.name + ' is no longer listed'); continue; }
        if (size.inStock === false) { removed.push(p.name + ' in size ' + size.label + ' has sold out'); continue; }
      }
      const colour = raw.colourId ? (p.colours || []).find(c => c.id === raw.colourId) || null : null;
      const unit = cat.priceOf(p), qty = clampQty(raw.qty);
      lines.push({ lineId: raw.lineId, productId: p.id, sizeId: size ? size.id : null, colourId: colour ? colour.id : null, qty,
        name: p.name, sku: p.sku || '', sizeLabel: size ? size.label : '', colourLabel: colour ? colour.label : '', swatch: colour ? colour.swatch : '',
        image: cat.imageUrl(p, ctx.assets.base), unitCents: unit, lineCents: unit * qty, slug: p.slug });
    }
    return { lines, removed };
  }
  function heal() { const r = resolve(); if (r.removed.length) { store = r.lines.map(l => ({ lineId: l.lineId, productId: l.productId, sizeId: l.sizeId, colourId: l.colourId, qty: l.qty })); write(); } return r.removed; }
  const initialRemoved = site() ? [] : heal();

  // ------------------------------------------------------------------ unified API
  /** Display lines: {lineId, productId, name, sizeLabel, colourLabel, swatch, image, qty, unitCents, lineCents, legacy?} */
  function lines() {
    const IS = hookSite();
    let out;
    if (IS) {
      let raw = []; try { raw = IS.cart.lines() || []; } catch (e) { raw = []; }
      out = raw.map(l => {
        const p = l.product || {}, img = p.images && p.images[0] && p.images[0].url;
        const local = cat.get(l.productId);
        return { lineId: l.lineId, productId: l.productId, sizeId: l.sizeId, colourId: l.colourId, qty: l.qty,
          name: p.name || (local && local.name) || '', sku: p.sku || '', sizeLabel: l.size ? l.size.label : '', colourLabel: l.colour ? l.colour.label : '',
          swatch: l.colour ? l.colour.swatch : '', image: img || (local ? cat.imageUrl(local, ctx.assets.base) : null),
          unitCents: l.unitCents, lineCents: l.lineCents, slug: p.slug || (local && local.slug) };
      });
    } else out = resolve().lines;
    for (const x of extras) out.push({ lineId: x.lineId, productId: null, name: x.title, sizeLabel: x.size, colourLabel: x.colour, swatch: x.swatch, image: null,
      qty: x.qty, unitCents: x.priceCents, lineCents: x.priceCents * x.qty, legacy: true });
    return out;
  }
  function count() {
    const IS = hookSite(); let n = 0;
    if (IS) { try { n = IS.cart.count() || 0; } catch (e) { n = 0; } } else for (const l of resolve().lines) n += l.qty;
    for (const x of extras) n += x.qty;
    return n;
  }
  const totalCents = () => lines().reduce((a, l) => a + (l.lineCents || 0), 0);

  /** Add one or many {productId, sizeId?, colourId?, qty?} (+ optional display fields for legacy items). → {added, refused:[names], lines:[{…ids}]} */
  function add(items) {
    const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
    const IS = hookSite();
    const res = { added: 0, refused: [], reasons: [], lines: [] };
    const refuse = (p, it, why) => { res.refused.push((p && p.name) || it.title || 'That piece'); res.reasons.push(why); };
    for (const it of list) {
      const qty = clampQty(it.qty == null ? 1 : it.qty);
      if (!it.productId) { // legacy info object
        const priceCents = typeof it.priceCents === 'number' ? it.priceCents : legacyCents(it.price);
        const detail = { title: String(it.title || 'Piece'), priceCents, size: it.size || '', colour: it.colour || '', swatch: it.swatch || '' };
        const hit = extras.find(x => x.title === detail.title && x.size === detail.size && x.colour === detail.colour);
        if (hit) hit.qty = clampQty(hit.qty + qty); else extras.push({ lineId: uid(), qty, ...detail });
        res.added += qty; res.lines.push({ productId: null, title: detail.title, qty });
        continue;
      }
      const opts = { productId: it.productId, sizeId: it.sizeId || null, colourId: it.colourId || null, qty };
      const p = cat.get(it.productId);
      if (IS) {
        let id = null; try { id = IS.cart.add(opts); } catch (e) { id = null; }
        if (id) { res.added += qty; res.lines.push(opts); } else refuse(p, it, !p || p.inStock === false ? 'sold-out' : opts.sizeId ? 'size' : 'full');
        continue;
      }
      // local rules (identical to IS.cart.add)
      const size = p && opts.sizeId ? (p.sizes || []).find(z => z.id === opts.sizeId) : null;
      if (!p) { refuse(p, it, 'unavailable'); continue; }
      if (p.inStock === false) { refuse(p, it, 'sold-out'); continue; }
      if (opts.sizeId && (!size || size.inStock === false)) { refuse(p, it, 'size'); continue; }
      const same3 = store.find(l => l.productId === opts.productId && same(l.sizeId, opts.sizeId) && same(l.colourId, opts.colourId));
      if (same3) same3.qty = clampQty(same3.qty + qty);
      else if (store.length >= MAX_LINES) { refuse(p, it, 'full'); continue; }
      else store.push({ lineId: uid(), ...opts });
      res.added += qty; res.lines.push(opts);
    }
    if (!IS && res.added) write();
    if (!IS || extras.length) emit();
    return res;
  }
  function setQty(lineId, qty) {
    const n = typeof qty === 'number' ? qty : parseInt(qty, 10);
    if (!isFinite(n) || n < 1) return remove(lineId);
    const x = extras.find(e => e.lineId === lineId); if (x) { x.qty = clampQty(n); emit(); return true; }
    const IS = hookSite(); if (IS) { try { return IS.cart.setQty(lineId, n); } catch (e) { return false; } }
    const l = store.find(e => e.lineId === lineId); if (!l) return false;
    l.qty = clampQty(n); write(); emit(); return true;
  }
  function remove(lineId) {
    const xi = extras.findIndex(e => e.lineId === lineId); if (xi >= 0) { extras.splice(xi, 1); emit(); return true; }
    const IS = hookSite(); if (IS) { try { return IS.cart.remove(lineId); } catch (e) { return false; } }
    const before = store.length; store = store.filter(e => e.lineId !== lineId);
    if (store.length !== before) { write(); emit(); return true; }
    return false;
  }
  function clear() { extras.length = 0; const IS = hookSite(); if (IS) { try { IS.cart.clear(); } catch (e) { /* */ } } else { store = []; write(); } emit(); }

  // ------------------------------------------------------------------ order message (mirrors cart.js buildMessage)
  const money = (c) => cat.formatPrice(c);
  function lineText(l) {
    const bits = [];
    if (l.sizeLabel) bits.push('Size ' + l.sizeLabel);
    if (l.colourLabel) bits.push(l.colourLabel);
    if (l.sku) bits.push(l.sku);
    return l.name + (bits.length ? ' (' + bits.join(', ') + ')' : '') + ' x' + l.qty + ' - ' + money(l.lineCents);
  }
  function totalsBlock(sub) {
    const ck = brand.checkout || {};
    const fee = typeof ck.deliveryFeeCents === 'number' ? ck.deliveryFeeCents : 0;
    const thr = typeof ck.freeDeliveryOverCents === 'number' ? ck.freeDeliveryOverCents : null;
    const delivery = sub === 0 || (thr !== null && sub >= thr) ? 0 : fee;
    const rows = [];
    if (delivery > 0 || (sub > 0 && delivery === 0 && fee > 0)) { rows.push('Subtotal: ' + money(sub)); rows.push('Delivery: ' + (delivery > 0 ? money(delivery) : 'Free')); }
    rows.push('Total: ' + money(sub + delivery));
    return rows;
  }
  function message() {
    const ck = brand.checkout || {};
    const ls_ = lines(), sub = ls_.reduce((a, l) => a + (l.lineCents || 0), 0);
    const intro = String(ck.messageIntro || 'Hello! I would like to order:'), outro = String(ck.messageOutro || '');
    const assemble = (body) => { const parts = [intro]; if (body.length) parts.push(body.join('\n')); parts.push(totalsBlock(sub).join('\n')); if (outro) parts.push(outro); return parts.join('\n\n'); };
    if (!ls_.length) return assemble(['(no items yet)']);
    const full = assemble(ls_.map((l, i) => (i + 1) + '. ' + lineText(l)));
    if (full.length <= MESSAGE_MAX) return full;
    const items = ls_.reduce((a, l) => a + l.qty, 0);
    return assemble([items + ' ' + (items === 1 ? 'item' : 'items') + ' across ' + ls_.length + ' ' + (ls_.length === 1 ? 'product' : 'products') + '.',
      'The list is too long to fit here - I will send the full basket in the chat.']);
  }
  const digits = (v) => String(v == null ? '' : v).replace(/[^0-9]/g, '').slice(0, 15);
  const waNumber = () => digits((brand.checkout || {}).whatsappNumber) || digits((brand.contact || {}).whatsapp);
  /** The order link (wa.me, or mailto: when the shop only takes email orders). '' when neither is configured. */
  function orderUrl() {
    const IS = hookSite();
    if (IS && !extras.length && typeof IS.cart.orderUrl === 'function') { try { const u = IS.cart.orderUrl(); if (u) return u; } catch (e) { /* fall through */ } }
    const ck = brand.checkout || {}, wa = waNumber();
    const email = String(ck.emailTo || (brand.contact || {}).email || '').trim();
    const useEmail = (ck.mode === 'email' && /@/.test(email)) || (!wa && /@/.test(email));
    if (useEmail) return 'mailto:' + email + '?subject=' + encodeURIComponent('New order - ' + (brand.legalName || brand.name || 'the shop')) + '&body=' + encodeURIComponent(message());
    return wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(message()) : '';
  }

  // ------------------------------------------------------------------ change events
  function emit(removed) { for (const fn of listeners) { try { fn(removed || []); } catch (e) { console.warn('[ui] bag listener', e); } } }
  window.addEventListener('storage', (ev) => { if (ev && ev.key && ev.key !== KEY) return; if (site()) return; store = read(); emit(heal()); });

  return {
    KEY, lines, count, totalCents, add, setQty, remove, clear, message, orderUrl, waNumber,
    get embedded() { return !!site(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    initialRemoved,
  };
}

/** Older info objects: price as a number (whole Rand) or a plain string ("R 1 299.00", "460", legacy non-Rand strings) → cents. */
export function legacyCents(p) {
  if (typeof p === 'number' && isFinite(p)) return Math.round(p * 100);
  const m = String(p == null ? '' : p).replace(/[\s  ]/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1].replace(',', '.')) * 100) : 0;
}
