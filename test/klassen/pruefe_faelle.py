#!/usr/bin/env python3
"""Prüft faelle.json schachlich: Legalität aller Züge (python-chess) und die sf-Behauptungen jedes Falls
mit nativem Stockfish (Tiefe 20, MultiPV 3). Aufruf: python3 -I test/klassen/pruefe_faelle.py [--tiefe 20]"""
import json, re, sys, os, chess, chess.pgn, chess.engine, io
SF = os.environ.get('STOCKFISH', '/tmp/stockfish/stockfish-ubuntu-x86-64-avx2')
D = int(sys.argv[sys.argv.index('--tiefe') + 1]) if '--tiefe' in sys.argv else 20
V = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0}
K = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'faelle.json')))
eng = chess.engine.SimpleEngine.popen_uci(SF); eng.configure({'Threads': 1, 'Hash': 64})
cp = lambda s, pov: s.pov(pov).score(mate_score=100000)
bad = 0
for f in K['faelle']:
    errs = []
    g = chess.pgn.read_game(io.StringIO(f['pgn'] if 'pgn' in f else f'[SetUp "1"]\n[FEN "{f["fen"]}"]\n\n{f["zuege"]}'))
    if g.errors: errs.append(f'PGN-Fehler: {g.errors}')
    b = g.board(); target = None
    mm = re.match(r'^(\d+)(\.\.\.|\.)(.+)$', f['zug'])
    for mv in g.mainline_moves():
        if not b.is_legal(mv): errs.append(f'illegal {mv}'); break
        lab = f"{b.fullmove_number}{'.' if b.turn else '...'}{b.san(mv)}"
        if lab.rstrip('+#') == f['zug'].rstrip('+#'): target = (b.copy(), mv)
        b.push(mv)
    if not target: errs.append(f"Zug {f['zug']} nicht in der Partie")
    else:
        pos, mv = target; me = pos.turn; s = f.get('sf', {})
        info = eng.analyse(pos, chess.engine.Limit(depth=D), multipv=3)
        best = info[0]['pv'][0]; bv = cp(info[0]['score'], me)
        after = pos.copy(); after.push(mv)
        if after.is_checkmate(): pv_ = 100000
        elif after.is_game_over(): pv_ = 0
        else: pv_ = cp(eng.analyse(after, chess.engine.Limit(depth=D))['score'], me)
        alt = [cp(i['score'], me) for i in info if i['pv'][0] != mv]
        note = f"SF: bester {pos.san(best)} {bv}, gespielt {pv_}, beste Alternative {alt[0] if alt else '-'}"
        if s.get('bester') and bv - pv_ > 30: errs.append(f'nicht bester Zug ({note})')
        if 'einziger' in s and alt and pv_ - alt[0] < s['einziger']: errs.append(f"Abstand zur Alternative < {s['einziger']} ({note})")
        if 'verlustMin' in s and bv - pv_ < s['verlustMin']: errs.append(f"Verlust < {s['verlustMin']} ({note})")
        if s.get('mattZugelassen') and not (pv_ <= -90000): errs.append(f'kein Matt zugelassen ({note})')
        if s.get('mattFuerZiehenden') and not (pv_ >= 90000): errs.append(f'kein forciertes Matt ({note})')
        if s.get('setztMatt') and not after.is_checkmate(): errs.append('setzt nicht matt')
        if 'legal' in s and pos.legal_moves.count() != s['legal']: errs.append(f'{pos.legal_moves.count()} legale Züge statt {s["legal"]}')
        if 'angegriffen' in s:
            sq = chess.parse_square(s['angegriffen'])
            if mv.from_square != sq or not pos.attackers(not me, sq): errs.append('gezogene Figur war nicht angegriffen')
        if 'hing_vorher' in s:
            sq = chess.parse_square(s['hing_vorher']); p = pos.piece_at(sq)
            att = [V[pos.piece_type_at(a)] for a in pos.attackers(not me, sq)]
            if not (p and att and (not pos.attackers(me, sq) or min(att) < V[p.piece_type])): errs.append(f"{s['hing_vorher']} hing vorher nicht")
            if not (after.attackers(not me, sq) and after.piece_at(sq) == p): errs.append(f"{s['hing_vorher']} hängt nachher nicht mehr (Zug hat ihn gerettet)")
        if 'opferSchlagbar' in s:
            sq = chess.parse_square(s['opferSchlagbar'])
            if not any(m.to_square == sq for m in after.legal_moves if after.is_capture(m)): errs.append(f"Figur auf {s['opferSchlagbar']} nicht schlagbar")
        if s.get('zurueckschlagen'):
            prev = pos.peek() if pos.move_stack else None
            if not (prev and mv.to_square == prev.to_square and pos.is_capture(mv)): errs.append('kein Zurückschlagen')
        f['_note'] = note
    print(('OK  ' if not errs else 'FEHL') + f" {f['id']:<28} {f.get('_note','')}" + ('' if not errs else '  ✗ ' + '; '.join(errs)))
    bad += bool(errs)
eng.quit()
print(f"\n{len(K['faelle'])} Fälle schachlich geprüft (Tiefe {D}), {bad} mit Problemen")
sys.exit(1 if bad else 0)
