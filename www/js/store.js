/* On-device storage. Nothing here ever leaves the phone.
 *
 * Your signature has to survive closing the app, so it is written to every
 * durable place available and read back from the best one at startup:
 *
 *   1. the Android app's own file storage, through the native bridge — this
 *      outlives even a clearing of the browser data inside the app;
 *   2. IndexedDB, which browsers keep far more reliably than localStorage;
 *   3. localStorage, as a last resort.
 *
 * The rest of the app reads state synchronously, so everything is held in
 * memory and `hydrate()` fills it once before the first render.
 */

const KEY = 'inksign.state.v2';
const LEGACY = { sigs: 'inksign.signatures.v1', pick: 'inksign.activeSig.v1', recents: 'inksign.recents.v1' };
const DB_NAME = 'inksign';
const DB_STORE = 'state';
const MAX_SIGNATURES = 8;

const state = { signatures: [], activeId: null, recents: [] };
let durable = false;   // did anything actually keep the last write?

/* ---------- IndexedDB, wrapped just enough ---------- */

function idb() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (_) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(DB_STORE); } catch (_) {}
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbGet() {
  return idb().then(db => new Promise((resolve) => {
    if (!db) { resolve(null); return; }
    try {
      const r = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  })).catch(() => null);
}

function idbPut(value) {
  return idb().then(db => new Promise((resolve) => {
    if (!db) { resolve(false); return; }
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (_) { resolve(false); }
  })).catch(() => false);
}

/* ---------- the Android app's own files ---------- */

const bridge = () => (typeof window !== 'undefined' ? window.InkSignAndroid : null);

function nativeRead() {
  const b = bridge();
  if (!b || !b.readStore) return null;
  try {
    const raw = b.readStore();
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function nativeWrite(value) {
  const b = bridge();
  if (!b || !b.writeStore) return false;
  try {
    b.writeStore(JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

/* ---------- localStorage ---------- */

function localRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;   // private mode, or storage blocked entirely
  }
}

function localWrite(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;  // full, or blocked
  }
}

/* ---------- loading and saving ---------- */

function adopt(data) {
  if (!data || typeof data !== 'object') return false;
  state.signatures = Array.isArray(data.signatures) ? data.signatures : [];
  state.activeId = data.activeId || null;
  state.recents = Array.isArray(data.recents) ? data.recents : [];
  return true;
}

/** Reads state back from the most durable place that has it. */
export async function hydrate() {
  if (adopt(nativeRead())) { durable = true; return; }

  const fromIdb = await idbGet();
  if (adopt(fromIdb)) {
    durable = true;
    nativeWrite(state);           // seed the app's files if it just gained them
    return;
  }

  if (adopt(localRead(KEY))) {
    durable = true;
    persist();                    // promote it to the better layers
    return;
  }

  // Anything saved by an earlier version.
  const oldSigs = localRead(LEGACY.sigs);
  if (Array.isArray(oldSigs) && oldSigs.length) {
    state.signatures = oldSigs;
    state.activeId = localRead(LEGACY.pick);
    state.recents = localRead(LEGACY.recents) || [];
    persist();
    return;
  }

  // Nothing stored yet: find out whether anything *can* be, so the app can say
  // so rather than quietly forgetting the next signature.
  durable = await probe();
}

async function probe() {
  if (nativeWrite(state)) return true;
  if (await idbPut(state)) return true;
  return localWrite(state);
}

/** Writes to every layer. Synchronous callers do not wait for this. */
function persist() {
  const snapshot = {
    signatures: state.signatures,
    activeId: state.activeId,
    recents: state.recents
  };
  const native = nativeWrite(snapshot);
  const local = localWrite(snapshot);
  if (native || local) durable = true;
  idbPut(snapshot).then((ok) => { if (ok) durable = true; });
}

/**
 * Asks the browser not to throw this away when space runs short. Safari and
 * Chrome both evict "best effort" storage; persisted storage survives.
 */
export function keepStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
  } catch (_) {}
  return Promise.resolve(false);
}

/** False when nothing on this device would keep a signature between visits. */
export function storageWorks() { return durable; }

/* ---------- signatures ---------- */

export function listSignatures() { return state.signatures.slice(); }

export function addSignature(sig) {
  const rec = {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    png: sig.png,
    w: sig.w,
    h: sig.h,
    createdAt: Date.now()
  };
  state.signatures.unshift(rec);
  state.signatures = state.signatures.slice(0, MAX_SIGNATURES);
  state.activeId = rec.id;
  persist();
  return rec;
}

export function deleteSignature(id) {
  state.signatures = state.signatures.filter(s => s.id !== id);
  if (state.activeId === id) {
    state.activeId = state.signatures.length ? state.signatures[0].id : null;
  }
  persist();
}

export function activeSignatureId() { return state.activeId; }

export function setActiveSignatureId(id) {
  state.activeId = id;
  persist();
}

/** The signature new stamps should use, or null if none is saved yet. */
export function activeSignature() {
  if (!state.signatures.length) return null;
  return state.signatures.find(s => s.id === state.activeId) || state.signatures[0];
}

export function getSignature(id) {
  return state.signatures.find(s => s.id === id) || null;
}

/* ---------- recent documents (names only — never the file itself) ---------- */

export function listRecents() { return state.recents.slice(); }

export function noteRecent(name, pages) {
  state.recents = [{ name, pages, at: Date.now() }]
    .concat(state.recents.filter(r => r.name !== name))
    .slice(0, 6);
  persist();
}
