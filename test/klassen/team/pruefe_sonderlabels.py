#!/usr/bin/env python3
"""Nachprüfung der Sonderlabels (Brillant, Großartig, Verpasst, Erzwungen, Theorie-Grenzen) mit Stockfish d22+ MultiPV 3.

Eingabe: JSON aus test/klassen/echte.mjs --json (alle Züge mit App-Klasse) und optional Opfer-Kandidaten
(aus opferkandidaten.mjs). Rechnet jede Stellung tiefer nach, wendet die Regeln der Spezifikation
(EP-Formel und Schwellen wie in analysis.js) auf die tiefen Werte an und schreibt ein JSON mit Soll/Ist.

  python3 -I pruefe_sonderlabels.py <echte16.json> <kandidaten.json> <ausgabe.json> [--tiefe 22]
Cache: test/klassen/team/cache_d22/ (eine Datei je Stellung+Zug).
"""
import hashlib
import json
import math
import os
import sys

import chess
import chess.engine

SF = os.environ.get('STOCKFISH', '/tmp/stockfish/stockfish-ubuntu-x86-64-avx2')
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache_d22')
args = sys.argv[1:]
DEPTH = int(args[args.index('--tiefe') + 1]) if '--tiefe' in args else 22
# --gruende label:brilliant,kandidat,... beschränkt die Ziele (label:<klasse> = Sonderlabel dieser Klasse)
GRUENDE = args[args.index('--gruende') + 1].split(',') if '--gruende' in args else None


def elo_factor(r):
    return max(.55, min(1.35, .45 + (r or 1500) / 1800))


def ep(score_white, r, color):
    """EP aus Sicht von color; score_white = ('cp', v) oder ('mate', v) aus Weiß-Sicht."""
    kind, v = score_white
    if kind == 'mate':
        w = 100.0 if v > 0 else 0.0
    else:
        cp = max(-1500, min(1500, v)) * elo_factor(r)
        w = 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
    return w if color == chess.WHITE else 100 - w


def sc(pov):
    s = pov.white()
    if s.is_mate():
        return ('mate', s.mate())
    return ('cp', s.score())


def analyse(eng, fen, uci):
    key = hashlib.sha1(f'{fen}|{uci}|d{DEPTH}|mpv3'.encode()).hexdigest()[:20]
    f = os.path.join(CACHE, key + '.json')
    if os.path.exists(f):
        return json.load(open(f))
    b = chess.Board(fen)
    eng.configure({'Clear Hash': None})
    info = eng.analyse(b, chess.engine.Limit(depth=DEPTH), multipv=3)
    lines = [{'move': i['pv'][0].uci(), 'score': sc(i['score']), 'pv': [m.uci() for m in i['pv'][:8]]} for i in info if 'pv' in i]
    played = next((l for l in lines if l['move'] == uci), None)
    if played is None and uci:
        eng.configure({'Clear Hash': None})
        i = eng.analyse(b, chess.engine.Limit(depth=DEPTH), root_moves=[chess.Move.from_uci(uci)])
        played = {'move': uci, 'score': sc(i['score']), 'pv': [m.uci() for m in i.get('pv', [])[:8]]}
    out = {'lines': lines, 'played': played, 'legal': b.legal_moves.count()}
    os.makedirs(CACHE, exist_ok=True)
    json.dump(out, open(f, 'w'))
    return out


def outcome(w):
    return 0 if w < 30 else 2 if w > 70 else 1


def great_gap(r):
    return 10 + 5 * max(0, min(1, ((r or 1500) - 1200) / 1000))


def win_anyway(r):
    return 95 if (r or 1500) < 1200 else 90


def main():
    data = json.load(open(args[0]))
    cands = json.load(open(args[1])) if len(args) > 1 and os.path.exists(args[1]) else {}
    moves = data['moves']
    by = {(m['u'], m['ply']): m for m in moves}
    # Ziele: alle Sonderlabels, alle Opfer-Kandidaten (beide Seiten), Theorie-Grenzen (letzter Theoriezug + nächster Zug),
    # Vorgänger-Züge von Verpasst (für EP_prev)
    targets = {}
    for m in moves:
        k = (m['u'], m['ply'])
        if m['cls'] in ('brilliant', 'great', 'miss'):
            targets[k] = 'label:' + m['cls']
        if m['cls'] == 'miss' and (m['u'], m['ply'] - 1) in by:
            targets.setdefault((m['u'], m['ply'] - 1), 'vorher')
        if f"{m['u']}:{m['ply']}" in cands and m['cls'] in ('best', 'excellent', 'good', 'great', 'brilliant') and m['wpA'] >= 40:
            targets.setdefault(k, 'kandidat')
    for t in data['theory']:
        targets.setdefault((t['u'], t['ply']), 'theorie')
        if (t['u'], t['ply'] + 2) in by:
            targets.setdefault((t['u'], t['ply'] + 2), 'theorie_naechster')
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({'Threads': int(os.environ.get('THREADS', '2')), 'Hash': 256})
    res = []
    if GRUENDE:
        targets = {k: v for k, v in targets.items() if v in GRUENDE}
    keys = sorted(targets)
    for n, k in enumerate(keys):
        m = by[k]
        a = analyse(eng, m['fen'], m['uci'])
        col = chess.WHITE if m['farbe'] == 'w' else chess.BLACK
        R = m['R']
        eps = [(l['move'], ep(l['score'], R, col)) for l in a['lines']]
        wp_play = ep(a['played']['score'], R, col) if a['played'] else None
        wp_best = max([e for _, e in eps] + ([wp_play] if wp_play is not None else []))
        alts = [e for mv, e in eps if mv != m['uci']]
        wp_alt = max(alts) if alts else None
        top = a['lines'][0]['move'] == m['uci'] if a['lines'] else False
        loss = max(0, wp_best - wp_play) if wp_play is not None else None
        r = {**{x: m[x] for x in ('u', 'ply', 'zug', 'spieler', 'mert', 'R', 'cls', 'wpA', 'wpB', 'wpAlt', 'best', 'uci', 'fen', 'sac', 'loss')},
             'grund': targets[k], 'kand': cands.get(f"{m['u']}:{m['ply']}"),
             'd': DEPTH, 'top': top, 'wpPlay': round(wp_play, 1) if wp_play is not None else None,
             'wpBest': round(wp_best, 1), 'wpAlt22': round(wp_alt, 1) if wp_alt is not None else None,
             'loss22': round(loss, 1) if loss is not None else None, 'legal': a['legal'],
             'lines22': [(l['move'], l['score'], l['pv'][:6]) for l in a['lines']], 'played22': a['played']}
        # Regeln auf die d22-Werte
        base_best = top or (loss is not None and loss < 0.5)
        base_exc = loss is not None and loss < 2
        okb = (base_best or base_exc) if R < 1200 else base_best
        r['brill_bedingungen'] = {'grundklasse': okb, 'danach_ge_45': wp_play is not None and wp_play >= 45,
                                  'nicht_ohnehin_gewonnen': wp_alt is not None and wp_alt < win_anyway(R)}
        r['great_bedingungen'] = {'top': top, 'abstand': wp_alt is not None and wp_play is not None and wp_play - wp_alt >= great_gap(R),
                                  'lagewechsel': wp_alt is not None and wp_play is not None and outcome(wp_alt) < outcome(wp_play)}
        res.append(r)
        print(f"{n + 1}/{len(keys)} {m['u']} {m['zug']:14} {m['cls']:10} d{DEPTH}: play={r['wpPlay']} best={r['wpBest']} alt={r['wpAlt22']} top={top}", flush=True)
    eng.quit()
    json.dump(res, open(args[2], 'w'), indent=0)


if __name__ == '__main__':
    main()
