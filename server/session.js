import { randomUUID } from 'node:crypto';
import { Game } from './game.js';
import { LinkThrottle, THROTTLE } from './netmeter.js';
import { COLORS, sanitizeNick } from '../public/shared/protocol.js';

// Ile musi trwać partia i ile realnych inputów musi przyjść, żeby zaliczyć ją
// jako FAKTYCZNĄ rozgrywkę, a nie wejście na stronę, skanera albo odbicie.
const REAL_PLAY = { minSeconds: 60, minInputs: 200 };

export class Session {
  constructor({
    balance, addresses = [], seed = 1, makeToken = randomUUID,
    code = null, hostPolicy = 'local', telemetry = null, onEmpty = null,
    realPlay = REAL_PLAY, version = null, now = () => Date.now(),
  }) {
    this.balance = balance;
    this.version = version;
    this.addresses = addresses;
    this.seed = seed;
    this.makeToken = makeToken;
    this.code = code;
    this.hostPolicy = hostPolicy;
    this.telemetry = telemetry;
    this.onEmpty = onEmpty;
    this.realPlay = realPlay;
    this.now = now;
    this.players = [];
    this.byConn = new Map();
    this.hostToken = null;
    this.difficulty = 2;
    this.game = null;
    this.nextId = 1;
    this.snapAcc = 0;
    this.resultsSent = false;
    this.createdAt = now();
    this.gamesPlayed = 0;
    this.realGamesPlayed = 0;
    this.gameId = null;
    this.gameInputs = 0;
    this.endEmitted = true;
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
      case 'ult': return this.#ult(p, msg);
      case 'start': return this.#start(p);
      case 'toLobby': return this.#toLobby(p);
      case 'leave': return this.#drop(conn, true);
    }
  }

  disconnect(conn) {
    this.#drop(conn, false);
  }

  // Zamknięcie pokoju z zewnątrz (GC pustych pokoi, zamykanie serwera).
  close(reason = 'closed') {
    this.#endGameTelemetry(reason);
    this.#emit('room_close', {
      durationS: Math.round((this.now() - this.createdAt) / 1000),
      games: this.gamesPlayed,
      realGames: this.realGamesPlayed,
    });
  }

  get playerCount() {
    return this.players.length;
  }

  // Publiczne podsumowanie pokoju (GET /api/rooms) — bez nicków i czegokolwiek identyfikującego gracza.
  summary() {
    return {
      code: this.code,
      players: this.players.length,
      maxPlayers: this.balance.session.maxPlayers,
      inGame: !!this.game,
      wave: this.game?.world.wave ?? 0,
      ageS: Math.max(0, Math.round((this.now() - this.createdAt) / 1000)),
    };
  }

  get connectedCount() {
    return this.byConn.size;
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
        if (this.#skipSnapshot(p)) {
          // Zdarzenia sa jednorazowe: leca zawsze, tez gdy snapshot pomijamy.
          if (events.length) p.conn.send({ t: 'ev', list: events });
          continue;
        }
        const snap = g.snapshot(p.id);
        p.conn.send({ ...snap, time: snap.t, t: 'snap' });
        if (events.length) p.conn.send({ t: 'ev', list: events });
      }
    }
    if (g.phase === 'over' && !this.resultsSent) {
      this.resultsSent = true;
      this.#endGameTelemetry('over');
      this.#broadcast({ t: 'results', ...g.results() });
    }
  }

  // V3-O-04. Wolane PRZED g.snapshot(): delta przedmiotow jest stanowa per gracz, wiec zbudowany i wyrzucony
  // snapshot przestawilby punkt odniesienia i gracz nigdy nie dostalby zmian z tego ticka.
  #skipSnapshot(p) {
    if (p.linkConn !== p.conn) { p.linkConn = p.conn; p.link = new LinkThrottle(); p.snapCredit = 0; } // nowe lacze = czysta histereza
    const slow = p.link.update(p.conn.buffered?.() ?? 0);
    if (p.conn.meter) p.conn.meter.throttled = slow;
    if (!slow) { p.snapCredit = 0; return false; }
    p.snapCredit = (p.snapCredit ?? 0) + THROTTLE.slowHz / this.balance.snapshotHz;
    if (p.snapCredit < 1 - 1e-9) return true;
    p.snapCredit -= 1;
    return false;
  }

  #emit(type, data = {}) {
    this.telemetry?.event(type, { room: this.code, ...data });
  }

  #endGameTelemetry(reason) {
    const g = this.game;
    if (!g || this.endEmitted) return;
    this.endEmitted = true;
    const res = g.results();
    const durationS = Math.round(res.timeS);
    const real = durationS >= this.realPlay.minSeconds && this.gameInputs >= this.realPlay.minInputs;
    this.gamesPlayed++;
    if (real) this.realGamesPlayed++;
    this.#emit('game_end', {
      gameId: this.gameId,
      reason,
      durationS,
      wave: res.wave,
      difficulty: this.difficulty,
      inputs: this.gameInputs,
      realPlay: real,
      players: res.players.map((p) => ({
        pid: this.players.find((q) => q.nick === p.nick)?.pid ?? null,
        nick: p.nick, kills: p.kills, downs: p.downs ?? 0, ultsUsed: p.ultsUsed ?? 0, ultKind: p.ultKind ?? null,
      })),
    });
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
    if (this.players.length >= this.balance.session.maxPlayers) return this.#reject(conn, this.code ? 'Pokój pełny' : 'Serwer pełny');
    const nick = sanitizeNick(msg.nick);
    if (nick === null) return this.#reject(conn, 'Nieprawidłowy nick');
    const p = {
      id: `p${this.nextId++}`, token: this.makeToken(), nick, conn,
      isLocal: !!conn.isLocal, graceLeft: null,
      pid: conn.pid ?? null, joinedAt: this.now(),
    };
    this.players.push(p);
    this.byConn.set(conn, p);
    if (this.hostToken === null && (this.hostPolicy === 'first' || p.isLocal)) this.hostToken = p.token;
    this.#emit('join', { pid: p.pid, nick: p.nick, ipHash: conn.ipHash ?? null, players: this.players.length });
    this.#welcome(p);
    this.#broadcastLobby();
  }

  #reject(conn, reason) {
    conn.send({ t: 'reject', reason });
    conn.close(1000, reason);
  }

  #welcome(p) {
    p.conn.send({ t: 'welcome', id: p.id, token: p.token, room: this.code, balance: this.balance, version: this.version });
    if (this.game) p.conn.send({ t: 'gore', ...this.game.world.gore });
  }

  #isHost(p) {
    return p.token === this.hostToken;
  }

  #input(p, m) {
    if (!this.game || !Number.isInteger(m.seq) || m.seq <= 0) return;
    if (!Number.isFinite(m.aimX) || !Number.isFinite(m.aimY)) return;
    this.gameInputs++;
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
    if (!this.game || !['e', 'r', 'q', 'g', 'f'].includes(m.a)) return;
    this.game.action(p.id, m.a);
  }

  #difficulty(p, m) {
    if (this.game || !this.#isHost(p) || !Number.isInteger(m.level) || m.level < 1 || m.level > 4) return;
    this.difficulty = m.level;
    this.#broadcastLobby();
  }

  #ult(p, m) {
    if (this.game || typeof m.kind !== 'string' || !Object.hasOwn(this.balance.ultimate.kinds, m.kind)) return;
    p.ultKind = m.kind;
    this.#broadcastLobby();
  }

  #start(p) {
    if (this.game || !this.#isHost(p) || this.players.length < 1) return;
    if (this.players.some((q) => !q.ultKind)) return;
    this.game = new Game({
      balance: this.balance,
      difficulty: this.difficulty,
      players: this.players.map((q, i) => ({ id: q.id, nick: q.nick, color: COLORS[i], ultKind: q.ultKind })),
      seed: this.seed++,
    });
    this.snapAcc = 0;
    this.resultsSent = false;
    this.gameId = `${this.code ?? 'lan'}-${this.now().toString(36)}-${this.gamesPlayed}`;
    this.gameInputs = 0;
    this.endEmitted = false;
    this.#emit('game_start', {
      gameId: this.gameId,
      difficulty: this.difficulty,
      players: this.players.map((q) => ({ pid: q.pid, nick: q.nick, ultKind: q.ultKind })),
    });
  }

  #toLobby(p) {
    if (!this.game || !this.#isHost(p) || this.game.phase !== 'over') return;
    this.#backToLobby();
  }

  #backToLobby() {
    this.#endGameTelemetry('aborted');
    this.game = null;
    this.players = this.players.filter((q) => q.conn);
    for (const q of this.players) q.graceLeft = null;
    if (!this.players.some((q) => q.token === this.hostToken)) this.hostToken = this.#pickHost();
    this.#broadcastLobby();
  }

  #pickHost() {
    if (this.hostPolicy === 'first') return this.players[0]?.token ?? null;
    return this.players.find((q) => q.isLocal)?.token ?? null;
  }

  #drop(conn, immediate) {
    const p = this.byConn.get(conn);
    if (!p) return;
    this.byConn.delete(conn);
    p.conn = null;
    if (!this.game) {
      this.players = this.players.filter((q) => q !== p);
      this.#leaveTelemetry(p);
      this.#releaseHost(p);
      this.#broadcastLobby();
      this.#checkEmpty();
    } else if (immediate) {
      this.#removeFromGame(p);
    } else {
      this.game.suspend(p.id);
      p.graceLeft = this.balance.session.reconnectGraceS;
    }
  }

  #leaveTelemetry(p) {
    this.#emit('leave', {
      pid: p.pid, nick: p.nick,
      playedS: Math.round((this.now() - p.joinedAt) / 1000),
      players: this.players.length,
    });
  }

  #releaseHost(p) {
    if (this.#isHost(p)) {
      this.hostToken = this.#pickHost();
      this.#announceHost();
    }
  }

  #announceHost() {
    for (const q of this.players) q.conn?.send({ t: 'host', youAreHost: this.#isHost(q) });
  }

  #removeFromGame(p) {
    const wasHost = this.#isHost(p);
    this.game.remove(p.id);
    this.players = this.players.filter((q) => q !== p);
    this.#leaveTelemetry(p);
    // W trybie pokoi gra toczy się dalej — host zostaje przekazany dalej.
    // W trybie LAN wyjście hosta kończy sesję (host trzyma serwer).
    if (wasHost && this.hostPolicy === 'first' && this.players.length) {
      this.hostToken = this.#pickHost();
      this.#announceHost();
      return;
    }
    if (wasHost) {
      this.hostToken = null;
      this.#broadcast({ t: 'ended', reason: 'Host opuścił grę' });
      this.#backToLobby();
    }
    this.#checkEmpty();
  }

  #checkEmpty() {
    if (this.players.length === 0) this.onEmpty?.(this);
  }

  #broadcast(obj) {
    for (const p of this.players) p.conn?.send(obj);
  }

  #broadcastLobby() {
    const players = this.players.map((p, i) => ({ id: p.id, nick: p.nick, color: COLORS[i], host: this.#isHost(p), ultKind: p.ultKind ?? null }));
    for (const p of this.players) {
      p.conn?.send({
        t: 'lobby', players, difficulty: this.difficulty, addresses: this.addresses,
        room: this.code, youAreHost: this.#isHost(p),
      });
    }
  }
}
