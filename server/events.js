// Random eventy na koncu fali (V3-Q-06): szkielet + rejestr wydarzen.
// Wydarzenie zyje w przerwie po fali: zatrzymuje licznik przerwy, blokuje sterowanie (world.lock), po zakonczeniu
// przerwa biegnie dalej z pelnym czasem. Losowanie: `events.chance` po fali >= `events.fromWave`, nigdy na fali
// bossa, nigdy dwa razy z rzedu. Kazde wydarzenie to wpis w EVENTS: { fromWave, weight, start, update -> done, stop }.
// Stan `world.event = { type, name, phase, t, lock, emote }` idzie w snapshocie; `world.builders` to kosmetyczne
// sylwetki (Armia budowniczych), tez w snapshocie.
import { bossesForWave } from './waves.js';
import { placeServer, freeFootprint, rebuildGrid } from './items.js';
import { pickWeighted } from './rng.js';
import { blocksBodies, footprint, activeInGroup, tileOf, moveCircle } from '../public/shared/world.js';
import { spawnFromQueue } from './mobspawn.js';
import { startBreakFor, damagePlayer } from './players.js';
import { setDark } from './flames.js';

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

// ---------------------------------------------------------------------------------------------------------------
// Trzesienie ziemi (V3-Q-06-01): (1) wstrzas, (2) gracze traca sterowanie i sa sciagani do wspolnego punktu,
// (3) przy krawedzi ekranu otwiera sie 8 zapadni 3 x 3 (przedmioty na nich spadaja i znikaja, gracze nie moga tam wejsc),
// (4) z zapadni naraz wychodzi extra fala o budzecie waveBudget(n) * budgetMul, (5) po wybiciu zapadnie znikaja,
// wszyscy wstaja (jak na poczatku przerwy) i przerwa biegnie dalej. W walce przerwa nie chroni przed powaleniem
// (world.eventCombat).

function freeTileNear(world, tx, ty) {
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (world.grid.inside(x, y) && !world.grid.isOccupied(x, y)) return [x, y];
      }
    }
  }
  return [tx, ty];
}

function pitTilesOf(pit, size) {
  const h = Math.floor(size / 2);
  const out = [];
  for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) out.push([pit.tx + dx, pit.ty + dy]);
  return out;
}

// Zapadnie otwieraja sie przy KRAWEDZI EKRANU, nie pod nogami: ekran ma stale 560 x 315 px (render.js), czyli
// 35 x 20 kafelkow, a w tej fazie wszyscy stoja w punkcie spotkania, wiec kamera kazdego gracza patrzy na to samo.
// Dlatego elipsa `pitDistX` x `pitDistY`, nie kolo - przy kole zapadnie z gory i z dolu wyjechalyby poza ekran.
// Zapadnia przy brzegu mapy jest DOSUWANA do srodka, nie pomijana: osiem zapadni ma byc zawsze.
function openPits(world, ev, kc) {
  const { tilePx } = world.rules;
  const { tilesW, tilesH } = world.rules.balance.map;
  const size = kc.pitSize ?? 3;
  const h = Math.floor(size / 2);
  const mtx = tileOf(ev.meet.x, tilePx);
  const mty = tileOf(ev.meet.y, tilePx);
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const rx = kc.pitDistX ?? 15;
  const ry = kc.pitDistY ?? 8;
  const clamp = (v, max) => Math.max(h, Math.min(max - 1 - h, v));
  const pits = [];
  const tiles = new Set();
  const overlaps = (tx, ty) => pitTilesOf({ tx, ty }, size).some(([x, y]) => tiles.has(`${x},${y}`));
  for (const [dx, dy] of dirs) {
    const bx = Math.round(mtx + dx * rx);
    const by = Math.round(mty + dy * ry);
    const cx = clamp(bx, tilesW);
    const cy = clamp(by, tilesH);
    let tx = cx;
    let ty = cy;
    // W rogu mapy dosuniecie potrafi nalozyc dwie zapadnie na siebie: odsuwamy styczna do kierunku
    // (czyli wzdluz krawedzi ekranu), nigdy w strone graczy. Liczymy od pozycji JUZ dosunietej - liczone
    // od surowej, zapadnia z rogu mapy wpadalaby po dosunieciu wciaz w to samo miejsce.
    for (let k = 1; k <= 4 && overlaps(tx, ty); k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * size;
      tx = clamp(cx - dy * off, tilesW);
      ty = clamp(cy + dx * off, tilesH);
    }
    pits.push({ tx, ty });
    for (const [x, y] of pitTilesOf({ tx, ty }, size)) tiles.add(`${x},${y}`);
  }
  // przedmioty na zapadni spadaja: postawione (obrys) i lezace (kafelek)
  let fell = false;
  for (const item of [...world.items.values()]) {
    let hit = false;
    if (item.state === 'placed' || item.state === 'active') hit = footprint(item.kind, item.tx, item.ty, item.rot).some(([x, y]) => tiles.has(`${x},${y}`));
    else if (item.state === 'ground') hit = tiles.has(`${tileOf(item.x, tilePx)},${tileOf(item.y, tilePx)}`);
    if (!hit) continue;
    for (const p of world.players.values()) if (p.held === item.id) p.held = null;
    world.items.delete(item.id);
    world.events.push({ type: 'fall', id: item.id, kind: item.kind, x: item.x, y: item.y });
    fell = true;
  }
  if (fell) rebuildGrid(world);
  world.pits = pits;
  world.pitTiles = tiles;
  ev.pits = pits.length;
  world.events.push({ type: 'pitsOpen', x: ev.meet.x, y: ev.meet.y });
}

function composeExtra(world, kc) {
  const { mobs } = world.rules.balance;
  const n = world.wave;
  const types = Object.keys(mobs).filter((t) => mobs[t].fromWave <= n && !mobs[t].bossEvery);
  let budget = world.rules.waveBudget(n) * (kc.budgetMul ?? 1);
  const queue = [];
  for (let guard = 0; guard < 500; guard++) {
    const fits = types.filter((t) => mobs[t].cost <= budget);
    if (!fits.length) break;
    const t = pickWeighted(world.rng, fits.map((k) => [k, mobs[k].weight]));
    if (!t) break;
    queue.push(t);
    budget -= mobs[t].cost;
  }
  return queue;
}

function spawnFromPits(world, ev) {
  const { tilePx, balance } = world.rules;
  const room = balance.waves.maxAliveMobs - world.mobs.length;
  let n = 0;
  while (ev.queue.length && n < room) {
    const type = ev.queue.shift();
    const pit = world.pits[ev.spawned % world.pits.length];
    const x = (pit.tx + 0.5) * tilePx + (world.rng() - 0.5) * tilePx;
    const y = (pit.ty + 0.5) * tilePx + (world.rng() - 0.5) * tilePx;
    const made = spawnFromQueue(world, type, x, y);
    n += made.length;
    ev.spawned++;
  }
}

registerEvent('quake', {
  fromWave: 4,
  weight: 10,
  emote: '!',
  start(world, ev, kc) {
    const { tilePx } = world.rules;
    const c = centerOf(world);
    const [tx, ty] = freeTileNear(world, tileOf(c.x, tilePx), tileOf(c.y, tilePx));
    ev.meet = { x: (tx + 0.5) * tilePx, y: (ty + 0.5) * tilePx };
    ev.phase = 'shake';
    ev.pullT = 0;
    ev.queue = [];
    ev.spawned = 0;
    ev.pits = 0;
    world.pits = [];
    world.pitTiles = new Set();
    world.events.push({ type: 'quake', x: ev.meet.x, y: ev.meet.y, durS: (kc.shakeS ?? 1) + (kc.pullMaxS ?? 4) });
  },
  update(world, ev, dt, kc) {
    const { tilePx, balance } = world.rules;
    if (ev.phase === 'shake') {
      if (ev.t >= (kc.shakeS ?? 1)) ev.phase = 'pull';
      return false;
    }
    if (ev.phase === 'pull') {
      ev.pullT += dt;
      const step = (kc.pullTiles ?? 6) * tilePx * dt;
      let allIn = true;
      for (const p of world.players.values()) {
        if (p.state === 'dead' || p.suspended) continue;
        const dx = ev.meet.x - p.x;
        const dy = ev.meet.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= tilePx * 0.6) continue;
        allIn = false;
        const s = Math.min(step, d);
        const pos = moveCircle(world.grid, p.x, p.y, balance.player.radiusPx, (dx / d) * s, (dy / d) * s, tilePx);
        p.x = pos.x;
        p.y = pos.y;
        p.angle = Math.atan2(dy, dx);
      }
      if (allIn || ev.pullT >= (kc.pullMaxS ?? 4)) {
        openPits(world, ev, kc);
        if (!world.pits.length) return true; // brak miejsca na zapadnie (teoretyczne): koniec bez walki
        ev.queue = composeExtra(world, kc);
        ev.total = ev.queue.length;
        ev.phase = 'fight';
        ev.fightT = 0;
        world.lock = false;
        world.eventCombat = true;
        spawnFromPits(world, ev);
      }
      return false;
    }
    if (ev.phase === 'fight') {
      ev.fightT += dt;
      if (ev.queue.length) spawnFromPits(world, ev);
      return (ev.queue.length === 0 && world.mobs.length === 0) || ev.fightT >= (kc.fightMaxS ?? 120);
    }
    return true;
  },
  stop(world) {
    world.pits = [];
    world.pitTiles = new Set();
    world.eventCombat = false;
    world.lock = false;
    // jak na poczatku przerwy: powaleni wstaja, martwi wracaja na spawn
    startBreakFor(world);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Przelot ninja (V3-Q-06-04): robi sie ciemno, przez `durS` z czterech krawedzi mapy startuja ninja w trybie `flyby`:
// lecą po prostej przez CALA mape (gora->dol, lewo->prawo, dol->gora, prawo->lewo, naprzemiennie), bez telegrafu,
// ponad scianami, poza pulapkami, i despawnuja za krawedzia. Tory: kazdy zywy gracz dostaje co najmniej
// `perPlayerMin` przelotow przez swoj ekran, reszta losowo. Zabity w locie zostawia drop z szansa `dropChance`.
// Sterowanie NIE jest blokowane (to wydarzenie o uskoku i strzale), przerwa nie chroni przed powaleniem.

const SCREEN_TILES = { w: 35, h: 20 };

function laneFor(world, dir, player, rng) {
  const { tilesW, tilesH, tilePx } = world.rules.balance.map;
  const W = tilesW * tilePx;
  const H = tilesH * tilePx;
  const off = tilePx * 1.5;
  const horizontal = dir === 1 || dir === 3;
  let coord;
  if (player) {
    const span = horizontal ? SCREEN_TILES.h / 2 - 1 : SCREEN_TILES.w / 2 - 1;
    const base = horizontal ? player.y : player.x;
    coord = base + (rng() * 2 - 1) * span * tilePx;
  } else coord = rng() * (horizontal ? H : W);
  coord = Math.max(tilePx, Math.min((horizontal ? H : W) - tilePx, coord));
  if (dir === 0) return { x: coord, y: -off, vx: 0, vy: 1 };
  if (dir === 1) return { x: -off, y: coord, vx: 1, vy: 0 };
  if (dir === 2) return { x: coord, y: H + off, vx: 0, vy: -1 };
  return { x: W + off, y: coord, vx: -1, vy: 0 };
}

function spawnFlyer(world, lane, kc) {
  const type = 'ninja';
  const cfg = world.rules.balance.mobs[type];
  const speed = cfg.charge.speedTiles * world.rules.tilePx;
  const hp = world.rules.mobHp(type, world.wave);
  const mob = {
    id: world.nextId(), type, hp, maxHp: hp, stun: 0, attackCd: 0,
    x: lane.x, y: lane.y, angle: Math.atan2(lane.vy, lane.vx),
    flyby: { vx: lane.vx * speed, vy: lane.vy * speed, hit: new Set() },
    dropChance: kc.dropChance ?? 1,
  };
  world.mobs.push(mob);
  world.events.push({ type: 'ninjaCharge', id: mob.id, x: mob.x, y: mob.y });
  return mob;
}

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

export function updateFlyers(world, dt) {
  const { tilePx, balance } = world.rules;
  const { tilesW, tilesH } = balance.map;
  const W = tilesW * tilePx;
  const H = tilesH * tilePx;
  const margin = tilePx * 2;
  for (const m of [...world.mobs]) {
    const f = m.flyby;
    if (!f) continue;
    const x0 = m.x;
    const y0 = m.y;
    m.x += f.vx * dt;
    m.y += f.vy * dt;
    const reach = balance.mobs[m.type].radiusPx + balance.player.radiusPx;
    for (const p of world.players.values()) {
      if (p.state !== 'alive' || p.suspended || f.hit.has(p.id)) continue;
      if (segDist(p.x, p.y, x0, y0, m.x, m.y) > reach) continue;
      f.hit.add(p.id);
      damagePlayer(world, p, world.rules.mobDamage(m.type), 'mob');
    }
    if (m.x < -margin || m.x > W + margin || m.y < -margin || m.y > H + margin) {
      const i = world.mobs.indexOf(m);
      if (i >= 0) world.mobs.splice(i, 1); // despawn bez smierci: bez trupa, bez dropu, bez kropelek
    }
  }
}

registerEvent('flyby', {
  fromWave: 8,
  weight: 10,
  emote: null,
  start(world, ev, kc) {
    const rng = world.rng;
    const alive = [...world.players.values()].filter((p) => p.state !== 'dead' && !p.suspended);
    const total = Math.max(1, Math.round((kc.base ?? 6) + (kc.perWave ?? 0.5) * world.wave));
    const lanes = [];
    let dir = Math.floor(rng() * 4);
    for (const p of alive) for (let k = 0; k < (kc.perPlayerMin ?? 2); k++) { lanes.push(laneFor(world, dir, p, rng)); dir = (dir + 1) % 4; }
    while (lanes.length < total) { lanes.push(laneFor(world, dir, null, rng)); dir = (dir + 1) % 4; }
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    const durS = kc.durS ?? 12;
    ev.lanes = lanes.map((l, i) => ({ ...l, at: (i / lanes.length) * durS * 0.85 + 0.6 }));
    ev.next = 0;
    ev.phase = 'fly';
    world.lock = false;
    world.eventCombat = true;
    setDark(world, kc.dark ?? { alpha: 0.7, tint: '#050010', radiusTiles: 5 });
  },
  update(world, ev, dt, kc) {
    while (ev.next < ev.lanes.length && ev.lanes[ev.next].at <= ev.t) spawnFlyer(world, ev.lanes[ev.next++], kc);
    updateFlyers(world, dt);
    const flying = world.mobs.some((m) => m.flyby);
    return ev.next >= ev.lanes.length && !flying && ev.t >= (kc.durS ?? 12) * 0.5;
  },
  stop(world) {
    world.mobs = world.mobs.filter((m) => !m.flyby);
    world.eventCombat = false;
    world.lock = false;
    setDark(world, null);
    startBreakFor(world);
  },
});
