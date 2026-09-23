// The website's information pages inside the Info sheet — every word comes from ctx.brand / ctx.catalog
// (the site's content document), so a newer content file needs no code change here.
//   menu()                → the Info menu (brand block, announcement, one row per page)
//   page(slug)            → {title, html} for 'about' | 'size-guide' | 'shipping-delivery' | 'returns' |
//                           'faq' | 'visit' | 'help' | 'credits' | any other slug in brand.pages
import { ICON, crown } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Only http(s) / tel / mailto / in-page hash links survive (same rule as the website). */
export const safeUrl = (u) => { const s = String(u || '').trim(); return /^(https?:\/\/|tel:|mailto:|#)/i.test(s) ? s : ''; };
const ext = (u) => /^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : '';
/** body text → paragraphs (blank line) with line breaks (single newline) */
const paras = (t) => String(t || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

const ORDER = ['about', 'size-guide', 'shipping-delivery', 'returns', 'faq'];
const PAGE_ICON = { about: ICON.heart, 'size-guide': ICON.ruler, 'shipping-delivery': ICON.truck, returns: ICON.returns, faq: ICON.help, visit: ICON.pin, help: ICON.compass, credits: ICON.sparkle };

export function createPages(ctx, { touchUI }) {
  const brand = ctx.brand || {}, cat = ctx.catalog || {};
  const sitePages = () => {
    const list = Array.isArray(brand.pages) ? brand.pages.filter(p => p && p.slug) : [];
    return list.slice().sort((a, b) => rank(a.slug) - rank(b.slug));
  };
  const rank = (s) => { const i = ORDER.indexOf(s); return i < 0 ? 50 : i; };
  const find = (slug) => sitePages().find(p => p.slug === slug) || null;

  /** Menu entries in website order, then the store's own pages. */
  function entries() {
    const out = sitePages().map(p => ({ slug: p.slug, title: p.title || p.slug }));
    const iv = out.findIndex(e => e.slug === 'faq');
    out.splice(iv >= 0 ? iv + 1 : out.length, 0, { slug: 'visit', title: 'Visit us' });
    out.push({ slug: 'help', title: 'How to explore' }, { slug: 'credits', title: 'Credits' });
    return out;
  }
  // inside the Imaan's website: a way back to the shop pages (the site's router takes the hash link)
  function siteLink() {
    let on = false; try { on = !!(window.IS && window.IS.router); } catch (e) { /* */ }
    return on ? `<a class="me-mi me-site-back" href="#/" data-act="site"><span class="ic">${ICON.back}</span><span class="t">Back to the website</span>${ICON.chevron}</a>` : '';
  }

  function menu() {
    const ann = brand.announcement ? `<p class="me-ann">${esc(brand.announcement)}</p>` : '';
    return `<div class="me-ib">${crown('me-cg-info')}<div class="me-ib-w">${esc(brand.name || '')}</div>
        <div class="me-ib-l">${esc(brand.line || '')}</div>${brand.slogan ? `<div class="me-ib-s">${esc(brand.slogan)}</div>` : ''}</div>
      ${ann}
      <nav class="me-menu" aria-label="Information">${siteLink()}${entries().map(e => `<button class="me-mi" data-act="page" data-slug="${esc(e.slug)}">
        <span class="ic">${PAGE_ICON[e.slug] || ICON.info}</span><span class="t">${esc(e.title)}</span>${ICON.chevron}</button>`).join('')}</nav>`;
  }

  let faqN = 0;
  function faq(items) {
    return `<div class="me-faq">${items.filter(i => i && (i.q || i.a)).map(i => { const id = 'me-a' + (++faqN); return `<div class="me-qa">
      <button class="me-q" data-act="faq" aria-expanded="false" aria-controls="${id}"><span>${esc(i.q)}</span>${ICON.down}</button>
      <div class="me-a" id="${id}" hidden>${paras(i.a)}</div></div>`; }).join('')}</div>`;
  }
  function guideFor(b) {
    const g = Array.isArray(cat.sizeGuides) ? cat.sizeGuides : [];
    if (b.sizeGuideId) { const x = g.find(z => z.id === b.sizeGuideId); if (x) return x; }
    const h = String(b.heading || '').toLowerCase();
    if (/shoe|foot/.test(h)) return g.find(z => /shoe|foot/i.test(z.id + ' ' + z.name)) || null;
    if (/cloth|dress|garment/.test(h)) return g.find(z => /cloth|garment/i.test(z.id + ' ' + z.name)) || null;
    return null;
  }
  function blocks(p) {
    return (p.blocks || []).map(b => {
      let html = b.heading ? `<h3>${esc(b.heading)}</h3>` : '';
      html += paras(b.body);
      if (b.items && b.items.length) html += faq(b.items);
      if (!b.body && !(b.items && b.items.length)) {
        const g = guideFor(b);
        if (g && g.sizes && g.sizes.length) html += `<div class="me-sizes" aria-label="${esc(g.name || '')}">${g.sizes.map(s => `<span>${esc(s)}</span>`).join('')}</div>`;
      }
      return html;
    }).join('');
  }
  function testimonials() {
    const t = (Array.isArray(brand.testimonials) ? brand.testimonials : []).filter(x => x && x.text).slice(0, 3);
    if (!t.length) return '';
    return '<h3>Kind words</h3>' + t.map(x => `<figure class="me-quote"><blockquote>“${esc(x.text)}”</blockquote>
      <figcaption>${'★'.repeat(Math.max(0, Math.min(5, x.rating | 0)))} <span>${esc([x.name, x.location].filter(Boolean).join(', '))}</span></figcaption></figure>`).join('');
  }

  function visit() {
    const c = brand.contact || {}, h = brand.hours || {}, days = Array.isArray(h.days) ? h.days : [];
    const now = new Date(), key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
    let today = days.findIndex(d => d && d.day === key); if (today < 0 && days.length === 7) today = (now.getDay() + 6) % 7;
    const addr = (c.addressLines || []).filter(Boolean);
    const map = safeUrl(c.mapUrl);
    let html = brand.story ? `<p>${esc(brand.story)}</p>` : '';
    if (addr.length) html += `<h3>Find us</h3><address class="me-addr">${addr.map(esc).join('<br>')}</address>` +
      (map ? `<div class="me-links"><a class="me-lk" href="${esc(map)}"${ext(map)}>${ICON.pin}<span>Directions</span>${ICON.link}</a></div>` : '');
    if (days.length) {
      html += `<h3>Opening hours</h3><table class="me-hours"><tbody>${days.map((d, i) => `<tr${i === today ? ' class="is-today"' : ''}>
        <th scope="row">${esc(d.label || d.day)}${i === today ? '<small>Today</small>' : ''}</th>
        <td>${d.closed ? 'Closed' : `${esc(d.open)} – ${esc(d.close)}`}</td></tr>`).join('')}</tbody></table>`;
    }
    if (h.note) html += `<p class="me-note">${esc(h.note)}</p>`;
    const rows = [];
    const tel = String(c.phoneDisplay || '').replace(/[^0-9+]/g, '');
    if (tel) rows.push(['tel:' + tel, ICON.phone, 'Call', c.phoneDisplay]);
    const wa = String(c.whatsapp || (brand.checkout || {}).whatsappNumber || '').replace(/[^0-9]/g, '');
    if (wa) rows.push(['https://wa.me/' + wa, ICON.whatsapp, 'WhatsApp', c.phoneDisplay && String(c.phoneDisplay).replace(/\D/g, '').slice(-9) === wa.slice(-9) ? c.phoneDisplay : '+' + wa]);
    if (c.email) rows.push(['mailto:' + c.email, ICON.mail, 'Email', c.email]);
    for (const s of Array.isArray(brand.social) ? brand.social : []) {
      const u = safeUrl(s && s.url); if (!u) continue;
      rows.push([u, /insta/i.test(s.label) ? ICON.instagram : ICON.link, s.label, u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')]);
    }
    if (rows.length) html += '<h3>Get in touch</h3><ul class="me-ct">' + rows.map(([u, ic, label, val]) => `<li>
      <a class="me-lk" href="${esc(u)}"${ext(u)}>${ic}<span>${esc(label)}</span></a><span class="v">${esc(val)}</span></li>`).join('') + '</ul>';
    return html;
  }

  function help() {
    const rows = touchUI ? [
      ['Walk', 'Put your left thumb down in the lower-left and slide'], ['Look', 'Drag anywhere else'], ['Discover', 'Tap a garment, shoe or sign'],
      ['Glide', 'Double-tap the floor'], ['Tour', 'Tap Tour and let us show you around — touch to take over'], ['Bag', 'Add pieces, then send the order on WhatsApp'],
    ] : [
      ['Walk', 'W A S D or arrow keys · Shift to hurry'], ['Look', 'Drag with the mouse · ← → turn'], ['Discover', 'Click a garment, shoe or sign'],
      ['Step', 'Mouse wheel'], ['Glide', 'Double-click the floor'], ['Tour', 'Press Tour — any click takes over'], ['Bag', 'Add pieces, then send the order on WhatsApp'],
    ];
    return `<p>${esc(brand.legalName || brand.name)} — ${esc(brand.tagline || brand.line || '')}. Every piece in this store is a real product from the shop.</p>
      <dl class="me-keys">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  function page(slug) {
    if (slug === 'visit') return { title: 'Visit us', html: visit() };
    if (slug === 'help') return { title: 'How to explore', html: help() };
    if (slug === 'credits') return { title: 'Credits', html: '<ul class="me-credits"><li><small>Loading…</small></li></ul>' };
    const p = find(slug); if (!p) return null;
    return { title: p.title || slug, html: blocks(p) + (slug === 'about' ? testimonials() : '') };
  }

  return { entries, menu, page };
}
