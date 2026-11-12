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
// Wie chess.com „Expected Points“: dieselbe Bewertung ist für schwächere Spieler weniger sicher gewonnen.
// Steilheit der Kurve hängt von der Wertungszahl ab (Annäherung, die genaue Formel ist nicht öffentlich).
export function eloFactor(r) { return Math.max(.55, Math.min(1.35, .45 + (r || 1500) / 1800)); }
export function winPctR(ev, rating) {
  if (!ev) return 50;
  if (ev.mate != null) return winPct(ev);
  const cp = Math.max(-1500, Math.min(1500, ev.cp)) * eloFactor(rating);
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

// ---------- Zugeinstufung nach dem Expected-Points-Prinzip (wie chess.com „Classification V2“) ----------
// Alle Werte in Prozentpunkten Expected Points (0..100 = 0.00..1.00), aus Sicht des Ziehenden, Elo-skaliert (winPctR).
// Schwellen (von chess.com veröffentlicht): Best 0.00, Exzellent ≤ 0.02, Gut ≤ 0.05, Ungenauigkeit ≤ 0.10, Fehler ≤ 0.20, Patzer > 0.20
export const EP = { best: 0.5, excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };
// Großartig: Abstand zum zweitbesten Zug – für Anfänger großzügiger (10 Pkt. bei ≤ 1000, linear bis 20 Pkt. ab 2000)
export const greatGap = R => 10 + 10 * Math.max(0, Math.min(1, ((R || 1500) - 1000) / 1000));
// Opfer: Mindest-Materialverlust (Bauerneinheiten); für Anfänger zählt auch, wenn das Opfer nur statisch hängt
export const sacNeed = () => 2;
// Stellungslage aus Expected Points: 0 verloren, 1 offen/ausgeglichen, 2 gewonnen
export const outcome = wp => wp < 30 ? 0 : wp > 70 ? 2 : 1;

// Reine Entscheidungsfunktion (testbar ohne Engine/Brett). Eingaben:
//  legal, inBook, R, loss (EP-Verlust gegenüber dem besten Zug), isBest, wpA (EP nach dem Zug),
//  wpAlt (EP des besten ANDEREN Zugs, null wenn unbekannt), wpB (EP vor dem Zug = bester Zug),
//  sacrifice (Figurenopfer erkannt), obvious, prevOppCls, wpPrev (eigene EP vor dem Gegnerzug)
export function classifyMove(o) {
  if (o.inBook) return 'book';
  if (o.legal === 1) return 'forced';
  const { loss } = o;
  let cls = o.isBest || loss < EP.best ? 'best' : loss < EP.excellent ? 'excellent' : loss < EP.good ? 'good'
    : loss < EP.inaccuracy ? 'inaccuracy' : loss < EP.mistake ? 'mistake' : 'blunder';
  const alt = o.wpAlt ?? o.wpB;
  // Brillant: bester oder fast bester Zug (≤ 0.02) + gutes Figurenopfer, danach nicht schlecht (≥ 0.45),
  // und ohne diesen Zug nicht ohnehin schon völlig gewonnen (bester anderer Zug < 0.90). Vorrang vor allem anderen.
  if ((cls === 'best' || cls === 'excellent') && o.sacrifice && !o.obvious && o.wpA >= 45 && alt < 90) return 'brilliant';
  // Großartig: einziger guter Zug – der beste andere Zug ist deutlich schlechter (Abstand je nach Wertung),
  // kritisch für den Ausgang: ohne den Zug nicht ohnehin gewonnen, mit dem Zug nicht verloren. Gleich gute Alternativen ⇒ kein Großartig.
  if (cls === 'best' && !o.obvious && o.wpAlt != null && o.wpA - o.wpAlt >= greatGap(o.R) && outcome(o.wpAlt) < 2 && outcome(o.wpA) > 0) return 'great';
  // Verpasst: Gegner hat gerade einen Fehler gemacht, du gibst den Vorteil wieder her –
  // aber nicht schlechter als vor seinem Fehler (sonst bleibt es Fehler/Patzer).
  if ((cls === 'mistake' || cls === 'blunder') && ['mistake', 'blunder', 'miss'].includes(o.prevOppCls) && o.wpPrev != null
    && o.wpB - o.wpPrev >= EP.inaccuracy && o.wpA >= o.wpPrev - 5) return 'miss';
  return cls;
}

// Figurenopfer: nach dem Zug kann der Gegner eine Figur (kein Bauer) mit Nettogewinn ≥ need schlagen
// (statisch: Wert der Figur minus Wert des Schlagenden, falls gedeckt; abzüglich dessen, was der Zug selbst geschlagen hat),
// und/oder die Hauptvariante zeigt den Materialverlust über zwei Halbzüge.
function isSacrifice(fenB, fenA, m, pvA, c, R) {
  const need = sacNeed(R);
  const b0 = bal(new Chess(fenB), c);
  const seq = balAlong(fenA, pvA || [], c, 4);
  // in der Hauptvariante muss der Gegner in den nächsten Halbzügen eine eigene Figur (kein Bauer) schlagen
  const pvPiece = (() => { const t = new Chess(fenA); for (const u of (pvA || []).slice(0, 3)) {
    let x; try { x = t.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return false; }
    if (x.color !== c && x.captured && x.captured !== 'p') return true; } return false; })();
  const pvSac = pvPiece && seq.length >= 2 && seq[0] <= b0 - need && seq[1] <= b0 - need;
  // Felder, auf denen der Gegner eine Figur (kein Bauer) gewinnbringend schlagen kann
  const hanging = (ch, minus) => {
    const out = new Set();
    for (const x of ch.moves({ verbose: true })) {
      if (!x.captured || x.captured === 'p') continue;
      const defended = ch.attackers(x.to, c).length > 0;
      if (VAL[x.captured] - (defended ? VAL[x.piece] : 0) - minus >= need) out.add(x.to);
    }
    return out;
  };
  const nowH = hanging(new Chess(fenA), m.captured ? VAL[m.captured] : 0);
  // Was schon vor dem Zug hing, ist kein neues Opfer (Stellung vorher mit Gegner am Zug betrachten)
  let preH = new Set();
  try { const f = fenB.split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; preH = hanging(new Chess(f.join(' ')), 0); } catch {}
  if (preH.has(m.from)) preH.add(m.to);
  const stat = [...nowH].some(sq => !preH.has(sq));
  // Ab 1200: Opfer muss auch in der besten Fortsetzung tatsächlich angenommen werden; darunter genügt die hängende Figur
  return R < 1200 ? (stat || pvSac) : pvSac;
}

function finish(game, P, res, quality) {
  const out = [];
  const side = (c, ev, R) => ev ? (c === 'w' ? winPctR(ev, R) : 100 - winPctR(ev, R)) : null;
  for (let i = 0; i < P.moves.length; i++) {
    const m = P.moves[i], c = m.color, sgn = c === 'w' ? 1 : -1;
    const before = res[i], after = res[i + 1];
    const R = (c === 'w' ? game.white : game.black)?.rating || 1500;
    const wpB = side(c, before.ev, R);
    let wpA = side(c, after.ev, R);
    const best = before.lines[0]?.move;
    const isBest = best === m.uci;
    // Ist der gespielte Zug eine der MultiPV-Linien, nimm deren Bewertung (gleiche Suche, kein Tiefenrauschen)
    const own = before.lines.findIndex(l => l.move === m.uci);
    if (own >= 0 && !terminalEval(P.fens[i + 1])) wpA = side(c, before.lines[own], R);
    if (isBest) wpA = Math.max(wpA, wpB);
    const loss = Math.max(0, wpB - wpA);
    const altLine = before.lines.find(l => l.move !== m.uci);
    const wpAlt = altLine ? side(c, altLine, R) : null;
    const legal = new Chess(P.fens[i]).moves().length;
    const inBook = i < 30 && bookKey(P.fens[i + 1]) in BOOK && (i === 0 || out[i - 1].cls === 'book');
    // Offensichtlich: Zurückschlagen oder eine gleich-/höherwertige Figur schlagen
    const prevM = i > 0 ? P.moves[i - 1] : null;
    const obvious = !!(prevM && prevM.captured && m.to === prevM.to) || !!(m.captured && VAL[m.captured] >= VAL[m.piece]);
    const sacrifice = !inBook && legal > 1 && loss < EP.excellent && isSacrifice(P.fens[i], P.fens[i + 1], m, after.lines[0]?.pv, c, R);
    const cls = classifyMove({
      legal, inBook, R, loss, isBest, wpA, wpB, wpAlt, sacrifice, obvious,
      prevOppCls: i > 0 ? out[i - 1].cls : null, wpPrev: i > 0 ? side(c, res[i - 1].ev, R) : null,
    });

    // Genauigkeit wie Lichess: aus dem Verlust an (Standard-)Gewinnchance, ohne Elo-Anpassung
    const sB = c === 'w' ? winPct(before.ev) : 100 - winPct(before.ev), sA = c === 'w' ? winPct(after.ev) : 100 - winPct(after.ev);
    const lossStd = Math.max(0, sB - sA);
    const acc = cls === 'forced' ? null : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * lossStd) - 3.1669 + 1));

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
    // Zeitdruck je Zeitkontrolle: Bullet < 10 s, Blitz < 30 s, Schnellschach < 60 s (Tägliche Partien: nie)
    const limit = !P.base ? null : P.base < 180 ? 10 : P.base < 600 ? 30 : P.base <= 3600 ? 60 : null;
    const pressure = m.clock != null && limit != null && m.clock < limit;
    out.push({ cls, loss: +loss.toFixed(1), acc: +acc.toFixed(1), wpB: +wpB.toFixed(1), wpA: +wpA.toFixed(1), best, err, phase, pressure, obvious, clock: m.clock });
  }

  // Lichess-Methode: volatilitätsgewichtetes Mittel + harmonisches Mittel, davon der Durchschnitt
  const wps = res.map(r => winPct(r.ev));
  const win = Math.max(2, Math.min(8, Math.floor(wps.length / 10)));
  const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const weights = out.map((_, i) => { const lo = Math.max(0, Math.min(i, wps.length - win)); return Math.max(.5, Math.min(12, sd(wps.slice(lo, lo + win)))); });
  const accOf = c => {
    const idx = out.map((x, i) => i).filter(i => P.moves[i].color === c && out[i].acc != null);
    if (!idx.length) return null;
    const a = idx.map(i => out[i].acc), w = idx.map(i => weights[i]);
    const wmean = a.reduce((s, x, k) => s + x * w[k], 0) / w.reduce((s, x) => s + x, 0);
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
    return +((wmean + harm) / 2).toFixed(1);
  };
  return {
    url: game.url, quality, v: 5, end_time: game.end_time,
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

// Bereits analysierte Partie neu einstufen (ohne neue Engine-Rechnung)
export function reclassify(game, an) {
  const P = parseGame(game);
  const res = an.evals.map((ev, i) => ({ ev, lines: an.lines[i] || [] }));
  return finish(game, P, res, an.quality);
}
