import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { createPlayer, updatePlayers, damagePlayer, startBreakFor, allDown, setDropHeld } from '../server/players.js';

const DT = 1 / 30;
const run = (world, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) updatePlayers(world, DT);
};
const first = (w) => w.players.get('p1');

test('createPlayer spawns at map center offset by index', () => {
  const w = makeWorld({ players: [{}] });
  const p = createPlayer({ id: 'x', nick: 'n', color: 1 }, w.rules, 3);
  assert.equal(p.x, 640 + 1.5 * 16);
  assert.equal(p.y, 480);
  assert.equal(p.hp, 100);
  assert.equal(p.maxHp, 100);
  assert.equal(p.input.aimX, p.x + 1);
  assert.equal(p.input.aimY, p.y);
});

test('ff floors at 1 in break', () => {
  const w = makeWorld({ players: [{ hp: 5 }] });
  w.phase = 'break';
  damagePlayer(w, first(w), 10, 'ff');
  assert.equal(first(w).hp, 1);
  assert.equal(first(w).state, 'alive');
});

test('down at 0 hp in wave', () => {
  const w = makeWorld({ players: [{ hp: 5 }] });
  damagePlayer(w, first(w), 10, 'mob');
  const p = first(w);
  assert.equal(p.state, 'downed');
  assert.equal(p.hp, 0);
  assert.equal(p.deathLeft, 10);
  assert.equal(p.reviveProgress, 0);
  assert.ok(w.events.some((e) => e.type === 'down'));
});

test('down drops held item through hook', () => {
  const calls = [];
  setDropHeld((world, player) => calls.push(player.id));
  const w = makeWorld({ players: [{ hp: 5, held: 7 }] });
  damagePlayer(w, first(w), 10, 'mob');
  setDropHeld(() => {});
  assert.deepEqual(calls, ['p1']);
});

test('revive after 3 s by ally', () => {
  const w = makeWorld({ players: [{ state: 'downed', hp: 0, deathLeft: 10 }, {}] });
  const [a, b] = [...w.players.values()];
  b.x = a.x + 10;
  b.y = a.y;
  run(w, 3);
  assert.equal(a.state, 'alive');
  assert.equal(a.hp, 30);
  assert.ok(Math.abs(a.invuln - 1) < 1e-6);
  assert.ok(w.events.some((e) => e.type === 'revive'));
});

test('revive progress decays without ally', () => {
  const w = makeWorld({ players: [{ state: 'downed', hp: 0, deathLeft: 10 }, {}] });
  const [a, b] = [...w.players.values()];
  b.x = a.x + 10;
  b.y = a.y;
  run(w, 1.5);
  assert.ok(a.reviveProgress > 1.4);
  b.x = a.x + 500;
  run(w, 1.5);
  assert.equal(a.state, 'downed');
  assert.equal(a.reviveProgress, 0);
});

test('suspended or downed ally does not revive', () => {
  const w = makeWorld({ players: [{ state: 'downed', hp: 0, deathLeft: 10 }, { suspended: true, suspendLeft: 30 }, { state: 'downed', hp: 0, deathLeft: 10 }] });
  const [a, b, c] = [...w.players.values()];
  b.x = c.x = a.x + 10;
  b.y = c.y = a.y;
  run(w, 4);
  assert.equal(a.state, 'downed');
  assert.equal(a.reviveProgress, 0);
});

test('death after downed time', () => {
  const w = makeWorld({ difficulty: 4, players: [{ hp: 5 }] });
  damagePlayer(w, first(w), 10, 'mob');
  run(w, 5);
  assert.equal(first(w).state, 'dead');
  assert.ok(w.events.some((e) => e.type === 'death'));
});

test('invulnerable ignores damage', () => {
  const w = makeWorld({ players: [{ invuln: 0.5 }] });
  damagePlayer(w, first(w), 10, 'mob');
  assert.equal(first(w).hp, 100);
});

test('suspended takes no damage', () => {
  const w = makeWorld({ players: [{ suspended: true, suspendLeft: 30 }] });
  damagePlayer(w, first(w), 10, 'mob');
  assert.equal(first(w).hp, 100);
});

test('regen only in break', () => {
  const w = makeWorld({ players: [{ hp: 50 }] });
  w.phase = 'break';
  run(w, 25);
  assert.ok(Math.abs(first(w).hp - 100) < 1e-6);
  const v = makeWorld({ players: [{ hp: 50 }] });
  run(v, 5);
  assert.equal(first(v).hp, 50);
});

test('suspended player does not regen', () => {
  const w = makeWorld({ players: [{ hp: 50, suspended: true, suspendLeft: 30 }] });
  w.phase = 'break';
  run(w, 5);
  assert.equal(first(w).hp, 50);
  assert.ok(first(w).suspendLeft < 30);
});

test('startBreakFor stands downed with 30 and respawns dead with 50', () => {
  const w = makeWorld({ players: [{ state: 'downed', hp: 0, deathLeft: 4, ready: true }, { state: 'dead', hp: 0, x: 10, y: 10, ready: true }] });
  startBreakFor(w);
  const [a, b] = [...w.players.values()];
  assert.equal(a.state, 'alive');
  assert.equal(a.hp, 30);
  assert.equal(a.invuln, 1);
  assert.equal(b.state, 'alive');
  assert.equal(b.hp, 50);
  assert.equal(b.x, 640 + (1 - 1.5) * 16);
  assert.equal(b.y, 480);
  assert.equal(a.ready, false);
  assert.equal(b.ready, false);
});

const pushMove = (p, n) => {
  for (let i = 0; i < n; i++) p.inputQueue.push({ seq: i + 1, mx: 1, my: 0, aimX: p.x + 1, aimY: p.y, fire: false });
};

test('alive player moves and acks seq', () => {
  const w = makeWorld({ players: [{}] });
  const p = first(w);
  const x0 = p.x;
  pushMove(p, 3);
  run(w, 3 * DT);
  assert.ok(p.x > x0);
  assert.equal(p.ackSeq, 3);
  assert.equal(p.inputQueue.length, 0);
});

test('downed cannot move', () => {
  const w = makeWorld({ players: [{ state: 'downed', hp: 0, deathLeft: 10 }] });
  const p = first(w);
  const x0 = p.x;
  pushMove(p, 5);
  run(w, 5 * DT);
  assert.equal(p.x, x0);
  assert.equal(p.ackSeq, 5);
});

test('busy blocks movement', () => {
  const w = makeWorld({ players: [{ busy: 0.2 }] });
  const p = first(w);
  const x0 = p.x;
  pushMove(p, 6);
  run(w, 5 * DT);
  assert.equal(p.x, x0);
});

test('allDown counts suspended', () => {
  const w = makeWorld({ players: [{ state: 'downed' }, { suspended: true }] });
  assert.equal(allDown(w), true);
  first(w).state = 'alive';
  assert.equal(allDown(w), false);
  assert.equal(allDown(makeWorld()), false);
});
