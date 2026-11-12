// Unit-Test der Zugeinstufung (Expected-Points-Modell). Aufruf: node test/classify.test.mjs [/tmp/an_dump_old.json]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyMove, winPctR, winPct, reclassify, greatGap, findSacrifices } from '../web/js/analysis.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok –', name); };
const base = { legal: 20, inBook: false, R: 1500, isBest: false, sacrifice: false, obvious: false, prevOppCls: null, wpPrev: null, wpAlt: null };
const C = o => { const x = { ...base, ...o }; x.wpB ??= 55; x.wpA ??= x.wpB - x.loss; return classifyMove(x); };

t('Schwellen 0/0.02/0.05/0.10/0.20', () => {
  assert.equal(C({ loss: 0, isBest: true }), 'best');
  assert.equal(C({ loss: 0.3 }), 'best');
  assert.equal(C({ loss: 1.5 }), 'excellent');
  assert.equal(C({ loss: 3 }), 'good');
  assert.equal(C({ loss: 7 }), 'inaccuracy');
  assert.equal(C({ loss: 15 }), 'mistake');
  assert.equal(C({ loss: 25 }), 'blunder');
});
t('Erzwungen vor Theorie vor allem anderen; Mattzug immer Bester Zug', () => {
  assert.equal(C({ loss: 0, inBook: true }), 'book');
  assert.equal(C({ loss: 30, legal: 1 }), 'forced');
  assert.equal(C({ loss: 0, legal: 1, inBook: true }), 'forced');
  assert.equal(C({ loss: 0, isBest: true, mate: true, wpB: 100, wpAlt: 50 }), 'best'); // kein Großartig für Matt
});
t('Brillant: Opfer, bester Zug, danach nicht schlecht, ohne Zug nicht schon gewonnen', () => {
  assert.equal(C({ loss: 0, isBest: true, sacrifice: true, wpB: 60, wpAlt: 50 }), 'brilliant');
  assert.equal(C({ R: 1000, loss: 1.5, sacrifice: true, wpB: 60, wpAlt: 60 }), 'brilliant'); // unter 1200: auch exzellent
  assert.equal(C({ loss: 1.5, sacrifice: true, wpB: 60, wpAlt: 60 }), 'excellent');           // ab 1200 nur bester Zug
  assert.equal(C({ loss: 0, isBest: true, sacrifice: [], wpB: 60, wpAlt: 50 }), 'best');      // kein Opfer gefunden
  assert.equal(C({ loss: 3, sacrifice: true, wpB: 60, wpAlt: 50 }), 'good');      // zu ungenau
  assert.equal(C({ loss: 0, isBest: true, sacrifice: true, wpB: 97, wpAlt: 95 }), 'best'); // ohnehin gewonnen
  assert.equal(C({ loss: 0, isBest: true, sacrifice: true, wpB: 35, wpAlt: 32 }), 'best'); // danach schlecht
  assert.equal(C({ loss: 0, isBest: true, sacrifice: true, obvious: true, wpB: 60, wpAlt: 40 }), 'best');
});
t('Brillant hat Vorrang vor Großartig und Bester Zug', () => {
  assert.equal(C({ loss: 0, isBest: true, sacrifice: true, wpB: 60, wpAlt: 10 }), 'brilliant');
});
t('Großartig: einziger guter Zug, ändert die Lage', () => {
  assert.equal(C({ loss: 0, isBest: true, wpB: 50, wpAlt: 15 }), 'great');   // offen statt verloren
  assert.equal(C({ loss: 0, isBest: true, wpB: 80, wpAlt: 55 }), 'great');   // gewonnen statt offen
  assert.equal(C({ loss: 0, isBest: true, wpB: 50, wpAlt: 49.8 }), 'best');  // gleich gute Alternative
  assert.equal(C({ loss: 0.2, wpB: 50, wpA: 49.8, wpAlt: 50 }), 'best');     // Zweitbester gespielt, gleich gut
  assert.equal(C({ loss: 0, isBest: true, wpB: 99, wpAlt: 80 }), 'best');    // bleibt ohnehin gewonnen
  assert.equal(C({ loss: 0, isBest: true, wpB: 60, wpAlt: 42 }), 'best');    // Alternative schlechter, aber gleiche Lage-Kategorie
  assert.equal(C({ loss: 0, isBest: true, wpB: 50, wpAlt: 15, freeCapture: true }), 'best'); // freie Figur schlagen
  assert.equal(C({ loss: 0, isBest: true, wpB: 25, wpAlt: 5 }), 'best');     // bleibt verloren
  assert.equal(C({ loss: 0, isBest: true, wpB: 50, wpAlt: 15, obvious: true }), 'best'); // Zurückschlagen
  assert.equal(C({ loss: 0, isBest: true, wpB: 50, wpAlt: null }), 'best');  // kein Zweitbester bekannt
});
t('Großartig: Anfänger großzügiger als Starke', () => {
  assert.equal(greatGap(800), 10); assert.equal(greatGap(2400), 15);
  assert.equal(C({ R: 900, loss: 0, isBest: true, wpB: 72, wpAlt: 60 }), 'great');
  assert.equal(C({ R: 2200, loss: 0, isBest: true, wpB: 72, wpAlt: 60 }), 'best');
});
t('Verpasst: Gegnerfehler nicht bestraft', () => {
  // vorher 50, Gegner patzt → 85, du spielst zurück auf 52
  assert.equal(C({ loss: 33, wpB: 85, wpA: 52, prevOppCls: 'blunder', wpPrev: 50 }), 'miss');
  // ohne Gegnerfehler bleibt es Patzer
  assert.equal(C({ loss: 33, wpB: 85, wpA: 52, prevOppCls: 'good', wpPrev: 50 }), 'blunder');
  // schlechter als vor dem Gegnerfehler → echter Patzer
  assert.equal(C({ loss: 60, wpB: 85, wpA: 25, prevOppCls: 'blunder', wpPrev: 50 }), 'blunder');
  // Ungenauigkeit ist nie „Verpasst“
  assert.equal(C({ loss: 8, wpB: 85, wpA: 77, prevOppCls: 'blunder', wpPrev: 50 }), 'inaccuracy');
});
t('Statische Opfererkennung: richtige Figur, Rückzug/Desperado/Fesselung kein Opfer', () => {
  assert.deepEqual(findSacrifices('2r3k1/pp1pq1p1/4p2p/4nprQ/2BBP3/2P5/PP3PPN/R3R1K1 w - - 1 19', 'h5h3'), []);            // 19.Dh3: Rückzug, Lc4 hing schon
  assert.deepEqual(findSacrifices('rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5', 'f3e5').map(x => x.piece + x.square), ['qd1']); // Légal
  assert.deepEqual(findSacrifices('r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 3 17', 'g4e6').map(x => x.piece + x.square), ['qb6', 'nc3']); // Fischer …Le6: Dame zuerst (Sc3 hängt auch)
  assert.deepEqual(findSacrifices('r2qkbnr/3b1ppp/p2p4/1p1Q4/2p1P3/1B6/PPP2PPP/RNB1K2R w KQkq - 0 12', 'b3c4'), []);        // Noahs Arche: Desperado
  assert.deepEqual(findSacrifices('rnbqk2r/ppp2ppp/4pn2/3p4/1bPP4/2N2NP1/PP2PP1P/R1BQKB1R b KQkq - 1 5', 'f6e4'), []);      // Sc3 gefesselt
  assert.deepEqual(findSacrifices('r1b2rk1/pp1pqpp1/2nNp2p/2p5/2B1P1n1/3PBN2/PPP2PPP/R2Q1RK1 w - - 1 10', 'd6c8'), []);     // Sxc8: Tausch
});
t('Elo-Skalierung: gleiche Bewertung zählt für Stärkere mehr', () => {
  assert.ok(winPctR({ cp: 200 }, 2200) > winPctR({ cp: 200 }, 800));
  assert.equal(winPctR({ mate: 3 }, 800), 100);
});

// Alt (v4) gegen neu (v5) auf denselben Engine-Daten: Genauigkeit muss identisch bleiben
const dump = process.argv[2];
if (dump && fs.existsSync(dump)) {
  const games = JSON.parse(fs.readFileSync(new URL('./games.json', import.meta.url))).games;
  const old = JSON.parse(fs.readFileSync(dump, 'utf8'));
  for (const an of old) {
    const g = games.find(x => x.url === an.url);
    const nu = reclassify(g, an);
    t(`Genauigkeit unverändert ${an.url.slice(-1)}: ${JSON.stringify(an.accuracy)}`, () => {
      assert.deepEqual(nu.accuracy, an.accuracy);
      assert.deepEqual(nu.moves.map(m => m.acc), an.moves.map(m => m.acc));
      assert.equal(nu.v, 7);
    });
    const diff = an.moves.map((m, i) => m.cls !== nu.moves[i].cls ? `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'} ${m.cls}→${nu.moves[i].cls}` : null).filter(Boolean);
    console.log('   geänderte Klassen:', diff.join(', ') || 'keine');
    console.log('   neu:', nu.moves.map((m, i) => `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}${m.cls}`).filter((_, i) => i >= 6).join(' '));
  }
}
console.log(`\n${n} Tests bestanden`);
