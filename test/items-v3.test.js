import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, makeWorld, addMob } from './helpers.js';
import { damageMob, updateBullets } from '../server/combat.js';
import { updateMobs } from '../server/mobs.js';
import { updatePlayers, damagePlayer } from '../server/players.js';
import { buildGrid, footprint, KIND, itemLimitReached, moveCircle } from '../public/shared/world.js';
import {
  handleAction, updateItems, spawnDrop, rollDrop, onObjectDestroyed,
} from '../server/items.js';

const DT = 1 / 30;
const T = balance.map.tilePx;
const C = (t) => (t + 0.5) * T;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const noHooks = { onObjectDestroyed() {} };

function oneWorld(overrides = {}) {
  const w = makeWorld({ players: [{ x: C(40), y: C(30), ...overrides }] });
  return { w, p: w.players.get('p1') };
}

function give(w, p, kind) {
  const it = spawnDrop(w, kind, p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  p.busy = 0;
  assert.equal(p.held, it.id);
  return it;
}

const aim = (p, tx, ty) => {
  p.input = { ...p.input, aimX: C(tx), aimY: C(ty) };
};

// Jeden tick swiata w kolejnosci z Game.tick (gracze, przedmioty, potwory).
function run(w, seconds, { mobs = true } = {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.time += DT;
    updatePlayers(w, DT);
    updateItems(w, DT);
    if (mobs) updateMobs(w, DT, noHooks);
  }
}

function placeAt(w, p, kind, tx, ty) {
  const it = give(w, p, kind);
  aim(p, tx, ty);
  handleAction(w, p, 'e');
  p.busy = 0;
  return it;
}

// ---- opis zachowan w balance.json ----

test('every item declares a known behavior and a drop weight', () => {
  const known = ['block', 'spikes', 'turret', 'mine', 'platform', 'cage', 'weaponboost', 'permanent'];
  for (const [kind, c] of Object.entries(balance.items)) {
    assert.ok(known.includes(c.behavior), `${kind}: behavior`);
    assert.ok(['hard', 'power'].includes(c.category), `${kind}: category`);
    assert.ok(c.weight > 0, `${kind}: weight`);
    assert.ok(c.name && c.sprite, `${kind}: name/sprite`);
  }
});

test('drop weights and limits match 02-ITEMS.md section 4 and 5', () => {
  const b = balance.items;
  assert.deepEqual(['wall', 'boulder', 'spikes'].map((k) => b[k].weight), [60, 25, 15]);
  assert.deepEqual(['turret30', 'turret60', 'turret90'].map((k) => b[k].weight), [20, 10, 4]);
  assert.deepEqual(['platform30', 'platform60', 'platform90'].map((k) => b[k].weight), [15, 8, 3]);
  assert.equal(b.mine.weight, 20);
  assert.equal(b.cage.weight, 12);
  assert.deepEqual([b.boulder.hp, b.spikes.hp, b.boulder.throwDamage, b.spikes.throwDamage], [400, 80, 30, 20]);
  assert.deepEqual([b.turret30.limit, b.platform30.limit, b.mine.limit, b.cage.limit], [8, 4, 20, 12]);
});

test('every item can be rolled, picked up and placed with no per-kind code', () => {
  const { w } = oneWorld();
  w.rules = { ...w.rules, dropChance: () => 1 };
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(rollDrop(w, 'slime'));
  for (const kind of Object.keys(balance.items)) {
    assert.ok(seen.has(kind), `${kind} nie wypada z losowania`);
    const { w: w2, p } = oneWorld();
    const it = spawnDrop(w2, kind, p.x, p.y);
    it.x = p.x;
    it.y = p.y;
    handleAction(w2, p, 'e');
    assert.equal(it.state, 'held', `${kind}: podnoszenie`);
    p.busy = 0;
    aim(p, 42, 30);
    handleAction(w2, p, 'e');
    assert.equal(p.held, null, `${kind}: postawienie`);
    if (['weaponboost', 'permanent'].includes(balance.items[kind].behavior)) {
      assert.equal(w2.items.has(it.id), false, `${kind}: znika po uzyciu`);
      continue;
    }
    assert.ok(['placed', 'active'].includes(it.state), `${kind}: stan ${it.state}`);
    assert.deepEqual([it.tx, it.ty], [42, 30], `${kind}: kafelek`);
  }
});

// ---- glaz ----

test('boulder: placed, blocks body and bullets, q does not rotate it', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'boulder');
  handleAction(w, p, 'q');
  assert.equal(it.rot, 0);
  w.fieldsDirty = false;
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.equal(it.state, 'placed');
  assert.equal(it.hp, 400);
  assert.equal(w.fieldsDirty, true);
  assert.equal(w.grid.kind(42, 30), KIND.WALL);
  assert.equal(w.grid.isSolid(42, 30), true);
  const moved = moveCircle(w.grid, C(41), C(30), 6, 20, 0, T);
  assert.ok(moved.x <= 42 * T - 6 + 1e-9);
  w.bullets.push({ id: 1, owner: 'p1', fromTurret: false, x: C(41), y: C(30), vx: 450, vy: 0, travelLeft: 200, damage: 8, pierce: 0, passed: null });
  const hits = [];
  updateBullets(w, DT, { onWallHit: (item, dmg) => hits.push([item.id, dmg]) });
  assert.deepEqual(hits, [[it.id, 8]]);
  assert.equal(w.bullets.length, 0);
});

test('boulder thrown: 30 damage, stun, lands as a ground item', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'boulder');
  const mob = addMob(w, 'brute', C(43), C(30));
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  run(w, 1, { mobs: false });
  assert.ok(near(mob.hp, w.rules.mobHp('brute', 1) - 30));
  assert.ok(mob.stun > 0);
  assert.equal(it.state, 'ground');
});

test('destroyed boulder leaves rubble, frees the grid and dirties the flow field', () => {
  const { w, p } = oneWorld();
  const it = placeAt(w, p, 'boulder', 42, 30);
  w.fieldsDirty = false;
  onObjectDestroyed(w, it);
  assert.equal(w.items.has(it.id), false);
  assert.equal(w.grid.isSolid(42, 30), false);
  assert.equal(w.fieldsDirty, true);
  assert.deepEqual(w.gore.rubble.at(-1), ['boulder', 42, 30, 0]);
  assert.equal(w.events.at(-1).type, 'destroyed');
});

// ---- kolce ----

test('spikes: placed with 80 hp, occupy the tile but block neither bodies nor bullets', () => {
  const { w, p } = oneWorld();
  const it = placeAt(w, p, 'spikes', 42, 30);
  assert.equal(it.state, 'placed');
  assert.equal(it.hp, 80);
  assert.equal(w.grid.kind(42, 30), KIND.FLOOR);
  assert.equal(w.grid.isSolid(42, 30), false);
  assert.equal(w.grid.isWall(42, 30), false);
  assert.equal(w.grid.isOccupied(42, 30), true);
  const moved = moveCircle(w.grid, C(41), C(30), 6, 40, 0, T);
  assert.ok(moved.x > 43 * T);
  const mob = addMob(w, 'brute', C(44), C(30));
  w.bullets.push({ id: 1, owner: 'p1', fromTurret: false, x: C(41), y: C(30), vx: 450, vy: 0, travelLeft: 200, damage: 8, pierce: 0, passed: null });
  updateBullets(w, DT, { onWallHit() { assert.fail('kolce nie zatrzymuja pociskow'); } });
  for (let i = 0; i < 10; i++) updateBullets(w, DT, {});
  assert.ok(mob.hp < mob.maxHp);
});

test('spikes: nothing else can be placed on top of them, and q does not rotate', () => {
  const { w, p } = oneWorld();
  placeAt(w, p, 'spikes', 42, 30);
  const wall = give(w, p, 'wall');
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.equal(wall.state, 'held');
  assert.equal(w.events.at(-1).type, 'deny');
});

test('spikes hit a monster standing on them for 8 every 0.5 s', () => {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  placeAt(w, p, 'spikes', 32, 10);
  w.events.length = 0;
  const mob = addMob(w, 'brute', C(32), C(10));
  mob.hp = mob.maxHp = 1000;
  mob.frozen = 99;
  mob.vuln = 1;
  run(w, 1.25, { mobs: false });
  assert.ok(near(mob.hp, 1000 - 3 * 8), String(mob.hp));
  assert.equal(w.events.filter((e) => e.type === 'hit' && e.mob === mob.id).length, 3);
});

test('spikes hurt a player for 10% of that, once per 0.5 s', () => {
  const { w, p } = oneWorld({ x: C(32), y: C(10) });
  placeAt(w, p, 'spikes', 33, 10);
  p.x = C(33);
  run(w, 0.05, { mobs: false });
  assert.ok(near(p.hp, 100 - 0.8), String(p.hp));
  run(w, 0.3, { mobs: false });
  assert.ok(near(p.hp, 100 - 0.8));
  run(w, 0.3, { mobs: false });
  assert.ok(near(p.hp, 100 - 1.6));
});

test('monsters walk over spikes (no detour) and are hurt', () => {
  const { w, p } = oneWorld({ x: C(25), y: C(30) });
  placeAt(w, p, 'spikes', 26, 30);
  p.x = C(20);
  const mob = addMob(w, 'slime', C(32), C(30));
  run(w, 4);
  assert.ok(mob.x < C(24), `mob.x ${mob.x}`);
  assert.ok(mob.hp < mob.maxHp && mob.hp > 0);
});

test('a monster standing on spikes hits them every second attack', () => {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const it = placeAt(w, p, 'spikes', 32, 10);
  p.x = C(32) + 8; // gracz tuz obok: potwor stoi w miejscu (w zasiegu ataku) zamiast isc dalej
  p.hp = p.maxHp = 100000;
  const mob = addMob(w, 'slime', C(32), C(10));
  mob.hp = mob.maxHp = 1000;
  run(w, 1.9);
  assert.equal(it.hp, 80);
  run(w, 0.2);
  assert.ok(near(it.hp, 80 - w.rules.mobObjDamage('slime')), String(it.hp));
  run(w, 2);
  assert.ok(near(it.hp, 80 - 2 * w.rules.mobObjDamage('slime')));
});

test('spikes gnawed to 0 hp are destroyed through the mob hook', () => {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const it = placeAt(w, p, 'spikes', 32, 10);
  it.hp = 1;
  p.x = C(32) + 8;
  const mob = addMob(w, 'slime', C(32), C(10));
  mob.hp = mob.maxHp = 1000;
  const gone = [];
  for (let i = 0; i < 70; i++) updateMobs(w, DT, { onObjectDestroyed: (x) => gone.push(x.id) });
  assert.deepEqual(gone, [it.id]);
});

test('thrown spikes: 20 damage and bleeding 2/s for 3 s', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'spikes');
  const mob = addMob(w, 'brute', C(43), C(30));
  mob.hp = mob.maxHp = 1000;
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  run(w, 0.6, { mobs: false });
  assert.equal(it.state, 'ground');
  assert.ok(near(mob.hp, 980));
  run(w, 3.5);
  assert.ok(near(mob.hp, 980 - 6, 1e-6), String(mob.hp));
  assert.equal(mob.bleedLeft <= 0, true);
});

// ---- dzialka ----

test('turret variants last 30, 60 and 90 s', () => {
  for (const [kind, secs] of [['turret30', 30], ['turret60', 60], ['turret90', 90]]) {
    const { w, p } = oneWorld();
    const it = placeAt(w, p, kind, 42, 30);
    assert.equal(it.state, 'active');
    assert.equal(it.timeLeft, secs);
    run(w, secs - 0.5, { mobs: false });
    assert.equal(w.items.has(it.id), true, `${kind} za wczesnie`);
    run(w, 1, { mobs: false });
    assert.equal(w.items.has(it.id), false, `${kind} za pozno`);
    assert.equal(w.grid.isSolid(42, 30), false);
  }
});

test('turret limit of 8 is shared by 30/60/90', () => {
  const { w, p } = oneWorld();
  const kinds = ['turret30', 'turret60', 'turret90'];
  for (let i = 0; i < 8; i++) {
    const t = spawnDrop(w, kinds[i % 3], 0, 0);
    Object.assign(t, { state: 'active', tx: 10 + i, ty: 5, timeLeft: 99 });
  }
  assert.equal(itemLimitReached(w.items.values(), 'turret90'), true);
  for (const kind of kinds) {
    const it = give(w, p, kind);
    aim(p, 42, 30);
    handleAction(w, p, 'e');
    assert.equal(it.state, 'held', kind);
    assert.equal(w.events.at(-1).type, 'deny');
    w.items.delete(it.id);
    p.held = null;
  }
  const nine = give(w, p, 'turret60');
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  run(w, 1, { mobs: false });
  assert.equal(nine.state, 'ground');
});

// ---- platforma ----

test('platform: 3x3 footprint centred on the aimed tile, 4 shared limit', () => {
  assert.deepEqual(footprint('platform30', 10, 10)[0], [10, 10]);
  const tiles = footprint('platform60', 10, 10);
  assert.equal(tiles.length, 9);
  assert.ok(tiles.every(([x, y]) => x >= 9 && x <= 11 && y >= 9 && y <= 11));
  const { w, p } = oneWorld();
  const kinds = ['platform30', 'platform60', 'platform90', 'platform30'];
  kinds.forEach((k, i) => {
    const t = spawnDrop(w, k, 0, 0);
    Object.assign(t, { state: 'active', tx: 10 + 4 * i, ty: 5, timeLeft: 99 });
  });
  const fifth = give(w, p, 'platform90');
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.equal(fifth.state, 'held');
  assert.equal(w.events.at(-1).type, 'deny');
});

test('platform heals a standing player 5 hp per 0.5 s, does not block, does not heal others', () => {
  const { w, p } = oneWorld({ hp: 50 });
  const it = placeAt(w, p, 'platform30', 41, 30);
  assert.equal(it.timeLeft, 30);
  assert.equal(w.grid.isSolid(40, 30), false);
  assert.equal(w.grid.kind(41, 30), KIND.FLOOR);
  const moved = moveCircle(w.grid, C(39), C(30), 6, 40, 0, T);
  assert.ok(moved.x > 41 * T);
  run(w, 0.6, { mobs: false });
  assert.ok(near(p.hp, 60), String(p.hp));
  p.x = C(46);
  run(w, 1, { mobs: false });
  assert.ok(near(p.hp, 60));
  p.x = C(41);
  p.hp = 98;
  run(w, 0.6, { mobs: false });
  assert.equal(p.hp, p.maxHp);
});

test('platform variants expire after their own time', () => {
  for (const [kind, secs] of [['platform30', 30], ['platform60', 60], ['platform90', 90]]) {
    const { w, p } = oneWorld();
    const it = placeAt(w, p, kind, 42, 30);
    run(w, secs - 0.5, { mobs: false });
    assert.equal(w.items.has(it.id), true, kind);
    run(w, 1, { mobs: false });
    assert.equal(w.items.has(it.id), false, kind);
    assert.equal(w.grid.isOccupied(42, 30), false);
  }
});

test('monsters ignore the platform: no attack, no detour', () => {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const it = placeAt(w, p, 'platform90', 32, 10);
  const mob = addMob(w, 'brute', C(32), C(10));
  mob.hp = mob.maxHp = 1000;
  w.events.length = 0;
  run(w, 5);
  assert.equal(w.items.has(it.id), true);
  assert.equal(it.hp, 0);
  assert.equal(w.events.some((e) => e.type === 'objHit'), false);
});

test('a downed player on the platform gets up after 2 s without an ally', () => {
  const { w, p } = oneWorld({ x: C(41), y: C(30) });
  placeAt(w, p, 'platform30', 41, 30);
  damagePlayer(w, p, 999, 'mob');
  assert.equal(p.state, 'downed');
  run(w, 1.8, { mobs: false });
  assert.equal(p.state, 'downed');
  run(w, 0.4, { mobs: false });
  assert.equal(p.state, 'alive');
  assert.equal(p.hp > 0, true);
});

test('a downed player off the platform still needs an ally (3 s, none here)', () => {
  const { w, p } = oneWorld({ x: C(41), y: C(30) });
  placeAt(w, p, 'platform30', 41, 30);
  damagePlayer(w, p, 999, 'mob');
  p.x = C(50);
  run(w, 2.5, { mobs: false });
  assert.equal(p.state, 'downed');
});

// ---- klatka ----

function caged() {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const it = placeAt(w, p, 'cage', 32, 10);
  return { w, p, it };
}

test('cage catches a monster in its 2 x 2 outline for 8 s and it takes 150%', () => {
  const { w, it } = caged();
  assert.equal(it.state, 'active');
  assert.equal(it.timeLeft, 0);
  run(w, 3);
  assert.equal(it.caught ?? null, null);
  const first = addMob(w, 'brute', C(32), C(10));
  const outside = addMob(w, 'brute', C(34), C(10));
  run(w, 0.1, { mobs: false });
  assert.deepEqual(it.caught, [first.id]);
  assert.ok(first.frozen > 7.5);
  assert.equal(outside.frozen ?? 0, 0);
  const before = first.hp;
  damageMob(w, first, 20, 'p1');
  assert.ok(near(before - first.hp, 30));
});

test('cage holds exactly 8 s and then disappears', () => {
  const { w, p, it } = caged();
  const mob = addMob(w, 'brute', C(32), C(10));
  mob.hp = mob.maxHp = 1000;
  p.x = C(20);
  run(w, 0.1);
  const x0 = mob.x;
  run(w, 7.5);
  assert.equal(w.items.has(it.id), true);
  assert.equal(mob.x, x0);
  run(w, 0.6);
  assert.equal(w.items.has(it.id), false);
  assert.equal(w.events.some((e) => e.type === 'expire' && e.id === it.id), true);
  for (const [x, y] of footprint('cage', 32, 10)) assert.equal(w.grid.isOccupied(x, y), false);
  run(w, 1);
  assert.ok(mob.x < x0, 'potwor znowu idzie');
});

test('cage does not trap a boss and frees its slot when the prisoner dies', () => {
  const { w, it } = caged();
  const type = 'brute';
  balance.mobs[type].immuneCage = true;
  try {
    const boss = addMob(w, type, C(32), C(10));
    run(w, 0.2, { mobs: false });
    assert.equal(it.caught ?? null, null);
    assert.equal(boss.frozen ?? 0, 0);
  } finally {
    delete balance.mobs[type].immuneCage;
  }
  w.mobs.length = 0;
  const slime = addMob(w, 'slime', C(32), C(10));
  run(w, 0.1, { mobs: false });
  assert.deepEqual(it.caught, [slime.id]);
  w.mobs.length = 0;
  run(w, 0.1, { mobs: false });
  assert.equal(w.items.has(it.id), false);
});

test('thrown cage lands on the monster it hit and catches it', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'cage');
  const mob = addMob(w, 'brute', C(43), C(30));
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  run(w, 1, { mobs: false });
  assert.equal(it.state, 'active');
  assert.deepEqual(it.caught, [mob.id]);
});

test('cage limit of 12', () => {
  const { w, p } = oneWorld();
  for (let i = 0; i < 12; i++) {
    const t = spawnDrop(w, 'cage', 0, 0);
    Object.assign(t, { state: 'active', tx: 10 + i, ty: 5 });
  }
  const it = give(w, p, 'cage');
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.equal(it.state, 'held');
});

test('grid rebuild: floor items survive buildGrid from a snapshot-like item list', () => {
  const items = [
    { id: 1, kind: 'spikes', state: 'placed', tx: 5, ty: 5, rot: 0 },
    { id: 2, kind: 'platform30', state: 'active', tx: 20, ty: 20, rot: 0 },
    { id: 3, kind: 'boulder', state: 'placed', tx: 8, ty: 8, rot: 0 },
    { id: 4, kind: 'spikes', state: 'ground', tx: 9, ty: 9, rot: 0 },
  ];
  const g = buildGrid(80, 60, items);
  assert.equal(g.kind(5, 5), KIND.FLOOR);
  assert.equal(g.kind(19, 19), KIND.FLOOR);
  assert.equal(g.kind(21, 21), KIND.FLOOR);
  assert.equal(g.kind(8, 8), KIND.WALL);
  assert.equal(g.kind(9, 9), KIND.EMPTY);
  assert.equal(g.id(20, 20), 2);
});

// ---- V3-D-08: kolce i klatka 2 x 2 ----

const quad = (tx, ty) => [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]];

test('spikes and cage are 2 x 2 in balance.json and occupy four floor tiles', () => {
  for (const kind of ['spikes', 'cage']) assert.deepEqual(balance.items[kind].size, [2, 2]);
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const sp = placeAt(w, p, 'spikes', 32, 10);
  p.x = C(34);
  const cg = placeAt(w, p, 'cage', 36, 10);
  assert.equal(footprint('spikes', 32, 10).length, 4);
  for (const [x, y] of [...quad(32, 10), ...quad(36, 10)]) {
    assert.equal(w.grid.kind(x, y), KIND.FLOOR);
    assert.equal(w.grid.isSolid(x, y), false);
  }
  assert.equal(w.grid.isOccupied(34, 10), false);
  assert.equal(w.grid.id(33, 11), sp.id);
  assert.equal(w.grid.id(37, 11), cg.id);
});

test('spikes free all four tiles when destroyed or expired, and mark the flow field dirty', () => {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const sp = placeAt(w, p, 'spikes', 32, 10);
  w.fieldsDirty = false;
  onObjectDestroyed(w, sp);
  assert.equal(w.fieldsDirty, true);
  for (const [x, y] of quad(32, 10)) assert.equal(w.grid.isOccupied(x, y), false);
  const cg = placeAt(w, p, 'cage', 32, 10);
  for (const [x, y] of quad(32, 10)) assert.equal(w.grid.isOccupied(x, y), true);
  cg.caught = [];
  cg.timeLeft = 0.01;
  w.fieldsDirty = false;
  run(w, 0.1, { mobs: false });
  assert.equal(w.items.has(cg.id), false);
  assert.equal(w.fieldsDirty, true);
  for (const [x, y] of quad(32, 10)) assert.equal(w.grid.isOccupied(x, y), false);
});

test('cage triggered from any of its four tiles catches every monster in the outline (three monsters)', () => {
  for (const [mx, my] of quad(32, 10)) {
    const { w, it } = caged();
    const a = addMob(w, 'brute', C(mx), C(my));
    const b = addMob(w, 'brute', C(32), C(11));
    const c = addMob(w, 'brute', C(33), C(10));
    const out = addMob(w, 'brute', C(34), C(10));
    run(w, 0.1, { mobs: false });
    assert.equal(new Set(it.caught).size, new Set([a.id, b.id, c.id]).size === 3 && it.caught.includes(a.id) ? it.caught.length : -1);
    for (const m of [a, b, c]) {
      assert.ok(it.caught.includes(m.id));
      assert.ok(m.frozen > 7.5);
      assert.equal(m.vuln, 1.5);
    }
    assert.equal(it.caught.includes(out.id), false);
    assert.equal(out.frozen ?? 0, 0);
    assert.equal(w.events.filter((e) => e.type === 'trap').length, 3);
  }
});

test('cage with several prisoners frees its slot only when all are gone', () => {
  const { w, it } = caged();
  const a = addMob(w, 'slime', C(32), C(10));
  addMob(w, 'slime', C(33), C(11));
  run(w, 0.1, { mobs: false });
  assert.equal(it.caught.length, 2);
  w.mobs.splice(w.mobs.indexOf(a), 1);
  run(w, 0.1, { mobs: false });
  assert.equal(w.items.has(it.id), true);
  w.mobs.length = 0;
  run(w, 0.1, { mobs: false });
  assert.equal(w.items.has(it.id), false);
});

test('spikes hurt every monster on any of the four tiles every 0.5 s', () => {
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  placeAt(w, p, 'spikes', 32, 10);
  const mobs = quad(32, 10).map(([x, y]) => {
    const m = addMob(w, 'brute', C(x), C(y));
    m.hp = m.maxHp = 1000;
    m.frozen = 99;
    m.vuln = 1;
    return m;
  });
  const out = addMob(w, 'brute', C(34), C(10));
  out.hp = out.maxHp = 1000;
  out.frozen = 99;
  run(w, 1.25, { mobs: false });
  for (const m of mobs) assert.ok(near(m.hp, 1000 - 3 * 8), String(m.hp));
  assert.equal(out.hp, 1000);
});

test('spikes: a player on them takes 10% once per tick, not once per tile', () => {
  const { w, p } = oneWorld({ x: C(32), y: C(10) });
  placeAt(w, p, 'spikes', 33, 10);
  p.x = (34) * T; // stoi na styku czterech kafelkow, ale w jednym z nich
  p.y = 11 * T - 1;
  run(w, 0.05, { mobs: false });
  assert.ok(near(p.hp, 100 - 0.8), String(p.hp));
  run(w, 0.3, { mobs: false });
  assert.ok(near(p.hp, 100 - 0.8));
});

test('placement: a 2 x 2 item needs four free tiles, and the ghost shows it', async () => {
  const { placeTarget } = await import('../public/shared/world.js');
  const { w, p } = oneWorld({ x: C(30), y: C(10) });
  const wall = placeAt(w, p, 'wall', 33, 11);
  assert.equal(wall.state, 'placed');
  for (const kind of ['spikes', 'cage']) {
    const t = placeTarget({
      grid: w.grid, kind, playerX: p.x, playerY: p.y, aimX: C(32), aimY: C(10), circles: [], tilePx: T, maxRangeTiles: 6, limitReached: false,
    });
    assert.equal(t.valid, false, `${kind}: jeden zajety kafelek z czterech`);
    const ok = placeTarget({
      grid: w.grid, kind, playerX: p.x, playerY: p.y, aimX: C(32), aimY: C(14), circles: [], tilePx: T, maxRangeTiles: 6, limitReached: false,
    });
    assert.equal(ok.valid, true, kind);
    const held = give(w, p, kind);
    aim(p, 32, 10);
    handleAction(w, p, 'e');
    assert.equal(held.state, 'held', `${kind}: odmowa stawiania`);
    w.items.delete(held.id);
    p.held = null;
  }
});

test('thrown cage lands only where all four tiles fit', () => {
  const { w, p } = oneWorld();
  // zajmij kafelek (44,30) scianka, wiec 2 x 2 nie moze miec go w obrysie
  placeAt(w, p, 'wall', 44, 30);
  const it = give(w, p, 'cage');
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  run(w, 1, { mobs: false });
  assert.equal(it.state, 'active');
  for (const [x, y] of footprint('cage', it.tx, it.ty)) {
    assert.equal(w.grid.id(x, y), it.id);
    assert.notEqual(w.grid.kind(x, y), KIND.WALL);
  }
  assert.equal(footprint('cage', it.tx, it.ty).length, 4);
});

test('thrown cage lands on the hit monster\'s tile and catches it', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'cage');
  const mob = addMob(w, 'brute', C(43), C(30));
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  run(w, 1, { mobs: false });
  assert.equal(it.state, 'active');
  assert.ok(footprint('cage', it.tx, it.ty).some(([x, y]) => x === 43 && y === 30));
  assert.deepEqual(it.caught, [mob.id]);
});
