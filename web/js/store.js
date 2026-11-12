// chess.com-Daten (über den lokalen Server) und lokale Speicherung (IndexedDB)
const DBN = 'schachanalyse', VER = 1;
let dbp;
function db() {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DBN, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('analyses', { keyPath: 'url' });
      d.createObjectStore('puzzles', { keyPath: 'id' });
      d.createObjectStore('games', { keyPath: 'url' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = async (s, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(s, mode); const out = fn(t.objectStore(s)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
export const put = (s, v) => tx(s, 'readwrite', st => { st.put(v); });
export const putMany = (s, vs) => tx(s, 'readwrite', st => { vs.forEach(v => st.put(v)); });
export const get = (s, k) => tx(s, 'readonly', st => st.get(k));
export const all = (s) => tx(s, 'readonly', st => st.getAll());

// Ohne lokalen Server (Handy/Web-Version): chess.com direkt abfragen
export const STATIC = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
async function cc(path) {
  let r;
  if (STATIC) {
    for (let k = 0; k < 3; k++) {
      try { r = await fetch('https://api.chess.com/pub/' + path); if (r.status !== 429) break; } catch { r = null; }
      await new Promise(res => setTimeout(res, 800 * (k + 1)));
    }
    if (!r) throw new Error('Keine Verbindung zu chess.com. Prüfe dein Internet und versuche es erneut.');
  } else {
    try { r = await fetch('/api/cc/' + path); }
    catch { throw new Error('Die App läuft im Hintergrund nicht mehr. Starte „Schachanalyse“ neu über das App-Symbol.'); }
  }
  if (r.status === 404) throw new Error('Spieler nicht gefunden');
  if (!r.ok) throw new Error('chess.com antwortet nicht (' + r.status + ')');
  return r.json();
}
export async function loadGames(user, months = 3, onStep) {
  const u = encodeURIComponent(user.toLowerCase().trim());
  const { archives = [] } = await cc(`player/${u}/games/archives`);
  const pick = archives.slice(-months).reverse();
  const games = [];
  for (const [i, a] of pick.entries()) {
    onStep?.(i + 1, pick.length);
    const p = a.split('/pub/')[1];
    const { games: g = [] } = await cc(p);
    games.push(...g.filter(x => x.rules === 'chess' && x.pgn));
  }
  games.sort((a, b) => b.end_time - a.end_time);
  await putMany('games', games);
  return games;
}
export async function loadPlayer(user) {
  try { return await cc(`player/${encodeURIComponent(user.toLowerCase().trim())}`); } catch { return null; }
}
export async function loadStats(user) {
  const u = encodeURIComponent(user.toLowerCase().trim());
  const s = await cc(`player/${u}/stats`);
  ls.set('stats:' + user.toLowerCase(), s);
  return s;
}
export async function cachedGames(user) {
  const u = user.toLowerCase();
  return (await all('games')).filter(g => g.white.username.toLowerCase() === u || g.black.username.toLowerCase() === u).sort((a, b) => b.end_time - a.end_time);
}
export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
