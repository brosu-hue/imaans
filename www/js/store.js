/* Local, on-device storage. Nothing here ever leaves the phone. */

const SIG_KEY = 'inksign.signatures.v1';
const REC_KEY = 'inksign.recents.v1';
const PICK_KEY = 'inksign.activeSig.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false; // private mode / quota — the app still works for this session
  }
}

/* ---------- signatures ---------- */

export function listSignatures() {
  const all = read(SIG_KEY, []);
  return Array.isArray(all) ? all : [];
}

export function addSignature(sig) {
  const all = listSignatures();
  const rec = {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    png: sig.png,
    w: sig.w,
    h: sig.h,
    createdAt: Date.now()
  };
  all.unshift(rec);
  // A handful is plenty, and localStorage is small.
  const ok = write(SIG_KEY, all.slice(0, 8));
  if (!ok) throw new Error('There is no room left to save on this device.');
  setActiveSignatureId(rec.id);
  return rec;
}

export function deleteSignature(id) {
  const all = listSignatures().filter(s => s.id !== id);
  write(SIG_KEY, all);
  if (activeSignatureId() === id) {
    setActiveSignatureId(all.length ? all[0].id : null);
  }
}

export function activeSignatureId() {
  return read(PICK_KEY, null);
}

export function setActiveSignatureId(id) {
  write(PICK_KEY, id);
}

/** The signature that new stamps should use, or null if none is saved yet. */
export function activeSignature() {
  const all = listSignatures();
  if (!all.length) return null;
  const id = activeSignatureId();
  return all.find(s => s.id === id) || all[0];
}

export function getSignature(id) {
  return listSignatures().find(s => s.id === id) || null;
}

/* ---------- recent documents (names only — never the file itself) ---------- */

export function listRecents() {
  const all = read(REC_KEY, []);
  return Array.isArray(all) ? all : [];
}

export function noteRecent(name, pages) {
  const all = listRecents().filter(r => r.name !== name);
  all.unshift({ name, pages, at: Date.now() });
  write(REC_KEY, all.slice(0, 6));
}
