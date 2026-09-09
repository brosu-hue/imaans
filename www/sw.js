/*
 * Offline shell.
 *
 * VERSION is what decides whether an installed app ever sees a new build: the
 * browser only installs a worker whose bytes differ from the one it has. The
 * published copy gets the commit stamped into the line below at build time, so
 * every deploy is a new worker. The value here is only for local development.
 */
const VERSION = 'inksign-v1';

const SHELL = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/pad.js',
  'js/doc.js',
  'js/detect.js',
  'js/export.js',
  'js/store.js',
  'vendor/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs',
  'vendor/pdf-lib.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // One bad URL must not sink the whole install.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The pdf.js and pdf-lib builds never change without their filename changing,
   and they are by far the largest files here, so they are answered from the
   cache and never checked again. */
function isImmutable(url) {
  return url.pathname.indexOf('/vendor/') !== -1;
}

function put(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit && isImmutable(url)) return hit;

      const fresh = fetch(req)
        .then(res => put(req, res))
        .catch(() => {
          // Offline. A page still gets the shell; anything else fails as it
          // would on the network, because answering a script or a stylesheet
          // with the HTML of index.html only produces a baffling parse error.
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        });

      // Serve what we have and refresh it in the background, so the next start
      // is on the new build rather than pinned to whatever installed first.
      if (hit) {
        // Keeping the worker alive for the refresh is a bonus, not a
        // requirement, and the event may already have settled by now.
        try { e.waitUntil(fresh.catch(() => {})); } catch (_) { }
        return hit;
      }
      return fresh;
    })
  );
});
