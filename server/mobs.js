import { buildField, nextStep } from './flowfield.js';
import { damagePlayer } from './players.js';
import { damageMob } from './combat.js';
import { KIND, moveCircle, tileOf } from '../public/shared/world.js';

const EPS = 1e-9;

const isStand = (p) => p.state === 'alive' && !p.suspended;
const isDown = (p) => p.state === 'downed' && !p.suspended;

function tilesOf(world, pred) {
  const t = world.rules.tilePx;
  const out = [];
  for (const p of world.players.values()) if (pred(p)) out.push([tileOf(p.x, t), tileOf(p.y, t)]);
  return out;
}

export function buildMobFields(world) {
  const { grid } = world;
  const { wallCost } = world.rules.balance.mobAi;
  const stand = tilesOf(world, isStand);
  const down = tilesOf(world, isDown);
  return {
    stand: buildField(grid, stand, null),
    standSiege: buildField(grid, stand, wallCost),
    down: buildField(grid, down, null),
    downSiege: buildField(grid, down, wallCost),
  };
}

function refreshFields(world, dt) {
  world.fieldTimer = (world.fieldTimer ?? 0) - dt;
  if (world.mobFields && !world.fieldsDirty && world.fieldTimer > 0) return;
  world.mobFields = buildMobFields(world);
  world.fieldTimer = world.rules.balance.mobAi.fieldRebuildS;
  world.fieldsDirty = false;
}

function nearest(world, mob, pred) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.players.values()) {
    if (!pred(p)) continue;
    const d = Math.hypot(p.x - mob.x, p.y - mob.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { player: best, dist: bestD };
}

function pickTarget(world, mob, stand) {
  const { tilePx, balance } = world.rules;
  if (stand.dist <= balance.mobAi.downedTargetRangeTiles * tilePx) return { down: false, ...stand };
  const down = nearest(world, mob, isDown);
  if (down.player) return { down: true, ...down };
  return { down: false, ...stand };
}

function chooseField(world, mob, isDownTarget, tx, ty) {
  const f = world.mobFields;
  const normal = isDownTarget ? f.down : f.stand;
  const siege = isDownTarget ? f.downSiege : f.standSiege;
  if (world.rules.balance.mobs[mob.type].siege) return { field: siege, siege: true };
  const idx = ty * world.grid.w + tx;
  const v = normal[idx];
  if (v === Infinity || v > world.rules.balance.mobAi.detourMax * siege[idx]) return { field: siege, siege: true };
  return { field: normal, siege: false };
}

function resolveStep(grid, tx, ty, step) {
  const [nx, ny] = step;
  if (grid.isSolid(nx, ny) || nx === tx || ny === ty) return step;
  const sideX = grid.isSolid(nx, ty);
  const sideY = grid.isSolid(tx, ny);
  if (sideX && sideY) return [nx, ty];
  if (sideX) return [tx, ny];
  if (sideY) return [nx, ty];
  return step;
}

const rand = (rng, a, b) => a + rng() * (b - a);

function updateWander(world, mob, dt) {
  const ai = world.rules.balance.mobAi;
  const cfg = world.rules.balance.mobs[mob.type];
  const w = (mob.wander ??= { offset: 0, changeIn: 0, lookIn: rand(world.rng, ai.lookEveryMinS, ai.lookEveryMaxS), lookLeft: 0, lookDir: 0 });
  w.changeIn -= dt;
  if (w.changeIn <= 0) {
    w.offset = ((world.rng() * 2 - 1) * cfg.wanderDeg * Math.PI) / 180;
    w.changeIn = rand(world.rng, ai.wanderChangeMinS, ai.wanderChangeMaxS);
  }
  if (w.lookLeft > 0) w.lookLeft -= dt;
  else if (cfg.look) {
    w.lookIn -= dt;
    if (w.lookIn <= 0) {
      w.lookLeft = rand(world.rng, ai.lookMinS, ai.lookMaxS);
      w.lookDir = world.rng() * Math.PI * 2;
      w.lookIn = rand(world.rng, ai.lookEveryMinS, ai.lookEveryMaxS);
    }
  }
  return w;
}

function moveToward(world, mob, gx, gy, maxDist) {
  const dx = gx - mob.x;
  const dy = gy - mob.y;
  const d = Math.hypot(dx, dy);
  if (d < EPS) return;
  const s = Math.min(maxDist, d) / d;
  mob.angle = Math.atan2(dy, dx);
  const r = world.rules.balance.mobs[mob.type].radiusPx;
  const pos = moveCircle(world.grid, mob.x, mob.y, r, dx * s, dy * s, world.rules.tilePx);
  mob.x = pos.x;
  mob.y = pos.y;
}

function attackObject(world, mob, tx, ty, hooks) {
  const item = world.items.get(world.grid.id(tx, ty));
  if (!item || item.hp <= 0 || mob.attackCd > EPS) return;
  const cfg = world.rules.balance.mobs[mob.type];
  item.hp -= world.rules.mobObjDamage(mob.type);
  mob.attackCd = cfg.attackS;
  world.events.push({ type: 'objHit', id: item.id });
  if (item.hp <= 0) hooks.onObjectDestroyed?.(item);
}

// Potwor stojacy na kolcach nie traktuje ich jako celu, ale uderza w nie co drugi swoj atak
// (03-WAVES-DIFFICULTY, sekcja 1). Dotyczy kazdego przedmiotu na podlodze, ktory ma HP.
function gnawFloor(world, mob, dt, hooks) {
  const { tilePx } = world.rules;
  const tx = tileOf(mob.x, tilePx);
  const ty = tileOf(mob.y, tilePx);
  const item = world.grid.kind(tx, ty) === KIND.FLOOR ? world.items.get(world.grid.id(tx, ty)) : null;
  if (!item || !(item.hp > 0)) {
    mob.gnaw = null;
    return;
  }
  const cfg = world.rules.balance.mobs[mob.type];
  if (mob.gnaw?.id !== item.id) mob.gnaw = { id: item.id, left: 2 * cfg.attackS };
  mob.gnaw.left -= dt;
  if (mob.gnaw.left > EPS) return;
  mob.gnaw.left += 2 * cfg.attackS;
  item.hp -= world.rules.mobObjDamage(mob.type);
  world.events.push({ type: 'objHit', id: item.id });
  if (item.hp <= 0) hooks.onObjectDestroyed?.(item);
}

function updateMob(world, mob, dt, hooks) {
  const { tilePx, balance } = world.rules;
  const cfg = balance.mobs[mob.type];
  const playerR = balance.player.radiusPx;
  mob.attackCd = Math.max(0, mob.attackCd - dt);
  gnawFloor(world, mob, dt, hooks);

  const stand = nearest(world, mob, isStand);
  if (stand.player && stand.dist <= cfg.radiusPx + playerR + balance.mobAi.meleeReachPx && mob.attackCd <= EPS) {
    damagePlayer(world, stand.player, world.rules.mobDamage(mob.type), 'mob');
    mob.attackCd = cfg.attackS;
  }

  const target = pickTarget(world, mob, stand);
  if (!target.player || target.dist <= cfg.radiusPx + playerR) return;
  const tx = tileOf(mob.x, tilePx);
  const ty = tileOf(mob.y, tilePx);
  const { field, siege } = chooseField(world, mob, target.down, tx, ty);
  const raw = nextStep(field, world.grid, tx, ty, siege ? balance.mobAi.wallCost : null);
  const speed = world.rules.mobSpeedPx(mob.type) * dt * (mob.slowLeft > 0 ? 0.5 : 1);
  if (!raw) {
    moveToward(world, mob, target.player.x, target.player.y, Math.min(speed, target.dist - cfg.radiusPx - playerR));
    return;
  }
  const [nx, ny] = siege ? resolveStep(world.grid, tx, ty, raw) : raw;
  if (world.grid.isSolid(nx, ny)) {
    attackObject(world, mob, nx, ny, hooks);
    return;
  }
  let gx = (nx + 0.5) * tilePx;
  let gy = (ny + 0.5) * tilePx;
  const w = updateWander(world, mob, dt);
  if (target.dist > balance.mobAi.wanderNearTiles * tilePx) {
    const look = w.lookLeft > 0;
    const a = look ? w.lookDir : Math.atan2(gy - mob.y, gx - mob.x) + w.offset;
    gx = mob.x + Math.cos(a) * tilePx;
    gy = mob.y + Math.sin(a) * tilePx;
    moveToward(world, mob, gx, gy, look ? speed * balance.mobAi.lookSpeedMult : speed);
    return;
  }
  moveToward(world, mob, gx, gy, speed);
}

function separate(world) {
  const { mobs, grid } = world;
  const { tilePx, balance } = world.rules;
  for (let i = 0; i < mobs.length; i++) {
    for (let j = i + 1; j < mobs.length; j++) {
      const a = mobs[i];
      const b = mobs[j];
      const ra = balance.mobs[a.type].radiusPx;
      const rb = balance.mobs[b.type].radiusPx;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= ra + rb) continue;
      if (d < EPS) {
        dx = 1;
        dy = 0;
      } else {
        dx /= d;
        dy /= d;
      }
      const push = (ra + rb - d) / 2;
      const pa = moveCircle(grid, a.x, a.y, ra, -dx * push, -dy * push, tilePx);
      const pb = moveCircle(grid, b.x, b.y, rb, dx * push, dy * push, tilePx);
      a.x = pa.x;
      a.y = pa.y;
      b.x = pb.x;
      b.y = pb.y;
    }
  }
}

export function updateMobs(world, dt, hooks = {}) {
  refreshFields(world, dt);
  for (const mob of [...world.mobs]) {
    if (mob.burnLeft > 0) {
      mob.burnLeft -= dt;
      damageMob(world, mob, mob.burnDps * dt, mob.burnOwner);
      if (!world.mobs.includes(mob)) continue;
    }
    if (mob.bleedLeft > 0) {
      const step = Math.min(dt, mob.bleedLeft);
      mob.bleedLeft -= dt;
      damageMob(world, mob, mob.bleedDps * step, mob.bleedOwner);
      if (!world.mobs.includes(mob)) continue;
    }
    if (mob.frozen > 0) {
      mob.frozen = Math.max(0, mob.frozen - dt);
      if (mob.frozen === 0 && mob.slowAfter > 0) mob.slowLeft = mob.slowAfter;
      continue;
    }
    if (mob.slowLeft > 0) mob.slowLeft -= dt;
    if (mob.stun > 0) {
      mob.stun = Math.max(0, mob.stun - dt);
      continue;
    }
    updateMob(world, mob, dt, hooks);
  }
  separate(world);
}
