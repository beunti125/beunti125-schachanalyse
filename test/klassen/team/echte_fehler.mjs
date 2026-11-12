#!/usr/bin/env node
// Prüfer-Hilfe Fehler-Einstufungen (nur Test, ändert keinen App-Code).
//  Stufe 1: node test/klassen/team/echte_fehler.mjs einstufen [--tiefe 16]
//           → alle Partien aus echte_partien.jsonl mit der echten App-Logik (analyseGame, MultiPV 2) → team/echte_d16.json
//  Stufe 2: node test/klassen/team/echte_fehler.mjs pruefen [--tiefe 20]
//           → Stichprobe (alle Patzer/Fehler/Verpasst, jede 3. Ungenauigkeit, 30 zufällige Gut/Exz./Bester)
//             mit Stockfish Tiefe 20 MultiPV 3 vor dem Zug + Tiefe 20 nach dem Zug (und nach dem besten Zug) → team/pruefung_d20.json
// Cache: test/klassen/cache (gleiches Schlüsselschema wie run.mjs, zusätzlich mpv3).
import '../esm-shim.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KL = path.join(DIR, '..');
const { analyseGame, parseGame } = await import('../../../web/js/analysis.js');
const { Chess } = await import('../../../web/vendor/chess.js');

const argv = process.argv.slice(2);
const MODE = argv[0] || 'einstufen';
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SF = process.env.STOCKFISH || '/tmp/stockfish/stockfish-ubuntu-x86-64-avx2';
const CACHE = path.join(KL, 'cache');
const NENG = +opt('--engines', 2);

class Uci {
  constructor() {
    this.p = spawn(SF, [], { stdio: ['pipe', 'pipe', 'inherit'] }); this.buf = ''; this.fn = null;
    this.p.stdout.on('data', d => { this.buf += d; let k; while ((k = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, k).trim(); this.buf = this.buf.slice(k + 1); this.fn?.(l); } });
    this.ready = (async () => { await this.cmd('uci', l => l === 'uciok'); this.send('setoption name Threads value 1'); this.send('setoption name Hash value 16'); await this.cmd('isready', l => l === 'readyok'); })();
  }
  send(c) { this.p.stdin.write(c + '\n'); }
  cmd(c, done, onLine) { return new Promise(res => { this.fn = l => { onLine?.(l); if (done(l)) { this.fn = null; res(l); } }; this.send(c); }); }
  async analyse(fen, depth, multipv) {
    await this.ready; const black = fen.split(' ')[1] === 'b'; const lines = []; let maxDepth = 0;
    this.send('ucinewgame'); this.send(`setoption name MultiPV value ${multipv}`); await this.cmd('isready', l => l === 'readyok');
    this.send('position fen ' + fen);
    await this.cmd(`go depth ${depth}`, l => l.startsWith('bestmove'), l => {
      if (!l.startsWith('info') || !l.includes(' pv ') || l.includes('upperbound') || l.includes('lowerbound')) return;
      const d = +(/ depth (\d+)/.exec(l)?.[1] || 0), k = +(/ multipv (\d+)/.exec(l)?.[1] || 1), sc = / score (cp|mate) (-?\d+)/.exec(l); if (!sc) return;
      let v = +sc[2]; if (black) v = -v; const pv = l.split(' pv ')[1].trim().split(/\s+/);
      lines[k - 1] = { move: pv[0], pv, cp: sc[1] === 'cp' ? v : null, mate: sc[1] === 'mate' ? v : null, depth: d }; maxDepth = Math.max(maxDepth, d);
    });
    return { lines: lines.filter(Boolean), depth: maxDepth };
  }
  quit() { try { this.send('quit'); } catch {} }
}
class Pool {
  constructor(n, depth) { this.n = n; this.depth = depth; this.eng = []; this.idle = []; this.jobs = []; this.calc = 0; this.hits = 0; }
  _free(e) { const j = this.jobs.shift(); if (!j) return this.idle.push(e); e.analyse(j.fen, j.depth, j.mpv).then(j.res, j.rej).finally(() => this._free(e)); }
  async analyse(fen, { multipv = 2, depth } = {}) {
    const D = depth || this.depth;
    const key = createHash('sha1').update(`${fen}|d${D}|mpv${multipv}`).digest('hex').slice(0, 20), file = path.join(CACHE, key + '.json');
    if (fs.existsSync(file)) { this.hits++; return JSON.parse(fs.readFileSync(file, 'utf8')).r; }
    if (!this.eng.length) for (let k = 0; k < this.n; k++) { const e = new Uci(); this.eng.push(e); this._free(e); }
    const r = await new Promise((res, rej) => { this.jobs.push({ fen, depth: D, mpv: multipv, res, rej }); const e = this.idle.shift(); if (e) this._free(e); });
    this.calc++;
    fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ fen, depth: D, multipv, r })); return r;
  }
  quit() { this.eng.forEach(e => e.quit()); }
}

const games = fs.readFileSync(path.join(KL, 'echte_partien.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const toGame = g => {
  const sans = g.m.trim().split(/\s+/);
  const pgn = sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + s).join(' ');
  return { url: 'cc:' + g.u, pgn, time_control: g.tc, end_time: 0, white: { username: g.w, rating: g.wr }, black: { username: g.b, rating: g.br } };
};

if (MODE === 'einstufen') {
  const D = +opt('--tiefe', 16);
  const eng = new Pool(NENG, D);
  const out = [];
  let k = 0;
  // Partien nacheinander (innerhalb einer Partie laufen die Stellungen parallel)
  for (const g of games) {
    const game = toGame(g);
    const an = await analyseGame(game, eng, 'standard');
    const P = parseGame(game);
    out.push({
      u: g.u, w: g.w, b: g.b, wr: g.wr, br: g.br, tc: g.tc, res: g.res, acc: g.acc, appAcc: an.accuracy,
      fens: P.fens, evals: an.evals, lines: an.lines, depth: an.depth,
      moves: an.moves.map((x, i) => ({ i, san: P.moves[i].san, uci: P.moves[i].uci, c: P.moves[i].color, ...x })),
    });
    process.stderr.write(`\r${++k}/${games.length} (neu ${eng.calc}, Cache ${eng.hits})   `);
  }
  eng.quit();
  fs.writeFileSync(path.join(DIR, `echte_d${D}.json`), JSON.stringify(out));
  console.log(`\nfertig: team/echte_d${D}.json`);
} else if (MODE === 'pruefen') {
  const D = +opt('--tiefe', 20);
  const A = JSON.parse(fs.readFileSync(path.join(DIR, 'echte_d16.json'), 'utf8'));
  // deterministische Zufallsauswahl
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sel = [];
  const inacc = [], good = [];
  for (const g of A) for (const m of g.moves) {
    if (['blunder', 'mistake', 'miss'].includes(m.cls)) sel.push([g.u, m.i, 'alle']);
    else if (m.cls === 'inaccuracy') inacc.push([g.u, m.i, 'jede3']);
    else if (['good', 'excellent', 'best'].includes(m.cls)) good.push([g.u, m.i, 'zufall']);
  }
  inacc.forEach((x, k) => { if (k % 3 === 0) sel.push(x); });
  for (let k = 0; k < 30; k++) sel.push(good.splice(Math.floor(rnd() * good.length), 1)[0]);
  // Verpasst/Miss braucht die Stellung vor dem Gegnerzug ebenfalls
  const eng = new Pool(NENG, D);
  const byU = Object.fromEntries(A.map(g => [g.u, g]));
  const jobs = [];
  for (const [u, i, why] of sel) {
    const g = byU[u], fen = g.fens[i], fenA = g.fens[i + 1];
    jobs.push((async () => {
      const before = await eng.analyse(fen, { multipv: 3 });
      const ch = new Chess(fenA);
      const after = ch.isGameOver() ? null : await eng.analyse(fenA, { multipv: 1 });
      // Stellung nach dem besten Zug (für Fehlertyp „Taktik verpasst“ nicht nötig, aber für Lage-Check vor Gegnerzug)
      const prev = i > 0 ? await eng.analyse(g.fens[i - 1], { multipv: 1 }) : null;
      return { u, i, why, before, after, prev };
    })());
  }
  let done = 0; const res = [];
  for (const j of jobs) { res.push(await j); process.stderr.write(`\r${++done}/${jobs.length} (neu ${eng.calc})   `); }
  eng.quit();
  fs.writeFileSync(path.join(DIR, `pruefung_d${D}.json`), JSON.stringify(res));
  console.log(`\nfertig: ${res.length} Züge → team/pruefung_d${D}.json`);
}
