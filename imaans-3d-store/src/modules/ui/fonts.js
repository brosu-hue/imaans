// IMAANS typography (all SIL OFL 1.1, via @fontsource; the .woff2 files live next to this file):
//   Cinzel 500/600  — wide classical Roman capitals (Trajan feel) = the IMAANS wordmark lettering.
//                     ctx.fonts.display → canvas signage / department boards drawn by other modules.
//   Marcellus 400   — flared classical serif WITH lowercase, for mixed-case headings (product names,
//                     page titles) where Cinzel's small caps would read as shouting.
//   Jost 400/500    — clean geometric sans for the UI and "SHOES & CLOTHING" spaced caps.
//
// Production (esbuild IIFE bundle): the dynamic imports below are bundled with the `.woff2: dataurl`
// loader, so each resolves instantly to a `data:font/woff2;base64,…` URL — no network, no CDN.
// Dev (native ESM via src/dev.html: import map + window.__ASSET_BASE === '/assets/'): browsers cannot import a
// .woff2, so those imports are never executed there; the files are fetched from /src/modules/ui/fonts/.

export const DISPLAY = 'Cinzel';
export const HEAD = 'Marcellus';
export const SANS = 'Jost';

/** CSS / canvas font stacks (family lists, no weight/size). */
export const STACKS = {
  display: `"${DISPLAY}", "Trajan Pro", "Marcellus", Georgia, "Times New Roman", serif`,
  head: `"${HEAD}", "${DISPLAY}", Georgia, "Times New Roman", serif`,
  sans: `"${SANS}", "Avenir Next", Futura, "Century Gothic", "Segoe UI", system-ui, sans-serif`,
};

const FACES = [
  { family: DISPLAY, weight: '500', file: 'cinzel-latin-500-normal.woff2', load: () => import('./fonts/cinzel-latin-500-normal.woff2') },
  { family: DISPLAY, weight: '600', file: 'cinzel-latin-600-normal.woff2', load: () => import('./fonts/cinzel-latin-600-normal.woff2') },
  { family: HEAD, weight: '400', file: 'marcellus-latin-400-normal.woff2', load: () => import('./fonts/marcellus-latin-400-normal.woff2') },
  { family: SANS, weight: '400', file: 'jost-latin-400-normal.woff2', load: () => import('./fonts/jost-latin-400-normal.woff2') },
  { family: SANS, weight: '500', file: 'jost-latin-500-normal.woff2', load: () => import('./fonts/jost-latin-500-normal.woff2') },
];

// dev = src/dev.html (import map + '/assets/' base). The production page has no import map, so a website that
// happens to serve the store's assets from '/assets/' still gets the bundled data-URI fonts.
const isDev = () => typeof window !== 'undefined' && window.__ASSET_BASE === '/assets/' && !!document.querySelector('script[type="importmap"]');

let _p = null;
/** Registers the faces with document.fonts. Resolves (never rejects) with true when all are usable. */
export function loadFonts() {
  if (_p) return _p;
  if (typeof FontFace === 'undefined' || !document.fonts) return (_p = Promise.resolve(false));
  const dev = isDev();
  _p = Promise.all(FACES.map(async (f) => {
    try {
      let src;
      if (dev) src = `url(/src/modules/ui/fonts/${f.file}) format('woff2')`;
      else { const m = await f.load(); src = `url(${m.default || m}) format('woff2')`; }
      const face = new FontFace(f.family, src, { weight: f.weight, style: 'normal', display: 'swap' });
      document.fonts.add(face);
      await face.load();
      return true;
    } catch (e) {
      console.warn('[ui] font failed', f.file, e && e.message);
      return false;
    }
  })).then(r => r.every(Boolean));
  return _p;
}
