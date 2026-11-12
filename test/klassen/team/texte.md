# Prüfung der Erklärtexte – echte Partien MertAbi69

Rolle: Text-Prüfer (Schachtrainer + Deutschlektor). Kein App-Code geändert.

**Umfang:** 30 der 70 Partien aus `echte_partien.jsonl` (die ersten 30, Elo 586–1250, 60 s bis 10 min), 1699 Halbzüge, **3800 Textschritte**, alles aus Sicht MertAbi69 (wie `app.js`: `explain(…, {my, hist, elo})` + `openingStep` + `coachText`). Engine: nativer Stockfish, Tiefe 16, MultiPV 2 (gemeinsamer Cache).

Werkzeuge (nur Test, `test/klassen/team/`):
- `texte_dump.mjs --n 30 --json out.json` → alle Texte jeder Partie mit Engine-Linien
- `texte_check.mjs out.json` → zählt die Problemmuster unten automatisch (Schachprüfung mit chess.js)
- `faelle_texte.json` → 25 Prüffälle im Format von `faelle.json`; **alle 25 scheitern mit der aktuellen App** und sollen nach den Korrekturen bestehen. Prüfen: `run.mjs` mit `faelle_texte.json` statt `faelle.json` (z. B. Kopie mit geändertem Pfad).

Zeilenangaben beziehen sich auf `web/js/explain.js` (330 Zeilen, Stand dieser Prüfung).

---

## Befunde, sortiert nach Häufigkeit (Anzahl betroffener Züge in 30 Partien)

| # | Problem | Anzahl | Ursache |
|---|---|---|---|
| 1 | Engine-Variante im Präsens („Du spielst X“), obwohl X nie gespielt wurde | 247 | `sent()`/`who()` Z. 80, 107; `playLine` Z. 109–120; Gegnerfehler-Intro Z. 272–274 |
| 2 | Erste Zeile zu lang (> 14 Wörter), Aufzählung aus `describe` | 242 | `describe` Z. 25–39 hängt alles mit Kommas an; Kopfzeilen Z. 176, 192, 272 |
| 3 | Bewertung bei Gegner-Alternativen aus *deiner* Sicht, liest sich verdreht | 239 | Z. 195 (`myEv(best)` / `evA` im Gegnerzweig), Z. 181 (Großartig) |
| 4 | Floskel „Alles im grünen Bereich“ bei jedem Theoriezug, englische Eröffnungsnamen | 134 (+293 engl. Namen) | Z. 144; Namen aus `vendor/book.js` |
| 5 | Notation gemischt: `explain` englisch (Nc3, Bxd1), Eröffnungstext deutsch (Sc3, Lb5) | 112 | `san` aus chess.js (Z. 23, 262, 267) vs. `openings.js` `planStep` Z. 211–215 |
| 6 | Bewertungspaar ohne Aussage: „(M1 statt M1)“, „(+0.0 statt +0.0)“, Unterschied < 0,2 | 89 | Z. 195, 181 |
| 7 | Fehler/Ungenau ohne Grund: „Stärker war X.“ + direkt „Du spielst X.“ – was am eigenen Zug schlecht ist, fehlt | 89 (davon **34 von 68** eigenen Fehlern/Patzern = 50 %) | Generic-Zweig Z. 234 + `playLine` Z. 241; `lossA`-Schwelle Z. 217 (≤ −2) |
| 8 | „Gabel“/„Doppelangriff“ mit Bauer als Ziel (oder Angreifer wird sofort geschlagen) | 88 | `describe` Z. 35 (`!defended` nimmt Bauern auf), Z. 37–38; `short` Z. 49 |
| 9 | Wiederholung: Eröffnungstext bei jedem Zug bis Zug 10 gleich (30 von 30 Partien); „Und das ist kein Einzelfall …“ bei 160 Zügen | 30 Partien / 160 | `openings.js` Z. 193–196; `personal()` Z. 136 |
| 10 | Gegner-Satz ohne Verb: „Halbnull: den Läufer schlagen, gleichwertiger Tausch.“ | 64 | Z. 187 |
| 11 | „…, der ungedeckt ist“, obwohl das Ziel den Angreifer selbst schlagen kann bzw. eine Dame angegriffen wird (Deckung irrelevant) | 41 | `describe` Z. 39 |
| 12 | `coachText` duzt bei Gegnerzügen („Damit lässt du Matt in 3 zu“) | 41 | `analysis.js` Z. 445–450 (nur Test, in `app.js` derzeit nicht benutzt) |
| 13 | „gleichwertiger Tausch“ / „mehr wert als die eigene Figur“, obwohl gratis (kein Rückschlag möglich) | 26 | Z. 187 (prüft nur Figurenwerte) |
| 14 | Patzer-Kopf ohne Subjekt: „Patzer: Bxd1 – schlägt die Dame.“ (liest sich wie dein Zug), Figur fehlt | 23 | Z. 218 |
| 15 | „Deine Chance: Du spielst Kd1.“ – leere/erzwungene Antwort als Chance, danach „stark reagiert!“ | 19 (6 Königszüge) | Z. 272–281 (`hit` Z. 279) |
| 16 | Materialangaben widersprechen sich (Zeile 1 vs. „Unterm Strich“/„So gewinnst du“) oder rechnen alten Verlust dem neuen Zug an | 12 (+ Fälle „schon vorher verloren“) | `lossA` Z. 207 (Basis = Stellung vorher, 4 Halbzüge), `gainB` Z. 208 (5 Halbzüge) vs. `outcome` nach 2–4 Halbzügen Z. 241–249 |
| 17 | Matt in 1 verpasst, Text lobt („Exzellent – fast perfekt“, „Solide.“) | 12 (eine Partie, 11× hintereinander Ta7# übersehen) | Z. 188–196 – kein Mattcheck im Lob-Zweig |
| 18 | „Ungenau.“ + „Taktik übersehen … gewinnt etwa einen Turm“ / Doppelkopf „Fehler: Taktik übersehen:“ | 10 / 6 | Z. 200, 220 |
| 19 | „Viele hätten hier X gespielt“ – unbelegte Behauptung, X oft nicht naheliegend | 7 | Z. 181 |
| 20 | Merksatz passt nicht zur Fehlerart (positioneller Merksatz bei Gratisbauer) bzw. hängt an fremdem Schritt (humanAlt) | 6 | Z. 268 (+ `err`-Einstufung in analysis.js) |
| 21 | Großartig/Brillant-Text für klare Schlagzüge (Dame/Turm nehmen, Damentausch) | 6 | Reihenfolge Z. 174 vor Z. 185 (`obvious` wird bei `great` nie erreicht) |
| 22 | Gegnerpatzer mit Matt – Text nennt das Matt nicht | 5 | Z. 272–274 |
| 23 | Brillant: „Dafür gibt es starken Angriff und Initiative“ als Standard, auch bei 0.00 oder im Bauernendspiel | 4 von 5 Brillant-Texten | Z. 168 |
| 24 | „opfert den Turm“, obwohl Turm gegen Turm geschlagen wird | 2 | Klasse (analysis.js `sac`); Text Z. 155 prüft `m.captured` nicht |
| 25 | „Den Springer zu nehmen (Kxg5) geht schief“ – zwei Schritte später nimmt er doch | 1 | Z. 163–165 + `playLine` Z. 173 |
| – | Dezimalpunkt statt Komma in Bewertungen („+0.3“) | 489 | `fmtEval` (analysis.js) |

---

## Einzelbefunde mit Beispiel, besserem Text und Ursache

### 1. Präsens für hypothetische Züge (247)
- **187054798396, 11.g3 (Gegner ungenau):** „Halbnull spielt ungenau. Du spielst Rf7.“ – gespielt hat MertAbi69 11…Df6.
- **Besser:** „Halbnull spielt ungenau. Besser für dich jetzt: …Tf7.“ Varianten im Konjunktiv: „Dann ginge es weiter mit …“, „Halbnull würde … spielen“.
- **Ursache:** `who()` Z. 107 → `sent()` Z. 80 erzeugt in allen Varianten „Du spielst“ / „X spielt“. `playLine` braucht einen Modus `hypo`, der „würdest du … spielen“ / „Nach … folgt …“ erzeugt.

### 2. Erste Zeile zu lang (242)
- **187054798396, 33…Txc4 (bester Zug):** „Sauber gespielt – der beste Zug. Der Zug schlägt den Bauern auf c4, greift den Bauern auf e4 an, der ungedeckt ist.“ (22 Wörter)
- **Besser:** „Bester Zug – Txc4 holt den Bauern.“ (Details aufklappbar.)
- **Ursache:** Kopfzeile + komplettes `describe().text` in einem Schritt (Z. 176, 192, 272). Regel: Zeile 1 = Kopf + `short()` (max. 1 Merkmal); `describe().text` nur in Schritt 2.

### 3. Bewertung in Gegner-Alternativen verdreht (239)
- **187054798396, 4.Lc4 (Gegner):** „Für Halbnull noch etwas stärker wäre d4 gewesen (-0.8 statt -0.3).“ – „stärker“, aber die Zahl sinkt.
- **186000059536, 19…Txd1 (Gegner, Großartig):** „Naheliegend wäre e5 gewesen – das hätte etwa 36 % Gewinnchance gekostet (+4.1 statt -0.4).“
- **Besser:** Bei Gegnerzügen mit `good/excellent` gar keinen Alternativschritt zeigen (für 600–1200 Elo nutzlos). Sonst Zahlen aus Gegnersicht: „Für Halbnull wäre d4 etwas besser gewesen.“ ohne Klammer.
- **Ursache:** Z. 195 und Z. 181 verwenden `myEv()` auch im Gegnerzweig.

### 4. Floskel / englische Namen bei Theorie (134 / 293)
- **187054798396, 1…e5:** „Du bleibst in der Theorie (King's Pawn Game). Alles im grünen Bereich.“
- **Besser:** „Theorie: Königsbauernspiel.“ (deutsche Namen; Floskel streichen.)
- **Ursache:** Z. 144; Namen aus `book.js` sind englisch („Queen's Pawn Game: Chigorin Variation“, „Polish Opening: Czech Defense“, „Busch-Gass Gambit“).

### 5. Notation gemischt (112)
- **187054798396, 3.Lc4:** Schritt 2 „Noch etwas stärker wäre Nc3 gewesen“, Eröffnungsschritt „Nächste Züge (lila): Sc3, d4, Sxe4“.
- **Besser:** Überall deutsch (K, D, T, L, S) – die Zugliste zeigt Figurensymbole, die Eröffnungstexte schon deutsch.
- **Ursache:** `m.san` aus chess.js ungefiltert in Z. 23, 80, 187, 195, 214–220, 262–267; Hilfsfunktion `sanDE()` an einer Stelle einführen.

### 6. Bewertungspaar ohne Aussage (89)
- **186149512952, 34.c4:** „Noch etwas stärker wäre Ra7# gewesen – setzt matt (M1 statt M1).“
- **186069736928, 3…e6:** „(+0.0 statt +0.0)“.
- **Besser:** Klammer weglassen, wenn |Δ| < 0,3 Bauern oder beide Werte Matt; Matt-Fall siehe Nr. 17.
- **Ursache:** Z. 195, 181.

### 7. Fehler ohne Grund (89; 50 % der eigenen Fehler/Patzer)
- **186000059536, 23.Sd4?? (−4,5):** „Patzer: Stärker war Bd4.“ → danach nur die Ld4-Linie. Die Widerlegung 23…Sxe3+ 24.fxe3 e5 (Springer d4 gefesselt gegen Td1) taucht nirgends auf.
- **186356324060, 12…Sxe4?:** „Fehler: Stärker war a6.“ – dass der Springer für zwei Bauern verloren geht (Lxe4 Lxe4 Sxe4), steht nirgends.
- **186070034314, 19…Txf2??:** „Patzer: Stärker war d5.“ und später „So gewinnst du einen Bauern (+1)“ – das bezieht sich auf die bessere Linie, wirkt aber wie Lob.
- **Besser (Zeile 1):** „Patzer: Nach Sd4 gewinnt chandureddy16 mit …Sxe3+ und …e5 deinen Springer.“ Schritt 2: „Besser: Ld4.“
- **Ursache:** Generic-Zweig Z. 234 setzt `why` nur auf „Stärker war …“; `kind='loss'` erst ab `lossA <= -2` nach exakt 4 Halbzügen (Z. 207, 217) – Fesselungen/Figur-für-Bauern fallen durch. Bei `mistake`/`blunder` immer die Antwort des Gegners (`reply`) zuerst zeigen, unabhängig von `lossA`.

### 8. Gabel/Doppelangriff mit Bauern (88)
- **186895585580, 11…Df6 (Großartig):** „… greift den Läufer auf f4 und den Bauern auf b2 gleichzeitig an – eine Gabel.“
- **186895585580, 14…Sd4 (verpasst):** „Stärker war Qc1+ (Schach und Gabel gegen Bauer b2 und Bauer c2).“
- **187054798396, 12.Tb1 (Variante):** „Du spielst Qxd1 – schlägt die Dame auf d1, greift den Bauern auf c2 und den Turm auf b1 gleichzeitig an: eine Gabel.“ – die Dame wird sofort zurückgeschlagen.
- **Besser:** „Df6 greift den Läufer f4 an.“ / „Dc1+ mit Schach, danach Dxb2 und der Turm a1 fällt.“
- **Ursache:** `describe` Z. 35 nimmt jedes ungedeckte Ziel (auch Bauern); Z. 37–38 nennen ab 2 Zielen „Gabel“/„Doppelangriff“. Regel: Gabel nur, wenn ≥ 2 Ziele mit Wert ≥ 3 (oder König) und der Angreifer auf dem Feld nicht billiger geschlagen werden kann (SEE ≥ 0).

### 9. Wiederholungen (30/30 Partien; 160×)
- Eröffnungstext („Sizilianische Verteidigung: … Plan: d4 und Sxd4 …“) steht bei **jedem** Zug bis Zug 10 – auch wenn Weiß wie in 186069736928 mit d3/Lc4 gar nicht d4 spielt.
- „Und das ist kein Einzelfall: In deinen 20 analysierten Partien ist es schon 2-mal passiert, dass du dich positionell vergreifst.“ bei fast jedem Fehler, auch bei Ungenauigkeiten.
- **Besser:** Eröffnungsschritt einmal pro Partie (erster Zug außerhalb der Theorie) bzw. nur bei Strukturwechsel. Verlaufshinweis nur bei `mistake/blunder`, ab 3 Vorfällen, und höchstens einmal pro Partie und Fehlerart.
- **Ursache:** `openings.js` Z. 193–196 (`opening = ply <= 20`); `personal()` Z. 136.

### 10. Satz ohne Verb (64)
- **187054798396, 8.Lxe6:** „Halbnull: den Läufer schlagen, gleichwertiger Tausch.“
- **Besser:** „Halbnull tauscht die Läufer.“ / eigen: „Klar: Läufertausch.“
- **Ursache:** Z. 187 (`${you ? 'Klar' : oppName}: …`).

### 11. „ungedeckt“ irreführend (41)
- **187054798396, 4…Le6:** „Der Zug greift den Läufer auf c4 an, der ungedeckt ist.“ – Lc4 kann auf e6 schlagen (Tauschangebot).
- **186356324060, 15.Ld2:** „greift die Dame auf a5 an, die ungedeckt ist“ – bei der Dame ist die Deckung egal.
- **Besser:** „Le6 bietet den Läufertausch an.“ / „Ld2 greift die Dame an.“
- **Ursache:** `describe` Z. 39. „ungedeckt“ nur, wenn Ziel ≤ Wert des Angreifers und das Ziel den Angreifer nicht selbst schlagen kann.

### 12. coachText duzt den Gegner (41)
- **187054798396, 39.Sh5 (Gegner):** „Nh5 ist ein Fehler. … Damit lässt du Matt in 3 zu (gxh5).“
- **Besser:** „… Damit lässt Halbnull Matt in 3 zu – du hättest mit …gxh5 beginnen können.“
- **Ursache:** `analysis.js` Z. 445–450 kennt keine Perspektive. (In `app.js` aktuell nicht verwendet, im Prüfstand schon.)

### 13. „gleichwertiger Tausch“ bei Gratisfigur (26)
- **187054327186, 19.Sxf5:** „Klar: den Läufer schlagen, gleichwertiger Tausch.“ – der Läufer f5 ist nicht zurückzuschlagen.
- **Besser:** „Klar: Der Läufer f5 war ungedeckt – Sxf5 gewinnt ihn.“
- **Ursache:** Z. 187 vergleicht nur Werte; Rückschlag-Prüfung fehlt (`new Chess(after).moves().some(y => y.to === m.to && y.captured)`).

### 14. Patzer-Kopf ohne Subjekt / Figur nicht genannt (23)
- **186488544292, 14.Sd4??:** „Patzer: Bxd1 – schlägt die Dame. Du verlierst etwa einen Turm.“
- **Besser:** „Patzer: Deine Dame d1 hängt – Salvatore6990 nimmt mit Lxd1.“
- **Ursache:** Z. 218 `why = \`${dr.san} – ${short(dr)}. Du verlierst …\``.

### 15. „Deine Chance“ ohne Inhalt (19)
- **186356099444, 14…Df2+ (Gegnerfehler):** „Mabelgray macht einen Fehler. Deine Chance: Du spielst Kd1.“ + „Und du hast es gesehen: Kd1 – stark reagiert!“
- **Besser:** „Mabelgray verpasst …Lb6 (Materialgewinn). Kd1 ist jetzt der einzige Zug.“ Kein Lob für erzwungene Züge.
- **Ursache:** Z. 272–274 (Intro immer), Z. 279 (`hit` auch bei einzigem/erzwungenem Zug).

### 16. Material widersprüchlich / falsch zugeordnet (12+)
- **186250470540, 17…De2+??:** Zeile 1 „Patzer: Kxe2 – schlägt die Dame. Du verlierst etwa einen Turm.“, später „Unterm Strich verlierst du etwa eine Dame (-9).“ (richtig: Dame ersatzlos).
- **186488544292, 14.Sd4??:** „Unterm Strich … eine Dame (-9)“ – die Linie endet vor dem Rückschlag Kxd1 (richtig: Dame gegen Läufer).
- **186895585580, 13…Dxg5?:** „Dxb2 … gewinnt etwa einen Turm.“ → „So gewinnst du einen Bauern (+1).“ (Linie vor Dxa1 abgeschnitten.)
- **186149179666, 6.Lc4?:** „Du verlierst etwa einen Turm.“ – der Th1 war schon nach 5.Dh5?? Lxg2 verloren (auch der beste Zug f3 verliert ihn).
- **Besser:** Eine einzige Materialzahl pro Text, gerechnet bis zur ersten ruhigen Stellung (kein Schlag mehr möglich, SEE) und **relativ zur besten Linie** (wie `judgeIdea` Z. 297 `lossRel`), nicht relativ zur Stellung vorher.
- **Ursache:** `lossA` Z. 207 (4 Halbzüge, Basis `before`), `gainB` Z. 208 (5 Halbzüge), `outcome` nach 2–4 Halbzügen Z. 241–249.

### 17. Matt in 1 verpasst, aber gelobt (12)
- **186149512952, 34.c4 … 50.d5:** elfmal „Exzellent – fast perfekt.“ / „Solide.“ mit „Noch etwas stärker wäre Ra7# gewesen – setzt matt (M1 statt M1).“ im aufklappbaren Teil.
- **Besser (Zeile 1):** „Matt in 1 übersehen: Ta7#.“ – unabhängig von der Klasse.
- **Ursache:** Lob-Zweig Z. 188–196 prüft nicht `best.mate === 1`. (Einstufung `excellent` bei verpasstem Matt in 1 an das Klassen-Team gemeldet.)

### 18. Kopf und Inhalt passen nicht zusammen (10 + 6)
- **187054798396, 31…Ta3:** „Ungenau. Taktik übersehen: R3f7 … gewinnt etwa einen Turm.“
- **186895585580, 13…Dxg5:** „Fehler: Taktik übersehen: Qxb2 …“ (zwei Köpfe, zwei Doppelpunkte).
- **Besser:** „Ungenau – noch klarer war …Tf7 (gewinnt den Springer).“ / „Fehler: Dxb2 hätte den Turm a1 gewonnen.“
- **Ursache:** Z. 200 + Z. 220.

### 19. „Viele hätten hier …“ (7)
- **186070034314, 23…Taf8:** „Viele hätten hier Bg2+ gespielt – das hätte etwa 11 % Gewinnchance gekostet (-4.0 statt -2.3).“
- **Besser:** „Nicht gut wäre z. B. …Lg2+ gewesen: −4,0 statt −2,3.“ Nur zeigen, wenn die Alternative `natural()` ist.
- **Ursache:** Z. 181.

### 20. Merksatz passt nicht (6)
- **186488544292, 3.Lc4?:** „Stärker war Nxe5 (schlägt den Bauern).“ + Merksatz „Welche meiner Figuren steht am schlechtesten …“ – es ging um einen Gratisbauern.
- Merksatz wird an den letzten Schritt geklebt, auch an „Einfacher zu finden …: Ng3+.“
- **Besser:** Bei gewinnbarem Material `missedTactic`-Merksatz; Merksatz als eigener Schritt.
- **Ursache:** Z. 268 (+ `err`-Einstufung `positional` in analysis.js).

### 21. Großartig für klare Schlagzüge (6)
- **186000059536, 19…Txd1:** „chandureddy16 findet den einzigen guten Zug. Der Zug schlägt die Dame auf d1.“ – Damentausch.
- **Besser:** „chandureddy16 schlägt die Dame zurück – klar.“
- **Ursache:** `great`-Zweig Z. 174 steht vor dem `obvious`-Zweig Z. 185.

### 22. Gegnerpatzer: Matt verschwiegen (5)
- **187054798396, 39.Sh5 (−M3):** „Halbnull macht einen Fehler. Deine Chance: Du spielst gxh5 – schlägt den Springer auf h5.“
- **Besser:** „Halbnull patzt – du hast Matt in 3, beginnend mit …gxh5.“
- **Ursache:** Z. 272–274 werten `an.evals[i+1].mate` nicht aus.

### 23–25. Brillant-Texte (4 von 5 betroffen)
- **186070034314, 20…Txf4 (0.00):** „… Dafür gibt es starken Angriff und Initiative.“ – Stellung ausgeglichen. Besser: „Dafür hältst du das Gleichgewicht.“
- **186001603352, 38…Dxe4+ (Gegner):** gleiche Floskel – es ist ein Übergang in ein gewonnenes Bauernendspiel. Besser: „Danach ist das Bauernendspiel für Matheus301124 gewonnen.“
- **186069569048, 15.Txe8+:** „opfert den Turm auf e8 mit Schach“ – Turmtausch (Txe8+ Dxe8). Kein Opfertext, wenn `m.captured` ≥ Wert der „Opferfigur“ auf demselben Feld.
- **185999338136, 38.Sg5:** „Den Springer zu nehmen (Kxg5) geht schief – deshalb spielt Wadesr a5.“ → nächster Schritt „Wadesr spielt Kxg5“. Besser: „Nimmt Wadesr den Springer, läuft der f-Bauer zur Dame.“
- **Ursache:** Z. 155 (keine Tausch-Prüfung), Z. 163–165, Z. 168 (Standardsatz).

### Kleinere Sprachpunkte
- Dezimalpunkt: „+0.3“ → deutsch „+0,3“ (489 Züge; `fmtEval`).
- Aufzählung mit Kommas ohne „und“: „gibt Schach, greift dabei den Bauern auf c3 an – Doppelangriff“ (Z. 37) → „gibt Schach und greift …“.
- „Das war der einzige legale Zug – da gab es nichts zu entscheiden.“ ok; „Exzellent – fast perfekt.“ ok.
- Keine Kasus-/Artikelfehler bei Figuren gefunden (`AKK`/`NAME` korrekt); „die Dame …, die ungedeckt ist“ grammatisch korrekt.

---

## Regeln und Textbausteine zum Ersetzen

**Allgemein**
1. **Zeile 1 ≤ 12 Wörter**, Muster `<Klasse>: <Kern>`; Kern nennt die Figur, die zieht/verloren geht/geopfert wird, mit Feld. Alles aus `describe().text` erst ab Schritt 2.
2. **Echte Züge im Perfekt/Präsens, Engine-Züge im Konjunktiv:** „Besser: …Tf7.“, „Dann käme …Sxe3+ fxe3 e5.“, „Halbnull würde mit Kd1 antworten.“ Nie „Du spielst X“ für nicht gespielte Züge.
3. **Deutsche Notation überall** (K, D, T, L, S; Umwandlung „=D“). Eine Funktion `sanDE()` für alle Texte.
4. **Bewertung nur, wenn sie etwas sagt:** Klammer nur bei |Δ| ≥ 0,3 Bauern und nie bei Matt/Matt; immer aus Sicht des Lesers *und* mit Komma: „(+2,1 statt −0,4 für dich)“. Bei Gegner-Alternativen keine Zahlen.
5. **Eine Materialzahl pro Text**, gerechnet bis zur ruhigen Stellung und relativ zur besten Linie. Begriffe: „eine Figur“, „die Qualität“, „die Dame gegen einen Läufer“, „einen Bauern“ statt „etwa zwei Bauern“ bei Figur-gegen-Bauer.
6. **Gabel/Doppelangriff** nur bei ≥ 2 Zielen mit Wert ≥ 3 oder König + Ziel ≥ 3, und nur wenn der Angreifer nicht billiger geschlagen werden kann. Bauern nie als Gabel-Ziel nennen.
7. **„ungedeckt“** nur, wenn Ziel ≤ Wert des Angreifers und das Ziel den Angreifer nicht schlagen kann. **„hängt“** nur nach SEE-Verlust ≥ 1.
8. **„Opfer“** nur, wenn die Figur nach SEE netto verloren ist; nie bei Txe8+ Dxe8-Tausch.
9. **Floskeln streichen:** „Alles im grünen Bereich“, „Dafür gibt es starken Angriff und Initiative“ (nur wenn Bewertung ≥ +1,5 *und* König des Gegners angreifbar), „Viele hätten hier …“.
10. **Wiederholung:** Eröffnungsschritt einmal pro Partie; Verlaufshinweis („kein Einzelfall“) einmal pro Partie und Fehlerart, nur bei Fehler/Patzer, ab 3 Vorfällen.

**Bausteine (Ersatz)**

| Situation | heute | neu |
|---|---|---|
| Patzer, Figur geht verloren (Z. 218) | „Patzer: Bxd1 – schlägt die Dame. Du verlierst etwa einen Turm.“ | „Patzer: Deine Dame d1 geht verloren ({Gegner} spielt Lxd1).“ |
| Fehler ohne Material (Z. 234) | „Fehler: Stärker war a6.“ | „Fehler: Nach Sxe4 Lxe4 Lxe4 Sxe4 fehlt dir eine Figur.“ – Schritt 2: „Besser: a6.“ |
| Verpasste Taktik (Z. 220) | „Fehler: Taktik übersehen: Qxb2 (Gabel …) gewinnt etwa einen Turm.“ | „Fehler: Dxb2 hätte den Turm a1 gewonnen.“ |
| Verpasstes Matt (Lob-Zweig) | „Exzellent – fast perfekt.“ + „(M1 statt M1)“ | „Matt in 1 übersehen: Ta7#.“ |
| Gegnerfehler (Z. 272) | „Halbnull patzt! Deine Chance: Du spielst Qxf3 – schlägt den Springer auf f3.“ | „Halbnull patzt – der Springer f3 hängt: …Dxf3.“ / mit Matt: „Halbnull patzt – du hast Matt in 3: …gxh5.“ |
| Gegnerfehler, nur erzwungene Antwort | „Deine Chance: Du spielst Kd1.“ / „Kd1 – stark reagiert!“ | „Mabelgray verpasst …Lb6. Kd1 ist jetzt Pflicht.“ (kein Lob) |
| Klarer Schlag, gratis (Z. 187) | „Klar: den Läufer schlagen, gleichwertiger Tausch.“ | „Klar: Der Läufer f5 war ungedeckt.“ |
| Klarer Schlag, Tausch (Z. 187) | „Halbnull: den Läufer schlagen, gleichwertiger Tausch.“ | „Halbnull tauscht die Läufer.“ / „Klar: Läufertausch.“ |
| Bester Zug (Z. 192) | „Sauber gespielt – der beste Zug. Der Zug schlägt den Bauern auf c4, greift …“ | „Bester Zug – Txc4 holt den Bauern.“ |
| Gegner gut/exzellent (Z. 195) | „Für Halbnull noch etwas stärker wäre d4 gewesen (-0.8 statt -0.3).“ | (weglassen) |
| Theorie (Z. 144) | „Du bleibst in der Theorie (King's Pawn Game). Alles im grünen Bereich.“ | „Theorie: Königsbauernspiel.“ |
| Großartig, Alternative (Z. 181) | „Viele hätten hier Nb4 gespielt – das hätte etwa 23 % Gewinnchance gekostet (+1.7 statt +5.4).“ | „Nach …Sb4 wäre der Vorteil weg (+1,7 statt +5,4).“ |
| Brillant, Ausgleich (Z. 168) | „Dafür gibt es starken Angriff und Initiative.“ | „Damit hältst du das Gleichgewicht.“ / Endspiel: „Das Bauernendspiel ist danach gewonnen.“ |
| Brillant, abgelehnt (Z. 165) | „Den Springer zu nehmen (Kxg5) geht schief – deshalb spielt Wadesr a5.“ | „Nimmt Wadesr mit Kxg5, läuft der f-Bauer zur Dame.“ |
| Merksatz (Z. 268) | an letzten Schritt angehängt | eigener letzter Schritt, Fehlerart passend zum Text |

---

## Hinweise an andere Rollen (Klassifizierung, nicht Text)
- 186149512952: elfmal Matt in 1 ausgelassen, Klasse `excellent`/`good` (loss = 0, weil Gewinnwahrscheinlichkeit 100 % bleibt).
- 186069569048 15.Txe8+: Turmtausch als `brilliant` mit `sac = {r, e8}` eingestuft.
- 186000059536 19…Txd1 (Damentausch), 185983961210 18…Lxf7 (Dame nehmen), 186250470540 14.Lxe8 (Turm nehmen): `great` statt klarer Schlag.
- `err = positional` bei ausgelassenem Gratisbauern (3.Lc4 in zwei Partien) → falscher Merksatz.
