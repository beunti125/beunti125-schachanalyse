// Ersatzserver, falls kein Python vorhanden ist (gleiche Funktion wie server.py)
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), os = require('os'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, 'web');
const PORT = +(process.env.SCHACH_PORT || 8765);
const CFG_DIR = path.join(os.homedir(), 'Library/Application Support/Schachanalyse'), CFG = path.join(CFG_DIR, 'config.json');
const AGENT = path.join(os.homedir(), 'Library/LaunchAgents/de.yunus.schachanalyse.plist');
const EXE = path.normalize(path.join(__dirname, '..', '..', 'MacOS', 'Schachanalyse'));
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.txt':'text/plain'};
const H = {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp',
  'Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-cache'};

const loadCfg = () => { let c = {}; try { c = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch {} let v = null; try { v = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version; } catch {} return { user: c.user || '', autoOpen: c.autoOpen !== false, profiles: c.profiles || [], autostart: fs.existsSync(AGENT), version: v }; };
const saveCfg = c => { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify({ user: c.user, autoOpen: c.autoOpen, profiles: c.profiles || [] })); };
const setAutostart = on => {
  if (on) { fs.mkdirSync(path.dirname(AGENT), { recursive: true }); fs.writeFileSync(AGENT, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>de.yunus.schachanalyse</string>
<key>ProgramArguments</key><array><string>${EXE}</string><string>--background</string></array>
<key>RunAtLoad</key><true/></dict></plist>
`); }
  else if (fs.existsSync(AGENT)) fs.unlinkSync(AGENT);
};
const cc = p => new Promise((res, rej) => https.get('https://api.chess.com/pub/' + p, { headers: { 'User-Agent': 'Schachanalyse/1.0' } }, r => {
  let b = ''; r.on('data', d => b += d); r.on('end', () => r.statusCode === 200 ? res(JSON.parse(b)) : rej(new Error(r.statusCode)));
}).on('error', rej));

// Neue Partie erkennen und Spielbericht öffnen
const last = {};
async function watch() {
  try {
    const c = loadCfg(), u = c.user.toLowerCase();
    if (u && c.autoOpen) {
      const { archives = [] } = await cc(`player/${encodeURIComponent(u)}/games/archives`);
      if (archives.length) {
        const { games = [] } = await cc(archives.at(-1).split('/pub/')[1]);
        const g = games.filter(x => x.rules === 'chess').sort((a, b) => b.end_time - a.end_time)[0];
        if (g) {
          if (!(u in last)) last[u] = g.end_time;
          else if (g.end_time > last[u]) { last[u] = g.end_time; execFile('open', [`http://localhost:${PORT}/?game=` + encodeURIComponent(g.url)]); }
        }
      }
    }
  } catch (e) { console.log('Watcher:', e.message); }
  setTimeout(watch, 60000);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const json = (code, o) => { res.writeHead(code, { ...H, 'Content-Type': 'application/json' }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  if (url === '/api/ping') return json(200, { ok: true });
  if (url === '/api/quit' && req.method === 'POST') { json(200, { ok: true }); return setTimeout(() => process.exit(0), 300); }
  if (url === '/api/config') {
    if (req.method === 'POST') {
      let b = ''; req.on('data', d => b += d); req.on('end', () => {
        const d = JSON.parse(b || '{}'), c = loadCfg();
        if ('user' in d) c.user = d.user; if ('autoOpen' in d) c.autoOpen = d.autoOpen; if ('profiles' in d) c.profiles = d.profiles;
        saveCfg(c); if ('autostart' in d) setAutostart(!!d.autostart);
        json(200, loadCfg());
      });
      return;
    }
    return json(200, loadCfg());
  }
  if (url === '/api/img') {
    const q = new URL(req.url, 'http://x').searchParams.get('u') || '';
    let host = ''; try { host = new URL(q).hostname; } catch {}
    if (!q.startsWith('https://') || !(host.endsWith('chesscomfiles.com') || host.endsWith('chess.com'))) return json(403, {});
    https.get(q, { headers: { 'User-Agent': 'Schachanalyse/1.0' } }, r => { res.writeHead(200, { ...H, 'Content-Type': r.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'max-age=86400' }); r.pipe(res); }).on('error', () => json(502, {}));
    return;
  }
  if (url.startsWith('/api/cc/')) {
    https.get('https://api.chess.com/pub/' + req.url.slice(8), { headers: { 'User-Agent': 'Schachanalyse/1.0' } }, r => {
      res.writeHead(r.statusCode, { ...H, 'Content-Type': 'application/json' }); r.pipe(res);
    }).on('error', () => json(502, {}));
    return;
  }
  const f = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!f.startsWith(ROOT)) { res.writeHead(403, H); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404, H); return res.end('404'); }
    res.writeHead(200, { ...H, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => { console.log('Schachanalyse läuft auf http://localhost:' + PORT); if (process.platform === 'darwin' || process.env.SCHACH_WATCH) watch(); });
