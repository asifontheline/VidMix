const CACHE_NAME = 'vidmix-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  '../shared/mix-engine.js',
  '../shared/waveform.js',
  '../shared/live-preview.js',
  '../shared/capture.js',
  '../shared/music-generator.js',
  './vendor/ffmpeg/ffmpeg.js',
  './vendor/ffmpeg/814.ffmpeg.js',
  './vendor/ffmpeg-util/index.js',
  './vendor/ffmpeg-core/ffmpeg-core.js',
  './vendor/ffmpeg-core/ffmpeg-core.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// App shell: cache-first with background refresh. Anything cross-origin
// (ffmpeg.wasm core from the CDN) passes straight through to the network -
// the browser's own HTTP cache handles that, and we don't want a stale
// multi-megabyte wasm core pinned in our cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
