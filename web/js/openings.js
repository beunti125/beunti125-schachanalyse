// Eröffnungspläne: Idee der Eröffnung, Pläne beider Seiten und wohin die Figuren wollen
import { Chess } from '../vendor/chess.js';
import { BOOK } from '../vendor/book.js';
import { detectStructure, enginePlan } from './structure.js';

const key = fen => fen.split(' ').slice(0, 4).join(' ');
// go: [Figur, Zielfeld]  (P = Bauer, K auf g1/g8 = kurze Rochade)
const PLANS = [
  { m: /Ruy Lopez/, t: 'Spanische Partie',
    idea: 'Weiß greift mit Bb5 den Springer c6 an – den Verteidiger von e5. Es geht um langfristigen Druck auf das schwarze Zentrum.',
    w: 'Rochieren, mit c3 und d4 das Zentrum ausbauen, Turm nach e1. Der Springer wandert oft über d2–f1 nach g3.',
    b: '…a6 und …b5 vertreiben den Läufer, …Nf6 und …Be7 entwickeln, Gegenspiel mit …d5 oder am Damenflügel mit …c5.',
    wGo: [['B', 'b5'], ['K', 'g1'], ['P', 'c3'], ['R', 'e1']], bGo: [['P', 'a6'], ['N', 'f6'], ['B', 'e7'], ['K', 'g8']] },
  { m: /Italian Game|Two Knights|Giuoco|Evans/, t: 'Italienische Partie',
    idea: 'Der Läufer auf c4 zielt auf f7 – den schwächsten Punkt neben dem schwarzen König. Beide Seiten entwickeln schnell und kämpfen um d4 und d5.',
    w: 'Rochieren, mit c3 den Vorstoß d4 vorbereiten, Turm nach e1. Ruhige Variante: d3, Nbd2–f1–g3 und langsamer Königsangriff.',
    b: 'Bc5 oder Be7, …Nf6 greift e4 an, …d6 und rochieren. Befreiend ist oft …d5 im richtigen Moment.',
    wGo: [['B', 'c4'], ['K', 'g1'], ['P', 'c3'], ['R', 'e1']], bGo: [['B', 'c5'], ['N', 'f6'], ['P', 'd6'], ['K', 'g8']] },
  { m: /Scotch/, t: 'Schottische Partie',
    idea: 'Weiß öffnet mit d4 sofort das Zentrum und bekommt freies Figurenspiel.',
    w: 'Nach Nxd4 schnell Nc3, Bc4 oder Bd3 und rochieren. Druck über die halboffene e-Linie.',
    b: 'Aktiv mit …Bc5 oder …Nf6 gegen e4 spielen, rochieren und mit …d5 befreien.',
    wGo: [['N', 'c3'], ['B', 'd3'], ['K', 'g1']], bGo: [['B', 'c5'], ['N', 'f6'], ['K', 'g8'], ['P', 'd5']] },
  { m: /Petrov|Russian/, t: 'Russische Verteidigung',
    idea: 'Schwarz greift sofort e4 an statt e5 zu decken. Sehr solide, oft symmetrisch.',
    w: 'Nach d4 und Bd3 schnell rochieren, mit c4 den Springer auf e4 unter Druck setzen, Turm nach e1.',
    b: 'Den Springer auf e4 mit …d5 stützen, …Bd6 oder …Be7, rochieren.',
    wGo: [['P', 'd4'], ['B', 'd3'], ['K', 'g1'], ['P', 'c4']], bGo: [['P', 'd5'], ['B', 'd6'], ['K', 'g8']] },
  { m: /Four Knights|Three Knights/, t: 'Vierspringerspiel',
    idea: 'Beide Seiten entwickeln zuerst die Springer – klassisch und solide.',
    w: 'Bb5 (Spanisch mit Springern) oder d4, rochieren, Turm e1.',
    b: 'Spiegelbildlich entwickeln: …Bb4 oder …Bc5, rochieren, …d6.',
    wGo: [['B', 'b5'], ['K', 'g1'], ['P', 'd3']], bGo: [['B', 'b4'], ['K', 'g8'], ['P', 'd6']] },
  { m: /King's Gambit/, t: 'Königsgambit',
    idea: 'Weiß opfert den f-Bauern für ein starkes Zentrum und die offene f-Linie – scharf und auf Angriff gegen f7 ausgelegt.',
    w: 'd4 für das Zentrum, Bc4 gegen f7, schnell rochieren und den Turm auf der f-Linie nutzen.',
    b: 'Entweder den Bauern mit …g5 halten oder mit …d5 sofort zurückschlagen und schnell entwickeln.',
    wGo: [['P', 'd4'], ['B', 'c4'], ['N', 'f3'], ['K', 'g1']], bGo: [['P', 'd5'], ['N', 'f6'], ['B', 'd6']] },
  { m: /Vienna/, t: 'Wiener Partie',
    idea: 'Nc3 deckt e4 und bereitet den Vorstoß f4 vor – eine Art Königsgambit mit mehr Vorbereitung.',
    w: 'f4 im richtigen Moment, Bc4 gegen f7, Nf3, rochieren.',
    b: '…Nf6 und …d5 schlagen im Zentrum zurück, …Bc5 oder …Bb4 entwickeln.',
    wGo: [['P', 'f4'], ['B', 'c4'], ['N', 'f3']], bGo: [['N', 'f6'], ['P', 'd5'], ['B', 'c5']] },
  { m: /Bishop's Opening/, t: 'Läuferspiel',
    idea: 'Weiß stellt sofort den Läufer auf c4 gegen f7 und hält sich offen, ob d4 oder f4 kommt.',
    w: 'Nf3 oder Nc3, d3, rochieren – oft ein Übergang ins Italienische.',
    b: '…Nf6 greift e4 an, …Bc5, …d6, rochieren.',
    wGo: [['N', 'f3'], ['P', 'd3'], ['K', 'g1']], bGo: [['N', 'f6'], ['B', 'c5'], ['K', 'g8']] },
  { m: /Philidor/, t: 'Philidor-Verteidigung',
    idea: 'Schwarz deckt e5 mit …d6 – sehr solide, aber etwas passiv.',
    w: 'd4, Nc3, Bc4, rochieren: viel Raum und schnelle Entwicklung.',
    b: '…Nf6, …Be7, …Nbd7 und rochieren, die e5-Stellung halten.',
    wGo: [['P', 'd4'], ['N', 'c3'], ['B', 'c4'], ['K', 'g1']], bGo: [['N', 'f6'], ['B', 'e7'], ['N', 'd7'], ['K', 'g8']] },
  { m: /Sicilian.*Alapin/, t: 'Sizilianisch – Alapin',
    idea: 'Weiß spielt c3, um mit d4 ein klassisches Bauernzentrum aufzubauen, statt in die offenen Hauptvarianten zu gehen.',
    w: 'd4 durchsetzen, Nf3, Bd3 oder Bc4, rochieren.',
    b: 'Sofort im Zentrum zurückschlagen: …d5 oder …Nf6 gegen e4.',
    wGo: [['P', 'd4'], ['N', 'f3'], ['B', 'd3'], ['K', 'g1']], bGo: [['P', 'd5'], ['N', 'f6'], ['P', 'e6']] },
  { m: /Sicilian.*Dragon/, t: 'Sizilianisch – Drachen',
    idea: 'Schwarz fianchettiert den Läufer nach g7 – er wirkt wie ein Drachen über die lange Diagonale bis b2.',
    w: 'Be3, Qd2, f3, lange Rochade und Bauernsturm h4–h5, um den Läufer g7 abzutauschen.',
    b: '…Bg7, rochieren, …Nc6, Druck über die c-Linie mit …Rc8 und Gegenangriff am Damenflügel.',
    wGo: [['B', 'e3'], ['Q', 'd2'], ['P', 'f3'], ['P', 'h4']], bGo: [['B', 'g7'], ['K', 'g8'], ['N', 'c6'], ['R', 'c8']] },
  { m: /Sicilian/, t: 'Sizilianische Verteidigung',
    idea: 'Schwarz kämpft mit …c5 um d4, statt e4 symmetrisch zu beantworten. Die Stellung wird unausgeglichen: Weiß greift meist am Königsflügel an, Schwarz am Damenflügel.',
    w: 'd4 und Nxd4, schnelle Entwicklung mit Nc3, Be2 oder Be3, rochieren, später f4 oder f3 mit g4 für Königsangriff. Feld d5 ist ein Traumfeld für einen Springer.',
    b: 'Die halboffene c-Linie nutzen, …d6, …Nf6, …a6 und …b5 für Raum am Damenflügel, rochieren.',
    wGo: [['P', 'd4'], ['N', 'c3'], ['B', 'e2'], ['K', 'g1']], bGo: [['P', 'd6'], ['N', 'f6'], ['P', 'a6'], ['B', 'e7']], sq: ['d5'] },
  { m: /French/, t: 'Französische Verteidigung',
    idea: 'Schwarz baut mit …e6 und …d5 eine feste Bauernkette. Weiß bekommt Raum mit e5, Schwarz greift die weiße Kette an ihrer Basis an.',
    w: 'Mit e5 Raum am Königsflügel nehmen, Nf3, Bd3 und Angriff auf den schwarzen König (f4, Qg4).',
    b: 'Die Kette mit …c5 (gegen d4) und …f6 (gegen e5) angreifen, …Nc6 und …Qb6 gegen d4. Sorgenkind: der Läufer c8 – oft über …b6 und …Ba6 tauschen.',
    wGo: [['P', 'e5'], ['N', 'f3'], ['B', 'd3'], ['P', 'f4']], bGo: [['P', 'c5'], ['N', 'c6'], ['Q', 'b6'], ['P', 'f6']], sq: ['d4'] },
  { m: /Caro-Kann/, t: 'Caro-Kann-Verteidigung',
    idea: 'Schwarz stützt …d5 mit …c6 und kann – anders als im Französischen – den Läufer c8 vor der Bauernkette entwickeln.',
    w: 'Raum mit e5 (Vorstoßvariante) und Angriff mit h4–g4 gegen den Läufer f5, oder ruhig Nc3, Nf3, Bd3.',
    b: 'Zuerst …Bf5 oder …Bg4, dann …e6, …Nd7, …Ngf6, …Be7 und rochieren. Später …c5 gegen das Zentrum.',
    wGo: [['N', 'c3'], ['N', 'f3'], ['B', 'd3'], ['K', 'g1']], bGo: [['B', 'f5'], ['P', 'e6'], ['N', 'd7'], ['N', 'f6']] },
  { m: /Scandinavian/, t: 'Skandinavische Verteidigung',
    idea: 'Schwarz greift sofort mit …d5 an. Nach …Qxd5 steht die Dame früh draußen, Weiß gewinnt mit Nc3 ein Tempo.',
    w: 'Nc3 mit Tempo gegen die Dame, d4, Nf3, Bc4 oder Bd3, rochieren – Entwicklungsvorsprung nutzen.',
    b: 'Dame auf a5 oder d6 parken, schnell …Nf6, …Bf5 oder …Bg4, …c6 und …e6.',
    wGo: [['N', 'c3'], ['P', 'd4'], ['N', 'f3'], ['B', 'c4']], bGo: [['Q', 'a5'], ['N', 'f6'], ['B', 'f5'], ['P', 'c6']] },
  { m: /Pirc|Modern Defense/, t: 'Pirc/Moderne Verteidigung',
    idea: 'Schwarz überlässt Weiß zunächst das Zentrum, stellt den Läufer nach g7 und greift das Zentrum später mit …e5 oder …c5 an.',
    w: 'Großes Zentrum mit e4 und d4, dann f4 (Österreichischer Angriff) oder Be3, Qd2 und Angriff mit h4.',
    b: '…Bg7, …Nf6, rochieren, dann im richtigen Moment …e5 oder …c5.',
    wGo: [['N', 'c3'], ['B', 'e3'], ['Q', 'd2'], ['P', 'f4']], bGo: [['B', 'g7'], ['N', 'f6'], ['K', 'g8'], ['P', 'e5']] },
  { m: /Alekhine/, t: 'Aljechin-Verteidigung',
    idea: 'Schwarz lockt die weißen Bauern mit dem Springer nach vorne, um sie später als Angriffsziele zu nutzen.',
    w: 'Raum nehmen mit e5, d4, c4 – aber das große Zentrum muss gut gedeckt bleiben.',
    b: '…d6 greift e5 an, …Bg4 oder …Bf5, …e6 und Druck auf das Zentrum.',
    wGo: [['P', 'd4'], ['P', 'c4'], ['N', 'f3']], bGo: [['P', 'd6'], ['B', 'g4'], ['P', 'e6']] },
  { m: /Queen's Gambit Accepted/, t: 'Angenommenes Damengambit',
    idea: 'Schwarz nimmt den c-Bauern, gibt dafür vorübergehend das Zentrum auf. Weiß holt den Bauern meist mit e3 und Bxc4 zurück.',
    w: 'e3 und Bxc4, Nf3, rochieren, später e4 für ein großes Zentrum.',
    b: 'Den Bauern nicht festhalten, sondern mit …Nf6, …e6 und …c5 das Zentrum angreifen.',
    wGo: [['P', 'e3'], ['B', 'c4'], ['N', 'f3'], ['K', 'g1']], bGo: [['N', 'f6'], ['P', 'e6'], ['P', 'c5']] },
  { m: /Slav/, t: 'Slawische Verteidigung',
    idea: 'Schwarz stützt d5 mit …c6. Der Läufer c8 bleibt frei und kommt oft nach f5 oder g4.',
    w: 'Nc3, Nf3, e3 und Druck auf d5, oft a4 gegen …b5.',
    b: '…Nf6, …Bf5, …e6, …Nbd7, rochieren – solide und ohne „schlechten“ Läufer.',
    wGo: [['N', 'c3'], ['N', 'f3'], ['P', 'e3']], bGo: [['N', 'f6'], ['B', 'f5'], ['P', 'e6'], ['N', 'd7']] },
  { m: /Queen's Gambit|Tarrasch|Semi-Slav|Tartakower|Orthodox/, t: 'Damengambit',
    idea: 'Weiß greift mit c4 den Bauern d5 an, um das Zentrum zu gewinnen. Schwarz hält d5 meist mit …e6.',
    w: 'Nc3, Bg5 (fesselt den Springer f6), e3, Nf3, rochieren. Typisch: Minoritätsangriff b4–b5 am Damenflügel.',
    b: '…Nf6, …Be7, rochieren, …Nbd7, Befreiung mit …c5 oder …e5. Sorgenkind ist der Läufer c8 – oft über …b6 und …Bb7.',
    wGo: [['N', 'c3'], ['B', 'g5'], ['P', 'e3'], ['N', 'f3']], bGo: [['N', 'f6'], ['B', 'e7'], ['K', 'g8'], ['N', 'd7']], sq: ['d5'] },
  { m: /London System/, t: 'London-System',
    idea: 'Ein fester Aufbau, der fast gegen alles funktioniert: d4, Bf4, e3, c3, Bd3, Nbd2.',
    w: 'Der Aufbau steht schnell; danach Ne5 und Königsangriff, oft mit Qh5 oder g4.',
    b: 'Mit …c5 und …Qb6 auf b2 drücken, …Nc6 – oder den Läufer f4 mit …Bd6 abtauschen.',
    wGo: [['B', 'f4'], ['P', 'e3'], ['P', 'c3'], ['B', 'd3'], ['N', 'd2']], bGo: [['P', 'c5'], ['N', 'c6'], ['Q', 'b6'], ['B', 'd6']] },
  { m: /King's Indian Attack/, t: 'Königsindischer Angriff',
    idea: 'Weiß spielt einen festen Aufbau mit Nf3, g3, Bg2, rochieren, d3 und später e4.',
    w: 'Nach dem Aufbau e4–e5 und Angriff am Königsflügel mit Nh2/f4 oder h4.',
    b: 'Das Zentrum mit …d5 und …c5 besetzen und am Damenflügel spielen.',
    wGo: [['P', 'g3'], ['B', 'g2'], ['K', 'g1'], ['P', 'e4']], bGo: [['P', 'd5'], ['P', 'c5'], ['N', 'c6']] },
  { m: /King's Indian/, t: 'Königsindische Verteidigung',
    idea: 'Schwarz überlässt Weiß das Zentrum, fianchettiert …Bg7 und schlägt mit …e5 zurück. Danach greift Weiß am Damenflügel an, Schwarz am Königsflügel.',
    w: 'Großes Zentrum mit c4, d4, e4, Nc3, Nf3, Be2, rochieren – dann Vorstoß c5 und b4.',
    b: '…Bg7, rochieren, …d6, …e5 – und später Königsangriff mit …f5.',
    wGo: [['P', 'e4'], ['N', 'c3'], ['B', 'e2'], ['K', 'g1']], bGo: [['B', 'g7'], ['K', 'g8'], ['P', 'd6'], ['P', 'e5']] },
  { m: /Nimzo-Indian/, t: 'Nimzowitsch-Indisch',
    idea: 'Schwarz fesselt mit …Bb4 den Springer c3 und kämpft so um das Feld e4. Oft gibt Schwarz den Läufer für den Springer und Weiß bekommt Doppelbauern.',
    w: 'e3, Bd3, Nf3, rochieren – oder Qc2, um Doppelbauern zu vermeiden. Das Läuferpaar ist langfristig ein Trumpf.',
    b: '…Bb4, rochieren, …b6 und …Bb7 für die hellen Felder, …c5 und …d5.',
    wGo: [['P', 'e3'], ['B', 'd3'], ['N', 'f3'], ['K', 'g1']], bGo: [['B', 'b4'], ['K', 'g8'], ['P', 'b6'], ['B', 'b7']], sq: ['e4'] },
  { m: /Queen's Indian/, t: 'Damenindisch',
    idea: 'Schwarz kontrolliert mit …b6 und …Bb7 das Feld e4 von der Seite.',
    w: 'g3 und Bg2 gegen den Läufer b7, Nc3, rochieren, d5 vorbereiten.',
    b: '…Bb7, …Be7, rochieren, …d5 oder …c5 im richtigen Moment.',
    wGo: [['P', 'g3'], ['B', 'g2'], ['N', 'c3'], ['K', 'g1']], bGo: [['P', 'b6'], ['B', 'b7'], ['B', 'e7'], ['K', 'g8']], sq: ['e4'] },
  { m: /Grünfeld|Grunfeld/, t: 'Grünfeld-Indisch',
    idea: 'Schwarz lässt Weiß ein großes Bauernzentrum bauen – um es danach mit Figuren zu attackieren.',
    w: 'Großes Zentrum mit e4 und d4, Bc4, Ne2, rochieren und das Zentrum halten.',
    b: '…Bg7 auf der langen Diagonale, …c5 und …Nc6 gegen d4, rochieren.',
    wGo: [['P', 'e4'], ['B', 'c4'], ['N', 'e2'], ['K', 'g1']], bGo: [['B', 'g7'], ['P', 'c5'], ['N', 'c6'], ['K', 'g8']], sq: ['d4'] },
  { m: /Catalan/, t: 'Katalanisch',
    idea: 'Weiß fianchettiert nach g2 – der Läufer drückt über die lange Diagonale auf d5 und b7.',
    w: 'g3, Bg2, rochieren, Qc2, Druck auf den schwarzen Damenflügel.',
    b: '…dxc4 und den Bauern zeitweise halten, oder solide …Be7, …c6, …Nbd7.',
    wGo: [['P', 'g3'], ['B', 'g2'], ['K', 'g1'], ['Q', 'c2']], bGo: [['B', 'e7'], ['K', 'g8'], ['P', 'c6']] },
  { m: /Dutch/, t: 'Holländische Verteidigung',
    idea: 'Schwarz kontrolliert mit …f5 das Feld e4 und plant Angriff am Königsflügel.',
    w: 'g3, Bg2, Nf3, rochieren, c4 – später e4 durchsetzen.',
    b: '…Nf6, …e6, …Be7 oder Stonewall mit …d5 und Springer auf e4, Angriff mit …Qe8–h5.',
    wGo: [['P', 'g3'], ['B', 'g2'], ['N', 'f3'], ['K', 'g1']], bGo: [['N', 'f6'], ['P', 'e6'], ['B', 'e7'], ['K', 'g8']], sq: ['e4'] },
  { m: /Benoni|Benko/, t: 'Benoni/Benkö',
    idea: 'Schwarz greift mit …c5 sofort d4 an. Es entsteht ein Kampf zwischen dem weißen Zentrum und der schwarzen Bauernmehrheit am Damenflügel.',
    w: 'd5 vorstoßen, Nc3, e4, Raum am Zentrum und Königsflügel.',
    b: '…e6 oder …b5 (Benkö-Gambit), …Bg7, Druck über die halboffenen Linien am Damenflügel.',
    wGo: [['P', 'd5'], ['N', 'c3'], ['P', 'e4']], bGo: [['B', 'g7'], ['P', 'b5'], ['K', 'g8']] },
  { m: /English/, t: 'Englische Eröffnung',
    idea: 'Weiß kontrolliert mit c4 das Feld d5 von der Seite und spielt oft mit Fianchetto g3/Bg2.',
    w: 'Nc3, g3, Bg2, rochieren – Druck über die lange Diagonale und Damenflügelspiel mit b4.',
    b: 'Zentrum mit …e5 oder …c5 besetzen, …Nc6, …Nf6.',
    wGo: [['N', 'c3'], ['P', 'g3'], ['B', 'g2'], ['K', 'g1']], bGo: [['P', 'e5'], ['N', 'c6'], ['N', 'f6']], sq: ['d5'] },
  { m: /Zukertort|Réti|Reti/, t: 'Réti-Eröffnung',
    idea: 'Weiß beginnt flexibel mit Nf3 und entscheidet erst später, wie das Zentrum aussehen soll.',
    w: 'g3, Bg2, rochieren, c4 gegen d5.',
    b: 'Das Zentrum mit …d5 besetzen, …Nf6, …e6 oder …c6.',
    wGo: [['P', 'g3'], ['B', 'g2'], ['K', 'g1'], ['P', 'c4']], bGo: [['P', 'd5'], ['N', 'f6'], ['P', 'e6']] },
];

function findPiece(ch, color, type, to) {
  const F = 'abcdefgh', fx = s => F.indexOf(s[0]), fy = s => +s[1];
  const cands = ch.board().flat().filter(p => p && p.color === color && p.type === type.toLowerCase());
  if (!cands.length || cands.some(p => p.square === to)) return null;
  if (type === 'P') { const c = cands.filter(p => p.square[0] === to[0] && (color === 'w' ? fy(p.square) < fy(to) : fy(p.square) > fy(to))); return c[0]?.square || null; }
  if (type === 'K') { const k = cands[0]; return (k.square === (color === 'w' ? 'e1' : 'e8')) ? k.square : null; }
  cands.sort((a, b) => Math.max(Math.abs(fx(a.square) - fx(to)), Math.abs(fy(a.square) - fy(to))) - Math.max(Math.abs(fx(b.square) - fx(to)), Math.abs(fy(b.square) - fy(to))));
  return cands[0].square;
}
function arrowsFor(ch, color, goals, col, n = 3) {
  const out = [];
  for (const [t, to] of goals) {
    const own = ch.get(to); if (own && own.color === color) continue;
    const from = findPiece(ch, color, t, to); if (!from) continue;
    out.push({ from, to, color: col });
    if (out.length >= n) break;
  }
  return out;
}
// Allgemeine Eröffnungsgrundsätze, wenn keine bekannte Eröffnung erkannt wird
const GENERIC = { w: [['N', 'f3'], ['N', 'c3'], ['B', 'c4'], ['K', 'g1']], b: [['N', 'f6'], ['N', 'c6'], ['B', 'e7'], ['K', 'g8']] };

const PURPLE = 'rgba(155,89,200,.85)', GREY = 'rgba(160,158,150,.75)';
// Plan-Schritt: Eröffnungsidee (bis Zug 10) + erkannte Bauernstruktur + konkreter Engine-Plan
// once: Eröffnungsidee nur einmal pro Partie zeigen (false = an dieser Stelle nicht); Strukturwechsel immer
export function planStep(fens, ply, my, pv, once = true) {
  const fen = fens[ply], op = my === 'w' ? 'b' : 'w';
  const st = detectStructure(fen), prevSt = ply > 0 ? detectStructure(fens[ply - 1]) : null;
  const opening = ply <= 20 && once;
  const newStruct = st && (!prevSt || prevSt.id !== st.id);
  if (!opening && !(newStruct && ply <= 60)) return null;
  let name = null;
  if (opening) for (let k = Math.min(ply, fens.length - 1); k >= 0 && !name; k--) name = BOOK[key(fens[k])] || null;
  const plan = name && PLANS.find(p => p.m.test(name));
  const ep = enginePlan(fen, pv, my);
  let arrows = ep.arrows;
  if (!arrows.length) {
    const ch = new Chess(fen);
    arrows = plan ? [...arrowsFor(ch, my, plan[my + 'Go'], PURPLE), ...arrowsFor(ch, op, plan[op + 'Go'], GREY, 2)] : [...arrowsFor(ch, my, GENERIC[my], PURPLE), ...arrowsFor(ch, op, GENERIC[op], GREY, 2)];
  }
  const sq = [...(st?.sq || []), ...(plan?.sq || [])];
  const marks = Object.fromEntries(sq.map(s => [s, 'plan']));
  const fs = t => (t || '').split(/(?<=[.!?])\s/)[0];
  let text = '';
  if (plan) text += `${plan.t}: ${fs(plan.idea)} `;
  else if (opening && name) text += `${name.slice(4)}. `;
  if (st) text += `${st.name}: ${fs(st[my])} `;
  else if (plan) text += `Plan: ${fs(plan[my])} `;
  else if (opening) text += 'Zentrum, Springer vor Läufern, früh rochieren. ';
  if (ep.mine.length) text += `Nächste Züge (lila): ${ep.mine.join(', ')}.`;
  return { fen, arrows, marks, text: text.trim() };
}
export const openingStep = (fens, ply, my, pv, once) => planStep(fens, ply, my, pv, once);
