import { buildField, nextStep, sizeBlocked } from './flowfield.js';
import { damagePlayer } from './players.js';
import { spawnAround } from './mobspawn.js';
import { damageMob, lineClear, spawnMobBullet, solidAlong } from './combat.js';
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
    bm: null,
    sources: { stand, down },
    sized: new Map(),
  };
}

// Pola dla potworow wiekszych niz polowa kafelka (V3-A-01): te same cele, ale kafelki, w ktorych cialo sie
// nie miesci, sa nieprzechodnie (a w polu oblezniczym liczone jak sciana). Budowane leniwie, raz na przebudowe.
function fieldsFor(world, r) {
  const f = world.mobFields;
  if (r <= world.rules.tilePx / 2) return f;
  let s = f.sized.get(r);
  if (!s) {
    const bm = sizeBlocked(world.grid, r, world.rules.tilePx);
    const { wallCost } = world.rules.balance.mobAi;
    const { stand, down } = f.sources;
    const { grid } = world;
    s = {
      bm,
      stand: buildField(grid, stand, null, bm),
      standSiege: buildField(grid, stand, wallCost, bm),
      down: buildField(grid, down, null, bm),
      downSiege: buildField(grid, down, wallCost, bm),
    };
    f.sized.set(r, s);
  }
  return s;
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
  const f = fieldsFor(world, world.rules.balance.mobs[mob.type].radiusPx);
  const normal = isDownTarget ? f.down : f.stand;
  const siege = isDownTarget ? f.downSiege : f.standSiege;
  const bm = f.bm ?? null;
  if (world.rules.balance.mobs[mob.type].siege) return { field: siege, siege: true, bm };
  const idx = ty * world.grid.w + tx;
  let v = normal[idx];
  // stoimy na kafelku, w ktorym cialo sie nie miesci (np. tuz po spawnie): wartosc bierzemy od najlepszego sasiada
  if (v === Infinity && bm?.[idx]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (world.grid.inside(nx, ny)) v = Math.min(v, normal[ny * world.grid.w + nx] + 1);
    }
  }
  if (v === Infinity || v > world.rules.balance.mobAi.detourMax * siege[idx]) return { field: siege, siege: true, bm };
  return { field: normal, siege: false, bm };
}

// Najblizsza sciana/dzialko, ktora nie pozwala cialu o promieniu r wejsc na kafelek (nx, ny).
function blockerNear(world, r, nx, ny) {
  const { grid } = world;
  const span = Math.ceil(r / world.rules.tilePx) + 1;
  let best = null;
  let bestD = Infinity;
  for (let j = -span; j <= span; j++) {
    for (let i = -span; i <= span; i++) {
      if (!grid.inside(nx + i, ny + j) || !grid.isSolid(nx + i, ny + j)) continue;
      const d = i * i + j * j;
      if (d < bestD) {
        bestD = d;
        best = [nx + i, ny + j];
      }
    }
  }
  return best;
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

const KEEP_TOL_PX = 8;

// Potwor dystansowy (V3-A-03/04): trzyma dystans, strzela do pozycji gracza z chwili strzalu (bez
// przewidywania). Zwraca true, gdy sam zdecydowal o ruchu (stoi albo sie cofa); false = dalej zwykla
// sciezka, wraz z atakowaniem obiektow na trasie.
function updateRanged(world, mob, target, dt) {
  const { tilePx } = world.rules;
  const cfg = world.rules.balance.mobs[mob.type];
  const rg = cfg.ranged;
  const p = target.player;
  const d = target.dist;
  mob.shootCd = Math.max(0, (mob.shootCd ?? rg.intervalS * 0.5) - dt);
  const clear = lineClear(world, mob.x, mob.y, p.x, p.y);
  if (clear && mob.shootCd <= EPS && d <= rg.rangeTiles * tilePx) {
    spawnMobBullet(world, mob, p.x, p.y);
    mob.shootCd = rg.intervalS;
  }
  if (!clear || d > rg.keepTiles * tilePx + KEEP_TOL_PX) return false;
  mob.angle = Math.atan2(p.y - mob.y, p.x - mob.x);
  if (d < rg.keepTiles * tilePx - KEEP_TOL_PX) {
    const speed = world.rules.mobSpeedPx(mob.type) * dt * (mob.slowLeft > 0 ? 0.5 : 1);
    const a = mob.angle;
    const pos = moveCircle(world.grid, mob.x, mob.y, cfg.radiusPx, -Math.cos(a) * speed, -Math.sin(a) * speed, tilePx);
    mob.x = pos.x;
    mob.y = pos.y;
  }
  return true;
}

// Skradajacy sie (V3-A-05): cykl ukrycie / jawnosc. W ukryciu jest nietykalny (`mob.invul`, czytany przez
// combat.js i snapshot) i okrazca gracza stycznie. Zwraca true, gdy sam zdecydowal o ruchu.
function stealthTick(world, mob, dt) {
  const sc = world.rules.balance.mobs[mob.type].stealth;
  const s = (mob.stealth ??= {
    hide: true, left: rand(world.rng, sc.hideMinS, sc.hideMaxS), dir: world.rng() < 0.5 ? 1 : -1,
  });
  mob.invul = s.hide;
  s.left -= dt;
  if (s.left <= 0) {
    s.hide = !s.hide;
    s.left += s.hide ? rand(world.rng, sc.hideMinS, sc.hideMaxS) : rand(world.rng, sc.openMinS, sc.openMaxS);
    if (s.hide) s.dir = world.rng() < 0.5 ? 1 : -1;
    mob.invul = s.hide;
    if (!s.hide) world.events.push({ type: 'reveal', id: mob.id, x: mob.x, y: mob.y });
  }
}

function stealthStep(world, mob, stand, dt) {
  const { tilePx } = world.rules;
  const s = mob.stealth;
  if (!s.hide || !stand.player) return false;
  const a = Math.atan2(stand.player.y - mob.y, stand.player.x - mob.x) + (s.dir * Math.PI) / 2;
  const step = world.rules.mobSpeedPx(mob.type) * dt * (mob.slowLeft > 0 ? 0.5 : 1);
  const pos = moveCircle(world.grid, mob.x, mob.y, world.rules.balance.mobs[mob.type].radiusPx, Math.cos(a) * step, Math.sin(a) * step, tilePx);
  // zablokowany sciana - krazymy w druga strone zamiast stac
  if (Math.hypot(pos.x - mob.x, pos.y - mob.y) < step * 0.3) s.dir = -s.dir;
  mob.x = pos.x;
  mob.y = pos.y;
  mob.angle = a;
  return true;
}

function distToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// Ninja (V3-A-07): wandering -> telegraf -> szarza. Trajektoria (kat, dlugosc) jest ustalana RAZ, w chwili
// telegrafu, i nie sledzi gracza. Zwraca true, gdy sam zdecydowal o ruchu (telegraf, szarza); w wanderingu
// false = zwykle chodzenie.
function ninjaStep(world, mob, stand, dt, hooks) {
  const { tilePx } = world.rules;
  const cfg = world.rules.balance.mobs[mob.type];
  const cc = cfg.charge;
  const n = (mob.ninja ??= { phase: 'wander', left: rand(world.rng, cc.wanderMinS, cc.wanderMaxS) });
  if (n.phase === 'wander') {
    mob.tele = 0;
    n.left -= dt;
    if (n.left > 0 || !stand.player) return false;
    const p = stand.player;
    const ang = Math.atan2(p.y - mob.y, p.x - mob.x);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    let len = Math.min(cc.maxTiles * tilePx, stand.dist + cc.overshootTiles * tilePx);
    const wall = solidAlong(world.grid, mob.x, mob.y, ux * len, uy * len, tilePx);
    n.wall = null;
    if (wall) {
      len = Math.max(0, len * wall.t - cfg.radiusPx);
      n.wall = { tx: wall.tx, ty: wall.ty };
    }
    if (len < cfg.radiusPx) {
      n.left = rand(world.rng, cc.wanderMinS, cc.wanderMaxS);
      return false;
    }
    Object.assign(n, { phase: 'telegraph', left: cc.telegraphS, ang, len, done: 0, hit: new Set() });
    mob.angle = ang;
    mob.tele = len;
    world.events.push({ type: 'ninjaTele', id: mob.id, x: mob.x, y: mob.y });
    return true;
  }
  mob.angle = n.ang;
  if (n.phase === 'telegraph') {
    n.left -= dt;
    if (n.left <= 0) {
      n.phase = 'charge';
      mob.tele = 0;
      world.events.push({ type: 'ninjaCharge', id: mob.id, x: mob.x, y: mob.y });
    }
    return true;
  }
  const step = Math.min(cc.speedTiles * tilePx * dt, n.len - n.done);
  const { x: x0, y: y0 } = mob;
  const pos = moveCircle(world.grid, x0, y0, cfg.radiusPx, Math.cos(n.ang) * step, Math.sin(n.ang) * step, tilePx);
  mob.x = pos.x;
  mob.y = pos.y;
  const moved = Math.hypot(pos.x - x0, pos.y - y0);
  n.done += moved;
  const reach = cfg.radiusPx + world.rules.balance.player.radiusPx;
  for (const p of world.players.values()) {
    if (!isStand(p) || n.hit.has(p.id) || distToSegment(p.x, p.y, x0, y0, pos.x, pos.y) > reach) continue;
    n.hit.add(p.id);
    damagePlayer(world, p, world.rules.mobDamage(mob.type), 'mob');
  }
  if (n.done < n.len - 1e-6 && moved >= step * 0.5) return true;
  if (n.wall) {
    const item = world.items.get(world.grid.id(n.wall.tx, n.wall.ty));
    if (item && item.hp > 0) {
      item.hp -= world.rules.mobObjDamage(mob.type);
      world.events.push({ type: 'objHit', id: item.id });
      if (item.hp <= 0) hooks.onObjectDestroyed?.(item);
    }
  }
  n.phase = 'wander';
  n.left = rand(world.rng, cc.wanderMinS, cc.wanderMaxS);
  return true;
}

function updateMob(world, mob, dt, hooks) {
  const { tilePx, balance } = world.rules;
  const cfg = balance.mobs[mob.type];
  const playerR = balance.player.radiusPx;
  mob.attackCd = Math.max(0, mob.attackCd - dt);
  gnawFloor(world, mob, dt, hooks);
  if (cfg.stealth) stealthTick(world, mob, dt);

  const stand = nearest(world, mob, isStand);
  // ninja bije tylko szarza, skradajacy sie nie bije w ukryciu
  const melee = !cfg.charge && !mob.invul;
  if (melee && stand.player && stand.dist <= cfg.radiusPx + playerR + balance.mobAi.meleeReachPx && mob.attackCd <= EPS) {
    if (cfg.aoe) {
      // cios obszarowy: dostaje KAZDY stojacy gracz, ktorego cialo zahacza o kolo `aoe.radiusTiles` wokol srodka
      const reach = cfg.aoe.radiusTiles * tilePx + playerR;
      for (const p of [...world.players.values()]) {
        if (isStand(p) && Math.hypot(p.x - mob.x, p.y - mob.y) <= reach) damagePlayer(world, p, world.rules.mobDamage(mob.type), 'mob');
      }
    } else damagePlayer(world, stand.player, world.rules.mobDamage(mob.type), 'mob');
    mob.attackCd = cfg.attackS;
  }
  if (cfg.summon) {
    const sm = cfg.summon;
    mob.summonCd = (mob.summonCd ?? sm.everyS) - dt;
    if (mob.summonCd <= EPS) {
      mob.summonCd += sm.everyS;
      // Wezwanie podlega temu samemu sufitowi co spawn z fali: dluga walka z bossem inaczej zasypuje plansze
      // (co 10 s cztery slimaki, bez konca), a PRD-PERF-01 obiecuje 60 FPS przy 60 potworach.
      const room = world.rules.balance.waves.maxAliveMobs - world.mobs.length;
      if (room > 0) spawnAround(world, mob, sm.type, Math.min(sm.count, room));
    }
  }

  const target = pickTarget(world, mob, stand);
  if (!target.player) return;
  if (cfg.charge && ninjaStep(world, mob, stand, dt, hooks)) return;
  if (cfg.stealth && stealthStep(world, mob, stand, dt)) return;
  if (target.dist <= cfg.radiusPx + playerR) {
    mob.angle = Math.atan2(target.player.y - mob.y, target.player.x - mob.x);
    return;
  }
  if (cfg.ranged && !target.down && updateRanged(world, mob, target, dt)) return;
  const tx = tileOf(mob.x, tilePx);
  const ty = tileOf(mob.y, tilePx);
  const { field, siege, bm } = chooseField(world, mob, target.down, tx, ty);
  const raw = nextStep(field, world.grid, tx, ty, siege ? balance.mobAi.wallCost : null, bm);
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
  // ciało nie miesci sie na kolejnym kafelku (zwezenie): niszczymy to, co je blokuje, zamiast sie tam wciskac
  if (bm?.[ny * world.grid.w + nx]) {
    const b = blockerNear(world, cfg.radiusPx, nx, ny);
    if (b) {
      attackObject(world, mob, b[0], b[1], hooks);
      return;
    }
  }
  const gi = ny * world.grid.w + nx;
  let gx = (nx + 0.5) * tilePx + (bm ? bm.ox[gi] : 0);
  let gy = (ny + 0.5) * tilePx + (bm ? bm.oy[gi] : 0);
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
