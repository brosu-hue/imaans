/* Signature pad: velocity-tapered strokes, undo, and a trimmed transparent PNG on save.
   Strokes are kept as point data so "Save" can re-render at high resolution
   instead of upscaling the low-res screen canvas. */

const MAX_DPR = 3;

export class SignaturePad {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ink = opts.ink || '#101317';
    this.strokes = [];      // [[{x,y,w}, ...], ...] in CSS pixels
    this.current = null;
    this.lastT = 0;
    this.lastW = 0;
    this.onChange = opts.onChange || function () {};
    this._bind();
  }

  /* ----- sizing ----- */

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  setInk(colour) {
    this.ink = colour;
    this.redraw();
  }

  /* ----- input ----- */

  _bind() {
    const c = this.canvas;
    const start = (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      if (c.setPointerCapture && e.pointerId != null) {
        try { c.setPointerCapture(e.pointerId); } catch (_) {}
      }
      this.current = [];
      this.lastT = e.timeStamp || Date.now();
      this.lastW = 0;
      this._addPoint(e);
    };
    const move = (e) => {
      if (!this.current) return;
      e.preventDefault();
      // Coalesced events give a much smoother line on high-refresh screens.
      const evts = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
      for (let i = 0; i < evts.length; i++) this._addPoint(evts[i], e.timeStamp);
    };
    const end = (e) => {
      if (!this.current) return;
      e.preventDefault();
      if (this.current.length === 1) {
        // A tap should still leave a dot.
        const p = this.current[0];
        this.current.push({ x: p.x + 0.6, y: p.y + 0.6, w: p.w });
      }
      if (this.current.length > 1) this.strokes.push(this.current);
      this.current = null;
      this.redraw();
      this.onChange();
    };

    if (window.PointerEvent) {
      c.addEventListener('pointerdown', start);
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', end);
    } else {
      // Older WebKit without Pointer Events.
      const t = (fn) => (e) => { const to = e.changedTouches && e.changedTouches[0]; if (to) { to.timeStamp = e.timeStamp; to.preventDefault = () => e.preventDefault(); fn(to); } };
      c.addEventListener('touchstart', t(start), { passive: false });
      c.addEventListener('touchmove', t(move), { passive: false });
      c.addEventListener('touchend', t(end), { passive: false });
      c.addEventListener('mousedown', start);
      c.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
    }
  }

  _addPoint(e, tsOverride) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const pts = this.current;
    const prev = pts.length ? pts[pts.length - 1] : null;

    const now = tsOverride || e.timeStamp || Date.now();
    let width;
    if (!prev) {
      width = 2.4;
    } else {
      const dx = x - prev.x, dy = y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.6) return; // ignore jitter
      const dt = Math.max(now - this.lastT, 1);
      const v = dist / dt;                       // px per ms
      const target = Math.max(1.1, 4.2 - v * 2.6);
      width = this.lastW ? this.lastW * 0.65 + target * 0.35 : target;
    }
    this.lastT = now;
    this.lastW = width;
    pts.push({ x, y, w: width });

    if (pts.length > 1) this._drawSegment(this.ctx, pts, pts.length - 1, 1, 0, 0);
  }

  /* ----- rendering ----- */

  /** Draws the segment ending at index i of a point array. */
  _drawSegment(ctx, pts, i, scale, ox, oy) {
    const a = pts[i - 1], b = pts[i];
    const prev = i > 1 ? pts[i - 2] : a;
    const m1 = { x: (prev.x + a.x) / 2, y: (prev.y + a.y) / 2 };
    const m2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    ctx.strokeStyle = this.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.4, b.w * scale);
    ctx.beginPath();
    ctx.moveTo((m1.x - ox) * scale, (m1.y - oy) * scale);
    ctx.quadraticCurveTo((a.x - ox) * scale, (a.y - oy) * scale, (m2.x - ox) * scale, (m2.y - oy) * scale);
    ctx.stroke();
  }

  _paint(ctx, strokes, scale, ox, oy) {
    for (let s = 0; s < strokes.length; s++) {
      const pts = strokes[s];
      for (let i = 1; i < pts.length; i++) this._drawSegment(ctx, pts, i, scale, ox, oy);
    }
  }

  redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssW || 0, this.cssH || 0);
    this._paint(ctx, this.strokes, 1, 0, 0);
    if (this.current && this.current.length > 1) this._paint(ctx, [this.current], 1, 0, 0);
  }

  /* ----- actions ----- */

  isEmpty() { return this.strokes.length === 0; }

  undo() {
    this.strokes.pop();
    this.redraw();
    this.onChange();
  }

  clear() {
    this.strokes = [];
    this.current = null;
    this.redraw();
    this.onChange();
  }

  /** Tight bounding box of the drawn ink, in CSS pixels. */
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pts of this.strokes) {
      for (const p of pts) {
        const r = p.w / 2 + 0.5;
        if (p.x - r < x0) x0 = p.x - r;
        if (p.y - r < y0) y0 = p.y - r;
        if (p.x + r > x1) x1 = p.x + r;
        if (p.y + r > y1) y1 = p.y + r;
      }
    }
    if (x0 === Infinity) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Re-renders the ink at high resolution, cropped to its bounding box,
   * on a transparent background. Returns { png, w, h }.
   */
  toPNG(targetHeight) {
    const b = this.bounds();
    if (!b) return null;
    targetHeight = targetHeight || 300;

    const padCss = Math.max(4, b.h * 0.06);
    const bw = b.w + padCss * 2;
    const bh = b.h + padCss * 2;
    // Scale up to a crisp stamp, but never produce a silly-large bitmap.
    let scale = targetHeight / bh;
    scale = Math.max(1, Math.min(scale, 4000 / bw, 12));

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(bw * scale));
    out.height = Math.max(1, Math.round(bh * scale));
    const octx = out.getContext('2d');
    this._paint(octx, this.strokes, scale, b.x - padCss, b.y - padCss);

    return { png: out.toDataURL('image/png'), w: out.width, h: out.height };
  }
}
