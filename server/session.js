import { randomUUID } from 'node:crypto';
import { Game } from './game.js';
import { COLORS, sanitizeNick } from '../public/shared/protocol.js';

export class Session {
  constructor({ balance, addresses = [], seed = 1, makeToken = randomUUID }) {
    this.balance = balance;
    this.addresses = addresses;
    this.seed = seed;
    this.makeToken = makeToken;
    this.players = [];
    this.byConn = new Map();
    this.hostToken = null;
    this.difficulty = 2;
    this.game = null;
    this.nextId = 1;
    this.snapAcc = 0;
    this.resultsSent = false;
  }

  connect() {}

  message(conn, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'hello') return this.#hello(conn, msg);
    const p = this.byConn.get(conn);
    if (!p) return;
    switch (msg.t) {
      case 'input': return this.#input(p, msg);
      case 'act': return this.#act(p, msg);
      case 'difficulty': return this.#difficulty(p, msg);
      case 'start': return this.#start(p);
      case 'toLobby': return this.#toLobby(p);
      case 'leave': return this.#drop(conn, true);
    }
  }

  disconnect(conn) {
    this.#drop(conn, false);
  }

  tick(dt) {
    const g = this.game;
    if (!g) return;
    g.tick(dt);
    for (const p of [...this.players]) {
      if (this.game !== g) break;
      if (p.graceLeft === null) continue;
      p.graceLeft -= dt;
      if (p.graceLeft <= 0) this.#removeFromGame(p);
    }
    if (this.game !== g) return;

    const interval = 1 / this.balance.snapshotHz;
    this.snapAcc += dt;
    if (this.snapAcc >= interval - 1e-9) {
      this.snapAcc = Math.max(0, this.snapAcc - interval);
      const events = g.drainEvents();
      for (const p of this.players) {
        if (!p.conn) continue;
        const snap = g.snapshot(p.id);
        p.conn.send({ ...snap, time: snap.t, t: 'snap' });
        if (events.length) p.conn.send({ t: 'ev', list: events });
      }
    }
    if (g.phase === 'over' && !this.resultsSent) {
      this.resultsSent = true;
      this.#broadcast({ t: 'results', ...g.results() });
    }
  }

  #hello(conn, msg) {
    if (this.byConn.has(conn)) return;
    const existing = typeof msg.token === 'string' ? this.players.find((p) => p.token === msg.token) : null;
    if (existing) {
      if (existing.conn) {
        this.byConn.delete(existing.conn);
        existing.conn.close(1000, 'Zastąpiono');
      }
      existing.conn = conn;
      existing.graceLeft = null;
      this.byConn.set(conn, existing);
      if (this.game) this.game.resume(existing.id);
      this.#welcome(existing);
      if (!this.game) this.#broadcastLobby();
      return;
    }
    if (this.game) return this.#reject(conn, 'Gra w toku');
    if (this.players.length >= this.balance.session.maxPlayers) return this.#reject(conn, 'Serwer pełny');
    const nick = sanitizeNick(msg.nick);
    if (nick === null) return this.#reject(conn, 'Nieprawidłowy nick');
    const p = { id: `p${this.nextId++}`, token: this.makeToken(), nick, conn, isLocal: !!conn.isLocal, graceLeft: null };
    this.players.push(p);
    this.byConn.set(conn, p);
    if (this.hostToken === null && p.isLocal) this.hostToken = p.token;
    this.#welcome(p);
    this.#broadcastLobby();
  }

  #reject(conn, reason) {
    conn.send({ t: 'reject', reason });
    conn.close(1000, reason);
  }

  #welcome(p) {
    p.conn.send({ t: 'welcome', id: p.id, token: p.token, balance: this.balance });
  }

  #isHost(p) {
    return p.token === this.hostToken;
  }

  #input(p, m) {
    if (!this.game || !Number.isInteger(m.seq) || m.seq <= 0) return;
    if (!Number.isFinite(m.aimX) || !Number.isFinite(m.aimY)) return;
    this.game.queueInput(p.id, {
      seq: m.seq,
      mx: Math.sign(Number(m.mx)) || 0,
      my: Math.sign(Number(m.my)) || 0,
      aimX: m.aimX,
      aimY: m.aimY,
      fire: !!m.fire,
    });
  }

  #act(p, m) {
    if (!this.game || (m.a !== 'e' && m.a !== 'r' && m.a !== 'g')) return;
    this.game.action(p.id, m.a);
  }

  #difficulty(p, m) {
    if (this.game || !this.#isHost(p) || !Number.isInteger(m.level) || m.level < 1 || m.level > 4) return;
    this.difficulty = m.level;
    this.#broadcastLobby();
  }

  #start(p) {
    if (this.game || !this.#isHost(p) || this.players.length < 1) return;
    this.game = new Game({
      balance: this.balance,
      difficulty: this.difficulty,
      players: this.players.map((q, i) => ({ id: q.id, nick: q.nick, color: COLORS[i] })),
      seed: this.seed,
    });
    this.snapAcc = 0;
    this.resultsSent = false;
  }

  #toLobby(p) {
    if (!this.game || !this.#isHost(p) || this.game.phase !== 'over') return;
    this.#backToLobby();
  }

  #backToLobby() {
    this.game = null;
    this.players = this.players.filter((q) => q.conn);
    for (const q of this.players) q.graceLeft = null;
    if (!this.players.some((q) => q.token === this.hostToken)) {
      this.hostToken = this.players.find((q) => q.isLocal)?.token ?? null;
    }
    this.#broadcastLobby();
  }

  #drop(conn, immediate) {
    const p = this.byConn.get(conn);
    if (!p) return;
    this.byConn.delete(conn);
    p.conn = null;
    if (!this.game) {
      this.players = this.players.filter((q) => q !== p);
      this.#releaseHost(p);
      this.#broadcastLobby();
    } else if (immediate) {
      this.#removeFromGame(p);
    } else {
      this.game.suspend(p.id);
      p.graceLeft = this.balance.session.reconnectGraceS;
    }
  }

  #releaseHost(p) {
    if (this.#isHost(p)) this.hostToken = this.players.find((q) => q.isLocal)?.token ?? null;
  }

  #removeFromGame(p) {
    const wasHost = this.#isHost(p);
    this.game.remove(p.id);
    this.players = this.players.filter((q) => q !== p);
    if (wasHost) {
      this.hostToken = null;
      this.#broadcast({ t: 'ended', reason: 'Host opuścił grę' });
      this.#backToLobby();
    }
  }

  #broadcast(obj) {
    for (const p of this.players) p.conn?.send(obj);
  }

  #broadcastLobby() {
    const players = this.players.map((p, i) => ({ id: p.id, nick: p.nick, color: COLORS[i], host: this.#isHost(p) }));
    for (const p of this.players) {
      p.conn?.send({
        t: 'lobby', players, difficulty: this.difficulty, addresses: this.addresses, youAreHost: this.#isHost(p),
      });
    }
  }
}
