const CACHE_NAME = 'bent-mvp-v1.7.1-shell';
const APP_SHELL = [
  './', './index.html', './offline.html', './manifest.webmanifest',
  './assets/css/app.css?v=1.7.1', './assets/js/config.js?v=1.7.1', './assets/js/utils.js?v=1.7.1',
  './assets/js/image-service.js?v=1.7.1', './assets/js/app.js?v=1.7.1',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache Supabase or Apps Script API responses.
  if (url.hostname.includes('supabase.co') || url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        return response;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html')))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request))
    );
  }
});
