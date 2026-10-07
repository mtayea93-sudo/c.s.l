/* CSL service worker — يخلي النظام يشتغل أوفلاين وينفع يتثبت كتطبيق */
const CACHE = 'csl-v5';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './catalog.js',
  './security.js',
  './yaseer-data.js',
  './cloud.js',
  './app.js',
  './labops.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './logo-wide.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* الأصول المحلية: من الكاش أولاً (أسرع)، وتحدّث في الخلفية */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // Firebase وغيره يعدّي عادي على الشبكة

  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
