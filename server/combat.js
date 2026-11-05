import { damagePlayer } from './players.js';
import { onMobKilled } from './items.js';
import { spawnDroplets } from './ultimate.js';
import { KIND, tileOf } from '../public/shared/world.js';
import { rifleStats } from '../public/shared/weapon.js';

const EPS = 1e-9;

export function spawnBullet(world, { owner, fromTurret, x, y, angle, damage, speedPx, rangePx, pierce = 0 }) {
  const bullet = {
    id: world.nextId(), owner, fromTurret, x, y,
    vx: Math.cos(angle) * speedPx, vy: Math.sin(angle) * speedPx,
    travelLeft: rangePx, damage, pierce, passed: null,
  };
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
    const angle = p.angle + (world.rng() - 0.5) * spread;
    const x = p.x + Math.cos(p.angle) * r;
    const y = p.y + Math.sin(p.angle) * r;
    const fan = fz?.triple ? [-0.2, 0, 0.2] : [0];
    for (const off of fan) {
      spawnBullet(world, {
        owner: p.id, fromTurret: false, x, y, angle: angle + off,
        damage: stats.damage * (fz?.damageMult ?? 1), speedPx: rifle.speedPx, rangePx: rifle.rangeTiles * tilePx,
        pierce: fz?.pierce ?? 0,
      });
    }
    p.cooldown += rifle.fireIntervalS * (fz?.fireMult ?? 1);
    p.ammo--;
    world.events.push({ type: 'shot', id: p.id, x, y, angle });
    if (p.ammo <= 0) startReload(world, p);
  }
}

export function damageMob(world, mob, damage, killerId) {
  if (!world.mobs.includes(mob)) return;
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
  addGore(world.gore.corpses, [mob.type, Math.round(mob.x), Math.round(mob.y), Math.round(a * 100) / 100], world.rules.balance.gore.maxCorpses);
  spawnDroplets(world, mob);
  onMobKilled(world, mob, killerId);
}

function addGore(list, entry, max) {
  list.push(entry);
  if (list.length > max) list.splice(0, list.length - max);
}

export function mobHit(world, x, y) {
  world.events.push({ type: 'hit', x, y, mob: true });
  addGore(world.gore.splats, [Math.round(x), Math.round(y)], world.rules.balance.gore.maxSplats);
}

function solidAlong(grid, x0, y0, dx, dy, tilePx) {
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
    if (b.passed?.has(mob.id)) continue;
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
    if (item) hooks.onWallHit?.(item, b.damage);
  } else if (hit.mob) {
    mobHit(world, b.x, b.y);
    damageMob(world, hit.mob, b.damage, b.owner);
    if (b.pierce > 0) {
      b.pierce--;
      (b.passed ??= new Set()).add(hit.mob.id);
      return true;
    }
    return;
  } else {
    damagePlayer(world, hit.player, b.damage * world.rules.balance.friendlyFire, 'ff');
  }
  world.events.push({ type: 'hit', x: b.x, y: b.y });
}

function stepBullet(world, b, dt, hooks) {
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < EPS) return false;
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
