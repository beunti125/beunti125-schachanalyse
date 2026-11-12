// Schachbrett: Anzeige, Pfeile, Bewertungssymbol, Ziehen per Klick oder Drag
import { Chess } from '../vendor/chess.js';
import { icon } from './icons.js';

const FILES = 'abcdefgh';
export class Board {
  constructor(el, opts = {}) {
    this.el = el; this.opts = opts; this.orientation = 'w'; this.fen = new Chess().fen();
    this.last = null; this.badge = null; this.arrows = []; this.marks = {}; this.sel = null; this.movable = null;
    this.uArrows = []; this.uMarks = {}; this.rdown = null;
    el.classList.add('board');
    el.innerHTML = `<div class="sq-layer"></div><div class="pc-layer"></div><svg class="arrow-layer" viewBox="0 0 8 8"></svg><div class="badge-layer"></div>`;
    [this.sqL, this.pcL, this.arL, this.bdL] = el.children;
    this._drawSquares();
    el.addEventListener('pointerdown', e => this._down(e));
    window.addEventListener('pointermove', e => this._move(e));
    window.addEventListener('pointerup', e => this._up(e));
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  _xy(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r]; }
  _sqAt(e) {
    const b = this.el.getBoundingClientRect(); const x = Math.floor((e.clientX - b.left) / b.width * 8), y = Math.floor((e.clientY - b.top) / b.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
  }
  _drawSquares() {
    let h = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = this.orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
      const dark = (x + y) % 2 === 1;
      let co = '';
      if (y === 7) co += `<span class="co co-f">${sq[0]}</span>`;
      if (x === 0) co += `<span class="co co-r">${sq[1]}</span>`;
      h += `<div class="sq ${dark ? 'd' : 'l'}" data-sq="${sq}" style="left:${x * 12.5}%;top:${y * 12.5}%">${co}</div>`;
    }
    this.sqL.innerHTML = h;
    this._paintMarks();
  }
  setOrientation(o) { if (o !== this.orientation) { this.orientation = o; this._drawSquares(); this._drawPieces(); this._drawArrows(); this._drawBadge(); } }
  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }
  setPosition(fen, { last = null, animate = false, badge = null } = {}) {
    if (fen !== this.fen) { this.uArrows = []; this.uMarks = {}; }
    this.fen = fen; this.last = last; this.badge = badge; this.sel = null;
    this._drawPieces(animate && last ? last : null); this._paintMarks(); this._drawBadge();
  }
  setArrows(a) { this.arrows = a || []; this._drawArrows(); }
  setMarks(m) { this.marks = m || {}; this._paintMarks(); }
  setMovable(color) { this.movable = color; this.sel = null; this._paintMarks(); }

  _drawPieces(anim) {
    const ch = new Chess(this.fen); let h = '';
    for (const row of ch.board()) for (const p of row) if (p) {
      const [x, y] = this._xy(p.square);
      h += `<div class="pc" data-sq="${p.square}" style="transform:translate(${x * 100}%,${y * 100}%);background-image:url(pieces/${p.color}${p.type.toUpperCase()}.svg)"></div>`;
    }
    this.pcL.innerHTML = h;
    if (anim) {
      const el = this.pcL.querySelector(`[data-sq="${anim.to}"]`);
      if (el) {
        const [x0, y0] = this._xy(anim.from), [x1, y1] = this._xy(anim.to);
        el.style.transition = 'none'; el.style.transform = `translate(${x0 * 100}%,${y0 * 100}%)`;
        el.getBoundingClientRect();
        el.style.transition = 'transform .16s ease-out'; el.style.transform = `translate(${x1 * 100}%,${y1 * 100}%)`;
      }
    }
  }
  _paintMarks() {
    for (const d of this.sqL.children) {
      const sq = d.dataset.sq; d.classList.remove('last', 'sel', 'hint', 'good', 'bad', 'check', 'brill', 'plan', 'um-o', 'um-r', 'um-b');
      d.querySelector('.dot')?.remove();
      if (this.last && (sq === this.last.from || sq === this.last.to)) d.classList.add('last');
      if (this.marks[sq]) d.classList.add(this.marks[sq]);
      if (this.uMarks[sq]) d.classList.add(this.uMarks[sq]);
      if (this.sel === sq) d.classList.add('sel');
    }
    if (this.sel) {
      const ch = new Chess(this.fen);
      for (const m of ch.moves({ square: this.sel, verbose: true })) {
        const d = this.sqL.querySelector(`[data-sq="${m.to}"]`);
        d.insertAdjacentHTML('beforeend', `<i class="dot ${m.captured ? 'cap' : ''}"></i>`);
      }
    }
    // Schach markieren
    const ch = new Chess(this.fen);
    if (ch.inCheck()) { const k = ch.board().flat().find(p => p && p.type === 'k' && p.color === ch.turn()); this.sqL.querySelector(`[data-sq="${k.square}"]`)?.classList.add('check'); }
  }
  _drawArrows() {
    let h = '';
    for (const a of [...this.arrows, ...this.uArrows]) {
      const [x0, y0] = this._xy(a.from), [x1, y1] = this._xy(a.to);
      const adx = Math.abs(x1 - x0), ady = Math.abs(y1 - y0);
      if ((adx === 1 && ady === 2) || (adx === 2 && ady === 1)) {
        // Springerzug als L: erst die lange Strecke, dann um die Ecke
        const ax = x0 + .5, ay = y0 + .5, bx = x1 + .5, by = y1 + .5;
        const cx = adx === 2 ? bx : ax, cy = adx === 2 ? ay : by;
        const ux = Math.sign(bx - cx), uy = Math.sign(by - cy), ex = bx - ux * .4, ey = by - uy * .4;
        const sx = ax + Math.sign(cx - ax) * .25, sy = ay + Math.sign(cy - ay) * .25;
        const px = -uy, py = ux;
        h += `<path d="M${sx} ${sy}L${cx} ${cy}L${ex} ${ey}" fill="none" stroke="${a.color}" stroke-width=".15" stroke-linejoin="miter" stroke-linecap="butt"/>`;
        h += `<path d="M${ex + px * .21} ${ey + py * .21}L${bx - ux * .06} ${by - uy * .06}L${ex - px * .21} ${ey - py * .21}Z" fill="${a.color}"/>`;
        if (typeof a.label === 'string') h += `<circle cx="${cx}" cy="${cy}" r=".19" fill="${a.color}" stroke="#fff" stroke-width=".035"/><text x="${cx}" y="${cy + .075}" text-anchor="middle" font-size=".22" font-weight="800" fill="#fff" font-family="Arial,sans-serif">${a.label}</text>`;
        continue;
      }
      const ax = x0 + .5, ay = y0 + .5, bx = x1 + .5, by = y1 + .5;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const head = .42, w = .15, sx = ax + ux * .3, sy = ay + uy * .3, ex = bx - ux * head, ey = by - uy * head;
      const px = -uy, py = ux;
      h += `<path d="M${sx + px * w / 2} ${sy + py * w / 2}L${ex + px * w / 2} ${ey + py * w / 2}L${ex + px * .21} ${ey + py * .21}L${bx - ux * .06} ${by - uy * .06}L${ex - px * .21} ${ey - py * .21}L${ex - px * w / 2} ${ey - py * w / 2}L${sx - px * w / 2} ${sy - py * w / 2}Z" fill="${a.color || 'rgba(127,191,77,.85)'}"/>`;
      const lx = (sx + ex) / 2 + px * .3, ly = (sy + ey) / 2 + py * .3;
      if (typeof a.label === 'string') h += `<circle cx="${lx}" cy="${ly}" r=".19" fill="${a.color}" stroke="#fff" stroke-width=".035"/><text x="${lx}" y="${ly + .075}" text-anchor="middle" font-size=".22" font-weight="800" fill="#fff" font-family="Arial,sans-serif">${a.label}</text>`;
    }
    this.arL.innerHTML = h;
  }
  _drawBadge() {
    this.bdL.innerHTML = '';
    if (!this.badge) return;
    const [x, y] = this._xy(this.badge.sq);
    // nicht über den Brettrand hinausragen (8. Reihe oben, h-Linie rechts)
    const left = Math.min((x + 1) * 12.5 - 3.2, 100 - 5.8 - .3), top = Math.max(y * 12.5 - 2.2, .3);
    this.bdL.innerHTML = `<div class="sq-badge" style="left:${left}%;top:${top}%">${icon(this.badge.cls, 64)}</div>`;
  }
  // Eingabe
  _canMove(sq) { if (!this.movable) return false; const p = new Chess(this.fen).get(sq); return p && p.color === this.movable && new Chess(this.fen).turn() === this.movable; }
  async _try(from, to) {
    const ch = new Chess(this.fen);
    const mv = ch.moves({ square: from, verbose: true }).find(m => m.to === to);
    if (!mv) return false;
    const promo = mv.promotion ? 'q' : undefined;
    this.sel = null; this._paintMarks();
    await this.opts.onMove?.(from, to, promo);
    return true;
  }
  // Rechtsklick: Pfeile zeichnen (ziehen) und Felder markieren (klicken)
  _uColor(e) { return e.shiftKey ? 'r' : e.altKey ? 'b' : 'o'; }
  _rightDown(e) { const sq = this._sqAt(e); if (sq) this.rdown = { sq, c: this._uColor(e) }; e.preventDefault(); }
  _rightUp(e) {
    const r = this.rdown; this.rdown = null; if (!r) return;
    const to = this._sqAt(e); if (!to) return;
    const col = { o: 'rgba(240,150,40,.85)', r: 'rgba(226,57,43,.85)', b: 'rgba(70,140,220,.85)' }[r.c];
    if (to === r.sq) { if (this.uMarks[to] === 'um-' + r.c) delete this.uMarks[to]; else this.uMarks[to] = 'um-' + r.c; this._paintMarks(); }
    else {
      const i = this.uArrows.findIndex(a => a.from === r.sq && a.to === to);
      if (i >= 0 && this.uArrows[i].color === col) this.uArrows.splice(i, 1); else { if (i >= 0) this.uArrows.splice(i, 1); this.uArrows.push({ from: r.sq, to, color: col }); }
      this._drawArrows();
    }
  }
  clearUser() { if (!this.uArrows.length && !Object.keys(this.uMarks).length) return; this.uArrows = []; this.uMarks = {}; this._drawArrows(); this._paintMarks(); }
  _down(e) {
    if (e.button === 2) return this._rightDown(e);
    if (e.button !== 0) return;
    this.clearUser();
    const sq = this._sqAt(e); if (!sq) return;
    if (this.sel && this.sel !== sq) { this._try(this.sel, sq).then(ok => { if (!ok && this._canMove(sq)) { this.sel = sq; this._paintMarks(); } else if (!ok) { this.sel = null; this._paintMarks(); } }); if (!this._canMove(sq)) return; }
    if (!this._canMove(sq)) { this.sel = null; this._paintMarks(); return; }
    this.sel = sq; this._paintMarks();
    const pc = this.pcL.querySelector(`[data-sq="${sq}"]`); if (!pc) return;
    const b = this.el.getBoundingClientRect();
    this.drag = { from: sq, pc, b, moved: false, x0: e.clientX, y0: e.clientY };
    e.preventDefault();
  }
  _move(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.moved = true; d.pc.classList.add('dragging');
    const s = d.b.width / 8;
    d.pc.style.transition = 'none';
    d.pc.style.transform = `translate(${e.clientX - d.b.left - s / 2}px,${e.clientY - d.b.top - s / 2}px)`;
  }
  _up(e) {
    if (e.button === 2 && this.rdown) return this._rightUp(e);
    const d = this.drag; if (!d) return; this.drag = null;
    if (!d.moved) return;
    const to = this._sqAt(e);
    d.pc.classList.remove('dragging');
    const reset = () => { const [x, y] = this._xy(d.from); d.pc.style.transform = `translate(${x * 100}%,${y * 100}%)`; };
    if (!to || to === d.from) { reset(); return; }
    this._try(d.from, to).then(ok => { if (!ok) reset(); });
  }
}
