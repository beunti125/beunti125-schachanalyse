// Stockfish-Anbindung über UCI. Alle Bewertungen werden aus Sicht von Weiß zurückgegeben.
export class Engine {
  constructor(opt = {}) {
    this.multi = opt.file ? false : (self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
    this.file = opt.file || (this.multi ? 'engine/stockfish-19.js' : 'engine/stockfish-19-lite-single.js');
    this.threads = opt.threads || (this.multi ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1);
    this.hash = opt.hash || (this.multi ? 128 : 32);
    this.queue = Promise.resolve();
    this.listeners = new Set();
    this.ready = this._boot();
  }
  get label() { return this.multi ? `Stockfish 19 · ${this.threads} Threads` : 'Stockfish 19 Lite · 1 Thread'; }

  _boot() {
    this.w = new Worker(this.file);
    this.w.onmessage = e => { const l = typeof e.data === 'string' ? e.data : e.data?.data ?? ''; for (const f of [...this.listeners]) f(l); };
    return (async () => {
      this.send('uci'); await this._wait(l => l === 'uciok');
      if (this.threads > 1) this.send(`setoption name Threads value ${this.threads}`);
      this.send(`setoption name Hash value ${this.hash}`);
      this.send('isready'); await this._wait(l => l === 'readyok');
    })();
  }
  send(c) { this.w.postMessage(c); }
  _wait(pred, onLine) {
    return new Promise(res => {
      const f = l => { onLine?.(l); if (pred(l)) { this.listeners.delete(f); res(l); } };
      this.listeners.add(f);
    });
  }

  // fen analysieren → {lines:[{move, cp, mate, pv}], depth}; Reihenfolge = MultiPV-Rang
  // searchmoves: nur diese Züge (uci) untersuchen – für den Wert des gespielten Zuges aus derselben Stellung
  analyse(fen, { depth = 16, movetime = 1000, multipv = 2, searchmoves } = {}) {
    const job = async () => {
      await this.ready;
      const black = fen.split(' ')[1] === 'b';
      const lines = []; let maxDepth = 0;
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send('position fen ' + fen);
      this.send(`go depth ${depth} movetime ${movetime}${searchmoves?.length ? ' searchmoves ' + searchmoves.join(' ') : ''}`);
      await this._wait(l => l.startsWith('bestmove'), l => {
        if (!l.startsWith('info') || !l.includes(' pv ') || l.includes('upperbound') || l.includes('lowerbound')) return;
        const d = +(/ depth (\d+)/.exec(l)?.[1] || 0);
        const k = +(/ multipv (\d+)/.exec(l)?.[1] || 1);
        const sc = / score (cp|mate) (-?\d+)/.exec(l); if (!sc) return;
        let v = +sc[2]; if (black) v = -v;
        const pv = l.split(' pv ')[1].trim().split(/\s+/);
        lines[k - 1] = { move: pv[0], pv, cp: sc[1] === 'cp' ? v : null, mate: sc[1] === 'mate' ? v : null, depth: d };
        maxDepth = Math.max(maxDepth, d);
      });
      return { lines: lines.filter(Boolean), depth: maxDepth };
    };
    const p = this.queue.then(job, job);
    this.queue = p.catch(() => {});
    return p;
  }
}

// Mehrere Engines parallel: jede analysiert eine andere Stellung (für schnelle Spielberichte)
export class EnginePool {
  constructor(n = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    this.n = n; this.engines = []; this.jobs = []; this.idle = [];
  }
  _ensure() {
    if (this.engines.length) return;
    for (let k = 0; k < this.n; k++) {
      const e = new Engine({ file: 'engine/stockfish-19-lite-single.js', threads: 1, hash: 16 });
      this.engines.push(e); e.ready.then(() => this._free(e));
    }
  }
  get ready() { this._ensure(); return Promise.all(this.engines.map(e => e.ready)); }
  get label() { return `Stockfish 19 · ${this.n} Engines parallel`; }
  _free(e) { const j = this.jobs.shift(); if (!j) return this.idle.push(e); e.analyse(j.fen, j.opt).then(j.res, j.rej).finally(() => this._free(e)); }
  analyse(fen, opt) {
    this._ensure();
    return new Promise((res, rej) => { this.jobs.push({ fen, opt, res, rej }); const e = this.idle.shift(); if (e) this._free(e); });
  }
}
