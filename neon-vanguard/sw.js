/* Neon Vanguard instalada: siempre pide la versión nueva a la red; la copia guardada solo se usa sin conexión.
   No toca el ranking ni el multijugador (otro dominio). */
const CACHE = 'nv-94';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add('./')).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
    return res;
  }).catch(() => caches.match(r).then(x => x || caches.match('./'))));
});
