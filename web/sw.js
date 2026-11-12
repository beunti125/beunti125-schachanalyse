// Offline-Cache für die Web-/Handyversion: App-Dateien und Engine lokal, chess.com immer frisch
const C = 'schach-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('version.json')) return;
  // Engine und Figuren ändern sich selten: Cache zuerst. Alles andere: Netz zuerst (Updates sofort), Cache als Rückfall.
  const cacheFirst = /\/(engine|pieces|vendor)\//.test(u.pathname);
  e.respondWith(caches.open(C).then(async c => {
    if (cacheFirst) { const hit = await c.match(e.request); if (hit) return hit; }
    try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
    catch { const hit = await c.match(e.request); if (hit) return hit; throw new Error('offline'); }
  }));
});
