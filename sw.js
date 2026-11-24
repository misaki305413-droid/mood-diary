const CACHE_NAME = 'mood-diary-v18';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/base.css',
  './src/app.js',
  './src/store.js',
  './src/db.js',
  './src/crypto.js',
  './src/models.js',
  './src/zip.js',
  './src/backup.js',
  './src/charts.js',
  './src/ui.js',
  './src/entryCard.js',
  './src/photoViewer.js',
  './src/demo.js',
  './src/views/lock.js',
  './src/views/today.js',
  './src/views/editor.js',
  './src/views/calendar.js',
  './src/views/stats.js',
  './src/views/settings.js',
  './src/views/search.js',
  './src/views/pixels.js',
  './src/views/keepsake.js',
  './src/views/patterns.js',
  './src/views/review.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
