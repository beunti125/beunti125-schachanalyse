# Prüfung Fehler-Einstufungen und Fehlertypen – 70 echte Partien MertAbi69

Stand 12.11.2026, App-Code unverändert (`web/js/analysis.js` v7-Analyse, version.json 28).
Skripte (nur Test): `team/echte_fehler.mjs` (einstufen = echte App-Logik `analyseGame`, Tiefe 16, MultiPV 2, Elo je Seite aus wr/br; pruefen = Stichprobe Tiefe 20 MultiPV 3), `team/echte_auswertung.mjs` (Referenz nach Spezifikation + schachlicher Fehlertyp), Rohdaten `team/echte_d16.json`, `team/pruefung_d20.json`, `team/auswertung_d20.json`. Einzelfälle zusätzlich mit python-chess + Stockfish Tiefe 22 gegengeprüft.

## 1. Umfang

* 70 Partien, 3840 Halbzüge. App-Klassen: Bester 1472, Theorie 360, Gut 582, Exzellent 530, Ungenauigkeit 411, Fehler 197, Patzer 137, Verpasst 55, Großartig 46, Erzwungen 39, Brillant 11.
* Geprüft (Tiefe 20, MultiPV 3): **556 Züge** = alle 137 Patzer, 197 Fehler, 55 Verpasst, jede 3. Ungenauigkeit (137), 30 zufällige Gut/Exzellent/Bester.
* Referenz-Klasse: gleiche EP-Formel und Schwellen wie die Spezifikation (Elo-skaliert), aber Tiefe 20, MultiPV 3, Wert des gespielten Zuges aus seiner MultiPV-Linie oder der Nachher-Suche.
* Referenz-Fehlertyp: Matt zuerst. Danach die Materialbilanz an **Ruhepunkten** (kein Schach, und der nächste Halbzug schlägt nicht) bis 8 Halbzüge tief, gespielte Variante gegen beste Variante.

## 2. Ergebnis je Klasse (App Tiefe 16 gegen Referenz Tiefe 20)

| App-Klasse | n | Klasse gleich | ±1 Stufe | Fehlertyp gleich |
|---|---|---|---|---|
| Patzer | 137 | 132 (96 %) | 137 | 107 (78 %) |
| Fehler | 197 | 152 (77 %) | 192 | 152 (77 %) |
| Verpasst | 55 | 48 (87 %) | 55 | 44 (80 %) |
| Ungenauigkeit | 137 | 82 (60 %) | 130 | 82 (60 %) |
| Exzellent | 9 | 4 | 9 | – |
| Gut | 2 | 2 | 2 | – |
| Bester | 19 | 18 | 19 | – |

Verwechslungen: Fehler → Ungenauigkeit 30, Fehler → Patzer 7. Ungenauigkeit → Gut 31, Ungenauigkeit → Fehler 15. Verpasst → Fehler/Patzer 7. Nur **12 von 556** weichen um mehr als eine Stufe ab.

**Tiefenrauschen:** 110 Grundklassen kippen zwischen Tiefe 16 und 20. Bei 55 davon liegen beide Verluste weniger als 2 EP-Punkte an derselben Schwelle. Bei 97 der 110 ist der gespielte Zug keine der 2 MultiPV-Linien. Sein Wert stammt dann aus einer anderen Suche (Nachher-Stellung), also genau aus der Rauschquelle, die die Spezifikation in 2.1 mit `searchmoves` vermeiden will. Die Patzer sind robust. Die Grenze Fehler/Ungenauigkeit/Gut ist die unsichere Zone.

Präzision je Fehlertyp (Anteil richtig unter den App-Labels / Trefferquote unter den Referenz-Labels):

| Fehlertyp | App-Labels | richtig | Bemerkung |
|---|---|---|---|
| Material eingestellt (hung) | 113 | 99 (88 %) | **Trefferquote nur 99/150 = 66 %**: ein Drittel echter Materialverluste läuft als „Stellungsfehler“ |
| Taktik verpasst | 75 | 45 (60 %) | 13× in Wahrheit Stellungsfehler, 7× Material eingestellt, 3× nicht bestraft |
| Stellungsfehler | 270 | 192 (71 %) | 40× in Wahrheit Material eingestellt, 8× Taktik verpasst |
| Matt zugelassen | 28 | 22 (79 %) | 6× war das Matt mit jedem Zug unvermeidbar (Tiefenrauschen) |
| Matt übersehen | 12 | 9 (75 %) | – |
| Nicht bestraft | 28 | 18 (64 %) | Abweichungen = Material eingestellt/Taktik verpasst |

## 3. Befunde

### B1 – „Taktik verpasst“: das Bilanzfenster endet mitten im Abtausch (Hauptfehler)
`analysis.js` Z. 369–372 und 374: `seqB = balAlong(fen, bestLine, c, 5)`, `endB = seqB[seqB.length - 1]`. Der 5. Halbzug ist ein Zug des Ziehenden. Ist er ein Schlagzug, fehlt der Rückschlag des Gegners, und der Gewinn ist nur scheinbar.
Über alle Partien: **37 von 110** App-„Taktik verpasst“ beruhen auf einem Gewinn, der mit der nächsten Gegnerantwort wieder verschwindet.

| Partie / Zug | App | richtig | Begründung (SF Tiefe 22) |
|---|---|---|---|
| 186250470540, 11...Nb6 | Ungenauigkeit, Taktik verpasst | Ungenauigkeit/Fehler, **Stellungsfehler** | 11...exd4 (+1,53) 12.Bxd5 Bxg3 13.Bxf7+ Kxf7 14.hxg3: materiell gleich. Das Fenster endet bei Kxf7. |
| 186001603352, 16...b4 | Ungenauigkeit, Taktik verpasst | **Stellungsfehler** (Bauer a5 geht) | 16...Ne7 … Nxd5 exd5 ist nur ein Tausch. Das Fenster endet bei Nxd5. |
| 186069868192, 20.Rd2 | Ungenauigkeit, Taktik verpasst | **Stellungsfehler** | 20.d4 gewinnt nur e5: …Qxd1+ Rxd1 Rxd1+. Das Fenster endet bei Rxd1. |
| 186356099444, 14...Qf2+ | Fehler, Taktik verpasst | Fehler, Stellungsfehler | b0 = +3 (der Rückschlag steht noch aus). Der beste Zug Bb6 rettet nur den Läufer. |

### B2 – „Material eingestellt“: Fenster zu kurz und Bezug auf b0 statt auf den besten Zug
`analysis.js` Z. 366–368, 371, 373: `seqA` hat nur 4 Halbzüge. `endA` ist das Minimum der ungeraden Indizes plus des letzten. Verglichen wird mit `b0`, also der Bilanz **vor** dem Zug.
Folgen: (a) Verluste ab dem 5. Halbzug werden nicht gesehen. (b) Ein Zwischenstand nach einem Rückschlag verdeckt den späteren Verlust. (c) Ist der Ziehende vor dem Zug nur vorübergehend vorn (ein Rückschlag steht aus), meldet die App „eingestellt“, obwohl das Material auch nach dem besten Zug verloren geht.

| Partie / Zug | App | richtig | Begründung |
|---|---|---|---|
| 186356099444, 6.Be3 | Fehler, Stellungsfehler | Fehler, **Material eingestellt** | 6...Qxb2 7.Qb3 Qxa1: Der Turm geht im 5. Halbzug verloren. |
| 186356099444, 17...bxc6 | Patzer, Stellungsfehler | Patzer, **Material eingestellt** | 18.Qxc6+ Bd7 19.Qxa8+ … Qxh8. Die Gabel kostet beide Türme. b0 zählt den eben geschlagenen Turm nicht mit. |
| 186250470540, 16.Kd1 | Patzer, Stellungsfehler | Patzer, **Material eingestellt** | Fesselung auf der d-Linie. Nach …Bxg3 hxg3 sieht die Bilanz kurz ausgeglichen aus. |
| 186000059536, 23.Nd4 | Patzer, Stellungsfehler | Patzer, **Material eingestellt** | 23...Nxe3+ 24.fxe3 e5, dann exd4 im 5. Halbzug. |
| 186149179666, 6.Bc4 | Fehler, **Material eingestellt** | Fehler, Stellungsfehler | Der Turm h1 geht auch nach dem besten Zug 6.d4 (…Bxh1) verloren. b0 = +2 ist nur vorübergehend. |

### B3 – Verpasstes kurzes Matt wird „Exzellent/Gut“ ohne Fehlertyp
`analysis.js` Z. 36–40 (`winPctR` begrenzt cp auf ±1500, dadurch liegt EP schon bei etwa 99 %) und Z. 360 (der Fehlertyp wird nur für schlechte Klassen bestimmt).
Über alle Partien: verpasstes Matt in ≤3, danach kein Matt mehr: 4× Exzellent/Gut.

| Partie / Zug | App | Vorschlag |
|---|---|---|
| 186149236492, 16...Qc4+ (1250 Elo) | **Exzellent** | 16...Qb4# war Matt in 1. Qc4+ gibt die Dame (17.Kxc4), danach +9,5. Mindestens Ungenauigkeit mit „Matt übersehen“ [A]. |
| 185177136720, 42...Qg3+ (670) | Exzellent | Matt in 2 verpasst |
| 186149512952, 25.Nxg7+ (1221) | Exzellent | Matt in 3 verpasst |
| 185983197780, 19.Nef6+ (603) | Gut | Matt in 3 verpasst |

Hinweis: chess.com veröffentlicht dazu keine Regel. WintrChess stuft „Matt → kein Matt“ über die verbleibende Bewertung ein. Der Vorschlag ist deshalb eine Annahme [A], aber didaktisch klar: Ein Matt in 1 zu übersehen, verdient einen Hinweis.

### B4 – „Matt zugelassen“ in hoffnungslosen Stellungen (Tiefenrauschen + Elo-Faktor)
`analysis.js` Z. 35/39: Bei 146–400 Elo ist `eloFactor` etwa 0,55–0,67, daher gilt −10 noch als 7–13 % EP. Sieht Tiefe 16 für den besten Zug „nur“ −10, für den gespielten Zug aber Matt, wird daraus Ungenauigkeit/Fehler + „Matt zugelassen“. Tiefe 20 zeigt dann, dass jeder Zug matt wird.
Beispiele: 186150065556, 9.Nf3 (162 Elo), 187054798396, 39.Nh5 (376, „Fehler“), 61.Ke2, 186149236492, 11.Kc3. Das sind 6 von 28 „Matt zugelassen“ in der Stichprobe.
Umgekehrt ist „Gut“ bei zugelassenem Matt in 1 in diesen Partien in Ordnung (186069569048, 53.a4, 185999338136, 54...Ke4: Tiefe 22 zeigt, dass auch jeder andere Zug matt wird).

### B5 – „Matt übersehen“ auch bei sehr langen Matts
`analysis.js` Z. 363: Jedes Matt im besten Zug zählt, auch Matt in 10 bei 595 Elo (187054798396, 43...h6, 61...d4). Schachlich korrekt, didaktisch aber unpassend. Der Text in `coachText` (Z. 448) will dann 19 Halbzüge zeigen, gespeichert sind aber nur 10 (Z. 109 `pv.slice(0, 10)`).

### B6 – Patzer und Verpasst sind solide
Die Patzer stimmen zu 96 %. Ein Figurenverlust in ausgeglichener Stellung (|Bewertung| ≤ 2, Verlust ≥ 3 Bauern) wird 69× Patzer, 11× Verpasst und nur 4× Fehler. Verpasst stimmt zu 87 %; die Abweichungen sind Grenzfälle an der Bedingung „nicht schlechter als vorher −5“. Stichproben „Material eingestellt“ (12.Rb1 Qxf3, 3.Rh4 Qxh4, 8.Kd3 Bxd1, 26...Ng6 hxg6, 12.Ng3 Qxg3+) und echte „Taktik verpasst“ (25...f5 statt Bc5 mit Fesselung, 22...Bxb1 statt Nxh1) sind richtig.

### B7 – Zeitdruck nicht prüfbar
`echte_partien.jsonl` enthält keine Uhrzeiten (`m` ist eine reine SAN-Liste). `pressure` (Z. 383–384) ist deshalb überall falsch und ließ sich nicht prüfen.

## 4. Elo-Skalierung und Kalibrierung

* **Elo-Effekt** (dieselben 3441 Züge, Daten aus Tiefe 16): bewertet mit 600 Elo 158 Patzer, 215 Fehler; mit 1200 Elo 223 Patzer, 236 Fehler; mit 2000 Elo 250/269. Bei 600 Elo gibt es also **29 % weniger Patzer** als bei 1200. 67 Züge werden von Fehler zu Patzer, 104 von Ungenauigkeit zu Fehler und 157 von Gut zu Ungenauigkeit.
* **Klassen pro Seite** (500–799 Elo, 107 Seiten, Schnitt 27 eigene Züge): Patzer 0,96 · Fehler 1,40 · Verpasst 0,42 · Ungenauigkeit 2,94 · Gut 4,0 · Bester 10,1 · Großartig 0,31 · Brillant 0,07. Bei 1000+ ist es praktisch gleich (1,07 / 1,37 / 0,37 / 2,93). Nach meiner Erfahrung mit chess.com-Reviews auf 500–800 Elo sind die Patzer und vor allem Verpasst eher zu wenige: typisch sind 2–4 Patzer+Verpasst pro Seite in Blitzpartien. Eine harte Gegenprobe fehlt, weil die Datei keine chess.com-Klassenzählungen enthält.
* **Genauigkeit** (nur 3 Partien mit `acc`, alle etwa 600 Elo, Zeitkontrolle 120+1):

| Partie | Seite | chess.com | App | Δ |
|---|---|---|---|---|
| 186356324060 | W 604 / S 610 | 87,9 / 75,9 | 92,6 / 80,5 | +4,7 / +4,6 |
| 185647523440 | W 621 / S 603 | 62,2 / 52,0 | 68,8 / 60,2 | +6,6 / +8,2 |
| 185637661674 | W 656 / S 638 | 74,6 / 64,5 | 82,1 / 73,4 | +7,5 / +8,9 |

Die App liegt in allen 6 Fällen zu hoch, im Mittel um **+6,8**. Die Abweichung wächst mit der Fehlerzahl. Die Genauigkeitsformel (Z. 354–357) hat keinen Elo-Bezug. Die Kalibrierung „176 echte Werte“ stammt vermutlich von einem anderen Elo-Niveau oder aus längeren Partien. Die Stichprobe ist klein, die Richtung aber eindeutig.

## 5. Vorschläge (Reihenfolge nach Nutzen)

1. **Fehlertyp-Bilanz an Ruhepunkten statt fester Fenster** (B1, B2). In Z. 366–376 ersetzen:
   ```js
   // Bilanz nach k Halbzügen nur an Ruhepunkten: kein Schach und der nächste Halbzug schlägt nicht; bis 8 Halbzüge
   const qA = quietBal(P.fens[i + 1], after.lines[0]?.pv, c, 8);  // Liste
   const qB = quietBal(P.fens[i], lines[0]?.pv, c, 8);
   const endA = Math.min(...qA), endB = Math.max(...qB);
   const ref = Math.min(b0, qB[0] ?? b0);              // ausstehender Rückschlag: Bezug = erster Ruhepunkt der besten Linie
   // (nachgerechnet: ref = b0 ist gleichwertig, 382 statt 380 bei 6 Halbzügen)
   if (endB - endA >= 2 && endA <= ref - 2) err = 'hung';
   else if (endB - endA >= 2 && endB >= ref + 2) err = 'missedTactic';
   ```
   `quietBal` liefert die Bilanzen nach k = 1…n Halbzügen, aber nur an Ruhepunkten (nach Schach oder vor einem Schlag wird nicht gemessen); gibt es keinen, zählt der letzte Wert. Z. 109 speichert 10 Halbzüge, das reicht.
   **Nachgerechnet** mit denselben Tiefe-16-Daten der App gegen die Tiefe-20-Referenz (443 Material-/Stellungsfälle der Stichprobe, ohne Matt):
   heute 354/443 richtig (80 %). Ruhepunkte bis 8 Halbzüge: **396/443 (89 %)**, 6 Halbzüge: 380–382. „Material eingestellt“ Trefferquote 99/150 → etwa 135/150. 9 der 10 Fehlertyp-Prüffälle bestehen, nur 6.Bc4 wird dann „Taktik verpasst“.
   Vorbehalt: Die Referenz benutzt selbst Ruhepunkte (Tiefe 20, 8 Halbzüge). Der Vergleich ist daher teilweise zirkulär. Die 10 Prüffälle sind dagegen von Hand mit Tiefe 22 verifiziert.
   Ungerade Fensterlängen (7, 9) schneiden schlechter ab (360–364), weil der letzte Wert dann vor der Gegenantwort liegt. Das Fenster muss also gerade sein.
2. **Wert des gespielten Zuges per `searchmoves`** (Spezifikation 2.1) oder MultiPV 3 statt 2 (Z. 107). Bei 97 von 110 Klassenwechseln stammt der Wert aus der Nachher-Suche. Das senkt das Kippen an der Grenze Fehler/Ungenauigkeit/Gut.
3. **Matt-Sonderregeln** [A]: (a) Matt in ≤3 verpasst und danach kein Matt mehr ⇒ mindestens Ungenauigkeit mit `missedMate` (B3). (b) `missedMate` nur bis Matt in 5, längere Matts als `missedTactic`/„Gewinnweg verpasst“ (B5). (c) „Matt zugelassen“ nur, wenn der beste Zug laut Engine kein Matt gegen sich hat **und** `wpB ≥ 10`; sonst höchstens Gut, ohne Matt-Text (B4).
4. **Genauigkeit für ≈600 Elo nachkalibrieren**: Im Mittel +6,8 zu hoch. Mehr Partien mit `acc` sammeln (Ziel ≥ 30 Seiten je Elo-Band) und die Strafe (Z. 357, 0,15) oder die Kurvensteilheit (Z. 354) Elo-abhängig machen.
5. **Klassenhäufigkeit gegen chess.com prüfen**: Für 10 Partien die Review-Zählungen (Patzer/Fehler/Verpasst/Ungenauigkeit) von Hand aus chess.com abschreiben. Erst dann `eloFactor` (Z. 35, Untergrenze 0,55) anfassen. Er senkt die Patzer bei 600 Elo um 29 %, was bei dieser Spielstärke eher zu milde wirkt.
6. **Uhrzeiten mitliefern** (`%clk` im PGN), damit Zeitdruck geprüft werden kann (B7).

## 6. Neue Prüffälle

`team/faelle_fehler.json`: 11 Fälle im Format von `faelle.json` (Elo und Zeitkontrolle aus der Partie, PGN bis zum Zug).
Stand App heute: **2 bestanden** (Kontrollen `echt_hung_12Rb1_kontrolle`, `echt_mt_25f5_kontrolle`), **9 gescheitert**:
* 4× hung erwartet, App „Stellungsfehler“ (6.Be3, 17...bxc6, 16.Kd1, 23.Nd4)
* 1× Stellungsfehler erwartet, App hung (6.Bc4)
* 3× Stellungsfehler erwartet, App „Taktik verpasst“ (11...Nb6, 16...b4, 20.Rd2)
* 1× Vorschlag [A] verpasstes Matt in 1 (16...Qc4+)

Die Klassen-Erwartungen sind bewusst weit gefasst (Tiefenrauschen). Geprüft wird vor allem der Fehlertyp.
