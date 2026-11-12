#!/usr/bin/env node
// Opfer-Kandidaten für die Brillant-Prüfung: für jeden Zug aus echte.mjs --json
//  (a) die App-Opfererkennung findSacrifices (unabhängig von der Klasse)
//  (b) eine lockere, unabhängige Heuristik: nach dem Zug ist eine eigene Figur (S/L/T/D) angegriffen und
//      entweder ungedeckt oder von einer billigeren Figur angegriffen (kein Bauer, kein König).
// Ausgabe: JSON { "u:ply": { app: [...], heur: [...] } } nur für Züge mit Treffer.
//   node test/klassen/team/opferkandidaten.mjs /tmp/echte16.json /tmp/kand.json
import '../esm-shim.mjs';
import fs from 'node:fs';
const { findSacrifices } = await import('../../../web/js/analysis.js');
const { Chess } = await import('../../../web/vendor/chess.js');
const [inp, outp] = process.argv.slice(2);
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const data = JSON.parse(fs.readFileSync(inp, 'utf8'));
const out = {};
for (const m of data.moves) {
  const app = findSacrifices(m.fen, m.uci);
  const ch = new Chess(m.fen); const S = ch.turn(), O = S === 'w' ? 'b' : 'w';
  const wasCheck = ch.inCheck();
  const mv = ch.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] });
  const heur = [];
  if (!wasCheck && !ch.isCheckmate()) {
    for (const row of ch.board()) for (const p of row) {
      if (!p || p.color !== S || !'nbrq'.includes(p.type)) continue;
      const att = ch.attackers(p.square, O); if (!att.length) continue;
      const def = ch.attackers(p.square, S);
      const minAtt = Math.min(...att.map(sq => V[ch.get(sq).type]));
      if (!def.length || minAtt < V[p.type]) {
        const capv = mv.captured ? V[mv.captured] : 0;
        if (V[p.type] - (def.length ? minAtt : 0) - capv >= 1 || !def.length && V[p.type] > capv) heur.push({ piece: p.type, square: p.square, ungedeckt: !def.length, minAtt });
      }
    }
  }
  if (app.length || heur.length) out[`${m.u}:${m.ply}`] = { app, heur };
}
fs.writeFileSync(outp, JSON.stringify(out));
console.log(Object.keys(out).length, 'Kandidaten von', data.moves.length, 'Zügen; App-Opfer:', Object.values(out).filter(x => x.app.length).length);
