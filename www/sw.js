/* Offline shell. Bump VERSION whenever the app files change. */
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        // Cache the PDF fonts and anything else we reach for at runtime.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});
