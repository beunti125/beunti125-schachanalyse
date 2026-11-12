// Bauernstrukturen erkennen und die typischen Pläne erklären (gilt in Eröffnung und Mittelspiel)
import { Chess } from '../vendor/chess.js';

function pawns(fen) {
  const p = { w: new Set(), b: new Set() };
  for (const x of new Chess(fen).board().flat()) if (x && x.type === 'p') p[x.color].add(x.square);
  return p;
}
const has = (set, ...sq) => sq.every(s => set.has(s));
const fileHas = (set, f) => [...set].some(s => s[0] === f);

// Jede Struktur: test(w, b) aus Sicht von Weiß; plan.w / plan.b; sq = Schlüsselfelder
const STRUCTS = [
  { id: 'iqp-w', name: 'Isolierter Damenbauer (Weiß)', test: (w, b) => fileHas(w, 'd') && !fileHas(w, 'c') && !fileHas(w, 'e') && !fileHas(b, 'd'),
    w: 'Der Isolani gibt dir Raum und Felder (e5, c5). Spiel aktiv: Figuren nach vorn, Angriff am Königsflügel, im richtigen Moment d4–d5.',
    b: 'Blockiere den Bauern auf d5 (ideal mit einem Springer), tausche Figuren – im Endspiel wird der Isolani schwach.', sq: ['d5', 'e5'] },
  { id: 'iqp-b', name: 'Isolierter Damenbauer (Schwarz)', test: (w, b) => fileHas(b, 'd') && !fileHas(b, 'c') && !fileHas(b, 'e') && !fileHas(w, 'd'),
    w: 'Blockiere den Bauern auf d4 (ideal mit einem Springer), tausche Figuren – im Endspiel wird der Isolani schwach.',
    b: 'Der Isolani gibt dir Raum und Felder (e4, c4). Spiel aktiv: Figuren nach vorn, Angriff, im richtigen Moment …d5–d4.', sq: ['d4', 'e4'] },
  { id: 'carlsbad', name: 'Karlsbader Struktur', test: (w, b) => has(w, 'd4') && !fileHas(w, 'c') && has(b, 'd5', 'c6') && !fileHas(b, 'e'),
    w: 'Minoritätsangriff: b4–b5 und b5xc6, um Schwarz einen schwachen c-Bauern zu geben. Turm auf die halboffene c-Linie.',
    b: 'Gegenspiel am Königsflügel: Figuren Richtung weißen König, Springer nach e4, oft …f5.', sq: ['b5', 'e4'] },
  { id: 'french', name: 'Französische Bauernkette', test: (w, b) => has(w, 'e5', 'd4') && has(b, 'e6', 'd5'),
    w: 'Raumvorteil am Königsflügel nutzen: Figuren Richtung schwarzen König, f4–f5 vorbereiten. Die Kette an d4 halten.',
    b: 'Die Kette an der Basis angreifen: …c5 gegen d4 und …f6 gegen e5. Der Läufer c8 braucht eine Aufgabe (…b6/…Ba6).', sq: ['d4', 'e5'] },
  { id: 'kid', name: 'Königsindische Kette', test: (w, b) => has(w, 'd5', 'e4') && has(b, 'd6', 'e5'),
    w: 'Angriff am Damenflügel: c4–c5 und b4, um die Kette an d6 aufzubrechen.',
    b: 'Angriff am Königsflügel: …f5–f4 und …g5–g4, Figuren zum weißen König.', sq: ['c5', 'f5'] },
  { id: 'kid-rev', name: 'Kette mit Vorstoß d4–d5 (Schwarz)', test: (w, b) => has(b, 'd4', 'e5') && has(w, 'd3', 'e4'),
    w: 'Angriff am Königsflügel mit f4, Figuren zum schwarzen König.',
    b: 'Angriff am Damenflügel: …c5–c4 und …b5, um die Kette an d3 aufzubrechen.', sq: ['c4', 'f4'] },
  { id: 'sicilian', name: 'Sizilianische Struktur', test: (w, b) => has(w, 'e4') && !fileHas(w, 'd') && !fileHas(b, 'c') && fileHas(b, 'd'),
    w: 'Mehr Raum und schnelle Entwicklung: Angriff am Königsflügel (f4, f5 oder g4–g5). Feld d5 für einen Springer nutzen.',
    b: 'Halboffene c-Linie und Damenflügel: …a6, …b5, Turm nach c8. Der Vorstoß …d5 befreit oft die Stellung.', sq: ['d5', 'c4'] },
  { id: 'maroczy', name: 'Maroczy-Bindung', test: (w, b) => has(w, 'c4', 'e4') && !fileHas(w, 'd'),
    w: 'Die Bauern c4 und e4 kontrollieren d5 – Schwarz bekommt kaum Raum. Ruhig ausbauen und Gegenspiel verhindern.',
    b: 'Geduldig spielen, Figuren tauschen und mit …b5 oder …f5 den Hebel suchen.', sq: ['d5'] },
  { id: 'stonewall-w', name: 'Stonewall (Weiß)', test: w => has(w, 'd4', 'e3', 'f4', 'c3'),
    w: 'Springer nach e5, Angriff am Königsflügel mit Rf3–h3 oder g4.',
    b: 'Das Loch auf e4 nutzen, den Springer e5 abtauschen, Gegenspiel am Damenflügel.', sq: ['e5', 'e4'] },
  { id: 'stonewall-b', name: 'Stonewall (Schwarz)', test: (w, b) => has(b, 'd5', 'e6', 'f5', 'c6'),
    w: 'Das Loch auf e5 nutzen, den Springer e4 abtauschen, Gegenspiel am Damenflügel.',
    b: 'Springer nach e4, Angriff am Königsflügel mit …Rf6–h6 oder …g5.', sq: ['e4', 'e5'] },
  { id: 'slav', name: 'Slawisches Dreieck', test: (w, b) => has(b, 'c6', 'd5', 'e6') && fileHas(w, 'c'),
    w: 'Druck auf d5, Raum mit e4 im passenden Moment, oft a4 gegen …b5.',
    b: 'Sehr solide. Befreien mit …c5 oder …e5, den Läufer c8 vorher aktivieren.', sq: ['d5', 'e4'] },
  { id: 'hanging', name: 'Hängende Bauern', test: (w, b) => (has(w, 'c4', 'd4') && !fileHas(w, 'b') && !fileHas(w, 'e')) || (has(b, 'c5', 'd5') && !fileHas(b, 'b') && !fileHas(b, 'e')),
    w: 'Hängende Bauern sind stark, solange sie beweglich sind – und schwach, wenn sie blockiert werden. Der Vorstoß eines Bauern öffnet Linien für Angriff.',
    b: 'Gleiches Prinzip spiegelverkehrt: die Bauern blockieren und von vorne angreifen – oder selbst aktiv vorstoßen.', sq: [] },
  { id: 'open', name: 'Offenes Zentrum', test: (w, b) => !fileHas(w, 'd') && !fileHas(w, 'e') && !fileHas(b, 'd') && !fileHas(b, 'e'),
    w: 'Ohne Zentrumsbauern zählt Figurenaktivität: Türme auf die offenen d- und e-Linien, Läufer auf lange Diagonalen.',
    b: 'Ohne Zentrumsbauern zählt Figurenaktivität: Türme auf die offenen d- und e-Linien, Läufer auf lange Diagonalen.', sq: [] },
  { id: 'closed', name: 'Geschlossenes Zentrum', test: (w, b) => (has(w, 'e4') && has(b, 'e5') && has(w, 'd3') && has(b, 'd6')),
    w: 'Das Spiel findet an den Flügeln statt: dort angreifen, wo deine Bauern hinzeigen – mit f4 am Königsflügel.',
    b: 'Das Spiel findet an den Flügeln statt: mit …f5 am Königsflügel oder …c5/…b5 am Damenflügel.', sq: ['f4', 'f5'] },
];

export function detectStructure(fen) {
  const { w, b } = pawns(fen);
  return STRUCTS.find(s => { try { return s.test(w, b); } catch { return false; } }) || null;
}

// Notation einheitlich englisch (SAN wie auf chess.com: K Q R B N) – wie in allen anderen Texten der App
export const sanDE = san => san;

// Engine-Plan aus der Hauptvariante: welche Züge plant jede Seite?
export function enginePlan(fen, pv, my, nMine = 3, nOpp = 2) {
  const ch = new Chess(fen); const mine = [], opp = [], arrows = [];
  for (const u of (pv || []).slice(0, 10)) {
    let m; try { m = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    if (m.color === my && mine.length < nMine) { mine.push(sanDE(m.san)); arrows.push({ from: m.from, to: m.to, color: 'rgba(155,89,200,.85)' }); }
    else if (m.color !== my && opp.length < nOpp) { opp.push(sanDE(m.san)); arrows.push({ from: m.from, to: m.to, color: 'rgba(160,158,150,.75)' }); }
    if (mine.length >= nMine && opp.length >= nOpp) break;
  }
  return { mine, opp, arrows };
}
