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
const NOM_DE = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
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
// Materialbilanz für Farbe c an den Ruhepunkten einer Zugfolge (uci), bis n Halbzüge (n gerade).
// Ruhepunkt: kein Schach und der nächste Halbzug der Folge schlägt nicht – so wird nie mitten im Abtausch gemessen.
// Gibt es keinen Ruhepunkt, zählt der letzte Wert.
export function quietBal(fen, pv, c, n = 8) {
  const ch = new Chess(fen), out = []; let last = null;
  const seq = pv || [];
  for (let k = 0; k < Math.min(n, seq.length); k++) {
    const u = seq[k];
    try { ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    last = bal(ch, c);
    const nx = seq[k + 1];
    let nextCap = false;
    if (nx) {
      const p = ch.get(nx.slice(0, 2));
      nextCap = !!ch.get(nx.slice(2, 4)) || !!(p && p.type === 'p' && nx[0] !== nx[2]);
    }
    if (!ch.inCheck() && !nextCap) out.push(last);
  }
  return out.length ? out : last != null ? [last] : [];
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
  let done = 0, total = P.fens.length;
  const slim = x => ({ move: x.move, pv: x.pv.slice(0, 10), cp: x.cp, mate: x.mate });
  // Alle Stellungen gleichzeitig in die Warteschlange – die Engines arbeiten sie parallel ab
  const res = await Promise.all(P.fens.map(async fen => {
    const t = terminalEval(fen);
    let out;
    if (t) out = { ev: t, lines: [] };
    else {
      const r = await engine.analyse(fen, { ...q, multipv: 2 });
      const l = r.lines[0] || { cp: 0, mate: null, pv: [] };
      out = { ev: { cp: l.cp, mate: l.mate }, lines: r.lines.map(slim), depth: r.depth };
    }
    onProgress?.(++done, total);
    return out;
  }));
  // 2. Wert des gespielten Zuges aus derselben Stellung (searchmoves), wenn er in keiner MultiPV-Linie steht
  //    und der Verlust nahe einer Klassengrenze liegt – dort entscheidet sonst das Rauschen der Nachher-Suche.
  const pre = finish(game, P, res, quality);
  const smJobs = P.moves.map((m, i) => i).filter(i => {
    const m = P.moves[i], x = pre.moves[i];
    if (terminalEval(P.fens[i]) || res[i].lines.some(l => l.move === m.uci) || x.cls === 'book' || x.cls === 'forced') return false;
    return nearBoundary(x.loss);
  });
  total += smJobs.length;
  await Promise.all(smJobs.map(async i => {
    const r = await engine.analyse(P.fens[i], { ...q, multipv: 1, searchmoves: [P.moves[i].uci] });
    const l = r.lines.find(x => x.move === P.moves[i].uci);
    if (l) res[i].lines.push({ ...slim(l), sm: 1 });
    onProgress?.(++done, total);
  }));
  const pre2 = finish(game, P, res, quality, true);
  // 3. Brillant-/Großartig-Kandidaten tiefer nachrechnen (+4 Halbzüge, MultiPV 3, nur diese wenigen Stellungen),
  //    damit die Schwellen nicht am Tiefenrauschen kippen. Gespeichert in an.deep → reclassify braucht keine Engine.
  const deepQ = { depth: q.depth + 4, movetime: q.movetime * 3 };
  total += pre2.cand.length;
  await Promise.all(pre2.cand.map(async i => {
    const r = await engine.analyse(P.fens[i], { ...deepQ, multipv: 3 });
    const lines = r.lines.map(slim);
    if (!lines.some(l => l.move === P.moves[i].uci)) {
      const s = await engine.analyse(P.fens[i], { ...deepQ, multipv: 1, searchmoves: [P.moves[i].uci] });
      const l = s.lines.find(x => x.move === P.moves[i].uci);
      if (l) lines.push({ ...slim(l), sm: 1 });
    }
    if (lines.length) res[i].deep = { lines, depth: r.depth };
    onProgress?.(++done, total);
  }));
  const out = finish(game, P, res, quality);
  delete out.cand;
  return out;
}
// Liegt ein EP-Verlust nahe einer Klassengrenze (Exzellent/Gut/Ungenauigkeit/Fehler/Patzer)?
// Fensterbreiten so gewählt, dass die Zusatzsuchen zusammen mit der Nachrechnung ≤ ~25 % Rechenzeit kosten (gemessen an 70 Partien)
const nearBoundary = loss => [[EP.excellent, 0.5], [EP.good, 1], [EP.inaccuracy, 1.5], [EP.mistake, 2.5]].some(([b, w]) => Math.abs(loss - b) <= w);

// ---------- Zugeinstufung nach dem Expected-Points-Prinzip (wie chess.com „Classification V2“) ----------
// Spezifikation: docs/klassifizierung_spec.md. Alle Werte in Prozentpunkten Expected Points (0..100 = 0.00..1.00),
// aus Sicht des Ziehenden, Elo-skaliert (winPctR).
// Schwellen (von chess.com veröffentlicht): Best 0.00, Exzellent ≤ 0.02, Gut ≤ 0.05, Ungenauigkeit ≤ 0.10, Fehler ≤ 0.20, Patzer > 0.20
export const EP = { best: 0.5, excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };
// Großartig: Abstand zum besten anderen Zug – 0.10 bis 1200 Elo, linear bis 0.15 ab 2200 (für Anfänger großzügiger)
export const greatGap = R => 10 + 5 * Math.max(0, Math.min(1, ((R || 1500) - 1200) / 1000));
// Brillant: „ohnehin völlig gewonnen“ ab dieser EP des besten anderen Zuges
export const winAnyway = R => (R || 1500) < 1200 ? 95 : 90;
// Stellungslage aus Expected Points: 0 verloren, 1 offen/ausgeglichen, 2 gewonnen
export const outcome = wp => wp < 30 ? 0 : wp > 70 ? 2 : 1;
// Weicht die Suche nach dem Zug so stark von der MultiPV-Bewertung ab, gilt die Nachher-Suche (sie ist einen Halbzug tiefer)
const DISAGREE = 20;

// Reine Entscheidungsfunktion (testbar ohne Engine/Brett). Eingaben:
//  legal (Anzahl legaler Züge), inBook (Theorie, schon geprüft: Kette intakt und kein Fehler), mate (Zug setzt matt),
//  R, loss (EP-Verlust gegenüber dem besten Zug), isBest (gespielter Zug = Top-Zug), base (optional: Grundklasse fest, Mattlängen),
//  wpA (EP nach dem Zug), wpB (EP des besten Zuges), wpAlt (EP des besten ANDEREN Zuges, null wenn unbekannt),
//  sacrifice (true/false oder Funktion → wird nur bei Brillant-Kandidaten aufgerufen), obvious (Antwort auf Schach,
//  Zurückschlagen, Damenumwandlung), freeCapture (schlägt eine freie Figur), prevOppCls, wpPrev (eigene EP vor dem Gegnerzug)
export function classifyMove(o) {
  if (o.legal === 1) return 'forced';
  if (o.inBook) return 'book';
  if (o.mate) return 'best';
  const { loss } = o;
  let cls = o.base || (o.isBest || loss < EP.best ? 'best' : loss < EP.excellent ? 'excellent' : loss < EP.good ? 'good'
    : loss < EP.inaccuracy ? 'inaccuracy' : loss < EP.mistake ? 'mistake' : 'blunder');
  // Ein kurzes Matt (≤ 3) auszulassen, ist mindestens eine Ungenauigkeit – auch wenn die EP danach noch fast 1 ist
  if (o.missedShortMate && (cls === 'best' || cls === 'excellent' || cls === 'good')) cls = 'inaccuracy';
  // Langes Matt (> 5) ausgelassen, aber weiter entscheidend vorn (≥ +6,00): wie ein längerer Mattweg höchstens „Gut“
  // (sonst macht die Elo-Skalierung aus +8 bei 600 Elo eine Ungenauigkeit)
  if (o.longMateWin && ['inaccuracy', 'mistake', 'blunder'].includes(cls)) cls = 'good';
  const R = o.R || 1500;
  // Brillant: bester Zug (unter 1200 auch exzellent) + echtes Figurenopfer, danach nicht schlecht (≥ 0.45),
  // und ohne diesen Zug nicht ohnehin völlig gewonnen: bester anderer Zug < 0.90 bzw. 0.95 (Elo-skaliert)
  // UND Elo-unabhängig weder ≥ +6,00 noch Matt (altWon)
  const okBase = R < 1200 ? (cls === 'best' || cls === 'excellent') : cls === 'best';
  if (okBase && !o.obvious && !o.altWon && o.wpAlt != null && o.wpA >= 45 && o.wpAlt < winAnyway(R)) {
    const sac = typeof o.sacrifice === 'function' ? o.sacrifice() : o.sacrifice;
    if (sac && (sac === true || sac.length)) return 'brilliant';
  }
  // Großartig: Top-Zug, der beste andere Zug ist deutlich schlechter und fällt in eine schlechtere Lage-Kategorie
  // (verloren statt offen, offen statt gewonnen). Nicht für offensichtliche Züge und nicht für offensichtlichen
  // Materialgewinn durch Schlagen (freeCapture: SEE ≥ 2 Bauerneinheiten).
  if (cls === 'best' && o.isBest && !o.obvious && o.wpAlt != null && o.wpA - o.wpAlt >= greatGap(R)
    && outcome(o.wpAlt) < outcome(o.wpA)) {
    const free = typeof o.freeCapture === 'function' ? o.freeCapture() : o.freeCapture;
    if (!free) return 'great';
  }
  // Verpasst: Gegner hat gerade einen Fehler gemacht, du gibst den Vorteil wieder her –
  // aber nicht schlechter als vor seinem Fehler (sonst bleibt es Fehler/Patzer).
  if ((cls === 'mistake' || cls === 'blunder') && ['mistake', 'blunder', 'miss'].includes(o.prevOppCls) && o.wpPrev != null
    && o.wpB - o.wpPrev >= EP.inaccuracy && o.wpA >= o.wpPrev - 5 && (outcome(o.wpA) < outcome(o.wpB) || loss >= EP.mistake)) return 'miss';
  return cls;
}

// ---------- Statische Opfererkennung (Spezifikation Abschnitt 4) ----------
// Alles mit chess.js und legalen Zügen: Abtauschrechnung (SEE), sofortiger Gegenschlag, beste ruhige Parade.
const SV = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };
const mvObj = x => ({ from: x.from, to: x.to, promotion: x.promotion });
// Schneller Pfad über die internen chess.js-Funktionen (ohne SAN-Erzeugung je Zug, ~20× schneller); sonst öffentliche API
const FAST = ['_moves', '_makeMove', '_undoMove'].every(k => typeof Chess.prototype[k] === 'function');
const ALG = i => 'abcdefgh'[i & 15] + (8 - (i >> 4));
const gen = (ch, square) => FAST
  ? ch._moves(square ? { square } : {}).map(m => ({ from: ALG(m.from), to: ALG(m.to), piece: m.piece, captured: m.captured, promotion: m.promotion, _m: m }))
  : ch.moves(square ? { square, verbose: true } : { verbose: true });
const make = (ch, x) => FAST ? ch._makeMove(x._m) : ch.move(mvObj(x));
const unmake = ch => FAST ? ch._undoMove() : ch.undo();
// billigster legaler Schlag der Seite am Zug auf Feld sq
function cheapestCapture(ch, sq) {
  let best = null, bv = 1e9;
  for (const f of ch.attackers(sq, ch.turn())) for (const x of gen(ch, f)) {
    if (x.to !== sq || !x.captured) continue;
    const v = x.promotion ? SV[x.promotion] : SV[x.piece];
    if (v < bv) { bv = v; best = x; }
  }
  return best;
}
// Gewinn des Schlagenden für die Schlagfolge, die mit x beginnt (danach darf jede Seite aufhören)
function see(ch, x) {
  const gain = x.captured ? SV[x.captured] : 0;
  make(ch, x);
  const nx = cheapestCapture(ch, x.to);
  const rec = nx ? Math.max(0, see(ch, nx)) : 0;
  unmake(ch);
  return gain - rec;
}
// bester sofortiger Schlaggewinn der Seite am Zug (≥ 0); Schläge auf skip und Schläge der Figur auf from ausgenommen
function bestCapture(ch, skip, from) {
  const me = ch.turn(), T = [];
  for (const row of ch.board()) for (const p of row) if (p && p.color !== me && p.type !== 'k' && p.square !== skip) T.push(p);
  T.sort((a, b) => SV[b.type] - SV[a.type]);
  let g = 0; lastGross = 0;
  for (const p of T) {
    if (SV[p.type] <= g) break; // mehr als den Wert der Figur bringt kein Schlag
    for (const f of ch.attackers(p.square, me)) {
      if (f === from) continue;
      for (const x of gen(ch, f)) if (x.to === p.square) { const s = see(ch, x); if (s > g) { g = s; lastGross = SV[p.type]; } }
    }
  }
  return g;
}
let lastGross = 0; // Wert der Figur, die der beste Schlag von bestCapture trifft
// beste ruhige Parade der Seite am Zug: max über alle nicht schlagenden Züge von −(bester Schlaggewinn des Gegners danach), ≤ 0.
// Drohungen der Figur auf sq zählen nicht: sie verschwinden ja gerade, wenn man diese Figur schlägt.
// Bricht ab, sobald das Ergebnis über stop liegt (dann steht schon fest, dass die Figur nicht hängt).
function parry(ch, sq, stop) {
  let best = -Infinity;
  for (const x of gen(ch)) {
    if (x.captured) continue;
    make(ch, x); const v = -bestCapture(ch, null, sq); unmake(ch);
    if (v > best) best = v;
    if (best >= 0 || best > stop) break;
  }
  return best === -Infinity ? 0 : best;
}
// echter Gewinn der Seite am Zug, wenn sie die Figur auf x schlägt: max(SEE − Gegenschlag) − beste ruhige Parade.
// Ergebnis ≥ 1 oder 0 (kein echter Gewinn). Ab „want“ wird die (teure) Parade nicht mehr gerechnet – sie kann den Gewinn nur erhöhen.
function gainAt(ch, x, want = 1) {
  let sk = -Infinity;
  for (const f of ch.attackers(x, ch.turn())) for (const c of gen(ch, f)) {
    if (c.to !== x) continue;
    const s = see(ch, c); if (s < 1 || s <= sk) continue;
    const xv = SV[ch.get(x).type];
    make(ch, c); const k = bestCapture(ch, x), kv = lastGross; unmake(ch);
    // Gegenschlag auf eine mindestens gleich wertvolle Figur: Tausch (+ evtl. Bauer), kein Figurenopfer (Spec 4.1)
    if (k >= 1 && kv >= xv) continue;
    sk = Math.max(sk, s - k);
  }
  if (sk === -Infinity) return 0;
  // Steht die Seite am Zug im Schach, gibt es keine „ruhige Parade“ – nur Fluchtzüge, die oft mehr verlieren.
  // Sie würden einen glatten Tausch mit Schach (Txe8+ Dxe8) zum Opfer aufblähen. Dann zählt nur die Abtauschrechnung.
  if (sk >= want || ch.inCheck()) return sk >= 1 ? sk : 0;
  const g = sk - parry(ch, x, sk - 1);
  return g >= 1 ? g : 0;
}
// hängende Figuren (S, L, T, D) der Farbe S; der Gegner ist am Zug
function hangingSet(ch, S, want = 1) {
  const H = new Map();
  for (const row of ch.board()) for (const p of row) {
    if (!p || p.color !== S || !'nbrq'.includes(p.type)) continue;
    const g = gainAt(ch, p.square, want);
    if (g) H.set(p.square, { type: p.type, gain: g });
  }
  return H;
}
// Welche eigenen Figuren opfert der Zug uci in der Stellung fenB? → [{piece, square, net, before}] (wertvollste zuerst)
export function findSacrifices(fenB, uci) {
  const ch = new Chess(fenB), S = ch.turn();
  if (ch.inCheck()) return [];
  let mv; try { mv = ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return []; }
  const capv = mv.captured ? SV[mv.captured] : 0;
  const HQ = hangingSet(ch, S, 1 + capv);
  ch.undo();
  if (![...HQ.values()].some(h => h.gain - capv >= 1)) return [];
  // Was hing schon vor dem Zug? (Nullzug: Gegner am Zug, en passant gelöscht)
  let HP = new Map();
  try { const f = fenB.split(' '); f[1] = S === 'w' ? 'b' : 'w'; f[3] = '-'; HP = hangingSet(new Chess(f.join(' ')), S); } catch {}
  // Rettung: eine vorher hängende Figur hängt nach dem Zug (auf ihrem neuen Feld) nicht mehr
  let rescued = 0;
  for (const [y, h] of HP) if (!HQ.has(y === mv.from ? mv.to : y)) rescued = Math.max(rescued, SV[h.type]);
  // gefangen: jedes Zielfeld der Figur hängt ebenfalls (Desperado)
  const trapped = from => {
    for (const x of gen(ch, from)) {
      make(ch, x); const g = gainAt(ch, x.to); unmake(ch);
      if (!g) return false;
    }
    return true;
  };
  const out = [];
  for (const [x, h] of HQ) {
    const net = h.gain - capv; if (net < 1) continue;
    // Schadensbegrenzung beim Doppelangriff – auch für die gezogene Figur (14.Lxb5: schlägt den gabelnden Bauern,
    // rettet die Dame und gibt den ohnehin verlorenen Läufer) – sowie Desperado der gezogenen Figur
    if (x === mv.to) { if (HP.has(mv.from) && (rescued >= SV[h.type] || trapped(mv.from))) continue; }
    else if (HP.has(x) && rescued >= SV[h.type]) continue;
    out.push({ piece: h.type, square: x, net, before: x === mv.to ? HP.has(mv.from) : HP.has(x) });
  }
  return out.sort((a, b) => SV[b.piece] - SV[a.piece] || b.net - a.net);
}
// Abtauschrechnung (SEE) des gespielten Zuges in der Stellung fenB; null, wenn der Zug nicht schlägt
function seeOf(fenB, m) {
  if (!m.captured) return null;
  const ch = new Chess(fenB);
  const x = gen(ch, m.from).find(y => y.to === m.to && (y.promotion || '') === (m.uci[4] || ''));
  return x ? see(ch, x) : null;
}

function finish(game, P, res, quality, wantCand = false) {
  const out = [], cand = [];
  const side = (c, ev, R) => ev ? (c === 'w' ? winPctR(ev, R) : 100 - winPctR(ev, R)) : null;
  let chain = false, bookAcc = false; // Theorie-Kette: alle bisherigen Züge Theorie
  for (let i = 0; i < P.moves.length; i++) {
    const m = P.moves[i], c = m.color, sgn = c === 'w' ? 1 : -1;
    const before = res[i], after = res[i + 1];
    const R = (c === 'w' ? game.white : game.black)?.rating || 1500;
    // Für die Einstufung zählt die tiefere Nachrechnung, falls vorhanden (nur Brillant-/Großartig-Kandidaten);
    // Bewertungsbalken und Genauigkeit bleiben bei der normalen Suche (before.ev / after.ev).
    const lines = before.deep?.lines || before.lines || [];
    const depthB = before.deep?.depth ?? before.depth;
    const best = lines[0]?.move;
    const top = best === m.uci;
    const term = terminalEval(P.fens[i + 1]);
    const mate = !!(term && term.mate === 0);
    // EP des gespielten Zuges: seine MultiPV-Linie (gleiche Suche, kein Tiefenrauschen) – außer die Suche nach dem Zug
    // sieht ein Matt gegen den Ziehenden, oder sie rechnete tiefer und kommt auf einen deutlich anderen Wert (dann ist sie genauer).
    // Bei gleicher Tiefe gilt ein bloß anderer Wert nicht als genauer (Horizont-Effekte gibt es in beiden Suchen).
    const wpAfter = side(c, after.ev, R);
    // Die eigene Linie kann auch aus einer searchmoves-Suche derselben Stellung stammen (Kennzeichen sm)
    const evalMove = (ls, dB) => {
      const tp = ls[0]?.move === m.uci;
      const own = ls.find(l => l.move === m.uci);
      let a = wpAfter, dis = false;
      if (own && !term) {
        const wpLine = side(c, own, R);
        const mAfter = after.ev?.mate != null ? Math.sign(after.ev.mate * sgn) : 0, mLine = own.mate != null ? Math.sign(own.mate * sgn) : 0;
        const deeper = dB != null && after.depth != null && after.depth > dB;
        dis = (mAfter < 0 && mLine >= 0) || (deeper && Math.abs(wpLine - wpAfter) >= DISAGREE);
        if (!dis) a = wpLine;
      }
      // EP des besten Zuges: Maximum über die Linien, die eigene Linie mit dem korrigierten Wert
      let b = a;
      for (const l of ls) b = Math.max(b, l.move === m.uci ? a : side(c, l, R));
      if (tp && !dis) a = b;
      return { own, dis, wpA: a, wpB: b, isBest: tp ? !dis || a >= b : dis && a >= b, loss: Math.max(0, b - a) };
    };
    const E = evalMove(lines, depthB);
    const ownLine = E.own, disagree = E.dis, { wpA, wpB, isBest, loss } = E;
    // Genauigkeit bleibt unverändert bei der normalen MultiPV-Suche (ohne searchmoves/Nachrechnung) – Kalibrierung
    const lossAcc = (before.deep || lines.some(l => l.sm)) ? evalMove((before.lines || []).filter(l => !l.sm), before.depth).loss : loss;
    const altLine = lines.find(l => l.move !== m.uci);
    const wpAlt = altLine ? side(c, altLine, R) : null;
    // Mattlängen (beide Züge setzen matt): gleich lang = Bester, 1 Zug länger = Exzellent, 2–6 = Gut, sonst Ungenauigkeit
    let base = null, missedShortMate = false;
    const bm = lines[0]?.mate != null && lines[0].mate * sgn > 0 ? lines[0].mate * sgn : null;
    if (bm != null && !top && !mate) {
      const pm = ownLine?.mate != null && ownLine.mate * sgn > 0 ? ownLine.mate * sgn
        : after.ev?.mate != null && after.ev.mate * sgn > 0 ? Math.abs(after.ev.mate) + 1 : null;
      if (pm != null) { const d = pm - bm; base = d <= 0 ? 'best' : d === 1 ? 'excellent' : d <= 6 ? 'good' : 'inaccuracy'; }
      else missedShortMate = bm <= 3; // kurzes Matt ausgelassen, danach kein Matt mehr
    }
    // „Ohnehin gewonnen“ Elo-unabhängig: bester anderer Zug ≥ +6,00 (unskaliert, Sicht des Ziehenden) oder Matt
    const altLine0 = lines.find(l => l.move !== m.uci);
    // Bewertung des gespielten Zuges (Weiß-Sicht) und Abstand zum besten Zug in Hundertstel (Sicht des Ziehenden, unskaliert)
    const playEv = (ownLine && !disagree && !term) ? ownLine : after.ev;
    const cpOf = ev => !ev ? 0 : ev.mate != null ? (ev.mate === 0 ? (ev.matedWhite ? -1e4 : 1e4) : Math.sign(ev.mate) * 1e4) : ev.cp;
    const cpGap = lines[0] ? (cpOf(lines[0]) - cpOf(playEv)) * sgn : 0;
    const longMateWin = bm != null && bm > 5 && base == null && !mate && cpOf(playEv) * sgn >= 600;
    const altWon = !!altLine0 && (altLine0.mate != null ? altLine0.mate * sgn > 0 : altLine0.cp * sgn >= 600);
    const chB = new Chess(P.fens[i]);
    const legal = chB.moves().length;
    // Theorie: Stellung im Buch, alle vorherigen Züge Theorie – und der Zug ist laut Engine kein Fehler
    const inBook = i < 30 && bookKey(P.fens[i + 1]) in BOOK;
    chain = inBook && (i === 0 || chain) && loss < EP.mistake;
    // Genauigkeit bleibt bei der bisherigen Buchregel (kalibriert): Buchkette ohne Engine-Prüfung
    bookAcc = inBook && (i === 0 || bookAcc);
    const prevM = i > 0 ? P.moves[i - 1] : null;
    const seeM = seeOf(P.fens[i], m);
    // Zurückschlagen ist nur dann offensichtlich, wenn der zurückschlagende Stein nicht selbst geopfert wird (SEE ≥ 0);
    // 21…Txe4+ nach 20…Lxe4 21.fxe4 ist ein Qualitätsopfer, kein bloßes Zurückschlagen.
    const recapture = !!(prevM && prevM.captured && m.to === prevM.to) && !(seeM != null && seeM < 0);
    // Kein Sonderlabel für: Antwort auf Schach, Zurückschlagen, Damenumwandlung (Mattzüge: immer Bester Zug)
    const obviousCls = chB.inCheck() || recapture || m.uci[4] === 'q';
    let sac = null;
    const inp = {
      legal, inBook: chain, mate, R, loss, isBest, base, wpA, wpB, wpAlt, obvious: obviousCls, altWon, missedShortMate, longMateWin,
      sacrifice: () => (sac = findSacrifices(P.fens[i], m.uci)),
      // offensichtlicher Materialgewinn durch Schlagen: SEE ≥ 2 Bauerneinheiten → nie Großartig
      freeCapture: () => seeM != null && seeM >= 2,
      prevOppCls: i > 0 ? out[i - 1].cls : null, wpPrev: i > 0 ? side(c, res[i - 1].ev, R) : null,
    };
    const cls = classifyMove(inp);
    // Kandidaten für die tiefere Nachrechnung (nur ohne Nachrechnung bestimmt): Brillant/Großartig und knapp daran
    if (wantCand && !before.deep && !chain && legal > 1 && !mate && !obviousCls && wpAlt != null) {
      const nearGreat = isBest && !inp.freeCapture() && wpA - wpAlt >= greatGap(R) - 4 && outcome(wpAlt - 4) < outcome(wpA + 4);
      const okB = ['best', 'excellent'].includes(cls) || (R < 1200 && cls === 'good');
      const nearBrill = cls !== 'brilliant' && okB && wpA >= 40 && !(altLine0?.mate != null && altLine0.mate * sgn > 0)
        && findSacrifices(P.fens[i], m.uci).length > 0;
      if (cls === 'brilliant' || cls === 'great' || nearGreat || nearBrill) cand.push(i);
    }
    // für die Texte: Zurückschlagen oder eine gleich-/höherwertige Figur schlagen
    const obvious = recapture || !!(m.captured && VAL[m.captured] >= VAL[m.piece]);

    // Genauigkeit, an 176 echten chess.com-Werten kalibriert: flachere Gewinnkurve, steilere Strafe, Theorie = 100
    const wpC = ev => { if (!ev) return 50; if (ev.mate != null) return winPct(ev); const cp = Math.max(-1500, Math.min(1500, ev.cp)); return 50 + 50 * (2 / (1 + Math.exp(-0.00184104 * cp)) - 1); };
    const sB = c === 'w' ? wpC(before.ev) : 100 - wpC(before.ev), sA = c === 'w' ? wpC(after.ev) : 100 - wpC(after.ev);
    const lossStd = Math.max(0, sB - sA);
    const acc = (bookAcc && lossAcc < EP.mistake) ? 100 : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.15 * lossStd) - 3.1669 + 2));

    // Fehlertyp
    let err = null;
    if (BAD.has(cls)) {
      const am = after.ev.mate;
      const keepsMate = (am != null && am * sgn > 0) || (ownLine?.mate != null && ownLine.mate * sgn > 0);
      // Matt übersehen nur bis Matt in 5 (längere Matts: Gewinnweg/Taktik verpasst);
      // Matt zugelassen nur, wenn die Stellung vorher nicht ohnehin hoffnungslos war (wpB ≥ 10)
      if (bm != null && !keepsMate) err = bm <= 5 ? 'missedMate' : 'missedTactic';
      else if (am != null && am * sgn < 0 && wpB >= 10) err = 'allowedMate';
      else {
        // Materialbilanz an Ruhepunkten (bis 8 Halbzüge): gespielte Linie (Gegner am Zug) gegen beste Linie
        const b0 = bal(new Chess(P.fens[i]), c);
        const qA = quietBal(P.fens[i + 1], after.lines?.[0]?.pv, c, 8);
        const qB = quietBal(P.fens[i], lines[0]?.pv, c, 8);
        const endA = qA.length ? Math.min(...qA) : bal(new Chess(P.fens[i + 1]), c);
        const endB = qB.length ? Math.max(...qB) : b0;
        // Bezug: Bilanz vorher – steht ein Rückschlag noch aus, der erste Ruhepunkt der besten Linie
        const ref = Math.min(b0, qB.length ? qB[0] : b0);
        // Materialunterschied nur, wenn ihn auch die Bewertung trägt (≥ 1,50): sonst holt die Seite das Material
        // hinter dem Fenster zurück (6.Lc4: Lh1 bleibt gefangen) und es ist ein Stellungsfehler
        const real = endB - endA >= 2 && cpGap >= 150;
        if (real && endA <= ref - 2) err = 'hung';
        else if (real && endB >= ref + 2) err = 'missedTactic';
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
    const o = { cls, loss: +loss.toFixed(1), acc: acc == null ? null : +acc.toFixed(1), wpB: +wpB.toFixed(1), wpA: +wpA.toFixed(1), best, err, phase, pressure, obvious, clock: m.clock };
    // Opfer (nur bei Brillant): die tatsächlich geopferte Figur samt Feld – nicht automatisch die gezogene
    if (cls === 'brilliant' && sac?.length) o.sac = { piece: sac[0].piece, square: sac[0].square, before: sac[0].before };
    out.push(o);
  }

  // Partie-Genauigkeit: 90 % arithmetisches + 10 % harmonisches Mittel (beste Übereinstimmung mit chess.com)
  const accOf = c => {
    const a = out.filter((x, i) => P.moves[i].color === c && x.acc != null).map(x => x.acc);
    if (!a.length) return null;
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    const harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
    return +(0.9 * mean + 0.1 * harm).toFixed(1);
  };
  return {
    url: game.url, quality, v: 8, end_time: game.end_time,
    evals: res.map(r => r.ev), lines: res.map(r => r.lines), depth: res.map(r => r.depth ?? null), moves: out,
    deep: res.some(r => r.deep) ? res.map(r => r.deep || null) : undefined, cand,
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
  if (mv.cls === 'brilliant') t += mv.sac ? ` Ein starkes Figurenopfer (${NOM_DE[mv.sac.piece]} auf ${mv.sac.square}), das funktioniert.` : ' Ein starkes Figurenopfer, das funktioniert.';
  if (mv.cls === 'great') t += ' Der einzige Zug, der die Stellung hält.';
  if (mv.cls === 'book') { const nm = BOOK[bookKey(P.fens[i + 1])]; if (nm) t += ` (${nm.slice(4)})`; }
  if (['excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(mv.cls) && bestSan && bestSan !== m.san) t += ` Bester Zug war ${bestSan}.`;
  // neutral formuliert (Name statt „du“): der Text wird für beide Seiten benutzt
  const who = (m.color === 'w' ? game.white : game.black)?.username || (m.color === 'w' ? 'Weiß' : 'Schwarz');
  const opp = an.lines[i + 1]?.[0];
  const oppSan = opp ? uciToSan(P.fens[i + 1], opp.move) : '';
  const L = an.lines[i]?.[0];
  switch (mv.err) {
    case 'hung': t += ` Danach gewinnt ${oppSan} Material.`; break;
    case 'missedTactic': t += L?.mate != null ? ` Mit ${bestSan} gab es ein langes Matt (Matt in ${Math.abs(L.mate)}).` : ` Mit ${bestSan} war Materialgewinn möglich (${pvToSan(P.fens[i], L.pv, 5).join(' ')}).`; break;
    case 'missedMate': t += ` Hier gab es Matt in ${Math.abs(L.mate)}: ${pvToSan(P.fens[i], L.pv, Math.abs(L.mate) * 2 - 1).join(' ')}.`; break;
    case 'allowedMate': t += ` Damit lässt ${who} Matt in ${Math.abs(an.evals[i + 1].mate)} zu (${oppSan}).`; break;
    case 'notPunished': t += ` Der Gegner hatte gerade einen Fehler gemacht – ${who} hat ihn nicht bestraft.`; break;
  }
  if (mv.pressure && BAD.has(mv.cls)) t += ' Gespielt unter Zeitdruck.';
  return t;
}

// Bereits analysierte Partie neu einstufen (ohne neue Engine-Rechnung)
export function reclassify(game, an) {
  const P = parseGame(game);
  // gespeicherte Nachrechnung (an.deep) und searchmoves-Linien werden mitbenutzt – keine Engine nötig
  const res = an.evals.map((ev, i) => ({ ev, lines: an.lines[i] || [], depth: an.depth?.[i] ?? null, ...(an.deep?.[i] ? { deep: an.deep[i] } : {}) }));
  const out = finish(game, P, res, an.quality);
  delete out.cand;
  return out;
}
