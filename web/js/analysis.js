// Partie-Analyse: Zugbewertung, Genauigkeit, Fehlertypen, Taktikaufgaben
import { Chess } from '../vendor/chess.js';
import { BOOK } from '../vendor/book.js';

export const CLASSES = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
export const CLASS_DE = {
  brilliant: 'Brillant', great: 'Großartig', best: 'Bester Zug', excellent: 'Exzellent', good: 'Gut', book: 'Theorie',
  inaccuracy: 'Ungenauigkeit', mistake: 'Fehler', miss: 'Verpasst', blunder: 'Patzer', forced: 'Erzwungen'
};
export const ERR_DE = {
  hung: 'Material eingestellt', missedTactic: 'Taktik verpasst', missedMate: 'Matt übersehen',
  allowedMate: 'Matt zugelassen', notPunished: 'Gegnerfehler nicht bestraft', positional: 'Stellungsfehler'
};
export const PHASE_DE = { opening: 'Eröffnung', middlegame: 'Mittelspiel', endgame: 'Endspiel' };
export const QUALITY = {
  schnell: { depth: 12, movetime: 300 },
  standard: { depth: 16, movetime: 900 },
  gruendlich: { depth: 22, movetime: 3000 },
};
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const BAD = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

export const bookKey = fen => fen.split(' ').slice(0, 4).join(' ');

// Bewertung (Weiß-Sicht) → Gewinnchance für Weiß in %
export function winPct(ev) {
  if (!ev) return 50;
  if (ev.mate != null) return ev.mate > 0 ? 100 : ev.mate < 0 ? 0 : (ev.matedWhite ? 0 : 100);
  const cp = Math.max(-1500, Math.min(1500, ev.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
export function fmtEval(ev) {
  if (!ev) return '';
  if (ev.mate != null) return ev.mate === 0 ? '#' : (ev.mate > 0 ? 'M' : '-M') + Math.abs(ev.mate);
  const v = ev.cp / 100; return (v > 0 ? '+' : '') + v.toFixed(1);
}
function material(chess) {
  let w = 0, b = 0;
  for (const row of chess.board()) for (const p of row) if (p) (p.color === 'w' ? (w += VAL[p.type]) : (b += VAL[p.type]));
  return { w, b, nonPawn: chess.board().flat().filter(p => p && p.type !== 'p' && p.type !== 'k').reduce((s, p) => s + VAL[p.type], 0) };
}
const bal = (chess, c) => { const m = material(chess); return c === 'w' ? m.w - m.b : m.b - m.w; };
// Materialbilanz für Farbe c entlang einer Zugfolge (uci), Werte nach jedem Halbzug
function balAlong(fen, pv, c, n = 6) {
  const ch = new Chess(fen); const out = [];
  for (const u of pv.slice(0, n)) {
    try { ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    out.push(bal(ch, c));
  }
  return out;
}
export function uciToSan(fen, uci) {
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { return uci; }
}
export function pvToSan(fen, pv, n = 6) {
  const ch = new Chess(fen); const out = [];
  for (const u of pv.slice(0, n)) { try { out.push(ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; } }
  return out;
}

// PGN von chess.com → Positionen, Züge, Uhrzeiten
export function parseGame(g) {
  const ch = new Chess();
  ch.loadPgn(g.pgn);
  const hist = ch.history({ verbose: true });
  const clocks = [...g.pgn.matchAll(/\[%clk ([\d:.]+)\]/g)].map(m => m[1].split(':').reduce((a, x) => a * 60 + parseFloat(x), 0));
  const tc = String(g.time_control || '');
  const base = /^\d+/.test(tc) ? parseInt(tc) : null, inc = +(tc.split('+')[1] || 0);
  const fens = [hist.length ? hist[0].before : ch.fen()];
  const moves = hist.map((m, i) => { fens.push(m.after); return { san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to, color: m.color, clock: clocks[i] ?? null, piece: m.piece, captured: m.captured }; });
  moves.forEach((m, i) => {
    const prev = i >= 2 ? moves[i - 2].clock : base;
    m.spent = (prev != null && m.clock != null) ? Math.max(0, prev - m.clock + inc) : null;
  });
  const opening = (g.eco || '').split('/openings/')[1]?.replace(/-/g, ' ').replace(/\s\d.*$/, '') || '';
  return { fens, moves, base, inc, opening };
}

// Auswertung eines Zuges anhand der Engine-Ergebnisse vor/nach dem Zug
function terminalEval(fen) {
  const ch = new Chess(fen);
  if (ch.isCheckmate()) return { mate: 0, cp: null, matedWhite: ch.turn() === 'w' };
  if (ch.isDraw() || ch.isStalemate()) return { cp: 0, mate: null };
  return null;
}

export async function analyseGame(game, engine, quality = 'standard', onProgress) {
  const P = parseGame(game);
  const q = QUALITY[quality] || QUALITY.standard;
  let done = 0;
  // Alle Stellungen gleichzeitig in die Warteschlange – die Engines arbeiten sie parallel ab
  const res = await Promise.all(P.fens.map(async fen => {
    const t = terminalEval(fen);
    let out;
    if (t) out = { ev: t, lines: [] };
    else {
      const r = await engine.analyse(fen, { ...q, multipv: 2 });
      const l = r.lines[0] || { cp: 0, mate: null, pv: [] };
      out = { ev: { cp: l.cp, mate: l.mate }, lines: r.lines.map(x => ({ move: x.move, pv: x.pv.slice(0, 10), cp: x.cp, mate: x.mate })), depth: r.depth };
    }
    onProgress?.(++done, P.fens.length);
    return out;
  }));
  return finish(game, P, res, quality);
}

function finish(game, P, res, quality) {
  const out = [];
  for (let i = 0; i < P.moves.length; i++) {
    const m = P.moves[i], c = m.color, sgn = c === 'w' ? 1 : -1;
    const before = res[i], after = res[i + 1];
    const wpB = c === 'w' ? winPct(before.ev) : 100 - winPct(before.ev);
    const wpA = c === 'w' ? winPct(after.ev) : 100 - winPct(after.ev);
    const loss = Math.max(0, wpB - wpA);
    const best = before.lines[0]?.move;
    const isBest = best === m.uci;
    const legal = new Chess(P.fens[i]).moves().length;
    let cls;
    const inBook = i < 30 && bookKey(P.fens[i + 1]) in BOOK && (i === 0 || out[i - 1].cls === 'book');
    if (inBook) cls = 'book';
    else if (legal === 1) cls = 'forced';
    else if (isBest || loss < 0.5) cls = 'best';
    else if (loss < 2) cls = 'excellent';
    else if (loss < 5) cls = 'good';
    else if (loss < 10) cls = 'inaccuracy';
    else if (loss < 20) cls = 'mistake';
    else cls = 'blunder';

    // Offensichtlich: Zurückschlagen oder eine gleich-/höherwertige Figur schlagen
    const prevM = i > 0 ? P.moves[i - 1] : null;
    const obvious = !!(prevM && prevM.captured && m.to === prevM.to) || !!(m.captured && VAL[m.captured] >= VAL[m.piece]);
    // Großartig: einziger guter Zug (zweitbester deutlich schlechter) – aber nicht bei offensichtlichen Zügen
    if (cls === 'best' && before.lines[1] && !obvious) {
      const wp1 = c === 'w' ? winPct(before.lines[0]) : 100 - winPct(before.lines[0]);
      const wp2 = c === 'w' ? winPct(before.lines[1]) : 100 - winPct(before.lines[1]);
      if (wp1 - wp2 >= 15 && wpA >= 40 && wpB < 95) cls = 'great';
    }
    // Brillant: guter Zug mit echtem Materialopfer, Stellung nicht schon völlig gewonnen
    if ((cls === 'best' || cls === 'great' || cls === 'excellent') && wpB < 95 && wpA >= 45 && after.lines[0]) {
      const b0 = bal(new Chess(P.fens[i]), c);
      const seq = balAlong(P.fens[i + 1], after.lines[0].pv, c, 4);
      if (!obvious && seq.length >= 2 && seq[0] <= b0 - 2 && seq[1] <= b0 - 2 && m.piece !== 'p') cls = 'brilliant';
    }
    // Verpasst: Gegner hat zuvor gepatzt, und du nutzt es nicht
    if ((cls === 'mistake' || cls === 'blunder' || cls === 'inaccuracy') && i > 0 && ['mistake', 'blunder', 'miss'].includes(out[i - 1].cls) && loss >= 10 && wpB >= 55 && !(cls === 'blunder' && wpA < 30)) cls = 'miss';

    const acc = ['book', 'forced', 'best', 'great', 'brilliant'].includes(cls) ? 100
      : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

    // Fehlertyp
    let err = null;
    if (BAD.has(cls)) {
      const bm = before.lines[0]?.mate, am = after.ev.mate;
      if (bm != null && bm * sgn > 0 && !(am != null && am * sgn > 0)) err = 'missedMate';
      else if (am != null && am * sgn < 0) err = 'allowedMate';
      else {
        const b0 = bal(new Chess(P.fens[i]), c);
        const oppLine = after.lines[0]?.pv || [];
        const seqA = balAlong(P.fens[i + 1], oppLine, c, 4);
        const bestLine = before.lines[0]?.pv || [];
        const seqB = balAlong(P.fens[i], bestLine, c, 5);
        const endA = seqA.length ? Math.min(...seqA.filter((_, k) => k % 2 === 1 || k === seqA.length - 1)) : b0;
        const endB = seqB.length ? seqB[seqB.length - 1] : b0;
        if (endA <= b0 - 2 && (bal(new Chess(P.fens[i + 1]), c) >= b0 - 1)) err = 'hung';
        else if (endB >= b0 + 2 && endB - endA >= 2) err = 'missedTactic';
        else if (cls === 'miss') err = 'notPunished';
        else err = 'positional';
      }
      if (cls === 'miss' && err === 'positional') err = 'notPunished';
    }
    const mat = material(new Chess(P.fens[i]));
    const phase = i < 20 && mat.nonPawn > 50 ? 'opening' : mat.nonPawn <= 26 ? 'endgame' : 'middlegame';
    const pressure = m.clock != null && P.base ? (m.clock < Math.min(30, P.base * 0.1)) : false;
    out.push({ cls, loss: +loss.toFixed(1), acc: +acc.toFixed(1), wpB: +wpB.toFixed(1), wpA: +wpA.toFixed(1), best, err, phase, pressure, obvious });
  }

  const accOf = c => {
    const a = out.filter((_, i) => P.moves[i].color === c).map(x => x.acc);
    if (!a.length) return null;
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 10), 0);
    return +((mean + harm) / 2).toFixed(1);
  };
  return {
    url: game.url, quality, v: 1, end_time: game.end_time,
    evals: res.map(r => r.ev), lines: res.map(r => r.lines), moves: out,
    accuracy: { w: accOf('w'), b: accOf('b') },
  };
}

// Taktikaufgaben aus eigenen Fehlern
export function extractPuzzles(game, an, me) {
  const P = parseGame(game);
  const myColor = game.white.username.toLowerCase() === me.toLowerCase() ? 'w' : 'b';
  const out = [];
  an.moves.forEach((mv, i) => {
    if (P.moves[i].color !== myColor || !['mistake', 'blunder', 'miss'].includes(mv.cls)) return;
    const line = an.lines[i]?.[0]; if (!line || !line.pv?.length) return;
    const wpBest = myColor === 'w' ? winPct(line) : 100 - winPct(line);
    if (wpBest < 60 && wpBest - mv.wpA < 25) return; // nur klare Lösungen
    let sol = line.pv.slice(0, 5);
    if (sol.length % 2 === 0) sol = sol.slice(0, -1);
    // Nach Matt / klarem Gewinn kürzen: mindestens 1 Zug
    out.push({
      id: game.url + '#' + i, gameUrl: game.url, ply: i, fen: P.fens[i], color: myColor, solution: sol,
      played: P.moves[i].san, wpBest: +wpBest.toFixed(1), wpPlayed: mv.wpA, cls: mv.cls, err: mv.err, mate: line.mate != null && line.mate * (myColor === 'w' ? 1 : -1) > 0 ? Math.abs(line.mate) : null,
      opponent: myColor === 'w' ? game.black.username : game.white.username, time_class: game.time_class, end_time: game.end_time,
      tries: 0, solved: 0, failed: 0, due: 0,
    });
  });
  return out;
}

// Erklärungstext im Stil eines Trainers
export function coachText(game, an, P, i) {
  const m = P.moves[i], mv = an.moves[i];
  const bestSan = mv.best ? uciToSan(P.fens[i], mv.best) : '';
  const name = CLASS_DE[mv.cls];
  const pre = { brilliant: 'ist brillant', great: 'ist großartig', best: 'ist der beste Zug', excellent: 'ist exzellent', good: 'ist gut',
    book: 'ist Eröffnungstheorie', inaccuracy: 'ist eine Ungenauigkeit', mistake: 'ist ein Fehler', miss: 'ist eine verpasste Chance',
    blunder: 'ist ein Patzer', forced: 'war erzwungen' }[mv.cls];
  let t = `${m.san} ${pre}.`;
  if (mv.cls === 'brilliant') t += ' Ein starkes Opfer, das funktioniert.';
  if (mv.cls === 'great') t += ' Der einzige Zug, der die Stellung hält.';
  if (mv.cls === 'book') { const nm = BOOK[bookKey(P.fens[i + 1])]; if (nm) t += ` (${nm.slice(4)})`; }
  if (['excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(mv.cls) && bestSan && bestSan !== m.san) t += ` Bester Zug war ${bestSan}.`;
  const opp = an.lines[i + 1]?.[0];
  const oppSan = opp ? uciToSan(P.fens[i + 1], opp.move) : '';
  const L = an.lines[i]?.[0];
  switch (mv.err) {
    case 'hung': t += ` Danach gewinnt ${oppSan} Material.`; break;
    case 'missedTactic': t += ` Mit ${bestSan} hättest du Material gewonnen (${pvToSan(P.fens[i], L.pv, 5).join(' ')}).`; break;
    case 'missedMate': t += ` Hier gab es Matt in ${Math.abs(L.mate)}: ${pvToSan(P.fens[i], L.pv, Math.abs(L.mate) * 2 - 1).join(' ')}.`; break;
    case 'allowedMate': t += ` Damit lässt du Matt in ${Math.abs(an.evals[i + 1].mate)} zu (${oppSan}).`; break;
    case 'notPunished': t += ' Der Gegner hatte gerade einen Fehler gemacht – den hast du nicht bestraft.'; break;
  }
  if (mv.pressure && BAD.has(mv.cls)) t += ' Gespielt unter Zeitdruck.';
  return t;
}
