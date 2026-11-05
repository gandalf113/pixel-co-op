import { damagePlayer, setDropHeld, setPadReviveProbe } from './players.js';
import { spawnBullet, damageMob, mobHit, addGore } from './combat.js';
import { pickWeighted } from './rng.js';
import {
  behaviorOf, blocksBodies, buildGrid, footprint, itemLimitReached, placeTarget, placementValid, segmentBlocked, tileOf,
} from '../public/shared/world.js';

const EPS = 1e-9;
const LAND_SEARCH_TILES = 3;

setDropHeld((world, player) => dropHeld(world, player));
setPadReviveProbe((world, player) => padReviveS(world, player));

const cfgOf = (world, item) => world.rules.balance.items[item.kind];
const isHard = (world, item) => cfgOf(world, item).category === 'hard';

export function rebuildGrid(world) {
  world.grid = buildGrid(world.grid.w, world.grid.h, world.items.values());
  world.fieldsDirty = true;
}

// Czy przedmiot w tym stanie jest w siatce (blokuje albo zajmuje kafelek) - wg zachowania z balance.json.
function inGrid(item) {
  const b = behaviorOf(item.kind);
  return !!b && b.grid !== null && item.state === b.when;
}

function toGround(world, item, x, y) {
  const wasInGrid = inGrid(item);
  Object.assign(item, { state: 'ground', x, y, holder: null, flight: null, groundSince: world.time });
  if (wasInGrid) rebuildGrid(world);
}

function enforceGroundLimit(world) {
  const ground = [...world.items.values()].filter((i) => i.state === 'ground');
  const extra = ground.length - world.rules.balance.drops.groundLimit;
  if (extra <= 0) return;
  ground.sort((a, b) => a.groundSince - b.groundSince);
  for (let i = 0; i < extra; i++) world.items.delete(ground[i].id);
}

export function spawnDrop(world, kind, x, y) {
  const { scatterPx } = world.rules.balance.drops;
  const cfg = world.rules.balance.items[kind];
  const item = {
    id: world.nextId(), kind, state: 'ground',
    x: x + (world.rng() * 2 - 1) * scatterPx, y: y + (world.rng() * 2 - 1) * scatterPx,
    tx: 0, ty: 0, rot: 0, hp: cfg.hp ?? 0, holder: null, owner: null, groundSince: world.time,
    timeLeft: 0, armLeft: 0, cooldown: 0, flight: null,
  };
  world.items.set(item.id, item);
  world.events.push({ type: 'drop', id: item.id, kind, x: item.x, y: item.y });
  enforceGroundLimit(world);
  return item;
}

export function rollDrop(world, mobType) {
  const { rules, rng } = world;
  if (rng() >= rules.dropChance(mobType)) return null;
  const category = rng() < rules.balance.drops.hardShare ? 'hard' : 'power';
  const entries = Object.entries(rules.balance.items)
    .filter(([, c]) => c.category === category && c.weight > 0)
    .map(([k, c]) => [k, c.weight]);
  return pickWeighted(rng, entries) ?? null;
}

export function onMobKilled(world, mob, killerId) {
  let kind = rollDrop(world, mob.type);
  const hardSoFar = world.waveHardDrops ?? 0;
  const kindHard = kind !== null && world.rules.balance.items[kind].category === 'hard';
  if (world.wave === 1 && hardSoFar === 0 && !kindHard && world.waveComplete?.()) kind = 'wall';
  if (kind === null) return;
  if (world.rules.balance.items[kind].category === 'hard') world.waveHardDrops = hardSoFar + 1;
  spawnDrop(world, kind, mob.x, mob.y);
}

export function onWaveStart(world) {
  world.waveHardDrops = 0;
}

export function heldKind(world, player) {
  return player.held != null ? world.items.get(player.held)?.kind ?? null : null;
}

export function dropHeld(world, player) {
  const item = player.held != null ? world.items.get(player.held) : null;
  player.held = null;
  if (item) toGround(world, item, player.x, player.y);
}

export function onObjectDestroyed(world, item) {
  if (!world.items.delete(item.id)) return;
  rebuildGrid(world);
  const { tilePx, balance } = world.rules;
  addGore(world.gore.rubble, [item.kind, item.tx, item.ty, item.rot ?? 0], balance.gore.maxRubble);
  world.events.push({
    type: 'destroyed', id: item.id, kind: item.kind, tx: item.tx, ty: item.ty, rot: item.rot ?? 0,
    x: (item.tx + 0.5) * tilePx, y: (item.ty + 0.5) * tilePx,
  });
}

function nearestPickable(world, player) {
  const { tilePx, balance } = world.rules;
  const range = balance.player.pickupRangeTiles * tilePx;
  let best = null;
  let bestD = Infinity;
  for (const it of world.items.values()) {
    if (it.state !== 'ground') continue;
    const d = Math.hypot(it.x - player.x, it.y - player.y);
    if (d <= range && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

function circles(world) {
  const { balance } = world.rules;
  const out = [];
  for (const p of world.players.values()) {
    if (p.state !== 'dead' && !p.suspended) out.push({ x: p.x, y: p.y, r: balance.player.radiusPx });
  }
  for (const m of world.mobs) out.push({ x: m.x, y: m.y, r: balance.mobs[m.type].radiusPx });
  return out;
}

// Limit liczy sie lacznie dla grupy (`limitGroup`), np. dzialka 30/60/90 s dziela jedna pule 8.
const limitReached = (world, kind) => itemLimitReached(world.items.values(), kind);

// Poczatkowy stan power-upa wg zachowania; kazde zachowanie bierze liczby ze swojego wpisu w balance.json.
const ACTIVATORS = {
  turret(item, cfg) {
    item.timeLeft = cfg.durationS;
    item.hp = cfg.hp;
  },
  mine(item, cfg) {
    item.armLeft = cfg.armS;
  },
  platform(item, cfg) {
    item.timeLeft = cfg.durationS;
  },
  // Klatka czeka bez limitu czasu; 8 s liczy dopiero od zlapania potwora.
  cage(item) {
    item.timeLeft = 0;
    item.caught = null;
  },
};

function activate(world, item, tx, ty, owner) {
  const cfg = cfgOf(world, item);
  Object.assign(item, { state: 'active', tx, ty, holder: null, flight: null, owner, cooldown: 0 });
  ACTIVATORS[cfg.behavior]?.(item, cfg);
  if (inGrid(item)) rebuildGrid(world);
  world.events.push({ type: 'place', id: item.id, kind: item.kind, tx, ty });
}

export function spawnUltWall(world, tx, ty, rot, hp, expireS) {
  const tiles = footprint('wall', tx, ty, rot);
  const { tilePx } = world.rules;
  const cs = circles(world);
  for (const [x, y] of tiles) {
    if (!world.grid.inside(x, y) || world.grid.isSolid(x, y)) return null;
    for (const c of cs) {
      const nx = Math.max(x * tilePx, Math.min(c.x, (x + 1) * tilePx));
      const ny = Math.max(y * tilePx, Math.min(c.y, (y + 1) * tilePx));
      if ((c.x - nx) ** 2 + (c.y - ny) ** 2 < c.r * c.r) return null;
    }
  }
  const item = {
    id: world.nextId(), kind: 'wall', state: 'placed', tx, ty, rot, hp, maxHp: hp, x: 0, y: 0,
    holder: null, owner: null, groundSince: world.time, timeLeft: 0, armLeft: 0, cooldown: 0, flight: null, expireLeft: expireS,
  };
  world.items.set(item.id, item);
  rebuildGrid(world);
  world.events.push({ type: 'place', id: item.id, kind: 'wall', tx, ty });
  return item;
}

// Startowe ruiny (PRD-MAP-10): zwykle sciany w stanie `placed`, ale bez `expireLeft`
// (nie znikaja same) i z czesciowym hp przy pelnym maxHp - klient rysuje stan zuzycia z hp/maxHp.
// Luka = liczba pustych kafelkow miedzy zestawami kafelkow (odleglosc Czebyszewa - 1).
function tileGap(tilesA, tilesB) {
  let best = Infinity;
  for (const [ax, ay] of tilesA) for (const [bx, by] of tilesB) best = Math.min(best, Math.max(Math.abs(ax - bx), Math.abs(ay - by)) - 1);
  return best;
}

function drawRuinHps(world, count, maxHp) {
  const { hpBands, minDamagedStates } = world.rules.balance.ruins;
  const pick = () => Array.from({ length: count }, () => Math.floor(world.rng() * hpBands.length));
  const damaged = (bands) => new Set(bands.filter((b) => b > 0)).size;
  const need = Math.min(minDamagedStates, hpBands.length - 1, count);
  let bands = pick();
  for (let i = 0; i < 50 && damaged(bands) < need; i++) bands = pick();
  // zapas, zeby warunek byl gwarantowany, a nie tylko bardzo prawdopodobny
  for (let i = 0; damaged(bands) < need; i++) bands[i] = i + 1;
  return bands.map((b) => {
    const [lo, hi] = hpBands[b];
    const from = Math.floor(lo * maxHp) + 1;
    const to = Math.max(from, Math.floor(hi * maxHp));
    return from + Math.floor(world.rng() * (to - from + 1));
  });
}

export function spawnStartingRuins(world) {
  const cfg = world.rules.balance.ruins;
  const { tilePx, balance } = world.rules;
  const maxHp = balance.items.wall.hp;
  const cx = balance.map.tilesW / 2;
  const cy = balance.map.tilesH / 2;
  const spawnTiles = [...world.players.values()].map((p) => [tileOf(p.x, tilePx), tileOf(p.y, tilePx)]);
  const placed = [];
  const span = Math.ceil(cfg.maxRadiusTiles) + 1;
  for (let n = 0; n < cfg.count; n++) {
    for (let attempt = 0; attempt < cfg.attemptsPerRuin; attempt++) {
      const rot = world.rng() < 0.5 ? 0 : 1;
      const tx = Math.floor(cx) - span + Math.floor(world.rng() * (2 * span + 1));
      const ty = Math.floor(cy) - span + Math.floor(world.rng() * (2 * span + 1));
      const tiles = footprint('wall', tx, ty, rot);
      if (!tiles.every(([x, y]) => world.grid.inside(x, y) && !world.grid.isSolid(x, y))) continue;
      const mx = tiles.reduce((s, [x]) => s + x + 0.5, 0) / tiles.length;
      const my = tiles.reduce((s, [, y]) => s + y + 0.5, 0) / tiles.length;
      const dist = Math.hypot(mx - cx, my - cy);
      if (dist < cfg.minRadiusTiles || dist > cfg.maxRadiusTiles) continue;
      if (tileGap(tiles, spawnTiles) < cfg.minSpawnGapTiles) continue;
      if (placed.some((r) => tileGap(tiles, r.tiles) < cfg.minGapTiles)) continue;
      placed.push({ tx, ty, rot, tiles });
      break;
    }
  }
  const hps = drawRuinHps(world, placed.length, maxHp);
  placed.forEach((r, i) => {
    const item = {
      id: world.nextId(), kind: 'wall', state: 'placed', tx: r.tx, ty: r.ty, rot: r.rot, hp: hps[i], maxHp,
      x: 0, y: 0, holder: null, owner: null, groundSince: world.time, timeLeft: 0, armLeft: 0, cooldown: 0, flight: null,
    };
    world.items.set(item.id, item);
  });
  if (placed.length) rebuildGrid(world);
  return placed.length;
}

function pickUp(world, player, item) {
  const wasInGrid = inGrid(item);
  Object.assign(item, { state: 'held', holder: player.id, x: player.x, y: player.y });
  player.held = item.id;
  player.busy = world.rules.balance.player.pickupAnimS;
  if (wasInGrid) rebuildGrid(world);
  world.events.push({ type: 'pickup', id: item.id, kind: item.kind, player: player.id });
}

function deny(world, player) {
  world.events.push({ type: 'deny', id: player.id });
}

function targetFor(world, player, item, limit) {
  const { tilePx, balance } = world.rules;
  return placeTarget({
    grid: world.grid, kind: item.kind, rot: cfgOf(world, item).rotatable ? item.rot : 0,
    playerX: player.x, playerY: player.y, aimX: player.input.aimX, aimY: player.input.aimY,
    circles: circles(world), tilePx, maxRangeTiles: balance.player.placeRangeTiles, limitReached: limit,
  });
}

function placeHardItem(world, player, item) {
  const { tx, ty, valid } = targetFor(world, player, item, false);
  if (!valid) return deny(world, player);
  Object.assign(item, { state: 'placed', tx, ty, holder: null, owner: player.id, cooldown: 0 });
  player.held = null;
  rebuildGrid(world);
  world.events.push({ type: 'place', id: item.id, kind: item.kind, tx, ty });
}

function usePower(world, player, item) {
  const { tx, ty, valid } = targetFor(world, player, item, limitReached(world, item.kind));
  if (!valid) return deny(world, player);
  player.held = null;
  activate(world, item, tx, ty, player.id);
}

function throwItem(world, player, item) {
  const { tilePx, balance } = world.rules;
  const dx = player.input.aimX - player.x;
  const dy = player.input.aimY - player.y;
  const d = Math.hypot(dx, dy);
  const max = balance.throw.rangeTiles * tilePx;
  const s = d > max ? max / d : 1;
  item.state = 'flying';
  item.holder = null;
  item.x = player.x;
  item.y = player.y;
  item.flight = { x0: player.x, y0: player.y, x1: player.x + dx * s, y1: player.y + dy * s, t: 0, dur: balance.throw.flightS, thrower: player.id };
  player.held = null;
}

export function handleAction(world, player, action) {
  if (player.state !== 'alive' || player.suspended || player.busy > 0) return;
  const item = player.held != null ? world.items.get(player.held) : null;
  if (action === 'e') {
    if (!item) {
      const target = nearestPickable(world, player);
      if (target) pickUp(world, player, target);
    } else if (isHard(world, item)) {
      placeHardItem(world, player, item);
    } else {
      usePower(world, player, item);
    }
  } else if (action === 'r' && item) {
    dropHeld(world, player);
  } else if (action === 'q' && item && cfgOf(world, item).rotatable) {
    item.rot ^= 1;
  } else if (action === 'space' && item) {
    throwItem(world, player, item);
  }
}

function segPointT(x0, y0, x1, y1, cx, cy) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return 0;
  return Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2));
}

function firstBodyHit(world, item, x0, y0, x1, y1) {
  const { balance } = world.rules;
  let best = null;
  const consider = (cx, cy, r, hit) => {
    const t = segPointT(x0, y0, x1, y1, cx, cy);
    const hx = x0 + (x1 - x0) * t;
    const hy = y0 + (y1 - y0) * t;
    if (Math.hypot(cx - hx, cy - hy) <= r && (!best || t < best.t)) best = { t, x: hx, y: hy, ...hit };
  };
  for (const m of world.mobs) consider(m.x, m.y, balance.mobs[m.type].radiusPx, { mob: m });
  if (isHard(world, item)) {
    for (const p of world.players.values()) {
      if (p.id === item.flight.thrower || p.state !== 'alive' || p.suspended) continue;
      consider(p.x, p.y, balance.player.radiusPx, { player: p });
    }
  }
  return best;
}

function freeTileNear(world, kind, x, y) {
  const { tilePx } = world.rules;
  const cx = tileOf(x, tilePx);
  const cy = tileOf(y, tilePx);
  const cs = blocksBodies(kind) ? circles(world) : [];
  const candidates = [];
  for (let dy = -LAND_SEARCH_TILES; dy <= LAND_SEARCH_TILES; dy++) {
    for (let dx = -LAND_SEARCH_TILES; dx <= LAND_SEARCH_TILES; dx++) {
      if (Math.hypot(dx, dy) <= LAND_SEARCH_TILES) candidates.push([cx + dx, cy + dy, Math.hypot(dx, dy)]);
    }
  }
  candidates.sort((a, b) => a[2] - b[2]);
  for (const [tx, ty] of candidates) {
    const ok = placementValid({
      grid: world.grid, tiles: footprint(kind, tx, ty, 0), playerX: (tx + 0.5) * tilePx, playerY: (ty + 0.5) * tilePx,
      circles: cs, tilePx, maxRangeTiles: Infinity, limitReached: false,
    });
    if (ok) return [tx, ty];
  }
  return null;
}

function land(world, item, x, y, mob = null) {
  const thrower = item.flight.thrower;
  if (isHard(world, item) || limitReached(world, item.kind)) return toGround(world, item, x, y);
  // Pulapka na podlodze (klatka) laduje pod trafionym potworem, zeby go zlapac, a nie obok niego.
  const onMob = mob && !blocksBodies(item.kind);
  const tile = freeTileNear(world, item.kind, onMob ? mob.x : x, onMob ? mob.y : y);
  if (!tile) return toGround(world, item, x, y);
  activate(world, item, tile[0], tile[1], thrower);
}

function updateFlight(world, item, dt) {
  const { tilePx, balance } = world.rules;
  const f = item.flight;
  const cfg = cfgOf(world, item);
  f.t = Math.min(f.dur, f.t + dt);
  const k = f.t / f.dur;
  const nx = f.x0 + (f.x1 - f.x0) * k;
  const ny = f.y0 + (f.y1 - f.y0) * k;
  if (world.grid.isSolid(tileOf(nx, tilePx), tileOf(ny, tilePx))) return land(world, item, item.x, item.y);
  const hit = firstBodyHit(world, item, item.x, item.y, nx, ny);
  if (hit?.mob) {
    if (isHard(world, item)) hit.mob.stun = Math.max(hit.mob.stun, balance.throw.stunS);
    if (cfg.throwBleed) Object.assign(hit.mob, { bleedLeft: cfg.throwBleed.durationS, bleedDps: cfg.throwBleed.dps, bleedOwner: f.thrower });
    mobHit(world, hit.x, hit.y, hit.mob, Math.atan2(f.y1 - f.y0, f.x1 - f.x0), cfg.throwDamage);
    damageMob(world, hit.mob, cfg.throwDamage, f.thrower);
    return land(world, item, hit.x, hit.y, hit.mob);
  }
  if (hit?.player) {
    damagePlayer(world, hit.player, cfg.throwDamage * balance.friendlyFire, 'ff');
    return land(world, item, hit.x, hit.y);
  }
  item.x = nx;
  item.y = ny;
  if (f.t >= f.dur - EPS) land(world, item, nx, ny);
}

// Wspolny odliczacz czasu zycia power-upa; true = przedmiot zniknal.
function expireWhenDone(world, item, dt) {
  item.timeLeft -= dt;
  if (item.timeLeft > EPS) return false;
  world.items.delete(item.id);
  rebuildGrid(world);
  world.events.push({ type: 'expire', id: item.id });
  return true;
}

const tileIn = (tiles, tx, ty) => tiles.some(([x, y]) => x === tx && y === ty);

function updateTurret(world, item, dt) {
  const { tilePx, balance } = world.rules;
  const cfg = cfgOf(world, item);
  if (expireWhenDone(world, item, dt)) return;
  item.cooldown = Math.max(0, item.cooldown - dt);
  if (item.cooldown > EPS) return;
  const cx = (item.tx + 0.5) * tilePx;
  const cy = (item.ty + 0.5) * tilePx;
  const range = cfg.rangeTiles * tilePx;
  let target = null;
  let bestD = Infinity;
  for (const m of world.mobs) {
    const d = Math.hypot(m.x - cx, m.y - cy);
    if (d <= range && d < bestD && !segmentBlocked(world.grid, cx, cy, m.x, m.y, tilePx, true)) {
      target = m;
      bestD = d;
    }
  }
  if (!target) return;
  spawnBullet(world, {
    owner: item.owner, fromTurret: true, x: cx, y: cy, angle: Math.atan2(target.y - cy, target.x - cx),
    damage: cfg.damage, speedPx: balance.rifle.speedPx, rangePx: range,
  });
  item.cooldown = cfg.cooldownS;
  world.events.push({ type: 'shot', id: item.id, x: cx, y: cy, angle: Math.atan2(target.y - cy, target.x - cx) });
}

function updateMine(world, item, dt) {
  const { tilePx, balance } = world.rules;
  const cfg = cfgOf(world, item);
  item.armLeft = Math.max(0, item.armLeft - dt);
  if (item.armLeft > EPS) return;
  const triggered = world.mobs.some((m) => tileOf(m.x, tilePx) === item.tx && tileOf(m.y, tilePx) === item.ty);
  if (!triggered) return;
  const cx = (item.tx + 0.5) * tilePx;
  const cy = (item.ty + 0.5) * tilePx;
  const r = cfg.radiusTiles * tilePx;
  world.items.delete(item.id);
  for (const m of [...world.mobs]) {
    if (Math.hypot(m.x - cx, m.y - cy) > r) continue;
    damageMob(world, m, cfg.damage, item.owner);
  }
  for (const p of world.players.values()) {
    if (p.state === 'alive' && Math.hypot(p.x - cx, p.y - cy) <= r) damagePlayer(world, p, cfg.damage * balance.friendlyFire, 'mine');
  }
  addGore(world.gore.scorches, [Math.round(cx), Math.round(cy), Math.round(r)], balance.gore.maxScorches);
  world.events.push({ type: 'explode', id: item.id, x: cx, y: cy, radiusPx: r, mine: true });
}

// Kolce: co tickS zadaja obrazenia kazdemu potworowi na kafelku, a graczowi friendlyFire tego (10%).
function updateSpikes(world, item, dt) {
  const { tilePx, balance } = world.rules;
  const cfg = cfgOf(world, item);
  item.cooldown = Math.max(0, item.cooldown - dt);
  if (item.cooldown > EPS) return;
  const onTile = (e) => tileOf(e.x, tilePx) === item.tx && tileOf(e.y, tilePx) === item.ty;
  const mobs = world.mobs.filter(onTile);
  const players = [...world.players.values()].filter((p) => p.state === 'alive' && !p.suspended && onTile(p));
  if (!mobs.length && !players.length) return;
  for (const m of mobs) {
    mobHit(world, m.x, m.y, m, m.angle ?? 0, cfg.tickDamage);
    damageMob(world, m, cfg.tickDamage, item.owner);
  }
  for (const p of players) damagePlayer(world, p, cfg.tickDamage * balance.friendlyFire, 'spikes');
  item.cooldown = cfg.tickS;
}

// Platforma: gracz stojacy w obrysie dostaje healHp co healEveryS.
function updatePlatform(world, item, dt) {
  const { tilePx } = world.rules;
  const cfg = cfgOf(world, item);
  if (expireWhenDone(world, item, dt)) return;
  item.cooldown = Math.max(0, item.cooldown - dt);
  if (item.cooldown > EPS) return;
  const tiles = footprint(item.kind, item.tx, item.ty, 0);
  let any = false;
  for (const p of world.players.values()) {
    if (p.state !== 'alive' || p.suspended || !tileIn(tiles, tileOf(p.x, tilePx), tileOf(p.y, tilePx))) continue;
    any = true;
    p.hp = Math.min(p.maxHp, p.hp + cfg.healHp);
  }
  if (any) item.cooldown = cfg.healEveryS;
}

// Ile sekund wstaje powalony stojacy na platformie (bez sojusznika), albo null.
function padReviveS(world, player) {
  const { tilePx } = world.rules;
  const tx = tileOf(player.x, tilePx);
  const ty = tileOf(player.y, tilePx);
  for (const it of world.items.values()) {
    if (it.state !== 'active' || cfgOf(world, it).behavior !== 'platform') continue;
    if (tileIn(footprint(it.kind, it.tx, it.ty, 0), tx, ty)) return cfgOf(world, it).reviveS;
  }
  return null;
}

// Klatka: lapie pierwszego potwora na kafelku (nie bossa) i uzywa istniejacego `frozen`/`vuln`
// (jak Zamrozenie z ultimate), a po durationS znika.
function updateCage(world, item, dt) {
  const { tilePx, balance } = world.rules;
  const cfg = cfgOf(world, item);
  if (item.caught == null) {
    const mob = world.mobs.find((m) => !balance.mobs[m.type].boss && tileOf(m.x, tilePx) === item.tx && tileOf(m.y, tilePx) === item.ty);
    if (!mob) return;
    item.caught = mob.id;
    item.timeLeft = cfg.durationS;
    mob.frozen = Math.max(mob.frozen ?? 0, cfg.durationS);
    mob.vuln = Math.max(mob.vuln ?? 1, cfg.vuln);
    mob.slowAfter = 0;
    world.events.push({ type: 'trap', id: item.id, mob: mob.id });
    return;
  }
  // Zabity w klatce potwor zwalnia ja od razu, zeby nie zajmowala limitu.
  if (!world.mobs.some((m) => m.id === item.caught)) item.timeLeft = 0;
  expireWhenDone(world, item, dt);
}

// Zachowanie -> aktualizacja co tick (tylko te, ktore maja zywa logike; `block` jest bierne).
const UPDATERS = {
  turret: updateTurret, mine: updateMine, spikes: updateSpikes, platform: updatePlatform, cage: updateCage,
};

export function updateItems(world, dt) {
  for (const item of [...world.items.values()]) {
    if (!world.items.has(item.id)) continue;
    if (item.state === 'held') {
      const h = world.players.get(item.holder);
      if (h) {
        item.x = h.x;
        item.y = h.y;
      }
    } else if (item.state === 'flying') {
      updateFlight(world, item, dt);
    } else if (item.state === 'placed' && item.expireLeft > 0) {
      item.expireLeft -= dt;
      if (item.expireLeft <= EPS) {
        world.items.delete(item.id);
        rebuildGrid(world);
        world.events.push({ type: 'expire', id: item.id });
      }
    } else if (item.state === 'placed' || item.state === 'active') {
      UPDATERS[cfgOf(world, item).behavior]?.(world, item, dt);
    }
  }
}
