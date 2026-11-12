// Schritt-für-Schritt-Erklärungen mit Pfeilen und markierten Feldern für jede Bewertungsstufe
import { Chess } from '../vendor/chess.js';
import { BOOK } from '../vendor/book.js';
import { CLASS_DE, winPct, fmtEval, bookKey } from './analysis.js';

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const AKK = { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' };
const DAT = { p: 'dem Bauern', n: 'dem Springer', b: 'dem Läufer', r: 'dem Turm', q: 'der Dame', k: 'dem König' };
export const COL = { red: 'rgba(226,57,43,.85)', green: 'rgba(127,191,77,.88)', teal: 'rgba(38,181,173,.9)', grey: 'rgba(150,148,140,.85)', blue: 'rgba(91,143,199,.88)' };

const mv = (fen, u) => { const c = new Chess(fen); try { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return { c, m, fen: c.fen() }; } catch { return null; } };
const bal = (fen, col) => { let s = 0; for (const p of new Chess(fen).board().flat()) if (p && p.type !== 'k') s += (p.color === col ? 1 : -1) * VAL[p.type]; return s; };
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a.at(-1);
function lossName(d) {
  d = Math.abs(d);
  return d >= 9 ? 'etwa eine Dame' : d >= 5 ? 'etwa einen Turm' : d >= 3 ? 'etwa eine Leichtfigur' : d === 2 ? 'zwei Bauern' : 'einen Bauern';
}

// Beschreibt einen Zug: Schlagen, Schach, Matt, Angriffe (Gabel), Umwandlung
function describe(fen, u) {
  const r = mv(fen, u); if (!r) return { san: u, text: '', marks: {}, r: null };
  const { c, m } = r, opp = m.color === 'w' ? 'b' : 'w', parts = [], marks = {};
  if (m.captured) parts.push(`schlägt ${AKK[m.captured]} auf ${m.to}`);
  if (m.promotion) parts.push(`wandelt in ${m.promotion === 'q' ? 'eine Dame' : NAME[m.promotion]} um`);
  if (c.isCheckmate()) return { san: m.san, text: (parts.length ? parts.join(', ') + ' – ' : '') + 'Schachmatt', marks, r, mate: true };
  if (c.inCheck()) parts.push('gibt Schach');
  // Was greift die gezogene Figur jetzt an?
  const targets = [];
  for (const p of c.board().flat()) {
    if (!p || p.color !== opp || p.type === 'k') continue;
    if (!c.attackers(p.square, m.color).includes(m.to)) continue;
    const defended = c.attackers(p.square, opp).length > 0;
    if (VAL[p.type] > VAL[m.piece] || !defended) targets.push(p);
  }
  if (c.inCheck() && targets.length) { parts.push(`greift dabei ${list(targets.map(t => AKK[t.type] + ' auf ' + t.square))} an – Doppelangriff`); }
  else if (targets.length >= 2) parts.push(`greift ${list(targets.map(t => AKK[t.type] + ' auf ' + t.square))} gleichzeitig an – eine Gabel`);
  else if (targets.length === 1) parts.push(`greift ${AKK[targets[0].type]} auf ${targets[0].square} an${c.attackers(targets[0].square, opp).length ? '' : ', der ungedeckt ist'}`);
  targets.forEach(t => marks[t.square] = 'bad');
  if (c.inCheck()) { const k = c.board().flat().find(p => p && p.type === 'k' && p.color === opp); marks[k.square] = 'bad'; }
  return { san: m.san, text: parts.join(', '), marks, r };
}
const sent = (who, d) => `${who} ${d.san}${d.text ? ' – ' + d.text.replace(/ – /g, ': ') : ''}.`;
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
export function explain(game, an, P, i, ctx = {}) {
  const m = P.moves[i], x = an.moves[i], c = m.color;
  const my = ctx.my || c, you = c === my;
  const oppName = my === 'w' ? game.black.username : game.white.username;
  const before = P.fens[i], after = P.fens[i + 1];
  const last = { from: m.from, to: m.to }, lastPrev = i > 0 ? { from: P.moves[i - 1].from, to: P.moves[i - 1].to } : null;
  const best = an.lines[i]?.[0], second = an.lines[i]?.[1], reply = an.lines[i + 1]?.[0];
  // Bewertung aus deiner Sicht
  const myEv = ev => { const s = fmtEval(ev); if (my === 'w' || !s) return s; return s.startsWith('-M') ? s.slice(1) : s.startsWith('-') ? '+' + s.slice(1) : s.startsWith('+') ? '-' + s.slice(1) : s.startsWith('M') ? '-' + s : s; };
  const evB = myEv(an.evals[i]), evA = myEv(an.evals[i + 1]);
  const steps = [], self = describe(before, m.uci);
  const who = mine => mine ? 'Du spielst' : `${oppName} spielt`;

  const playLine = (fen, pv, n, off, col, intro) => {
    let f = fen, prev = null;
    for (let k = 0; k < Math.min(n, pv.length); k++) {
      const d = describe(f, pv[k]); if (!d.r) break;
      const mine = d.r.m.color === my;
      steps.push({ fen: f, last: prev, arrows: [arrow(pv[k], mine ? col.me : col.them, k + 1 + (off || 0))], marks: d.marks,
        text: (k === 0 && intro ? intro : '') + sent(who(mine), d) });
      prev = { from: pv[k].slice(0, 2), to: pv[k].slice(2, 4) }; f = d.r.fen;
      if (d.mate) break;
    }
    return f;
  };
  const outcome = (fen0, fen1) => {
    const ch = new Chess(fen1);
    if (ch.isCheckmate()) return ch.turn() === my ? 'Am Ende wärst du matt.' : 'Am Ende setzt du matt.';
    const dlt = bal(fen1, my) - bal(fen0, my);
    if (dlt <= -1) return `Unterm Strich verlierst du ${lossName(dlt)} (${dlt}).`;
    if (dlt >= 1) return `Unterm Strich gewinnst du ${lossName(dlt)} (+${dlt}).`;
    return '';
  };
  // Persönlicher Kontext: Uhr, Bedenkzeit, wiederkehrende Fehler
  const personal = () => {
    const out = [];
    if (x.pressure && m.clock != null) out.push(`Du hattest nur noch ${fmtS(m.clock)} auf der Uhr – unter diesem Druck passiert das schnell.`);
    else if (m.spent != null && m.spent < 3 && P.base && P.base >= 180) out.push(`Du hast nur ${fmtS(m.spent)} nachgedacht. Genau hier hätte sich ein zweiter Blick gelohnt.`);
    else if (m.spent != null && m.spent >= 30) out.push(`Du hast ${fmtS(m.spent)} überlegt – die Gefahr trotzdem nicht gesehen. Das heißt: Du hast an der falschen Stelle gesucht.`);
    const h = ctx.hist, n = h?.err?.[x.err] || 0;
    if (x.err && n >= 2) out.push(`Und das ist kein Einzelfall: In deinen ${h.games} analysierten Partien ist es schon ${n}-mal passiert, dass du ${ERR_PHRASE[x.err]}.`);
    if (x.pressure && h?.pressureShare >= .25) out.push(`${Math.round(h.pressureShare * 100)} % deiner Fehler passieren unter Zeitdruck – das kostet dich Punkte.`);
    return out.join(' ');
  };
  const seed = i * 7 + (m.to.charCodeAt(0) + +m.to[1]);

  if (x.cls === 'book') {
    const nm = BOOK[bookKey(after)];
    steps.push({ fen: after, last, arrows: [], marks: {}, text: `${you ? 'Du bleibst' : oppName + ' bleibt'} mit ${m.san} in der Theorie${nm ? ` (${nm.slice(4)})` : ''}. Alles im grünen Bereich.` });
  } else if (x.cls === 'forced') {
    steps.push({ fen: after, last, arrows: [], marks: {}, text: `${m.san} war der einzige legale Zug – da gab es nichts zu entscheiden.` });
  } else if (x.cls === 'brilliant') {
    const capT = reply && mv(after, reply.move)?.m.to === m.to;
    const pron = m.piece === 'q' ? 'sie' : 'ihn';
    steps.push({ fen: after, last, arrows: reply ? [arrow(reply.move, you ? COL.red : COL.grey, 1)] : [], marks: { [m.to]: 'brill' },
      text: you
        ? `Wow – ${m.san} ist brillant! Du opferst ${AKK[m.piece]} auf ${m.to}. ${capT ? `${oppName} kann ${pron} mit ${mv(after, reply.move).m.san} schlagen – aber genau darauf hast du spekuliert.` : `${oppName} traut sich nicht, ${pron} zu nehmen – zu Recht.`}`
        : `Respekt an ${oppName}: ${m.san} ist brillant. ${AKK[m.piece][0].toUpperCase() + AKK[m.piece].slice(1)} auf ${m.to} wird geopfert. ${capT ? `Du kannst ${pron} mit ${mv(after, reply.move).m.san} schlagen – aber das hilft dir nicht.` : ''}` });
    if (reply) {
      const r1 = mv(after, reply.move);
      const end = playLine(r1.fen, reply.pv.slice(1), 4, 1, you ? { me: COL.teal, them: COL.red } : { me: COL.grey, them: COL.teal });
      steps.push({ fen: end, last: null, arrows: [], marks: {}, text: `${outcome(before, end)} Bewertung danach: ${evA}. ${you ? 'So ein Zug bleibt hängen – stark gesehen!' : 'Solche Opfer lernst du am besten, indem du sie dir merkst: Was hat die Figur danach geöffnet?'}` });
    }
  } else if (x.cls === 'great') {
    steps.push({ fen: after, last, arrows: [], marks: self.marks, text: you
      ? `${pick(['Genau richtig erkannt!', 'Stark gefunden!', 'Sehr gut gesehen!'], seed)} ${m.san} ist der einzige gute Zug in dieser Stellung.${self.text ? ' Der Zug ' + self.text + '.' : ''}`
      : `${oppName} findet mit ${m.san} den einzigen guten Zug.${self.text ? ' Der Zug ' + self.text + '.' : ''}` });
    if (second) {
      const d2 = describe(before, second.move), drop = Math.round(Math.abs(winPct(best) - winPct(second)));
      steps.push({ fen: before, last: lastPrev, arrows: [arrow(m.uci, COL.blue, 1), arrow(second.move, COL.grey, 2)], marks: {},
        text: `${you ? `Viele hätten hier ${d2.san} gespielt` : `Naheliegend wäre ${d2.san} gewesen`} – das hätte etwa ${drop} % Gewinnchance gekostet (${myEv(second)} statt ${myEv(best)}).` });
    }
  } else if (['best', 'excellent', 'good'].includes(x.cls)) {
    const head = you
      ? { best: pick(['Sauber gespielt –', 'Genau so –', 'Top –'], seed) + ` ${m.san} ist der beste Zug.`, excellent: `${m.san} ist exzellent – fast perfekt.`, good: `${m.san} ist solide.` }[x.cls]
      : { best: `${oppName} spielt mit ${m.san} den besten Zug.`, excellent: `${oppName} spielt ${m.san} – exzellent.`, good: `${oppName} spielt ${m.san} – solide.` }[x.cls];
    steps.push({ fen: after, last, arrows: [], marks: self.marks, text: `${head}${self.text ? ' Der Zug ' + self.text + '.' : ''}` });
    if (x.cls !== 'best' && best && best.move !== m.uci) {
      const db = describe(before, best.move);
      steps.push({ fen: before, last: lastPrev, arrows: [arrow(best.move, COL.green, 1)], marks: db.marks, text: `${you ? 'Noch etwas stärker wäre' : 'Für ' + oppName + ' noch etwas stärker wäre'} ${db.san} gewesen${db.text ? ' – ' + db.text : ''} (${myEv(best)} statt ${evA}).` });
    }
  } else if (you) {
    // Dein Fehler
    const head = {
      inaccuracy: `Kleine Ungenauigkeit: ${m.san}.`, mistake: `${m.san} war leider ein Fehler.`,
      miss: `Hier hast du eine Chance liegen lassen: ${m.san}.`, blunder: pick([`Autsch – ${m.san} ist ein Patzer.`, `${m.san} – das tut weh, ein Patzer.`], seed)
    }[x.cls];
    let intro = `${head} Die Bewertung kippt von ${evB} auf ${evA}. `;
    if (x.cls === 'miss' && i > 0) intro += `${oppName} hatte dir gerade mit ${P.moves[i - 1].san} eine Tür geöffnet – du bist nicht durchgegangen. `;
    if (reply) {
      const end = playLine(after, reply.pv, x.cls === 'inaccuracy' ? 2 : 4, 0, { me: COL.grey, them: COL.red }, intro + 'Warum? ');
      if (steps.length) steps[0].last = last;
      const oc = outcome(before, end);
      if (oc && !oc.includes('gewinnst') && !oc.includes('setzt du matt')) steps.push({ fen: end, last: null, arrows: [], marks: {}, text: oc });
    } else steps.push({ fen: after, last, arrows: [], marks: {}, text: intro });
    const pers = personal();
    if (pers) steps.push({ fen: after, last, arrows: [], marks: {}, text: pers });
    if (best && best.move !== m.uci) {
      const db = describe(before, best.move);
      const line = []; let f = before;
      for (const u of best.pv.slice(0, 5)) { const r = mv(f, u); if (!r) break; line.push(r.m.san); f = r.fen; }
      const gain = outcome(before, f);
      const mateTxt = best.mate != null && best.mate * (c === 'w' ? 1 : -1) > 0 ? ` Das wäre sogar Matt in ${Math.abs(best.mate)} gewesen!` : '';
      steps.push({ fen: before, last: lastPrev, arrows: [arrow(m.uci, COL.red, '✕'), arrow(best.move, COL.green, '✓')], marks: db.marks,
        text: `Besser war ${db.san}${db.text ? ' – ' + db.text : ''} (${myEv(best)}). Zum Beispiel: ${line.join(' ')}.${mateTxt}${gain.includes('gewinnst') && !mateTxt ? ' ' + gain.replace('Unterm Strich', 'Damit') : ''}${x.err && LESSON[x.err] && x.cls !== 'inaccuracy' ? ` Merksatz: ${LESSON[x.err]}` : ''}` });
    }
  } else {
    // Fehler deines Gegners – deine Chance
    const head = { inaccuracy: `${oppName} spielt ungenau: ${m.san}.`, mistake: `${oppName} macht einen Fehler: ${m.san}.`, miss: `${oppName} lässt mit ${m.san} eine Chance liegen.`, blunder: `${oppName} patzt mit ${m.san}!` }[x.cls];
    const intro = `${head} Die Bewertung springt von ${evB} auf ${evA} – zu deinen Gunsten. ${x.cls === 'inaccuracy' ? '' : 'Jetzt bist du dran: '}`;
    if (reply) {
      playLine(after, reply.pv, x.cls === 'inaccuracy' ? 1 : 3, 0, { me: COL.green, them: COL.grey }, intro);
      if (steps.length) steps[0].last = last;
    } else steps.push({ fen: after, last, arrows: [], marks: {}, text: intro });
    const nx = P.moves[i + 1], nxc = an.moves[i + 1];
    if (nx && reply && x.cls !== 'inaccuracy') {
      const hit = nx.uci === reply.move || ['best', 'great', 'brilliant', 'excellent'].includes(nxc.cls);
      steps.push({ fen: after, last, arrows: hit ? [] : [arrow(nx.uci, COL.red, '✕'), arrow(reply.move, COL.green, '✓')], marks: {},
        text: hit ? `Und du hast es gesehen: ${nx.san} – stark reagiert!` : `In der Partie hast du ${nx.san} gespielt (${CLASS_DE[nxc.cls]}) und die Chance nicht genutzt. ${LESSON.notPunished}` });
    }
  }
  return { cls: x.cls, title: CLASS_DE[x.cls], steps };
}
