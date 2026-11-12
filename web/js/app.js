import { Chess } from '../vendor/chess.js';
import { EnginePool } from './engine.js';
import { Board } from './board.js';
import { icon, CLASS_COLOR } from './icons.js';
import { explain, judgeIdea } from './explain.js';
import { openingStep } from './openings.js';
import * as S from './store.js';
import { CLASSES, CLASS_DE, ERR_DE, PHASE_DE, parseGame, analyseGame, extractPuzzles, coachText, winPct, fmtEval, uciToSan, pvToSan } from './analysis.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder'];
const SERIOUS = ['mistake', 'miss', 'blunder'];
const TC_DE = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Schnellschach', daily: 'Täglich' };

const st = {
  user: S.ls.get('user', ''), games: [], analyses: new Map(), tc: '', quality: S.ls.get('quality', 'standard'),
  g: null, P: null, an: null, ply: 0, showBest: false, busy: false,
};
// Schnell/Standard: viele kleine Engines parallel. Gründlich + Taktik-Prüfung: eine große Engine (erst bei Bedarf geladen).
const pool = new EnginePool();
const engineFor = () => pool; // alle Stufen über die parallelen Lite-Engines (App bleibt klein)
pool.ready.then(() => $('#engineLabel').textContent = pool.label).catch(() => $('#engineLabel').textContent = 'Engine-Fehler');

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }
function status(t) { $('#status').textContent = t || ''; }
function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  st.view = view;
  document.body.classList.toggle('focus', view === 'review');
  if (view !== 'review') exitFull();
  if (view === 'errors') renderErrors();
  if (view === 'puzzles') puzzleStart();
  if (view === 'review' && !st.g) $('.coach-txt').textContent = 'Wähle eine Partie unter „Partien“.';
}
const me = g => g.white.username.toLowerCase() === st.user.toLowerCase() ? 'w' : 'b';
const resultOf = g => { const r = (me(g) === 'w' ? g.white : g.black).result; return r === 'win' ? 'w' : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(r) ? 'd' : 'l'; };
const fmtDate = t => new Date(t * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtClock = s => s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${(s % 60).toFixed(s < 20 ? 1 : 0).padStart(s < 20 ? 4 : 2, '0')}`;
const openingOf = g => ((g.eco || '').split('/openings/')[1] || '').replace(/-/g, ' ').replace(/\s\d.*$/, '').replace(/\.\.\./g, '').trim() || 'Unbekannt';

// ---------- Laden ----------
async function loadUser(user, fromCache) {
  st.user = user.trim(); S.ls.set('user', st.user); $('#user').value = st.user;
  if (!st.user) return;
  if (!fromCache) saveCfg({ user: st.user });
  const cachedStats = S.ls.get('stats:' + st.user.toLowerCase(), null);
  if (cachedStats) renderRatings(cachedStats);
  st.games = await S.cachedGames(st.user);
  renderGames(); updatePuzzleCount();
  if (fromCache && st.games.length) { status(`${st.games.length} Partien (gespeichert)`); return; }
  try {
    status('Lade Wertungen …');
    renderRatings(await S.loadStats(st.user));
    st.games = await S.loadGames(st.user, +$('#months').value, (i, n) => status(`Lade Partien … Monat ${i}/${n}`));
    status(`${st.games.length} Partien geladen`);
    renderGames();
  } catch (e) { status(''); toast(e.message); }
}
function renderRatings(s) {
  const items = [['chess_bullet', 'Bullet'], ['chess_blitz', 'Blitz'], ['chess_rapid', 'Schnell'], ['chess_daily', 'Täglich']];
  let h = items.filter(([k]) => s[k]?.last).map(([k, n]) => `<div class="rt" title="Bestwert: ${s[k].best?.rating ?? '–'}"><span>${n}</span><b>${s[k].last.rating}</b><small>${s[k].record.win}S ${s[k].record.draw}R ${s[k].record.loss}N</small></div>`).join('');
  if (s.tactics?.highest) h += `<div class="rt" title="Höchste Taktikwertung"><span>Taktik</span><b>${s.tactics.highest.rating}</b><small>Bestwert</small></div>`;
  $('#ratings').innerHTML = h;
}

// ---------- Partienliste ----------
function filtered() { return st.games.filter(g => !st.tc || g.time_class === st.tc); }
function renderGames() {
  const list = filtered();
  if (!list.length) { $('#gameList').innerHTML = `<div class="empty">${st.games.length ? 'Keine Partien in dieser Zeitkontrolle.' : 'Gib deinen chess.com-Namen ein und lade deine Partien.'}</div>`; return; }
  $('#gameList').innerHTML = list.slice(0, 300).map((g, i) => {
    const r = resultOf(g), an = st.analyses.get(g.url), c = me(g);
    const acc = an ? `<span class="g-acc">${an.accuracy[c] ?? '–'}<small> %</small></span>` : (g.accuracies ? `<span class="g-acc"><small>chess.com:</small> ${g.accuracies[c === 'w' ? 'white' : 'black']?.toFixed(1)}</span>` : '<span class="tag">nicht analysiert</span>');
    return `<div class="g-row" data-i="${i}">
      <div class="g-res ${r}">${r === 'w' ? 'S' : r === 'l' ? 'N' : '½'}</div>
      <div class="g-pl"><span><i class="wsq"></i>${esc(g.white.username)} <em>(${g.white.rating})</em></span><span><i class="bsq"></i>${esc(g.black.username)} <em>(${g.black.rating})</em></span></div>
      <div class="g-open" title="${esc(openingOf(g))}">${esc(openingOf(g))}</div>
      <div class="g-tc">${TC_DE[g.time_class] || g.time_class}<br>${fmtDate(g.end_time)}</div>
      <div>${acc}</div>
      <button class="btn g-btn ${an ? '' : 'primary'}">${an ? 'Ansehen' : 'Analysieren'}</button>
    </div>`;
  }).join('');
}

// ---------- Analyse ----------
function progress(on, title, done, total, sub) {
  $('#progress').classList.toggle('on', on);
  if (!on) return;
  $('.prog-title').textContent = title; $('.bar i').style.width = (100 * done / Math.max(1, total)) + '%'; $('.prog-sub').textContent = sub || '';
}
async function ensureAnalysis(g, quality, onP) {
  let an = st.analyses.get(g.url);
  if (an && (quality == null || rank(an.quality) >= rank(quality))) return an;
  an = await analyseGame(g, engineFor(quality || st.quality), quality || st.quality, onP);
  st.analyses.set(g.url, an); await S.put('analyses', an);
  if (st.user && [g.white.username, g.black.username].some(n => n.toLowerCase() === st.user.toLowerCase())) {
    const old = new Map((await S.all('puzzles')).map(p => [p.id, p]));
    const pz = extractPuzzles(g, an, st.user).map(p => old.get(p.id) ? { ...p, ...pick(old.get(p.id), ['tries', 'solved', 'failed', 'due']) } : p);
    if (pz.length) await S.putMany('puzzles', pz);
    updatePuzzleCount();
  }
  return an;
}
const rank = q => ({ schnell: 0, standard: 1, gruendlich: 2 }[q] ?? 1);
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));

async function openReview(g, ply = null, quality = null) {
  if (st.busy) return toast('Analyse läuft noch …');
  show('review');
  st.busy = true;
  try {
    const t0 = performance.now();
    const needs = !st.analyses.has(g.url) || (quality && rank(st.analyses.get(g.url).quality) < rank(quality));
    if (needs) {
      const P0 = parseGame(g);
      board.setOrientation(me(g)); board.setArrows([]); board.setMarks({});
      board.setPosition(P0.fens.at(-1), { last: P0.moves.length ? { from: P0.moves.at(-1).from, to: P0.moves.at(-1).to } : null });
      $('#v-review').classList.add('analysing');
    }
    const an = await ensureAnalysis(g, quality, (d, n) => {
      const el = (performance.now() - t0) / 1000, eta = d > 4 ? Math.round(el / d * (n - d)) : null;
      $('#boardProg .bar i').style.width = (100 * d / n) + '%';
      $('#boardProg .bp-txt').textContent = `Analysiere … ${Math.round(100 * d / n)} %${eta != null ? ` · noch ca. ${eta} s` : ''}`;
    });
    st.g = g; st.an = an; st.P = parseGame(g); st.hist = myHistory();
    board.setOrientation(me(g));
    renderReview();
    setMode(ply ? 'mov' : 'sum');
    go(ply ?? 0);
    renderGames();
  } catch (e) { console.error(e); toast('Analyse fehlgeschlagen: ' + e.message); }
  finally { $('#v-review').classList.remove('analysing'); st.busy = false; }
}

function renderReview() {
  const { g, an, P } = st;
  $('#ccLink').href = g.url;
  $('.panel-head').innerHTML = `<button class="hd-ic" id="backSum" title="Zur Übersicht" style="margin:0 2px 0 -6px">←</button><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>Spielbericht<div class="grow"></div>` +
    `<button class="btn" id="pickBtn" style="padding:4px 10px;font-size:12px">⌕ Suchen</button>` +
    `<button class="hd-ic" id="fullBtn" title="Vollbild an/aus">⛶</button><button class="hd-ic" id="exitFocus" title="Schließen (Esc)">✕</button>`;
  $('#fullBtn').onclick = () => isFull() ? exitFull() : enterFull();
  $('#exitFocus').onclick = () => show('games');
  $('#pickBtn').onclick = openPicker;
  $('#backSum').onclick = () => { setMode('sum'); go(0); };
  $('#accRow').innerHTML = ['w', 'b'].map(c => { const p = c === 'w' ? g.white : g.black; return `<div class="acc ${c}b"><div class="n">${esc(p.username)} (${p.rating})</div><div class="v">${an.accuracy[c] ?? '–'}</div><div class="n">Genauigkeit</div></div>`; }).join('');
  const cnt = { w: {}, b: {} };
  an.moves.forEach((m, i) => { const c = P.moves[i].color; cnt[c][m.cls] = (cnt[c][m.cls] || 0) + 1; });
  const mine = me(g);
  $('#clsTable').innerHTML = CLASSES.map(k => `<div class="lbl ${cnt[mine][k] ? 'jump' : ''}" data-cls="${k}" data-side="${mine}" style="color:${CLASS_COLOR[k]}">${CLASS_DE[k]}</div><div class="c ${cnt.w[k] ? 'jump' : ''}" data-cls="${k}" data-side="w">${cnt.w[k] || 0}</div><div>${icon(k, 20)}</div><div class="c ${cnt.b[k] ? 'jump' : ''}" data-cls="${k}" data-side="b">${cnt.b[k] || 0}</div>`).join('');
  let h = '';
  for (let i = 0; i < P.moves.length; i += 2) {
    const cell = j => j < P.moves.length ? `<div class="mv" data-ply="${j + 1}"><span class="mi">${NOTABLE.has(an.moves[j].cls) ? icon(an.moves[j].cls, 16) : ''}</span>${figSan(P.moves[j].san, P.moves[j].color)}</div>` : '<div></div>';
    h += `<div class="mrow"><div class="mn">${i / 2 + 1}.</div>${cell(i)}${cell(i + 1)}</div>`;
  }
  $('#moveList').innerHTML = h;
  renderGraph();
}
function renderGraph() {
  const { an, P } = st, N = Math.max(1, an.evals.length - 1);
  const pts = an.evals.map((e, i) => `${i},${(100 - winPct(e)).toFixed(2)}`).join(' ');
  const flip = board.orientation === 'b';
  let dots = '';
  an.moves.forEach((m, i) => { if (SERIOUS.includes(m.cls)) dots += `<circle cx="${i + 1}" cy="${100 - winPct(an.evals[i + 1])}" r="${Math.max(.6, N / 110)}" fill="${CLASS_COLOR[m.cls]}" vector-effect="non-scaling-stroke"/>`; });
  $('#graph').innerHTML = `<svg viewBox="0 0 ${N} 100" preserveAspectRatio="none" style="${flip ? 'transform:scaleY(-1)' : ''}">
    <rect width="${N}" height="100" fill="#3b3a36"/>
    <polygon points="0,100 ${pts} ${N},100" fill="#f2f0ea"/>
    <line x1="0" y1="50" x2="${N}" y2="50" stroke="#8a8880" stroke-width=".6" vector-effect="non-scaling-stroke"/>
    ${dots}<line id="gcur" x1="0" y1="0" x2="0" y2="100" stroke="#7fbf4d" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function go(ply) {
  const { an, P, g } = st; if (!an) return;
  ply = Math.max(0, Math.min(P.moves.length, ply)); st.ply = ply;
  st.var = null; st.varTok = (st.varTok || 0) + 1; renderVarLine();
  if (ply > 0 && st.mode !== 'mov') setMode('mov');
  const i = ply - 1, mv = i >= 0 ? P.moves[i] : null, cls = i >= 0 ? an.moves[i] : null;
  board.setPosition(P.fens[ply], { last: mv ? { from: mv.from, to: mv.to } : null, animate: true, badge: mv && cls.cls !== 'forced' ? { sq: mv.to, cls: cls.cls } : null });
  st.ex = cls ? explain(g, an, P, i, { my: me(g), hist: st.hist }) : null; st.step = 0;
  st.hint = 0; updHint();
  const os = cls ? openingStep(P.fens, ply, me(g), an.lines[ply]?.[0]?.pv) : null;
  if (os) { os.last = { from: mv.from, to: mv.to }; if (cls.cls === 'book') st.ex.steps.splice(1, 0, os); else st.ex.steps.push(os); }
  renderSteps(); applyStep(0);
  const ev = an.evals[ply], wp = winPct(ev), flip = board.orientation === 'b';
  setEvalBar(ev);
  // Spieler + Uhr
  const top = flip ? 'w' : 'b', bot = flip ? 'b' : 'w';
  const clk = c => { for (let j = i; j >= 0; j--) if (P.moves[j].color === c) return P.moves[j].clock; return P.base; };
  const pl = c => { const p = c === 'w' ? g.white : g.black; return `${esc(p.username)}<em>(${p.rating})</em>`; };
  $('.top-p .pname').innerHTML = pl(top); $('.top-p .clock').textContent = fmtClock(clk(top));
  $('.bot-p .pname').innerHTML = pl(bot); $('.bot-p .clock').textContent = fmtClock(clk(bot));
  // Trainer-Text
  if (cls) {
    $('.coach-ico').innerHTML = icon(cls.cls, 30);
    $('.coach-txt').innerHTML = `<b>${esc(mv.san)}</b> – <b style="color:${CLASS_COLOR[cls.cls]}">${CLASS_DE[cls.cls]}</b>${cls.pressure && BAD.includes(cls.cls) ? ' <span class="tag">unter Zeitdruck</span>' : ''}`;
  } else {
    $('.coach-ico').innerHTML = icon('book', 30);
    const r = resultOf(g);
    $('.coach-txt').textContent = summary(g, an, P);
  }
  const ce = $('.coach-eval'); ce.textContent = fmtEval(ev); ce.classList.toggle('neg', wp < 50);
  setCoachPiece(mv ? mv.color : null, mv ? mv.piece : null);
  board.setMovable(movableColor(P.fens[ply]));
  // Trainer reagiert auf den Zug
  const av = $('.avatar'), mood = cls ? ({ brilliant: 'jump', great: 'jump', best: 'nod', excellent: 'nod', good: 'nod', book: 'tilt', inaccuracy: 'shake', mistake: 'shake', miss: 'shake', blunder: 'shake' }[cls.cls] || 'nod') : 'tilt';
  av.style.borderColor = cls ? CLASS_COLOR[cls.cls] : '';
  av.classList.remove('jump', 'nod', 'tilt', 'shake'); void av.offsetWidth; av.classList.add(mood);
  const bb = $('.bubble'); bb.classList.remove('pop'); void bb.offsetWidth; bb.classList.add('pop');
  document.querySelectorAll('.mv').forEach(e => e.classList.toggle('cur', +e.dataset.ply === ply));
  const cur = document.querySelector('.mv.cur'), ml = $('#moveList');
  if (cur) { const t = cur.offsetTop - ml.clientHeight / 2; ml.scrollTop = Math.max(0, t); }
  document.querySelector('#v-review .panel').scrollTop = 0;
  const gc = document.getElementById('gcur'); if (gc) { gc.setAttribute('x1', ply); gc.setAttribute('x2', ply); }
}

function setEvalBar(ev) {
  const wp = winPct(ev), flip = board.orientation === 'b';
  const fill = $('.eb-fill'); fill.style.height = (flip ? 100 - wp : wp) + '%'; fill.style.background = flip ? '#3b3a36' : '#f2f0ea';
  $('.evalbar').style.background = flip ? '#f2f0ea' : '#3b3a36';
  const tx = $('.eb-txt'); const whiteBetter = wp >= 50;
  tx.textContent = fmtEval(ev).replace('+', '').replace(/^-/, '');
  const atBottom = whiteBetter !== flip; tx.style.top = atBottom ? 'auto' : '0'; tx.style.bottom = atBottom ? '0' : 'auto'; tx.style.color = whiteBetter ? '#333' : '#eee';
}
// Die gezogene Figur ist der Trainer
function setCoachPiece(color, piece) {
  const img = $('.avatar img'), av = $('.avatar');
  img.src = `pieces/${color || 'w'}${(piece || 'n').toUpperCase()}.svg`;
  av.classList.toggle('blk', color === 'b');
}
function movableColor(fen) { const c = new Chess(fen); return c.isGameOver() ? null : c.turn(); }

// ---------- Eigene Varianten: beide Seiten ziehen ----------
const live = new Map();
async function evalOf(fen) {
  const gi = st.P.fens.indexOf(fen);
  if (gi >= 0 && st.an.lines[gi]) { const l = st.an.lines[gi][0]; return { ev: st.an.evals[gi], best: l?.move, pv: l?.pv || [] }; }
  if (live.has(fen)) return live.get(fen);
  const c = new Chess(fen);
  let o;
  if (c.isCheckmate()) o = { ev: { mate: 0, cp: null, matedWhite: c.turn() === 'w' }, best: null, pv: [] };
  else if (c.isDraw() || c.isStalemate()) o = { ev: { cp: 0, mate: null }, best: null, pv: [] };
  else { const r = await pool.analyse(fen, { depth: 16, movetime: 700, multipv: 1 }); const l = r.lines[0]; o = { ev: { cp: l?.cp ?? 0, mate: l?.mate ?? null }, best: l?.move, pv: l?.pv || [] }; }
  live.set(fen, o); return o;
}
function classifyVar(b, a, mv) {
  const wb = winPct(b.ev), wa = winPct(a.ev);
  const loss = Math.max(0, mv.color === 'w' ? wb - wa : wa - wb);
  if (b.best === mv.uci || loss < .5) return 'best';
  return loss < 2 ? 'excellent' : loss < 5 ? 'good' : loss < 10 ? 'inaccuracy' : loss < 20 ? 'mistake' : 'blunder';
}
function onReviewMove(from, to, promo) {
  if (!st.an || $('#v-review').classList.contains('analysing')) return;
  const fen = board.fen, c = new Chess(fen);
  let m; try { m = c.move({ from, to, promotion: promo }); } catch { return; }
  const uci = from + to + (m.promotion || '');
  if (!st.var) {
    // Gleicher Zug wie in der Partie → einfach der Partie folgen
    if (st.ply < st.P.moves.length && st.P.moves[st.ply].uci === uci) return go(st.ply + 1);
    st.var = { base: st.ply, fens: [fen], moves: [], idx: 0 };
  } else { st.var.fens.length = st.var.idx + 1; st.var.moves.length = st.var.idx; }
  st.var.fens.push(c.fen()); st.var.moves.push({ san: m.san, uci, from, to, color: m.color, piece: m.piece }); st.var.idx++;
  showVar(true);
}
async function showVar(animate) {
  const v = st.var, fen = v.fens[v.idx], mv = v.moves[v.idx - 1];
  board.setPosition(fen, { last: mv ? { from: mv.from, to: mv.to } : null, animate }); board.setArrows([]); board.setMarks({});
  board.setMovable(movableColor(fen));
  renderVarLine();
  document.querySelectorAll('.mv').forEach(e => e.classList.remove('cur'));
  setCoachPiece(mv?.color, mv?.piece);
  $('.coach-ico').innerHTML = ''; $('.coach-txt').innerHTML = mv ? `<b>${esc(mv.san)}</b> – <span style="color:var(--mut)">wird geprüft …</span>` : 'Eigene Variante';
  $('#steps').style.display = 'none';
  st.hint = 0; updHint(); st.varArrows = []; st.varMarks = {};
  const tok = ++st.varTok;
  const [b, a] = await Promise.all([mv ? evalOf(v.fens[v.idx - 1]) : null, evalOf(fen)]);
  if (tok !== st.varTok) return;
  setEvalBar(a.ev);
  const ce = $('.coach-eval'); ce.textContent = fmtEval(a.ev); ce.classList.toggle('neg', winPct(a.ev) < 50);
  const c = new Chess(fen);
  let text;
  if (mv) {
    const cls = classifyVar(b, a, mv);
    board.setPosition(fen, { last: { from: mv.from, to: mv.to }, badge: { sq: mv.to, cls } });
    $('.coach-ico').innerHTML = icon(cls, 30);
    $('.coach-txt').innerHTML = `<b>${esc(mv.san)}</b> – <b style="color:${CLASS_COLOR[cls]}">${CLASS_DE[cls]}</b> <span class="tag">eigene Variante</span>`;
    const prev = v.fens[v.idx - 1];
    const g = st.g, opp = me(g) === 'w' ? g.black.username : g.white.username;
    const J = judgeIdea({ before: prev, after: fen, m: { ...mv, promotion: mv.uci[4] }, b, a, my: me(g), oppName: opp, startEv: v.idx > 1 ? st.an.evals[v.base] : null, prevFen: v.idx >= 2 ? v.fens[v.idx - 2] : (v.base > 0 ? st.P.fens[v.base - 1] : null) });
    text = J.text; st.varArrows = J.arrows; st.varMarks = J.marks;
    const av = $('.avatar'); av.style.borderColor = CLASS_COLOR[cls];
    av.classList.remove('jump', 'nod', 'tilt', 'shake'); void av.offsetWidth; av.classList.add(cls === 'best' ? 'nod' : ['mistake', 'blunder'].includes(cls) ? 'shake' : 'tilt');
  } else { text = 'Spiel deine Idee: Zieh Figuren für Weiß und Schwarz – ich sage dir nach jedem Zug, ob sie funktioniert und warum.'; st.varArrows = []; st.varMarks = {}; }
  if (c.isCheckmate()) text += ' Schachmatt!';
  else if (c.isDraw()) text += ' Die Stellung ist remis.';
  else if (a.best && !mv) text += '';
  const el = $('#steps'); el.style.display = ''; el.innerHTML = `<div class="step-text">${esc(text)}</div>`;
  applyVarHint();
}
function applyVarHint() { if (!st.var) return; board.setArrows([...(st.varArrows || []), ...bestArrow()]); board.setMarks({ ...(st.varMarks || {}), ...hintMarks() }); }
function renderVarLine() {
  const el = $('#varLine'), v = st.var;
  if (!v) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const startNo = Math.floor(v.base / 2) + 1;
  let h = '', no = startNo;
  v.moves.forEach((m, k) => {
    const ply = v.base + k;
    if (m.color === 'w') h += `<span class="vn">${Math.floor(ply / 2) + 1}.</span>`; else if (k === 0) h += `<span class="vn">${Math.floor(ply / 2) + 1}…</span>`;
    h += `<span class="vm ${k + 1 === v.idx ? 'cur' : ''}" data-vi="${k + 1}">${figSan(m.san, m.color)}</span>`;
  });
  el.style.display = '';
  el.innerHTML = `<div class="var-head"><span>Eigene Variante ab Zug ${startNo}</span><button class="btn" id="varBack">↩ Zur Partie</button></div><div class="var-moves">${h || '<span class="vn">Noch kein Zug</span>'}</div>`;
  $('#varBack').onclick = () => go(v.base);
}

// Persönliche Zusammenfassung zu Beginn
function summary(g, an, P) {
  const c = me(g), o = c === 'w' ? 'b' : 'w', r = resultOf(g), opp = (o === 'w' ? g.white : g.black).username;
  const a = an.accuracy[c], b = an.accuracy[o];
  const mine = an.moves.map((m, i) => ({ ...m, i })).filter(m => P.moves[m.i].color === c);
  const worst = mine.filter(m => SERIOUS.includes(m.cls)).sort((x, y) => y.loss - x.loss)[0];
  const best = mine.filter(m => ['brilliant', 'great'].includes(m.cls))[0];
  let t = r === 'w' ? `Sieg gegen ${opp}!` : r === 'l' ? `Niederlage gegen ${opp}.` : `Remis gegen ${opp}.`;
  t += worst ? ` Entscheidend: ${P.moves[worst.i].san} (Zug ${Math.floor(worst.i / 2) + 1}).` : ' Ohne echten Fehler – stark!';
  return t;
}
function myHistory() {
  const h = { games: 0, err: {}, serious: 0, pressure: 0 };
  for (const g of st.games) {
    const an = st.analyses.get(g.url); if (!an) continue; h.games++;
    const P = parseGame(g), c = me(g);
    an.moves.forEach((m, i) => { if (P.moves[i].color !== c || !SERIOUS.includes(m.cls)) return; h.serious++; if (m.pressure) h.pressure++; if (m.err) h.err[m.err] = (h.err[m.err] || 0) + 1; });
  }
  h.pressureShare = h.serious ? h.pressure / h.serious : 0;
  return h;
}

// Zugliste: Figurensymbole statt Buchstaben, Symbole nur bei wichtigen Zügen
const NOTABLE = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);
function figSan(san, color) {
  const m = /^([KQRBN])(.*)$/.exec(san);
  // helle Figurensymbole für beide Seiten – die Spalte zeigt die Farbe, auf dunklem Grund besser lesbar
  return `<span class="san">${m ? `<img class="fig" src="pieces/w${m[1]}.svg" alt="">${esc(m[2])}` : esc(san)}</span>`;
}
// Zwei Ansichten: Übersicht und Zug für Zug
function setMode(m) {
  st.mode = m;
  const p = document.querySelector('#v-review .panel'); p.classList.toggle('mode-sum', m === 'sum'); p.classList.toggle('mode-mov', m === 'mov');
  const b = $('#backSum'); if (b) b.style.display = m === 'mov' ? '' : 'none';
}

// Erklärung in Schritten
function renderSteps() {
  const el = $('#steps'), ex = st.ex;
  if (!ex || !ex.steps.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const n = ex.steps.length;
  el.innerHTML = `<div class="step-text"></div>` + (n > 1 ? `<div class="steps-nav"><button data-s="-1" title="Zurück (↑)">◀</button><span class="dots">${ex.steps.map((_, k) => `<i data-k="${k}"></i>`).join('')}</span><button data-s="1" title="Weiter (↓)">▶</button></div>` : '');
}
function applyStep(k) {
  const ex = st.ex, i = st.ply - 1;
  if (!ex) { board.setArrows(bestArrow()); board.setMarks({}); return; }
  k = Math.max(0, Math.min(ex.steps.length - 1, k)); const s = ex.steps[k];
  if (k !== st.step || s.fen !== board.fen) {
    const mvx = st.P.moves[i];
    board.setPosition(s.fen, { last: s.last, badge: s.fen === st.P.fens[st.ply] && mvx && st.an.moves[i].cls !== 'forced' ? { sq: mvx.to, cls: st.an.moves[i].cls } : null });
  }
  st.step = k;
  const live0 = s.fen === st.P.fens[st.ply];
  board.setArrows([...s.arrows, ...(live0 ? bestArrow() : [])]); board.setMarks({ ...s.marks, ...(live0 ? hintMarks() : {}) });
  const tx = document.querySelector('#steps .step-text'); if (tx) tx.textContent = s.text;
  document.querySelectorAll('#steps .dots i').forEach(e => e.classList.toggle('on', +e.dataset.k === k));
}
function curBest() { if (st.var) return live.get(st.var.fens[st.var.idx])?.best; return st.an.lines[st.ply]?.[0]?.move; }
function bestArrow() { const nb = curBest(); return st.hint === 2 && nb ? [{ from: nb.slice(0, 2), to: nb.slice(2, 4), color: 'rgba(91,143,199,.85)' }] : []; }
function hintMarks() { const nb = curBest(); return st.hint === 1 && nb ? { [nb.slice(0, 2)]: 'hint' } : {}; }
function updHint() { const b = $('#hintBtn'); if (!b) return; b.textContent = ['💡 Tipp', '💡 Zug zeigen', '💡 Ausblenden'][st.hint || 0]; b.classList.toggle('on', !!st.hint); }

// Stapelanalyse
async function batch() {
  if (st.busy) return toast('Analyse läuft noch …');
  const todo = filtered().filter(g => !st.analyses.has(g.url)).slice(0, 20);
  if (!todo.length) return toast('Die letzten Partien sind schon analysiert.');
  st.busy = true; show('games'); $('#v-games').appendChild($('#progress'));
  const t0 = performance.now(); let doneMoves = 0;
  const totalMoves = todo.reduce((s, g) => s + parseGame(g).fens.length, 0);
  try {
    for (const [k, g] of todo.entries()) {
      await ensureAnalysis(g, 'schnell', d => {
        const el = (performance.now() - t0) / 1000, cur = doneMoves + d;
        progress(true, `Partie ${k + 1} von ${todo.length}`, cur, totalMoves, `Schnellanalyse · noch ca. ${Math.max(1, Math.round(el / cur * (totalMoves - cur) / 60))} min`);
      });
      doneMoves += parseGame(g).fens.length;
      renderGames();
    }
    toast(`${todo.length} ${todo.length === 1 ? 'Partie' : 'Partien'} analysiert – sieh dir „Fehleranalyse“ und „Taktik“ an.`);
  } catch (e) { toast('Fehler: ' + e.message); }
  finally { progress(false); $('#v-review').appendChild($('#progress')); st.busy = false; }
}

// ---------- Fehleranalyse ----------
function renderErrors() {
  const el = $('#errorsBody');
  const games = st.games;
  const ag = games.filter(g => st.analyses.has(g.url));
  if (!games.length) { el.innerHTML = '<div class="empty">Lade zuerst deine Partien.</div>'; return; }
  // Eröffnungen (ohne Engine, alle Partien)
  const op = {};
  for (const g of games) {
    const c = me(g), k = c + '|' + openingOf(g).split(' ').slice(0, 4).join(' ');
    const o = op[k] ??= { c, name: k.slice(2), n: 0, w: 0, d: 0, l: 0, acc: [] };
    o.n++; o[resultOf(g)]++;
    const an = st.analyses.get(g.url); if (an?.accuracy[c] != null) o.acc.push(an.accuracy[c]);
  }
  const ops = Object.values(op).sort((a, b) => b.n - a.n).slice(0, 12);
  const opTable = `<table class="op"><tr><th>Eröffnung</th><th>Farbe</th><th class="r">Partien</th><th>S / R / N</th><th class="r">Punkte</th><th class="r">Ø Gen.</th></tr>` +
    ops.map(o => { const sc = Math.round(100 * (o.w + o.d / 2) / o.n); return `<tr><td>${esc(o.name)}</td><td>${o.c === 'w' ? 'Weiß' : 'Schwarz'}</td><td class="r">${o.n}</td><td><div class="wdl"><i style="width:${100 * o.w / o.n}%"></i><i style="width:${100 * o.d / o.n}%"></i><i style="width:${100 * o.l / o.n}%"></i></div></td><td class="r" style="color:${sc < 40 ? 'var(--red)' : sc >= 60 ? 'var(--acc)' : ''}">${sc} %</td><td class="r">${o.acc.length ? (o.acc.reduce((a, b) => a + b, 0) / o.acc.length).toFixed(1) : '–'}</td></tr>`; }).join('') + '</table>';

  if (!ag.length) {
    el.innerHTML = `<h2>Fehleranalyse</h2><div class="card" style="margin-bottom:14px">Noch keine Partie analysiert. Für die Fehlerauswertung brauche ich die Engine-Analyse deiner Partien.<br><br><button class="btn primary" id="eBatch">Letzte 20 Partien analysieren</button></div><div class="card"><h3>Deine Eröffnungen (${games.length} Partien)</h3>${opTable}</div>`;
    $('#eBatch').onclick = batch; return;
  }
  // Eigene Züge sammeln
  const mv = [];
  for (const g of ag) { const an = st.analyses.get(g.url), P = parseGame(g), c = me(g); an.moves.forEach((m, i) => { if (P.moves[i].color === c) mv.push({ ...m, g, i, san: P.moves[i].san }); }); }
  const serious = mv.filter(m => SERIOUS.includes(m.cls));
  const blunders = mv.filter(m => m.cls === 'blunder').length;
  const accs = ag.map(g => st.analyses.get(g.url).accuracy[me(g)]).filter(x => x != null);
  const avgAcc = accs.reduce((a, b) => a + b, 0) / accs.length;
  const pressN = serious.filter(m => m.pressure).length;
  const phases = ['opening', 'middlegame', 'endgame'].map(p => { const all = mv.filter(m => m.phase === p).length, bad = serious.filter(m => m.phase === p).length; return { p, all, bad, rate: all ? 100 * bad / all : 0 }; });
  const maxRate = Math.max(...phases.map(x => x.rate), 1);
  const types = Object.keys(ERR_DE).map(k => ({ k, n: serious.filter(m => m.err === k).length })).sort((a, b) => b.n - a.n);
  const maxT = Math.max(...types.map(t => t.n), 1);

  // Baustellen
  const tips = [];
  const topT = types[0];
  if (topT?.n) tips.push([`${ERR_DE[topT.k]}: ${Math.round(100 * topT.n / serious.length)} % deiner Fehler`, {
    hung: 'Vor jedem Zug prüfen: Welche Figur ist nach meinem Zug ungedeckt, was kann der Gegner schlagen?', missedTactic: 'Du siehst die Taktiken deiner Gegner nicht als Chance. Vor jedem Zug Schachs, Schläge und Drohungen prüfen.',
    missedMate: 'Mattbilder trainieren – die Taktikaufgaben hier sind aus genau diesen Stellungen.', allowedMate: 'Achte auf deine Königssicherheit: offene Linien und Grundreihe.',
    notPunished: 'Wenn der Gegner einen Fehler macht: langsamer werden und die Gewinnfortsetzung suchen.', positional: 'Kein taktisches Muster – eher Planlosigkeit. Mehr Zeit in ruhigen Stellungen für einen Plan nehmen.'
  }[topT.k]]);
  if (serious.length >= 5 && pressN / serious.length >= .25) tips.push([`${Math.round(100 * pressN / serious.length)} % deiner Fehler passieren unter Zeitdruck`, 'Du verbrauchst zu viel Zeit früh in der Partie. Eröffnung schneller spielen, Zeit für kritische Momente sparen – oder längere Bedenkzeit spielen.']);
  const wp = [...phases].sort((a, b) => b.rate - a.rate)[0];
  if (wp.all > 20) tips.push([`Schwächste Phase: ${PHASE_DE[wp.p]} (${wp.rate.toFixed(1)} Fehler pro 100 Züge)`, { opening: 'Lerne deine Haupteröffnungen 8–10 Züge tief, statt zu improvisieren.', middlegame: 'Taktiktraining bringt hier am meisten.', endgame: 'Grundlegende Endspiele (Turm-, Bauernendspiele) üben – da verschenkst du Punkte.' }[wp.p]]);
  const badOp = ops.filter(o => o.n >= 4).map(o => ({ ...o, sc: (o.w + o.d / 2) / o.n })).sort((a, b) => a.sc - b.sc)[0];
  if (badOp && badOp.sc < .4) tips.push([`Problem-Eröffnung: ${badOp.name} mit ${badOp.c === 'w' ? 'Weiß' : 'Schwarz'} (${Math.round(badOp.sc * 100)} % Punkte)`, 'Entweder gezielt lernen oder durch eine andere Eröffnung ersetzen.']);

  const trend = ag.slice().sort((a, b) => a.end_time - b.end_time).map(g => st.analyses.get(g.url).accuracy[me(g)]).filter(x => x != null);
  const tN = Math.max(1, trend.length - 1);
  const trendSvg = `<svg viewBox="0 0 ${tN} 100" preserveAspectRatio="none" style="width:100%;height:120px;background:#2e2d29;border-radius:6px">
    ${[25, 50, 75].map(y => `<line x1="0" x2="${tN}" y1="${y}" y2="${y}" stroke="#3b3a36" vector-effect="non-scaling-stroke"/>`).join('')}
    <polyline points="${trend.map((v, i) => `${i},${100 - v}`).join(' ')}" fill="none" stroke="#7fbf4d" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
  const worst = serious.slice().sort((a, b) => b.loss - a.loss).slice(0, 10);

  el.innerHTML = `<h2>Fehleranalyse · ${ag.length} analysierte Partien</h2>
  <div class="kpis">
    <div class="kpi"><div class="k">Ø Genauigkeit</div><div class="v">${avgAcc.toFixed(1)}</div><div class="s">über ${accs.length} Partien</div></div>
    <div class="kpi"><div class="k">Patzer pro Partie</div><div class="v" style="color:var(--red)">${(blunders / ag.length).toFixed(1)}</div><div class="s">${blunders} insgesamt</div></div>
    <div class="kpi"><div class="k">Fehler + Patzer pro 100 Züge</div><div class="v">${(100 * serious.length / mv.length).toFixed(1)}</div><div class="s">${serious.length} von ${mv.length} Zügen</div></div>
    <div class="kpi"><div class="k">Fehler unter Zeitdruck</div><div class="v">${serious.length ? Math.round(100 * pressN / serious.length) : 0} %</div><div class="s">&lt; 30 s bzw. 10 % der Zeit</div></div>
  </div>
  <h3>Deine größten Baustellen</h3>
  <div class="tips" style="margin-bottom:14px">${tips.map(t => `<div class="tip"><div><b>${esc(t[0])}</b><span>${esc(t[1])}</span></div></div>`).join('') || '<div class="tip" style="border-color:var(--acc)"><div><b>Keine klare Schwäche</b><span>Analysiere mehr Partien für ein genaueres Bild.</span></div></div>'}</div>
  <div class="grid2">
    <div class="card"><h3>Fehlertypen</h3>${types.map(t => `<div class="hbar"><span>${ERR_DE[t.k]}</span><div class="t"><i style="width:${100 * t.n / maxT}%;background:var(--red)"></i></div><span class="n">${t.n}</span></div>`).join('')}</div>
    <div class="card"><h3>Fehler nach Spielphase <span style="color:var(--mut);font-weight:400">(pro 100 eigene Züge)</span></h3>${phases.map(p => `<div class="hbar"><span>${PHASE_DE[p.p]}</span><div class="t"><i style="width:${100 * p.rate / maxRate}%;background:#f59a4a"></i></div><span class="n">${p.rate.toFixed(1)}</span></div>`).join('')}
      <h3 style="margin-top:18px">Genauigkeit im Verlauf</h3>${trendSvg}</div>
  </div>
  <div class="grid2">
    <div class="card"><h3>Deine Eröffnungen (${games.length} Partien)</h3>${opTable}</div>
    <div class="card moments"><h3>Teuerste Fehler</h3>${worst.map((m, k) => `<div class="mo" data-k="${k}">${icon(m.cls, 20)}<div><b>${esc(m.san)}</b> <em>gegen ${esc(me(m.g) === 'w' ? m.g.black.username : m.g.white.username)} · ${ERR_DE[m.err] || ''}${m.pressure ? ' · Zeitdruck' : ''}</em></div><em>−${m.loss.toFixed(0)} %</em></div>`).join('')}</div>
  </div>`;
  el.querySelectorAll('.mo').forEach(d => d.onclick = () => { const m = worst[+d.dataset.k]; openReview(m.g, m.i + 1); });
}

// ---------- Taktik ----------
const pz = { cur: null, k: 0, fen: null, firstTry: true, done: false, filter: 'all' };
async function myPuzzles() {
  const u = st.user.toLowerCase(); const urls = new Set(st.games.map(g => g.url));
  return (await S.all('puzzles')).filter(p => urls.has(p.gameUrl) && (pz.filter === 'all' || (pz.filter === 'mate' ? p.mate : p.cls === pz.filter)));
}
async function updatePuzzleCount() {
  if (!st.user) return;
  const now = Date.now(); const n = (await myPuzzles()).filter(p => p.due <= now).length;
  $('#puzzleCount').textContent = n ? (n > 99 ? '99+' : n) : '';
}
async function puzzleStart(next = true) {
  const list = await myPuzzles(); const now = Date.now();
  const body = $('#puzzleBody');
  if (!list.length) {
    body.innerHTML = `<div class="pz-head"><b>Noch keine Aufgaben.</b><div class="pz-ctx">Aufgaben entstehen automatisch aus deinen Fehlern und Patzern, sobald Partien analysiert sind.</div></div><div class="pz-actions"><button class="btn primary" id="pzBatch">Letzte 20 Partien analysieren</button></div>`;
    $('#pzBatch').onclick = batch; pboard.setPosition(new Chess().fen()); pboard.setMovable(null); return;
  }
  const due = list.filter(p => p.due <= now).sort((a, b) => (b.failed - b.solved) - (a.failed - a.solved) || b.end_time - a.end_time);
  const p = (next || !pz.cur) ? (due[0] || list.sort((a, b) => a.due - b.due)[0]) : pz.cur;
  Object.assign(pz, { cur: p, k: 0, fen: p.fen, firstTry: true, done: false });
  pboard.setOrientation(p.color); pboard.setPosition(p.fen); pboard.setArrows([]); pboard.setMarks({}); pboard.setMovable(p.color);
  const solved = list.filter(x => x.solved > 0).length;
  body.innerHTML = `
    <div class="pz-head"><div class="pz-turn"><i class="${p.color}"></i>${p.color === 'w' ? 'Weiß' : 'Schwarz'} am Zug</div>
      <div class="pz-ctx">${p.mate ? `Matt in ${p.mate} · ` : ''}Aus deiner Partie gegen ${esc(p.opponent)} (${TC_DE[p.time_class] || ''}, ${fmtDate(p.end_time)}). Hier hast du einen ${CLASS_DE[p.cls]} gespielt – finde den besten Zug.</div></div>
    <div class="pz-msg" id="pzMsg">Dein Zug.</div>
    <div class="pz-actions"><button class="btn" id="pzHint">Tipp</button><button class="btn" id="pzSol">Lösung zeigen</button><button class="btn" id="pzGame">Partie ansehen</button><div class="grow"></div><button class="btn primary" id="pzNext">Nächste</button></div>
    <div class="pz-stats"><div><b>${due.length}</b><span>fällig</span></div><div><b>${solved}</b><span>gelöst</span></div><div><b>${list.length}</b><span>gesamt</span></div></div>
    <div class="pz-filter"><select id="pzFilter"><option value="all">Alle Aufgaben</option><option value="blunder">Nur aus Patzern</option><option value="mistake">Nur aus Fehlern</option><option value="miss">Nur verpasste Chancen</option><option value="mate">Nur Mattaufgaben</option></select></div>`;
  $('#pzFilter').value = pz.filter;
  $('#pzFilter').onchange = e => { pz.filter = e.target.value; puzzleStart(true); updatePuzzleCount(); };
  $('#pzNext').onclick = () => puzzleStart(true);
  $('#pzHint').onclick = () => { if (pz.done) return; pboard.setMarks({ [p.solution[pz.k].slice(0, 2)]: 'hint' }); pz.firstTry && record(false); };
  $('#pzSol').onclick = showSolution;
  $('#pzGame').onclick = () => { const g = st.games.find(x => x.url === p.gameUrl); if (g) openReview(g, p.ply + 1); };
}
function msg(t, cls = '') { const m = $('#pzMsg'); m.className = 'pz-msg ' + cls; m.innerHTML = t; }
async function record(ok) {
  const p = pz.cur; if (!pz.firstTry) return; pz.firstTry = false;
  p.tries++; ok ? p.solved++ : p.failed++;
  const streak = Math.max(0, p.solved - p.failed);
  p.due = Date.now() + (ok ? [1, 3, 7, 21, 60][Math.min(4, streak)] * 864e5 : 10 * 60e3);
  await S.put('puzzles', p); updatePuzzleCount();
}
const applyUci = (fen, u) => { const c = new Chess(fen); const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); return { fen: c.fen(), m, c }; };
async function onPuzzleMove(from, to, promo) {
  const p = pz.cur; if (pz.done) return;
  const exp = p.solution[pz.k];
  const uci = from + to + (promo && exp?.length === 5 && exp.slice(0, 4) === from + to ? exp[4] : promo || '');
  const { fen, m, c } = applyUci(pz.fen, uci);
  pboard.setPosition(fen, { last: { from, to } }); pboard.setArrows([]);
  if (uci === exp || c.isCheckmate()) return correct(fen, from, to, c.isCheckmate());
  // Gleichwertige Alternative?
  pboard.setMovable(null); msg('Prüfe Zug …');
  const r = await pool.analyse(fen, { depth: 16, movetime: 800, multipv: 1 });
  const l = r.lines[0]; const wp = l ? (p.color === 'w' ? winPct(l) : 100 - winPct(l)) : 0;
  if (wp >= Math.min(p.wpBest - 4, 90) && wp >= 65) return correct(fen, from, to, true, true);
  pboard.setMarks({ [to]: 'bad' });
  msg(`${icon('mistake', 22)} ${esc(m.san)} ist nicht die Lösung. Versuch es nochmal.`, 'bad');
  record(false);
  setTimeout(() => { if (pz.done) return; pboard.setPosition(pz.fen); pboard.setMarks({}); pboard.setMovable(p.color); }, 900);
}
function correct(fen, from, to, finished, alt) {
  const p = pz.cur; pz.fen = fen; pboard.setMarks({ [to]: 'good' });
  if (finished || pz.k + 1 >= p.solution.length) {
    pz.done = true; pboard.setMovable(null); record(true);
    msg(`${icon(alt ? 'excellent' : 'best', 22)} ${alt ? 'Auch gut – gleich starker Zug!' : 'Gelöst!'} In der Partie hattest du ${esc(p.played)} gespielt.`, 'ok');
    return;
  }
  msg(`${icon('best', 22)} Richtig! Weiter …`, 'ok'); pboard.setMovable(null);
  setTimeout(() => {
    const opp = p.solution[pz.k + 1]; const r = applyUci(pz.fen, opp);
    pz.fen = r.fen; pz.k += 2;
    pboard.setPosition(r.fen, { last: { from: opp.slice(0, 2), to: opp.slice(2, 4) }, animate: true }); pboard.setMarks({});
    pboard.setMovable(p.color); msg('Finde den nächsten Zug.');
  }, 450);
}
async function showSolution() {
  const p = pz.cur; if (pz.done) return; record(false); pz.done = true; pboard.setMovable(null);
  const sans = []; let f = pz.fen;
  for (let k = pz.k; k < p.solution.length; k++) {
    const r = applyUci(f, p.solution[k]); sans.push(r.m.san);
    pboard.setPosition(r.fen, { last: { from: p.solution[k].slice(0, 2), to: p.solution[k].slice(2, 4) }, animate: true });
    f = r.fen; await new Promise(res => setTimeout(res, 650));
  }
  msg(`Lösung: ${esc(sans.join(' '))} · In der Partie: ${esc(p.played)}`, 'bad');
}

// ---------- Verdrahtung ----------
const board = new Board($('#reviewBoard'), { onMove: onReviewMove });
const pboard = new Board($('#puzzleBoard'), { onMove: onPuzzleMove });
// Bewertungsbalken auf Brett-Höhe halten
new ResizeObserver(() => { $('.evalbar').style.height = $('#reviewBoard').offsetHeight + 'px'; }).observe($('#reviewBoard'));

document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.view));
$('#userForm').onsubmit = e => { e.preventDefault(); loadUser($('#user').value); };
$('#quality').value = st.quality; $('#quality').onchange = e => { st.quality = e.target.value; S.ls.set('quality', st.quality); };
$('#tcFilter').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.tc = b.dataset.tc; $('#tcFilter').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderGames(); };
$('#gameList').onclick = e => { const r = e.target.closest('.g-row'); if (r) openReview(filtered()[+r.dataset.i]); };
$('#batchBtn').onclick = batch;
$('#steps').onclick = e => { const b = e.target.closest('[data-s]'); if (b) return applyStep(st.step + +b.dataset.s); const d = e.target.closest('[data-k]'); if (d) applyStep(+d.dataset.k); };
// Klick auf eine Stufe in der Tabelle → zum (nächsten) Zug dieser Stufe springen
$('#clsTable').onclick = e => {
  const c = e.target.closest('.jump'); if (!c || !st.an) return;
  const idx = st.an.moves.map((m, i) => i).filter(i => st.an.moves[i].cls === c.dataset.cls && st.P.moves[i].color === c.dataset.side);
  if (!idx.length) return;
  const nx = idx.find(i => i + 1 > st.ply) ?? idx[0];
  go(nx + 1);
};
$('#varLine').onclick = e => { const m = e.target.closest('[data-vi]'); if (m && st.var) { st.var.idx = +m.dataset.vi; showVar(false); } };
$('#moveList').onclick = e => { const m = e.target.closest('.mv'); if (m) go(+m.dataset.ply); };
$('#graph').onclick = e => { if (!st.an) return; const b = e.currentTarget.getBoundingClientRect(); go(Math.round((e.clientX - b.left) / b.width * (st.an.evals.length - 1))); };
document.querySelector('.controls').onclick = e => { const n = e.target.closest('[data-nav]')?.dataset.nav; if (!n) return; go({ first: 0, prev: st.ply - 1, next: st.ply + 1, last: 1e9 }[n]); };
$('#hintBtn').onclick = () => { st.hint = ((st.hint || 0) + 1) % 3; updHint(); if (st.var) applyVarHint(); else applyStep(st.step); };
$('#nextBtn').onclick = () => { if (st.var) { if (st.var.idx < st.var.moves.length) { st.var.idx++; showVar(true); } } else go(st.ply + 1); };
$('#startBtn').onclick = () => go(Math.max(1, st.ply));
$('#flipBtn').onclick = () => { board.flip(); if (st.an) { renderGraph(); go(st.ply); } };
// Partie suchen (im Spielbericht)
function openPicker() { $('#gamePicker').classList.add('on'); $('#pickQ').value = ''; renderPicker(); setTimeout(() => $('#pickQ').focus(), 30); }
function closePicker() { $('#gamePicker').classList.remove('on'); }
function renderPicker() {
  const q = $('#pickQ').value.trim().toLowerCase();
  const list = st.games.filter(g => {
    if (!q) return true;
    const c = me(g), opp = (c === 'w' ? g.black : g.white).username;
    return `${opp} ${openingOf(g)} ${fmtDate(g.end_time)} ${TC_DE[g.time_class] || ''} ${{ w: 'sieg gewonnen', l: 'niederlage verloren', d: 'remis' }[resultOf(g)]}`.toLowerCase().includes(q);
  }).slice(0, 150);
  st.pick = list;
  $('#pickList').innerHTML = list.length ? list.map((g, i) => {
    const c = me(g), o = c === 'w' ? g.black : g.white, r = resultOf(g), an = st.analyses.get(g.url);
    return `<div class="pk-row ${st.g && st.g.url === g.url ? 'cur' : ''}" data-i="${i}"><div class="g-res ${r}">${r === 'w' ? 'S' : r === 'l' ? 'N' : '½'}</div>
      <div><b>${esc(o.username)}</b> <em>(${o.rating})</em><div class="pk-sub">${esc(openingOf(g))}</div></div>
      <div class="pk-sub">${TC_DE[g.time_class] || ''}<br>${fmtDate(g.end_time)}</div>
      <div class="g-acc">${an ? an.accuracy[c] + '<small> %</small>' : '<span class="tag">neu</span>'}</div></div>`;
  }).join('') : '<div class="empty">Keine Partie gefunden.</div>';
}
$('#pickQ').oninput = renderPicker;
$('#pickQ').onkeydown = e => { if (e.key === 'Enter' && st.pick?.[0]) { closePicker(); openReview(st.pick[0]); } if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } };
$('#pickList').onclick = e => { const r = e.target.closest('.pk-row'); if (r) { closePicker(); openReview(st.pick[+r.dataset.i]); } };
$('#gamePicker').onclick = e => { if (e.target.id === 'gamePicker' || e.target.closest('#pickClose')) closePicker(); };

// Vollbild
function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function enterFull() { if (isFull()) return; const d = document.documentElement; try { (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d)?.catch?.(() => {}); } catch {} }
function exitFull() { if (!isFull()) return; try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}); } catch {} }
document.addEventListener('keydown', e => {
  if ($('#gamePicker').classList.contains('on')) { if (e.key === 'Escape') closePicker(); return; }
  if (st.view === 'review' && e.key === '/' ) { openPicker(); e.preventDefault(); return; }
  if (st.view === 'review' && e.key === 'Escape' && !isFull()) { show('games'); return; }
  if (st.view !== 'review' || e.target.matches('input,select')) return;
  if (st.var) {
    if (e.key === 'ArrowLeft') { if (st.var.idx > 0) { st.var.idx--; showVar(false); } else go(st.var.base); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { if (st.var.idx < st.var.moves.length) { st.var.idx++; showVar(true); } e.preventDefault(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); return; }
  }
  if (e.key === 'ArrowLeft') { go(st.ply - 1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { go(st.ply + 1); e.preventDefault(); }
  if (e.key === 'ArrowUp') { applyStep(st.step - 1); e.preventDefault(); }
  if (e.key === 'ArrowDown') { applyStep(st.step + 1); e.preventDefault(); }
});

// Einstellungen beim lokalen Server (Auto-Öffnen, Autostart)
async function saveCfg(d) { try { const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); return await r.json(); } catch { return null; } }
async function initCfg() {
  try {
    const c = await (await fetch('/api/config')).json();
    $('#autoOpen').checked = c.autoOpen; $('#autostart').checked = c.autostart;
    if (c.version) $('#verLabel').textContent = 'Version ' + c.version;
    if (!st.user && c.user) { st.user = c.user; S.ls.set('user', c.user); }
    else if (st.user && c.user !== st.user) saveCfg({ user: st.user });
  } catch {}
}
$('#quitBtn').onclick = async () => {
  try { await fetch('/api/quit', { method: 'POST' }); } catch {}
  document.body.innerHTML = '<div style="margin:auto;text-align:center;color:#9a9890;font:15px -apple-system,sans-serif"><b style="color:#e8e6e1;font-size:18px">Schachanalyse ist beendet.</b><br><br>Du kannst diesen Tab schließen.<br>Neu starten über das App-Symbol.</div>';
};
$('#autoOpen').onchange = e => { saveCfg({ autoOpen: e.target.checked }); toast(e.target.checked ? 'Neue Partien öffnen sich automatisch.' : 'Automatisches Öffnen aus.'); };
$('#autostart').onchange = e => { saveCfg({ autostart: e.target.checked }); toast(e.target.checked ? 'Startet ab jetzt beim Anmelden am Mac im Hintergrund.' : 'Autostart aus.'); };

(async () => {
  for (const a of await S.all('analyses')) st.analyses.set(a.url, a);
  st.view = 'games';
  await initCfg();
  const want = new URLSearchParams(location.search).get('game');
  if (want) window.history.replaceState(null, '', '/');
  if (st.user) await loadUser(st.user, !want);
  if (want) openWanted(want);
})();

// Partie per Knopf/Lesezeichen öffnen. chess.com stellt neue Partien manchmal erst nach 1–2 Minuten bereit → warten.
async function openWanted(want) {
  if (!st.user) return toast('Gib zuerst deinen chess.com-Namen ein.');
  const find = () => want === 'last' ? st.games[0] : st.games.find(x => x.url === want);
  let g = find();
  for (let k = 0; !g && k < 12; k++) {
    if (k) { status(`Partie ist bei chess.com noch nicht abrufbar – neuer Versuch in 15 s (${k}/11)`); await new Promise(r => setTimeout(r, 15000)); }
    try { st.games = await S.loadGames(st.user, 1); renderGames(); } catch {}
    g = want === 'last' ? st.games[0] : find();
  }
  status('');
  if (!g) return toast('Partie nicht gefunden. Ist der Benutzername richtig?');
  toast('Spielbericht wird erstellt …'); openReview(g);
}
$('#lastBtn').onclick = async () => { if (!st.user) return toast('Gib zuerst deinen chess.com-Namen ein.'); try { st.games = await S.loadGames(st.user, 1); renderGames(); } catch {} openWanted('last'); };
$('#bmLink').href = `javascript:(()=>{const m=location.href.match(/game\/(live|daily)\/(\d+)/);window.open('http://localhost:8765/?game='+(m?encodeURIComponent('https://www.chess.com/game/'+m[1]+'/'+m[2]):'last'),'_blank')})()`;
$('#bmLink').onclick = e => { e.preventDefault(); toast('Nicht klicken – in die Lesezeichenleiste ziehen (Lesezeichenleiste einblenden: ⌘⇧B).'); };
