// Service worker : met le site en cache pour qu'il fonctionne hors ligne.
// Pense à changer VERSION à chaque mise en ligne d'une nouvelle version.
const VERSION = 'v2';
const CACHE = `pizzadough-${VERSION}`;
const FILES = [
  './', 'index.html', 'css/style.css',
  'js/app.js', 'js/calc.js', 'js/schedule.js', 'js/cook.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pizzadough-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// On essaie d'abord le réseau, pour avoir la dernière version. Hors ligne,
// on se rabat sur le cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
