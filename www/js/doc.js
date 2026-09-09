/* Loading, rendering and stamping a document.
   A document is either a PDF (rendered with pdf.js) or a single image. */

import * as pdfjsLib from '../vendor/pdf.min.mjs';
import { detectSignatureLines } from './detect.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).toString();
const STANDARD_FONTS = new URL('../vendor/standard_fonts/', import.meta.url).toString();

/* iOS gets unhappy well before desktop does, so keep every page bitmap modest. */
const MAX_PAGE_PIXELS = 3.6e6;
const MAX_SCALE = 3;

let uid = 0;
const nextId = () => 'k' + (++uid);

export class SignDoc {
  constructor(host) {
    this.host = host;            // the #pages element
    this.pages = [];
    this.stamps = [];
    this.pdf = null;
    this.bytes = null;           // original PDF bytes, for export
    this.image = null;           // {el,w,h} when the source is a picture
    this.name = 'document';
    this.dirty = false;          // true once there is unsaved ink on the page
    this.password = '';          // set when the original was password protected
    this.onSelect = () => {};
    this.onTap = () => {};
    this._sel = null;
  }

  /* ================= loading ================= */

  /**
   * Asked for the password of a protected document. Return the password, or
   * null to give up. Replaced by the app; refusing by default keeps the
   * loader honest if nobody sets one.
   */
  onPasswordNeeded() { return Promise.resolve(null); }

  async load(file, onProgress) {
    this.name = (file.name || 'document').replace(/\.[^.]+$/, '');
    const buf = await file.arrayBuffer();
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name || '') || looksLikePdf(buf);

    if (isPdf) {
      this.bytes = new Uint8Array(buf);
      this.pdf = await this._openPdf();
      for (let i = 1; i <= this.pdf.numPages; i++) {
        if (onProgress) onProgress(i, this.pdf.numPages);
        await this._addPdfPage(i);
      }
    } else {
      const img = await loadImage(buf, file.type || 'image/jpeg');
      this.image = img;
      this._addImagePage(img);
    }
    return this.pages.length;
  }

  /**
   * Opens the PDF, asking for a password only if the file actually needs one.
   * Many "protected" documents carry an owner password only and open with an
   * empty one, so nobody should be prompted for those.
   */
  async _openPdf() {
    // pdf.js transfers the buffer it is given, so hand it its own copy.
    const task = pdfjsLib.getDocument({
      data: this.bytes.slice(),
      password: this.password,
      standardFontDataUrl: STANDARD_FONTS,
      isEvalSupported: false
    });

    task.onPassword = (retry, reason) => {
      const wrong = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
      Promise.resolve(this.onPasswordNeeded(wrong)).then((pw) => {
        if (pw === null || pw === undefined) {
          task.destroy();
          return;
        }
        this.password = pw;
        retry(pw);
      });
    };

    return await task.promise;
  }

  async _addPdfPage(num) {
    const page = await this.pdf.getPage(num);
    const vp1 = page.getViewport({ scale: 1 });
    const rec = this._makePage(vp1.width, vp1.height);
    rec.pdfPage = page;
    rec.vp1 = vp1;
    this.pages.push(rec);
  }

  _addImagePage(img) {
    const rec = this._makePage(img.w, img.h);
    rec.bitmap = img.el;
    this.pages.push(rec);
  }

  _makePage(baseW, baseH) {
    const el = document.createElement('div');
    el.className = 'page';
    el.style.aspectRatio = baseW + ' / ' + baseH;
    // Older Safari ignores aspect-ratio; a padding box keeps the shape there.
    el.style.width = '100%';

    const canvas = document.createElement('canvas');
    const layer = document.createElement('div');
    layer.className = 'page-layer';
    el.appendChild(canvas);
    el.appendChild(layer);
    this.host.appendChild(el);

    const rec = {
      idx: this.pages.length, el, canvas, layer,
      baseW, baseH, rendered: false, rendering: null,
      textItems: null, hits: null, vp: null, vp1: null, pdfPage: null, bitmap: null
    };
    this._bindPage(rec);
    return rec;
  }

  /* ================= rendering ================= */

  /** Renders a page's bitmap once, sized to how wide it is actually shown. */
  ensureRendered(rec) {
    if (rec.rendered) return Promise.resolve(rec);
    if (rec.rendering) return rec.rendering;

    rec.rendering = (async () => {
      const cssW = rec.el.clientWidth || this.host.clientWidth || 700;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let scale = (cssW * dpr) / rec.baseW;
      scale = Math.min(scale, MAX_SCALE);
      const area = rec.baseW * scale * rec.baseH * scale;
      if (area > MAX_PAGE_PIXELS) scale *= Math.sqrt(MAX_PAGE_PIXELS / area);
      scale = Math.max(scale, 0.2);

      if (rec.pdfPage) {
        const vp = rec.pdfPage.getViewport({ scale });
        rec.canvas.width = Math.round(vp.width);
        rec.canvas.height = Math.round(vp.height);
        rec.vp = vp;
        const ctx = rec.canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, rec.canvas.width, rec.canvas.height);
        await rec.pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
        rec.textItems = await readText(rec.pdfPage, vp);
      } else {
        rec.canvas.width = Math.round(rec.baseW * scale);
        rec.canvas.height = Math.round(rec.baseH * scale);
        const ctx = rec.canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, rec.canvas.width, rec.canvas.height);
        ctx.drawImage(rec.bitmap, 0, 0, rec.canvas.width, rec.canvas.height);
        rec.textItems = [];
      }
      rec.rendered = true;
      return rec;
    })();

    return rec.rendering;
  }

  /** Renders whatever is on screen now, and keeps doing so as you scroll. */
  watchViewport(scroller) {
    const render = (rec) => { this.ensureRendered(rec).catch(() => {}); };

    if (!('IntersectionObserver' in window)) {
      this.pages.forEach(render);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const rec = this.pages[Number(e.target.dataset.idx)];
        if (rec) render(rec);
      }
    }, { root: scroller, rootMargin: '400px 0px' });

    this.pages.forEach((rec, i) => {
      rec.el.dataset.idx = String(i);
      io.observe(rec.el);
    });
    this._io = io;
  }

  /* ================= line detection ================= */

  /** The signing lines on one page, worked out once and kept. */
  async hitsFor(rec) {
    if (rec.hits) return rec.hits;
    await this.ensureRendered(rec);
    rec.hits = detectSignatureLines(rec.canvas, rec.textItems).map(h => ({
      id: nextId(),
      page: rec.idx,
      xPct: h.x / rec.canvas.width,
      yPct: h.y / rec.canvas.height,
      wPct: h.w / rec.canvas.width,
      kind: h.kind,
      score: h.score
    }));
    return rec.hits;
  }

  /** Renders every page if needed, then finds the signing lines on each. */
  async findLines(onProgress) {
    const all = [];
    for (let i = 0; i < this.pages.length; i++) {
      if (onProgress) onProgress(i + 1, this.pages.length);
      all.push.apply(all, await this.hitsFor(this.pages[i]));
      await frame();
    }
    return all;
  }

  /**
   * The signing line a tap was aiming at, if there is one.
   * The window reaches further above the line than below it, because that is
   * where a signature goes and so where people aim.
   */
  lineNear(rec, xPct, yPct) {
    if (!rec.hits) return null;
    let best = null, bestGap = Infinity;
    for (const h of rec.hits) {
      const above = h.yPct - yPct;               // positive when the tap is above the line
      if (above < -0.018 || above > 0.055) continue;
      if (xPct < h.xPct - 0.03 || xPct > h.xPct + h.wPct + 0.03) continue;
      const gap = Math.abs(above);
      if (gap < bestGap) { bestGap = gap; best = h; }
    }
    return best;
  }

  showHits(hits, selectedIds, onToggle) {
    this.clearHits();
    for (const h of hits) {
      const rec = this.pages[h.page];
      if (!rec) continue;
      const box = document.createElement('div');
      box.className = 'hit' + (selectedIds.has(h.id) ? '' : ' is-off');
      const hPct = 0.055;
      box.style.left = (h.xPct * 100) + '%';
      box.style.width = (h.wPct * 100) + '%';
      box.style.top = ((h.yPct - hPct * 0.92) * 100) + '%';
      box.style.height = (hPct * 100) + '%';
      const tick = document.createElement('div');
      tick.className = 'hit-tick';
      tick.textContent = '✓';
      tick.hidden = !selectedIds.has(h.id);
      box.appendChild(tick);
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        const on = !selectedIds.has(h.id);
        if (on) selectedIds.add(h.id); else selectedIds.delete(h.id);
        box.className = 'hit' + (on ? '' : ' is-off');
        tick.hidden = !on;
        if (onToggle) onToggle(selectedIds.size);
      });
      rec.layer.appendChild(box);
      this._hitEls = this._hitEls || [];
      this._hitEls.push(box);
    }
  }

  clearHits() {
    (this._hitEls || []).forEach(el => el.remove());
    this._hitEls = [];
  }

  /* ================= stamps ================= */

  /** Places a signature so it sits on a detected line, like a real one would. */
  placeSignatureOnLine(hit, sig) {
    const aspect = sig.w / sig.h;
    const rec = this.pages[hit.page];

    // Work in the page's own units, not fractions, so a landscape or rotated
    // page gets the same physical signature size as a portrait one.
    const lineLen = hit.wPct * rec.baseW;
    const u = pageUnit(rec);
    let hUnits = clamp(lineLen * 0.17, 16 * u, 42 * u);   // ~6-15mm on A4
    let wUnits = hUnits * aspect;
    if (wUnits > lineLen * 0.94) {
      wUnits = lineLen * 0.94;
      hUnits = wUnits / aspect;
    }
    const hPct = hUnits / rec.baseH;
    const wPct = wUnits / rec.baseW;
    return this.addStamp({
      type: 'sig',
      sigId: sig.id,
      png: sig.png,
      page: hit.page,
      xPct: hit.xPct + hit.wPct * 0.04,
      yPct: hit.yPct - hPct * 0.84,      // ink crosses the line slightly
      wPct, hPct
    });
  }

  placeDateOnLine(hit, text) {
    const rec = this.pages[hit.page];
    const lineLen = hit.wPct * rec.baseW;
    const u = pageUnit(rec);
    const hPct = clamp(lineLen * 0.05, 8.5 * u, 13 * u) / rec.baseH;
    return this.addStamp({
      type: 'text',
      text,
      page: hit.page,
      xPct: hit.xPct + hit.wPct * 0.05,
      yPct: hit.yPct - hPct * 1.15,
      wPct: hit.wPct * 0.9,
      hPct
    });
  }

  /**
   * Places a stamp at a point on the page. The tap point acts as the line the
   * stamp sits on, so a signature lands above it and slightly overlapping,
   * exactly as it would on a printed rule.
   */
  placeAtPoint(spec, pageIdx, xPct, yPct) {
    const rec = this.pages[pageIdx];
    if (!rec) return null;
    const u = pageUnit(rec);

    let wPct, hPct, x;
    if (spec.type === 'sig') {
      const aspect = spec.w / spec.h;
      const hUnits = 34 * u;
      const wUnits = Math.min(hUnits * aspect, rec.baseW * 0.8);
      hPct = (wUnits / aspect) / rec.baseH;
      wPct = wUnits / rec.baseW;
      x = xPct - wPct / 2;                       // centred on the finger
    } else {
      hPct = (11 * u) / rec.baseH;
      wPct = 0.26;
      x = xPct;                                  // text reads from the tap onwards
    }

    const lift = spec.type === 'sig' ? 0.84 : 1.15;
    return this.addStamp(Object.assign({}, spec, {
      page: pageIdx,
      xPct: clamp(x, 0, 1 - wPct),
      yPct: clamp(yPct - hPct * lift, 0, 1 - hPct),
      wPct, hPct
    }));
  }

  /** Drops a stamp in the middle of whichever page is on screen. */
  placeInView(spec, scroller) {
    const rec = this.visiblePage(scroller);
    const base = { page: rec.idx, xPct: 0.3, yPct: 0.45 };
    const u = pageUnit(rec);
    if (spec.type === 'sig') {
      const aspect = spec.w / spec.h;
      let hUnits = 38 * u, wUnits = hUnits * aspect;
      if (wUnits > rec.baseW * 0.6) { wUnits = rec.baseW * 0.6; hUnits = wUnits / aspect; }
      base.hPct = hUnits / rec.baseH;
      base.wPct = wUnits / rec.baseW;
    } else {
      base.hPct = (12 * u) / rec.baseH;
      base.wPct = 0.3;
    }
    base.xPct = Math.max(0.04, 0.5 - base.wPct / 2);
    return this.addStamp(Object.assign(base, spec));
  }

  visiblePage(scroller) {
    const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    let best = this.pages[0], bestD = Infinity;
    for (const rec of this.pages) {
      const r = rec.el.getBoundingClientRect();
      const d = Math.abs((r.top + r.height / 2) - mid);
      if (d < bestD) { bestD = d; best = rec; }
    }
    return best;
  }

  addStamp(spec) {
    const rec = this.pages[spec.page];
    if (!rec) return null;

    const st = Object.assign({ id: nextId() }, spec);
    const el = document.createElement('div');
    el.className = 'stamp';

    if (st.type === 'sig') {
      const img = document.createElement('img');
      img.src = st.png;
      img.alt = 'signature';
      el.appendChild(img);
    } else {
      const txt = document.createElement('div');
      txt.className = 'stamp-txt';
      txt.textContent = st.text;
      el.appendChild(txt);
    }

    const handle = document.createElement('div');
    handle.className = 'stamp-handle';
    el.appendChild(handle);

    st.el = el;
    rec.layer.appendChild(el);
    this.stamps.push(st);
    this.dirty = true;
    this._layout(st);
    this._bindStamp(st);
    return st;
  }

  _layout(st) {
    const el = st.el;
    el.style.left = (st.xPct * 100) + '%';
    el.style.top = (st.yPct * 100) + '%';
    el.style.width = (st.wPct * 100) + '%';
    el.style.height = (st.hPct * 100) + '%';
    if (st.type === 'text') {
      const rec = this.pages[st.page];
      const px = st.hPct * (rec.el.clientHeight || 800);
      const t = el.querySelector('.stamp-txt');
      if (t) t.style.fontSize = px.toFixed(1) + 'px';
    }
  }

  relayoutText() {
    this.stamps.forEach(st => { if (st.type === 'text') this._layout(st); });
  }

  select(st) {
    if (this._sel && this._sel.el) this._sel.el.classList.remove('is-sel');
    this._sel = st || null;
    if (st) st.el.classList.add('is-sel');
    this.onSelect(st || null);
  }

  get selected() { return this._sel; }

  removeSelected() {
    const st = this._sel;
    if (!st) return;
    st.el.remove();
    this.stamps = this.stamps.filter(s => s !== st);
    this.dirty = true;
    this.select(null);
  }

  scaleSelected(factor) {
    const st = this._sel;
    if (!st) return;
    const rec = this.pages[st.page];
    const cx = st.xPct + st.wPct / 2;
    const cy = st.yPct + st.hPct / 2;
    const maxW = 0.96, minW = 0.03;
    let w = clamp(st.wPct * factor, minW, maxW);
    const ratio = w / st.wPct;
    st.wPct = w;
    st.hPct = clamp(st.hPct * ratio, 0.008, 0.9);
    st.xPct = clamp(cx - st.wPct / 2, 0, 1 - st.wPct);
    st.yPct = clamp(cy - st.hPct / 2, 0, 1 - st.hPct);
    this._layout(st);
    this.dirty = true;
    void rec;
  }

  /* ----- gestures ----- */

  _bindPage(rec) {
    let sx = 0, sy = 0, t0 = 0, live = false;

    rec.layer.addEventListener('pointerdown', (e) => {
      live = e.target === rec.layer;             // not a stamp, not a review box
      sx = e.clientX; sy = e.clientY; t0 = Date.now();
    });

    rec.layer.addEventListener('pointerup', (e) => {
      if (!live) return;
      live = false;
      // A scroll or a long press is not a tap.
      if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) return;
      if (Date.now() - t0 > 700) return;

      if (this.selected) { this.select(null); return; }   // first tap just deselects

      const r = rec.el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.onTap({
        page: rec.idx,
        xPct: (e.clientX - r.left) / r.width,
        yPct: (e.clientY - r.top) / r.height,
        clientX: e.clientX,
        clientY: e.clientY
      });
    });

    rec.layer.addEventListener('pointercancel', () => { live = false; });
  }

  _bindStamp(st) {
    const el = st.el;
    const handle = el.querySelector('.stamp-handle');
    const rec = this.pages[st.page];

    let mode = null, sx = 0, sy = 0, ox = 0, oy = 0, ow = 0, oh = 0, pw = 0, ph = 0;

    const down = (e, which) => {
      e.preventDefault();
      e.stopPropagation();
      this.select(st);
      mode = which;
      const r = rec.el.getBoundingClientRect();
      pw = r.width; ph = r.height;
      sx = e.clientX; sy = e.clientY;
      ox = st.xPct; oy = st.yPct; ow = st.wPct; oh = st.hPct;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const move = (e) => {
      if (!mode || !pw || !ph) return;
      e.preventDefault();
      const dx = (e.clientX - sx) / pw;
      const dy = (e.clientY - sy) / ph;
      if (mode === 'move') {
        st.xPct = clamp(ox + dx, -ow * 0.25, 1 - ow * 0.75);
        st.yPct = clamp(oy + dy, -oh * 0.25, 1 - oh * 0.75);
      } else {
        const w = clamp(ow + dx, 0.03, 0.98);
        const ratio = w / ow;
        st.wPct = w;
        st.hPct = clamp(oh * ratio, 0.008, 0.9);
      }
      this._layout(st);
    };

    const up = (e) => {
      if (!mode) return;
      mode = null;
      this.dirty = true;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    el.addEventListener('pointerdown', (e) => { if (e.target !== handle) down(e, 'move'); });
    handle.addEventListener('pointerdown', (e) => down(e, 'resize'));
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
}

/* ================= helpers ================= */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * How many of a page's own units make up one point of an A4 page.
 * A PDF page measures in points, but a photo measures in pixels — without this
 * a signature comes out half-size on a scan and full-size on a PDF.
 * Measured on the longer edge, so turning a page sideways does not shrink it.
 */
function pageUnit(rec) { return Math.max(rec.baseW, rec.baseH) / 842; }
function frame() { return new Promise(r => setTimeout(r, 0)); }

function looksLikePdf(buf) {
  const b = new Uint8Array(buf.slice(0, 5));
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

async function readText(page, viewport) {
  try {
    const tc = await page.getTextContent();
    const out = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const h = Math.hypot(m[2], m[3]) || 10;
      const box = { str: it.str, x: m[4], y: m[5] - h, w: (it.width || 0) * viewport.scale, h };
      for (const part of splitColumns(box)) out.push(part);
    }
    return out;
  } catch (_) {
    return [];
  }
}

/**
 * pdf.js hands back one run per line of text, so a form row reads as
 * "Signature of Customer          Date" — which would label the date line as a
 * place to sign. Split such a run back into its columns at the wide gaps,
 * spreading the run's width across the characters to estimate where each sits.
 */
function splitColumns(box) {
  if (!box.w || !/\s{3,}/.test(box.str)) return [box];
  const s = box.str;
  const parts = [];
  const re = /\S(?:[\s\S]*?\S)?(?=\s{3,}|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    parts.push({
      str: m[0],
      x: box.x + box.w * (m.index / s.length),
      y: box.y,
      w: box.w * (m[0].length / s.length),
      h: box.h
    });
  }
  return parts.length ? parts : [box];
}

function loadImage(buf, type) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buf], { type });
    const url = URL.createObjectURL(blob);
    const el = new Image();
    el.onload = () => resolve({ el, w: el.naturalWidth, h: el.naturalHeight, url });
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as a picture.')); };
    el.src = url;
  });
}
