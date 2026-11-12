# Prüfung der Sonderlabels – 70 echte Partien von MertAbi69

Datenbasis: `test/klassen/echte_partien.jsonl` (70 Partien, alle Zuglisten mit python-chess legal geprüft). App-Einstufung mit `node test/klassen/echte.mjs --json …`: echte App-Logik, Tiefe 16, MultiPV 2, Elo je Seite aus wr/br. Ergebnis liegt in `team/echte16.json`.
Nachprüfung mit `team/pruefe_sonderlabels.py` (nativer Stockfish, Hash geleert). Brillant und alle Opfer-Kandidaten liefen mit **Tiefe 22 und MultiPV 3** (`d22_brillant.json`), Großartig und Verpasst samt Vorzug mit **Tiefe 20 und MultiPV 3** (`d20_rest.json`). Für d22 waren es rund 25 s je Stellung, deshalb liefen diese beiden Gruppen nur mit Tiefe 20. Die Opfer-Kandidaten stammen aus `team/opferkandidaten.mjs` (App-`findSacrifices` plus eine unabhängige, lockere Hänge-Heuristik).
Die neuen Prüffälle stehen in `team/faelle_sonderlabels.json` und laufen mit `node test/klassen/run.mjs --faelle test/klassen/team/faelle_sonderlabels.json`. Dafür hat run.mjs eine neue Option `--faelle` bekommen. Ergebnis heute: 3 bestanden (Schutzfälle), 7 gescheitert (die gefundenen Fehler).

App-Gesamtzählung (3840 Züge): Theorie 360, Bester 1472, Exzellent 530, Gut 582, Ungenauigkeit 411, Fehler 197, Patzer 137, **Brillant 11, Großartig 46, Verpasst 55, Erzwungen 39**.

| Label | geprüft | eindeutig falsch | nur tiefenabhängig (d16 vs. d20/22) | richtig |
|---|---|---|---|---|
| Brillant | 11 | **5** (45 %) | 1 (7…Lxh2+) | 5 (davon 2 Grenzfälle) |
| verpasste Brillanten | 46 Kandidaten (d22) | 1 Grenzfall (21…Txe4+) | – | – |
| Großartig | 46 | **7** (offensichtlicher Materialgewinn) | 6 | 33 |
| Verpasst | 55 | 1 zweifelhaft (19…Kd8 lässt Matt zu) | 10 | 44 |
| Erzwungen | 39 | 0 | – | 39 (genau 1 legaler Zug; kein Zug mit 1 legalen Zug ohne dieses Label) |
| Theorie-Grenzen | 140 (70 × 2) | 0 laut Spezifikation; **~10 Partien** enden gegenüber chess.com zu früh (Buchlücken, Zugumstellung) | – | – |

**Fehlerquote:** 13 von 151 Sonderlabels sind eindeutig falsch (8,6 %): 5 Brillant, 7 Großartig, 1 Verpasst. Weitere 17 (11 %) kippen schon mit mehr Rechentiefe, weil sie knapp an einer Schwelle liegen.

---

## 1. BRILLANT (Schwerpunkt)

### 1.1 Alle 11 Brillant-Einstufungen der App, nachgerechnet mit d22 und MultiPV 3

Spalten: EP = Expected Points aus Sicht des Ziehenden, Elo-skaliert wie in der App. „alt“ = bester anderer Zug.

| Partie | Zug | Spieler (Elo) | d16 EP/alt | d22 | Urteil | richtige Einstufung | Begründung | Ursache im Code |
|---|---|---|---|---|---|---|---|---|
| 186070199114 | 20.Lxg6 | MertAbi69 (626) | 89,9 / 52,7 | Lxg6 +7,96 (Top), h4 −0,18 | ✅ richtig | Brillant | Echtes Läuferopfer: hxg6 Dxg6+ führt zum Mattangriff (Tg3 im Rücken). Gespielt wurde Tf7 Lxf7+ Kh8 Tg8#. | – |
| 186069495252 | 19.Lxh6 | MertAbi69 (594) | 80,1 / 78,4 | Lxh6 +4,96 (Top), Dg3 +4,65 | ✅ richtig | Brillant | gxh6 Dg3+ Kh7 Dg7# (so gespielt). Echtes Opfer, bester Zug. | – |
| 185401967428 | 24…Sxd2 | Spyder202025 (671) | 80,4 / 50,7 | Sxd2 −5,34 (Top), d5 −0,02 | ✅ richtig | Brillant | Abzug auf der Diagonale c6–f3. Die Dame c6 bleibt stehen, nach Dxc6 folgt Txe1#. Spec 4.1: Matt nach Annahme ist keine Gegenrechnung. | – |
| 185809952338 | 24.Lxh7+ | MertAbi69 (1049) | 54,9 / 22,1 | Lxh7+ +0,34 (Top), Le4 −3,11 | ✅ vertretbar | Brillant (oder Großartig) | Räumungsopfer mit Schach: Kxh7 Txd8. Der Läufer wird wirklich gegeben, und es ist der einzige Zug, der aus „verloren“ „ausgeglichen“ macht. Wer streng auf das Material schaut: Weiß bekommt T für L. | Grenzfall von `parry()`, siehe Muster B1 |
| 186070034314 | 20…Txf4 | MertAbi69 (625) | 48,5 / 31,7 | Txf4 +0,63 (Top), 0-0-0 +3,39 | ⚠️ Grenzfall | laut Spec Brillant, schachlich eher Großartig | Die Dame e6 war schon angegriffen (Te1). Txf4 Txe6+ Lxe6 ergibt D gegen T+L, netto nur 1 Punkt. Bei d22 liegt die EP danach bei 45,4, gerade über der Schwelle 0,45. | Schwelle „danach ≥ 0,45“ und Netto ≥ 1 (Z. 148, 275) |
| 185637901490 | 7…Lxh2+ | yurov2151 (570) | 69,4 / 69,0 | Sg4 −3,44 (Top), **Lxh2+ −2,97**, Verlust 2,7 EP | ⚠️ tiefenabhängig | d16: Brillant, d22: Gut | Ein klassisches Läuferopfer auf h2, gespielt folgte Matt. Bei d22 verfehlt der Zug „Exzellent“ (< 2 EP) um 0,7 EP. chess.com würde ihn sehr wahrscheinlich Brillant nennen. | Grundklasse unter 1200 (Z. 147) |
| 186069569048 | 15.Txe8+ | inioluwanim (526) | 50,5 / 51,1 | Ld2 +0,09 (Top), Txe8+ 0,00 | ❌ falsch | Exzellent | Txe8+ Dxe8 ist ein **glatter Turmtausch**, Material gleich. Kein Opfer. | **B1**: Z. 237 `g = sk − parry(…)`. Schwarz steht im Schach, die einzigen ruhigen Züge (Lf8) verlieren die Dame d8. Darum wird „gain“ auf 9 aufgebläht, netto 9 − 5 = 4. Z. 253 prüft nur, ob der Ziehende im Schach stand, nicht ob er Schach gibt. |
| 185999338136 | 30.Txe7+ | MertAbi69 (1040) | 94,3 / 90,2 | Txe7+ +7,92 (Top), Kf2 +5,91 | ❌ falsch | Bester Zug | Txe7+ Txe7 Txe7+ Kxe7 ist ein doppelter Turmtausch. Kein Opfer. Außerdem steht Weiß ohnehin klar besser (+5,9). | **B1** wie oben (Schach + `parry`) |
| 185401967428 | 14.Lxb5 | MertAbi69 (655) | 63,4 / 64,5 | Lxb5 +1,91 = Lxf7+ +1,91 | ❌ falsch | Bester Zug | 13…b5 gabelt Da4 und Lc4. Lxb5 rettet die Dame, denn der Angreifer verschwindet, und verkauft den ohnehin verlorenen Läufer für 2 Bauern. Laut Spec 4.1 ist das Schadensbegrenzung, kein Opfer. | **B2**: Z. 276 `if (x === mv.to) { if (HP.has(mv.from) && trapped(mv.from)) continue; }`. Die Rettungsregel (`rescued ≥ SV`) wirkt nur im `else`-Zweig, also nie für die gezogene Figur selbst. |
| 186001603352 | 38…Dxe4+ | Matheus301124 (635) | 91,5 / 92,4 | f5/Kh6 **Matt in 11**, Dxe4+ −12,6 | ❌ falsch | Gut (d22) / Exzellent | Dame und 2 Bauern gegen den nackten König. Dxe4+ wickelt nur in ein gewonnenes Bauernendspiel ab, die Stellung war ohnehin völlig gewonnen. | **B3**: Z. 125 `winAnyway` 0,95 unter 1200 auf **Elo-skalierter** EP (Z. 35–41, Faktor 0,80 bei 635). d16 sieht kein Matt, +8,5 wird so zu EP 0,924 < 0,95. |
| 185999338136 | 38.Sg5 | MertAbi69 (1040) | 92,7 / 94,2 | Sf8+ +9,07 (Top), Sg5 +8,96, alt-EP 96,9 | ❌ falsch | Exzellent | Weiß hat zwei Leichtfiguren mehr. Kxg5 f7 gewinnt zwar, aber das ist kein Brillant, weil die Stellung ohnehin gewonnen ist. Bei d22 greift die Regel bereits (96,9 ≥ 95). | **B3** + Tiefe: Bei d16 liegt alt bei 0,942, knapp unter 0,95 |

**Bilanz:** 5 richtig (3 eindeutig, 2 Grenzfälle), 1 hängt an der Tiefe, **5 eindeutig falsch (45 %)**. Kein einziger der 5 Fehler ist ein echtes Opfer: 3 sind Tausch oder Schadensbegrenzung (Opfererkennung), 2 sind „ohnehin gewonnen“ (Schwelle).

### 1.2 Suche nach verpassten Brillanten

Methode: Ich habe jeden Zug beider Seiten erfasst, der eine eigene Figur (ab Springer) stehen lässt oder gibt. Das sind 222 Züge, die App-`findSacrifices` und/oder die Heuristik melden. Davon blieben 50 Kandidaten mit App-Klasse Bester, Exzellent, Gut, Großartig oder Brillant und EP danach ≥ 0,40. Diese 50 habe ich mit d22 und MultiPV 3 nachgerechnet und gegen die Bedingungen der Spezifikation geprüft. Einzelwerte stehen in `d22_brillant.json`, Feld `brill_bedingungen`.

| Partie | Zug | d22 | Warum die App kein Brillant vergibt | Urteil |
|---|---|---|---|---|
| 185983416636 | **21…Txe4+** (MertAbi69, 586) | Top +0,17, alt Lg3+ +3,27 | Wird als **Zurückschlagen** gewertet (Z. 340–342: `m.to === prevM.to`). Nach 20…Lxe4 21.fxe4 ist Txe4+ aber selbst ein Qualitätsopfer (Lxe4 Dxe4+, T gegen L+B). Alle anderen Brillant-Bedingungen sind erfüllt. | **möglicher verpasster Brillant.** Ursache: Die Ausnahme fürs Zurückschlagen fragt nicht, ob der zurückschlagende Stein selbst geopfert wird (SEE < 0). |
| 185983416636 | 20…Lxe4 (MertAbi69) | Top +0,23, alt +3,16 | Lg6 wurde von h5 angegriffen und war praktisch gefangen (Desperado) | richtig kein Brillant (eher Großartig: einziger Zug) |
| 185999654486 | 10…Lxd4 (MertAbi69, 1032) | Top −3,36, alt d5 −0,87 | Ta8 hängt zwar an Df3, aber Dxa8 Lxa1 ist ein Gegenschlag, und die PV 11.c3 Lxf2+ zeigt reinen Figurengewinn | richtig kein Brillant. Kein Großartig, weil Lxd4 eine freie Figur schlägt (richtig) |
| 186000059536 | 18…Dxc5 (chandureddy16) | Top −0,24, alt +0,67 | Ablenkungsopfer der Dame: dxc5 öffnet die d-Linie für Txd1. Der Gegenschlag gewinnt sofort die Dame zurück, das ist laut Spec 4.1 „kein echtes Hängen“. | laut Spec richtig, Grenzfall |
| 186069736928 | 24.Lxd5 / 19.Dh3 (MertAbi69) | Top | Nach exd5 folgt Txe7 (Damengewinn) bzw. der Läufer hing schon vorher | richtig kein Brillant |
| 185983197780 | 21.Se4+ / 25.Sg5+ (MertAbi69) | Matt in 5 / Matt in 2, alle Alternativen ebenfalls Matt | „ohnehin gewonnen“ | laut Spec richtig. chess.com vergibt bei Mattopfern teils trotzdem Brillant (offene Frage) |
| 186149236492, 186150065556, 186149512952 | 16…Dc4+, 7…Lxf3+, 21.Lxc7+ (MertAbi69 1221–1250 gegen 146–162) | alt ≥ 93 | ohnehin gewonnen und/oder nicht Bester | richtig kein Brillant |
| 185999338136 | 39.f7 (MertAbi69) | alt Sf3 Matt in 18 | ohnehin gewonnen, Grundklasse Gut | richtig kein Brillant |
| 186250470540 | 13…dxe3 (MertAbi69) | Verlust 4,9 EP (bxc6 besser) | Grundklasse Gut | richtig kein Brillant |

Fazit: Die Opfererkennung übersieht keine eindeutigen Brillanten. Gefunden habe ich **1 Grenzfall** (21…Txe4+), und der scheitert an der Ausnahme fürs Zurückschlagen, nicht an der Opfererkennung. Die Elo-Großzügigkeit unter 1200 hat in diesen Partien keinen echten Brillanten verhindert. Sie hat im Gegenteil zwei falsche erzeugt (38…Dxe4+, 38.Sg5).

### 1.3 Grenzfälle der Schwellen (mit Belegen) und Vorschläge

| Schwelle | Belege aus den echten Partien | Vorschlag |
|---|---|---|
| **Ohnehin gewonnen** (alt-EP ≥ 0,90 bzw. 0,95 unter 1200, auf Elo-skalierter EP) | 38.Sg5: alt +7,3 (d16) → EP 0,942, gilt als „nicht gewonnen“. 38…Dxe4+: alt +8,5 (d16, das Matt wird nicht gesehen) → EP 0,924 bei 635 Elo. 30.Txe7+: alt +5,9 → 0,903 < 0,95. Mit der Elo-Skalierung (Faktor 0,80 bei 635) liegt die 0,95-Schwelle bei rund **+10 Bauern**, das ist schachlich unsinnig. | **Elo-unabhängig in Bauerneinheiten messen:** kein Brillant, wenn die beste Alternative ≥ **+6,00** steht (entspricht EP 0,90 ohne Elo-Faktor; WintrChess +7,00, Chesskit 97 %) oder Matt hat. Die Großzügigkeit für Anfänger gehört an andere Stellen (Grundklasse, siehe unten), nicht hierher. Alle drei Fehlfälle wären damit gelöst, und kein richtiger Brillant ginge verloren (höchste alt bei den richtigen: Lxh6 +4,65). |
| **Danach nicht schlecht** (EP ≥ 0,45) | 20…Txf4: d16 0,485, d22 0,454 (Bewertung −0,63). 21…Txe4+: 0,488. 20…Lxe4: 0,484. 13…0-0: 0,419 (scheitert, ist aber auch kein Opfer). | **Beibehalten.** Alle Kandidaten liegen bei −0,2 bis −0,6, also „spielbar“. Unter 1200 Elo wäre 0,40 vertretbar (chess.com: „nicht in schlechter Stellung“), doch dafür gibt es in diesen Partien keinen Fall. |
| **Grundklasse** (unter 1200: Bester oder Exzellent, Verlust < 0,02) | 7…Lxh2+ (570 Elo): Läuferopfer auf h2 mit Mattfolge, d22-Verlust 0,027 → nur Gut. 15.Txe8+: 0,006 (kein Opfer). | Unter 1200 **Verlust < 0,03** erlauben, solange die EP danach ≥ 0,50 ist und der Zug selbst gewinnt (wie hier −2,97 aus Sicht Schwarz, also klar besser). Das wäre näher an chess.com, das auf niedrigem Elo großzügig ist. **Optional**, es gibt nur einen Beleg. |
| **Netto ≥ 1 Bauerneinheit** | 20…Txf4 (D gegen T+L = 1), 13…0-0 (der Springer a6 wird nur getauscht, netto geht ein Bauer verloren, trotzdem meldet die App „Springeropfer“). | Mindestens für den **Text** unterscheiden: Wird die Figur nur getauscht und geht ein Bauer verloren, ist das kein Figurenopfer. Vorschlag: Die Figur zählt nur, wenn der Gegner sie schlägt, **ohne** im selben Abtausch eine gleichwertige Figur zu verlieren (SEE-Folge: erster Rückschlag ist nicht ≥ Figurenwert). |
| **Tiefe** | 7…Lxh2+ (Top bei d16, bei d22 Verlust 0,027), 38.Sg5 (alt 0,942 → 0,969), 19.Dh3 (bekannt). | Brillant-Kandidaten in der App **einmal nachrechnen** (z. B. +4 Halbzüge oder MultiPV 3 nur für diese Stellung). Das kostet kaum Zeit, weil Brillant selten ist. |

### 1.4 Fehlermuster Brillant (mit Codezeilen, `web/js/analysis.js`)

* **B1 – Schach + `parry()` blähen den Gewinn auf (Z. 215–224, 237).** Gibt der Zug Schach, hat der Gegner nur Fluchtzüge oder Zwischenstellen als „ruhige Paraden“. Die verlieren oft mehr, also wird `g = sk − parry` groß, und ein glatter Tausch wird zum Opfer. Belege: 15.Txe8+, 30.Txe7+. Vorschlag: Steht der Gegner nach dem Zug im Schach, `parry` nicht anwenden, also `g = sk`. Allgemeiner: Den Nettowert eines Opfers auf `sk − capv` begrenzen und `parry` nur für die Frage „hängt die Figur?“ verwenden.
* **B2 – Die Rettungsregel fehlt für die gezogene Figur (Z. 276).** Doppelangriff, und der Zug der angegriffenen Figur beseitigt die zweite Bedrohung (Lxb5 schlägt den gabelnden Bauern). Vorschlag: Für `x === mv.to` ebenfalls `HP.has(mv.from) && rescued >= SV[h.type]`, dann `continue`.
* **B3 – „Ohnehin gewonnen“ auf Elo-skalierter EP (Z. 125 mit Z. 35–41).** Siehe 1.3.
* **B4 – Ausnahme fürs Zurückschlagen (Z. 340–342) auch dann, wenn der zurückschlagende Stein selbst geopfert wird** (21…Txe4+). Vorschlag: `recapture` nur, wenn SEE des Zuges ≥ 0 ist.
* **B5 – Tiefenrauschen bei d16** (7…Lxh2+, 38.Sg5). Siehe 1.3.

---

## 2. GROSSARTIG (46 geprüft, d20 MultiPV 3)

**Eindeutig falsch (7): offensichtlicher Materialgewinn durch Schlagen.** Die freie Figur ist nach Spec 5.1 nur ausgeschlossen, wenn SEE ≥ Figurenwert ist (`isFreeCapture`, Z. 283–288). Ein Rückschlag mit einer billigeren Figur hebt den Ausschluss auf, obwohl der Zug genauso offensichtlich ist.

| Partie | Zug | App | richtig | Begründung (SEE) |
|---|---|---|---|---|
| 185983961210 | 18…Lxf7 (zxc4505) | Großartig | Bester | Schlägt die hängende Dame, nur Lxf7 schlägt zurück (SEE 6) |
| 186000059536 | 19…Txd1 (chandureddy16) | Großartig | Bester | Holt die Dame zurück, das ist die Pointe von 18…Dxc5 (SEE 4). Das Großartig gehörte eher zu 18…Dxc5. |
| 186000059536 | 25…exd4 (chandureddy16) | Großartig | Bester | Sammelt den Springer nach der Gabel 24…e5 ein (SEE 2). Die Gabel 24…e5 ist zu Recht Großartig. |
| 185181611092 | 25.Sxd8 (Bleyss) | Großartig | Bester | Sammelt den Turm nach der Gabel 24.Se6+ ein (SEE 2). |
| 186069868192 | 37…Sxe2 (MertAbi69) | Großartig | Bester | Sammelt den Turm nach der Gabel 36…Sd4+ ein (SEE 2). Die Gabel selbst bekam kein Großartig. |
| 186070316870 | 19.axb4 (arackavas) | Großartig | Bester | Holt die Figur im laufenden Abtausch zurück (18…Txc4 19.axb4, SEE 2) |
| 185983648810 | 12…exf3 (Tuananh…) | Großartig | Bester | Schlägt den seit einem Zug angegriffenen Springer (SEE 2) |

Grenzfälle (nicht gezählt): 14.Lxe8 (Abtausch mit Zwischenzügen, SEE 2) und 10…bxc4 (SEE 2). Beide fallen unter dieselbe Regel.
Vorschlag: **kein Großartig, wenn der Zug mit SEE ≥ 2 Material gewinnt.** Das trennt sauber: Alle 9 oben fallen weg. Echte Großartig-Schläge bleiben, denn ihr SEE ist ≤ 0, z. B. 14.Lxa6 (Tausch L gegen S), 18.Sxf6+, 7.Lxd7+ (Zwischenzug).
Ursache im Code: Z. 154–157 mit `isFreeCapture` Z. 283–288 (`see(ch, x) >= SV[m.captured]`).

**Nur tiefenabhängig (6), kein Logikfehler:** 31.Kxc4, 19.Lf2, 27.Sxd5, 6.d4 (EP 69,8 bei d20, knapp unter der Grenze 70), 20.Dg3+ (bei d20 steht auch die Alternative > 70), 23…Taf8. Alle liegen bei d16 knapp über der Schwelle (Abstand 10–12 EP oder Lage-Grenze 70).

**Richtig (33).** Besonders gute Funde: einzige Rettungszüge wie 12.De2, 13.Sc3, 16…Lf8, 20…Db3, 21.Sd4, 15.Df2 und 13…b5, Gabeln wie 24…e5 und 24.Se6+, Mattführungen wie 20.Dxf7+ und 30.Td8+.

## 3. VERPASST (55 geprüft, d20 MultiPV 3)

* **44 bestätigt.** Auch die langen Ping-Pong-Ketten sind echt (185181008812, Züge 14–18: beide Seiten übersehen wiederholt den Gewinn auf d4 bzw. b5).
* **10 tiefenabhängig:** 12…Le7, 25.e5, 8.Tc1, 40.Td2, 40…c5+, 5…Sf6, 9…Lg4, 6.Ld2, 10.Sf6+, 14…Sd4 (bei d20 Fehler bzw. Patzer). Ursache: Verlust knapp unter 0,20 ohne Lagewechsel, oder der Gegnerfehler liegt bei d20 unter 0,10. Das ist kein Logikfehler.
* **1 zweifelhaft:** 186356099444 **19…Kd8** (Mabelgray): Der Zug lässt **Matt** zu (EP danach 0). Er wird trotzdem Verpasst, weil Schwarz vor dem Gegnerfehler auch schon 0 hatte (`wpA ≥ wpPrev − 5`, Z. 161–162). Schachlich ist ein Zug, der Matt zulässt, ein Patzer. Vorschlag: kein Verpasst bei `err === 'allowedMate'` bzw. wenn `wpA` in „verloren“ liegt und die beste Antwort „gewonnen“ war. Nicht in die Prüffälle aufgenommen, weil die chess.com-Praxis hier nicht gesichert ist.

## 4. ERZWUNGEN (39)

Alle 39 haben genau einen legalen Zug. Umgekehrt gibt es keinen Zug mit genau einem legalen Zug ohne dieses Label. Erzwungen hat korrekt Vorrang vor Theorie (185809952338 5.Kxd1 im Caro-Kann-Endspiel). **0 Fehler.**

## 5. THEORIE-GRENZEN (140)

* **Laut Spezifikation 0 Fehler.** Die Kette bricht bei der ersten Stellung außerhalb des Buchs. Kein Theoriezug hat einen EP-Verlust ≥ 0,20. Zweifelhafte, aber benannte Züge (1.g4, 1…g5, 2…Lc5 Busch-Gass, 3…De7, 2.a3) heißen „Theorie“, das macht chess.com genauso.
* **Gegenüber chess.com endet die Theorie in rund 10 Partien zu früh.** Das liegt am Buch (`web/vendor/book.js` enthält nur benannte Lichess-Stellungen und deren Vorstufen), nicht am Code:
  * **Buchlücken:** 2…d6 nach 2.Lc4 (185999063082, 185809482322, 185637999736), 3.Sc3 in der Philidor-Verteidigung (187054798396, 186069569048), 3…Sf6 nach 3.Lc4 (185167389622), Pirc mit 2.Sf3 g6 3.d4 (186070199114), 3.Lc4 im Alt-Sizilianer (186069736928).
  * **Zugumstellung zurück ins Buch, wegen der Kettenregel nicht als Theorie gewertet:** 5.d4 (Französisch Vorstoß, 186356099444), 4.Sc3 exf3 (Blackmar-Diemer, 185983073494), 3.Sf3 (Philidor über Lc4, 185809482322), 3…Sc6 (McDonnell, 185798804076).
* Vorschlag: Das Buch um häufige Hauptzüge ergänzen (z. B. alle Stellungen mit ≥ N Partien aus einer Meisterdatenbank, bis Zug 10). Optional: Die Rückkehr ins Buch innerhalb der ersten 10 Züge als Theorie zählen. chess.com wertet nach meinem Verständnis die Stellung, nicht die Zugfolge, das ist aber nicht belegt.

---

## 6. Die 5 wichtigsten Fehlermuster

1. **Tausch mit Schach gilt als Opfer** (`parry()` im Schach, Z. 237/215). Belege: 15.Txe8+, 30.Txe7+ → falsche Brillanten.
2. **„Ohnehin gewonnen“ wird auf Elo-skalierter EP gemessen und bei d16 übersehen** (Z. 125, 35–41). Unter 1200 Elo gelten so +8 bis +10 als „nicht gewonnen“. Belege: 38…Dxe4+, 38.Sg5 → falsche Brillanten. Vorschlag: Elo-unabhängig, Alternative ≥ +6,00 oder Matt.
3. **Schadensbegrenzung beim Doppelangriff wird für die gezogene Figur nicht erkannt** (Z. 276). Beleg: 14.Lxb5 → falscher Brillant.
4. **Großartig für offensichtlichen Materialgewinn** (Freie-Figur-Regel zu eng, Z. 283–288). 7 Fälle, z. B. 18…Lxf7 (Dame), 19…Txd1, 25.Sxd8, 37…Sxe2. Vorschlag: kein Großartig bei SEE ≥ 2.
5. **Schwellen-/Tiefenrauschen bei d16**: 17 Sonderlabels kippen bei d20/22 (6 Großartig, 10 Verpasst, 1 Brillant). Vorschlag: Sonderlabel-Kandidaten in der App mit +4 Halbzügen nachrechnen. Daneben die Ausnahme fürs Zurückschlagen bei eigenem Opfer (21…Txe4+, möglicher verpasster Brillant) und Theorie-Lücken im Buch.

## 7. Dateien

* `test/klassen/echte_partien.jsonl`, `echte_partien.ok`: Daten (70 Partien, legal)
* `test/klassen/echte.mjs`: Einstufung aller Partien mit der App-Logik (`--tiefe`, `--nur <id>`, `--json`)
* `test/klassen/run.mjs`: neue Option `--faelle <datei>`
* `team/echte16.json`: alle 3840 Züge mit App-Klasse, wpA, wpB, wpAlt, Opfer
* `team/opferkandidaten.mjs`, `team/kandidaten.json`: Opfer-Kandidaten
* `team/pruefe_sonderlabels.py`, `team/d22_brillant.json`, `team/d20_rest.json`, `team/cache_d22/`: Nachprüfung
* `team/faelle_sonderlabels.json`: 10 neue Prüffälle (5 falsche Brillanten, 3 Schutzfälle für echte Brillanten, 2 Großartig-Materialgewinn; die letzten beiden setzen die vorgeschlagene Spec-Änderung voraus)
