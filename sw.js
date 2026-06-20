const CACHE_NAME = 'inventory-pwa-v43';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // GAS / Firebase 一律走網路，不快取
  if (url.includes('script.google.com') || url.includes('googleapis.com') ||
      url.includes('firebasestorage') || url.includes('gstatic.com') ||
      url.includes('firebaseapp.com') || url.includes('firebase.google.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // 靜態資源：快取優先，沒有再去網路拿
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
