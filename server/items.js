import { damagePlayer, setDropHeld } from './players.js';
import { spawnBullet, damageMob, mobHit } from './combat.js';
import { pickWeighted } from './rng.js';
import { buildGrid, footprint, placementValid, segmentBlocked, tileOf } from '../public/shared/world.js';

const EPS = 1e-9;
const LAND_SEARCH_TILES = 3;

setDropHeld((world, player) => dropHeld(world, player));

const cfgOf = (world, item) => world.rules.balance.items[item.kind];
const isHard = (world, item) => cfgOf(world, item).category === 'hard';

export function rebuildGrid(world) {
  world.grid = buildGrid(world.grid.w, world.grid.h, world.items.values());
  world.fieldsDirty = true;
}

function blocking(item) {
  return (item.kind === 'wall' && item.state === 'placed') || (item.kind === 'turret30' && item.state === 'active');
}

function toGround(world, item, x, y) {
  const wasBlocking = blocking(item);
  Object.assign(item, { state: 'ground', x, y, holder: null, flight: null, groundSince: world.time });
  if (wasBlocking) rebuildGrid(world);
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
    .filter(([, c]) => c.category === category)
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
  const { tilePx } = world.rules;
  world.events.push({ type: 'destroyed', id: item.id, kind: item.kind, x: (item.tx + 0.5) * tilePx, y: (item.ty + 0.5) * tilePx });
}

function rectDist(px, py, tx, ty, tilePx) {
  const nx = Math.max(tx * tilePx, Math.min(px, (tx + 1) * tilePx));
  const ny = Math.max(ty * tilePx, Math.min(py, (ty + 1) * tilePx));
  return Math.hypot(px - nx, py - ny);
}

function nearestPickable(world, player) {
  const { tilePx, balance } = world.rules;
  const range = balance.player.pickupRangeTiles * tilePx;
  let best = null;
  let bestD = Infinity;
  for (const it of world.items.values()) {
    let d = Infinity;
    if (it.state === 'ground') d = Math.hypot(it.x - player.x, it.y - player.y);
    else if (it.kind === 'wall' && it.state === 'placed') {
      for (const [tx, ty] of footprint(it.kind, it.tx, it.ty, it.rot)) d = Math.min(d, rectDist(player.x, player.y, tx, ty, tilePx));
    }
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

function activeCount(world, kind) {
  let n = 0;
  for (const it of world.items.values()) if (it.kind === kind && it.state === 'active') n++;
  return n;
}

function limitReached(world, kind) {
  return activeCount(world, kind) >= world.rules.balance.items[kind].limit;
}

function activate(world, item, tx, ty, owner) {
  const cfg = cfgOf(world, item);
  Object.assign(item, { state: 'active', tx, ty, holder: null, flight: null, owner, cooldown: 0 });
  if (item.kind === 'turret30') {
    item.timeLeft = cfg.durationS;
    item.hp = cfg.hp;
  } else if (item.kind === 'mine') {
    item.armLeft = cfg.armS;
  }
  if (blocking(item)) rebuildGrid(world);
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

function pickUp(world, player, item) {
  item.expireLeft = 0;
  const wasBlocking = blocking(item);
  Object.assign(item, { state: 'held', holder: player.id, x: player.x, y: player.y });
  player.held = item.id;
  player.busy = world.rules.balance.player.pickupAnimS;
  if (wasBlocking) rebuildGrid(world);
  world.events.push({ type: 'pickup', id: item.id, kind: item.kind, player: player.id });
}

function deny(world, player) {
  world.events.push({ type: 'deny', id: player.id });
}

function cursorTile(world, player) {
  const { tilePx } = world.rules;
  return [tileOf(player.input.aimX, tilePx), tileOf(player.input.aimY, tilePx)];
}

function placeFromHand(world, player, tiles, limit) {
  const { tilePx, balance } = world.rules;
  return placementValid({
    grid: world.grid, tiles, playerX: player.x, playerY: player.y, circles: circles(world),
    tilePx, maxRangeTiles: balance.player.placeRangeTiles, limitReached: limit,
  });
}

function placeWallItem(world, player, item) {
  const [tx, ty] = cursorTile(world, player);
  if (!placeFromHand(world, player, footprint('wall', tx, ty, item.rot), false)) return deny(world, player);
  Object.assign(item, { state: 'placed', tx, ty, holder: null });
  player.held = null;
  rebuildGrid(world);
  world.events.push({ type: 'place', id: item.id, kind: item.kind, tx, ty });
}

function usePower(world, player, item) {
  const [tx, ty] = cursorTile(world, player);
  if (!placeFromHand(world, player, [[tx, ty]], limitReached(world, item.kind))) return deny(world, player);
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
    const target = nearestPickable(world, player);
    if (target) {
      if (item) toGround(world, item, player.x, player.y);
      pickUp(world, player, target);
    } else if (item?.kind === 'wall') {
      placeWallItem(world, player, item);
    } else if (item) {
      dropHeld(world, player);
    }
  } else if (action === 'r' && item) {
    if (item.kind === 'wall') item.rot ^= 1;
    else usePower(world, player, item);
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

function freeTileNear(world, x, y) {
  const { tilePx } = world.rules;
  const cx = tileOf(x, tilePx);
  const cy = tileOf(y, tilePx);
  const cs = circles(world);
  const candidates = [];
  for (let dy = -LAND_SEARCH_TILES; dy <= LAND_SEARCH_TILES; dy++) {
    for (let dx = -LAND_SEARCH_TILES; dx <= LAND_SEARCH_TILES; dx++) {
      if (Math.hypot(dx, dy) <= LAND_SEARCH_TILES) candidates.push([cx + dx, cy + dy, Math.hypot(dx, dy)]);
    }
  }
  candidates.sort((a, b) => a[2] - b[2]);
  for (const [tx, ty] of candidates) {
    const ok = placementValid({
      grid: world.grid, tiles: [[tx, ty]], playerX: (tx + 0.5) * tilePx, playerY: (ty + 0.5) * tilePx,
      circles: cs, tilePx, maxRangeTiles: Infinity, limitReached: false,
    });
    if (ok) return [tx, ty];
  }
  return null;
}

function land(world, item, x, y) {
  const thrower = item.flight.thrower;
  if (isHard(world, item) || limitReached(world, item.kind)) return toGround(world, item, x, y);
  const tile = freeTileNear(world, x, y);
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
    mobHit(world, hit.x, hit.y);
    damageMob(world, hit.mob, cfg.throwDamage, f.thrower);
    return land(world, item, hit.x, hit.y);
  }
  if (hit?.player) {
    damagePlayer(world, hit.player, cfg.throwDamage * balance.friendlyFire, 'ff');
    return land(world, item, hit.x, hit.y);
  }
  item.x = nx;
  item.y = ny;
  if (f.t >= f.dur - EPS) land(world, item, nx, ny);
}

function updateTurret(world, item, dt) {
  const { tilePx, balance } = world.rules;
  const cfg = cfgOf(world, item);
  item.timeLeft -= dt;
  if (item.timeLeft <= EPS) {
    world.items.delete(item.id);
    rebuildGrid(world);
    return;
  }
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
  world.events.push({ type: 'shot', id: item.id, x: cx, y: cy });
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
  world.events.push({ type: 'explode', id: item.id, x: cx, y: cy, radiusPx: r });
}

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
        world.events.push({ type: 'destroyed', id: item.id, kind: item.kind, x: (item.tx + 1) * world.rules.tilePx, y: (item.ty + 0.5) * world.rules.tilePx });
      }
    } else if (item.state === 'active' && item.kind === 'turret30') {
      updateTurret(world, item, dt);
    } else if (item.state === 'active' && item.kind === 'mine') {
      updateMine(world, item, dt);
    }
  }
}
