// Schritt-für-Schritt-Erklärungen mit Pfeilen und markierten Feldern für jede Bewertungsstufe
import { Chess } from '../vendor/chess.js';
import { BOOK } from '../vendor/book.js';
import { CLASS_DE, winPct, fmtEval, bookKey, quietBal } from './analysis.js';

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const AKK = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
export const COL = { red: 'rgba(226,57,43,.85)', green: 'rgba(127,191,77,.88)', teal: 'rgba(38,181,173,.9)', grey: 'rgba(150,148,140,.85)', blue: 'rgba(91,143,199,.88)' };

const mv = (fen, u) => { const c = new Chess(fen); try { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return { c, m, fen: c.fen() }; } catch { return null; } };
const bal = (fen, col) => { let s = 0; for (const p of new Chess(fen).board().flat()) if (p && p.type !== 'k') s += (p.color === col ? 1 : -1) * VAL[p.type]; return s; };
// Bewertungstext (Weiß-Sicht) aus Sicht der Farbe my
const evFor = (ev, my) => { const s = fmtEval(ev); if (my === 'w' || !s) return s; return s.startsWith('-M') ? s.slice(1) : s.startsWith('-') ? '+' + s.slice(1) : s.startsWith('+') ? '-' + s.slice(1) : s.startsWith('M') ? '-' + s : s; };
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a.at(-1);
function lossName(d) {
  d = Math.abs(d);
  return d >= 9 ? 'etwa eine Dame' : d >= 5 ? 'etwa einen Turm' : d >= 3 ? 'etwa eine Leichtfigur' : d === 2 ? 'etwa zwei Bauern' : 'einen Bauern';
}

// Beschreibt einen Zug: Schlagen, Schach, Matt, Angriffe (Gabel), Umwandlung
function describe(fen, u) {
  const r = mv(fen, u); if (!r) return { san: u, text: '', marks: {}, r: null };
  const { c, m } = r, opp = m.color === 'w' ? 'b' : 'w', parts = [], marks = {};
  if (m.captured) parts.push(`schlägt ${AKK[m.captured]} auf ${m.to}`);
  if (m.promotion) parts.push(`wandelt in ${m.promotion === 'q' ? 'eine Dame' : NAME[m.promotion]} um`);
  if (c.isCheckmate()) return { san: m.san, text: (parts.length ? parts.join(', ') + ' und ' : '') + 'setzt matt', marks, r, mate: true };
  const check = c.inCheck();
  // Kann der Gegner die gezogene Figur sofort billiger schlagen (oder steht sie ungedeckt im Angriff)? Dann ist ihr Angriff nichts wert.
  const att = c.attackers(m.to, opp), lost = att.length > 0 && (c.attackers(m.to, m.color).length === 0 || att.some(s => VAL[c.get(s).type] < VAL[m.piece]));
  // Was greift die gezogene Figur jetzt an? Gabel/Doppelangriff nur gegen Ziele ab Springer (oder König + Figur).
  const targets = [];
  if (!lost) for (const p of c.board().flat()) {
    if (!p || p.color !== opp || p.type === 'k') continue;
    if (!c.attackers(p.square, m.color).includes(m.to)) continue;
    const defended = c.attackers(p.square, opp).length > 0;
    if (VAL[p.type] > VAL[m.piece] || !defended) targets.push(p);
  }
  const big = targets.filter(t => VAL[t.type] >= 3).sort((a, b) => VAL[b.type] - VAL[a.type]);
  const fork = big.length >= 2 || (check && big.length >= 1);
  const tl = ts => list(ts.map(t => AKK[t.type] + ' auf ' + t.square));
  if (check && big.length) parts.push(`gibt Schach und greift dabei ${tl(big)} an – Doppelangriff`);
  else if (big.length >= 2) parts.push(`greift ${tl(big)} gleichzeitig an – eine Gabel`);
  else {
    if (check) parts.push('gibt Schach');
    const t = big[0] || (!check && targets.length === 1 ? targets[0] : null);
    if (t) {
      // „ungedeckt“ nur, wenn das Ziel wirklich verloren gehen kann: nicht wertvoller als der Angreifer und kann ihn nicht selbst schlagen
      const loose = !c.attackers(t.square, opp).length && VAL[t.type] <= VAL[m.piece] && !c.attackers(m.to, opp).includes(t.square);
      parts.push(`greift ${AKK[t.type]} auf ${t.square} an${loose ? (t.type === 'q' ? ', die' : ', der') + ' ungedeckt ist' : ''}`);
    }
  }
  const shown = fork ? big : big.length ? [big[0]] : (!check && targets.length === 1 ? targets : []);
  shown.forEach(t => marks[t.square] = 'bad');
  if (check) { const k = c.board().flat().find(p => p && p.type === 'k' && p.color === opp); marks[k.square] = 'bad'; }
  return { san: m.san, text: parts.length < 2 ? (parts[0] || '') : parts.slice(0, -1).join(', ') + (/ und /.test(parts.at(-1)) ? ', ' : ' und ') + parts.at(-1), marks, r, targets: shown, fork, captured: m.captured, check };
}
// Nur das Wichtigste eines Zuges in wenigen Worten
function short(d) {
  if (!d) return '';
  if (d.mate) return 'Schachmatt';
  const tg = d.targets || [];
  if (d.fork) return `${d.check ? 'Schach und ' : ''}${d.check && tg.length === 1 ? 'Angriff auf' : 'Gabel gegen'} ${tg.map(t => NAME[t.type] + ' ' + t.square).join(' und ')}`;
  if (d.captured) return `schlägt ${AKK[d.captured]}${d.check ? ' mit Schach' : ''}`;
  if (tg.length) return `greift ${AKK[tg[0].type]} ${tg[0].square} an`;
  return d.check ? 'Schach' : '';
}
function pawnWeak(fen, col) {
  const ps = new Chess(fen).board().flat().filter(p => p && p.type === 'p' && p.color === col).map(p => p.square[0]);
  const cnt = {}; ps.forEach(f => cnt[f] = (cnt[f] || 0) + 1);
  const F = 'abcdefgh'; let w = 0;
  for (const f in cnt) { if (cnt[f] > 1) w += cnt[f] - 1; const k = F.indexOf(f); if (!cnt[F[k - 1]] && !cnt[F[k + 1]]) w += cnt[f]; }
  return w;
}
const castleRights = (fen, col) => { const f = fen.split(' ')[2]; return col === 'w' ? /[KQ]/.test(f) : /[kq]/.test(f); };
// Materialbilanz am Ende einer Zugfolge relativ zu einer Ausgangsstellung
function lineEnd(fen, pv, n) { let f = fen; for (const u of (pv || []).slice(0, n)) { const r = mv(f, u); if (!r) break; f = r.fen; } return f; }

// Ist ein Zug für Menschen naheliegend? (Schlagen, Schach, Rochade, Entwicklung, Zentrumsbauer)
function natural(fen, u, ply) {
  const r = mv(fen, u); if (!r) return false; const m = r.m;
  if (m.captured || r.c.inCheck() || m.san.startsWith('O-O')) return true;
  if (ply < 30 && (m.piece === 'n' || m.piece === 'b') && (m.from[1] === '1' || m.from[1] === '8')) return true;
  if (m.piece === 'p' && 'de'.includes(m.to[0]) && ply < 20) return true;
  return false;
}
// Menschliche Alternative: zweitbester Zug, fast gleich gut und naheliegender als der Engine-Zug
function humanAlt(fen, lines, ply) {
  const [l1, l2] = lines || []; if (!l1 || !l2) return null;
  const close = Math.abs(winPct(l1) - winPct(l2)) <= 4;
  return close && !natural(fen, l1.move, ply) && natural(fen, l2.move, ply) ? l2 : null;
}

// Zug mit Kurzbeschreibung – für Engine-Varianten immer in eine Vorschlags-/Möglichkeitsform eingebettet
const said = d => `${d.san}${d.text ? ' – ' + d.text.replace(/ – /g, ': ') : ''}`;
// deutsche Zahlen: Dezimalkomma
const dec = s => String(s).replace(/(\d)\.(\d)/g, '$1,$2');
const INDEF = { p: 'einen Bauern', n: 'einen Springer', b: 'einen Läufer', r: 'einen Turm', q: 'eine Dame' };
const NOM = { p: 'Der Bauer', n: 'Der Springer', b: 'Der Läufer', r: 'Der Turm', q: 'Die Dame' };
const DEIN = { p: 'Dein Bauer', n: 'Dein Springer', b: 'Dein Läufer', r: 'Dein Turm', q: 'Deine Dame' };
const PLUR = { p: 'die Bauern', n: 'die Springer', b: 'die Läufer', r: 'die Türme', q: 'die Damen' };
const TAUSCH = { p: 'Bauerntausch', n: 'Springertausch', b: 'Läufertausch', r: 'Turmtausch', q: 'Damentausch' };
// Was geht entlang einer Variante verloren bzw. wird gewonnen (Sicht der Farbe col)? Ausgewählt wird die Figur,
// deren Wert zum Nettoverlust net passt (bei Damentausch + Springerverlust also der Springer, nicht die Dame).
function caps(fen, pv, col, n = 8) {
  let f = fen, promo = -1;
  const san = [], L = [], G = [];
  for (const [k, u] of (pv || []).slice(0, n).entries()) {
    const r = mv(f, u); if (!r) break;
    san.push(r.m.san);
    if (r.m.captured) (r.m.color === col ? G : L).push({ t: r.m.captured, sq: r.m.to, k, moved: false });
    if (r.m.color === col) for (const x of L) if (x.sq === r.m.from) x.moved = true;
    if (r.m.promotion && r.m.color !== col && promo < 0) promo = k;
    f = r.fen;
  }
  // stand die verlorene Figur schon zu Beginn auf diesem Feld? (sonst ohne Feldangabe)
  const start = new Chess(fen);
  const pickOf = (A, net) => {
    const fit = A.filter(x => x.t !== 'p' && VAL[x.t] <= net + 1).sort((a, b) => VAL[b.t] - VAL[a.t])[0];
    return fit || A.slice().sort((a, b) => VAL[b.t] - VAL[a.t])[0] || null;
  };
  return {
    san, promo,
    lost: net => { const x = pickOf(L, net); if (!x) return null; const p = start.get(x.sq); return { ...x, here: !!(p && p.color === col && p.type === x.t) }; },
    got: (net, below) => { const A = below ? G.filter(x => VAL[x.t] < below) : G; return pickOf(A, net); },
  };
}
// Materialangabe: „die Dame“, „die Dame gegen einen Läufer“ oder „etwa zwei Bauern“
function matPhrase(net, piece, other) {
  net = Math.abs(net);
  if (piece && piece !== 'p' && net >= VAL[piece] - 1) return AKK[piece];
  if (piece && piece !== 'p' && other && VAL[piece] > VAL[other]) return `${AKK[piece]} gegen ${INDEF[other]}`;
  return lossName(net);
}
// Bewertung aus Sicht von my, lesbar (Matt ausgeschrieben, Dezimalkomma)
const evTxt = (ev, my) => {
  if (!ev) return '';
  if (ev.mate != null && ev.mate !== 0) return ((ev.mate > 0) === (my === 'w')) ? `Matt in ${Math.abs(ev.mate)}` : `Matt gegen dich in ${Math.abs(ev.mate)}`;
  return dec(evFor(ev, my));
};
// Bewertungspaar nur, wenn es etwas sagt: Unterschied ≥ 0,3 bzw. genau eine Seite mit Matt
const evPair = (a, b, my) => {
  if (!a || !b) return '';
  if (a.mate != null || b.mate != null) return (a.mate != null && b.mate != null) ? '' : ` (${evTxt(a, my)} statt ${evTxt(b, my)})`;
  return Math.abs(a.cp - b.cp) >= 30 ? ` (${evTxt(a, my)} statt ${evTxt(b, my)})` : '';
};
// Bewertung in Hundertstel aus Sicht von col (Matt = ±10000)
const cpFor = (ev, col) => !ev ? 0 : (ev.mate != null ? (ev.mate === 0 ? (ev.matedWhite ? -1e4 : 1e4) : Math.sign(ev.mate) * 1e4) : ev.cp) * (col === 'w' ? 1 : -1);
const arrow = (u, color, label) => ({ from: u.slice(0, 2), to: u.slice(2, 4), color, label });

const LESSON = {
  hung: 'Bevor du ziehst: Welche Figur steht nach meinem Zug ungedeckt – und was kann mein Gegner schlagen?',
  missedTactic: 'Schau in jeder Stellung zuerst nach Schachs, Schlagzügen und Drohungen – erst danach nach ruhigen Zügen.',
  missedMate: 'Steht der gegnerische König offen, rechne zuerst alle Schachs durch. Matt geht vor Material.',
  allowedMate: 'Frag dich vor jedem Zug: Welche Schachs hat mein Gegner danach – und ist meine Grundreihe sicher?',
  notPunished: 'Wenn dein Gegner patzt: Tempo rausnehmen und gezielt nach dem Gewinnzug suchen.',
  positional: 'Frag dich: Welche meiner Figuren steht am schlechtesten – und wie verbessere ich sie?',
};
const ERR_PHRASE = { hung: 'Material einstellst', missedTactic: 'eine Taktik übersiehst', missedMate: 'ein Matt übersiehst', allowedMate: 'ein Matt zulässt', notPunished: 'einen Fehler deines Gegners nicht bestrafst', positional: 'dich positionell vergreifst' };
const fmtS = s => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min` : `${s < 10 ? s.toFixed(1) : Math.round(s)} Sekunden`;
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

// ctx: { my: 'w'|'b', hist: { games, err: {typ: anzahl}, pressureShare } }
// Textregeln (12.11.2026): erste Zeile kurz mit dem Kern, Details in Folgeschritten; Engine-Varianten nur als Vorschlag
// („Besser: …“, „… würde … spielen“), nie als gespielter Zug; Bewertungen nur bei Unterschied ≥ 0,3 bzw. Matt ausgeschrieben.
export function explain(game, an, P, i, ctx = {}) {
  const m = P.moves[i], x = an.moves[i], c = m.color;
  const my = ctx.my || c, you = c === my;
  const oppName = my === 'w' ? game.black.username : game.white.username;
  const before = P.fens[i], after = P.fens[i + 1];
  const last = { from: m.from, to: m.to }, lastPrev = i > 0 ? { from: P.moves[i - 1].from, to: P.moves[i - 1].to } : null;
  // searchmoves-Linien (sm) sind nur Bewertungshilfe, keine Engine-Vorschläge
  const L = (an.lines[i] || []).filter(l => !l.sm), LA = (an.lines[i + 1] || []).filter(l => !l.sm);
  const best = L[0], second = L[1], reply = LA[0];
  const evA = an.evals[i + 1];
  const sgn = c === 'w' ? 1 : -1;
  const steps = [], self = describe(before, m.uci);

  // Engine-Variante abspielen – als Möglichkeit formuliert („… würde … spielen“), nie als gespielter Zug
  const playLine = (fen, pv, n, off, col, intro) => {
    let f = fen, prev = null;
    for (let k = 0; k < Math.min(n, pv.length); k++) {
      const d = describe(f, pv[k]); if (!d.r) break;
      const mine = d.r.m.color === my;
      const text = k === 0 && intro != null ? `${intro}${said(d)}.`
        : mine ? `Du würdest mit ${d.san} fortsetzen${d.text ? ' – ' + d.text.replace(/ – /g, ': ') : ''}.`
        : `${oppName} würde ${d.san} spielen${d.text ? ' – ' + d.text.replace(/ – /g, ': ') : ''}.`;
      steps.push({ fen: f, last: prev, arrows: [arrow(pv[k], mine ? col.me : col.them, k + 1 + (off || 0))], marks: d.marks, text });
      prev = { from: pv[k].slice(0, 2), to: pv[k].slice(2, 4) }; f = d.r.fen;
      if (d.mate) break;
    }
    return f;
  };
  // Persönlicher Kontext: Uhr, Bedenkzeit, wiederkehrende Fehler (nur bei Fehler/Patzer, ab 3 Vorfällen, einmal je Partie und Fehlerart)
  const personal = () => {
    const out = [];
    if (x.pressure && m.clock != null) out.push(`Du hattest nur noch ${fmtS(m.clock)} auf der Uhr – unter diesem Druck passiert das schnell.`);
    else if (m.spent != null && m.spent < 3 && P.base && P.base >= 180) out.push(`Du hast nur ${fmtS(m.spent)} nachgedacht. Genau hier hätte sich ein zweiter Blick gelohnt.`);
    else if (m.spent != null && m.spent >= 30) out.push(`Du hast ${fmtS(m.spent)} überlegt – die Gefahr trotzdem nicht gesehen. Das heißt: Du hast an der falschen Stelle gesucht.`);
    const h = ctx.hist, n = h?.err?.[x.err] || 0;
    const big = x.cls === 'mistake' || x.cls === 'blunder';
    const earlier = an.moves.slice(0, i).some((y, j) => P.moves[j].color === c && y.err === x.err && (y.cls === 'mistake' || y.cls === 'blunder'));
    if (x.err && big && n >= 3 && !earlier) out.push(`Und das ist kein Einzelfall: In deinen ${h.games} analysierten Partien ist es schon ${n}-mal passiert, dass du ${ERR_PHRASE[x.err]}.`);
    if (x.pressure && h?.pressureShare >= .25) out.push(`${Math.round(h.pressureShare * 100)} % deiner Fehler passieren unter Zeitdruck – das kostet dich Punkte.`);
    return out.join(' ');
  };
  const seed = i * 7 + (m.to.charCodeAt(0) + +m.to[1]);
  // Hatte der Ziehende ein Matt? Wie lang wäre es nach dem gespielten Zug noch?
  const bm = best?.mate != null && best.mate * sgn > 0 ? best.mate * sgn : null;
  const pm = self.mate ? 1 : (evA?.mate != null && evA.mate * sgn > 0 ? Math.abs(evA.mate) + 1 : null);
  const mateMissed = bm != null && (pm == null || pm > bm) && best.move !== m.uci;
  const lead = t => /^[A-ZÄÖÜ]/.test(t) ? `${m.san}: ${t}` : `${m.san} ${t}`;

  if (x.cls === 'book') {
    const nm = BOOK[bookKey(after)];
    steps.push({ fen: after, last, arrows: [], marks: {}, text: `${you ? 'Du bleibst' : oppName + ' bleibt'} in der Theorie${nm ? ` (${nm.slice(4)})` : ''}.` });
  } else if (x.cls === 'forced') {
    steps.push({ fen: after, last, arrows: [], marks: {}, text: 'Das war der einzige legale Zug – da gab es nichts zu entscheiden.' });
  } else if (x.cls === 'brilliant') {
    // Was opfert wer – und warum lohnt es sich? Geopfert ist die Figur aus der Analyse (x.sac), nicht automatisch die gezogene.
    const sac = x.sac || { piece: m.piece, square: m.to };
    const r1 = reply ? mv(after, reply.move) : null;
    const capT = !!(r1 && r1.m.captured && r1.m.to === sac.square);
    const check = new Chess(after).inCheck();
    const how = sac.square === m.to ? (check ? ' mit Schach' : '') : ` und lässt ${sac.piece === 'q' ? 'sie' : 'ihn'} einfach stehen`;
    steps.push({ fen: after, last, arrows: [], marks: { [m.to]: 'brill', [sac.square]: 'brill' },
      text: `${you ? 'Brillant! Du opferst' : oppName + ' opfert'} ${AKK[sac.piece]} auf ${sac.square}${how}.` });
    const follow = reply && reply.pv[1] && r1 ? describe(r1.fen, reply.pv[1]) : null;
    let t = '';
    if (capT) t += `${you ? `Nimmt ${oppName}` : 'Schlägst du'} mit ${r1.m.san}, folgt ${follow ? said(follow) : 'ein Angriff'}. `;
    else if (r1) {
      // Opfer abgelehnt: die Annahme wäre noch schlechter – die beste Antwort ist eine andere
      const take = new Chess(after).moves({ verbose: true }).filter(y => y.to === sac.square && y.captured).sort((a, b) => VAL[a.piece] - VAL[b.piece])[0];
      t += take ? `Annehmen mit ${take.san} wäre noch schlechter – ${you ? oppName + ' würde besser' : 'du würdest besser'} mit ${r1.m.san} antworten. `
        : `${you ? oppName + ' würde' : 'Du würdest'} am besten mit ${r1.m.san} antworten. `;
    }
    const mateLine = evA.mate != null && evA.mate * sgn > 0;
    const q = reply ? quietBal(after, reply.pv, c, 8) : [];
    const gain = (q.length ? q[q.length - 1] : bal(after, c)) - bal(before, c);
    const v = cpFor(evA, c);
    t += mateLine ? 'Am Ende steht Matt.'
      : gain >= 1 ? `Unterm Strich ${you ? 'gewinnst du' : 'gewinnt ' + oppName} ${lossName(gain)}.`
      : Math.abs(v) < 100 ? `Damit ${you ? 'hältst du' : 'hält ' + oppName} das Gleichgewicht.`
      : v >= 150 ? `Danach ${you ? 'stehst du' : 'steht ' + oppName} klar besser (${evTxt(evA, my)}).`
      : `Danach ${you ? 'stehst du' : 'steht ' + oppName} etwas besser.`;
    const arr = [];
    if (r1) arr.push(arrow(reply.move, you ? COL.grey : COL.red));
    if (follow && r1) arr.push(arrow(reply.pv[1], COL.teal));
    steps.push({ fen: after, last, arrows: arr, marks: { [m.to]: 'brill', [sac.square]: 'brill', ...(follow?.marks || {}) }, text: t.trim() });
    if (reply && reply.pv.length > 2) { let f2 = after; for (const u of reply.pv.slice(0, 2)) f2 = mv(f2, u)?.fen || f2; playLine(f2, reply.pv.slice(2), ctx.elo && ctx.elo < 1200 ? 2 : 4, 2, you ? { me: COL.teal, them: COL.grey } : { me: COL.grey, them: COL.teal }); }
  } else if (x.cls === 'great') {
    steps.push({ fen: after, last, arrows: [], marks: self.marks, text: you
      ? `${pick(['Genau richtig erkannt!', 'Stark gefunden!', 'Sehr gut gesehen!'], seed)} ${m.san} ist der einzige gute Zug.`
      : `${oppName} findet mit ${m.san} den einzigen guten Zug.` });
    if (self.text) steps.push({ fen: after, last, arrows: [], marks: self.marks, text: `Der Zug ${self.text}.` });
    if (second && you) {
      const d2 = describe(before, second.move);
      steps.push({ fen: before, last: lastPrev, arrows: [arrow(m.uci, COL.blue, 1), arrow(second.move, COL.grey, 2)], marks: {},
        text: `Schwächer wäre ${d2.san} gewesen${evPair(second, best, my)}.` });
    }
  } else if (self.mate && ['best', 'excellent', 'good'].includes(x.cls)) {
    steps.push({ fen: after, last, arrows: [], marks: self.marks, text: you ? `Schachmatt mit ${m.san} – sauber zu Ende gespielt.` : `${oppName} setzt mit ${m.san} matt.` });
  } else if (mateMissed && ['best', 'excellent', 'good'].includes(x.cls)) {
    // Kurzes Matt ausgelassen: das gehört in die erste Zeile, nicht in den aufklappbaren Teil
    const db = describe(before, best.move);
    steps.push({ fen: before, last: lastPrev, arrows: [arrow(m.uci, COL.red, '✕'), arrow(best.move, COL.green, '✓')], marks: db.marks,
      text: you ? `Matt in ${bm} übersehen: ${db.san}.` : `${oppName} übersieht Matt in ${bm} (${db.san}).` });
    steps.push({ fen: after, last, arrows: [], marks: {}, text: pm != null ? `Gewonnen bleibt es trotzdem – danach Matt in ${pm - 1}.` : 'Gewonnen bleibt es trotzdem, aber der Weg wird länger.' });
  } else if (x.obvious && ['best', 'excellent', 'good', 'great'].includes(x.cls)) {
    const re = i > 0 && P.moves[i - 1].captured && m.to === P.moves[i - 1].to;
    const cap = m.captured;
    let t;
    if (re) t = you ? 'Klar: zurückschlagen.' : `${oppName} schlägt zurück – klar.`;
    else {
      const back = new Chess(after).moves({ verbose: true }).some(y => y.to === m.to && y.captured);
      if (!back) t = you ? `Klar: ${NOM[cap]} auf ${m.to} war ungedeckt – ${m.san} gewinnt ${cap === 'q' ? 'sie' : 'ihn'}.` : `${oppName} nimmt ${AKK[cap]} auf ${m.to} – ${cap === 'q' ? 'sie' : 'er'} war ungedeckt.`;
      else if (VAL[cap] === VAL[m.piece]) t = cap === m.piece ? (you ? `Klar: ${TAUSCH[cap]}.` : `${oppName} tauscht ${PLUR[cap]}.`) : (you ? 'Klar: Leichtfiguren-Tausch.' : `${oppName} tauscht ${NAME[m.piece]} gegen ${NAME[cap]}.`);
      else t = you ? `Klar: ${m.san} gewinnt Material (${NAME[cap]} gegen ${NAME[m.piece]}).` : `${oppName} gewinnt Material: ${NAME[cap]} gegen ${NAME[m.piece]}.`;
    }
    steps.push({ fen: after, last, arrows: [], marks: {}, text: t });
  } else if (['best', 'excellent', 'good'].includes(x.cls)) {
    const head = you
      ? { best: pick(['Sauber gespielt – der beste Zug.', 'Genau so – der beste Zug.', 'Top – der beste Zug.'], seed), excellent: 'Exzellent – fast perfekt.', good: 'Solide.' }[x.cls]
      : { best: `${oppName} spielt den besten Zug.`, excellent: `${oppName} spielt exzellent.`, good: `${oppName} spielt solide.` }[x.cls];
    const sh = short(self);
    steps.push({ fen: after, last, arrows: [], marks: self.marks, text: `${head}${sh ? ' ' + lead(sh) + '.' : ''}` });
    if (self.text && self.text !== sh && /, | und /.test(self.text)) steps.push({ fen: after, last, arrows: [], marks: self.marks, text: `Der Zug ${self.text}.` });
    // Alternativen nur für deine eigenen Züge – für Gegnerzüge sagen sie auf diesem Niveau nichts
    if (you && x.cls !== 'best' && best && best.move !== m.uci) {
      const db = describe(before, best.move);
      steps.push({ fen: before, last: lastPrev, arrows: [arrow(best.move, COL.green, 1)], marks: db.marks, text: `Noch etwas stärker wäre ${db.san} gewesen${short(db) ? ' – ' + short(db) : ''}${evPair(best, evA, my)}.` });
    }
  } else if (you) {
    // Dein Fehler: erste Zeile = Klasse + konkreter Grund (Widerlegung, Materialverlust, verpasster Gewinn)
    const head = { inaccuracy: 'Ungenau', mistake: 'Fehler', miss: 'Chance verpasst', blunder: 'Patzer' }[x.cls];
    const missNote = x.cls === 'miss' && i > 0 ? `${oppName} hatte mit ${P.moves[i - 1].san} einen Fehler gemacht – den hättest du bestrafen können.` : '';
    const dr = reply ? describe(after, reply.move) : null;
    const db = best && best.move !== m.uci ? describe(before, best.move) : null;
    const allowsMate = evA.mate != null && evA.mate * sgn < 0;
    const b0 = bal(before, c);
    const qA = reply ? quietBal(after, reply.pv, c, 8) : [], qB = best ? quietBal(before, best.pv, c, 8) : [];
    const endA = qA.length ? Math.min(...qA) : bal(after, c), endB = qB.length ? Math.max(...qB) : b0;
    const net = endB - endA;
    const cA = reply ? caps(after, reply.pv, c) : {}, cB = best ? caps(before, best.pv, c) : {};
    const seq = (s, k) => s.slice(0, k + 1).join(' ');
    let kind = 'generic', why = '', f0 = after, arr = [], mk = {};
    if (allowsMate && dr) {
      kind = 'loss'; why = `Danach kann ${oppName} mattsetzen: ${seq(cA.san, Math.min(4, Math.abs(evA.mate) * 2 - 2))}.`; arr = [arrow(reply.move, COL.red)]; mk = dr.marks;
    } else if (mateMissed && db) {
      kind = 'missed'; f0 = before; why = `Du hattest Matt in ${bm}: ${db.san}.`; arr = [arrow(m.uci, COL.red, '✕'), arrow(best.move, COL.green, '✓')]; mk = db.marks;
    } else if (reply && x.err === 'hung' && cA.promo >= 0 && !(cA.lost(net)?.k < cA.promo)) {
      kind = 'loss'; why = `${oppName} bekommt eine neue Dame – ${seq(cA.san, cA.promo)}.`; arr = [arrow(reply.move, COL.red)]; mk = dr.marks;
    } else if (reply && x.err === 'hung' && cA.lost(net) && cA.lost(net).t !== 'p') {
      kind = 'loss';
      const lo = cA.lost(net), back = net < VAL[lo.t] - 1 ? cA.got(net, VAL[lo.t]) : null;
      const part = back ? ` (dafür nur ${INDEF[back.t]})` : '';
      why = `${DEIN[lo.t]}${lo.here ? ' ' + lo.sq : ''} geht verloren${part} – ${seq(cA.san, lo.k)}.`; arr = [arrow(reply.move, COL.red)]; mk = dr.marks;
    } else if (reply && x.err === 'hung') {
      const lo = cA.lost(net);
      kind = 'loss'; why = `Danach verlierst du ${matPhrase(net, lo?.t, cA.got(net)?.t)} – ${seq(cA.san, Math.max(1, lo ? lo.k : 1))}.`; arr = [arrow(reply.move, COL.red)]; mk = dr.marks;
    } else if (db && x.err === 'missedTactic') {
      kind = 'missed'; f0 = before;
      const gb = cB.got(net); const what = matPhrase(net, gb?.t, gb ? cB.lost(net)?.t : null);
      why = x.cls === 'inaccuracy' ? `noch klarer war ${db.san} (gewinnt ${what}).` : `${db.san} hätte ${what} gewonnen.`;
      arr = [arrow(m.uci, COL.red, '✕'), arrow(best.move, COL.green, '✓')]; mk = db.marks;
    } else {
      const rm = reply ? mv(after, reply.move) : null;
      const kicked = rm && rm.m.piece === 'p' && m.piece !== 'p' && m.piece !== 'k' && rm.c.attackers(m.to, rm.m.color).includes(rm.m.to);
      if (kicked) {
        kind = 'tempo'; why = `${m.piece === 'q' ? 'Deine Dame' : 'Dein ' + NAME[m.piece]} auf ${m.to} steht ungünstig: ${oppName} vertreibt ${m.piece === 'q' ? 'sie' : 'ihn'} mit ${dr.san} und gewinnt Zeit.`;
        arr = [arrow(reply.move, COL.red)]; mk = { [m.to]: 'bad' };
      } else if (castleRights(before, c) && !castleRights(after, c) && !m.san.startsWith('O-O')) {
        kind = 'king'; why = 'Damit verlierst du das Rochaderecht – dein König bleibt in der Mitte.';
      } else if (pawnWeak(after, c) > pawnWeak(before, c)) {
        kind = 'pawns'; why = 'Dadurch entsteht eine Bauernschwäche (Doppel- oder isolierter Bauer).';
      } else if (i < 24 && P.moves.slice(0, i).some(q => q.color === c && q.to === m.from) && new Chess(before).board()[c === 'w' ? 7 : 0].filter(p => p && p.color === c && (p.type === 'n' || p.type === 'b')).length >= 2) {
        kind = 'dev'; why = 'Du ziehst dieselbe Figur zweimal, andere sind noch unentwickelt.';
      } else if (reply) {
        // Grund aus der Bewertung: was der Gegner nach dem Zug hat
        const va = cpFor(evA, c), vb = cpFor(best, c);
        const st = va <= -150 ? `steht ${oppName} klar besser` : va < -50 ? `steht ${oppName} besser` : vb > 50 && va <= 50 ? 'ist dein Vorteil weg' : 'ist dein Vorteil kleiner';
        why = `Nach ${seq(cA.san, 1)} ${st}${evPair(evA, best, my)}.`; arr = [arrow(reply.move, COL.red)]; mk = dr.marks;
      }
      if (x.cls === 'miss' && db && !why) why = `${db.san} hätte den Fehler bestraft${evPair(best, evA, my)}.`;
    }
    const sep = x.cls === 'inaccuracy' && kind === 'missed' && x.err === 'missedTactic' ? ' – ' : ': ';
    steps.push({ fen: f0, last: f0 === before ? lastPrev : last, arrows: arr, marks: mk, text: `${head}${why ? sep + why : '.'}` });
    if (missNote) steps.push({ fen: before, last: lastPrev, arrows: [], marks: {}, text: missNote });
    // Die Widerlegung des gespielten Zuges (als Möglichkeit des Gegners)
    if (reply && kind !== 'missed') {
      const skip = (kind === 'loss' || kind === 'tempo' || (kind === 'generic' && why.startsWith('Nach'))) ? 1 : 0;
      const startF = skip ? (mv(after, reply.move)?.fen || after) : after;
      const end = playLine(startF, reply.pv.slice(skip), (x.cls === 'inaccuracy' ? 2 : (ctx.elo && ctx.elo < 1200 ? 3 : 4)) - skip, skip, { me: COL.grey, them: COL.red });
      if (new Chess(end).isCheckmate()) steps.push({ fen: end, last: null, arrows: [], marks: {}, text: 'Am Ende wärst du matt.' });
    }
    // So wäre es richtig gewesen (Vorschlag)
    if (db) {
      const end = playLine(before, best.pv, kind === 'missed' ? 4 : 3, 0, { me: COL.green, them: COL.grey }, 'Besser: ');
      if (new Chess(end).isCheckmate()) steps.push({ fen: end, last: null, arrows: [], marks: {}, text: 'Am Ende setzt du matt.' });
      const ev = evPair(best, evA, my);
      const k0 = steps.findIndex(s => s.text.startsWith('Besser: '));
      if (k0 >= 0 && ev) steps[k0].text = steps[k0].text.replace(/\.$/, ev + '.');
    }
    const pers = personal();
    if (pers) steps.push({ fen: after, last, arrows: [], marks: {}, text: pers });
    // Unter Zeitdruck: praktischer, schnell spielbarer Zug statt bestem Engine-Zug
    if (x.pressure && L.length) {
      const nat = L.find(l => natural(before, l.move, i) && Math.abs(winPct(L[0]) - winPct(l)) <= 8);
      const safe = nat || L[0];
      const ss = mv(before, safe.move)?.m.san;
      if (ss) steps.push({ fen: before, last: lastPrev, arrows: [arrow(safe.move, COL.green)], marks: {}, text: `Mit wenig Zeit gilt: einfach und sicher. ${ss} hätte gereicht${nat ? ' – schnell zu sehen' : ''}.` });
    }
    const ha = humanAlt(before, L, i);
    if (ha) { const hs = mv(before, ha.move)?.m.san; steps.push({ fen: before, last: lastPrev, arrows: [arrow(ha.move, COL.green)], marks: {}, text: `Einfacher zu finden und fast genauso gut: ${hs}.` }); }
    // Merksatz als eigener Schritt, passend zum Fehler: gab es Material zu holen, ist es kein „Stellungsfehler“-Merksatz
    const lk = x.err === 'positional' && endB - b0 >= 1 ? 'missedTactic' : x.err;
    if (lk && LESSON[lk] && x.cls !== 'inaccuracy') steps.push({ fen: before, last: lastPrev, arrows: [], marks: {}, text: `Merksatz: ${LESSON[lk]}` });
  } else {
    // Fehler deines Gegners – deine Chance (Vorschlag, nicht der gespielte Zug)
    const head = { inaccuracy: `${oppName} spielt ungenau.`, mistake: `${oppName} macht einen Fehler.`, miss: `${oppName} lässt eine Chance liegen.`, blunder: `${oppName} patzt!` }[x.cls];
    const mySgn = my === 'w' ? 1 : -1;
    const myMate = evA?.mate != null && evA.mate * mySgn > 0 ? Math.abs(evA.mate) : null;
    const inCheck = new Chess(after).inCheck();
    const rd = reply ? describe(after, reply.move) : null;
    const qR = reply ? quietBal(after, reply.pv, my, 8) : [];
    const gainR = (qR.length ? qR[qR.length - 1] : bal(after, my)) - bal(after, my); // Stand am letzten Ruhepunkt
    const cR = reply ? caps(after, reply.pv, my) : {};
    const ob = best && best.move !== m.uci ? describe(before, best.move) : null;
    let intro, praise = true;
    if (!rd) intro = head;
    else if (myMate) intro = `${head} Deine Chance: Matt in ${myMate}, beginnend mit ${rd.san}.`;
    else if (x.cls === 'inaccuracy') intro = `${head} Besser für dich jetzt: ${rd.san}.`;
    else if (inCheck && gainR < 2) { intro = `${head}${ob ? ` Stärker war ${ob.san}.` : ''} Du musst auf das Schach reagieren: ${rd.san}.`; praise = false; }
    else if (gainR >= 2) { const gr = cR.got(gainR); intro = `${head} Deine Chance: ${rd.san} gewinnt ${matPhrase(gainR, gr?.t, gr ? cR.lost(gainR)?.t : null)}.`; }
    else intro = `${head} Deine Chance: ${rd.san}.`;
    steps.push({ fen: after, last, arrows: reply ? [arrow(reply.move, COL.green, 1)] : [], marks: rd?.marks || {}, text: intro });
    if (rd?.text && !myMate) steps.push({ fen: after, last, arrows: [arrow(reply.move, COL.green, 1)], marks: rd.marks, text: `${rd.san} ${rd.text}.` });
    if (reply && x.cls !== 'inaccuracy' && reply.pv.length > 1) {
      const f1 = mv(after, reply.move)?.fen;
      if (f1) playLine(f1, reply.pv.slice(1), myMate ? Math.min(4, myMate * 2 - 2) : 2, 1, { me: COL.green, them: COL.grey });
    }
    const nx = P.moves[i + 1], nxc = an.moves[i + 1];
    if (nx && reply && x.cls !== 'inaccuracy') {
      const hit = nx.uci === reply.move || ['best', 'great', 'brilliant', 'excellent'].includes(nxc.cls);
      if (!hit) steps.push({ fen: after, last, arrows: [arrow(nx.uci, COL.red, '✕'), arrow(reply.move, COL.green, '✓')], marks: {},
        text: `In der Partie hast du ${nx.san} gespielt (${CLASS_DE[nxc.cls]}) und die Chance nicht genutzt. ${LESSON.notPunished}` });
      else if (praise) steps.push({ fen: after, last, arrows: [], marks: {}, text: `Und du hast es gesehen: ${nx.san} – stark reagiert!` });
    }
  }
  return { cls: x.cls, title: CLASS_DE[x.cls], steps };
}

// Eigene Idee in einer Variante beurteilen: funktioniert sie – und warum (nicht)?
// b/a: {ev, best, pv} vor bzw. nach dem Zug (Weiß-Sicht), m: chess.js-Zug, my: eigene Farbe
export function judgeIdea({ before, after, m, b, a, my, oppName, startEv, prevFen }) {
  const c = m.color, mine = c === my, sgn = c === 'w' ? 1 : -1;
  const who = mine ? 'Deine Idee' : 'Diese Antwort';
  const base = bal(before, c);
  const reply = a?.best ? { move: a.best, pv: a.pv } : null;
  const dr = reply ? describe(after, reply.move) : null;
  const endA = bal(reply ? lineEnd(after, reply.pv, 4) : after, c);
  // „scheitert“: schlechter als die beste Fortsetzung; „funktioniert“: echter Gewinn gegenüber vor dem letzten Abtausch
  const lossRel = endA - bal(b?.pv?.length ? lineEnd(before, b.pv, 5) : before, c);
  const gainAbs = endA - bal(prevFen || before, c);
  const db = b?.best && b.best !== m.from + m.to + (m.promotion || '') ? describe(before, b.best) : null;
  const evOf = ev => evFor(ev, my);
  const wb = winPct(b.ev), wa = winPct(a.ev), loss = Math.max(0, c === 'w' ? wb - wa : wa - wb);
  const arrows = [], marks = {};
  let text;
  const self = describe(before, m.from + m.to + (m.promotion || ''));
  const chA = new Chess(after);
  if (chA.isCheckmate()) text = `${who} sitzt: Schachmatt!`;
  else if (a.ev.mate != null && a.ev.mate * sgn > 0) text = `${who} funktioniert: Matt in ${Math.abs(a.ev.mate)}!${reply ? ` Weiter mit ${uciSan(after, reply.move)}.` : ''}`;
  else if (a.ev.mate != null && a.ev.mate * sgn < 0) {
    text = `${who} scheitert: ${mine ? oppName : 'Die Gegenseite'} setzt nach ${dr.san} matt.`; arrows.push(arrow(reply.move, COL.red)); Object.assign(marks, dr.marks);
  } else if (lossRel <= -2) {
    text = `${who} scheitert an ${dr.san}${dr.text ? ' – ' + dr.text : ''}. Kostet ${lossName(lossRel)}.`; arrows.push(arrow(reply.move, COL.red)); Object.assign(marks, dr.marks);
  } else if (gainAbs >= 2 && lossRel > -1) {
    const line = []; let f = after; for (const u of (reply?.pv || []).slice(0, 4)) { const r = mv(f, u); if (!r) break; line.push(r.m.san); f = r.fen; }
    text = `${who} funktioniert: ${mine ? 'Du gewinnst' : oppName + ' gewinnt'} ${lossName(gainAbs)}${line.length ? ` (z. B. ${line.join(' ')})` : ''}.`;
  } else if (loss < 2) {
    text = `${who} ist richtig gut – die Engine stimmt zu.`;
  } else {
    const rm = reply ? mv(after, reply.move) : null;
    const kicked = rm && rm.m.piece === 'p' && m.piece !== 'p' && m.piece !== 'k' && rm.c.attackers(m.to, rm.m.color).includes(rm.m.to);
    if (kicked) { text = `${who} hat einen Haken: ${m.piece === 'q' ? 'Die Dame' : 'Der ' + NAME[m.piece]} auf ${m.to} wird mit ${dr.san} sofort vertrieben – das kostet Zeit.`; arrows.push(arrow(reply.move, COL.red)); marks[m.to] = 'bad'; }
    else if (castleRights(before, c) && !castleRights(after, c) && !m.san.startsWith('O-O')) text = `${who} kostet das Rochaderecht – der König bleibt in der Mitte.`;
    else if (pawnWeak(after, c) > pawnWeak(before, c)) text = `${who} schafft eine Bauernschwäche, die der Gegner angreifen kann.`;
    else text = `${who} ist spielbar, aber nicht das Beste.`;
    if (db) text += ` Stärker: ${db.san} (${evOf(b.ev)}).`;
    else if (dr?.text) text += ` ${dr.san} – ${dr.text}.`;
  }
  if (startEv) text += ` Variante: ${evOf(startEv)} → ${evOf(a.ev)}.`;
  return { text, arrows, marks, bestBefore: db ? b.best : null };
}
const uciSan = (fen, u) => mv(fen, u)?.m.san || u;
