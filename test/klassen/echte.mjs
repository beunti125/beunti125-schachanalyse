#!/usr/bin/env node
// Echte chess.com-Partien (echte_partien.jsonl) mit der echten App-Logik einstufen.
//   node test/klassen/echte.mjs [--tiefe 16] [--nur <partie-id>] [--json <datei>] [--engine <pfad>] [--threads 2]
// Elo je Seite aus wr/br. Engine-Ergebnisse gecacht (gleicher Cache/Schlüssel wie run.mjs → wiederverwendbar).
// Ausgabe: Klassenzählung je Partie + Gesamt, Liste aller Sonderlabels (Brillant, Großartig, Verpasst, Erzwungen)
// und der letzten Theoriezüge. Mit --json alle Züge maschinenlesbar (inkl. wpAlt und Opfer).
import './esm-shim.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { analyseGame, parseGame, CLASS_DE, winPctR } = await import('../../web/js/analysis.js');
const { Chess } = await import('../../web/vendor/chess.js');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const DEPTH = +(opt('--tiefe') || 16);
const SF = opt('--engine') || process.env.STOCKFISH || '/tmp/stockfish/stockfish-ubuntu-x86-64-avx2';
const CACHE = opt('--cache') ? path.resolve(opt('--cache')) : path.join(DIR, 'cache');
const N = +(opt('--threads') || Math.max(1, Math.min(4, os.cpus().length)));

// ---------- Native Engine (identisch zu run.mjs) ----------
class Uci {
  constructor() {
    this.p = spawn(SF, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.buf = ''; this.fn = null;
    this.p.stdout.on('data', d => {
      this.buf += d; let k;
      while ((k = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, k).trim(); this.buf = this.buf.slice(k + 1); this.fn?.(l); }
    });
    this.ready = (async () => {
      await this.cmd('uci', l => l === 'uciok');
      this.send('setoption name Threads value 1'); this.send('setoption name Hash value 16');
      await this.cmd('isready', l => l === 'readyok');
    })();
  }
  send(c) { this.p.stdin.write(c + '\n'); }
  cmd(c, done, onLine) { return new Promise(res => { this.fn = l => { onLine?.(l); if (done(l)) { this.fn = null; res(l); } }; this.send(c); }); }
  async analyse(fen, depth, multipv, searchmoves) {
    await this.ready;
    const black = fen.split(' ')[1] === 'b'; const lines = []; let maxDepth = 0, nodes = 0;
    this.send('ucinewgame'); this.send(`setoption name MultiPV value ${multipv}`);
    await this.cmd('isready', l => l === 'readyok');
    this.send('position fen ' + fen);
    await this.cmd(`go depth ${depth}${searchmoves ? ' searchmoves ' + searchmoves.join(' ') : ''}`, l => l.startsWith('bestmove'), l => {
      const nd = / nodes (\d+)/.exec(l); if (nd) nodes = Math.max(nodes, +nd[1]);
      if (!l.startsWith('info') || !l.includes(' pv ') || l.includes('upperbound') || l.includes('lowerbound')) return;
      const d = +(/ depth (\d+)/.exec(l)?.[1] || 0);
      const k = +(/ multipv (\d+)/.exec(l)?.[1] || 1);
      const sc = / score (cp|mate) (-?\d+)/.exec(l); if (!sc) return;
      let v = +sc[2]; if (black) v = -v;
      const pv = l.split(' pv ')[1].trim().split(/\s+/);
      lines[k - 1] = { move: pv[0], pv, cp: sc[1] === 'cp' ? v : null, mate: sc[1] === 'mate' ? v : null, depth: d };
      maxDepth = Math.max(maxDepth, d);
    });
    return { lines: lines.filter(Boolean), depth: maxDepth, nodes };
  }
  quit() { try { this.send('quit'); } catch {} }
}
// Engine-Attrappe für die App: gleiche Schnittstelle wie EnginePool.analyse(fen, {depth, movetime, multipv, searchmoves}).
// Feste Tiefe DEPTH; eine angeforderte Mehrtiefe (depth − 16, z. B. Nachrechnung +4) wird auf DEPTH aufgeschlagen.
// Zählt jede Anfrage nach Art (Tiefe, MultiPV, searchmoves) und die Knoten der Suche (Maß für die Rechenzeit).
class Pool {
  constructor(n) { this.n = n; this.eng = []; this.idle = []; this.jobs = []; this.hits = 0; this.calc = 0; this.stat = {}; }
  _free(e) { const j = this.jobs.shift(); if (!j) return this.idle.push(e); e.analyse(j.fen, j.depth, j.mpv, j.sm).then(j.res, j.rej).finally(() => this._free(e)); }
  async analyse(fen, { multipv = 2, depth = 16, searchmoves } = {}) {
    const D = DEPTH + Math.max(0, depth - 16);
    const key = createHash('sha1').update(`${fen}|d${D}|mpv${multipv}${searchmoves ? '|sm' + searchmoves.join(',') : ''}`).digest('hex').slice(0, 20);
    const file = path.join(CACHE, key + '.json');
    const kind = `d${D}${D > DEPTH ? '(+' + (D - DEPTH) + ')' : ''} mpv${multipv}${searchmoves ? ' searchmoves' : ''}`;
    const st = this.stat[kind] ||= { n: 0, nodes: 0, mitKnoten: 0 };
    st.n++;
    let r;
    if (fs.existsSync(file)) { this.hits++; r = JSON.parse(fs.readFileSync(file, 'utf8')).r; }
    else {
      if (!this.eng.length) for (let k = 0; k < this.n; k++) { const e = new Uci(); this.eng.push(e); this._free(e); }
      r = await new Promise((res, rej) => { this.jobs.push({ fen, depth: D, mpv: multipv, sm: searchmoves, res, rej }); const e = this.idle.shift(); if (e) this._free(e); });
      this.calc++;
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ fen, depth: D, multipv, searchmoves, r }));
    }
    if (r.nodes) { st.nodes += r.nodes; st.mitKnoten++; }
    return r;
  }
  quit() { this.eng.forEach(e => e.quit()); }
}
const engine = new Pool(N);

// ---------- Partien ----------
const SPIELER = 'mertabi69';
const rows = fs.readFileSync(path.join(DIR, 'echte_partien.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const only = opt('--nur');
function toPgn(r) {
  const ch = new Chess();
  for (const s of r.m.split(/\s+/)) ch.move(s);
  return ch.pgn();
}
const SPECIAL = ['brilliant', 'great', 'miss', 'forced'];
const total = {}; const special = []; const theory = []; const all = []; const accs = {};
const label = (P, i) => { const n = P.fens[i].split(' ')[5]; return `${n}${P.moves[i].color === 'w' ? '.' : '...'}${P.moves[i].san}`; };

for (const r of rows) {
  if (only && r.u !== only) continue;
  const game = {
    url: 'https://www.chess.com/game/live/' + r.u, pgn: toPgn(r), time_control: r.tc, end_time: 0,
    white: { username: r.w, rating: r.wr }, black: { username: r.b, rating: r.br },
  };
  const an = await analyseGame(game, engine, 'standard');
  const P = parseGame(game);
  const cnt = {};
  const lastBook = { w: null, b: null };
  an.moves.forEach((x, i) => {
    const m = P.moves[i], c = m.color, R = c === 'w' ? r.wr : r.br;
    cnt[x.cls] = (cnt[x.cls] || 0) + 1; total[x.cls] = (total[x.cls] || 0) + 1;
    const lines = an.lines[i] || [];
    const alt = lines.find(l => l.move !== m.uci);
    const wpAlt = alt ? +(c === 'w' ? winPctR(alt, R) : 100 - winPctR(alt, R)).toFixed(1) : null;
    const rec = { u: r.u, ply: i, zug: label(P, i), farbe: c, spieler: (c === 'w' ? r.w : r.b), mert: (c === 'w' ? r.w : r.b).toLowerCase() === SPIELER,
      R, cls: x.cls, acc: x.acc, loss: x.loss, wpB: x.wpB, wpA: x.wpA, wpAlt, best: x.best, uci: m.uci, fen: P.fens[i], sac: x.sac || null, err: x.err };
    all.push(rec);
    if (SPECIAL.includes(x.cls)) special.push(rec);
    if (x.cls === 'book') lastBook[c] = rec;
  });
  for (const c of ['w', 'b']) if (lastBook[c]) theory.push({ ...lastBook[c], naechster: all.find(a => a.u === r.u && a.ply === lastBook[c].ply + 2)?.zug ?? null });
  accs[r.u] = an.accuracy;
  const s = Object.entries(cnt).map(([k, v]) => `${CLASS_DE[k]} ${v}`).join(', ');
  console.log(`${r.u} ${r.w}(${r.wr})–${r.b}(${r.br}) ${r.tc}: ${s}`);
}

console.log('\n=== Sonderlabels ===');
for (const s of special) console.log(`${s.u} ${s.zug.padEnd(14)} ${s.spieler.padEnd(20)} ${CLASS_DE[s.cls].padEnd(10)} wpB=${s.wpB} wpA=${s.wpA} wpAlt=${s.wpAlt}${s.sac ? ` Opfer ${s.sac.piece}@${s.sac.square}` : ''}`);
console.log('\n=== Letzter Theoriezug je Seite ===');
for (const t of theory) console.log(`${t.u} ${t.zug.padEnd(14)} ${t.spieler}`);
console.log('\n=== Gesamt ===');
console.log(Object.entries(total).map(([k, v]) => `${CLASS_DE[k]}: ${v}`).join(', '));
console.log(`Engine: ${engine.calc} neu gerechnet, ${engine.hits} aus Cache (Tiefe ${DEPTH})`);
for (const [k, v] of Object.entries(engine.stat)) console.log(`  Suchen ${k}: ${v.n}${v.mitKnoten ? `, Knoten (${v.mitKnoten} gemessen) ${v.nodes}` : ''}`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ tiefe: DEPTH, moves: all, special, theory, accs, stat: engine.stat }, null, 0));
engine.quit();
process.exit(0);
