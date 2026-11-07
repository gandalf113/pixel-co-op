// Random eventy na koncu fali (V3-Q-06): szkielet + rejestr wydarzen.
// Wydarzenie zyje w przerwie po fali: zatrzymuje licznik przerwy, blokuje sterowanie (world.lock), po zakonczeniu
// przerwa biegnie dalej z pelnym czasem. Losowanie: `events.chance` po fali >= `events.fromWave`, nigdy na fali
// bossa, nigdy dwa razy z rzedu. Kazde wydarzenie to wpis w EVENTS: { fromWave, weight, start, update -> done, stop }.
// Stan `world.event = { type, name, phase, t, lock, emote }` idzie w snapshocie; `world.builders` to kosmetyczne
// sylwetki (Armia budowniczych), tez w snapshocie.
import { bossesForWave } from './waves.js';
import { placeServer, freeFootprint } from './items.js';
import { pickWeighted } from './rng.js';
import { blocksBodies, footprint, activeInGroup, tileOf } from '../public/shared/world.js';

const EPS = 1e-9;
const cfgOf = (world) => world.rules.balance.events ?? null;
const kindCfg = (world, type) => cfgOf(world)?.kinds?.[type] ?? {};

export const EVENTS = {};

export function registerEvent(type, def) {
  EVENTS[type] = def;
}

export function pickEvent(world, wave) {
  const c = cfgOf(world);
  if (!c || !(c.chance > 0) || wave < c.fromWave) return null;
  if (bossesForWave(world.rules, wave).length) return null;
  if (world.lastEventWave === wave - 1) return null;
  if (world.rng() >= c.chance) return null;
  const entries = Object.entries(EVENTS)
    .filter(([t, d]) => (c.kinds?.[t]?.enabled ?? true) && wave >= (c.kinds?.[t]?.fromWave ?? d.fromWave ?? 1))
    .map(([t, d]) => [t, c.kinds?.[t]?.weight ?? d.weight ?? 10]);
  return pickWeighted(world.rng, entries) ?? null;
}

export function startEvent(world, type) {
  const def = EVENTS[type];
  if (!def || world.event) return null;
  const kc = kindCfg(world, type);
  const ev = { type, name: kc.name ?? type.toUpperCase(), phase: 'start', t: 0, lock: true, emote: def.emote ?? null };
  world.event = ev;
  world.lock = true;
  world.builders = [];
  world.lastEventWave = world.wave;
  world.events.push({ type: 'eventStart', kind: type, name: ev.name });
  def.start(world, ev, kc);
  return ev;
}

export function updateEvent(world, dt) {
  const ev = world.event;
  if (!ev) return false;
  ev.t += dt;
  if (EVENTS[ev.type].update(world, ev, dt, kindCfg(world, ev.type))) endEvent(world);
  return true;
}

export function endEvent(world) {
  const ev = world.event;
  if (!ev) return;
  EVENTS[ev.type].stop?.(world, ev);
  world.event = null;
  world.lock = false;
  world.builders = [];
  world.events.push({ type: 'eventEnd', kind: ev.type });
}

// ---------------------------------------------------------------------------------------------------------------
// Armia budowniczych (V3-Q-06-03): gracze staja z emotka zdziwienia, zewszad wbiega ~50 szarych "graczy" i stawiaja
// wszystko, co da sie postawic, do pelnych limitow. Budowniczowie sa kosmetyczni (lista w snapshocie, bez kolizji);
// o tym, co i gdzie stoi, decyduje plan ulozony na starcie. Kazde postawienie to zwykly `place` (dzwiek, efekt).
// Rozmieszczenie: pierscien `ringMin..ringMax` kafelkow wokol srodka ciezkosci zywych graczy; obiekty blokujace
// cialo z odstepem >= 3 wolnych kafelkow od innych blokujacych (nowych i istniejacych), zeby nie zamurowac sciezki;
// platformy lecznicze blisko graczy (1..4), kolce / miny / klatki dalej (3..ringMax).

function centerOf(world) {
  const alive = [...world.players.values()].filter((p) => p.state !== 'dead' && !p.suspended);
  const { tilesW, tilesH, tilePx } = world.rules.balance.map;
  if (!alive.length) return { x: (tilesW * tilePx) / 2, y: (tilesH * tilePx) / 2 };
  return { x: alive.reduce((s, p) => s + p.x, 0) / alive.length, y: alive.reduce((s, p) => s + p.y, 0) / alive.length };
}

// Kafelki w odleglosci Czebyszewa <= gap od obrysu; `blocking` to zbior "x,y" kafelkow juz zajetych przez obiekty
// blokujace (plan + siatka), a `gap` to wymagany odstep.
function clearAround(world, tiles, blocking, gap) {
  for (const [x, y] of tiles) {
    for (let dy = -gap; dy <= gap; dy++) {
      for (let dx = -gap; dx <= gap; dx++) {
        const kx = x + dx;
        const ky = y + dy;
        if (blocking.has(`${kx},${ky}`)) return false;
        if (world.grid.inside(kx, ky) && world.grid.isSolid(kx, ky)) return false;
      }
    }
  }
  return true;
}

function planJobs(world, kc) {
  const { balance, tilePx } = world.rules;
  const items = balance.items;
  const center = centerOf(world);
  const ctx = tileOf(center.x, tilePx);
  const cty = tileOf(center.y, tilePx);
  const reserved = new Set();
  const blocking = new Set();
  const jobs = [];
  const gap = kc.gapTiles ?? 3;
  const rng = world.rng;
  const want = [];
  for (const [kind, c] of Object.entries(items)) {
    if (['weaponboost', 'permanent'].includes(c.behavior)) continue;
    let n = 0;
    if (c.limit != null) n = Math.max(0, c.limit - activeInGroup(world.items.values(), kind));
    else n = kc.hard?.[kind] ?? 0;
    // grupa limitu (dzialka 30/60/90 dziela pule): liczymy raz, dla pierwszego rodzaju z grupy
    if (c.limitGroup && want.some(([k]) => items[k].limitGroup === c.limitGroup)) continue;
    if (n > 0) want.push([kind, n]);
  }
  const near = (kind) => items[kind].behavior === 'platform';
  // najpierw obiekty blokujace cialo (najtrudniej je zmiescic z odstepem), potem reszta
  want.sort(([a], [b]) => Number(blocksBodies(b)) - Number(blocksBodies(a)));
  for (const [kind, n] of want) {
    const rot = items[kind].rotatable ? 1 : 0;
    const rMin = near(kind) ? 1 : kc.ringMin ?? 3;
    const rMax = near(kind) ? 4 : kc.ringMax ?? 8;
    const blocks = blocksBodies(kind);
    let placed = 0;
    for (let tries = 0; tries < n * 250 && placed < n; tries++) {
      const a = rng() * Math.PI * 2;
      const r = rMin + rng() * (rMax - rMin);
      const tx = Math.round(ctx + Math.cos(a) * r);
      const ty = Math.round(cty + Math.sin(a) * r);
      const rr = rot ? Math.floor(rng() * 2) : 0;
      if (!freeFootprint(world, kind, tx, ty, rr, reserved)) continue;
      const tiles = footprint(kind, tx, ty, rr);
      if (blocks && !clearAround(world, tiles, blocking, gap)) continue;
      for (const [x, y] of tiles) {
        reserved.add(`${x},${y}`);
        if (blocks) blocking.add(`${x},${y}`);
      }
      jobs.push({ kind, tx, ty, rot: rr });
      placed++;
    }
  }
  // kolejnosc losowa: zeby nie stawiali najpierw wszystkich scian, a potem wszystkich min
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }
  return jobs;
}

function edgePoint(world, rng) {
  const { tilesW, tilesH, tilePx } = world.rules.balance.map;
  const W = tilesW * tilePx;
  const H = tilesH * tilePx;
  const side = Math.floor(rng() * 4);
  const t = rng();
  const off = tilePx;
  if (side === 0) return { x: t * W, y: -off };
  if (side === 1) return { x: W + off, y: t * H };
  if (side === 2) return { x: t * W, y: H + off };
  return { x: -off, y: t * H };
}

function builderStep(world, b, dt, kc, ev) {
  const { tilePx } = world.rules;
  const speed = (kc.speedTiles ?? 8) * tilePx * dt;
  if (b.wait > 0) {
    b.wait -= dt;
    b.moving = false;
    return;
  }
  const job = b.jobs[0];
  const goal = job ? { x: (job.tx + 0.5) * tilePx, y: (job.ty + 0.5) * tilePx + tilePx * 0.6 } : b.exit;
  const dx = goal.x - b.x;
  const dy = goal.y - b.y;
  const d = Math.hypot(dx, dy);
  b.moving = true;
  if (d > EPS) b.angle = Math.atan2(dy, dx);
  if (d > speed) {
    b.x += (dx / d) * speed;
    b.y += (dy / d) * speed;
    return;
  }
  b.x = goal.x;
  b.y = goal.y;
  if (job) {
    b.jobs.shift();
    if (freeFootprint(world, job.kind, job.tx, job.ty, job.rot)) placeServer(world, job.kind, job.tx, job.ty, job.rot);
    b.wait = kc.placeS ?? 0.15;
    return;
  }
  b.gone = true;
}

registerEvent('builders', {
  fromWave: 3,
  weight: 10,
  emote: '?!',
  start(world, ev, kc) {
    const jobs = planJobs(world, kc);
    const count = Math.max(1, Math.min(kc.count ?? 50, Math.max(jobs.length, 8)));
    const builders = [];
    for (let i = 0; i < count; i++) {
      const start = edgePoint(world, world.rng);
      builders.push({ id: world.nextId(), x: start.x, y: start.y, angle: 0, moving: true, wait: 0, jobs: [], exit: edgePoint(world, world.rng), gone: false });
    }
    jobs.forEach((job, i) => builders[i % count].jobs.push(job));
    world.builders = builders;
    ev.jobs = jobs.length;
    ev.phase = 'build';
  },
  update(world, ev, dt, kc) {
    for (const b of world.builders) if (!b.gone) builderStep(world, b, dt, kc, ev);
    world.builders = world.builders.filter((b) => !b.gone);
    const left = world.builders.reduce((s, b) => s + b.jobs.length, 0);
    if (left === 0 && ev.phase === 'build') ev.phase = 'leave';
    if (ev.t >= (kc.maxS ?? 14)) {
      // awaryjnie: co zostalo w planie, staje od razu (zeby wydarzenie nigdy nie wisialo)
      for (const b of world.builders) for (const job of b.jobs) if (freeFootprint(world, job.kind, job.tx, job.ty, job.rot)) placeServer(world, job.kind, job.tx, job.ty, job.rot);
      return true;
    }
    return world.builders.length === 0;
  },
});
