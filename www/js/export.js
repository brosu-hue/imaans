/* Flattens the placed signatures into real PDFs, then hands them to the phone.
   The signature becomes part of the page — there is no separate layer a viewer
   could switch off.

   Several documents can be open at once, appended into one scroll. At save time
   they either become one combined PDF or one file per document; either way each
   source is decrypted with its own password on the way through, so nothing
   comes out still locked unless a new password was asked for. */

/* pdf-lib is 620KB and is only ever needed at the moment somebody saves, so it
   is fetched then rather than on every visit. Reading these names at module
   level is what used to force the eager <script> tag. */
let PDFDocument, StandardFonts, degrees, rgb;
let libLoading = null;

function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!libLoading) {
    libLoading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = new URL('../vendor/pdf-lib.min.js', import.meta.url).toString();
      el.onload = () => window.PDFLib ? resolve(window.PDFLib)
                                      : reject(new Error('The PDF tools did not load properly.'));
      el.onerror = () => { libLoading = null; reject(new Error('The PDF tools could not be loaded.')); };
      document.head.appendChild(el);
    });
  }
  return libLoading;
}

async function ensureLib() {
  const lib = await loadPdfLib();
  PDFDocument = lib.PDFDocument;
  StandardFonts = lib.StandardFonts;
  degrees = lib.degrees;
  rgb = lib.rgb;
}

const MAX_IMAGE_EDGE = 2400;   // plenty for a document photo, kind to phone memory

/** Lets the phone repaint between the slow, synchronous stretches below. */
function frame() { return new Promise(r => setTimeout(r, 0)); }

/**
 * Builds the files to save.
 * @param {object} doc      the open document (one or more sources)
 * @param {object} [opts]   { combine } false to keep each source separate,
 *                          { password } to protect every result with,
 *                          { onStep } to report what is happening
 * @returns {Array} [{ filename, bytes }] in scroll order
 */
export async function buildOutputs(doc, opts) {
  const step = (opts && opts.onStep) || function () {};
  step('Getting the PDF tools ready…');
  await ensureLib();

  const separate = !!(opts && opts.combine === false);
  const built = separate ? await buildSeparate(doc, step) : await buildCombined(doc, step);

  const files = [];
  for (const b of built) {
    step(built.length > 1 ? 'Building ' + b.filename + '…' : 'Building the file…');
    await frame();                     // let that message actually appear
    files.push({ filename: b.filename, bytes: await finish(b.doc, opts) });
  }
  return files;
}

/** Applies the password the user asked for, if any, and serialises. */
async function finish(out, opts) {
  const password = opts && opts.password;
  if (password) {
    // The same password both opens the document and lifts its restrictions;
    // one password is what people expect, and two would be a trap.
    out.encrypt({ userPassword: password, ownerPassword: password });
  }
  return await out.save({ useObjectStreams: false });
}

/* ---------- one file holding every source, in scroll order ---------- */

async function buildCombined(doc, step) {
  const out = await PDFDocument.create();
  // Global page index -> the page of `out` it became. Built as the sources are
  // copied in rather than assumed, because a stamp only knows where its page
  // sits in the scroll and that is not where it sits in any one source.
  const pageOf = new Map();

  for (const src of doc.sources) {
    step('Adding ' + src.name + '…');
    if (src.bytes) {
      // Its OWN password: each source was unlocked separately when it opened.
      const loaded = await PDFDocument.load(src.bytes, { password: src.password || '' });
      const copied = await out.copyPages(loaded, loaded.getPageIndices());
      copied.forEach((p, i) => {
        out.addPage(p);
        if (i < src.pageCount) pageOf.set(src.firstPage + i, p);
      });
    } else {
      pageOf.set(src.firstPage, await addImagePage(out, doc.pages[src.firstPage], src));
    }
    await frame();
  }

  step('Placing your signatures…');
  await drawStamps(out, doc, doc.stamps, pageOf);
  return [{ doc: out, filename: combinedName(doc) }];
}

/* ---------- one file per source, each carrying only its own signatures ---------- */

async function buildSeparate(doc, step) {
  const built = [];
  const used = Object.create(null);

  for (const src of doc.sources) {
    const mine = doc.stamps.filter(st => {
      const rec = doc.pages[st.page];
      return rec && rec.sourceId === src.id;
    });
    // An untouched document does not need saving back out; handing someone a
    // copy of what they already have only makes them work out which is which.
    if (!mine.length) continue;

    step('Signing ' + src.name + '…');
    const pageOf = new Map();
    let out;
    if (src.bytes) {
      out = await PDFDocument.load(src.bytes, { password: src.password || '' });
      const pages = out.getPages();
      for (let i = 0; i < src.pageCount && i < pages.length; i++) pageOf.set(src.firstPage + i, pages[i]);
    } else {
      out = await PDFDocument.create();
      pageOf.set(src.firstPage, await addImagePage(out, doc.pages[src.firstPage], src));
    }

    await drawStamps(out, doc, mine, pageOf);
    built.push({ doc: out, filename: unique(used, safeName(src.name) + '-signed.pdf') });
    await frame();
  }
  return built;
}

/* ---------- cutting one document into several ---------- */

/**
 * Splits one PDF into a file per group of pages. Nothing is drawn and no
 * geometry is involved — the pages are copied across exactly as they are.
 * @param {object} source   { name, bytes, password, pageCount }
 * @param {Array}  groups   arrays of 0-based page indices, in order
 * @returns {Array} [{ filename, bytes }]
 */
export async function buildSplit(source, groups, opts) {
  const step = (opts && opts.onStep) || function () {};
  step('Getting the PDF tools ready…');
  await ensureLib();

  // Parsed once and copied from repeatedly: reloading it per output would read
  // a forty-page document forty times over.
  const src = await PDFDocument.load(source.bytes, { password: source.password || '' });
  const total = source.pageCount || src.getPageCount();
  const used = Object.create(null);
  const files = [];

  for (let i = 0; i < groups.length; i++) {
    step('Building file ' + (i + 1) + ' of ' + groups.length + '…');
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, groups[i]);
    copied.forEach(p => out.addPage(p));
    files.push({
      filename: unique(used, splitName(source.name, groups[i], String(total).length)),
      bytes: await finish(out, opts)
    });
    await frame();
  }
  return files;
}

/**
 * What one piece is called. The page numbers are the whole point — a week later
 * in Downloads, "agreement-pages-04-to-05.pdf" says exactly what it holds.
 * They are padded to the width of the document's own page count so the pieces
 * also sit in reading order in a folder sorted by name: page-02 before page-10.
 */
function splitName(name, group, width) {
  const at = (i) => String(i + 1).padStart(width, '0');
  const label = group.length === 1
    ? 'page-' + at(group[0])
    : 'pages-' + at(group[0]) + '-to-' + at(group[group.length - 1]);
  return safeName(name) + '-' + label + '.pdf';
}

/* ---------- drawing ---------- */

/**
 * Draws `stamps` onto `out`. One embedded copy of each signature image and one
 * font serve the whole output — the same signature on forty lines is forty
 * references to one PNG, not forty PNGs.
 */
async function drawStamps(out, doc, stamps, pageOf) {
  const images = new Map();
  let helv = null;
  let dropped = 0;

  for (const st of stamps) {
    const rec = doc.pages[st.page];
    const page = pageOf.get(st.page);
    // pdf-lib and pdf.js disagreeing about the pages is rare, but saying
    // "saved" over a document with no signature on it would be far worse.
    if (!rec || !page) { dropped++; continue; }

    const g = rec.vp1 ? geometry(rec.vp1, st) : flatGeometry(page, st);

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
        x: g.x + g.vx * lift,
        y: g.y + g.vy * lift,
        size: g.height,
        font: helv,
        color: rgb(0.06, 0.075, 0.09),
        rotate: degrees(g.angle)
      });
    }
  }

  if (dropped) {
    throw new Error(dropped === stamps.length
      ? 'The signatures could not be matched to the pages of this document, so nothing was saved.'
      : dropped + ' of your signatures could not be placed on the right page, so nothing was saved.');
  }
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
    vx: (pY[0] - p0[0]) / height, vy: (pY[1] - p0[1]) / height
  };
}

/** The same, for a page this app built itself around a photo: no rotation to undo. */
function flatGeometry(page, st) {
  const size = page.getSize();
  const width = st.wPct * size.width;
  const height = st.hPct * size.height;
  return {
    x: st.xPct * size.width,
    y: size.height - (st.yPct * size.height) - height,
    width, height, angle: 0, vx: 0, vy: 1
  };
}

/* ---------- source was a photo: wrap it in a page ---------- */

async function addImagePage(out, rec, src) {
  const box = rec.baseH >= rec.baseW ? { w: 595, h: 842 } : { w: 842, h: 595 };
  const fit = Math.min(box.w / rec.baseW, box.h / rec.baseH);
  const pw = rec.baseW * fit;
  const ph = rec.baseH * fit;

  const page = out.addPage([pw, ph]);
  const jpeg = await out.embedJpg(await reencodeJpeg(src.image.el, rec.baseW, rec.baseH));
  page.drawImage(jpeg, { x: 0, y: 0, width: pw, height: ph });
  return page;
}

/** Re-encodes through a canvas so any format the browser can show becomes an embeddable JPEG. */
async function reencodeJpeg(imgEl, w, h) {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(imgEl, 0, 0, c.width, c.height);
  // Straight to bytes: a data URL would be base64-encoded only to be decoded
  // again a line later, which on a big photo is megabytes of pointless string.
  if (c.toBlob) {
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (blob) return new Uint8Array(await blob.arrayBuffer());
  }
  return dataUrlToBytes(c.toDataURL('image/jpeg', 0.92));
}

/* ---------- naming ---------- */

function safeName(name) { return String(name || 'document').replace(/[\\/:*?"<>|]/g, '-'); }

/**
 * What the one combined file is called: the first document, and how many others
 * rode along with it — so a batch is recognisable in Downloads a week later.
 */
function combinedName(doc) {
  const first = safeName(doc.sources.length ? doc.sources[0].name : 'document');
  return doc.sources.length > 1
    ? first + '-and-' + (doc.sources.length - 1) + '-more-signed.pdf'
    : first + '-signed.pdf';
}

/** Two documents can share a name; two files in Downloads must not. */
function unique(used, filename) {
  if (!used[filename]) { used[filename] = 1; return filename; }
  const n = ++used[filename];
  const dot = filename.lastIndexOf('.');
  return filename.slice(0, dot) + ' (' + n + ')' + filename.slice(dot);
}

/* ---------- bytes ---------- */

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  let since = 0;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    // A big document is a lot of chunks; breathe now and then so the phone
    // does not look frozen.
    if (++since >= 16) { since = 0; await frame(); }
  }
  return btoa(s);
}

/* ---------- getting the files off the app ---------- */

/**
 * Saves or shares one finished PDF, using whatever the device actually supports.
 * @returns {string} what happened, for the confirmation message
 */
export async function deliver(bytes, filename) {
  // 1. Inside the Android app, hand it to the system so it lands in Downloads.
  //    This path never touches the Blob, so it must not pay for the copy below.
  if (window.InkSignAndroid && window.InkSignAndroid.saveBase64) {
    window.InkSignAndroid.saveBase64(filename, 'application/pdf', await bytesToBase64(bytes));
    return 'saved';
  }

  // ArrayBuffer copy: some engines dislike a Uint8Array view backed by a larger buffer.
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });

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
  download(blob, filename);
  return 'downloaded';
}

/**
 * The same for a whole batch. Every device that can take the files in one go
 * does — one write to Downloads, or one share sheet carrying all of them.
 */
export async function deliverMany(files) {
  if (!files.length) return 'cancelled';
  if (files.length === 1) return await deliver(files[0].bytes, files[0].filename);

  const bridge = window.InkSignAndroid;
  if (bridge && bridge.saveMany) {
    const payload = [];
    for (const f of files) {
      payload.push({ filename: f.filename, mime: 'application/pdf', base64: await bytesToBase64(f.bytes) });
    }
    bridge.saveMany(JSON.stringify(payload));
    return 'saved';
  }
  if (bridge && bridge.saveBase64) {
    // An older shell that only knows about one file at a time.
    for (const f of files) {
      bridge.saveBase64(f.filename, 'application/pdf', await bytesToBase64(f.bytes));
    }
    return 'saved';
  }

  // Build every File BEFORE asking to share: the share has to follow closely
  // enough on the tap that the browser still counts it as user-initiated, and
  // encoding several documents in between is exactly the sort of pause that
  // gets a share rejected.
  const shareable = files.map(f => new File([f.bytes.slice().buffer], f.filename, { type: 'application/pdf' }));
  try {
    if (navigator.canShare && navigator.share && navigator.canShare({ files: shareable })) {
      await navigator.share({ files: shareable, title: files.length + ' signed documents' });
      return 'shared';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    // fall through to plain downloads
  }

  // Desktop, with no share sheet: there is no such thing as a multi-file
  // download, so they go one at a time with a gap between them. Chrome asks
  // once whether the site may download more than one file and then takes the
  // lot; Safari saves the first and may quietly drop the rest, which is why
  // the app says how many it sent so a short download folder is noticeable.
  for (let i = 0; i < files.length; i++) {
    download(new Blob([files[i].bytes.slice().buffer], { type: 'application/pdf' }), files[i].filename);
    if (i < files.length - 1) await new Promise(r => setTimeout(r, 700));
  }
  return 'downloaded';
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
