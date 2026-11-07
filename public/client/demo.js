// Swiat demo bez serwera (V3-K-06 ekran glowny, V3-K-07 poligon sterowania).
// Czysta logika: zero DOM, zero AudioContext. Zwraca widok w ksztalcie, ktory rozumie renderWorld,
// oraz liste zdarzen (strzal, trafienie, podniesienie...), ktore main.js zamienia na dzwiek i efekty.
// Tryby:
//   'attract' - tlo ekranu glownego: bohater wedruje po arenie, potwory sie snuja, co chwile seria.
//   'range'   - poligon: bohater stoi na srodku, drepcze pod WASD, celuje za myszka, strzela, podnosi sciane.
import { MV } from '../shared/mobview.js';
import { buildGrid, footprint, placeTarget, setItemDefs, itemDef } from '../shared/world.js';
import { rifleStats } from '../shared/weapon.js';
import { ShotPredictor } from './shotpred.js';

// mulberry32: deterministyczny, zeby test i gra widzialy ten sam uklad.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ATTRACT_MOBS = ['slime', 'slime', 'runner', 'brute', 'spitter', 'slime', 'grenadier', 'tank'];
const ATTRACT_HOLD_TILES = 2.5; // potwory trzymaja dystans od bohatera (nie gryza, to tylko tlo)
const ATTRACT_FIRE_TILES = 9;
const BURST_S = 0.7;
const BURST_GAP_S = 2.2;
const RESPAWN_S = 2.5;
const ULT_COOLDOWN_S = 1;
const ULT_EFFECT_MS = 500;

export class DemoWorld {
  constructor(balance, { mode = 'attract', seed = 7, color = '#5ec85e', nick = 'ty' } = {}) {
    this.balance = balance;
    this.mode = mode;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.t = 0;
    this.nextId = 1;
    this.effects = [];
    this.events = [];
    this.heldRot = 0;
    this.prevFire = false;
    this.ultCd = 0;
    this.burstT = 0;
    this.lastReload = 0;
    setItemDefs(balance.items);
    const { tilesW, tilesH, tilePx } = balance.map;
    const cx = (tilesW / 2) * tilePx;
    const cy = (tilesH / 2) * tilePx;
    const stats = rifleStats(balance, 1);
    this.hero = {
      id: 1, nick, color, x: cx, y: cy, angle: 0, state: 'alive', hp: 100, maxHp: 100, held: null,
      weaponLv: 1, ammo: stats.magazine, reloadLeft: 0, moving: false, busy: 0, invuln: 0, ult: 0,
    };
    this.shots = new ShotPredictor(balance);
    this.shots.setRtt(400, 0); // duchy maja zyc maksymalnie dlugo: tu nie ma serwera, ktory by je zastapil
    this.shots.syncFromSnapshot(this.hero);
    this.items = [];
    this.mobs = [];
    if (mode === 'range') this.#buildRange(cx, cy, tilePx);
    else this.#buildAttract(cx, cy, tilePx);
    this.#rebuildGrid();
  }

  #buildRange(cx, cy, tp) {
    const tx = Math.floor(cx / tp);
    const ty = Math.floor(cy / tp);
    // sciana do podniesienia obok bohatera, dwie postawione jako oslona od polnocy, tarcza na wschodzie
    this.items.push({ id: this.nextId++, kind: 'wall', state: 'ground', x: (tx + 2.5) * tp, y: (ty + 2.5) * tp });
    this.items.push({ id: this.nextId++, kind: 'wall', state: 'placed', tx: tx - 3, ty: ty - 4, rot: 0, hp: 150, maxHp: 150 });
    this.items.push({ id: this.nextId++, kind: 'wall', state: 'placed', tx: tx + 1, ty: ty - 4, rot: 0, hp: 150, maxHp: 150 });
    this.#spawnMob('slime', (tx + 7.5) * tp, cy, { still: true });
  }

  #buildAttract(cx, cy, tp) {
    const r = this.rng;
    for (const type of ATTRACT_MOBS) {
      const a = r() * Math.PI * 2;
      const d = (5 + r() * 6) * tp;
      this.#spawnMob(type, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    }
    // kilka ruin: sciany i dzialko, zeby arena nie byla pusta
    const tx = Math.floor(cx / tp);
    const ty = Math.floor(cy / tp);
    for (const [dx, dy, rot] of [[-6, -3, 0], [-6, 3, 1], [5, -5, 0], [7, 2, 1], [-2, 6, 0]]) {
      this.items.push({ id: this.nextId++, kind: 'wall', state: 'placed', tx: tx + dx, ty: ty + dy, rot, hp: 100, maxHp: 150 });
    }
    this.items.push({ id: this.nextId++, kind: 'weaponboost', state: 'ground', x: (tx - 4.5) * tp, y: (ty + 1.5) * tp });
  }

  #spawnMob(type, x, y, { still = false } = {}) {
    const cfg = this.balance.mobs[type];
    const m = {
      id: this.nextId++, type, x, y, angle: 0, hp: cfg.hp, maxHp: cfg.hp, still,
      heading: this.rng() * Math.PI * 2, turnIn: 0.5 + this.rng(), deadFor: -1, spawnX: x, spawnY: y,
    };
    this.mobs.push(m);
    return m;
  }

  #rebuildGrid() {
    const { tilesW, tilesH } = this.balance.map;
    this.grid = buildGrid(tilesW, tilesH, this.items);
  }

  #emit(type, extra = {}) {
    this.events.push({ type, ...extra });
  }

  #circles() {
    const b = this.balance;
    return [
      { x: this.hero.x, y: this.hero.y, r: b.player.radiusPx },
      ...this.mobs.filter((m) => m.deadFor < 0).map((m) => ({ x: m.x, y: m.y, r: b.mobs[m.type].radiusPx })),
    ];
  }

  placeTargetFor(aim) {
    const h = this.hero;
    if (!h.held) return null;
    const b = this.balance;
    const rot = itemDef(h.held)?.rotatable ? this.heldRot : 0;
    const t = placeTarget({
      grid: this.grid, kind: h.held, rot, playerX: h.x, playerY: h.y, aimX: aim.x, aimY: aim.y,
      circles: this.#circles(), tilePx: b.map.tilePx, maxRangeTiles: b.player.placeRangeTiles, limitReached: false,
    });
    return { ...t, rot, tiles: footprint(h.held, t.tx, t.ty, rot) };
  }

  pickupTarget() {
    const h = this.hero;
    if (h.held || h.busy > 0) return null;
    const range = this.balance.player.pickupRangeTiles * this.balance.map.tilePx;
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.state !== 'ground') continue;
      const d = Math.hypot(it.x - h.x, it.y - h.y);
      if (d <= range && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  // Akcje z klawiatury (poligon): 'e', 'r', 'q', 'f', 'g'. Zwraca true, gdy cos sie stalo.
  action(a, aim = { x: this.hero.x + 1, y: this.hero.y }) {
    const h = this.hero;
    const b = this.balance;
    const tp = b.map.tilePx;
    if (a === 'q') {
      if (itemDef(h.held)?.rotatable) {
        this.heldRot ^= 1;
        return true;
      }
      return false;
    }
    if (a === 'e') {
      if (h.held) {
        const t = this.placeTargetFor(aim);
        if (!t.valid) {
          this.#emit('deny');
          return false;
        }
        const cfg = itemDef(h.held);
        this.items.push({ id: this.nextId++, kind: h.held, state: 'placed', tx: t.tx, ty: t.ty, rot: t.rot, hp: cfg.hp ?? 100, maxHp: cfg.hp ?? 100, armed: false });
        this.#emit('place', { x: (t.tx + 0.5) * tp, y: (t.ty + 0.5) * tp });
        h.held = null;
        this.heldRot = 0;
        this.#rebuildGrid();
        return true;
      }
      const it = this.pickupTarget();
      if (!it) return false;
      this.items = this.items.filter((o) => o !== it);
      h.held = it.kind;
      h.busy = b.player.pickupAnimS;
      this.#emit('pickup', { x: it.x, y: it.y });
      return true;
    }
    if (a === 'r') {
      if (h.held) {
        this.items.push({ id: this.nextId++, kind: h.held, state: 'ground', x: h.x, y: h.y });
        this.#emit('drop', { x: h.x, y: h.y });
        h.held = null;
        this.heldRot = 0;
        return true;
      }
      const stats = rifleStats(b, h.weaponLv);
      if (this.shots.reloadLeft > 0 || this.shots.ammo >= stats.magazine) return false;
      this.shots.reloadLeft = stats.reloadS;
      return true;
    }
    if (a === 'f' || a === 'c') {
      if (this.ultCd > 0) return false;
      this.ultCd = ULT_COOLDOWN_S;
      this.effects.push({ kind: 'shockwave', tier: 1, x: h.x, y: h.y, start: this.nowMs, durMs: ULT_EFFECT_MS, color: h.color });
      this.#emit('ult', { x: h.x, y: h.y, tier: 1 });
      return true;
    }
    return false;
  }

  #throw(aim) {
    const h = this.hero;
    const b = this.balance;
    const tp = b.map.tilePx;
    const dx = aim.x - h.x;
    const dy = aim.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    const len = Math.min(d, b.throw.rangeTiles * tp);
    const it = {
      id: this.nextId++, kind: h.held, state: 'flying',
      flight: { x0: h.x, y0: h.y, x1: h.x + (dx / d) * len, y1: h.y + (dy / d) * len, p: 0 },
    };
    this.items.push(it);
    h.held = null;
    this.heldRot = 0;
    this.#emit('throw', { x: h.x, y: h.y });
  }

  #nearestMob(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const m of this.mobs) {
      if (m.deadFor >= 0) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bestD) {
        best = m;
        bestD = d;
      }
    }
    return { mob: best, dist: bestD };
  }

  #stepAttract(dt) {
    const h = this.hero;
    const b = this.balance;
    const tp = b.map.tilePx;
    const { tilesW, tilesH } = b.map;
    // bohater: wolna krzywa Lissajous po srodku areny
    this.t += dt;
    const ax = (tilesW * 0.22) * tp;
    const ay = (tilesH * 0.2) * tp;
    const nx = (tilesW / 2) * tp + Math.sin(this.t * 0.11) * ax;
    const ny = (tilesH / 2) * tp + Math.sin(this.t * 0.17 + 1.3) * ay;
    h.moving = Math.hypot(nx - h.x, ny - h.y) > 0.05;
    const dir = Math.atan2(ny - h.y, nx - h.x);
    h.x = nx;
    h.y = ny;
    const { mob, dist } = this.#nearestMob(h.x, h.y);
    let fire = false;
    if (mob && dist < ATTRACT_FIRE_TILES * tp) {
      h.angle = Math.atan2(mob.y - h.y, mob.x - h.x);
      this.burstT += dt;
      const phase = this.burstT % (BURST_S + BURST_GAP_S);
      fire = phase < BURST_S;
    } else if (h.moving) {
      h.angle = dir;
    }
    this.#fire(dt, fire, { x: h.x + Math.cos(h.angle) * 100, y: h.y + Math.sin(h.angle) * 100 });
    // potwory: wedrowka z lekkim ciazeniem do bohatera, bez gryzienia
    for (const m of this.mobs) {
      if (m.deadFor >= 0) {
        m.deadFor += dt;
        if (m.deadFor > RESPAWN_S) this.#respawn(m);
        continue;
      }
      const cfg = b.mobs[m.type];
      m.turnIn -= dt;
      if (m.turnIn <= 0) {
        m.turnIn = 0.6 + this.rng() * 1.2;
        const toHero = Math.atan2(h.y - m.y, h.x - m.x);
        const wander = ((this.rng() - 0.5) * 2 * (cfg.wanderDeg ?? 40) * Math.PI) / 180;
        m.heading = toHero + wander;
      }
      const d = Math.hypot(h.x - m.x, h.y - m.y);
      const speed = (cfg.speedTiles ?? 2) * tp * 0.55;
      if (d > ATTRACT_HOLD_TILES * tp) {
        m.x += Math.cos(m.heading) * speed * dt;
        m.y += Math.sin(m.heading) * speed * dt;
      }
      m.x = Math.min((tilesW - 1) * tp, Math.max(tp, m.x));
      m.y = Math.min((tilesH - 1) * tp, Math.max(tp, m.y));
      m.angle = Math.atan2(h.y - m.y, h.x - m.x);
    }
  }

  #respawn(m) {
    const b = this.balance;
    const tp = b.map.tilePx;
    const cfg = b.mobs[m.type];
    m.hp = cfg.hp;
    m.maxHp = cfg.hp;
    m.deadFor = -1;
    if (m.still) {
      m.x = m.spawnX;
      m.y = m.spawnY;
      return;
    }
    const a = this.rng() * Math.PI * 2;
    const d = (9 + this.rng() * 4) * tp;
    const { tilesW, tilesH } = b.map;
    m.x = Math.min((tilesW - 1) * tp, Math.max(tp, this.hero.x + Math.cos(a) * d));
    m.y = Math.min((tilesH - 1) * tp, Math.max(tp, this.hero.y + Math.sin(a) * d));
  }

  // Strzal przez ShotPredictor (ta sama geometria, co w grze), potem kolizje duchow z potworami.
  #fire(dt, fire, aim) {
    const h = this.hero;
    const b = this.balance;
    const wasReloading = this.shots.reloadLeft > 0;
    const created = this.shots.tick(dt, { me: h, fire, grid: this.grid, x: h.x, y: h.y, angle: h.angle });
    if (created.length) this.#emit('shot', { x: h.x, y: h.y, angle: h.angle });
    if (!wasReloading && this.shots.reloadLeft > 0) this.#emit('reload', { dur: rifleStats(b, h.weaponLv).reloadS });
    h.ammo = this.shots.ammo;
    h.reloadLeft = this.shots.reloadLeft;
    this.shots.step(dt, this.grid);
    const dmg = rifleStats(b, h.weaponLv).damage;
    this.shots.ghosts = this.shots.ghosts.filter((g) => {
      for (const m of this.mobs) {
        if (m.deadFor >= 0) continue;
        const r = b.mobs[m.type].radiusPx + 1;
        if (Math.hypot(m.x - g.x, m.y - g.y) > r) continue;
        m.hp -= dmg;
        this.#emit('hit', { mob: m.id, x: g.x, y: g.y, a: g.angle, dmg, by: h.id });
        if (m.hp <= 0) {
          m.deadFor = 0;
          this.#emit('mobDeath', { id: m.id, kind: m.type, x: m.x, y: m.y, a: g.angle });
        }
        return false;
      }
      return true;
    });
  }

  #stepRange(dt, input) {
    const h = this.hero;
    const aim = input.aim ?? { x: h.x + 1, y: h.y };
    h.moving = h.busy <= 0 && (input.mx !== 0 || input.my !== 0);
    h.angle = Math.atan2(aim.y - h.y, aim.x - h.x);
    const fireEdge = input.fire && !this.prevFire;
    this.prevFire = !!input.fire;
    if (fireEdge && h.held && h.busy <= 0) this.#throw(aim);
    else this.#fire(dt, !!input.fire && !h.held, aim);
    for (const m of this.mobs) {
      if (m.deadFor >= 0) {
        m.deadFor += dt;
        if (m.deadFor > RESPAWN_S) this.#respawn(m);
      } else {
        m.angle = Math.atan2(h.y - m.y, h.x - m.x);
      }
    }
  }

  // Jeden krok symulacji. `input` = { mx, my, fire, aim:{x,y} } (tylko w trybie range).
  update(nowMs, dt, input = { mx: 0, my: 0, fire: false, aim: null }) {
    this.nowMs = nowMs;
    const h = this.hero;
    if (h.busy > 0) h.busy = Math.max(0, h.busy - dt);
    if (this.ultCd > 0) this.ultCd = Math.max(0, this.ultCd - dt);
    const b = this.balance;
    for (const it of this.items) {
      if (it.state !== 'flying') continue;
      it.flight.p = Math.min(1, it.flight.p + dt / b.throw.flightS);
      if (it.flight.p >= 1) {
        it.state = 'ground';
        it.x = it.flight.x1;
        it.y = it.flight.y1;
        this.#emit('drop', { x: it.x, y: it.y });
      }
    }
    if (this.mode === 'range') this.#stepRange(dt, input);
    else this.#stepAttract(dt);
    this.effects = this.effects.filter((e) => nowMs - e.start < e.durMs);
    const out = this.events;
    this.events = [];
    return out;
  }

  mobTuples() {
    return this.mobs.filter((m) => m.deadFor < 0).map((m) => {
      const t = [];
      t[MV.id] = m.id;
      t[MV.type] = m.type;
      t[MV.x] = m.x;
      t[MV.y] = m.y;
      t[MV.hp] = m.hp;
      t[MV.maxHp] = m.maxHp;
      t[MV.stun] = 0;
      t[MV.frozen] = 0;
      t[MV.burn] = 0;
      t[MV.angle] = m.angle;
      t[MV.invul] = 0;
      t[MV.tele] = 0;
      t[MV.armed] = 0;
      return t;
    });
  }

  // Widok dla renderWorld. `extra` = { cam, sprites, fx, gore, pxScale, aim }.
  view(nowMs, extra) {
    const h = this.hero;
    const ghostT = this.mode === 'range' && h.held && extra.aim ? this.placeTargetFor(extra.aim) : null;
    return {
      cam: extra.cam, balance: this.balance, sprites: extra.sprites, frame: Math.floor(nowMs / (1000 / 60)),
      players: [h], mobs: this.mobTuples(), bullets: this.shots.bullets(), mobBullets: [],
      items: this.items, myId: h.id, gore: extra.gore, seed: this.seed,
      droplets: [], rockets: [], effects: this.effects, shakes: new Map(), nowMs, pxScale: extra.pxScale, fx: extra.fx,
      highlightId: this.mode === 'range' ? this.pickupTarget()?.id ?? null : null,
      ghost: ghostT ? { tiles: ghostT.tiles, valid: ghostT.valid } : null,
    };
  }
}
