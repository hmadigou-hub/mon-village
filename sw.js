/* Empowered Maman service worker — offline shell cache (v7: network-first app shell so content edits show up) */
var CACHE = 'empowered-maman-v7';
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
  var isShell = url.pathname === '/' || url.pathname === '/index.html';
  // App shell: network first so new content and cards appear immediately;
  // fall back to the cached copy when offline.
  if (isShell) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) { return hit || caches.match('./index.html'); });
      })
    );
    return;
  }
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
