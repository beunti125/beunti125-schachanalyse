import json
def pgn(moves, white, black, result, clk0=180):
    toks=moves.split(); out=[]; c=[clk0,clk0]; n=1
    for i,m in enumerate(toks):
        c[i%2]-= 3+ (i%5)*2 + (40 if i>30 and i%2==0 else 0); c[i%2]=max(c[i%2],1)
        s=f"{c[i%2]//60}:{c[i%2]%60:02d}:{0:02d}"[:7]
        t=f"0:{c[i%2]//60:02d}:{c[i%2]%60:02d}"
        out.append((f"{n}. " if i%2==0 else f"{n}... ")+f"{m} {{[%clk {t}]}}")
        if i%2==1:n+=1
    return f'[Event "Live Chess"]\n[White "{white}"]\n[Black "{black}"]\n[Result "{result}"]\n[TimeControl "180+2"]\n\n'+" ".join(out)+" "+result
g1=dict(url="https://www.chess.com/game/live/1",pgn=pgn("e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#","testuser","gegner1","0-1"),
  time_control="180+2",end_time=1762900000,rated=True,time_class="blitz",rules="chess",eco="https://www.chess.com/openings/Italian-Game-Blackburne-Shilling-Gambit-4.Nxe5",
  white=dict(username="testuser",rating=1105,result="checkmated"),black=dict(username="gegner1",rating=1120,result="win"))
g2=dict(url="https://www.chess.com/game/live/2",pgn=pgn("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6 dxc5 bxc5 O-O Ra7 Be2 Nd7 Nd4 Qf8 Nxe6 fxe6 e4 d4 f4 Qe7 e5 Rb8 Bc4 Kh8 Qh3 Nf8 b3 a5 f5 exf5 Rxf5 Nh7 Rcf1 Qd8 Qg3 Re7 h4 Rbb7 e6 Rbc7 Qe5 Qe8 a4 Qd8 R1f2 Qe8 R2f3 Qd8 Bd3 Qe8 Qe4 Nf6 Rxf6 gxf6 Rxf6 Kg8 Bc4 Kh8 Qf4","testuser","gegner2","1-0"),
  time_control="180+2",end_time=1762800000,rated=True,time_class="blitz",rules="chess",eco="https://www.chess.com/openings/Queens-Gambit-Declined-Tartakower-Defense",
  white=dict(username="testuser",rating=1110,result="win"),black=dict(username="gegner2",rating=1090,result="resigned"))
json.dump({"games":[g1,g2]},open("games.json","w"))
json.dump({"archives":["https://api.chess.com/pub/player/testuser/games/2026/11"]},open("archives.json","w"))
json.dump({"chess_blitz":{"last":{"rating":1105},"best":{"rating":1203},"record":{"win":120,"loss":118,"draw":9}},"chess_rapid":{"last":{"rating":1250},"best":{"rating":1301},"record":{"win":30,"loss":20,"draw":2}},"tactics":{"highest":{"rating":1650}}},open("stats.json","w"))
