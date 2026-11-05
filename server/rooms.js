import { randomBytes, randomUUID } from 'node:crypto';
import { Session } from './session.js';

// Bez I, O, 0, 1 — kod pokoju bywa przepisywany z ekranu albo dyktowany przez telefon.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(length = 4, rnd = randomBytes) {
  const bytes = rnd(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export class Rooms {
  constructor({
    balance, version = null, telemetry = null, seed = () => Date.now(), now = () => Date.now(),
    maxRooms = 40, emptyTtlS = 90, codeLength = 4,
    makeToken = randomUUID, codeImpl = makeCode,
  } = {}) {
    this.balance = balance;
    this.version = version;
    this.telemetry = telemetry;
    this.seed = seed;
    this.now = now;
    this.maxRooms = maxRooms;
    this.emptyTtlS = emptyTtlS;
    this.codeLength = codeLength;
    this.makeToken = makeToken;
    this.codeImpl = codeImpl;
    this.rooms = new Map();
    this.emptySince = new Map();
  }

  get size() {
    return this.rooms.size;
  }

  stats() {
    let players = 0;
    let games = 0;
    for (const s of this.rooms.values()) {
      players += s.playerCount;
      if (s.game) games++;
    }
    return { rooms: this.rooms.size, players, games };
  }

  get(code) {
    if (typeof code !== 'string') return null;
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  create() {
    if (this.rooms.size >= this.maxRooms) return null;
    let code = null;
    for (let i = 0; i < 20 && code === null; i++) {
      const candidate = this.codeImpl(this.codeLength);
      if (!this.rooms.has(candidate)) code = candidate;
    }
    if (code === null) return null;
    const session = new Session({
      balance: this.balance,
      addresses: [],
      seed: this.seed(),
      makeToken: this.makeToken,
      code,
      hostPolicy: 'first',
      telemetry: this.telemetry,
      version: this.version,
      now: this.now,
      onEmpty: () => this.emptySince.set(code, this.now()),
    });
    this.rooms.set(code, session);
    this.emptySince.set(code, this.now());
    this.telemetry?.event('room_open', { room: code, rooms: this.rooms.size });
    return session;
  }

  tick(dt) {
    for (const [code, session] of this.rooms) {
      session.tick(dt);
      if (session.playerCount > 0) this.emptySince.delete(code);
      else if (!this.emptySince.has(code)) this.emptySince.set(code, this.now());
    }
    const cutoff = this.now() - this.emptyTtlS * 1000;
    for (const [code, since] of this.emptySince) {
      if (since > cutoff) continue;
      const session = this.rooms.get(code);
      if (session && session.playerCount === 0) {
        session.close('empty');
        this.rooms.delete(code);
      }
      this.emptySince.delete(code);
    }
  }

  close() {
    for (const [code, session] of this.rooms) {
      session.close('shutdown');
      this.rooms.delete(code);
    }
    this.emptySince.clear();
  }
}
