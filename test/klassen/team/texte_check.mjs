#!/usr/bin/env node
// Prüfer-Hilfe: zählt typische Textprobleme in der JSON-Ausgabe von texte_dump.mjs (ändert keinen App-Code).
//   node test/klassen/team/texte_check.mjs <texte.json> [--beispiele 3]
import '../esm-shim.mjs';
import fs from 'node:fs';
const { Chess } = await import('../../../web/vendor/chess.js');
const file = process.argv[2], NB = +(process.argv[process.argv.indexOf('--beispiele') + 1] || 3);
const D = JSON.parse(fs.readFileSync(file, 'utf8'));
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const hits = {}; const add = (k, x, s) => { (hits[k] ||= []).push(`${x.id} ${x.zug} [${x.cls}] ${s}`); };
const sanMove = (fen, san) => { try { const c = new Chess(fen); const m = c.move(san); return { c, m }; } catch { return null; } };
const evNum = s => s.startsWith('M') ? 99 : s.startsWith('-M') ? -99 : parseFloat(s);
const own = s => !s.startsWith('[Eröffnung]');

for (const x of D) {
  const S = x.steps.filter(own); const first = S[0] || '';
  const all = S.join(' ');
  // 1 erste Zeile zu lang
  const w = first.split(/\s+/).length; if (w > 14) add('erste_zeile_lang', x, `(${w} W.) ${first}`);
  // 2 Bewertungspaar ohne Aussage (gleich oder < 0.2 Unterschied)
  for (const m of all.matchAll(/\(([-+]?M?\d+(?:\.\d+)?) statt ([-+]?M?\d+(?:\.\d+)?)\)/g)) {
    const a = m[1], b = m[2];
    if (a === b || (!a.includes('M') && !b.includes('M') && Math.abs(parseFloat(a) - parseFloat(b)) < 0.2)) add('bewertung_ohne_unterschied', x, m[0] + ' ← ' + S.find(s => s.includes(m[0])));
  }
  // 3 Gabel/Doppelangriff mit Bauer als Ziel
  for (const s of S) if (/Gabel|Doppelangriff/.test(s) && /(den Bauern auf [a-h][1-8](?: und| gleichzeitig| an)[^.]*(Gabel|Doppelangriff))|Gabel gegen [^.]*Bauer/.test(s)) add('gabel_mit_bauer', x, s);
  // 4 hypothetische Variante im Präsens („Du spielst X“), obwohl X nicht gespielt wurde
  for (const s of S) { const m = /^(?:.*Deine Chance: )?Du spielst ([^\s.]+?)[.\s–]/.exec(s); if (m) { add('praesens_variante', x, s); break; } }
  // 5 Fehler/Ungenau ohne Grund: „Stärker war X.“ und danach direkt „Du spielst X“
  if (/^(Ungenau\.|Fehler:|Patzer:|Chance verpasst\.) Stärker war [^ ]+( \([^)]*\))?\.$/.test(first)) add('fehler_ohne_grund', x, first + ' / ' + (S[1] || ''));
  // 6 widersprüchliche Materialangaben
  const amt = [...all.matchAll(/(?:verlierst|gewinnst|gewinnt) (?:du )?(etwa (eine Dame|einen Turm|eine Leichtfigur|zwei Bauern)|einen Bauern)/g)].map(m => m[1]);
  if (new Set(amt).size > 1) add('material_widerspruch', x, S.filter(s => /verlierst|gewinnst|gewinnt/.test(s)).join(' ‖ '));
  // 7 „gleichwertiger Tausch“, obwohl nicht zurückgeschlagen werden kann
  if (/gleichwertiger Tausch|mehr wert als die eigene Figur/.test(first)) {
    const r = sanMove(x.fen, x.zug.replace(/^\d+\.(\.\.)?/, ''));
    if (r) { const re = r.c.moves({ verbose: true }).some(y => y.to === r.m.to && y.captured); if (!re) add('tausch_aber_gratis', x, first); }
  }
  // 8 Gegner-Satz ohne Verb („Name: den Läufer schlagen“)
  if (/^\S+: (den|die) \S+ schlagen/.test(first) && !first.startsWith('Klar')) add('gegner_satz_ohne_verb', x, first);
  // 9 „ungedeckt“ bei gegenseitigem Angriff (Ziel kann den Angreifer schlagen)
  for (const s of S) {
    const m = /^(Du spielst|.* spielt|Der Zug|.*Der Zug) ?([^\s–]*)/.exec(s);
    if (/greift (den|die) \S+ auf ([a-h][1-8]) an, (der|die) ungedeckt ist/.test(s) && s === first) {
      const r = sanMove(x.fen, x.zug.replace(/^\d+\.(\.\.)?/, '')); const tsq = /auf ([a-h][1-8]) an, (der|die) ungedeckt/.exec(s)[1];
      if (r && r.c.moves({ verbose: true }).some(y => y.from === tsq && y.to === r.m.to)) add('ungedeckt_aber_gegenseitig', x, s);
    }
  }
  // 10 Gegnerfehler mit Matt, aber Text nennt kein Matt
  if (!x.mine && ['blunder', 'mistake', 'miss'].includes(x.cls) && /^M\d/.test(x.after.trim()) === false) {
    const ev = x.after.split(' ')[0]; const myW = x.zug.includes('...') ? 'w' : 'b'; // Spieler am Zug danach = ich
    if (/M\d/.test(ev) && !/[Mm]att/.test(all)) add('gegnerfehler_matt_verschwiegen', x, `${ev} ← ${first}`);
  }
  // 11 Matt in 1 verpasst, aber Lob
  if (x.mine && ['best', 'excellent', 'good'].includes(x.cls) && /setzt matt/.test(all) && /stärker/.test(all)) add('matt_verpasst_aber_lob', x, S.join(' / '));
  // 12 Merksatz „positionell“ obwohl Material gewinnbar war
  if (/Merksatz: Frag dich: Welche meiner Figuren/.test(all) && /So gewinnst du|gewinnt (etwa|einen)|schlägt (den|die)/.test(S.slice(0, 2).join(' '))) add('merksatz_passt_nicht', x, S[0]);
  // 13 „Deine Chance“ mit Königszug / erzwungener Antwort
  if (/Deine Chance: Du spielst K[a-h]/.test(first)) add('chance_koenigszug', x, first);
  // 14 „Viele hätten hier …“
  if (/Viele hätten hier/.test(all)) add('viele_haetten', x, S.find(s => /Viele/.test(s)));
  // 15 Patzer/Fehler-Kopf beginnt mit gegnerischem SAN ohne Subjekt
  if (/^(Patzer|Fehler): [KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]/.test(first)) add('kopf_ohne_subjekt', x, first);
  // 16 Brillant/Großartig für klare Schlagzüge (Dame/Turm schlagen)
  if (['great', 'brilliant'].includes(x.cls) && /schlägt (die Dame|den Turm)/.test(first)) add('grossartig_fuer_klaren_schlag', x, first);
  // 17 „starken Angriff und Initiative“ bei ausgeglichener/Endspiel-Lage
  if (/starken Angriff und Initiative/.test(all)) add('angriff_floskel', x, `${x.after.split(' ')[0]} | ${S[0]}`);
  // 18 Opfer, obwohl gleichwertig geschlagen wird
  if (/opfer/i.test(first) && x.sac) { const r = sanMove(x.fen, x.zug.replace(/^\d+\.(\.\.)?/, '')); if (r?.m.captured && VAL[r.m.captured] >= VAL[x.sac.piece] && x.sac.square === r.m.to) add('opfer_ist_tausch', x, first); }
  // 19 Eröffnungstext mit deutscher Notation neben englischer
  if (x.steps.some(s => s.startsWith('[Eröffnung]') && /\b[SLTD][a-h]?x?[a-h][1-8]/.test(s)) && S.some(s => /\b[NBRQ]x?[a-h][1-8]/.test(s))) add('notation_gemischt', x, '');
  // 20 coachText duzt bei Gegnerzug
  if (!x.mine && /\b(du|hättest du|lässt du|hast du)\b/.test(x.coach)) add('coach_du_bei_gegner', x, x.coach);
  // 21 Gegner-Variante mit Bewertung aus meiner Sicht („Für X noch etwas stärker … (a statt b)“)
  if (/^Für \S+ noch etwas stärker/.test(S[1] || '') || /Naheliegend wäre .* Gewinnchance gekostet/.test(all)) add('gegner_bewertung_perspektive', x, S.find(s => /Für \S+ noch|Naheliegend/.test(s)));
  // 22 Brillant-Text „geht schief“ und danach schlägt der Gegner doch
  if (/geht schief/.test(all)) { const m = /\(([^)]+)\) geht schief/.exec(all); if (m && S.slice(1).some(s => s.includes(' spielt ' + m[1].replace(/[+#]/g, '')))) add('geht_schief_aber_nimmt', x, S.slice(0, 3).join(' / ')); }
  // 23 Floskeln
  if (/Alles im grünen Bereich/.test(all)) add('floskel_gruener_bereich', x, first);
  // 24 Wiederholung gleicher Satz in einem Text
  const seen = new Set(); for (const s of S) { if (seen.has(s)) { add('satz_doppelt', x, s); break; } seen.add(s); }
}
// Eröffnungstext-Wiederholungen je Partie
const rep = {}; for (const x of D) for (const s of x.steps) if (s.startsWith('[Eröffnung]')) { const k = x.id + '|' + s.split(':')[0]; rep[k] = (rep[k] || 0) + 1; }
const repN = Object.values(rep).filter(n => n >= 4).length;
console.log(`Texte gesamt: ${D.length} Züge, ${D.reduce((a, x) => a + x.steps.length, 0)} Schritte, Partien ${new Set(D.map(x => x.id)).size}`);
console.log(`Eröffnungstext ≥4× gleich in einer Partie: ${repN} Fälle`);
for (const [k, v] of Object.entries(hits).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${k}: ${v.length}`); v.slice(0, NB).forEach(s => console.log('  ' + s));
}
