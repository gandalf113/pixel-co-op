import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, makeWorld, addMob, placeWall } from './helpers.js';
import { Game } from '../server/game.js';
import { killMob, updateBullets, fireWeapons } from '../server/combat.js';
import { damagePlayer } from '../server/players.js';
import {
  handleAction, updateItems, spawnDrop, rollDrop, onMobKilled, onWaveStart, heldKind,
} from '../server/items.js';

const DT = 1 / 30;
const T = balance.map.tilePx;
const C = (t) => (t + 0.5) * T;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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

function aim(p, tx, ty) {
  p.input = { ...p.input, aimX: C(tx), aimY: C(ty) };
}

const runItems = (w, seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.time += DT;
    updateItems(w, DT);
    each();
  }
};

const PLAYERS = [
  { id: 1, nick: 'Ala', color: 0 },
  { id: 2, nick: 'Bob', color: 1 },
];
const makeGame = (n = 1) => new Game({ balance, difficulty: 2, players: PLAYERS.slice(0, n), seed: 7 });

test('pick up wall then speed 60% and no shooting (I2)', () => {
  const g = makeGame();
  const w = g.world;
  const p = w.players.get(1);
  const it = spawnDrop(w, 'wall', p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  g.action(1, 'e');
  assert.equal(it.state, 'held');
  assert.equal(heldKind(w, p), 'wall');
  assert.ok(near(p.busy, balance.player.pickupAnimS));
  for (let i = 0; i < 10; i++) g.tick(DT);
  const x0 = p.x;
  for (let s = 1; s <= 30; s++) {
    g.queueInput(1, { seq: s, mx: 1, my: 0, aimX: p.x + 50, aimY: p.y, fire: false });
    g.tick(DT);
  }
  const speed = balance.player.speedTiles * T * balance.player.carryHardSpeedMult;
  assert.ok(near(p.x - x0, speed, 0.5));
  p.input = { ...p.input, fire: true };
  fireWeapons(w, DT);
  assert.equal(w.bullets.length, 0);
  assert.equal(it.state, 'held');
});

test('place wall on valid tile blocks player, mobs, bullets (I3)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'wall');
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.equal(it.state, 'placed');
  assert.equal(p.held, null);
  assert.ok(w.grid.isWall(42, 30));
  assert.ok(w.grid.isWall(43, 30));
  assert.equal(w.fieldsDirty, true);
  w.bullets.push({ id: 1, owner: 'p1', fromTurret: false, x: p.x, y: p.y, vx: 300, vy: 0, travelLeft: 200, damage: 10 });
  updateBullets(w, 0.2, { onWallHit: (item, dmg) => { item.hp -= dmg; } });
  assert.equal(it.hp, 140);
});

test('deny placement on mob / 5 tiles away (I4)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'wall');
  addMob(w, 'slime', C(42), C(30));
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.equal(it.state, 'held');
  aim(p, 45, 30);
  handleAction(w, p, 'e');
  assert.equal(it.state, 'held');
  assert.equal(w.events.filter((e) => e.type === 'deny').length, 2);
});

test('rotate wall with r', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'wall');
  handleAction(w, p, 'r');
  assert.equal(it.rot, 1);
  aim(p, 42, 30);
  handleAction(w, p, 'e');
  assert.ok(w.grid.isWall(42, 30));
  assert.ok(w.grid.isWall(42, 31));
  assert.ok(!w.grid.isWall(43, 30));
});

test('throw wall at mob damages 15 and stuns (I5)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'wall');
  const mob = addMob(w, 'slime', C(43), C(30));
  aim(p, 43, 30);
  handleAction(w, p, 'space');
  assert.equal(it.state, 'flying');
  assert.equal(p.held, null);
  runItems(w, 1);
  assert.equal(mob.hp, 30 - 15);
  assert.ok(near(mob.stun, balance.throw.stunS));
  assert.equal(it.state, 'ground');
});

test('pick placed wall back up (I6)', () => {
  const { w, p } = oneWorld();
  const wall = placeWall(w, 41, 30, 0);
  handleAction(w, p, 'e');
  assert.equal(wall.state, 'held');
  assert.equal(p.held, wall.id);
  assert.ok(!w.grid.isWall(41, 30));
});

test('turret active shoots nearest mob and expires after 30 s (I7)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'turret30');
  aim(p, 42, 30);
  handleAction(w, p, 'r');
  assert.equal(it.state, 'active');
  assert.equal(it.owner, 'p1');
  assert.equal(w.grid.isSolid(42, 30), true);
  const far = addMob(w, 'brute', C(48), C(30));
  const close = addMob(w, 'brute', C(42), C(25));
  runItems(w, 0.05);
  assert.equal(w.bullets.length, 1);
  const b = w.bullets[0];
  assert.equal(b.fromTurret, true);
  assert.equal(b.owner, 'p1');
  assert.ok(Math.abs(b.vx) < 1e-6 && b.vy < 0);
  w.mobs = [far, close];
  runItems(w, 29.9);
  assert.equal(w.items.has(it.id), true);
  runItems(w, 0.2);
  assert.equal(w.items.has(it.id), false);
  assert.equal(w.grid.isSolid(42, 30), false);
});

test('e with turret drops it inactive (I8)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'turret30');
  handleAction(w, p, 'e');
  assert.equal(it.state, 'ground');
  assert.equal(p.held, null);
  assert.equal(it.x, p.x);
});

test('thrown turret hits mob for 10 and activates on landing (I9)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'turret30');
  const mob = addMob(w, 'brute', C(43), C(30));
  aim(p, 44, 30);
  handleAction(w, p, 'space');
  runItems(w, 1);
  assert.equal(mob.hp, w.rules.mobHp('brute', 1) - 10);
  assert.equal(mob.stun, 0);
  assert.equal(it.state, 'active');
  assert.equal(it.owner, 'p1');
});

test('thrown turret at limit lands inactive (I9c)', () => {
  const { w, p } = oneWorld();
  for (let i = 0; i < balance.items.turret30.limit; i++) {
    const t = spawnDrop(w, 'turret30', 0, 0);
    Object.assign(t, { state: 'active', tx: 10 + i, ty: 5, timeLeft: 99 });
  }
  const it = give(w, p, 'turret30');
  aim(p, 43, 30);
  handleAction(w, p, 'space');
  runItems(w, 1);
  assert.equal(it.state, 'ground');
});

test('r at turret limit denied', () => {
  const { w, p } = oneWorld();
  for (let i = 0; i < balance.items.turret30.limit; i++) {
    const t = spawnDrop(w, 'turret30', 0, 0);
    Object.assign(t, { state: 'active', tx: 10 + i, ty: 5, timeLeft: 99 });
  }
  const it = give(w, p, 'turret30');
  aim(p, 42, 30);
  handleAction(w, p, 'r');
  assert.equal(it.state, 'held');
  assert.equal(w.events.at(-1).type, 'deny');
});

test('mine arms after 1 s, explodes for 60, player in radius loses 6 (I12, F5)', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'mine');
  aim(p, 41, 30);
  handleAction(w, p, 'r');
  assert.equal(it.state, 'active');
  runItems(w, 0.5);
  const mob = addMob(w, 'brute', C(41), C(30));
  runItems(w, 0.1);
  assert.equal(w.items.has(it.id), true);
  runItems(w, 0.5);
  assert.equal(w.items.has(it.id), false);
  assert.ok(near(mob.hp, w.rules.mobHp('brute', 1) - 60));
  assert.ok(near(p.hp, 100 - 6));
  assert.ok(w.events.some((e) => e.type === 'explode'));
});

test('two players e same item same tick: exactly one holds it (I16)', () => {
  const w = makeWorld({ players: [{ x: C(40), y: C(30) }, { x: C(40) + 4, y: C(30) }] });
  const [a, b] = w.players.values();
  const it = spawnDrop(w, 'wall', C(40) + 2, C(30));
  handleAction(w, a, 'e');
  handleAction(w, b, 'e');
  assert.equal(it.holder, 'p1');
  assert.equal(a.held, it.id);
  assert.equal(b.held, null);
});

test('disconnect with item drops it where player stood (I17)', () => {
  const g = makeGame();
  const w = g.world;
  const p = w.players.get(1);
  const it = spawnDrop(w, 'mine', p.x, p.y);
  g.action(1, 'e');
  assert.equal(it.state, 'held');
  g.suspend(1);
  assert.equal(it.state, 'ground');
  assert.equal(it.x, p.x);
  assert.equal(it.y, p.y);
  assert.equal(p.held, null);
});

test('downed drops held item', () => {
  const { w, p } = oneWorld();
  const it = give(w, p, 'wall');
  damagePlayer(w, p, 1000, 'mob');
  assert.equal(p.state, 'downed');
  assert.equal(it.state, 'ground');
  assert.equal(p.held, null);
});

test('actions ignored while busy', () => {
  const { w, p } = oneWorld();
  const it = spawnDrop(w, 'mine', p.x, p.y);
  handleAction(w, p, 'e');
  assert.ok(p.busy > 0);
  handleAction(w, p, 'e');
  assert.equal(it.state, 'held');
});

test('swap picks the other item', () => {
  const { w, p } = oneWorld();
  const a = give(w, p, 'mine');
  const b = spawnDrop(w, 'turret30', p.x + 4, p.y);
  b.x = p.x + 4;
  handleAction(w, p, 'e');
  assert.equal(p.held, b.id);
  assert.equal(b.state, 'held');
  assert.equal(a.state, 'ground');
  assert.equal(a.x, p.x);
});

test('drop roll categories', () => {
  const { w } = oneWorld();
  w.rules = { ...w.rules, dropChance: () => 1 };
  const n = { wall: 0, turret30: 0, mine: 0 };
  for (let i = 0; i < 10000; i++) n[rollDrop(w, 'slime')]++;
  assert.ok(n.wall / 10000 >= 0.53 && n.wall / 10000 <= 0.57, String(n.wall));
  assert.ok(Math.abs(n.turret30 - n.mine) < 300);
});

test('wave 1 guarantees a wall', () => {
  const { w } = oneWorld();
  w.rules = { ...w.rules, dropChance: () => 0 };
  w.waveComplete = () => w.mobs.length === 0;
  onWaveStart(w);
  const mobs = [addMob(w, 'slime', 100, 100), addMob(w, 'slime', 200, 100)];
  killMob(w, mobs[0], null);
  assert.equal(w.items.size, 0);
  killMob(w, mobs[1], null);
  assert.equal([...w.items.values()].filter((i) => i.kind === 'wall').length, 1);
});

test('wave 1 guarantee wired in Game', () => {
  const g = makeGame();
  g.world.rules = { ...g.world.rules, dropChance: () => 0 };
  for (let i = 0; i < 30 * 16; i++) g.tick(DT);
  assert.equal(g.phase, 'wave');
  for (let i = 0; i < 30 * 120 && g.phase === 'wave'; i++) {
    g.tick(DT);
    [...g.world.mobs].forEach((m) => killMob(g.world, m, null));
  }
  assert.equal(g.phase, 'break');
  assert.equal([...g.world.items.values()].filter((i) => i.kind === 'wall').length, 1);
});

test('no guarantee once a hard item dropped this wave', () => {
  const { w } = oneWorld();
  onWaveStart(w);
  w.waveComplete = () => w.mobs.length === 0;
  w.rules = { ...w.rules, dropChance: () => 1 };
  w.rng = () => 0;
  onMobKilled(w, addMob(w, 'slime', 100, 100), null);
  assert.equal(w.waveHardDrops, 1);
  w.rules = { ...w.rules, dropChance: () => 0 };
  w.mobs = [];
  onMobKilled(w, { type: 'slime', x: 100, y: 100 }, null);
  assert.equal(w.items.size, 1);
});

test('ground item limit 200 removes oldest', () => {
  const { w } = oneWorld();
  const first = spawnDrop(w, 'mine', 100, 100);
  for (let i = 0; i < balance.drops.groundLimit; i++) {
    w.time += 1;
    spawnDrop(w, 'mine', 100, 100);
  }
  assert.equal(w.items.size, balance.drops.groundLimit);
  assert.equal(w.items.has(first.id), false);
});

test('fire after throw does not shoot until released', () => {
  const g = makeGame();
  const w = g.world;
  const p = w.players.get(1);
  const it = spawnDrop(w, 'mine', p.x, p.y);
  g.action(1, 'e');
  for (let i = 0; i < 10; i++) g.tick(DT);
  let seq = 1;
  const send = (fire) => g.queueInput(1, { seq: seq++, mx: 0, my: 0, aimX: p.x + 40, aimY: p.y, fire });
  send(true);
  g.tick(DT);
  assert.equal(it.state, 'flying');
  for (let i = 0; i < 10; i++) { send(true); g.tick(DT); }
  assert.equal(w.bullets.length, 0);
  send(false);
  g.tick(DT);
  send(true);
  g.tick(DT);
  assert.equal(w.bullets.length, 1);
});

test('brute breaks wall in 3 hits (I18)', () => {
  const g = makeGame();
  const w = g.world;
  const p = w.players.get(1);
  p.x = C(40);
  p.y = C(30);
  const walls = [
    placeWall(w, 39, 28, 0), placeWall(w, 41, 28, 0), placeWall(w, 39, 32, 0), placeWall(w, 41, 32, 0),
    placeWall(w, 38, 28, 1), placeWall(w, 38, 30, 1), placeWall(w, 38, 32, 1),
    placeWall(w, 43, 28, 1), placeWall(w, 43, 30, 1), placeWall(w, 43, 32, 1),
  ];
  addMob(w, 'brute', C(40), C(22));
  const hits = new Map(walls.map((x) => [x, 0]));
  const last = new Map(walls.map((x) => [x, x.hp]));
  let broken = null;
  for (let i = 0; i < 30 * 30 && !broken; i++) {
    g.tick(DT);
    for (const x of walls) {
      if (x.hp < last.get(x)) {
        hits.set(x, hits.get(x) + 1);
        last.set(x, x.hp);
      }
      if (!w.items.has(x.id)) broken = x;
    }
  }
  assert.ok(broken);
  assert.equal(hits.get(broken), 3);
  for (const [tx, ty] of [[broken.tx, broken.ty], broken.rot ? [broken.tx, broken.ty + 1] : [broken.tx + 1, broken.ty]]) {
    assert.ok(!w.grid.isWall(tx, ty));
  }
});
