#!/usr/bin/env node
// Prüfstand für die Zugeinstufung: echte App-Logik (web/js/analysis.js + explain.js) gegen schachlich
// geprüfte Erwartungen (faelle.json). Engine: nativer Stockfish, feste Tiefe, MultiPV 2, Ergebnisse gecacht.
//
//   node test/klassen/run.mjs                    alle Fälle aus faelle.json
//   node test/klassen/run.mjs --fall <id> -v     ein Fall mit Engine-Linien und allen Texten
//   node test/klassen/run.mjs --partie <datei>   ganze Partie einstufen (JSON wie fall_sufyannz.json oder .pgn)
//        [--elo 1500 | --elo-w 607 --elo-b 496]
//   node test/klassen/run.mjs --faelle <datei>   anderer Korpus im Format von faelle.json (z. B. team/faelle_sonderlabels.json)
//   Optionen: --tiefe 16 (Standard), --json <datei> (Ergebnisse maschinenlesbar), --kein-cache, --engine <pfad>
//   Exit-Code 1, wenn mindestens ein Fall scheitert.
import './esm-shim.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { analyseGame, parseGame, coachText, CLASS_DE } = await import('../../web/js/analysis.js');
const { explain } = await import('../../web/js/explain.js');

// ---------- Argumente ----------
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const flag = k => argv.includes(k);
const DEPTH = +(opt('--tiefe') || process.env.TIEFE || 16);
const SF = opt('--engine') || process.env.STOCKFISH || '/tmp/stockfish/stockfish-ubuntu-x86-64-avx2';
const CACHE = path.join(DIR, 'cache');
const VERBOSE = flag('-v') || flag('--verbose');
const NOCACHE = flag('--kein-cache');

// ---------- Native Engine (gleiche Datenform wie web/js/engine.js) ----------
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
    // ucinewgame leert den Hash → jede Stellung unabhängig von der Reihenfolge reproduzierbar
    this.send('ucinewgame'); this.send(`setoption name MultiPV value ${multipv}`);
    await this.cmd('isready', l => l === 'readyok');
    this.send('position fen ' + fen);
    await this.cmd(`go depth ${depth}${searchmoves ? ' searchmoves ' + searchmoves.join(' ') : ''}`, l => l.startsWith('bestmove'), l => {
      const nd = / nodes (\d+)/.exec(l); if (nd) nodes = Math.max(nodes, +nd[1]);
      // identisch zu engine.js: Schranken-Zeilen ignorieren, letzte Zeile je MultiPV zählt
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

class Pool {
  constructor(n) { this.n = n; this.eng = []; this.idle = []; this.jobs = []; this.hits = 0; this.calc = 0; }
  _free(e) { const j = this.jobs.shift(); if (!j) return this.idle.push(e); e.analyse(j.fen, j.depth, j.mpv, j.sm).then(j.res, j.rej).finally(() => this._free(e)); }
  // Schnittstelle wie EnginePool.analyse(fen, {depth, movetime, multipv, searchmoves}); movetime wird ignoriert (feste Tiefe).
  // Eine angeforderte Mehrtiefe (depth − 16, z. B. Nachrechnung +4) wird auf DEPTH aufgeschlagen.
  async analyse(fen, { multipv = 2, depth = 16, searchmoves } = {}) {
    const D = DEPTH + Math.max(0, depth - 16);
    const key = createHash('sha1').update(`${fen}|d${D}|mpv${multipv}${searchmoves ? '|sm' + searchmoves.join(',') : ''}`).digest('hex').slice(0, 20);
    const file = path.join(CACHE, key + '.json');
    if (!NOCACHE && fs.existsSync(file)) { this.hits++; return JSON.parse(fs.readFileSync(file, 'utf8')).r; }
    if (!this.eng.length) for (let k = 0; k < this.n; k++) { const e = new Uci(); this.eng.push(e); this._free(e); }
    const r = await new Promise((res, rej) => { this.jobs.push({ fen, depth: D, mpv: multipv, sm: searchmoves, res, rej }); const e = this.idle.shift(); if (e) this._free(e); });
    this.calc++;
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ fen, depth: D, multipv, searchmoves, r }));
    return r;
  }
  quit() { this.eng.forEach(e => e.quit()); }
}
const engine = new Pool(Math.max(1, Math.min(4, os.cpus().length)));

// ---------- Hilfen ----------
const AKK = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
const fmt = ev => !ev ? '' : ev.mate != null ? (ev.mate === 0 ? '#' : (ev.mate > 0 ? 'M' : '-M') + Math.abs(ev.mate)) : ((ev.cp > 0 ? '+' : '') + (ev.cp / 100).toFixed(2));
const label = (P, i) => { const n = P.fens[i].split(' ')[5]; return `${n}${P.moves[i].color === 'w' ? '.' : '...'}${P.moves[i].san}`; };
const norm = s => s.replace(/[+#!?]+$/g, '');

function makeGame(f, id) {
  let pgn;
  if (f.pgn) pgn = f.pgn;
  else if (f.fen) pgn = `[SetUp "1"]\n[FEN "${f.fen}"]\n\n${f.zuege}`;
  else throw new Error(`Fall ${id}: pgn oder fen+zuege fehlt`);
  const elo = typeof f.elo === 'number' ? { w: f.elo, b: f.elo } : (f.elo || { w: 1500, b: 1500 });
  return {
    url: 'test:' + id, pgn, time_control: f.time_control || '600', end_time: 0,
    white: { username: f.weiss || 'Weiß', rating: elo.w }, black: { username: f.schwarz || 'Schwarz', rating: elo.b },
  };
}

async function analyse(game) {
  const an = await analyseGame(game, engine, 'standard');
  const P = parseGame(game);
  return { an, P };
}

function textsFor(game, an, P, i) {
  const c = P.moves[i].color, o = c === 'w' ? 'b' : 'w';
  const out = {};
  for (const [k, my] of [['selbst', c], ['gegner', o]]) {
    try {
      const elo = (my === 'w' ? game.white : game.black).rating;
      const ex = explain(game, an, P, i, { my, elo });
      out[k] = ex.steps.map(s => s.text);
    } catch (e) { out[k] = [`[explain-Ausnahme: ${e.message}]`]; }
  }
  try { out.coach = [coachText(game, an, P, i)]; } catch (e) { out.coach = [`[coachText-Ausnahme: ${e.message}]`]; }
  return out;
}

function findPly(P, zug) {
  // "19.Qh3", "19...Rf8" oder Halbzug-Index (Zahl)
  if (typeof zug === 'number') return zug;
  const m = /^(\d+)(\.\.\.|\.)(.+)$/.exec(zug.trim()); if (!m) return -1;
  return P.moves.findIndex((mv, i) => P.fens[i].split(' ')[5] === m[1] && (mv.color === 'w') === (m[2] === '.') && norm(mv.san) === norm(m[3]));
}

function check(f, x, texts) {
  const fails = [];
  const all = Object.values(texts).flat().join('\n');
  const own = texts.selbst.join('\n');
  if (f.erwartet && !f.erwartet.includes(x.cls)) fails.push(`Klasse ${x.cls}, erwartet ${f.erwartet.join('|')}`);
  if (f.nicht && f.nicht.includes(x.cls)) fails.push(`Klasse ${x.cls} ist verboten (${f.nicht.join(', ')})`);
  if (f.fehlertyp && ![].concat(f.fehlertyp).includes(x.err)) fails.push(`Fehlertyp ${x.err}, erwartet ${[].concat(f.fehlertyp).join('|')}`);
  if (f.opfer === null && /opfer/i.test(all)) fails.push(`Text spricht von einem Opfer, obwohl keins vorliegt`);
  // opfer: 'q' usw. → WENN die App ein Opfer meldet (Brillant oder Text „opfer…“), muss es diese Figur sein
  if (typeof f.opfer === 'string' && (x.cls === 'brilliant' || /opfer/i.test(all))) {
    if (!new RegExp(`opfer\\w* ${AKK[f.opfer]}`).test(own)) fails.push(`Text nennt nicht ${AKK[f.opfer]} als Opfer`);
    for (const [p, a] of Object.entries(AKK)) if (p !== f.opfer && new RegExp(`opfer\\w* ${a}\\b`).test(all)) fails.push(`Text nennt falsche Opferfigur: ${a}`);
  }
  for (const r of f.textNicht || []) if (new RegExp(r, 'i').test(all)) fails.push(`verbotener Text /${r}/`);
  for (const r of f.text || []) if (!new RegExp(r, 'i').test(all)) fails.push(`fehlender Text /${r}/`);
  return fails;
}

function printDetail(P, an, i, texts) {
  const L = (ls, fen) => (ls || []).map(l => `${fmt(l)} ${l.pv.slice(0, 6).join(' ')}`).join('  |  ');
  const x = an.moves[i];
  console.log(`    Stellung: ${P.fens[i]}`);
  console.log(`    vorher  (d${DEPTH}): ${L(an.lines[i])}`);
  console.log(`    nachher (d${DEPTH}): ${L(an.lines[i + 1])}`);
  console.log(`    wpB=${x.wpB} wpA=${x.wpA} loss=${x.loss} best=${x.best} err=${x.err} obvious=${x.obvious}`);
  for (const [k, ts] of Object.entries(texts)) ts.forEach((t, n) => console.log(`    [${k} ${n + 1}] ${t}`));
}

// ---------- Modus: ganze Partie ----------
async function runPartie(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let f;
  if (file.endsWith('.json')) { const j = JSON.parse(raw); f = { pgn: j.pgn || j.moves, elo: { w: j.white?.rating ?? 1500, b: j.black?.rating ?? 1500 }, weiss: j.white?.username, schwarz: j.black?.username }; }
  else f = { pgn: raw, elo: 1500 };
  if (opt('--elo')) f.elo = +opt('--elo');
  if (opt('--elo-w') || opt('--elo-b')) f.elo = { w: +(opt('--elo-w') || 1500), b: +(opt('--elo-b') || 1500) };
  const game = makeGame(f, path.basename(file));
  const { an, P } = await analyse(game);
  an.moves.forEach((x, i) => {
    const sp = ['brilliant', 'great', 'miss', 'blunder', 'mistake'].includes(x.cls);
    console.log(`${label(P, i).padEnd(14)} ${CLASS_DE[x.cls].padEnd(14)} loss=${String(x.loss).padStart(5)} wpB=${x.wpB} wpA=${x.wpA}${x.err ? ' ' + x.err : ''}`);
    if (VERBOSE || (sp && flag('--texte'))) textsFor(game, an, P, i).selbst.forEach(t => console.log('      ' + t));
  });
}

// ---------- Modus: Korpus ----------
async function runKorpus() {
  const K = JSON.parse(fs.readFileSync(opt('--faelle') ? path.resolve(opt('--faelle')) : path.join(DIR, 'faelle.json'), 'utf8'));
  const only = opt('--fall');
  const faelle = K.faelle.filter(f => !only || f.id === only || f.id.includes(only));
  // gleiche Partien nur einmal analysieren
  const memo = new Map();
  const results = [];
  for (const f of faelle) {
    const game = makeGame(f, f.id);
    const key = game.pgn + JSON.stringify([game.white.rating, game.black.rating]);
    if (!memo.has(key)) memo.set(key, analyse(game));
  }
  for (const f of faelle) {
    const game = makeGame(f, f.id);
    const key = game.pgn + JSON.stringify([game.white.rating, game.black.rating]);
    let r;
    try {
      const { an, P } = await memo.get(key);
      const i = findPly(P, f.zug);
      if (i < 0) throw new Error(`Zug ${f.zug} nicht gefunden`);
      const x = an.moves[i];
      const texts = textsFor(game, an, P, i);
      const fails = check(f, x, texts);
      r = { id: f.id, kategorie: f.kategorie, zug: label(P, i), cls: x.cls, err: x.err, loss: x.loss, wpB: x.wpB, wpA: x.wpA, ok: !fails.length, fails, texts };
      const tag = r.ok ? 'OK  ' : 'FEHL';
      console.log(`${tag} ${f.id.padEnd(30)} ${r.zug.padEnd(14)} → ${CLASS_DE[x.cls].padEnd(13)}${r.ok ? '' : '  ✗ ' + fails.join('; ')}`);
      if (VERBOSE || (!r.ok && flag('--details'))) printDetail(P, an, i, texts);
    } catch (e) {
      r = { id: f.id, ok: false, fails: ['Ausnahme: ' + e.message] };
      console.log(`FEHL ${f.id.padEnd(30)} Ausnahme: ${e.message}`);
    }
    results.push(r);
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length} Fälle, ${results.length - bad.length} bestanden, ${bad.length} gescheitert  (Tiefe ${DEPTH}, Engine: ${engine.calc} neu gerechnet, ${engine.hits} aus Cache)`);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ tiefe: DEPTH, results }, null, 1));
  return bad.length;
}

let code = 0;
try {
  if (opt('--partie')) await runPartie(opt('--partie'));
  else code = (await runKorpus()) ? 1 : 0;
} finally { engine.quit(); }
process.exit(code);
