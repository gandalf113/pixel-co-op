import { makeRules } from './balance.js';
import { makeRng } from './rng.js';
import { composeWave, SpawnDirector, bossesForWave, spawnPoints } from './waves.js';
import { createPlayer, updatePlayers, startBreakFor, allDown, setDropHeld, speedMultOf } from './players.js';
import { updateUltimate, useUltimate } from './ultimate.js';
import { updateMobs } from './mobs.js';
import { updateFlames } from './flames.js';
import { pickEvent, startEvent, updateEvent } from './events.js';
import { fireWeapons, updateBullets, updateMobBullets, startReload } from './combat.js';
import * as items from './items.js';
import { Grid } from '../public/shared/world.js';
import { mobView } from '../public/shared/mobview.js';
import { makeMob, spawnFromQueue, killsLeftIn, killsLeftInMob } from './mobspawn.js';
import { inRange, centersFor, AOI } from './aoi.js';
import { PLAYER_FIELDS } from '../public/shared/delta.js';

const INPUT_QUEUE_MAX = 4;
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v ?? null);

export class Game {
  constructor({ balance, difficulty, players, seed }) {
    this.seed = seed;
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
      mobBullets: [],
      items: new Map(),
      events: [],
      gore: { corpses: [], splats: [], scorches: [], rubble: [] },
      droplets: [],
      rockets: [],
      flames: [],
      flameTick: 0,
      dark: null,
      event: null,
      lock: false,
      eventCombat: false,
      builders: [],
      pits: [],
      pitTiles: new Set(),
      lastEventWave: -1,
      rng: makeRng(seed),
      nextId: () => next++,
      fieldsDirty: false,
      mobFields: null,
      fieldTimer: 0,
    };
    this.roster = [];
    this.lastSeq = new Map();
    // Co klient juz dostal (delta przedmiotow + histereza potworow). Brak wpisu = nastepny snapshot jest PELNY.
    this.views = new Map();
    players.forEach((info, i) => {
      const p = createPlayer(info, rules, i);
      this.world.players.set(p.id, p);
      this.roster.push(p);
      this.lastSeq.set(p.id, 0);
    });
    items.spawnStartingRuins(this.world);
    this.breakLeft = rules.breakLength(0);
    this.readyLock = false;
    this.savedBreakLeft = 0;
    this.shortenedAt = 0;
    this.director = null;
    this.overAt = null;
    this.mobHooks = { onObjectDestroyed: (item) => items.onObjectDestroyed(this.world, item) };
    this.bulletHooks = { onWallHit: (item, dmg) => this.#damageObject(item, dmg) };
    this.world.onWallHit = this.bulletHooks.onWallHit;
    this.prevFire = new Map();
    this.world.waveComplete = () => this.director?.done === true && this.world.mobs.length === 0;
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
    this.#throwOnSpace();
    fireWeapons(w, dt);
    items.updateItems(w, dt);
    updateMobs(w, dt, this.mobHooks);
    updateBullets(w, dt, this.bulletHooks);
    updateMobBullets(w, dt, this.bulletHooks);
    updateFlames(w, dt, this.bulletHooks);
    updateUltimate(w, dt);
    if (w.phase === 'wave') this.#spawn(dt);

    if (w.phase === 'break') {
      // wydarzenie (V3-Q-06) zatrzymuje licznik przerwy i gotowosc; po nim przerwa biegnie dalej
      if (w.event) {
        updateEvent(w, dt);
        return;
      }
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
    if (action === 'f' || action === 'c') {
      useUltimate(this.world, p, action === 'c' ? 2 : 1);
      return;
    }
    if (action === 'r' && p.held === null) {
      if (p.state === 'alive' && !p.suspended) startReload(this.world, p);
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
    this.views.delete(id);
    this.#checkReady();
  }

  // Widz (spectator) ma wlasny widok AoI pod swoim id, ale nie ma gracza w swiecie.
  // Bez tego kazdy odlaczony widz zostawialby po sobie wpis w `views` do konca partii.
  dropView(id) {
    this.views.delete(id);
  }

  remove(id) {
    const p = this.world.players.get(id);
    if (!p) return;
    items.dropHeld(this.world, p);
    this.world.players.delete(id);
    this.lastSeq.delete(id);
    this.views.delete(id);
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
      players: this.roster.map((p) => ({ nick: p.nick, color: p.color, kills: p.kills, downs: p.downs ?? 0, ultsUsed: p.ultsUsed ?? 0, ultKind2: p.ultKind2 ?? null, ultKind: p.ultKind ?? null })),
    };
  }

  #itemView(it) {
    const w = this.world;
    const f = it.flight;
    return {
      id: it.id, kind: it.kind, state: it.state, x: r1(it.x), y: r1(it.y), tx: it.tx, ty: it.ty, rot: it.rot,
      hp: r1(it.hp), maxHp: it.maxHp ?? w.rules.balance.items[it.kind].hp ?? null, timeLeft: r1(it.timeLeft), armed: it.state === 'active' && !(it.armLeft > 0),
      power: it.power > 1 ? it.power : 1,
      flight: f ? { x0: r1(f.x0), y0: r1(f.y0), x1: r1(f.x1), y1: r1(f.y1), p: r1(f.t / f.dur) } : null,
    };
  }

  // Odcisk przedmiotu: zmiana odcisku = trzeba wyslac przedmiot jeszcze raz. `timeLeft` schodzi co tick,
  // wiec wchodzi tylko calymi sekundami (pasek na HUD nie musi byc co do klatki).
  static #itemSig(v) {
    const f = v.flight;
    return `${v.state}|${v.x}|${v.y}|${v.tx}|${v.ty}|${v.rot}|${v.hp}|${v.maxHp}|${Math.floor(v.timeLeft ?? 0)}|${v.armed ? 1 : 0}|${v.power}|${f ? `${f.x0},${f.y0},${f.x1},${f.y1},${f.p}` : ''}`;
  }

  // Delta przedmiotow + area of interest. Postawione i aktywne ZAWSZE (siatka kolizji klienta), dropy
  // na ziemi i lotne tylko w zasiegu (z histereza).
  #itemsFor(view, centers) {
    const changed = [];
    const seen = new Map();
    for (const it of this.world.items.values()) {
      if (it.state === 'held') continue;
      const always = it.state === 'placed' || it.state === 'active';
      if (!always) {
        const mul = view.items.has(it.id) ? AOI.exitMul : AOI.enterMul;
        if (!inRange(centers, it.x, it.y, mul)) continue;
      }
      const v = this.#itemView(it);
      const sig = Game.#itemSig(v);
      seen.set(it.id, sig);
      if (view.items.get(it.id) !== sig) changed.push(v);
    }
    const del = [];
    for (const id of view.items.keys()) if (!seen.has(id)) del.push(id);
    view.items = seen;
    return { changed, del };
  }

  #mobsFor(view, centers) {
    const out = [];
    const ids = new Set();
    for (const m of this.world.mobs) {
      const mul = view.mobs.has(m.id) ? AOI.exitMul : AOI.enterMul;
      // `alwaysVisible` (boss): klient rysuje jego pasek HP na gorze ekranu, wiec leci zawsze
      if (!this.world.rules.balance.mobs[m.type].alwaysVisible && !inRange(centers, m.x, m.y, mul)) continue;
      ids.add(m.id);
      out.push(mobView(m, r1));
    }
    view.mobs = ids;
    return out;
  }

  snapshot(id) {
    const w = this.world;
    const me = w.players.get(id);
    const full = !this.views.has(id);
    if (full) this.views.set(id, { items: new Map(), mobs: new Set(), players: new Set() });
    const view = this.views.get(id);
    const centers = centersFor(w, me);
    const near = (e) => inRange(centers, e.x, e.y, AOI.exitMul);
    const tp = w.rules.tilePx;
    const { changed, del } = this.#itemsFor(view, centers);
    const { rows, statics } = this.#playersFor(view);
    return {
      t: r1(w.time),
      // seed jest staly przez cala gre: tylko w pelnym snapshocie (klient pamieta go w applyPlayerDelta)
      ...(full ? { seed: this.seed } : {}),
      phase: w.phase,
      wave: w.wave,
      breakLeft: r1(w.phase === 'break' ? Math.max(0, this.breakLeft) : 0),
      readyLock: this.readyLock,
      mobsLeft: this.#mobsLeft(),
      you: { id, ackSeq: me?.ackSeq ?? 0 },
      // Pola zmienne gracza jako krotki, kolejnosc = PLAYER_FIELDS z public/shared/delta.js:
      // [id, x, y, angle, hp, maxHp, state, suspended, reviveProgress, deathLeft, invuln, busy, held, ready,
      //  weaponLv, weaponMod, ammo, reloadLeft, ult, ultKind, frenzyLeft, speedMult, ultKind2, powerBonus]
      players: rows,
      // Pola stale [id, nick, color]: tylko w pelnym snapshocie i przy graczu, ktorego ten klient jeszcze nie widzial.
      ...(statics.length ? { pstatic: statics } : {}),
      // [id, typ, x, y, hp, maxHp, stun, frozen, burn, kat, invul, telegraf (dlugosc trajektorii w px albo 0)]
      mobs: this.#mobsFor(view, centers),
      droplets: w.droplets.filter(near).map((d) => [d.id, r1(d.x), r1(d.y)]),
      rockets: w.rockets.filter(near).map((r) => [r.id, r1(r.x), r1(r.y), r1(Math.atan2(r.vy, r.vx))]),
      // [id, tx, ty, sila 0..1] (V3-Q-04); ciemnosc (V3-Q-05) null albo { alpha, tint, radiusTiles }
      flames: w.flames.filter((f) => near({ x: (f.tx + 0.5) * tp, y: (f.ty + 0.5) * tp })).map((f) => [f.id, f.tx, f.ty, Math.round(f.strength * 100) / 100]),
      dark: w.dark,
      // wydarzenie (V3-Q-06): null albo { type, name, phase, t, lock, emote }; budowniczowie [id, x, y, kat, idzie]
      event: w.event ? { type: w.event.type, name: w.event.name, phase: w.event.phase, t: r1(w.event.t), lock: !!w.lock, emote: w.event.emote ?? null } : null,
      builders: (w.builders ?? []).filter(near).map((b) => [b.id, r1(b.x), r1(b.y), r1(b.angle), b.moving ? 1 : 0]),
      // zapadnie (Trzesienie ziemi): srodki 3 x 3, zawsze wszystkie (jest ich max 8)
      pits: (w.pits ?? []).map((p) => [p.tx, p.ty]),
      // gwozdz (lenPx) niesie jeszcze kat, zeby klient narysowal kreske; zwykly pocisk zostaje trojka
      bullets: w.bullets.filter(near).map((b) => (b.lenPx ? [b.id, r1(b.x), r1(b.y), r1(Math.atan2(b.vy, b.vx)), b.lenPx] : [b.id, r1(b.x), r1(b.y)])),
      // [id, x, y, rodzaj (0 plwocina, 1 granat), lx, ly (punkt upadku granatu), left (s do upadku)]
      mobBullets: w.mobBullets.filter(near).map((b) => b.kind === 'grenade'
        ? [b.id, r1(b.x), r1(b.y), 1, r1(b.lx), r1(b.ly), r1(b.travelLeft / b.speedPx)]
        : [b.id, r1(b.x), r1(b.y), 0, 0, 0, 0]),
      // full: klient zaczyna od pustego slownika; inaczej `items` to tylko zmiany, `del` to id do skasowania.
      ...(full ? { full: true } : {}),
      items: changed,
      ...(del.length ? { del } : {}),
    };
  }

  #playersFor(view) {
    const rows = [];
    const statics = [];
    const present = new Set();
    for (const p of this.world.players.values()) {
      const v = this.#playerView(p);
      rows.push(PLAYER_FIELDS.map((k) => v[k]));
      present.add(p.id);
      if (!view.players.has(p.id)) statics.push([p.id, p.nick, p.color]);
    }
    view.players = present;
    return { rows, statics };
  }

  #playerView(p) {
    return {
      id: p.id, nick: p.nick, color: p.color, x: r1(p.x), y: r1(p.y), angle: r1(p.angle),
      hp: r1(p.hp), maxHp: r1(p.maxHp), state: p.state, suspended: p.suspended,
      reviveProgress: r1(p.reviveProgress), deathLeft: r1(p.deathLeft), invuln: r1(p.invuln), busy: r1(p.busy),
      held: items.heldKind(this.world, p), ready: p.ready, weaponLv: p.weaponLv, weaponMod: p.weaponMod,
      ammo: p.ammo, reloadLeft: r1(p.reloadLeft),
      ult: r1(p.ult), ultKind: p.ultKind, frenzyLeft: r1(p.frenzyLeft), speedMult: speedMultOf(p), ultKind2: p.ultKind2 ?? null, powerBonus: p.powerBonus ?? 0,
    };
  }

  #throwOnSpace() {
    for (const p of this.world.players.values()) {
      const fire = p.input.fire;
      const rising = fire && !this.prevFire.get(p.id);
      this.prevFire.set(p.id, fire);
      if (!fire) p.fireLock = false;
      else if (rising && p.held !== null) {
        items.handleAction(this.world, p, 'space');
        // Space that threw must not also start shooting while still held.
        p.fireLock = true;
      }
    }
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
    for (const s of this.director.update(dt, w.mobs.length, positions)) spawnFromQueue(w, s.type, s.x, s.y);
  }

  // Zabicia do zrobienia: kolejka spawnu plus zywe potwory, kazdy razem ze swoim przyszlym potomstwem (tank).
  #mobsLeft() {
    const rules = this.world.rules;
    let n = 0;
    for (const m of this.world.mobs) n += killsLeftInMob(rules, m.type);
    for (const t of this.director?.queue ?? []) n += killsLeftIn(rules, t);
    return n;
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
    this.#spawnBosses();
  }

  // Boss idzie poza `composeWave`: stawiany od razu, na punkcie spawnu najdalszym od graczy.
  #spawnBosses() {
    const w = this.world;
    const alive = [...w.players.values()].filter((p) => p.state !== 'dead' && !p.suspended);
    for (const type of bossesForWave(w.rules, w.wave)) {
      let best = null;
      let bestD = -1;
      for (const sp of spawnPoints(w.rules)) {
        const d = alive.length ? Math.min(...alive.map((p) => Math.hypot(p.x - sp.x, p.y - sp.y))) : 0;
        if (d > bestD) { bestD = d; best = sp; }
      }
      makeMob(w, type, best.x, best.y);
    }
  }

  #startBreak() {
    const w = this.world;
    w.phase = 'break';
    this.breakLeft = w.rules.breakLength(w.wave);
    startBreakFor(w);
    const type = pickEvent(w, w.wave);
    if (type) startEvent(w, type);
  }
}
