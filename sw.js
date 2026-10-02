/* Empowered Maman service worker — offline shell cache (v5: resource links in edit mode) */
var CACHE = 'empowered-maman-v6';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/chat-adapter.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Never cache API / serverless calls — always go to network.
  if (url.pathname.indexOf('/.netlify/functions/') === 0 || url.hostname.indexOf('chatbase.co') !== -1 || url.hostname.indexOf('customgpt.ai') !== -1) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
