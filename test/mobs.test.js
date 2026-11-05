import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, placeWall } from './helpers.js';
import { updateMobs } from '../server/mobs.js';
import { updatePlayers } from '../server/players.js';

const DT = 1 / 30;
const T = 16;
const c = (t) => (t + 0.5) * T;
const ticks = (s) => Math.round(s / DT);
const run = (world, seconds, hooks = { onObjectDestroyed() {} }) => {
  for (let i = 0; i < ticks(seconds); i++) updateMobs(world, DT, hooks);
};
const first = (w) => w.players.get('p1');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REACH = 6 + 6 + 2;

test('slime walks toward player', () => {
  const w = makeWorld({ players: [{ x: c(25), y: c(30) }] });
  const m = addMob(w, 'slime', c(35), c(30));
  const before = dist(m, first(w));
  run(w, 1);
  assert.ok(Math.abs(before - dist(m, first(w)) - 40) <= 4);
});

test('slime attacks every 1 s', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  addMob(w, 'slime', c(30) + 12, c(30));
  run(w, 2.05);
  assert.equal(first(w).hp, 100 - 3 * 8);
});

test('downed player is not damaged', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30), state: 'downed', hp: 0, deathLeft: 10 }] });
  addMob(w, 'slime', c(30) + 12, c(30));
  for (let i = 0; i < ticks(3); i++) {
    updatePlayers(w, DT);
    updateMobs(w, DT, { onObjectDestroyed() {} });
  }
  const p = first(w);
  assert.ok(Math.abs(p.deathLeft - 7) < 1e-6);
  assert.equal(p.hp, 0);
  assert.equal(p.state, 'downed');
  assert.deepEqual(w.events, []);
});

test('slime targets downed player when no alive player in range', () => {
  const w = makeWorld({ players: [
    { x: c(10), y: c(30), state: 'downed', hp: 0, deathLeft: 100 },
    { x: c(70), y: c(30) },
  ] });
  const m = addMob(w, 'slime', c(20), c(30));
  run(w, 1);
  assert.ok(m.x < c(20) - 30);
});

test('walks around wall', () => {
  const w = makeWorld({ players: [{ x: c(28), y: c(30) }] });
  const walls = [];
  for (let ty = 20; ty <= 32; ty += 2) walls.push(placeWall(w, 25, ty, 1));
  for (let ty = 36; ty <= 38; ty += 2) walls.push(placeWall(w, 25, ty, 1));
  const m = addMob(w, 'slime', c(22), c(30));
  let reached = false;
  for (let i = 0; i < ticks(10) && !reached; i++) {
    updateMobs(w, DT, { onObjectDestroyed() {} });
    reached = dist(m, first(w)) <= REACH;
  }
  assert.ok(reached);
  for (const wall of walls) assert.equal(wall.hp, 150);
});

test('attacks wall when fully enclosed', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  const walls = [
    placeWall(w, 29, 29, 0), placeWall(w, 31, 29, 0),
    placeWall(w, 29, 32, 0), placeWall(w, 31, 32, 0),
    placeWall(w, 29, 30, 1), placeWall(w, 32, 30, 1),
  ];
  addMob(w, 'slime', c(20), c(30));
  let hit = false;
  for (let i = 0; i < ticks(15) && !hit; i++) {
    updateMobs(w, DT, { onObjectDestroyed() {} });
    hit = walls.some((x) => x.hp < 150);
  }
  assert.ok(hit);
});

test('brute attacks wall on path at x2', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  for (const ty of [27, 29, 31]) placeWall(w, 25, ty, 1);
  const target = w.items.get(w.grid.id(25, 30));
  addMob(w, 'brute', c(24), c(30));
  const destroyed = [];
  const hooks = { onObjectDestroyed: (item) => destroyed.push(item) };
  run(w, 2.9, hooks);
  assert.equal(target.hp, 50);
  assert.equal(destroyed.length, 0);
  run(w, 0.6, hooks);
  assert.deepEqual(destroyed, [target]);
  assert.ok(target.hp <= 0);
});

test('slime detours instead of attacking wall at x2', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  const walls = [27, 29, 31].map((ty) => placeWall(w, 25, ty, 1));
  const m = addMob(w, 'slime', c(24), c(30));
  run(w, 1);
  for (const wall of walls) assert.equal(wall.hp, 150);
  assert.notEqual(Math.floor(m.y / T), 30);
});

test('stunned mob neither moves nor attacks', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  const m = addMob(w, 'slime', c(30) + 12, c(30));
  m.stun = 0.5;
  const { x, y } = m;
  run(w, 0.4);
  assert.equal(m.x, x);
  assert.equal(m.y, y);
  assert.equal(first(w).hp, 100);
  assert.ok(m.stun > 0 && m.stun < 0.5);
});

test('mobs separate', () => {
  const w = makeWorld();
  const a = addMob(w, 'slime', c(30), c(30));
  const b = addMob(w, 'slime', c(30), c(30));
  run(w, 0.5);
  assert.ok(dist(a, b) >= 6 + 6 - 1);
});

test('separation does not push mob into wall', () => {
  const w = makeWorld();
  placeWall(w, 31, 30, 1);
  const a = addMob(w, 'slime', c(30) + 2, c(30));
  addMob(w, 'slime', c(30), c(30));
  run(w, 0.5);
  assert.ok(a.x + 6 <= 31 * T + 1e-9);
});

test('fields rebuild when dirty', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  addMob(w, 'slime', c(20), c(30));
  run(w, DT);
  const before = w.mobFields;
  placeWall(w, 10, 10, 0);
  run(w, DT);
  assert.notEqual(w.mobFields, before);
  assert.equal(w.fieldsDirty, false);
});
