import { damagePlayer } from './players.js';
import { onMobKilled } from './items.js';
import { spawnDroplets } from './ultimate.js';
import { spawnSplit } from './mobspawn.js';
import { igniteBlast } from './flames.js';
import { KIND, tileOf, footprint, itemDef } from '../public/shared/world.js';
import { rifleStats, modConfig } from '../public/shared/weapon.js';

const EPS = 1e-9;

export function spawnBullet(world, { owner, fromTurret, x, y, angle, damage, speedPx, rangePx, pierce = 0, homing = null, lenPx = 0 }) {
  const bullet = {
    id: world.nextId(), owner, fromTurret, x, y,
    vx: Math.cos(angle) * speedPx, vy: Math.sin(angle) * speedPx,
    travelLeft: rangePx, damage, pierce, passed: null,
  };
  // Samonaprowadzanie (V3-I-03): { coneRad, turnRad } - krok sterowania w stepBullet. lenPx > 0 = gwozdz (kreska).
  if (homing) bullet.homing = homing;
  if (lenPx > 0) bullet.lenPx = lenPx;
  world.bullets.push(bullet);
  return bullet;
}

export function startReload(world, p) {
  if (p.reloadLeft > 0 || p.ammo >= rifleStats(world.rules.balance, p.weaponLv).magazine) return;
  p.reloadLeft = rifleStats(world.rules.balance, p.weaponLv).reloadS;
  world.events.push({ type: 'reload', id: p.id });
}

export function fireWeapons(world, dt) {
  const { balance, tilePx } = world.rules;
  const { rifle } = balance;
  const r = balance.player.radiusPx;
  const spread = (rifle.spreadDeg * Math.PI) / 180;
  for (const p of world.players.values()) {
    const stats = rifleStats(balance, p.weaponLv);
    if (p.reloadLeft > 0) {
      p.reloadLeft = Math.max(0, p.reloadLeft - dt);
      if (p.reloadLeft <= EPS) {
        p.reloadLeft = 0;
        p.ammo = stats.magazine;
      }
      continue;
    }
    if (p.state !== 'alive' || p.suspended || p.busy > 0 || p.held !== null) continue;
    if (!p.input.fire || p.fireLock || p.cooldown > EPS) continue;
    const fz = p.frenzyLeft > 0 ? p.frenzy : null;
    // Szal przeslania modyfikator na czas trwania (ma wlasny `triple` i `pierce`); po nim modyfikator wraca.
    const mod = fz ? null : modConfig(balance, p.weaponMod);
    const rad = (deg) => (deg * Math.PI) / 180;
    const sp = mod?.spreadDeg != null && p.weaponMod === 'nailgun' ? rad(mod.spreadDeg) : spread;
    const angle = p.angle + (world.rng() - 0.5) * sp;
    const x = p.x + Math.cos(p.angle) * r;
    const y = p.y + Math.sin(p.angle) * r;
    let fan = fz?.triple ? [-0.2, 0, 0.2] : [0];
    let dmgMult = fz?.damageMult ?? 1;
    let speedPx = rifle.speedPx;
    let homing = null;
    let lenPx = 0;
    let interval = rifle.fireIntervalS;
    if (p.weaponMod === 'fan' && mod) {
      const span = rad(mod.spreadDeg);
      fan = Array.from({ length: mod.count }, (_, i) => (mod.count > 1 ? (i / (mod.count - 1) - 0.5) * span : 0));
      dmgMult *= mod.damageMult;
    } else if (p.weaponMod === 'homing' && mod) {
      homing = { coneRad: rad(mod.coneDeg), turnRad: rad(mod.turnDegPerS) };
    } else if (p.weaponMod === 'nailgun' && mod) {
      speedPx = mod.speedPx;
      dmgMult *= mod.damageMult;
      lenPx = mod.lenPx;
      interval = mod.fireIntervalS;
    }
    for (const off of fan) {
      spawnBullet(world, {
        owner: p.id, fromTurret: false, x, y, angle: angle + off,
        damage: stats.damage * dmgMult, speedPx, rangePx: rifle.rangeTiles * tilePx,
        pierce: fz?.pierce ?? 0, homing, lenPx,
      });
    }
    p.cooldown += interval * (fz?.fireMult ?? 1);
    p.ammo--;
    world.events.push({ type: 'shot', id: p.id, x, y, angle });
    if (p.ammo <= 0) startReload(world, p);
  }
}

export function damageMob(world, mob, damage, killerId) {
  if (!world.mobs.includes(mob) || mob.invul) return;
  mob.hp -= mob.frozen > 0 ? damage * (mob.vuln ?? 1) : damage;
  if (mob.hp <= 0) killMob(world, mob, killerId);
}

export function killMob(world, mob, killerId) {
  const i = world.mobs.indexOf(mob);
  if (i < 0) return;
  world.mobs.splice(i, 1);
  const killer = killerId != null ? world.players.get(killerId) : undefined;
  if (killer) killer.kills++;
  const a = mob.angle ?? 0;
  world.events.push({ type: 'mobDeath', id: mob.id, mobType: mob.type, x: mob.x, y: mob.y, a, killer: killerId });
  addGore(world.gore.corpses, [mob.type, Math.round(mob.x), Math.round(mob.y), Math.round(a * 100) / 100, world.wave ?? 0], world.rules.balance.gore.maxCorpses);
  spawnDroplets(world, mob);
  onMobKilled(world, mob, killerId);
  if (world.rules.balance.mobs[mob.type].split) spawnSplit(world, mob);
}

export function addGore(list, entry, max) {
  list.push(entry);
  if (list.length > max) list.splice(0, list.length - max);
}

export function mobHit(world, x, y, mob, angle, dmg, by = null) {
  world.events.push({ type: 'hit', x, y, mob: mob.id, a: Math.round(angle * 100) / 100, dmg: Math.round(dmg), by });
  addGore(world.gore.splats, [Math.round(x), Math.round(y)], world.rules.balance.gore.maxSplats);
}

export function solidAlong(grid, x0, y0, dx, dy, tilePx) {
  let tx = tileOf(x0, tilePx);
  let ty = tileOf(y0, tilePx);
  if (grid.kind(tx, ty) === KIND.WALL) return { t: 0, tx, ty };
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tDx = dx !== 0 ? tilePx / Math.abs(dx) : Infinity;
  const tDy = dy !== 0 ? tilePx / Math.abs(dy) : Infinity;
  let tMaxX = dx > 0 ? ((tx + 1) * tilePx - x0) / dx : dx < 0 ? (tx * tilePx - x0) / dx : Infinity;
  let tMaxY = dy > 0 ? ((ty + 1) * tilePx - y0) / dy : dy < 0 ? (ty * tilePx - y0) / dy : Infinity;
  for (;;) {
    const t = Math.min(tMaxX, tMaxY);
    if (t > 1) return null;
    if (tMaxX <= tMaxY) {
      tx += sx;
      tMaxX += tDx;
    } else {
      ty += sy;
      tMaxY += tDy;
    }
    if (grid.kind(tx, ty) === KIND.WALL) return { t, tx, ty };
  }
}

function circleAlong(x0, y0, dx, dy, cx, cy, r) {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < EPS) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function firstHit(world, b, dx, dy) {
  const { grid } = world;
  const { tilePx, balance } = world.rules;
  let best = null;
  const wall = solidAlong(grid, b.x, b.y, dx, dy, tilePx);
  if (wall) best = { t: wall.t, wall };
  for (const mob of world.mobs) {
    if (mob.invul || b.passed?.has(mob.id)) continue;
    const t = circleAlong(b.x, b.y, dx, dy, mob.x, mob.y, balance.mobs[mob.type].radiusPx);
    if (t !== null && (!best || t < best.t)) best = { t, mob };
  }
  if (b.fromTurret) return best;
  for (const p of world.players.values()) {
    if (p.id === b.owner || p.state !== 'alive' || p.suspended || p.invuln > 0) continue;
    const t = circleAlong(b.x, b.y, dx, dy, p.x, p.y, balance.player.radiusPx);
    if (t !== null && (!best || t < best.t)) best = { t, player: p };
  }
  return best;
}

function applyHit(world, b, hit, hooks) {
  if (hit.wall) {
    const { tx, ty } = hit.wall;
    if (!world.grid.inside(tx, ty) || b.fromTurret) return;
    const item = world.items.get(world.grid.id(tx, ty));
    if (item) {
      world.events.push({ type: 'objHit', id: item.id, x: b.x, y: b.y });
      hooks.onWallHit?.(item, b.damage);
    }
  } else if (hit.mob) {
    mobHit(world, b.x, b.y, hit.mob, Math.atan2(b.vy, b.vx), b.damage, b.fromTurret ? null : b.owner);
    damageMob(world, hit.mob, b.damage, b.owner);
    if (b.pierce > 0) {
      b.pierce--;
      (b.passed ??= new Set()).add(hit.mob.id);
      return true;
    }
    return;
  } else {
    damagePlayer(world, hit.player, b.damage * world.rules.balance.friendlyFire, 'ff');
    world.events.push({ type: 'ff', id: hit.player.id, by: b.owner, x: b.x, y: b.y });
  }
  world.events.push({ type: 'hit', x: b.x, y: b.y });
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Samonaprowadzanie (V3-I-03): najblizszy potwor w stozku przed pociskiem (widoczny, bez sciany pomiedzy),
// obrot o co najwyzej turnRad * dt. Dzieje sie PRZED raycastem trafienia, nie zamiast niego.
function steerBullet(world, b, dt) {
  const speed = Math.hypot(b.vx, b.vy);
  const heading = Math.atan2(b.vy, b.vx);
  let best = null;
  let bestD = b.travelLeft;
  for (const m of world.mobs) {
    if (m.invul || b.passed?.has(m.id)) continue;
    const d = Math.hypot(m.x - b.x, m.y - b.y);
    if (d >= bestD) continue;
    if (Math.abs(wrapPi(Math.atan2(m.y - b.y, m.x - b.x) - heading)) > b.homing.coneRad) continue;
    if (!lineClear(world, b.x, b.y, m.x, m.y)) continue;
    best = m;
    bestD = d;
  }
  if (!best) return;
  const diff = wrapPi(Math.atan2(best.y - b.y, best.x - b.x) - heading);
  const turn = Math.max(-b.homing.turnRad * dt, Math.min(b.homing.turnRad * dt, diff));
  b.vx = Math.cos(heading + turn) * speed;
  b.vy = Math.sin(heading + turn) * speed;
}

function stepBullet(world, b, dt, hooks) {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < EPS) return false;
  if (b.homing) steerBullet(world, b, dt);
  const len = Math.min(speed * dt, b.travelLeft);
  const dx = (b.vx / speed) * len;
  const dy = (b.vy / speed) * len;
  const hit = firstHit(world, b, dx, dy);
  if (hit) {
    b.x += dx * hit.t;
    b.y += dy * hit.t;
    if (!applyHit(world, b, hit, hooks)) return false;
    b.travelLeft -= len * hit.t;
    return b.travelLeft > EPS;
  }
  b.x += dx;
  b.y += dy;
  b.travelLeft -= len;
  return b.travelLeft > EPS;
}

export function updateBullets(world, dt, hooks = {}) {
  world.bullets = world.bullets.filter((b) => stepBullet(world, b, dt, hooks));
}

// --- Pociski wrogow (V3-A-02) ---------------------------------------------------------------
// Osobny byt: trafia graczy (pelne obrazenia, bez friendlyFire), omija potwory, nie da sie go zestrzelic
// (pociski gracza w ogole go nie widza), staje na scianach i rani obiekty gracza. Granat jest "lobowany":
// nie zahacza o graczy w locie, tylko detonuje na ziemi w punkcie ustalonym przy wystrzale.

// Czy odcinek (x0,y0)-(x1,y1) nie przecina sciany (ta sama siatka co pociski gracza).
export function lineClear(world, x0, y0, x1, y1) {
  return !solidAlong(world.grid, x0, y0, x1 - x0, y1 - y0, world.rules.tilePx);
}

export function spawnMobBullet(world, mob, tx, ty) {
  const { balance, tilePx } = world.rules;
  const rg = balance.mobs[mob.type].ranged;
  const angle = Math.atan2(ty - mob.y, tx - mob.x);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const x = mob.x + ux * balance.mobs[mob.type].radiusPx;
  const y = mob.y + uy * balance.mobs[mob.type].radiusPx;
  const lob = rg.blastTiles > 0;
  let travel = rg.rangeTiles * tilePx;
  if (lob) {
    travel = Math.min(travel, Math.hypot(tx - x, ty - y));
    const wall = solidAlong(world.grid, x, y, ux * travel, uy * travel, tilePx);
    if (wall) travel *= wall.t;
  }
  const b = {
    id: world.nextId(), mobType: mob.type, kind: lob ? 'grenade' : 'spit', x, y,
    vx: ux * rg.projSpeedPx, vy: uy * rg.projSpeedPx, speedPx: rg.projSpeedPx,
    travelLeft: travel, damage: world.rules.mobDamage(mob.type), objDamage: world.rules.mobObjDamage(mob.type),
    lx: x + ux * travel, ly: y + uy * travel,
  };
  world.mobBullets.push(b);
  world.events.push({ type: 'mobShot', id: mob.id, kind: b.kind, x, y, angle });
  return b;
}

function explodeMobBullet(world, b, hooks) {
  const { balance, tilePx } = world.rules;
  const rg = balance.mobs[b.mobType].ranged;
  const radius = rg.blastTiles * tilePx;
  const edge = rg.edgeMult ?? 0.5;
  const falloff = (d) => 1 - (1 - edge) * Math.min(1, d / radius);
  for (const p of world.players.values()) {
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (p.state === 'alive' && !p.suspended && d <= radius) damagePlayer(world, p, b.damage * falloff(d), 'grenade');
  }
  for (const item of [...world.items.values()]) {
    if (item.state !== 'placed' || itemDef(item.kind)?.category !== 'hard' || !(item.hp > 0)) continue;
    let d = Infinity;
    for (const [tx, ty] of footprint(item.kind, item.tx, item.ty, item.rot)) {
      d = Math.min(d, Math.hypot((tx + 0.5) * tilePx - b.x, (ty + 0.5) * tilePx - b.y));
    }
    if (d > radius) continue;
    world.events.push({ type: 'objHit', id: item.id, x: b.x, y: b.y });
    hooks.onWallHit?.(item, b.objDamage * falloff(d));
  }
  addGore(world.gore.scorches, [Math.round(b.x), Math.round(b.y), Math.round(radius)], balance.gore.maxScorches);
  world.events.push({ type: 'explode', id: b.id, x: b.x, y: b.y, radiusPx: radius, mine: true, foe: true });
  // granat zostawia plomien (V3-Q-04): srodek pelny, sasiedzi polowa
  if (world.flames) igniteBlast(world, b.x, b.y, balance.flames.grenade);
}

function stepMobBullet(world, b, dt, hooks) {
  const { grid } = world;
  const { tilePx, balance } = world.rules;
  const speed = Math.hypot(b.vx, b.vy);
  const len = Math.min(speed * dt, b.travelLeft);
  const dx = (b.vx / speed) * len;
  const dy = (b.vy / speed) * len;
  let best = solidAlong(grid, b.x, b.y, dx, dy, tilePx);
  if (best) best = { t: best.t, wall: best };
  if (b.kind === 'spit') {
    for (const p of world.players.values()) {
      if (p.state !== 'alive' || p.suspended || p.invuln > 0) continue;
      const t = circleAlong(b.x, b.y, dx, dy, p.x, p.y, balance.player.radiusPx);
      if (t !== null && (!best || t < best.t)) best = { t, player: p };
    }
  }
  if (best) {
    b.x += dx * best.t;
    b.y += dy * best.t;
    if (b.kind === 'grenade') {
      explodeMobBullet(world, b, hooks);
    } else if (best.player) {
      damagePlayer(world, best.player, b.damage, 'spit');
      world.events.push({ type: 'spitHit', x: b.x, y: b.y, player: best.player.id });
    } else {
      const { tx, ty } = best.wall;
      const item = grid.inside(tx, ty) ? world.items.get(grid.id(tx, ty)) : null;
      if (item) {
        world.events.push({ type: 'objHit', id: item.id, x: b.x, y: b.y });
        hooks.onWallHit?.(item, b.objDamage);
      }
      world.events.push({ type: 'spitHit', x: b.x, y: b.y });
    }
    return false;
  }
  b.x += dx;
  b.y += dy;
  b.travelLeft -= len;
  if (b.travelLeft > EPS) return true;
  if (b.kind === 'grenade') explodeMobBullet(world, b, hooks);
  return false;
}

export function updateMobBullets(world, dt, hooks = {}) {
  world.mobBullets = world.mobBullets.filter((b) => stepMobBullet(world, b, dt, hooks));
}
