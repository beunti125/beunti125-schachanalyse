# Befund: Zugeinstufung gegen Prüfstand (Stand 2026-11-12, App version.json 28)

Lauf: `node test/klassen/run.mjs` (Stockfish nativ, Tiefe 16, MultiPV 2, Cache in `test/klassen/cache/`).
Schachliche Prüfung der Erwartungen: `python3 -I test/klassen/pruefe_faelle.py` (Tiefe 20, MultiPV 3) → 37/37 Fälle schachlich bestätigt.

**Ergebnis: 37 Fälle, 28 bestanden, 9 gescheitert.** Vollständige Ausgabe inkl. aller Texte: `test/klassen/ergebnis.json`.

| Fall | Zug | App | erwartet | Ursache |
|---|---|---|---|---|
| sufyannz_19Qh3 (Elo 607) | 19.Qh3 | Brillant, „Du opferst die Dame auf h3“ | Bester/Exzellent/Gut, kein Opfertext | A + B |
| sufyannz_19Qh3_elo1500 | 19.Qh3 | Brillant, gleicher Text | dto. | A + B |
| legal_5Nxe5_elo800 | 5.Nxe5 | Brillant, „opferst den Springer auf e5“ | falls Opfer: die Dame d1 | B + C |
| reti_8Nxe4 | 8...Nxe4 | Bester Zug („Klar: den Springer schlagen“) | Patzer, Matt zugelassen (Matt in 3) | D |
| fool_2g4 | 2.g4 | Theorie, „Alles im grünen Bereich“ | Patzer, Matt in 1 zugelassen | E |
| fool_2Qh4mate | 2...Qh4# | Theorie | Bester Zug | E |
| opera_17Rd8mate | 17.Rd8# | Großartig, Text „Der Zug Schachmatt.“ | Bester Zug | F + G |
| legal_7Nd5mate | 7.Nd5# | Großartig, „Der Zug Schachmatt.“ | Bester Zug | F + G |
| scholar_4Qxf7mate | 4.Qxf7# | Großartig | Bester Zug | F |

Bestanden u. a.: alle echten Brillant-Opfer (Opera 16.Qb8+, Evergreen 21.Qxd7+, Réti 9.Qd8+, Lasker 11.Qxh7+, Französisch 9.Bxh7+), Zurückschlagen, Rückzüge, Erzwungen, Großartig 6.Bxf7+, Verpasst, Patzer mit Matt (außer D/E).

## Ursachen im Code

### A – Hauptvarianten-Opfer prüft nicht, *welche* Figur geschlagen wird (analysis.js 159–162, 180)
`pvPiece` (Z. 159–161) ist wahr, sobald der Gegner in den ersten 3 Halbzügen der Engine-Linie *irgendeine* eigene Nicht-Bauern-Figur schlägt; `pvSac` (Z. 162) verlangt nur, dass die Bilanz zwei Halbzüge lang ≥ 2 unter `b0` liegt.
Bei 19.Qh3 lautet die Linie nachher `Nxc4 f4 Rg4 …`: Schwarz schlägt den Läufer c4, **der schon vor dem Zug hing** (Ne5xc4). Die Prüfung „hing schon vorher“ (`preH`, Z. 174–178) wird **nur auf den statischen Teil `stat`** angewendet, nicht auf `pvSac`. Ab Elo 1200 gilt sogar *nur* `pvSac` (Z. 180) – deshalb scheitern beide Elo-Varianten.
Es fehlt außerdem jeder Bezug zum gezogenen Zug: Geprüft werden müsste, ob die geschlagene Figur durch den Zug neu angreifbar/ungedeckt wurde (Feld `m.to` oder durch den Zug entblößt) und ob sie *vorher* sicher stand.

### B – Erklärtext nennt immer die gezogene Figur als Opfer (explain.js 152–153, 158–159)
`t = … ${giver} ${AKK[m.piece]} auf ${m.to}` – die Opferfigur wird nicht von `isSacrifice` übergeben (die Funktion liefert nur `true/false`, analysis.js Z. 154/206; `finish` speichert das Opfer gar nicht in `out`, Z. 244). Folgen:
- 19.Qh3: „Du opferst die Dame auf h3“, obwohl der Läufer c4 geschlagen wird.
- Légal 5.Nxe5 (Elo 800): „opferst den Springer auf e5“, tatsächlich hängt die Dame d1 (Bxd1?? Bxf7+ Ke7 Nd5#).
- Z. 158–159: Schlägt die Antwort nicht auf `m.to` (`capT` falsch), behauptet der Text „Annehmen geht nicht gut, deshalb spielt … Nxc4“ – dabei *ist* Nxc4 das Schlagen einer (anderen) Figur.

### C – Statisches Opfer unter Elo 1200 meldet jede neu hängende Figur (analysis.js 164–178, 180)
`hanging` sammelt alle Felder, auf denen der Gegner mit Nettogewinn ≥ 2 schlagen kann; `stat` ist wahr, wenn irgendein Feld neu ist. Welche Figur das ist (bei Légal die Dame d1, *nicht* der gezogene Springer), geht verloren (siehe B). Zudem zählt Z. 169 nur „gedeckt ja/nein“ und den Wert des ersten Schlagenden – keine Abtauschbilanz (SEE), keine Prüfung, ob das Schlagen sofort Matt/Materialrückgewinn erlaubt.

### D – Eigene MultiPV-Bewertung überschreibt die genauere Nachher-Bewertung (analysis.js 193–197)
Ist der gespielte Zug eine MultiPV-Linie der Vorher-Suche, wird deren Wert genommen (Z. 195–196) und bei `isBest` zusätzlich `wpA = max(wpA, wpB)` (Z. 197). In Réti–Tartakower sieht Tiefe 16 vorher `Nxe4 +0.94` als besten Zug (Horizont), die Nachher-Suche findet **M3 für Weiß** (Qd8+!!). Diese Information wird verworfen → „Bester Zug“, `err=null`, Text „Klar: den Springer schlagen, gleichwertiger Tausch“. Mindestens bei Matt gegen den Ziehenden (oder großer Abweichung) muss die Nachher-Bewertung gelten.

### E – Theorie hat Vorrang vor jeder Bewertung (analysis.js 132, 202)
`classifyMove` gibt bei `inBook` sofort `'book'` zurück. Die Eröffnungsdatenbank (`web/vendor/book.js`) enthält auch Fallen wie „Barnes Opening: Fool's Mate“ → 2.g4?? (Matt in 1 zugelassen) wird „Theorie – Alles im grünen Bereich“, 2...Qh4# ebenfalls. Theorie darf nur gelten, wenn der Zug laut Engine nicht schlecht ist (z. B. `loss < EP.inaccuracy` und kein Matt).

### F – Mattzüge werden „Großartig“ (analysis.js 143, 205)
Großartig = Abstand zum zweitbesten Zug ≥ `greatGap` und Alternative nicht gewonnen. Ein Matt in 1 erfüllt das fast immer (alle anderen Züge sind „schlechter“). `obvious` (Z. 205) kennt nur Zurückschlagen und Schlagen gleich-/höherwertiger Figuren, nicht „setzt matt“ oder „einziger naheliegender Zug“. Schachlich ist ein Matt in 1 der beste Zug, keine besondere Leistung.

### G – Kaputter Satz bei Matt (explain.js 26, 167–169)
`describe` liefert bei Matt `text: 'Schachmatt'` (Z. 26); der Großartig-Zweig baut daraus „Der Zug Schachmatt.“ (Z. 168–169). Ebenso fehlt dort ein Verb.

## Weitere Beobachtungen (Fälle bestehen, aber auffällig)
- Evergreen 20.Rxe7+ (Turmopfer, einziger Gewinnzug) wird nur „Großartig“, weil die Engine-Linie das Opfer ablehnt (Kd8) und ab Elo 1200 nur `pvSac` zählt (Z. 180). Korpus lässt Brillant|Großartig zu – Spezifikation sollte das festlegen.
- Großartig-Text nennt als „Viele hätten hier … gespielt“ einfach die zweite Engine-Linie (explain.js 170–173), auch wenn sie absurd ist (Opera: „f4“).
- Der Prüfstand nutzt nativen Stockfish (volles NNUE); die App im Browser nutzt Stockfish 19 *lite* mit `movetime 900` – Horizont-Effekte wie D treten dort eher häufiger auf.

## Prüfstand
- `run.mjs` ruft die echten Exporte `analyseGame` (mit Engine-Attrappe, die nativen Stockfish nutzt, gleiche Datenform wie `engine.js`), `parseGame`, `explain` (aus beiden Perspektiven) und `coachText` auf. App-Dateien unverändert; `esm-shim.mjs` erzwingt ESM-Format für `web/**/*.js`.
- `faelle.json`: 37 Fälle mit `erwartet`/`nicht`/`opfer`/`fehlertyp`/`text`/`textNicht` und schachlichen Behauptungen `sf`, die `pruefe_faelle.py` mit python-chess + Stockfish prüft.
