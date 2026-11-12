#!/usr/bin/env node
// Prüfer-Hilfe (nur Test, ändert keinen App-Code): erzeugt für echte Partien alle Erklärtexte
// aus Sicht eines Spielers (wie app.js: explain mit my = Spielerfarbe, plus coachText und openingStep).
//   node test/klassen/team/texte_dump.mjs --spieler MertAbi69 --n 25 [--start 0] [--tiefe 16] > texte_dump.txt
// Zusätzlich JSON nach --json <datei>.
import '../esm-shim.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const KL = path.join(DIR, '..');
const { analyseGame, parseGame, coachText, CLASS_DE } = await import('../../../web/js/analysis.js');
const { explain } = await import('../../../web/js/explain.js');
const { openingStep } = await import('../../../web/js/openings.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DEPTH = +opt('--tiefe', 16), SPIELER = opt('--spieler', 'MertAbi69').toLowerCase();
const N = +opt('--n', 25), START = +opt('--start', 0);
const SF = process.env.STOCKFISH || '/tmp/stockfish/stockfish-ubuntu-x86-64-avx2';
const CACHE = path.join(KL, 'cache');

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
  constructor(n) { this.n = n; this.eng = []; this.idle = []; this.jobs = []; }
  _free(e) { const j = this.jobs.shift(); if (!j) return this.idle.push(e); e.analyse(j.fen, j.depth, j.mpv).then(j.res, j.rej).finally(() => this._free(e)); }
  async analyse(fen, { multipv = 2 } = {}) {
    const key = createHash('sha1').update(`${fen}|d${DEPTH}|mpv${multipv}`).digest('hex').slice(0, 20), file = path.join(CACHE, key + '.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).r;
    if (!this.eng.length) for (let k = 0; k < this.n; k++) { const e = new Uci(); this.eng.push(e); this._free(e); }
    const r = await new Promise((res, rej) => { this.jobs.push({ fen, depth: DEPTH, mpv: multipv, res, rej }); const e = this.idle.shift(); if (e) this._free(e); });
    fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ fen, depth: DEPTH, multipv, r })); return r;
  }
  quit() { this.eng.forEach(e => e.quit()); }
}
const engine = new Pool(2);
const fmt = ev => !ev ? '' : ev.mate != null ? (ev.mate === 0 ? '#' : (ev.mate > 0 ? 'M' : '-M') + Math.abs(ev.mate)) : ((ev.cp > 0 ? '+' : '') + (ev.cp / 100).toFixed(2));

const games = fs.readFileSync(path.join(KL, 'echte_partien.jsonl'), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const out = [];
for (const [gi, g0] of games.slice(START, START + N).entries()) {
  const g = g0.m ? { url: 'https://www.chess.com/game/live/' + g0.u, pgn: g0.m, time_control: g0.tc || '600', end_time: 0, white: { username: g0.w, rating: g0.wr }, black: { username: g0.b, rating: g0.br } }
    : { time_control: '600', end_time: 0, ...g0, url: g0.url || 'echt:' + (START + gi) };
  const id = (g.url.match(/(\d+)$/) || [, String(START + gi)])[1];
  const my = g.white.username.toLowerCase() === SPIELER ? 'w' : 'b';
  // gleiche Verlaufsdaten wie app.js wären partieübergreifend; hier ein fester Beispielverlauf
  const hist = { games: 20, err: { hung: 6, missedTactic: 4, notPunished: 3, missedMate: 2, allowedMate: 2, positional: 2 }, pressureShare: 0.3 };
  let an, P;
  try { an = await analyseGame(g, engine, 'standard'); P = parseGame(g); } catch (e) { console.error('Partie', id, e.message); continue; }
  const elo = (my === 'w' ? g.white : g.black).rating;
  console.log(`\n=== Partie ${id}  ${g.white.username}(${g.white.rating}) – ${g.black.username}(${g.black.rating})  MertAbi69=${my}  ${g.time_control}`);
  P.moves.forEach((m, i) => {
    const x = an.moves[i], n = P.fens[i].split(' ')[5], lab = `${n}${m.color === 'w' ? '.' : '...'}${m.san}`;
    let steps;
    try { steps = explain(g, an, P, i, { my, hist, elo }).steps.map(s => s.text); } catch (e) { steps = ['[Ausnahme ' + e.message + ']']; }
    const ply = i + 1;
    try { const os = !['mistake', 'miss', 'blunder'].includes(x.cls) ? openingStep(P.fens, ply, my, an.lines[ply]?.[0]?.pv) : null; if (os) steps.push('[Eröffnung] ' + os.text); } catch (e) { steps.push('[openingStep-Ausnahme ' + e.message + ']'); }
    let coach = ''; try { coach = coachText(g, an, P, i); } catch (e) { coach = '[coach-Ausnahme ' + e.message + ']'; }
    const L = ls => (ls || []).map(l => `${fmt(l)} ${l.pv.slice(0, 6).join(' ')}`).join(' | ');
    const rec = { id, i, zug: lab, mine: m.color === my, cls: x.cls, err: x.err, loss: x.loss, sac: x.sac, before: L(an.lines[i]), after: L(an.lines[i + 1]), fen: P.fens[i], steps, coach };
    out.push(rec);
    console.log(`${(m.color === my ? '*' : ' ')} ${lab.padEnd(13)} ${CLASS_DE[x.cls].padEnd(13)} loss=${x.loss}${x.err ? ' ' + x.err : ''}${x.pressure ? ' DRUCK' : ''}${x.sac ? ' sac=' + JSON.stringify(x.sac) : ''}`);
    if (!['book', 'forced'].includes(x.cls) || argv.includes('--alle')) {
      console.log(`     vorher: ${L(an.lines[i])}`); console.log(`     nachher: ${L(an.lines[i + 1])}`);
      steps.forEach((t, k) => console.log(`     [${k + 1}] ${t}`)); console.log(`     [coach] ${coach}`);
    }
  });
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
engine.quit();
