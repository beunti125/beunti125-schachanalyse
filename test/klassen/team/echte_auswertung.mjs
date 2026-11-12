#!/usr/bin/env node
// Auswertung der Prüfung: App (Tiefe 16, MultiPV 2) gegen Referenz (Tiefe 20, MultiPV 3, Regeln der Spezifikation).
//   node test/klassen/team/echte_auswertung.mjs [--json team/auswertung.json] [-v]
import '../esm-shim.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const { winPctR, EP, outcome, CLASS_DE, uciToSan, pvToSan } = await import('../../../web/js/analysis.js');
const { Chess } = await import('../../../web/vendor/chess.js');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const A = JSON.parse(fs.readFileSync(path.join(DIR, 'echte_d16.json'), 'utf8'));
const Q = JSON.parse(fs.readFileSync(path.join(DIR, opt('--pruefung', 'pruefung_d20.json')), 'utf8'));
const byU = Object.fromEntries(A.map(g => [g.u, g]));

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const bal = (ch, c) => { let s = 0; for (const r of ch.board()) for (const p of r) if (p) s += (p.color === c ? 1 : -1) * VAL[p.type]; return s; };
// Bilanz entlang der Variante; q[k] = Ruhepunkt (nach k Halbzügen kein Schach und der nächste Halbzug schlägt nicht)
const seq = (fen, pv, c, n) => { const ch = new Chess(fen), o = [bal(ch, c)], q = []; const mv = [];
  for (const u of pv.slice(0, n)) { try { mv.push(ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })); } catch { break; } o.push(bal(ch, c)); }
  const ck = [false, ...mv.map(m => /[+#]/.test(m.san))];
  for (let k = 0; k < o.length; k++) q.push(!ck[k] && (k === o.length - 1 || !mv[k].captured));
  o.quiet = q; return o; };
const quietVals = (sq, from, to) => { const v = []; for (let k = from; k <= Math.min(to, sq.length - 1); k++) if (sq.quiet[k]) v.push(sq[k]); return v.length ? v : [sq[sq.length - 1]]; };
const side = (c, ev, R) => c === 'w' ? winPctR(ev, R) : 100 - winPctR(ev, R);
const bucket = l => l < EP.best ? 'best' : l < EP.excellent ? 'excellent' : l < EP.good ? 'good' : l < EP.inaccuracy ? 'inaccuracy' : l < EP.mistake ? 'mistake' : 'blunder';
const ORD = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

const rows = [];
for (const q of Q) {
  const g = byU[q.u], m = g.moves[q.i], c = m.c, sgn = c === 'w' ? 1 : -1, R = c === 'w' ? g.wr : g.br;
  const fen = g.fens[q.i], fenA = g.fens[q.i + 1];
  const L = q.before.lines;
  const chA = new Chess(fenA);
  const term = chA.isCheckmate() ? { mate: 0, matedWhite: chA.turn() === 'w' } : chA.isDraw() ? { cp: 0 } : null;
  const own = L.find(l => l.move === m.uci);
  const afterEv = term || q.after.lines[0];
  // Referenz: eigene MultiPV-Linie, sonst Suche nach dem Zug (Tiefe 20 ≙ 21 Halbzüge)
  let wpA = own ? side(c, own, R) : (term?.mate === 0 ? 100 : side(c, afterEv, R));
  let wpB = wpA; for (const l of L) wpB = Math.max(wpB, side(c, l, R));
  if (L[0].move === m.uci) wpA = wpB;
  const loss = Math.max(0, wpB - wpA);
  let ref = L[0].move === m.uci || term?.mate === 0 ? 'best' : bucket(loss);
  // Mattlängen
  const bm = L[0].mate != null && L[0].mate * sgn > 0 ? L[0].mate * sgn : null;
  if (bm != null && L[0].move !== m.uci && !(term?.mate === 0)) {
    const pm = own?.mate != null && own.mate * sgn > 0 ? own.mate * sgn : afterEv.mate != null && afterEv.mate * sgn > 0 ? Math.abs(afterEv.mate) + 1 : null;
    if (pm != null) { const d = pm - bm; ref = d <= 0 ? 'best' : d === 1 ? 'excellent' : d <= 6 ? 'good' : 'inaccuracy'; }
  }
  // Verpasst (Referenz): App-Klasse des Gegnerzugs (Tiefe 16) als Voraussetzung, EP vor dem Gegnerzug aus Tiefe 20
  let refCls = ref;
  const prevCls = q.i > 0 ? g.moves[q.i - 1].cls : null;
  const wpPrev = q.prev ? side(c, q.prev.lines[0], R) : null;
  if ((ref === 'mistake' || ref === 'blunder') && ['mistake', 'blunder', 'miss'].includes(prevCls) && wpPrev != null
    && wpB - wpPrev >= EP.inaccuracy && wpA >= wpPrev - 5 && (outcome(wpA) < outcome(wpB) || loss >= EP.mistake)) refCls = 'miss';

  // Fehlertyp-Referenz (schachlich, Tiefe 20, längere Fenster)
  let refErr = null, why = '';
  if (['inaccuracy', 'mistake', 'blunder', 'miss'].includes(refCls)) {
    const amA = afterEv.mate;
    if (bm != null && !(amA != null && amA * sgn > 0) && !(term?.mate === 0)) { refErr = 'missedMate'; why = `M${bm} verpasst`; }
    else if (amA != null && amA * sgn < 0) { refErr = 'allowedMate'; why = `lässt M${Math.abs(amA)} zu`; }
    else {
      const b0 = bal(new Chess(fen), c);
      const sA = term ? [bal(chA, c)] : seq(fenA, q.after.lines[0].pv, c, 9);   // sA[0] = direkt nach dem Zug
      const sB = seq(fen, L[0].pv, c, 9);                                         // sB[0] = b0
      // stabile Bilanz an Ruhepunkten (kein Schach, nächster Halbzug kein Schlag): A schlechtester Ruhepunkt 1–8 Halbzüge
      // nach dem Zug, B bester Ruhepunkt 1–8 Halbzüge nach dem besten Zug
      const endA = Math.min(...quietVals(sA, 1, 8));
      const endB = Math.max(...quietVals(sB, 1, 8));
      const lostVsBest = endB - endA;
      if (endA <= b0 - 2 && lostVsBest >= 2) { refErr = 'hung'; why = `Material ${b0}→${endA}`; }
      else if (endB >= b0 + 2 && endB - endA >= 2) { refErr = 'missedTactic'; why = `bester Zug gewinnt ${b0}→${endB}, gespielt ${endA}`; }
      else { refErr = refCls === 'miss' ? 'notPunished' : 'positional'; why = `Bilanz b0=${b0} A=${endA} B=${endB}`; }
      if (refCls === 'miss' && refErr === 'positional') refErr = 'notPunished';
    }
  }
  rows.push({
    id: `${q.u}#${q.i}`, u: q.u, i: q.i, zug: `${Math.floor(q.i / 2) + 1}${c === 'w' ? '.' : '...'}${m.san}`, R, why0: q.why,
    app: m.cls, appErr: m.err, appLoss: m.loss, appWpB: m.wpB, appWpA: m.wpA,
    ref: refCls, refErr, refLoss: +loss.toFixed(1), wpB: +wpB.toFixed(1), wpA: +wpA.toFixed(1), why,
    fen, best16: m.best, best20: L[0].move, bestSan: uciToSan(fen, L[0].move), pv20: pvToSan(fen, L[0].pv, 6).join(' '),
    afterPv: term ? '' : pvToSan(fenA, q.after.lines[0].pv, 6).join(' '), ownInMpv: !!own,
    ownInMpv16: !!(g.lines[q.i] || []).find(l => l.move === m.uci),
  });
}
const sameCls = r => r.app === r.ref;
const near = r => Math.abs(ORD.indexOf(r.app === 'miss' ? 'mistake' : r.app) - ORD.indexOf(r.ref === 'miss' ? 'mistake' : r.ref)) <= 1;
const per = {};
for (const r of rows) { const k = r.app; per[k] ??= { n: 0, cls: 0, err: 0, errN: 0, near: 0 }; per[k].n++; if (sameCls(r)) per[k].cls++; if (near(r)) per[k].near++; if (r.appErr) { per[k].errN++; if (r.appErr === r.refErr) per[k].err++; } }
console.log('Klasse          n  Klasse=  ±1Stufe  Fehlertyp=');
for (const k of ['blunder', 'mistake', 'miss', 'inaccuracy', 'good', 'excellent', 'best']) if (per[k]) {
  const p = per[k]; console.log(`${CLASS_DE[k].padEnd(14)} ${String(p.n).padStart(3)}  ${String(p.cls).padStart(3)} (${(100 * p.cls / p.n).toFixed(0)}%)  ${String(p.near).padStart(3)}   ${p.errN ? `${p.err}/${p.errN} (${(100 * p.err / p.errN).toFixed(0)}%)` : '-'}`);
}
// Verwechslungsmatrix
const cm = {}; for (const r of rows) { cm[r.app] ??= {}; cm[r.app][r.ref] = (cm[r.app][r.ref] || 0) + 1; }
console.log('\nApp → Referenz:'); for (const [a, o] of Object.entries(cm)) console.log(`  ${a.padEnd(11)} ${JSON.stringify(o)}`);
const em = {}; for (const r of rows) if (r.appErr || r.refErr) { const k = `${r.appErr}→${r.refErr}`; em[k] = (em[k] || 0) + 1; }
console.log('\nFehlertyp App → Referenz:'); for (const [k, v] of Object.entries(em).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${v}`);
if (argv.includes('-v')) for (const r of rows) if (!sameCls(r) || r.appErr !== r.refErr)
  console.log(`${r.id.padEnd(16)} ${r.zug.padEnd(12)} R${r.R} App ${r.app}/${r.appErr} (loss ${r.appLoss}, B ${r.appWpB} A ${r.appWpA}) | Ref ${r.ref}/${r.refErr} (loss ${r.refLoss}, B ${r.wpB} A ${r.wpA}) best16 ${r.best16} best20 ${r.bestSan} | ${r.why} | PV ${r.pv20} | nach: ${r.afterPv}`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rows, null, 1));
