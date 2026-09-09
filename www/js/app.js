import { SignaturePad } from './pad.js';
import { buildPdf, deliver } from './export.js';
import {
  hydrate, keepStorage, storageWorks,
  listSignatures, addSignature, deleteSignature,
  activeSignature, setActiveSignatureId,
  listRecents, noteRecent
} from './store.js';

const $ = (id) => document.getElementById(id);
const screens = {
  home: $('screen-home'),
  draw: $('screen-draw'),
  doc: $('screen-doc')
};

let pad = null;
let doc = null;
let padReturnsTo = 'home';

/* doc.js pulls in pdf.js (392KB). Nothing on the home screen needs either, so
   they are fetched the first time a document is actually opened. */
let SignDoc = null;
async function docModule() {
  if (!SignDoc) SignDoc = (await import('./doc.js')).SignDoc;
  return SignDoc;
}

/**
 * True while `d` is still the document on screen. Finding lines or reading a
 * page takes seconds, and the Back key works throughout — so by the time an
 * answer arrives the document it describes may be closed, or replaced by one
 * shared in from another app. Such an answer has to be dropped, not applied to
 * whatever is open now.
 */
function isCurrent(d) { return !!d && doc === d && !d.destroyed; }

/* ================= chrome ================= */

function show(name) {
  Object.keys(screens).forEach(k => screens[k].classList.toggle('is-active', k === name));
  if (name === 'draw' && pad) setTimeout(() => pad.resize(), 0);
}

let toastTimer = 0;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
}

let _busyCancel = null;
/** `onCancel` puts a Cancel button on the overlay; without one there is none. */
function busy(msg, onCancel) {
  $('busyMsg').textContent = msg || 'Working…';
  _busyCancel = onCancel || null;
  $('busyCancel').hidden = !onCancel;
  $('busy').hidden = false;
}
function idle() {
  $('busy').hidden = true;
  $('busyCancel').hidden = true;
  _busyCancel = null;
}
$('busyCancel').addEventListener('click', () => {
  const fn = _busyCancel;
  _busyCancel = null;
  $('busyCancel').hidden = true;
  if (fn) fn();
});

/** A bottom sheet with a title, a note and a stack of buttons. */
function sheet(opts) {
  const body = $('sheetBody');
  $('sheetTitle').textContent = opts.title || '';
  body.innerHTML = '';
  if (opts.note) {
    const p = document.createElement('p');
    p.textContent = opts.note;
    body.appendChild(p);
  }
  if (opts.extra) body.appendChild(opts.extra);
  (opts.actions || []).forEach(a => {
    if (!a) return;
    const b = document.createElement('button');
    b.className = 'sheet-act' + (a.cls ? ' ' + a.cls : '');
    b.textContent = a.label;
    b.addEventListener('click', () => {
      if (a.keepOpen !== true) closeSheet();
      if (a.fn) a.fn(b);
    });
    body.appendChild(b);
  });
  $('sheet').classList.toggle('is-compact', opts.compact === true);
  _sheetClosed = opts.onClose || null;
  $('scrim').hidden = false;
  $('sheet').hidden = false;
}

let _sheetClosed = null;
/**
 * A small menu at the point on the page that was tapped.
 * Anchored to the finger rather than shown as a bottom sheet, so it stays
 * obvious which spot on the page the choice applies to.
 */
function tapMenu(x, y, items) {
  closeTapMenu();
  const menu = document.createElement('div');
  menu.className = 'tapmenu';

  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'tapmenu-item' + (it.cls ? ' ' + it.cls : '');
    b.innerHTML = '<span class="tapmenu-ico">' + it.icon + '</span>';
    const label = document.createElement('span');
    label.textContent = it.label;
    b.appendChild(label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTapMenu();
      if (it.fn) it.fn();
    });
    menu.appendChild(b);
  });

  const scrim = document.createElement('div');
  scrim.className = 'tapmenu-scrim';
  scrim.addEventListener('pointerdown', (e) => { e.preventDefault(); closeTapMenu(); });

  document.body.appendChild(scrim);
  document.body.appendChild(menu);

  // Sit next to the finger, flipping near an edge so it is never off screen.
  const m = menu.getBoundingClientRect();
  const pad = 10;
  let left = x + 12;
  let top = y + 12;
  if (left + m.width > window.innerWidth - pad) left = x - m.width - 12;
  if (left < pad) left = pad;
  if (top + m.height > window.innerHeight - pad) top = y - m.height - 12;
  if (top < pad) top = pad;
  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';

  _tapMenu = menu;
  _tapScrim = scrim;
}

let _tapMenu = null, _tapScrim = null;
function closeTapMenu() {
  if (_tapMenu) { _tapMenu.remove(); _tapMenu = null; }
  if (_tapScrim) { _tapScrim.remove(); _tapScrim = null; }
}

function closeSheet() {
  $('sheet').hidden = true;
  $('scrim').hidden = true;
  const cb = _sheetClosed;
  _sheetClosed = null;
  if (cb) cb();
}

/**
 * Asks for a password. Resolves with what was typed, or null if the sheet was
 * dismissed any other way — so a caller waiting on it is never left hanging.
 */
function askPassword(opts) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    const form = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'pw-input';
    input.placeholder = opts.placeholder || 'Password';
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.spellcheck = false;
    form.appendChild(input);

    // Settle first, then close. Closing runs onClose, and a plain button would
    // otherwise let that cancel fire before the button's own answer landed.
    const answer = (v) => { done(v); closeSheet(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') answer(input.value); });

    sheet({
      title: opts.title,
      note: opts.note,
      extra: form,
      onClose: () => done(null),          // dismissed some other way
      actions: [
        { label: opts.confirm || 'Continue', cls: 'primary', keepOpen: true, fn: () => answer(input.value) },
        { label: 'Cancel', keepOpen: true, fn: () => answer(null) }
      ]
    });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 150);
  });
}
$('scrim').addEventListener('click', closeSheet);

document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-back]');
  if (b) leave(b.getAttribute('data-back'));
});

function leave(target) {
  // Nothing placed means nothing to lose, even if a stamp was added and
  // removed again — otherwise "Save it first" leads to a dead end.
  if (doc && doc.dirty && doc.stamps.length && screens.doc.classList.contains('is-active')) {
    sheet({
      title: 'Leave this document?',
      note: 'Your signatures have not been saved to a file yet.',
      actions: [
        { label: 'Save it first', cls: 'primary', fn: exportDoc },
        { label: 'Leave without saving', cls: 'danger', fn: () => { discardDoc(); show(target); } },
        { label: 'Stay here' }
      ]
    });
    return;
  }
  if (screens.doc.classList.contains('is-active')) discardDoc();
  show(target);
}

function discardDoc() {
  closeTapMenu();
  if (doc) { doc.destroy(); doc = null; }
  $('selBar').hidden = true;
}

/* ================= home ================= */

function renderHome() {
  const sigs = listSignatures();
  const active = activeSignature();
  const list = $('sigList');
  list.innerHTML = '';
  $('sigEmpty').hidden = sigs.length > 0;

  sigs.forEach(s => {
    const card = document.createElement('div');
    card.className = 'sig-card' + (active && active.id === s.id ? ' is-on' : '');

    const img = document.createElement('img');
    img.src = s.png;
    img.alt = 'Saved signature';
    card.appendChild(img);

    if (active && active.id === s.id) {
      const tag = document.createElement('span');
      tag.className = 'sig-tag';
      tag.textContent = 'in use';
      card.appendChild(tag);
    }

    const del = document.createElement('button');
    del.className = 'sig-del';
    del.textContent = '×';
    del.title = 'Delete this signature';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      sheet({
        title: 'Delete this signature?',
        actions: [
          { label: 'Delete', cls: 'danger', fn: () => { deleteSignature(s.id); renderHome(); } },
          { label: 'Keep it' }
        ]
      });
    });
    card.appendChild(del);

    card.addEventListener('click', () => { setActiveSignatureId(s.id); renderHome(); });
    list.appendChild(card);
  });

  const recs = listRecents();
  const rl = $('recList');
  rl.innerHTML = '';
  $('recEmpty').hidden = recs.length > 0;
  recs.forEach(r => {
    const row = document.createElement('button');
    row.className = 'rec';
    row.innerHTML = '<span>📄</span>';
    const t = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = r.name;
    const s = document.createElement('small');
    s.textContent = r.pages + (r.pages === 1 ? ' page' : ' pages') + ' · ' + when(r.at);
    t.appendChild(b); t.appendChild(s);
    row.appendChild(t);
    row.addEventListener('click', () => $('filePick').click());
    rl.appendChild(row);
  });
}

function when(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return d + ' days ago';
  return new Date(ts).toLocaleDateString();
}

/* The draw screen can be reached from a document, and going back must return
   there — dropping to Home would orphan a half-signed document. */
$('btnDrawBack').addEventListener('click', () => show(padReturnsTo === 'doc' && doc ? 'doc' : 'home'));

$('tileDraw').addEventListener('click', () => openPad('home'));
$('tileOpen').addEventListener('click', () => $('filePick').click());

/* ================= drawing ================= */

function openPad(returnTo) {
  padReturnsTo = returnTo || 'home';
  show('draw');
  if (!pad) {
    pad = new SignaturePad($('padCanvas'), {
      onChange: () => { $('padHint').classList.toggle('is-hidden', !pad.isEmpty()); }
    });
  }
  pad.clear();
  $('padHint').classList.remove('is-hidden');
  requestAnimationFrame(() => pad.resize());
}

$('btnUndo').addEventListener('click', () => pad && pad.undo());
$('btnClear').addEventListener('click', () => pad && pad.clear());

$('inkSwatches').addEventListener('click', (e) => {
  const b = e.target.closest('.swatch');
  if (!b || !pad) return;
  [].forEach.call($('inkSwatches').children, el => el.classList.remove('is-on'));
  b.classList.add('is-on');
  pad.setInk(b.getAttribute('data-ink'));
});

$('btnSaveSig').addEventListener('click', () => {
  if (!pad || pad.isEmpty()) { toast('Draw your signature first.'); return; }
  const out = pad.toPNG(320);
  if (!out) { toast('Draw your signature first.'); return; }
  addSignature(out);
  renderHome();
  if (!storageWorks()) warnNotKept();
  if (padReturnsTo === 'doc' && doc) {
    show('doc');
    toast('Signature saved. Tap "Sign all lines".');
  } else {
    show('home');
    toast('Signature saved.');
  }
});

/**
 * Some browsers refuse to keep anything between visits — a private window, or
 * a page opened straight from a file. Say so once, rather than letting the
 * signature quietly vanish next time.
 */
let warnedNotKept = false;
function warnNotKept() {
  if (warnedNotKept) return;
  warnedNotKept = true;
  sheet({
    title: 'This signature may not be kept',
    note: 'This browser is not letting the app store anything on the device, so your ' +
          'signature could be gone next time. Adding the app to your home screen, or ' +
          'using the Android app, keeps it properly.',
    actions: [{ label: 'OK', cls: 'primary' }]
  });
}

/* ================= opening a document ================= */

$('filePick').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  await openDocument(file);
});

async function openDocument(file) {
  discardDoc();
  busy('Opening…');
  let mine = null;
  try {
    const Doc = await docModule();
    mine = doc = new Doc($('pages'));
    doc.onSelect = onStampSelected;
    doc.onTap = onPageTapped;
    doc.onPasswordNeeded = (wrong) => {
      idle();
      return askPassword({
        title: wrong ? 'That password did not work' : 'This document is locked',
        note: 'Enter the password used to open it. It is only used on this phone.',
        confirm: 'Open'
      }).then((pw) => { if (pw !== null) busy('Opening…'); return pw; });
    };
    const n = await doc.load(file, (i, total) => busy('Opening page ' + i + ' of ' + total + '…'));
    if (doc !== mine) { mine.destroy(); return; }   // closed, or another file arrived
    $('docTitle').textContent = doc.name;
    $('docFoot').textContent = n + (n === 1 ? ' page' : ' pages') +
      ' · tap the page to add a signature';
    noteRecent(doc.name, n);
    renderHome();
    show('doc');
    $('docScroll').scrollTop = 0;
    doc.watchViewport($('docScroll'));
    // Work out the first page's lines now, so the first tap can snap to one
    // without the user waiting for it.
    mine.hitsFor(mine.pages[0]).catch(() => {});
  } catch (err) {
    if (mine && doc !== mine) { mine.destroy(); return; }
    discardDoc();
    show('home');
    sheet({
      title: 'That file would not open',
      note: (err && err.message) || 'The file may be damaged, or password protected.',
      actions: [{ label: 'OK', cls: 'primary' }]
    });
    return;
  } finally {
    idle();
  }
  if (!activeSignature()) {
    sheet({
      title: 'Draw your signature',
      note: 'You have not saved a signature yet. Draw it once and it will be reused every time.',
      actions: [{ label: 'Draw it now', cls: 'primary', fn: () => openPad('doc') }]
    });
  }
}

/* ================= placing by tapping ================= */

/** Tapping the page is the main way to place something. */
function onPageTapped(t) {
  if (!doc) return;
  const sig = activeSignature();
  tapMenu(t.clientX, t.clientY, [
    {
      icon: '✍️', label: 'Add signature', cls: 'primary',
      fn: () => sig ? placeTapped(t, { type: 'sig', sigId: sig.id, png: sig.png, w: sig.w, h: sig.h })
                    : needSignature()
    },
    { icon: '📅', label: 'Add today’s date', fn: () => placeTapped(t, { type: 'text', text: today() }) },
    { icon: '✕', label: 'Cancel', cls: 'quiet' }
  ]);
}

/**
 * Puts the chosen stamp where the page was tapped. If that was on or just
 * above a printed line, it sits on the line properly instead of floating
 * wherever the finger happened to land.
 */
async function placeTapped(t, spec) {
  const mine = doc;
  if (!mine) return;
  const rec = mine.pages[t.page];
  if (!rec) return;

  let line = null;
  try {
    await mine.hitsFor(rec);
    if (!isCurrent(mine)) return;
    line = mine.lineNear(rec, t.xPct, t.yPct);
  } catch (_) {
    // No detection is fine; place it exactly where they tapped.
    if (!isCurrent(mine)) return;
  }

  let st;
  if (line && spec.type === 'sig') {
    st = mine.placeSignatureOnLine(line, { id: spec.sigId, png: spec.png, w: spec.w, h: spec.h });
  } else if (line && spec.type === 'text') {
    st = mine.placeDateOnLine(line, spec.text);
  } else {
    st = mine.placeAtPoint(spec, t.page, t.xPct, t.yPct);
  }

  if (!st) return;
  mine.select(st);
  toast(line ? 'Placed on the line. Drag to adjust.' : 'Drag to adjust, or use the blue dot to resize.', 2800);
}

/* ================= signing ================= */

function needSignature() {
  const sig = activeSignature();
  if (sig) return sig;
  sheet({
    title: 'No signature yet',
    note: 'Draw your signature once — it is saved on this phone and reused every time.',
    actions: [{ label: 'Draw it now', cls: 'primary', fn: () => openPad('doc') }]
  });
  return null;
}

$('btnSignAll').addEventListener('click', async () => {
  const mine = doc;
  if (!mine) return;
  const sig = needSignature();
  if (!sig) return;

  // A long document is a long wait; there has to be a way out of it.
  const stop = () => mine.cancelFindLines();
  busy('Looking for signature lines…', stop);
  let hits;
  try {
    hits = await mine.findLines((i, total) => busy('Checking page ' + i + ' of ' + total + '…', stop));
  } catch (err) {
    idle();
    if (!isCurrent(mine) || (err && err.cancelled)) return;
    toast('Could not read this document.');
    return;
  }
  idle();
  if (!isCurrent(mine)) return;

  if (!hits.length) {
    sheet({
      title: 'No signature lines found',
      note: 'This page may have no printed lines, or the scan is too faint. You can still place your signature wherever you like.',
      actions: [
        { label: 'Place it myself', cls: 'primary', fn: () => $('btnAddSig').click() },
        { label: 'Cancel' }
      ]
    });
    return;
  }

  const labelled = hits.filter(h => h.kind === 'sig');
  const dateHits = hits.filter(h => h.kind === 'date');
  const plain = hits.filter(h => h.kind !== 'date' && h.kind !== 'grid');
  const selected = new Set((labelled.length ? labelled : plain).map(h => h.id));
  let withDates = false;

  // A date line gets the date, never a signature as well — otherwise "select
  // every line" and "also fill in the date" cancel each other out.
  const toSign = () => hits.filter(h => selected.has(h.id) && !(withDates && h.kind === 'date'));

  const count = document.createElement('p');
  const setCount = () => {
    const n = toSign().length;
    count.textContent = n + (n === 1 ? ' line selected.' : ' lines selected.');
  };
  setCount();

  mine.showHits(hits, selected, setCount);
  scrollToHit(mine, hits.find(h => selected.has(h.id)) || hits[0]);

  const actions = [
    {
      label: 'Sign the selected lines', cls: 'primary',
      fn: () => {
        if (!isCurrent(mine)) return;
        const chosen = toSign();
        chosen.forEach(h => mine.placeSignatureOnLine(h, sig));
        if (withDates) dateHits.forEach(h => mine.placeDateOnLine(h, today()));
        const dates = withDates ? dateHits.length : 0;
        toast(chosen.length + (chosen.length === 1 ? ' signature placed.' : ' signatures placed.') +
              (dates ? ' ' + dates + (dates === 1 ? ' date filled in.' : ' dates filled in.') : '') +
              ' Drag any of them to adjust.', 3600);
      }
    }
  ];

  if (selected.size < hits.length) {
    actions.push({
      label: 'Select every line instead (' + hits.length + ')',
      keepOpen: true,
      fn: (btn) => {
        hits.forEach(h => selected.add(h.id));
        mine.showHits(hits, selected, setCount);
        setCount();
        btn.disabled = true;
        btn.style.opacity = '.5';
      }
    });
  }

  if (dateHits.length) {
    actions.push({
      label: 'Also fill in today’s date (' + dateHits.length + ')',
      keepOpen: true,
      fn: (btn) => {
        withDates = !withDates;
        btn.textContent = (withDates ? '✓ ' : '') + 'Also fill in today’s date (' + dateHits.length + ')';
        btn.classList.toggle('primary', withDates);
        setCount();
      }
    });
  }

  actions.push({ label: 'Cancel' });

  sheet({
    compact: true,
    // However the sheet goes away — a button, the scrim, the Back key — the
    // boxes must go with it, or they sit there swallowing every tap.
    onClose: () => { if (isCurrent(mine)) mine.clearHits(); },
    title: (labelled.length ? labelled.length + ' signature line' + (labelled.length === 1 ? '' : 's') : hits.length + ' line' + (hits.length === 1 ? '' : 's')) + ' found',
    note: 'Blue boxes on the page show where your signature will go. Tap a box to include or skip it.',
    extra: count,
    actions
  });
});

/** Puts a line in the strip of screen the review sheet leaves visible. */
function scrollToHit(d, hit) {
  if (!hit) return;
  const rec = d.pages[hit.page];
  if (!rec) return;
  const scroller = $('docScroll');
  const top = rec.el.offsetTop + rec.el.clientHeight * hit.yPct - scroller.clientHeight * 0.22;
  scroller.scrollTo ? scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
                    : (scroller.scrollTop = Math.max(0, top));
}

$('btnAddSig').addEventListener('click', () => {
  if (!doc) return;
  if (!needSignature()) return;
  toast('Tap the page where you want it — on a line if there is one.', 3600);
});

$('btnPickSig').addEventListener('click', () => {
  const sigs = listSignatures();
  const pick = document.createElement('div');
  pick.className = 'sheet-pick';
  const current = activeSignature();
  sigs.forEach(s => {
    const card = document.createElement('div');
    card.className = 'sig-card' + (current && current.id === s.id ? ' is-on' : '');
    const img = document.createElement('img');
    img.src = s.png;
    img.alt = 'Saved signature';
    card.appendChild(img);
    card.addEventListener('click', () => {
      setActiveSignatureId(s.id);
      closeSheet();
      renderHome();
      toast('Signature switched.');
    });
    pick.appendChild(card);
  });
  sheet({
    title: 'Which signature?',
    note: sigs.length ? 'New stamps will use the one you pick.' : 'You have not drawn one yet.',
    extra: pick,
    actions: [{ label: 'Draw a new one', fn: () => openPad('doc') }]
  });
});

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

/* ================= selection bar ================= */

function onStampSelected(st) {
  $('selBar').hidden = !st;
}
$('btnSelBigger').addEventListener('click', () => doc && doc.scaleSelected(1.12));
$('btnSelSmaller').addEventListener('click', () => doc && doc.scaleSelected(1 / 1.12));
$('btnSelDelete').addEventListener('click', () => doc && doc.removeSelected());
$('btnSelDone').addEventListener('click', () => doc && doc.select(null));

/* ================= saving ================= */

function exportDoc() {
  if (!doc) return;
  if (!doc.stamps.length) {
    toast('Nothing has been signed yet.');
    return;
  }
  sheet({
    title: 'Save the signed document',
    note: 'A password is optional. Without one it opens like any normal PDF.',
    actions: [
      { label: 'Save without a password', cls: 'primary', fn: () => runExport(null) },
      { label: 'Protect it with a password', fn: askForExportPassword },
      { label: 'Cancel' }
    ]
  });
}

async function askForExportPassword() {
  const pw = await askPassword({
    title: 'Choose a password',
    note: 'Anyone opening the signed PDF will have to type this. Keep a note of it — it cannot be recovered.',
    confirm: 'Save with this password'
  });
  if (pw === null) return;
  if (!pw.trim()) { toast('No password typed — nothing saved.'); return; }
  runExport(pw);
}

async function runExport(password) {
  const mine = doc;
  if (!mine) return;
  busy('Preparing your signed PDF…');
  try {
    const bytes = await buildPdf(mine, { password, onStep: (m) => busy(m) });
    const filename = mine.name.replace(/[\\/:*?"<>|]/g, '-') + '-signed.pdf';
    idle();
    // The share sheet can sit open for a while, and the document may be closed
    // behind it — but the file really was saved, so say so.
    const how = await deliver(bytes, filename);
    if (how !== 'cancelled') mine.dirty = false;
    if (how === 'saved') offerShare(filename, !!password);
    else if (how === 'shared') toast(password ? 'Shared — it will ask for your password.' : 'Shared.');
    else if (how === 'downloaded') toast('Downloaded: ' + filename, 3400);
  } catch (err) {
    idle();
    sheet({
      title: 'Could not save',
      note: (err && err.message) || 'Something went wrong building the PDF.',
      actions: [{ label: 'OK', cls: 'primary' }]
    });
  } finally {
    idle();
  }
}
$('btnExport').addEventListener('click', exportDoc);

/** Inside the Android app the file is already in Downloads — offer to send it on. */
function offerShare(filename, protectedFile) {
  const bridge = window.InkSignAndroid;
  if (!bridge || !bridge.shareLast) { toast('Saved.', 3400); return; }
  sheet({
    title: 'Saved to Downloads',
    note: filename + (protectedFile ? ' — it will ask for your password when opened.' : ''),
    actions: [
      { label: 'Send it to someone', cls: 'primary', fn: () => { try { bridge.shareLast(); } catch (_) {} } },
      { label: 'Done' }
    ]
  });
}

/* ================= the Android shell talks to the app through these ================= */

/** Android's Back key. Returns true when the app consumed it, false to close the app. */
window.inkSignBack = function () {
  // Back during a long job should stop the job, not walk out from under it.
  if (!$('busy').hidden) {
    if (_busyCancel) $('busyCancel').click();
    return true;
  }
  if (_tapMenu) { closeTapMenu(); return true; }
  if (!$('sheet').hidden) { closeSheet(); return true; }
  if (doc && doc.selected) { doc.select(null); return true; }
  if (screens.draw.classList.contains('is-active')) { show(padReturnsTo === 'doc' && doc ? 'doc' : 'home'); return true; }
  if (screens.doc.classList.contains('is-active')) { leave('home'); return true; }
  return false;
};

/**
 * A PDF or picture shared into the app, handed over as a URL the shell serves
 * from its own storage. Preferred over the base64 route below: that one has to
 * carry the whole file through a JavaScript string, which for a large document
 * costs several times its size in memory on both sides.
 */
window.inkSignOpenFileUrl = function (name, mime, url) {
  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.blob();
    })
    .then((blob) => openDocument(new File([blob], name || 'document',
      { type: mime || 'application/pdf' })))
    .catch(() => {
      // Ask the shell to send it the old way rather than losing the document.
      const bridge = window.InkSignAndroid;
      if (bridge && bridge.inboxFailed) bridge.inboxFailed();
      else toast('That file could not be opened.');
    });
};

/** The same thing, carried as base64. Kept for older shells and as a fallback. */
window.inkSignOpenFile = function (name, mime, base64) {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    openDocument(new File([bytes], name || 'document', { type: mime || 'application/pdf' }));
  } catch (_) {
    toast('That file could not be opened.');
  }
};

/* ================= install to home screen ================= */

let deferredPrompt = null;
const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const inAndroidApp = !!window.InkSignAndroid;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!standalone && !inAndroidApp) $('btnInstall').hidden = false;
});

if (isIOS && !standalone && !inAndroidApp) $('btnInstall').hidden = false;

$('btnInstall').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const res = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (res && res.outcome === 'accepted') $('btnInstall').hidden = true;
    return;
  }
  sheet({
    title: 'Add to your home screen',
    note: 'Tap the Share button at the bottom of Safari, scroll down and choose "Add to Home Screen". It then opens like a normal app and works without signal.',
    actions: [{ label: 'Got it', cls: 'primary' }]
  });
});

/* ================= misc wiring ================= */

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (pad && screens.draw.classList.contains('is-active')) pad.resize();
    if (doc) doc.relayoutText();
  }, 150);
});

// Stop iOS from rubber-banding the whole page behind the app.
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scroll, .sheet, .draw-wrap, .doc-tools')) e.preventDefault();
}, { passive: false });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Load what was saved before the first render, and ask the browser to hang on
// to it, so a signature drawn once is still there next time.
hydrate().then(() => {
  keepStorage();
  renderHome();
  // The Android shell holds any document shared into the app until the page
  // says it can take it; without this it guesses at a delay and a slow start
  // loses the file.
  try {
    const bridge = window.InkSignAndroid;
    if (bridge && bridge.ready) bridge.ready();
  } catch (_) {}
});
