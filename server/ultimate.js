import { damageMob, addGore } from './combat.js';
import { spawnUltWall } from './items.js';
import { moveCircle, segmentBlocked, tileOf } from '../public/shared/world.js';

const EPS = 1e-9;

const ult = (world) => world.rules.balance.ultimate;

export function ultTier(world, player) {
  return Math.min(3, Math.floor((player.ult + EPS) / ult(world).tierPoints));
}

export function spawnDroplets(world, mob) {
  const cfg = ult(world);
  const n = cfg.droplets[mob.type] ?? 1;
  for (let i = 0; i < n; i++) {
    world.droplets.push({
      id: world.nextId(),
      x: mob.x + (world.rng() * 2 - 1) * cfg.scatterPx,
      y: mob.y + (world.rng() * 2 - 1) * cfg.scatterPx,
      age: 0,
    });
  }
}

function collect(world) {
  const { barMax } = ult(world);
  const value = world.rules.diff.dropletValue;
  for (const p of world.players.values()) p.ult = Math.min(barMax, p.ult + value);
}

function updateDroplets(world, dt) {
  const cfg = ult(world);
  const range = cfg.magnetTiles * world.rules.tilePx;
  world.droplets = world.droplets.filter((d) => {
    let target = null;
    let best = Infinity;
    for (const p of world.players.values()) {
      if (p.state !== 'alive' || p.suspended) continue;
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist < best) {
        best = dist;
        target = p;
      }
    }
    if (target && best <= cfg.absorbPx) {
      collect(world);
      world.events.push({ type: 'droplet', player: target.id });
      return false;
    }
    if (target && best <= range) {
      const k = 1 - best / range;
      const v = Math.min(cfg.magnetMinPx + cfg.magnetBoostPx, cfg.magnetMinPx + cfg.magnetBoostPx * k * k);
      const step = Math.min(best, v * dt);
      d.x += ((target.x - d.x) / best) * step;
      d.y += ((target.y - d.y) / best) * step;
      return true;
    }
    d.age += dt;
    return d.age < cfg.lifeS;
  });
}

// Wybuch rakiety (V3-Q-07): pelne obrazenia w calym promieniu (bez spadku na krawedzi) i ogluszenie
// `stunS` wszystkiego w promieniu, zeby stado nie dobiegalo w trakcie podpalenia.
function explode(world, r) {
  const { tilePx } = world.rules;
  const radius = r.cfg.radiusTiles * tilePx;
  const stunS = ult(world).kinds.rocket.stunS ?? 0;
  for (const m of [...world.mobs]) {
    if (Math.hypot(m.x - r.x, m.y - r.y) > radius) continue;
    if (stunS > 0) m.stun = Math.max(m.stun ?? 0, stunS);
    if (r.cfg.burnS > 0) {
      m.burnLeft = r.cfg.burnS;
      m.burnDps = r.cfg.burnDps;
      m.burnOwner = r.owner;
    }
    damageMob(world, m, r.cfg.damage, r.owner);
  }
  addGore(world.gore.scorches, [Math.round(r.x), Math.round(r.y), Math.round(radius)], world.rules.balance.gore.maxScorches);
  world.events.push({ type: 'explode', id: r.id, x: r.x, y: r.y, radiusPx: radius, mine: true });
}

function updateRockets(world, dt) {
  const { tilePx, balance } = world.rules;
  world.rockets = world.rockets.filter((r) => {
    const step = Math.min(Math.hypot(r.vx, r.vy) * dt, r.travelLeft);
    const n = Math.max(1, Math.ceil(step / 4));
    const sx = (r.vx / Math.hypot(r.vx, r.vy)) * (step / n);
    const sy = (r.vy / Math.hypot(r.vx, r.vy)) * (step / n);
    for (let i = 0; i < n; i++) {
      r.x += sx;
      r.y += sy;
      r.travelLeft -= step / n;
      const wall = world.grid.isSolid(tileOf(r.x, tilePx), tileOf(r.y, tilePx));
      const mob = world.mobs.some((m) => Math.hypot(m.x - r.x, m.y - r.y) <= balance.mobs[m.type].radiusPx + 2);
      if (wall || mob || r.travelLeft <= EPS) {
        explode(world, r);
        return false;
      }
    }
    return true;
  });
}

export function updateUltimate(world, dt) {
  for (const p of world.players.values()) {
    if (p.frenzyLeft > 0) p.frenzyLeft = Math.max(0, p.frenzyLeft - dt);
  }
  updateDroplets(world, dt);
  updateRockets(world, dt);
}

function shockwave(world, p, c) {
  const { tilePx, balance } = world.rules;
  const r = c.radiusTiles * tilePx;
  for (const m of [...world.mobs]) {
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d > r) continue;
    damageMob(world, m, c.damage, p.id);
    if (!world.mobs.includes(m)) continue;
    const a = d < EPS ? world.rng() * Math.PI * 2 : Math.atan2(m.y - p.y, m.x - p.x);
    const kb = c.knockbackTiles * tilePx;
    const pos = moveCircle(world.grid, m.x, m.y, balance.mobs[m.type].radiusPx, Math.cos(a) * kb, Math.sin(a) * kb, tilePx);
    m.x = pos.x;
    m.y = pos.y;
    if (c.stunS > 0) m.stun = Math.max(m.stun, c.stunS);
  }
}

function wallPieces(world, p, c) {
  const tx = tileOf(p.x, world.rules.tilePx);
  const ty = tileOf(p.y, world.rules.tilePx);
  const out = [];
  if (c.ring) {
    for (let i = 0; i < c.count; i++) {
      const a = (i / c.count) * Math.PI * 2;
      const vertical = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      out.push({ tx: tx + Math.round(Math.cos(a) * 3), ty: ty + Math.round(Math.sin(a) * 3) - (vertical ? 1 : 0), rot: vertical ? 1 : 0 });
    }
    return out;
  }
  const cx = tx + Math.round(Math.cos(p.angle) * 2);
  const cy = ty + Math.round(Math.sin(p.angle) * 2);
  const vertical = Math.abs(Math.cos(p.angle)) >= Math.abs(Math.sin(p.angle));
  for (let i = 0; i < c.count; i++) {
    const off = (i - Math.floor(c.count / 2)) * 2;
    out.push(vertical ? { tx: cx, ty: cy + off - 1, rot: 1 } : { tx: cx + off - 1, ty: cy, rot: 0 });
  }
  return out;
}

function heal(world, p, c) {
  const { tilePx, balance } = world.rules;
  const r = c.radiusTiles * tilePx;
  for (const o of world.players.values()) {
    if (o.suspended || o.state === 'dead') continue;
    if (r > 0 && Math.hypot(o.x - p.x, o.y - p.y) > r) continue;
    if (o.state === 'downed') {
      if (!c.revive) continue;
      o.state = 'alive';
      o.hp = Math.max(balance.player.reviveHp, Math.min(o.maxHp, c.hp));
      o.reviveProgress = 0;
      o.deathLeft = 0;
      world.events.push({ type: 'revive', id: o.id });
    } else {
      o.hp = Math.min(o.maxHp, o.hp + c.hp);
    }
    if (c.invulnS > 0) o.invuln = Math.max(o.invuln, c.invulnS);
  }
}

function angleDiff(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

function widegun(world, p, c) {
  const { tilePx } = world.rules;
  const range = c.rangeTiles * tilePx;
  const half = (c.coneDeg * Math.PI) / 360;
  for (const m of [...world.mobs]) {
    if (Math.hypot(m.x - p.x, m.y - p.y) > range) continue;
    if (angleDiff(Math.atan2(m.y - p.y, m.x - p.x), p.angle) > half) continue;
    if (!c.throughWalls && segmentBlocked(world.grid, p.x, p.y, m.x, m.y, tilePx, true)) continue;
    damageMob(world, m, c.damage, p.id);
  }
}

function rocket(world, p, c, kindCfg) {
  const fan = (kindCfg.fanDeg * Math.PI) / 180;
  for (let i = 0; i < c.count; i++) {
    const a = p.angle + (i - (c.count - 1) / 2) * fan;
    world.rockets.push({
      id: world.nextId(), owner: p.id, x: p.x, y: p.y, cfg: c,
      vx: Math.cos(a) * kindCfg.speedPx, vy: Math.sin(a) * kindCfg.speedPx,
      travelLeft: kindCfg.rangeTiles * world.rules.tilePx,
    });
  }
}

function freeze(world, p, c) {
  const r = c.radiusTiles * world.rules.tilePx;
  for (const m of world.mobs) {
    if (r > 0 && Math.hypot(m.x - p.x, m.y - p.y) > r) continue;
    m.frozen = c.durationS;
    m.vuln = c.vuln;
    m.slowAfter = c.slowS;
  }
}

export function useUltimate(world, p) {
  if (p.state !== 'alive' || p.suspended || !p.ultKind) return;
  const tier = ultTier(world, p);
  if (tier === 0) {
    world.events.push({ type: 'ultDeny', id: p.id });
    return;
  }
  const kindCfg = ult(world).kinds[p.ultKind];
  const c = kindCfg.tiers[tier - 1];
  p.ult = 0;
  p.ultsUsed = (p.ultsUsed ?? 0) + 1;
  switch (p.ultKind) {
    case 'shockwave': shockwave(world, p, c); break;
    case 'wall': for (const w of wallPieces(world, p, c)) spawnUltWall(world, w.tx, w.ty, w.rot, c.hp, c.durationS); break;
    case 'heal': heal(world, p, c); break;
    case 'frenzy': p.frenzy = c; p.frenzyLeft = c.durationS; break;
    case 'widegun': widegun(world, p, c); break;
    case 'rocket': rocket(world, p, c, kindCfg); break;
    case 'freeze': freeze(world, p, c); break;
  }
  world.events.push({ type: 'ult', id: p.id, kind: p.ultKind, tier, x: p.x, y: p.y, angle: p.angle });
}
