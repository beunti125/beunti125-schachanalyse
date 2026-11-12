// Offline-Cache für die Web-/Handyversion: App-Dateien und Engine lokal, chess.com immer frisch
const C = 'schach-v1';
// Beim ersten Laden alles Nötige vorab speichern – sonst startet die App offline erst nach dem zweiten Besuch
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.png', 'icon-192.png', 'icon-512.png',
  'js/app.js', 'js/analysis.js', 'js/board.js', 'js/engine.js', 'js/explain.js', 'js/icons.js', 'js/openings.js', 'js/store.js', 'js/structure.js',
  'vendor/chess.js', 'vendor/book.js', 'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm',
  ...['K', 'Q', 'R', 'B', 'N', 'P'].flatMap(p => ['w' + p, 'b' + p]).map(p => `pieces/${p}.svg`)];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok && c.put(u, r)).catch(() => {})))));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('version.json')) return;
  // Engine und Figuren ändern sich selten: Cache zuerst. Alles andere: Netz zuerst (Updates sofort), Cache als Rückfall.
  // vendor/ (Eröffnungsbuch) bewusst Netz zuerst, damit Updates ankommen
  const cacheFirst = /\/(engine|pieces)\//.test(u.pathname);
  e.respondWith(caches.open(C).then(async c => {
    if (cacheFirst) { const hit = await c.match(e.request); if (hit) return hit; }
    // no-cache: beim Neuladen nach einem Update nicht die alte Datei aus dem Browser-Cache nehmen
    const nav = e.request.mode === 'navigate';
    try { const r = await fetch(nav ? e.request : new Request(e.request, { cache: 'no-cache' })); if (r.ok) c.put(nav ? u.origin + u.pathname : e.request, r.clone()); return r; }
    catch { const hit = await c.match(e.request, { ignoreSearch: nav }); if (hit) return hit; throw new Error('offline'); }
  }));
});
