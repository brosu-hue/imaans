/* Flattens the placed signatures into a real PDF, then hands it to the phone.
   The signature becomes part of the page — there is no separate layer a viewer
   could switch off. */

const { PDFDocument, StandardFonts, degrees, rgb } = window.PDFLib;

const MAX_IMAGE_EDGE = 2400;   // plenty for a document photo, kind to phone memory

/** @returns {Uint8Array} the finished PDF */
export async function buildPdf(doc) {
  return doc.pdf ? await fromPdf(doc) : await fromImage(doc);
}

/* ---------- source was a PDF: draw onto the original, untouched pages ---------- */

async function fromPdf(doc) {
  const out = await PDFDocument.load(doc.bytes, { ignoreEncryption: true });
  const pages = out.getPages();
  const images = new Map();
  let helv = null;

  for (const st of doc.stamps) {
    const rec = doc.pages[st.page];
    const page = pages[st.page];
    if (!rec || !page || !rec.vp1) continue;

    const g = geometry(rec.vp1, st);

    if (st.type === 'sig') {
      let img = images.get(st.png);
      if (!img) { img = await out.embedPng(dataUrlToBytes(st.png)); images.set(st.png, img); }
      page.drawImage(img, {
        x: g.x, y: g.y, width: g.width, height: g.height, rotate: degrees(g.angle)
      });
    } else {
      if (!helv) helv = await out.embedFont(StandardFonts.Helvetica);
      // drawText anchors on the baseline, which sits a little above the box bottom.
      const lift = g.height * 0.21;
      page.drawText(st.text, {
        x: g.x + g.ux * 0 + g.vx * lift,
        y: g.y + g.uy * 0 + g.vy * lift,
        size: g.height,
        font: helv,
        color: rgb(0.06, 0.075, 0.09),
        rotate: degrees(g.angle)
      });
    }
  }
  return await out.save({ useObjectStreams: false });
}

/**
 * Maps a stamp's position (a fraction of the page) into PDF points.
 * Goes through pdf.js's own viewport maths so rotated and cropped pages
 * land in the right place instead of being guessed at.
 */
function geometry(vp1, st) {
  const cx = st.xPct * vp1.width;
  const cy = st.yPct * vp1.height;
  const cw = st.wPct * vp1.width;
  const ch = st.hPct * vp1.height;

  const p0 = vp1.convertToPdfPoint(cx, cy + ch);        // bottom-left of the stamp
  const pX = vp1.convertToPdfPoint(cx + cw, cy + ch);   // along the stamp's width
  const pY = vp1.convertToPdfPoint(cx, cy);             // along the stamp's height

  const width = Math.hypot(pX[0] - p0[0], pX[1] - p0[1]) || 1;
  const height = Math.hypot(pY[0] - p0[0], pY[1] - p0[1]) || 1;
  const angle = Math.atan2(pX[1] - p0[1], pX[0] - p0[0]) * 180 / Math.PI;

  return {
    x: p0[0], y: p0[1], width, height, angle,
    ux: (pX[0] - p0[0]) / width, uy: (pX[1] - p0[1]) / width,
    vx: (pY[0] - p0[0]) / height, vy: (pY[1] - p0[1]) / height
  };
}

/* ---------- source was a photo: wrap it in a page and stamp that ---------- */

async function fromImage(doc) {
  const out = await PDFDocument.create();
  const rec = doc.pages[0];

  const box = rec.baseH >= rec.baseW ? { w: 595, h: 842 } : { w: 842, h: 595 };
  const fit = Math.min(box.w / rec.baseW, box.h / rec.baseH);
  const pw = rec.baseW * fit;
  const ph = rec.baseH * fit;

  const page = out.addPage([pw, ph]);
  const jpeg = await out.embedJpg(reencodeJpeg(doc.image.el, rec.baseW, rec.baseH));
  page.drawImage(jpeg, { x: 0, y: 0, width: pw, height: ph });

  const images = new Map();
  let helv = null;

  for (const st of doc.stamps) {
    const x = st.xPct * pw;
    const w = st.wPct * pw;
    const h = st.hPct * ph;
    const y = ph - (st.yPct * ph) - h;

    if (st.type === 'sig') {
      let img = images.get(st.png);
      if (!img) { img = await out.embedPng(dataUrlToBytes(st.png)); images.set(st.png, img); }
      page.drawImage(img, { x, y, width: w, height: h });
    } else {
      if (!helv) helv = await out.embedFont(StandardFonts.Helvetica);
      page.drawText(st.text, { x, y: y + h * 0.21, size: h, font: helv, color: rgb(0.06, 0.075, 0.09) });
    }
  }
  return await out.save({ useObjectStreams: false });
}

/** Re-encodes through a canvas so any format the browser can show becomes an embeddable JPEG. */
function reencodeJpeg(imgEl, w, h) {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(imgEl, 0, 0, c.width, c.height);
  return dataUrlToBytes(c.toDataURL('image/jpeg', 0.92));
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

/* ---------- getting the file off the app ---------- */

/**
 * Saves or shares the finished PDF, using whatever the device actually supports.
 * @returns {string} what happened, for the confirmation message
 */
export async function deliver(bytes, filename) {
  // ArrayBuffer copy: some engines dislike a Uint8Array view backed by a larger buffer.
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });

  // 1. Inside the Android app, hand it to the system so it lands in Downloads.
  if (window.InkSignAndroid && window.InkSignAndroid.saveBase64) {
    window.InkSignAndroid.saveBase64(filename, 'application/pdf', bytesToBase64(bytes));
    return 'saved';
  }

  // 2. iPhone / modern Android browser: the share sheet (Files, Mail, WhatsApp…).
  try {
    if (navigator.canShare && navigator.share) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    // fall through to a plain download
  }

  // 3. Anything else: a normal download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
