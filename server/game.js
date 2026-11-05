import { makeRules } from './balance.js';
import { makeRng } from './rng.js';
import { composeWave, SpawnDirector } from './waves.js';
import { createPlayer, updatePlayers, startBreakFor, allDown, setDropHeld } from './players.js';
import { updateMobs } from './mobs.js';
import { fireWeapons, updateBullets } from './combat.js';
import * as items from './items.js';
import { Grid } from '../public/shared/world.js';

const INPUT_QUEUE_MAX = 4;
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v ?? null);

export class Game {
  constructor({ balance, difficulty, players, seed }) {
    const rules = makeRules(balance, difficulty, players.length);
    let next = 1;
    this.world = {
      rules,
      grid: new Grid(balance.map.tilesW, balance.map.tilesH),
      phase: 'break',
      wave: 0,
      time: 0,
      players: new Map(),
      mobs: [],
      bullets: [],
      items: new Map(),
      events: [],
      rng: makeRng(seed),
      nextId: () => next++,
      fieldsDirty: false,
      mobFields: null,
      fieldTimer: 0,
    };
    this.roster = [];
    this.lastSeq = new Map();
    players.forEach((info, i) => {
      const p = createPlayer(info, rules, i);
      this.world.players.set(p.id, p);
      this.roster.push(p);
      this.lastSeq.set(p.id, 0);
    });
    this.breakLeft = rules.breakLength(0);
    this.readyLock = false;
    this.savedBreakLeft = 0;
    this.shortenedAt = 0;
    this.director = null;
    this.overAt = null;
    this.mobHooks = { onObjectDestroyed: (item) => items.onObjectDestroyed(this.world, item) };
    this.bulletHooks = { onWallHit: (item, dmg) => this.#damageObject(item, dmg) };
    setDropHeld((w, p) => items.dropHeld(w, p));
  }

  get phase() {
    return this.world.phase;
  }

  tick(dt) {
    const w = this.world;
    if (w.phase === 'over') return;
    w.time += dt;
    updatePlayers(w, dt);
    fireWeapons(w, dt);
    items.updateItems(w, dt);
    updateMobs(w, dt, this.mobHooks);
    updateBullets(w, dt, this.bulletHooks);
    if (w.phase === 'wave') this.#spawn(dt);

    if (w.phase === 'break') {
      this.breakLeft -= dt;
      this.#checkReady();
      if (this.breakLeft <= 0) this.#startWave();
    } else if (this.director.done && w.mobs.length === 0) {
      this.#startBreak();
    } else if (allDown(w)) {
      w.phase = 'over';
      this.overAt = w.time;
    }
  }

  queueInput(id, input) {
    const p = this.world.players.get(id);
    if (!p || !(input.seq > this.lastSeq.get(id))) return;
    this.lastSeq.set(id, input.seq);
    p.inputQueue.push(input);
    if (p.inputQueue.length > INPUT_QUEUE_MAX) p.inputQueue.shift();
  }

  action(id, action) {
    const p = this.world.players.get(id);
    if (!p) return;
    if (action === 'g') {
      if (this.world.phase !== 'break') return;
      p.ready = !p.ready;
      this.#checkReady();
      return;
    }
    items.handleAction(this.world, p, action);
  }

  suspend(id) {
    const p = this.world.players.get(id);
    if (!p) return;
    items.dropHeld(this.world, p);
    p.suspended = true;
    p.suspendLeft = this.world.rules.balance.session.reconnectGraceS;
    p.inputQueue = [];
    p.input = { ...p.input, mx: 0, my: 0, fire: false };
    this.#checkReady();
  }

  resume(id) {
    const p = this.world.players.get(id);
    if (!p) return;
    p.suspended = false;
    p.suspendLeft = 0;
    p.inputQueue = [];
    this.lastSeq.set(id, 0);
    this.#checkReady();
  }

  remove(id) {
    const p = this.world.players.get(id);
    if (!p) return;
    items.dropHeld(this.world, p);
    this.world.players.delete(id);
    this.lastSeq.delete(id);
    this.#checkReady();
  }

  drainEvents() {
    const events = this.world.events;
    this.world.events = [];
    return events;
  }

  results() {
    return {
      wave: this.world.wave,
      timeS: this.overAt ?? this.world.time,
      players: this.roster.map((p) => ({ nick: p.nick, color: p.color, kills: p.kills })),
    };
  }

  snapshot(id) {
    const w = this.world;
    const me = w.players.get(id);
    const itemViews = [];
    for (const it of w.items.values()) {
      if (it.state === 'held') continue;
      const f = it.flight;
      itemViews.push({
        id: it.id, kind: it.kind, state: it.state, x: r1(it.x), y: r1(it.y), tx: it.tx, ty: it.ty, rot: it.rot,
        hp: r1(it.hp), timeLeft: r1(it.timeLeft), armed: it.state === 'active' && !(it.armLeft > 0),
        flight: f ? { x0: r1(f.x0), y0: r1(f.y0), x1: r1(f.x1), y1: r1(f.y1), p: r1(f.t / f.dur) } : null,
      });
    }
    return {
      t: r1(w.time),
      phase: w.phase,
      wave: w.wave,
      breakLeft: r1(w.phase === 'break' ? Math.max(0, this.breakLeft) : 0),
      readyLock: this.readyLock,
      mobsLeft: w.mobs.length + (this.director?.pending ?? 0),
      you: { id, ackSeq: me?.ackSeq ?? 0 },
      players: [...w.players.values()].map((p) => this.#playerView(p)),
      mobs: w.mobs.map((m) => [m.id, m.type, r1(m.x), r1(m.y), r1(m.hp), r1(m.maxHp), m.stun > 0 ? 1 : 0]),
      bullets: w.bullets.map((b) => [b.id, r1(b.x), r1(b.y)]),
      items: itemViews,
    };
  }

  #playerView(p) {
    return {
      id: p.id, nick: p.nick, color: p.color, x: r1(p.x), y: r1(p.y), angle: r1(p.angle),
      hp: r1(p.hp), maxHp: r1(p.maxHp), state: p.state, suspended: p.suspended,
      reviveProgress: r1(p.reviveProgress), deathLeft: r1(p.deathLeft), invuln: r1(p.invuln), busy: r1(p.busy),
      held: items.heldKind(this.world, p), ready: p.ready, weaponLv: p.weaponLv,
    };
  }

  #damageObject(item, dmg) {
    if (item.hp <= 0) return;
    item.hp -= dmg;
    if (item.hp <= 0) items.onObjectDestroyed(this.world, item);
  }

  #spawn(dt) {
    const w = this.world;
    const positions = [];
    for (const p of w.players.values()) if (p.state !== 'dead' && !p.suspended) positions.push({ x: p.x, y: p.y });
    for (const s of this.director.update(dt, w.mobs.length, positions)) {
      const hp = w.rules.mobHp(s.type, w.wave);
      w.mobs.push({ id: w.nextId(), type: s.type, x: s.x, y: s.y, hp, maxHp: hp, stun: 0, attackCd: 0 });
    }
  }

  #checkReady() {
    if (this.world.phase !== 'break') return;
    const active = [...this.world.players.values()].filter((p) => !p.suspended);
    const allReady = active.length > 0 && active.every((p) => p.ready);
    const countdown = this.world.rules.balance.waves.readyCountdownS;
    if (allReady && !this.readyLock && this.breakLeft > countdown) {
      this.savedBreakLeft = this.breakLeft;
      this.shortenedAt = this.world.time;
      this.breakLeft = countdown;
      this.readyLock = true;
    } else if (!allReady && this.readyLock) {
      this.breakLeft = this.savedBreakLeft - (this.world.time - this.shortenedAt);
      this.readyLock = false;
    }
  }

  #startWave() {
    const w = this.world;
    w.phase = 'wave';
    w.wave++;
    this.breakLeft = 0;
    this.readyLock = false;
    for (const p of w.players.values()) p.ready = false;
    this.director = new SpawnDirector(w.rules, w.wave, composeWave(w.rules, w.wave, w.rng), w.rng);
    items.onWaveStart(w);
  }

  #startBreak() {
    const w = this.world;
    w.phase = 'break';
    this.breakLeft = w.rules.breakLength(w.wave);
    startBreakFor(w);
  }
}
