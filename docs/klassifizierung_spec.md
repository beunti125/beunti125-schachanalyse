# Zugeinstufung nach dem Prinzip von chess.com – Spezifikation

Status: umgesetzt (Analyse-Version 8, Nachträge vom 12.11.2026 in **Abschnitt 11** – sie gehen den älteren Abschnitten vor). Betrifft `web/js/analysis.js` (`classifyMove`, `findSacrifices`, `finish`) und die Texte in `web/js/explain.js`.
Stand: 12.11.2026. Alle Prüffälle unten wurden mit python-chess auf Legalität geprüft und mit Stockfish (Tiefe 22, MultiPV 3) gegengerechnet. Ein Python-Prototyp dieser Regeln besteht alle 23 Fälle.

---

## 0. Kurzfassung (die 10 Kernregeln)

1. Grundklasse = Verlust an **Expected Points (EP)** gegenüber dem besten Zug: Bester 0 · Exzellent ≤ 0,02 · Gut ≤ 0,05 · Ungenauigkeit ≤ 0,10 · Fehler ≤ 0,20 · Patzer > 0,20.
2. **Opfer** heißt: Nach dem Zug kann der Gegner eine **eigene Figur (Springer, Läufer, Turm oder Dame, nie ein Bauer)** mit echtem Materialgewinn schlagen. Geprüft wird jede eigene Figur, nicht nur die gezogene.
3. „Echter Gewinn“ wird **statisch** bestimmt, nicht über die Hauptvariante: mit einer legalen Abtauschrechnung (SEE), sofortigen Gegenschlägen und der besten ruhigen Parade des Gegners. Netto muss mindestens 1 Bauerneinheit verloren gehen, abzüglich dessen, was der Zug selbst geschlagen hat.
4. Eine Figur, die **schon vor dem Zug hing**, zählt nicht als Opfer, wenn der Zug eine gleich- oder höherwertige bedrohte Figur rettet (Schadensbegrenzung bei Doppelangriff). Ein **Rückzug** einer angegriffenen Figur ist darum nie ein Opfer.
5. Gefesselte Angreifer zählen nicht. Bei einer absoluten Fesselung verhindert das die Legalität, bei einer relativen Fesselung der Gegenschlag. Schlägt der Gegner und verliert dadurch sofort gleich viel, ist es ein Tausch und kein Opfer. Eine gefangene Figur, die sich teuer verkauft (Desperado), ist kein Opfer.
6. **Brillant** = Bester Zug (unter 1200 Elo auch Exzellent) + mindestens ein Opfer + danach EP ≥ 0,45 + ohne den Zug nicht ohnehin völlig gewonnen (bester anderer Zug EP < 0,90, unter 1200 < 0,95).
7. **Großartig** = Bester Zug, der bester anderer Zug ist um ≥ 0,10 EP schlechter (0,15 ab 2200 Elo) **und** fällt in eine schlechtere Lage-Kategorie (verloren / offen / gewonnen).
8. **Verpasst** = Der Gegner hat gerade einen Fehler gemacht, du hättest eine bessere Lage erreichen können, dein Zug kostet ≥ 0,10 EP, du stehst aber nicht schlechter als vor seinem Fehler. Sonst bleibt der Zug Fehler oder Patzer.
9. **Kein Sonderlabel** für Zurückschlagen, Antworten auf Schach, Damenumwandlung oder Mattsetzen. Großartig zusätzlich nie für das Schlagen freier Figuren.
10. **Erzwungen** = genau ein legaler Zug. **Theorie** = die Stellung steht im Eröffnungsbuch, und alle vorherigen Züge waren auch Theorie.

---

## 1. Quellen und was chess.com wirklich veröffentlicht

| Quelle | Inhalt |
|---|---|
| chess.com Help Center, „How are moves classified? What is a ‘blunder’ or ‘brilliant’, etc.?“ – https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc | Tabelle der EP-Grenzen (Best 0,00 · Excellent 0,00–0,02 · Good 0,02–0,05 · Inaccuracy 0,05–0,10 · Mistake 0,10–0,20 · Blunder 0,20–1,00). Great = „critical to the outcome“: verloren → ausgeglichen, ausgeglichen → gewonnen oder der einzige gute Zug. Bei neueren Spielern großzügiger. Brilliant = „when you find a good piece sacrifice“. Kein Brilliant, wenn man danach schlecht steht oder auch ohne den Zug völlig gewonnen hätte. „We are also more generous in defining a piece sacrifice for newer players compared to those who are higher-rated.“ Miss = einen gegnerischen Fehler nicht ausnutzen. Die Bewertungsgrenzen für gewonnen, ausgeglichen und verloren hängen von der Wertung ab. |
| chess.com-Forum, „Erik Confirms What Makes a Move Brilliant“ (CEO Erik Allebest, State of Chess.com, 30.03.2021) – https://www.chess.com/forum/view/game-analysis/erik-confirms-what-makes-a-move-brilliant | Früher hing Brilliant davon ab, was die Engine erst spät fand. Neu: „a move that seems counterintuitive at first but ends up being a winning move“. Danach folgte die Opfer-Definition. |
| chess.com-Foren „brilliant moves depend on rating?!“ und „Are Brilliant Moves scaled to ELO rating?“ – https://www.chess.com/forum/view/site-feedback/brilliant-moves-depend-on-rating, https://www.chess.com/forum/view/general/are-brilliant-moves-scaled-to-elo-rating | Zitieren den Help-Center-Text: Elo-Abhängigkeit gewollt, „not completely winning even if you hadn't found the move“. Keine Aussagen von Mitarbeitern zu Formeln. |
| **WintrChess** (Nachfolger von freechess), Quellcode: https://github.com/WintrCat/wintrchess, Dateien `shared/src/lib/reporter/classify.ts`, `classification/brilliant.ts`, `classification/critical.ts`, `classification/pointLoss.ts`, `utils/pieceSafety.ts`, `utils/dangerLevels.ts`, `utils/pieceTrapped.ts`, `utils/criticalMove.ts` | Opfer **statisch** über „unsichere Figuren“ aller eigenen Figuren (kein Bauer, kein König, wertvoller als die geschlagene Figur). **Zieht der Zug eine Figur in Sicherheit (weniger unsichere Figuren als vorher, kein Schach), gibt es kein Brilliant.** „Danger levels“: Wenn jedes Schlagen der Figur eine gleich große oder größere Gegendrohung zulässt, ist es kein Opfer. Gefangene Figuren (Desperado) zählen nicht. Kandidaten-Filter: kein Brilliant oder Critical, wenn der zweitbeste Zug ≥ +7,00 hat, nach dem Zug < 0, bei Damenumwandlung oder wenn man vorher im Schach stand. Critical: zweitbester Zug ≥ 0,10 EP schlechter, nicht das Schlagen freier Figuren, nicht bei eigenem Matt. EP = 1/(1+e^(−0,0035·cp)). |
| **freechess** (älter, gleicher Autor): https://github.com/WintrCat/freechess, `src/lib/analysis.ts`, `src/lib/board.ts` (`isPieceHanging`) | Brilliant nur bei „Best“, nicht „winningAnyways“ (zweitbester Zug ≥ 700 cp), keine Umwandlung, kein Schach vorher. Hängende Figur: Angreifer mit geringerem Wert oder mehr Angreifer als Verteidiger, mit Ausnahmen. Kein Brilliant, wenn jedes Schlagen eine gleichwertige Gegenfigur hängen lässt. Great: Gegner hat gepatzt, und der Abstand zum zweitbesten Zug beträgt ≥ 150 cp. |
| **Chesskit**: https://github.com/GuillaumeSD/Chesskit, `src/lib/engine/helpers/moveClassification.ts`, `src/lib/chess.ts` (`getIsPieceSacrifice`, `isSimplePieceRecapture`) | „Splendid“ (Brilliant): Opfer über die Materialbilanz entlang der Hauptvariante. Der Gewinn-% darf nicht unter 50 fallen, die Alternative darf nicht > 97 % stehen. „Perfect“ (Great): kein bloßes Zurückschlagen, Lagewechsel über 50 % oder Abstand zur Alternative > 10 %-Punkte. Die Gewinnkurve stammt von Lichess (−0,00368208). |
| Chessigma-Blog „brilliant move chess“: https://www.chessigma.com/blog/brilliant-move-chess | Nur Laien-Zusammenfassung („no sacrifice, no brilliant“). Keine Zahlen. |

**Lehre aus den Nachbauten.** Chesskit erkennt Opfer über die Hauptvariante. Das ist genau der Fehler, den unsere App v28 auch macht (siehe Abschnitt 6): Die Variante zeigt, *dass* Material verloren geht, aber nicht, *ob es ein freiwilliges Opfer war* und *welche Figur* betroffen ist. WintrChess ist der beste Ausgangspunkt (statisch, alle Figuren, Regel „in Sicherheit ziehen ist kein Opfer“). Unten wird es um eine saubere Abtauschrechnung und die Doppelangriff-Regel ergänzt.

**Was chess.com NICHT veröffentlicht (eigene Annahmen, als solche markiert):** die genaue EP-Formel und ihre Elo-Skalierung, alle Zahlen für „völlig gewonnen“, „danach nicht schlecht“ und „einziger guter Zug“, die Grenzen der Lage-Kategorien, die Rechentiefe, die genaue Opfer-Definition (Mindestwert, Umgang mit Fesselungen, angenommen oder abgelehnt), die Großzügigkeit für Anfänger in Zahlen und die Reihenfolge von Theorie und Erzwungen. In Abschnitt 7 ist jede Annahme mit **[A]** markiert.

---

## 2. Grundgrößen

### 2.1 Engine-Daten pro Stellung
* Analyse jeder Stellung mit **MultiPV 3** (mindestens 2), gleiche Tiefe für alle Stellungen.
* **Bewertung des gespielten Zuges:** Ist er eine der MultiPV-Linien, wird deren Bewertung genommen. Sonst wird die Stellung *vor* dem Zug mit `go depth D searchmoves <zug>` gerechnet. Die Bewertung der Folgestellung wird nur ersatzweise genommen, denn eine andere Suche bedeutet Tiefenrauschen. Ist der gespielte Zug der Top-Zug, gilt `EP_play = EP_best`.
* `EP_alt` = EP der besten MultiPV-Linie, deren erster Zug **nicht** der gespielte ist.
* Die Hauptvariante nach dem Zug (`PV_after`) dient **nur für Erklärtexte**, nie zur Opfer-Erkennung.

### 2.2 Expected Points (EP)
Alle Werte gelten aus Sicht des Ziehenden und liegen zwischen 0 und 1.
```
eloFactor(R) = clamp(0.45 + R/1800, 0.55, 1.35)                    [A] (bestehende App-Formel)
EP(cp, R)    = 1 / (1 + exp(-0.00368208 * clamp(cp,-1500,1500) * eloFactor(R)))
EP(Matt für mich) = 1,   EP(Matt gegen mich) = 0
loss = max(0, EP_best − EP_play)
```
Hintergrund: chess.com sagt, dass dieselbe Bewertung für schwächere Spieler „weniger gewonnen“ ist. Das bildet der Elo-Faktor ab. R ist die Wertung **des Ziehenden**.

### 2.3 Lage-Kategorien (für Großartig und Verpasst) [A]
```
cat(EP) = 0 (verloren) wenn EP < 0.30;  2 (gewonnen) wenn EP > 0.70;  sonst 1 (offen/ausgeglichen)
```
Wegen des Elo-Faktors liegt „gewonnen“ bei 1500 Elo ab etwa +1,8 und bei 600 Elo ab etwa +2,9 Bauern.

### 2.4 Materialwerte
`B=1, S=3, L=3, T=5, D=9, K=∞` (König nur als Schlagender relevant).

---

## 3. Grundklassen (Expected-Points-Tabelle)

| Klasse | Bedingung | Herkunft |
|---|---|---|
| Bester Zug | gespielter Zug = Top-Zug **oder** loss < 0,005 | chess.com 0,00. Die Toleranz 0,005 gegen Engine-Rauschen ist [A]. |
| Exzellent | loss ≤ 0,02 | chess.com |
| Gut | loss ≤ 0,05 | chess.com |
| Ungenauigkeit | loss ≤ 0,10 | chess.com |
| Fehler | loss ≤ 0,20 | chess.com |
| Patzer | loss > 0,20 | chess.com |

Mattsonderfall (nach WintrChess) [A]: Wenn Top-Zug **und** gespielter Zug beide ein Matt für den Ziehenden bewerten, gilt: gleich lang oder kürzer ⇒ Bester. 1 Zug länger ⇒ Exzellent. 2–6 Züge länger ⇒ Gut. Sonst Ungenauigkeit. Wer verliert und das Matt maximal hinauszögert, spielt den besten Zug.

---

## 4. Was ist ein Opfer? (schachlich und formal)

### 4.1 Schachliche Definition
Ein Opfer liegt vor, wenn der Ziehende **freiwillig Material hergibt**, das der Gegner **sofort und ohne unmittelbare Gegenrechnung** gewinnen kann. Die Kompensation liegt erst tiefer: Angriff, Matt, Rückgewinn nach Zwischenzügen.

* **Welche Figur?** Jede eigene Figur. Die gezogene Figur ist nur ein möglicher Fall.
  * *Opfer der gezogenen Figur*: Sie zieht auf ein Feld, auf dem sie verloren geht (Läuferopfer auf h7, Dame auf d8+).
  * *Opfer durch Stehenlassen*: Der Zug lässt eine **andere** Figur ungedeckt. Das passiert durch Abzug, durch das Wegziehen des Verteidigers, durch eine geöffnete Linie oder durch das Ignorieren eines Angriffs (Legal: Sxe5 lässt die Dame d1 stehen, Fischer: …Le6 lässt die Dame b6 stehen).
* **Figur, die schon vorher hing.** Bedroht der Gegner mit seinem letzten Zug zwei Figuren (Doppelangriff) und rettet der Zug die wertvollere, dann ist der Verlust der anderen kein Opfer, sondern **Schadensbegrenzung**. Hing eine Figur vorher und **lässt** der Zug sie hängen, *ohne* etwas gleich Wertvolles zu retten, ist das dagegen ein Opfer durch Stehenlassen (Fischer 17…Le6!!: Dame b6 war angegriffen, Schwarz rettet sie nicht).
* **Rückzug einer angegriffenen Figur:** Er beseitigt die Bedrohung und ist daher nie ein Opfer.
* **Tausch vs. Opfer:** Wenn der Gegner nach dem Schlagen mindestens gleich viel zurückgibt (Rückschlag auf demselben Feld, siehe SEE), ist es ein **Tausch**. Wenn er durch das Schlagen sofort etwas anderes mindestens gleich Wertvolles verliert (Gegenschlag, relative Fesselung), ist es **kein echtes Hängen**.
* **Fesselungen:** Ein absolut gefesselter Angreifer kann nicht schlagen, denn der Zug ist illegal. Ein relativ gefesselter Angreifer kann schlagen, verliert aber sofort die Figur dahinter. Das ist kein Opfer.
* **Indirekte Deckung durch Gegendrohung:** Kann der Gegner nur schlagen, indem er eine größere eigene Drohung ignoriert (18…Tg5: Se5 „hängt“, aber Lxe5 verliert die Dame h5), dann ist das kein Opfer.
* **Zwischenzüge:** Was erst nach einem Zwischenzug (Schach, Drohung) zurückkommt, ist die Kompensation des Opfers und gehört nicht zur statischen Prüfung. Das Opfer bleibt also ein Opfer.
* **Matt nach Annahme:** Folgt nach der Annahme ein Matt, zählt das **nicht** als Gegenrechnung. Mattopfer sind die klassischen Brillanten (Réti–Tartakower 9.Dd8+!!).
* **Angenommen oder abgelehnt:** Beides zählt. Ob die beste Antwort annimmt, ändert nichts daran, dass ein Opfer angeboten wurde (Fischer 17…Le6, Legal 5.Sxe5: Die beste Antwort lehnt jeweils ab). Die Information wird nur für den Text verwendet.
* **Bauern zählen nicht** (chess.com: „piece sacrifice“). Bauernopfer und Gambits ergeben nie Brillant.
* **Mindestwert:** Die geopferte Figur ist mindestens ein Springer oder Läufer, und der Nettoverlust beträgt mindestens 1 Bauerneinheit. Damit zählt „Figur für 2 Bauern“ (Morphy 10.Sxb5!), Qualitätsopfer (T für L/S) und mehr.
* **Desperado:** Eine Figur, die vor dem Zug hing und *auf keinem* Zielfeld sicher wäre (gefangen), verkauft sich nur teuer. Das ist kein Opfer (Noahs Arche 12.Lxc4).

### 4.2 Formale Definition
Notation: `S` = Ziehender, `O` = Gegner, `P` = Stellung vor dem Zug `m`, `Q` = Stellung nach `m`. `cap(m)` = Wert der von `m` geschlagenen Figur (0 wenn keine; en passant 1).

**(a) Legale Abtauschrechnung `SEE(pos, c)`**: Gewinn des Schlagenden, wenn `c` auf Feld `x` schlägt. Danach schlägt abwechselnd die jeweils **billigste legal schlagende** Figur zurück, und jede Seite darf aufhören:
```
SEE(pos, c) = wert(figur auf c.to) − max(0, SEE(pos+c, billigsterLegalerSchlag(pos+c, c.to)))
```
Die Züge werden tatsächlich gemacht (chess.js `move`/`undo`). Dadurch werden absolute Fesselungen und Röntgenangriffe (Batterien) automatisch richtig behandelt.

**(b) Bester Sofortschlag `K(pos, ohneFeld x)`**: max(0, max SEE über alle legalen Schlagzüge der Seite am Zug, außer Schlägen auf `x`).

**(c) Beste ruhige Parade `Parry(Q)`**: Über alle **nicht schlagenden** legalen Züge `q` von `O` in `Q` wird das Maximum von `−K(Q+q)` genommen. Das Ergebnis ist ≤ 0: So viel verliert O mindestens, wenn er einfach pariert, statt zu schlagen.

**(d) Echter Gewinn beim Schlagen von X (Feld x) in Q**:
```
gain(Q, x) = max über legale O-Schläge c auf x mit SEE(Q,c) ≥ 1 von:
             SEE(Q, c) − K(Q+c, ohne x) − Parry(Q)
           (0, wenn es keinen solchen Schlag gibt)
```
* `K(Q+c, ohne x)` ist der Gegenschlag, den S nach der Annahme sofort hat. Er erfasst relative Fesselungen, überlastete Verteidiger und ignorierte Drohungen (Tg5 → Txh5). Ein Rückschlag auf `x` steckt schon im SEE.
* `−Parry(Q)` verhindert, dass eine Drohung, die O sowieso nicht parieren kann, das Opfer kleinredet.

**(e) Hängende Figuren**
```
H_Q = { X ∈ S-Figuren, Typ ∈ {S,L,T,D} : gain(Q, x) ≥ 1 }
H_P = dieselbe Menge in P mit O am Zug (Nullzug; en-passant-Feld löschen). Leer, wenn S in P im Schach steht.
```

**(f) Geopferte Figuren Σ(m)** – X ∈ H_Q mit `net(X) = gain(Q,x) − cap(m) ≥ NEED` (NEED = 1) und:
1. **X ist die gezogene Figur** (x = m.to): Sie zählt, *außer* sie stand schon in H_P **und** jedes legale Zielfeld dieser Figur liegt in H (gefangen, also Desperado).
2. **X wurde nicht gezogen und X ∉ H_P**: Sie zählt (Stehenlassen durch Abzug, Wegziehen des Verteidigers, Linienöffnung).
3. **X wurde nicht gezogen und X ∈ H_P (hing schon)**: Sie zählt **nur, wenn** `m` keine **Rettung** ist. Rettung heißt: Es gibt eine Figur Y ∈ H_P, Y ≠ X, mit Wert(Y) ≥ Wert(X), die nach `m` (auf ihrem neuen Feld, falls Y gezogen wurde) nicht mehr in H_Q ist. Y kann weggezogen, gedeckt, verstellt oder ihr Angreifer geschlagen worden sein.

Ausgabe: Liste `[{feld, figur, net, schonVorherHaengend}]`, sortiert nach Figurenwert. **Diese Liste (nicht `m.piece`) bestimmt den Erklärtext.**

**Aufwand:** etwa 40 Gegnerzüge × 40 Antworten × SEE pro Kandidat. Die Prüfung läuft nur für Züge mit Grundklasse Bester oder Exzellent, also für wenige Züge pro Partie. Für chess.js ist das unkritisch (wenige ms).

### 4.3 Elo-Großzügigkeit beim Opfer [A]
chess.com: „more generous in defining a piece sacrifice for newer players“. Umsetzung:
* R < 1200: Auch **Exzellent** (loss ≤ 0,02) darf Brillant werden. Die Schwelle für „völlig gewonnen“ liegt bei 0,95 statt 0,90.
* Die **Opfer-Definition selbst bleibt gleich**: keine reine Angreifer-gegen-Verteidiger-Zählung und keine Hauptvarianten-Heuristik für Anfänger. Genau diese Großzügigkeit hat v28 den „Damenopfer“-Fehler eingebracht.

---

## 5. Sonderklassen

### 5.1 Offensichtliche Züge (nie Brillant, nie Großartig)
* **Zurückschlagen**: Der Gegner hat im letzten Zug auf Feld x geschlagen, und `m.to == x`. Beispiele: 10…Txc8, 18.Lxd4, Elefantenfalle 6…Sxd5.
* **Antwort auf Schach** (S stand in P im Schach). Gibt es nur einen legalen Zug, ist er Erzwungen.
* **Damenumwandlung** (WintrChess: Umwandlungen nie Brillant).
* **Mattsetzender Zug** ⇒ immer Bester Zug.
* Nur für Großartig gilt zusätzlich: **Schlagen einer freien Figur** (Figur ≥ 3, `SEE ≥ Wert der Figur`, also kein Rückschlag möglich), zum Beispiel 20.Lxe5 oder 6.Sxh4. Brillant bleibt dabei möglich, wenn der Zug *gleichzeitig* eine wertvollere Figur opfert.

### 5.2 Erzwungen
Genau ein legaler Zug. Hat Vorrang vor allem anderen [A] (WintrChess-Reihenfolge, objektive Tatsache).

### 5.3 Theorie
Die Stellung nach dem Zug (Schlüssel: die ersten 4 FEN-Felder) steht im Eröffnungsbuch, **und** der vorige Zug war ebenfalls Theorie (bzw. es ist der erste Zug). Nach der ersten Abweichung gibt es keine Theorie mehr. Die bestehende App-Logik bleibt so.

### 5.4 Brillant
Alle Bedingungen müssen erfüllt sein:
1. Kein offensichtlicher Zug (5.1), nicht Theorie, nicht Erzwungen.
2. Grundklasse **Bester** (R ≥ 1200) bzw. **Bester oder Exzellent** (R < 1200).
3. **Σ(m) ≠ ∅** (mindestens ein echtes Figurenopfer nach Abschnitt 4).
4. **Danach nicht schlecht:** `EP_play ≥ 0.45` [A] (chess.com: „not in a bad position“, Chesskit 0,50, WintrChess Bewertung ≥ 0).
5. **Nicht ohnehin völlig gewonnen:** `EP_alt < W(R)` mit W = 0,90 (R ≥ 1200) bzw. 0,95 (R < 1200) [A]. Bei 1500 Elo entspricht 0,90 etwa +4,6, bei 600 Elo etwa +7,5 (WintrChess: +7,00, Chesskit: 97 %). Hat auch der beste andere Zug ein Matt, ist die Bedingung automatisch verletzt.

### 5.5 Großartig
1. Kein offensichtlicher Zug (inklusive freier Figur), nicht Brillant.
2. Gespielter Zug = **Top-Zug**.
3. **Einziger guter Zug:** `EP_play − EP_alt ≥ G(R)` mit `G(R) = 0.10 + 0.05·clamp((R−1200)/1000, 0, 1)`, also 0,10 bis 1200 Elo und 0,15 ab 2200 [A] (WintrChess: konstant 0,10. „Für Anfänger großzügiger“ heißt: kleinerer Abstand reicht).
4. **Kritisch für den Ausgang:** `cat(EP_alt) < cat(EP_play)`. Ohne den Zug wäre die Lage eine Kategorie schlechter (verloren statt offen oder offen statt gewonnen). Damit gibt es kein Großartig, wenn alle Züge gewinnen oder alle verlieren.
5. Nicht, wenn S bereits ein forciertes Matt hatte und eine Alternative ebenfalls mattsetzt (folgt aus 4).

### 5.6 Verpasst
Voraussetzungen:
* Der vorige Gegnerzug hatte die Klasse Fehler, Patzer oder Verpasst (EP-Verlust des Gegners ≥ 0,10).
* `EP_prev` = EP aus Sicht von S **vor** dem Gegnerzug (beste Bewertung jener Stellung).
* Die Grundklasse des eigenen Zuges ist Fehler oder Patzer (loss ≥ 0,10).
* `cat(EP_play) < cat(EP_best)` (die bessere Lage war erreichbar und wurde verfehlt) **oder** `loss ≥ 0.20`.
* `EP_play ≥ EP_prev − 0.05` [A] (man steht nicht schlechter als vor dem Gegnerfehler).

Dann gilt die Klasse Verpasst. Ist die letzte Bedingung verletzt, bleibt es Fehler oder Patzer: Wer den Fehler des Gegners nicht nutzt *und* selbst etwas einstellt, hat gepatzt.

---

## 6. Algorithmus (Pseudocode)

```text
VAL = {p:1, n:3, b:3, r:5, q:9, k:1000}
NEED = 1

function classify(i):                           # i = Halbzug-Index
  P, Q, m, S = fens[i], fens[i+1], moves[i], m.color
  R = rating(S)
  if legalMoves(P) == 1:                return 'forced'
  if inBook(Q) and (i == 0 or cls[i-1] == 'book'): return 'book'
  if isCheckmate(Q):                    return 'best'

  L      = engine(P).lines                 # MultiPV 3
  EPbest = EP(L[0], R, S)
  own    = L.find(l.move == m) ?? engine(P, searchmoves=[m])
  EPplay = (m == L[0].move) ? EPbest : EP(own, R, S)
  alt    = L.find(l.move != m)
  EPalt  = alt ? EP(alt, R, S) : null
  loss   = max(0, EPbest − EPplay)
  base   = (m == L[0].move or loss < 0.005) ? 'best' : bucket(loss)      # 0.02/0.05/0.10/0.20
  base   = mateAdjust(base, L[0], own)                                   # Abschnitt 3

  inCheck    = isCheck(P)
  recapture  = i > 0 and moves[i-1].captured and m.to == moves[i-1].to
  promoQ     = m.promotion == 'q'
  freeCapt   = m.captured and m.captured != 'p' and SEE(P, m) >= VAL[m.captured]
  obvious    = inCheck or recapture or promoQ

  # ---- Brillant ----
  if not obvious and EPalt != null:
     okBase = (R < 1200) ? base in {best, excellent} : base == best
     W      = (R < 1200) ? 0.95 : 0.90
     if okBase and EPplay >= 0.45 and EPalt < W:
        sac = sacrifices(P, m)                      # Abschnitt 4.2, nur hier berechnen
        if sac not empty: return ('brilliant', sac)

  # ---- Großartig ----
  if not obvious and not freeCapt and base == 'best' and EPalt != null:
     if EPplay − EPalt >= G(R) and cat(EPalt) < cat(EPplay): return 'great'

  # ---- Verpasst ----
  if i > 0 and base in {mistake, blunder} and cls[i-1] in {mistake, blunder, miss}:
     EPprev = EP(engine(fens[i-1]).lines[0], R, S)
     if EPplay >= EPprev − 0.05 and (cat(EPplay) < cat(EPbest) or loss >= 0.20):
        return 'miss'

  return base


function sacrifices(P, m):
  S = P.turn;  Q = P + m;  capv = value(m.captured)
  HQ = hanging(Q, S)                       # {feld: gain}
  HP = isCheck(P) ? {} : hanging(nullMove(P), S)
  rescued = max Wert(Y) für Y in HP, deren (neues) Feld nicht in HQ ist   (0 wenn keine)
  out = []
  for (x, g) in HQ:
     net = g − capv;  if net < NEED: continue
     X = Q.get(x)
     if x == m.to:                                         # gezogene Figur
        if m.from in HP and trapped(P, m.from): continue   # Desperado
     else if x in HP:                                      # hing schon vorher
        if rescued >= VAL[X.type] (und Y ≠ X): continue    # Schadensbegrenzung
     out.push({x, X.type, net, vorher: x in HP})
  return sortByValueDesc(out)

function hanging(pos, S):                  # pos: O am Zug
  for each S-Figur X (n,b,r,q) auf x:
     best = 0;  parry = Parry(pos)  (einmal je Stellung cachen)
     for each legaler O-Schlag c auf x:
        s = SEE(pos, c);  if s < 1: continue
        k = K(pos + c, ohneFeld = x)
        best = max(best, s − k − parry)
     if best >= 1: H[x] = best
  return H

function trapped(P, from):  every legaler Zug der Figur von 'from' landet auf einem Feld in hanging(P+zug, S)
```

**Wichtig für die Erklärung (explain.js / coachText):**
* Die geopferte Figur ist `sac[0]` (die wertvollste). Text: „Du opferst {AKK[sac[0].typ]} auf {sac[0].feld}“. Das ist **nicht** `m.piece`/`m.to`, außer beide stimmen überein.
* „Angenommen“, wenn `PV_after[0]` auf ein Feld aus `sac` schlägt. Sonst: „Annehmen (`bester Schlag auf sac[0].feld`) verliert wegen …“. Dazu wird die Stellung `Q + Annahme` einmal extra gerechnet und ihre Variante gezeigt.
* Bei jeder anderen Klasse darf das Wort „Opfer“ nicht vorkommen, außer `sac` ist nicht leer (z. B. „Gutes Opfer, aber du warst ohnehin klar gewonnen“, optional).

---

## 7. Schwellen und Annahmen (Übersicht)

| Größe | Wert | Quelle |
|---|---|---|
| EP-Grenzen Best/Exz./Gut/Ungen./Fehler | 0 / 0,02 / 0,05 / 0,10 / 0,20 | chess.com veröffentlicht |
| Toleranz „Bester“ | loss < 0,005 | [A] gegen Engine-Rauschen |
| EP-Kurve | Lichess-Logistik −0,00368208 · eloFactor | [A] chess.com-Formel nicht öffentlich |
| Lage-Kategorien | < 0,30 / 0,30–0,70 / > 0,70 | [A] |
| Opfer: Figurentyp | S, L, T, D (nie Bauer, nie König) | chess.com „piece sacrifice“, WintrChess |
| Opfer: Nettoverlust | ≥ 1 Bauerneinheit nach SEE, Gegenschlag, Parade und `cap(m)` | [A] (WintrChess: Figur wertvoller als das Geschlagene) |
| Brillant: danach | EP_play ≥ 0,45 | [A] (chess.com nur „nicht schlecht“) |
| Brillant: ohnehin gewonnen | EP_alt ≥ 0,90 (R < 1200: 0,95) ⇒ kein Brillant | [A] (WintrChess +7,00, Chesskit 97 %) |
| Brillant: Grundklasse | Bester (R < 1200 auch Exzellent) | [A] (chess.com: „best or nearly best“) |
| Großartig: Abstand | 0,10 (≤ 1200) bis 0,15 (≥ 2200) | [A] (WintrChess 0,10) |
| Großartig: Lagewechsel | cat(alt) < cat(play) | chess.com-Text (verloren→ausgeglichen, ausgeglichen→gewonnen) |
| Verpasst | Gegner ≥ 0,10 verloren, eigener Zug ≥ 0,10, nicht schlechter als vorher (−0,05) | chess.com-Text; Zahlen [A] |
| Erzwungen vor Theorie | ja | [A] |

---

## 8. Der Fall 19.Dh3 (MertAbi69–sufyannz, chess.com 186069736928)

Stellung vor 19.Dh3 (Weiß am Zug):
`2r3k1/pp1pq1p1/4p2p/4nprQ/2BBP3/2P5/PP3PPN/R3R1K1 w - - 1 19`

Stockfish (Tiefe 20, MultiPV 3): **19.Dh3 +5,01** · 19.Dd1 +4,71 · 19.De2 +4,38. EP bei 607 Elo: Dh3 0,82, bester anderer Zug 0,80.

**Was die App v28 tat:** Nachgestellt mit `test/klassen/run.mjs`, Tiefe 16 und 20, beide ergeben „Brillant“. Bei Tiefe 12/14/18 kommt „Bester“ oder „Exzellent“ heraus. Das Ergebnis hängt also von der Rechentiefe ab. `isSacrifice` erkennt über `pvSac`: Die Hauptvariante nach dem Zug beginnt mit 19…Sxc4 20.f4, Weiß liegt zwei Halbzüge lang 3 Punkte zurück, und unter 1200 Elo genügt `stat || pvSac`. Dass der Läufer c4 *schon vor dem Zug* hing, prüft `pvSac` nicht. `explain.js` nennt dann `AKK[m.piece]` = „die Dame“ als Opfer, obwohl die Dame auf h3 von nichts angegriffen wird.

**Zug für Zug, richtig betrachtet:**

| Zug | Was passiert | Opfer? | Richtige Klasse |
|---|---|---|---|
| 17…cxd4 | Schlägt den Bauern, öffnet die c-Linie: Tc8 und Se5 greifen jetzt Lc4 an | – | Bester Zug |
| 18.Lxd4 | **Zurückschlagen** auf d4. Lc4 bleibt angegriffen (Se5, Tc8), aber er hing schon nach 17…cxd4 | nein (Rückschlag, kein Sonderlabel) | Exzellent/Gut, Grenzfall bei loss ≈ 0,02 (cxd4 +5,50 war minimal besser; Lxd4 +5,06) |
| 18…Tg5 | **Doppelangriff**: Tg5 greift Dh5 an, und Lc4 hängt weiter. Se5 steht jetzt vor Ld4, ist aber *indirekt gedeckt*: 19.Lxe5? Txh5. In der Formel: gain = 3 − K(9) − Parry ≤ 0 | nein | Bester Zug (Schwarz steht trotzdem verloren, EP 0,19) |
| **19.Dh3** | **Rückzug der angegriffenen Dame.** H_P = {Dh5 (9), Lc4 (3)}, H_Q = {Lc4 (3)}. Die Dame auf h3 ist von keiner schwarzen Figur angegriffen, also ist **die gezogene Figur nicht geopfert**. Lc4 hing schon vorher, und der Zug rettet die Dame (9 ≥ 3). Das ist Schadensbegrenzung bei einem Doppelangriff, also **kein Opfer**. Σ = ∅. Zusätzlich: Nimmt Schwarz 19…Sxc4, holt Weiß das Material sofort zurück (20.f4 Tg4 21.Sxg4 fxg4 22.Dxg4: Bilanz ±0). | **nein** | **Bester Zug** (Top-Zug, loss 0). Kein Großartig: Dd1/De2 sind kaum schlechter (Abstand 0,02 EP), alle drei Züge stehen „gewonnen“. Kein Brillant: Es gibt kein Opfer. |
| 19…Tf8 | Lässt Se5 stehen und nimmt Lc4 nicht. Bester Zug wäre 19…Sxc4 oder Txc4 (Läufer gewinnen) | – | Ungenauigkeit (loss ≈ 0,07 EP bei 496 Elo; in verlorener Stellung kostet auch ein Figurverlust wenig EP) |
| 20.Lxe5 | Schlägt einen **freien** Springer | – | Bester Zug (kein Großartig, weil freie Figur) |

Hinweis zum v28-Text „Annehmen geht nicht gut“: Der Text bezog sich auf die Dame, die gar nicht angegriffen war. Mit der neuen Ausgabe `sac` gibt es hier keinen Opfertext.

---

## 9. Prüffälle

Alle FENs wurden mit `python-chess` geprüft (`Board.is_valid()`, Zug per `parse_san` legal). Die Bewertungen stammen von Stockfish 17.1 (Tiefe 22, MultiPV 3). Die EP-Werte gelten mit der Elo-Formel aus 2.2. Spalte „v28“ = aktuelle App (`test/klassen/run.mjs`, Tiefe 16) als Ist-Zustand.

**Kontext:** Bei Fällen mit „Vorzug“ ist die FEN die Stellung **vor dem gespielten Zug**. Für Zurückschlagen und Verpasst muss der Vorzug mitgegeben werden (im JSON-Anhang ist er als erster Zug in `zuege` enthalten).

| # | ID / Quelle | FEN (vor dem Zug) | Vorzug | Zug | Elo | Erwartet | v28 | Begründung |
|---|---|---|---|---|---|---|---|---|
| 1 | suf_19Qh3 – Fall sufyannz | `2r3k1/pp1pq1p1/4p2p/4nprQ/2BBP3/2P5/PP3PPN/R3R1K1 w - - 1 19` | 18…Tg5 | Dh3 | 607 | **Bester**, kein Opfer | Brillant ✗ | Rückzug der angegriffenen Dame. Lc4 hing schon vorher, die Dame wird gerettet (Abschnitt 8). |
| 2 | suf_18Rg5 | `2r3k1/pp1pq1p1/4p1rp/4np1Q/2BBP3/2P5/PP3PPN/R3R1K1 b - - 0 18` | 18.Lxd4 | Tg5 | 496 | Bester | Bester | Se5 ist indirekt durch die Gegendrohung Txh5 gedeckt, also kein Opfer. Schwarz steht verloren, daher kein Großartig. |
| 3 | suf_10Raxc8 | `r1N2rk1/pp1pqpp1/2n1p2p/2p5/2B1P1n1/3PBN2/PPP2PPP/R2Q1RK1 b - - 0 10` | 10.Sxc8 | Taxc8 | 496 | Bester | Bester | Zurückschlagen, kein Sonderlabel. Txc8 mit dem anderen Turm ist gleichwertig. |
| 4 | suf_20Bxe5 | `5rk1/pp1pq1p1/4p2p/4npr1/2BBP3/2P4Q/PP3PPN/R3R1K1 w - - 3 20` | 19…Tf8 | Lxe5 | 607 | Bester | Bester | Schlägt eine freie Figur, daher kein Großartig, obwohl es der beste Zug ist. |
| 5 | suf_19Rf8 | `2r3k1/pp1pq1p1/4p2p/4npr1/2BBP3/2P4Q/PP3PPN/R3R1K1 b - - 2 19` | 19.Dh3 | Tf8 | 496 | Ungenauigkeit | Ungen. | Sxc4 gewinnt den Läufer. In verlorener Stellung beträgt der EP-Verlust nur ≈ 0,07. Kein Verpasst, weil 19.Dh3 kein Fehler war. |
| 6 | Réti–Tartakower, Wien 1910 | `rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9` | 8…Sxe4 | Dd8+ | 2000 | **Brillant** (Opfer: Dame) | Brillant | Damenopfer mit Matt (Kxd8 Lg5++ Kc7 Ld8#). Bester anderer Zug Te1 nur EP 0,63. |
| 7 | D. Byrne–Fischer, New York 1956 | `r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 3 17` | 17.Kf1 | Le6 | 2000 | **Brillant** (Opfer: Dame) | Großartig ✗ | Die Dame b6 hing schon (Lc5), wird aber **nicht gerettet**, also Opfer durch Stehenlassen. Die beste Antwort lehnt ab (18.Dxc3). Das zählt trotzdem. Alternative Sb5 EP 0,37. |
| 8 | D. Byrne–Fischer, 11…Sa4!! | `r2q1rk1/pp2ppbp/1np2np1/2Q3B1/3PP1b1/2N2N2/PP3PPP/3RKB1R b K - 6 11` | 11.Lg5 | Sa4 | 2000 | **Brillant** (Opfer: Springer) | Bester ✗ | Der Springer zieht auf ein Feld, auf dem er nach Sxa4 verloren geht. Bester Zug, Alternative Te8 EP 0,55. |
| 9 | Morphy – Herzog/Graf, Paris 1858 (Opernpartie) | `rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10` | 9…b5 | Sxb5 | 2000 | **Brillant** (Opfer: Springer) | Großartig ✗ | Figur gegen zwei Bauern (Netto 1 erfüllt den Mindestwert). Bester Zug, Alternative Lxf6 EP 0,67. |
| 10 | Legal – Saint Brie, Paris 1750 | `rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5` | 4…g6 | Sxe5 | 1200 | **Brillant** (Opfer: Dame) | Bester ✗ | Opfer durch Stehenlassen: Dd1 hängt am Lg4. Se5 selbst ist kein Opfer (dxe5 Dxg4 ist ein Gegenschlag). Die beste Antwort lehnt ab (dxe5). |
| 11 | Läuferopfer h7 (Colle, konstruiert) | `r1b2rk1/ppqn1ppp/2n1p3/2bpP3/8/2PB1N2/PP1N1PPP/R1BQ1RK1 w - - 1 11` | 10…Sd7 | Lxh7+ | 1500 | **Brillant** (Opfer: Läufer) | Brillant | Klassisches Läuferopfer. Einziger Zug zum Ausgleich (+0,22 gegen Sb3 −0,30). Danach EP 0,52 ≥ 0,45. |
| 12 | Opfer, aber ohnehin gewonnen (konstruiert) | `2r3k1/5ppp/8/3Q4/8/8/5PPP/R2R2K1 w - - 0 1` | – | Dd8+ | 1500 | **Bester** (kein Brillant) | Bester | Damenopfer mit Matt. Der bester anderer Zug steht aber auch völlig gewonnen (EP_alt ≈ 1,0 ≥ 0,90). |
| 13 | Elefantenfalle (Damengambit) | `r1bqkb1r/pppn1ppp/5n2/3N2B1/3P4/8/PP2PPPP/R2QKBNR b KQkq - 0 6` | 6.Sxd5? | Sxd5 | 1500 | Bester (kein Sonderlabel) | Bester | Zurückschlagen. Das scheinbare Damenopfer (7.Lxd8 Lb4+) wird sofort zurückgewonnen. Kein Großartig trotz großem Abstand, weil es ein Rückschlag ist. |
| 14 | Noahs Arche (Spanisch) | `r2qkbnr/3b1ppp/p2p4/1p1Q4/2p1P3/1B6/PPP2PPP/RNB1K2R w KQkq - 0 12` | 11…c4 | Lxc4 | 1500 | Bester/Exzellent, **kein Opfer** | Bester | Der gefangene Läufer verkauft sich für einen Bauern (Desperado). |
| 15 | Fesselung (Nimzo-Struktur, Selbstspiel) | `rnbqk2r/ppp2ppp/4pn2/3p4/1bPP4/2N2NP1/PP2PP1P/R1BQKB1R b KQkq - 1 5` | – | Se4 | 1500 | Gut/Exzellent, **kein Opfer** | Gut | Se4 steht auf einem Feld, das Sc3 angreift. Sc3 ist aber absolut gefesselt (Lb4–Ke1), und Schlagen ist illegal. |
| 16 | Verpasst (Italienisch, konstruiert) | `r1b1k1nr/ppp2ppp/2np4/2b1p3/2B1P2q/3P1N2/PPP2PPP/RNBQ1RK1 w kq - 2 6` | 5…Dh4?? | c3 | 1000 | **Verpasst** | Verpasst | Sxh4 gewinnt die Dame (EP 0,92). c3 führt zu EP 0,57, und das ist nicht schlechter als vor 5…Dh4 (0,52). |
| 17 | dto. | dieselbe FEN | 5…Dh4?? | Sd4 | 1000 | **Patzer** | Patzer | Nutzt den Fehler nicht und stellt selbst den Springer ein (EP 0,17 < 0,52 − 0,05). |
| 18 | dto. | dieselbe FEN | 5…Dh4?? | Sxh4 | 1000 | Bester | Bester | Freie Dame schlagen, daher kein Großartig. |
| 19 | Erzwungen (konstruiert) | `3R2k1/5pp1/7p/8/8/8/5PPP/6K1 b - - 1 1` | – | Kh7 | 1500 | Erzwungen | Erzw. | Einziger legaler Zug. |
| 20 | Bauernendspiel, Opposition | `8/4k3/8/3K4/4P3/8/8/8 b - - 0 1` | – | Kd7 | 1500 | **Großartig** | Großartig | Einziger Remiszug (Kd7 = 0,00). Kf6/Kf8 verlieren (Matt). Verloren → ausgeglichen. |
| 21 | Bauernendspiel, Opposition | `8/8/4k3/8/3K4/4P3/8/8 b - - 0 1` | – | Kd6 | 1500 | **Großartig** | Großartig | Einziger Remiszug, alle anderen verlieren. |
| 22 | Bauernendspiel, Gewinnzug | `8/8/3k4/8/4PK2/8/8/8 w - - 0 1` | – | Kf5 | 1500 | **Großartig** | Großartig | Einziger Gewinnzug (e5+/Ke3 nur Remis). Ausgeglichen → gewonnen. |
| 23 | Bauernendspiel, alles gewinnt | `8/8/4k3/8/8/4K3/4P3/8 w - - 0 1` | – | Ke4 | 1500 | Bester | Bester | Kd4/Kf4 gewinnen ebenso, also gibt es keinen einzigen guten Zug. |

**Bewusst nicht als Regressionsfall aufgenommen (Grenzfälle):** Opernpartie 16.Db8+ (EP_alt 0,909 ≈ Schwelle 0,90) und 13.Txd7 (Qualitätsopfer, EP_alt 0,905). Beide sind „Bester“ nach dieser Spezifikation, kippen aber schon bei kleinem Tiefenrauschen. Wer sie testen will, sollte `nicht: ['great','inaccuracy',…]` statt einer festen Klasse prüfen.

### 9.1 Ist-Zustand v28 gegen diese Fälle (Tiefe 16)
18 von 24 Fällen bestehen (gerechnet mit dem Grenzfall 13.Txd7, der als „Bester“ bestand). Gescheitert sind: **19.Dh3 (Brillant statt Bester)**, Fischer 17…Le6 (Großartig statt Brillant), Fischer 11…Sa4 und Legal 5.Sxe5 (Bester statt Brillant), Morphy 10.Sxb5 (Großartig statt Brillant) sowie Se4 (nur Schwelle). Ursache in allen Brillant-Fällen ist dieselbe: Ab 1200 Elo verlangt v28 `pvSac`, also dass die Hauptvariante das Opfer *annimmt*. Abgelehnte Opfer und Figur-gegen-2-Bauern fallen dadurch durch. Unter 1200 Elo zählt dagegen jede Materialdelle in der Variante, auch bei einer Figur, die vorher schon hing (Dh3). Bei Tiefe 18 war 19.Dh3 zufällig „Bester“, bei 16 und 20 „Brillant“. Die neue statische Opfer-Erkennung beseitigt diese Tiefenabhängigkeit.

### 9.2 JSON-Anhang im Format von `test/klassen/run.mjs` (`faelle.json`)
`erwartet` = erlaubte Klassen, `nicht` = verbotene Klassen, `opfer` = erwartete Opferfigur (`null` = der Text darf kein Opfer erwähnen). `zug` = Halbzug-Index innerhalb von `zuege`.
```json
{
  "faelle": [
    {"id": "suf_19Qh3", "fen": "2r3k1/pp1pq1p1/4p1rp/4np1Q/2BBP3/2P5/PP3PPN/R3R1K1 b - - 0 18", "zuege": "18... Rg5 19. Qh3", "zug": 1, "elo": 607, "erwartet": ["best"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "suf_18Rg5", "fen": "2r3k1/pp1pq1p1/4p1rp/4np1Q/2BpP3/2P1B3/PP3PPN/R3R1K1 w - - 0 18", "zuege": "18. Bxd4 Rg5", "zug": 1, "elo": 496, "erwartet": ["best"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "suf_10Raxc8", "fen": "r1b2rk1/pp1pqpp1/2nNp2p/2p5/2B1P1n1/3PBN2/PPP2PPP/R2Q1RK1 w - - 1 10", "zuege": "10. Nxc8 Raxc8", "zug": 1, "elo": 496, "erwartet": ["best"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "suf_20Bxe5", "fen": "2r3k1/pp1pq1p1/4p2p/4npr1/2BBP3/2P4Q/PP3PPN/R3R1K1 b - - 2 19", "zuege": "19... Rf8 20. Bxe5", "zug": 1, "elo": 607, "erwartet": ["best"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "suf_19Rf8", "fen": "2r3k1/pp1pq1p1/4p2p/4nprQ/2BBP3/2P5/PP3PPN/R3R1K1 w - - 1 19", "zuege": "19. Qh3 Rf8", "zug": 1, "elo": 496, "erwartet": ["inaccuracy"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "reti_9Qd8", "fen": "rnb1kb1r/pp3ppp/2p2n2/4q3/4N3/3Q4/PPPB1PPP/2KR1BNR b kq - 1 8", "zuege": "8... Nxe4 9. Qd8+", "zug": 1, "elo": 2000, "erwartet": ["brilliant"], "opfer": "q"},
    {"id": "fischer_17Be6", "fen": "r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3RK2R w K - 2 17", "zuege": "17. Kf1 Be6", "zug": 1, "elo": 2000, "erwartet": ["brilliant"], "opfer": "q"},
    {"id": "fischer_11Na4", "fen": "r2q1rk1/pp2ppbp/1np2np1/2Q5/3PPBb1/2N2N2/PP3PPP/3RKB1R w K - 5 11", "zuege": "11. Bg5 Na4", "zug": 1, "elo": 2000, "erwartet": ["brilliant"], "opfer": "n"},
    {"id": "opera_10Nxb5", "fen": "rn2kb1r/pp2qppp/2p2n2/4p1B1/2B1P3/1QN5/PPP2PPP/R3K2R b KQkq - 1 9", "zuege": "9... b5 10. Nxb5", "zug": 1, "elo": 2000, "erwartet": ["brilliant"], "opfer": "n"},
    {"id": "legal_5Nxe5", "fen": "rn1qkbnr/ppp2ppp/3p4/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 3 4", "zuege": "4... g6 5. Nxe5", "zug": 1, "elo": 1200, "erwartet": ["brilliant"], "opfer": "q"},
    {"id": "greek_11Bxh7", "fen": "r1b2rk1/ppq2ppp/2n1pn2/2bpP3/8/2PB1N2/PP1N1PPP/R1BQ1RK1 b - - 0 10", "zuege": "10... Nd7 11. Bxh7+", "zug": 1, "elo": 1500, "erwartet": ["brilliant"], "opfer": "b"},
    {"id": "qsac_winning", "fen": "2r3k1/5ppp/8/3Q4/8/8/5PPP/R2R2K1 w - - 0 1", "zuege": "1. Qd8+", "zug": 0, "elo": 1500, "erwartet": ["best"], "nicht": ["brilliant"]},
    {"id": "elephant_6Nxd5", "fen": "r1bqkb1r/pppn1ppp/5n2/3p2B1/3P4/2N5/PP2PPPP/R2QKBNR w KQkq - 0 6", "zuege": "6. Nxd5 Nxd5", "zug": 1, "elo": 1500, "erwartet": ["best"], "opfer": null, "nicht": ["brilliant", "great"]},
    {"id": "noah_12Bxc4", "fen": "r2qkbnr/3b1ppp/p2p4/1ppQ4/4P3/1B6/PPP2PPP/RNB1K2R b KQkq - 5 11", "zuege": "11... c4 12. Bxc4", "zug": 1, "elo": 1500, "erwartet": ["best", "excellent"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "pin_Ne4", "fen": "rnbqk2r/ppp2ppp/4pn2/3p4/1bPP4/2N2NP1/PP2PP1P/R1BQKB1R b KQkq - 1 5", "zuege": "5... Ne4", "zug": 0, "elo": 1500, "erwartet": ["good", "excellent"], "opfer": null, "nicht": ["brilliant"]},
    {"id": "miss_6c3", "fen": "r1bqk1nr/ppp2ppp/2np4/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 1 5", "zuege": "5... Qh4 6. c3", "zug": 1, "elo": 1000, "erwartet": ["miss"], "opfer": null},
    {"id": "miss_6Nd4", "fen": "r1bqk1nr/ppp2ppp/2np4/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 1 5", "zuege": "5... Qh4 6. Nd4", "zug": 1, "elo": 1000, "erwartet": ["blunder"], "nicht": ["miss", "brilliant"]},
    {"id": "miss_6Nxh4", "fen": "r1bqk1nr/ppp2ppp/2np4/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 1 5", "zuege": "5... Qh4 6. Nxh4", "zug": 1, "elo": 1000, "erwartet": ["best"], "opfer": null, "nicht": ["great"]},
    {"id": "forced_Kh7", "fen": "3R2k1/5pp1/7p/8/8/8/5PPP/6K1 b - - 1 1", "zuege": "1... Kh7", "zug": 0, "elo": 1500, "erwartet": ["forced"]},
    {"id": "kpk_Kd7", "fen": "8/4k3/8/3K4/4P3/8/8/8 b - - 0 1", "zuege": "1... Kd7", "zug": 0, "elo": 1500, "erwartet": ["great"]},
    {"id": "kpk_Kd6", "fen": "8/8/4k3/8/3K4/4P3/8/8 b - - 0 1", "zuege": "1... Kd6", "zug": 0, "elo": 1500, "erwartet": ["great"]},
    {"id": "kpk_Kf5", "fen": "8/8/3k4/8/4PK2/8/8/8 w - - 0 1", "zuege": "1. Kf5", "zug": 0, "elo": 1500, "erwartet": ["great"]},
    {"id": "kpk_Ke4", "fen": "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1", "zuege": "1. Ke4", "zug": 0, "elo": 1500, "erwartet": ["best"], "nicht": ["great"]}
  ]
}
```

---

## 10. Bekannte Grenzen

* **Statische Prüfung:** Die Opfer-Erkennung sieht Gegenschläge nur einen Halbzug tief. Ein Zwischenschach, das das Material sofort zurückholt (Elefantenfalle 7.Lxd8 Lb4+), gilt als Opfer-Kompensation. Ein solcher Zug kann also Brillant werden, wenn er nicht ohnehin ein Rückschlag ist. Das ist gewollt (chess.com zeichnet solche Kombinationen ebenfalls aus), aber nicht mehr als eine Annahme.
* **Matt nach Annahme** wird bewusst nicht als Gegenrechnung gezählt. Auch eine Figur, die nur „durch Grundreihenmatt gedeckt“ ist, kann deshalb als Opfer gelten (freechess unterscheidet hier bei Figuren unter Turmwert).
* **EP-Formel und Elo-Skalierung** sind nachgebaut. Bei Bewertungen nahe einer Schwelle (siehe Grenzfälle in Abschnitt 9) kann chess.com anders entscheiden.
* **Engine-Tiefe:** Grundklasse, Großartig und „ohnehin gewonnen“ hängen weiter von der Bewertung ab. Die Opfer-Erkennung selbst ist tiefenunabhängig.

---

## 11. Nachträge 12.11.2026 (Analyse-Version 8)

Anlass: Prüfung der Sonderlabels, Fehlerklassen und Texte an 70 echten Partien (`test/klassen/team/sonderlabels.md`, `fehlerlabels.md`, `texte.md`). Die Prüffälle der drei Prüfer stehen jetzt in `test/klassen/faelle.json` (99 Fälle). Diese Regeln gehen den Abschnitten 2–7 vor.

### 11.1 Opfererkennung
| Regel | Begründung / Beleg |
|---|---|
| **Schach ohne Parade:** Steht der Gegner nach dem Zug im Schach, wird `Parry` nicht angewandt; `gain = SEE − Gegenschlag`. | Im Schach gibt es keine ruhige Parade, nur Fluchtzüge, die oft mehr verlieren. Sie blähten glatte Tausche zum Opfer auf: 15.Txe8+ Dxe8, 30.Txe7+ Txe7 Txe7+ (falsche Brillanten). |
| **Gegenschlag auf gleich Wertvolles = Tausch:** Trifft der beste sofortige Gegenschlag nach der Annahme eine Figur, die mindestens so viel wert ist wie die geschlagene, zählt die Figur nicht als hängend. | Spec 4.1 („verliert er dadurch sofort etwas mindestens gleich Wertvolles, ist es kein echtes Hängen“) wörtlich umgesetzt. Beleg 18…f6 (185474340274): Lf5 bleibt stehen, dafür fxe5 – Läufer gegen Springer, netto ein Bauer; nach der Nachrechnung sonst Brillant. |
| **Schadensbegrenzung auch für die gezogene Figur:** Stand die gezogene Figur schon vorher im Angriff und rettet der Zug eine mindestens gleich wertvolle andere bedrohte Figur, ist sie kein Opfer. | 14.Lxb5 (185401967428): b5 gabelt Da4 und Lc4, Lxb5 beseitigt den Angreifer der Dame und gibt den ohnehin verlorenen Läufer für zwei Bauern. |
| **Zurückschlagen nur bei SEE ≥ 0 offensichtlich:** Schlägt der Zug auf dem Feld des letzten gegnerischen Schlags zurück, aber mit negativer Abtauschrechnung, ist er kein bloßes Zurückschlagen. | 21…Txe4+ (185983416636) nach 20…Lxe4 21.fxe4: Lxe4 Dxe4+ – Turm gegen Läufer und Bauer, also Qualitätsopfer (4.1). Einziger Zug (Alternative Lg3+ +3,27 für Weiß), danach ausgeglichen (d22 +0,17) → **Brillant** nach Spezifikation. Neuer Schutzfall `echt_mertabi_21Rxe4`. |

### 11.2 Brillant
* **Ohnehin gewonnen, Elo-unabhängig:** kein Brillant, wenn der beste andere Zug **≥ +6,00** (unskaliert, aus Sicht des Ziehenden) oder Matt hat. Die Elo-skalierten Schwellen (0,90 bzw. 0,95) gelten zusätzlich. Grund: Bei 600 Elo lag die alte Schwelle bei rund +10 Bauern (38…Dxe4+ bei +8,5, 38.Sg5 bei +7,3, 30.Txe7+ bei +5,9 waren „nicht gewonnen“). +6,00 entspricht EP 0,90 ohne Elo-Faktor; WintrChess +7,00. Höchste Alternative unter den echten Brillanten: 19.Lxh6 mit +4,65.
* **Nachrechnung der Kandidaten:** Stellungen, deren Zug in der Vorrunde Brillant oder Großartig wurde oder knapp daran lag (Großartig: Abstand ≥ G(R) − 4 EP und Lagewechsel mit 4 EP Spielraum; Brillant: Grundklasse Bester/Exzellent, unter 1200 auch Gut, EP danach ≥ 0,40 und ein Opfer), werden einmal mit **+4 Halbzügen und MultiPV 3** (im Browser `movetime` × 3) nachgerechnet. Steht der gespielte Zug nicht in diesen Linien, wird er dort mit `searchmoves` bewertet. Für die Einstufung dieses Zuges zählen dann die tieferen Linien; Bewertungsbalken und Genauigkeit bleiben bei der normalen Suche. Die Nachrechnung wird in `an.deep` gespeichert, `reclassify` braucht keine Engine. Grund: 7…Lxh2+ (d16 Brillant, d22 Gut), 38.Sg5 (alt 0,942 → 0,969), 6 Großartig an der Grenze.

### 11.3 Großartig
* **Kein Großartig für offensichtlichen Materialgewinn:** Schlägt der Zug mit **SEE ≥ 2** Bauerneinheiten, gibt es kein Großartig (ersetzt die Regel „freie Figur, SEE ≥ Figurenwert“ aus 5.1). Belege: 18…Lxf7 (Dame), 19…Txd1, 25…exd4, 25.Sxd8, 37…Sxe2, 19.axb4, 12…exf3. Echte Großartig-Schläge haben SEE ≤ 0 (14.Lxa6, 18.Sxf6+, 7.Lxd7+).

### 11.4 Wert des gespielten Zuges (zu 2.1)
* Steht der gespielte Zug in keiner MultiPV-Linie **und** liegt sein Verlust nahe einer Klassengrenze (Exzellent 2 ± 0,5, Gut 5 ± 1, Ungenauigkeit 10 ± 1,5, Fehler 20 ± 2,5 EP), wird er in derselben Stellung mit `searchmoves` und gleicher Tiefe nachgerechnet und als eigene Linie (`sm: 1`) gespeichert. MultiPV 3 für alle Stellungen wäre +57 % Rechenzeit gewesen.
* **Gemessen** (70 echte Partien, Tiefe 16, Knoten nativ als Zeitmaß; Mittel 300 Stellungen: MultiPV 2 183 k, searchmoves 94 k Knoten): Grundlast 3890 Suchen ≈ 712 Mio. Knoten. Dazu 632 searchmoves-Suchen (63 Mio.) und 83 Nachrechnungen (+4, MultiPV 3; ≈ 89 Mio.) → **+21,5 %**. Mit `movetime`-Grenze im Browser höchstens +22,7 %.

### 11.5 Matt-Regeln
* **Kurzes Matt ausgelassen:** Hatte der Ziehende Matt in ≤ 3, und nach seinem Zug gibt es kein Matt mehr, ist der Zug **mindestens Ungenauigkeit** mit Fehlertyp „Matt übersehen“ (16…Dc4+ statt 16…Db4#). Mattzüge bleiben Bester Zug; ein längeres, aber noch vorhandenes Matt regelt weiter die Mattlängen-Tabelle.
* **„Matt übersehen“ nur bis Matt in 5.** Längere Matts heißen „Taktik verpasst“ (Gewinnweg verpasst).
* **Langes Matt (> 5) ausgelassen, Stellung aber weiter ≥ +6,00:** höchstens „Gut“ (wie ein deutlich längerer Mattweg). Sonst macht die Elo-Skalierung aus +8,8 bei 635 Elo eine Ungenauigkeit (38…Dxe4+: Abwicklung ins gewonnene Bauernendspiel statt Matt in 13).
* **„Matt zugelassen“ nur, wenn vorher EP_best ≥ 0,10.** In hoffnungslosen Stellungen (Tiefe 20 zeigt dort oft, dass jeder Zug matt wird) wird der Fehlertyp über die Materialbilanz bestimmt.

### 11.6 Fehlertypen über Ruhepunkt-Bilanz (ersetzt die festen Fenster 4/5 Halbzüge)
```
quietBal(fen, pv, c, 8): Materialbilanz für c nach jedem Halbzug k = 1…8, aber nur an Ruhepunkten
                         (kein Schach und der nächste Halbzug der Folge schlägt nicht); sonst der letzte Wert
endA = min quietBal(nach dem Zug, beste Gegnerlinie)      endB = max quietBal(vor dem Zug, beste Linie)
ref  = min(b0, erster Ruhepunkt der besten Linie)         b0 = Bilanz vor dem Zug
real = endB − endA ≥ 2  und  Bewertungsabstand bester − gespielter Zug ≥ 1,50 (unskaliert)
hung: real und endA ≤ ref − 2      missedTactic: real und endB ≥ ref + 2      sonst Stellungsfehler / nicht bestraft
```
Die Fensterlänge muss gerade sein (der letzte Wert liegt sonst vor der Gegenantwort). Die Bedingung „Bewertungsabstand ≥ 1,50“ ist neu: Ohne sie wurde 6.Lc4 (186149179666) „Taktik verpasst“, weil die beste Linie den Läufer h1 im 7. Halbzug zurückholt, während er nach 6.Lc4 erst hinter dem Fenster fällt (Bewertung nur −1,31). Ein Materialunterschied, den die Bewertung nicht trägt, ist kein Materialfehler.

### 11.7 Texte (explain.js, openings.js, structure.js)
* Notation überall **englisch (SAN wie chess.com: K Q R B N)**, auch in Eröffnungs- und Strukturtexten; Eröffnungsnamen englisch; keine Floskel „Alles im grünen Bereich“.
* Engine-Varianten nur als Vorschlag („Besser: …“, „… würde … spielen“, „Du würdest mit … fortsetzen“), nie als gespielter Zug im Präsens.
* Erste Zeile kurz mit Kern; Details in Folgeschritten. Fehler/Patzer nennen die Widerlegung („Patzer: Deine Dame d1 geht verloren – Bxd1 …“, „Fehler: Qxb2 hätte den Turm gewonnen.“), verpasstes Matt steht in Zeile 1 („Matt in 1 übersehen: Ra7#.“).
* Materialangaben einheitlich über `quietBal` und relativ zur besten Linie (eine Zahl je Text).
* „Gabel/Doppelangriff“ nur gegen zwei Ziele ab Springer bzw. König + Figur und nur, wenn der Angreifer nicht sofort billiger geschlagen wird; „ungedeckt“ nur, wenn das Ziel nicht wertvoller als der Angreifer ist und ihn nicht selbst schlagen kann.
* Brillant-Texte konkret (Matt / Materialgewinn / Gleichgewicht / klarer Vorteil mit Bewertung); ein Tausch heißt nie „Opfer“.
* Bewertungen in Klammern nur bei Unterschied ≥ 0,3 bzw. Matt ausgeschrieben, Dezimalkomma. Bei gut/exzellent keine Gegner-Alternativen.
* Merksatz als eigener Schritt, passend zur Fehlerart; Verlaufshinweis („kein Einzelfall“) nur bei Fehler/Patzer, ab 3 Vorfällen, einmal je Partie und Fehlerart; Eröffnungsidee einmal pro Partie. `coachText` ist neutral formuliert (Spielername statt „du“).
