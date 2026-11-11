import { randomUUID } from 'node:crypto';
import { Game } from './game.js';
import { LinkThrottle, THROTTLE } from './netmeter.js';
import { COLORS, sanitizeNick, sanitizeChat, CHAT } from '../public/shared/protocol.js';

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
    // Czat pokoju (zgloszenie): historia idzie do kazdego, kto wchodzi, zeby nie wpadal w srodek rozmowy.
    this.chatLog = [];
    this.chatSeq = 0;
    // Widzowie: wchodza do TRWAJACEJ gry, nie licza sie do limitu miejsc, nie maja gracza w swiecie,
    // dostaja snapshoty i moga pisac na czacie. Po powrocie do lobby awansuja na graczy, jesli jest miejsce.
    this.spectators = [];
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
    // Czat wolno i graczom, i widzom - to jedyna rzecz, ktora widz moze zrobic.
    if (msg.t === 'chat') return this.#chat(p, msg);
    if (p.spectator) return;
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
      spectators: this.spectators.length,
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
      // Widz nie ma gracza w swiecie: `snapshot(id)` z nieznanym id liczy AoI ze srodkow WSZYSTKICH
      // graczy (centersFor bez `me`), czyli widzi to, co widzi druzyna. Throttlingu nie stosujemy -
      // widz nie wysyla inputu, wiec opoznienie nic mu nie psuje.
      for (const sp of this.spectators) {
        if (!sp.conn) continue;
        const snap = g.snapshot(sp.id);
        sp.conn.send({ ...snap, time: snap.t, t: 'snap' });
        if (events.length) sp.conn.send({ t: 'ev', list: events });
      }
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
      // takze do widzow: inaczej konczyliby partie na zamrozonym obrazie, bez ekranu wynikow
      this.#broadcastAll({ t: 'results', ...g.results() });
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
        nick: p.nick, kills: p.kills, downs: p.downs ?? 0, ultsUsed: p.ultsUsed ?? 0, ultKind: p.ultKind ?? null, ultKind2: p.ultKind2 ?? null,
      })),
    });
  }

  #hello(conn, msg) {
    if (this.byConn.has(conn)) return;
    const back = typeof msg.token === 'string' ? this.spectators.find((q) => q.token === msg.token) : null;
    if (back) {
      if (back.conn) { this.byConn.delete(back.conn); back.conn.close(1000, 'Zastąpiono'); }
      back.conn = conn;
      this.byConn.set(conn, back);
      this.#welcome(back);
      return;
    }
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
    const nick = sanitizeNick(msg.nick);
    if (nick === null) return this.#reject(conn, 'Nieprawidłowy nick');
    // Widz: wchodzi do trwajacej gry albo do pelnego pokoju, ale TYLKO gdy sam o to poprosi.
    // Klient sprzed tej wersji nie zna trybu widza, wiec dostaje stare odrzucenie i nie wisi na ekranie,
    // ktorego nie umie narysowac.
    const noRoom = !!this.game || this.players.length >= this.balance.session.maxPlayers;
    if (noRoom && msg.spectate === true) return this.#addSpectator(conn, nick);
    if (this.game) return this.#reject(conn, 'Gra w toku');
    if (this.players.length >= this.balance.session.maxPlayers) return this.#reject(conn, this.code ? 'Pokój pełny' : 'Serwer pełny');
    const p = {
      id: `p${this.nextId++}`, token: this.makeToken(), nick, conn,
      isLocal: !!conn.isLocal, graceLeft: null,
      pid: conn.pid ?? null, joinedAt: this.now(), chatAt: [],
    };
    this.players.push(p);
    this.byConn.set(conn, p);
    if (this.hostToken === null && (this.hostPolicy === 'first' || p.isLocal)) this.hostToken = p.token;
    this.#emit('join', { pid: p.pid, nick: p.nick, ipHash: conn.ipHash ?? null, players: this.players.length });
    this.#welcome(p);
    this.#system('chat.joined', { nick: p.nick });
    this.#broadcastLobby();
  }

  #reject(conn, reason) {
    conn.send({ t: 'reject', reason });
    conn.close(1000, reason);
  }

  #welcome(p) {
    p.conn.send({
      t: 'welcome', id: p.id, token: p.token, room: this.code,
      balance: this.balance, version: this.version, spectator: !!p.spectator,
    });
    if (this.game) p.conn.send({ t: 'gore', ...this.game.world.gore });
    // KOPIA, nie referencja: `chatLog` zmienia sie dalej (choćby wpis "wszedl X" tuz po tym welcome),
    // a odbiorca, ktory trzyma tablice (test, kolejka, logger), zobaczylby pozniejsze wpisy wstecz.
    if (this.chatLog.length) p.conn.send({ t: 'chatLog', list: [...this.chatLog] });
  }

  // --- Widzowie ---------------------------------------------------------------------------------
  #addSpectator(conn, nick) {
    const sp = {
      id: `s${this.nextId++}`, token: this.makeToken(), nick, conn, spectator: true,
      pid: conn.pid ?? null, joinedAt: this.now(), chatAt: [],
    };
    this.spectators.push(sp);
    this.byConn.set(conn, sp);
    this.#emit('spectate', { pid: sp.pid, nick: sp.nick, spectators: this.spectators.length });
    this.#welcome(sp);
    this.#system('chat.watching', { nick: sp.nick });
    return sp;
  }

  // --- Czat -------------------------------------------------------------------------------------
  // Limit tempa jest po stronie SERWERA, bo klient to tylko uprzejma prosba: `burst` wiadomosci
  // pod rzad, potem minIntervalMs przerwy. Przekroczenie jest ciche - nie odsylamy bledu, zeby
  // nie dac narzedzia do mierzenia, kiedy limit puszcza.
  #chat(p, m) {
    const text = sanitizeChat(m.text);
    if (text === null) return;
    const now = this.now();
    p.chatAt = (p.chatAt ?? []).filter((at) => now - at < CHAT.minIntervalMs * CHAT.burst);
    if (p.chatAt.length >= CHAT.burst) return;
    p.chatAt.push(now);
    this.#pushChat({
      n: ++this.chatSeq, from: p.nick, id: p.id,
      role: p.spectator ? 'spectator' : 'player', text, at: now,
    });
  }

  // Wiadomosc systemowa: klucz i18n zamiast gotowego zdania, zeby kazdy zobaczyl ja w SWOIM jezyku.
  #system(key, vars = {}) {
    this.#pushChat({ n: ++this.chatSeq, system: key, vars, at: this.now() });
  }

  #pushChat(entry) {
    this.chatLog.push(entry);
    if (this.chatLog.length > CHAT.historyMax) this.chatLog.splice(0, this.chatLog.length - CHAT.historyMax);
    this.#broadcastAll({ t: 'chat', ...entry });
  }

  #broadcastAll(obj) {
    for (const p of this.players) p.conn?.send(obj);
    for (const sp of this.spectators) sp.conn?.send(obj);
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
    if (!this.game || !['e', 'r', 'q', 'g', 'f', 'c'].includes(m.a)) return;
    this.game.action(p.id, m.a);
  }

  #difficulty(p, m) {
    if (this.game || !this.#isHost(p) || !Number.isInteger(m.level) || m.level < 1 || m.level > 4) return;
    this.difficulty = m.level;
    this.#broadcastLobby();
  }

  // Dwa sloty (V3-Q-08): `slot` 1 albo 2 (brak = 1). Oba musza byc rozne; ten sam rodzaj w drugim slocie jest odrzucany.
  // `kind: null` czysci slot.
  #ult(p, m) {
    if (this.game) return;
    const slot = m.slot === 2 ? 2 : 1;
    if (m.kind === null) {
      if (slot === 2) p.ultKind2 = null; else p.ultKind = null;
      this.#broadcastLobby();
      return;
    }
    if (typeof m.kind !== 'string' || !Object.hasOwn(this.balance.ultimate.kinds, m.kind)) return;
    const other = slot === 2 ? p.ultKind : p.ultKind2;
    if (other === m.kind) return;
    if (slot === 2) p.ultKind2 = m.kind; else p.ultKind = m.kind;
    this.#broadcastLobby();
  }

  #start(p) {
    if (this.game || !this.#isHost(p) || this.players.length < 1) return;
    // Serwer wymaga tylko slotu 1 (zgodnosc z klientami i skryptami sprzed v0.20.0: hello -> ult -> start).
    // Dwa ultimate wymusza interfejs lobby (przycisk Start nieaktywny, dopoki wszyscy nie maja obu).
    if (this.players.some((q) => !q.ultKind)) return;
    this.game = new Game({
      balance: this.balance,
      difficulty: this.difficulty,
      players: this.players.map((q, i) => ({ id: q.id, nick: q.nick, color: COLORS[i], ultKind: q.ultKind, ultKind2: q.ultKind2 })),
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
      players: this.players.map((q) => ({ pid: q.pid, nick: q.nick, ultKind: q.ultKind, ultKind2: q.ultKind2 })),
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
    this.#promoteSpectators();
    if (!this.players.some((q) => q.token === this.hostToken)) this.hostToken = this.#pickHost();
    this.#broadcastLobby();
  }

  // Po partii widz przestaje byc widzem i siada do gry - o ile sa wolne miejsca. Dostaje NOWE id
  // (gracz w swiecie nie moze miec id widza) i powtorne `welcome`, zeby klient wiedzial, ze juz gra.
  // Token zostaje ten sam, wiec powrot po zerwanym laczu dziala dalej.
  #promoteSpectators() {
    if (!this.spectators.length) return;
    const free = Math.max(0, this.balance.session.maxPlayers - this.players.length);
    const promoted = this.spectators.filter((sp) => sp.conn).slice(0, free);
    for (const sp of promoted) {
      this.game?.dropView(sp.id);
      sp.id = `p${this.nextId++}`;
      sp.spectator = false;
      sp.graceLeft = null;
      this.players.push(sp);
      if (this.hostToken === null) this.hostToken = sp.token;
      this.#emit('join', { pid: sp.pid, nick: sp.nick, players: this.players.length, fromSpectator: true });
      if (sp.conn) this.#welcome(sp);
      this.#system('chat.joined', { nick: sp.nick });
    }
    this.spectators = this.spectators.filter((sp) => !promoted.includes(sp));
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
    if (p.spectator) {
      this.spectators = this.spectators.filter((q) => q !== p);
      this.game?.dropView(p.id);
      this.#system('chat.stoppedWatching', { nick: p.nick });
      this.#checkEmpty();
      return;
    }
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
    this.#system('chat.left', { nick: p.nick });
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
      this.#broadcastAll({ t: 'ended', reason: 'Host opuścił grę' });
      this.#backToLobby();
    }
    this.#checkEmpty();
  }

  #checkEmpty() {
    if (this.players.length === 0 && this.spectators.length === 0) this.onEmpty?.(this);
  }

  #broadcast(obj) {
    for (const p of this.players) p.conn?.send(obj);
  }

  #broadcastLobby() {
    const players = this.players.map((p, i) => ({ id: p.id, nick: p.nick, color: COLORS[i], host: this.#isHost(p), ultKind: p.ultKind ?? null, ultKind2: p.ultKind2 ?? null }));
    for (const p of this.players) {
      p.conn?.send({
        t: 'lobby', players, difficulty: this.difficulty, addresses: this.addresses,
        room: this.code, youAreHost: this.#isHost(p),
      });
    }
  }
}
