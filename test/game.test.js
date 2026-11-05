import test from 'node:test';
import assert from 'node:assert/strict';
import { balance } from './helpers.js';
import { Game } from '../server/game.js';
import { killMob } from '../server/combat.js';

const DT = 1 / 30;
const run = (game, seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.tick(DT);
    each();
  }
};
const PLAYERS = [
  { id: 1, nick: 'Ala', color: 0 },
  { id: 2, nick: 'Bob', color: 1 },
];
const makeGame = (n = 2, difficulty = 2) => new Game({ balance, difficulty, players: PLAYERS.slice(0, n), seed: 7 });
const killAll = (game) => [...game.world.mobs].forEach((m) => killMob(game.world, m, null));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('starts in 15 s break at wave 0', () => {
  const g = makeGame();
  assert.equal(g.phase, 'break');
  assert.equal(g.world.wave, 0);
  assert.equal(g.breakLeft, 15);
  run(g, 14);
  assert.equal(g.phase, 'break');
});

test('wave 1 starts after break and ends when all mobs dead', () => {
  const g = makeGame(1);
  run(g, 15.1);
  assert.equal(g.phase, 'wave');
  assert.equal(g.world.wave, 1);
  let seen = 0;
  for (let i = 0; i < 30 * 120 && g.phase === 'wave'; i++) {
    g.tick(DT);
    seen += g.world.mobs.length;
    killAll(g);
  }
  assert.ok(seen > 0);
  assert.equal(g.phase, 'break');
  assert.equal(g.world.wave, 1);
  assert.equal(g.breakLeft, 26);
});

test('ready shortens to 5 s and can be undone (F9)', () => {
  const g = makeGame();
  run(g, 1);
  const before = g.breakLeft;
  g.action(1, 'g');
  assert.ok(near(g.breakLeft, before));
  g.action(2, 'g');
  assert.ok(g.breakLeft <= 5);
  assert.equal(g.readyLock, true);
  run(g, 2);
  g.action(2, 'g');
  assert.equal(g.readyLock, false);
  assert.ok(near(g.breakLeft, before - 2));
  run(g, 1);
  assert.ok(near(g.breakLeft, before - 3));
});

test('ready countdown starts the wave', () => {
  const g = makeGame();
  g.action(1, 'g');
  g.action(2, 'g');
  run(g, 5.1);
  assert.equal(g.phase, 'wave');
  assert.equal(g.world.wave, 1);
});

test('suspended players do not block ready', () => {
  const g = makeGame();
  g.suspend(2);
  g.action(1, 'g');
  assert.ok(g.breakLeft <= 5);
  assert.equal(g.world.players.get(2).suspendLeft, balance.session.reconnectGraceS);
});

test('game over when all downed (F7)', () => {
  const g = makeGame();
  run(g, 15.1);
  assert.equal(g.phase, 'wave');
  for (const p of g.world.players.values()) {
    p.state = 'downed';
    p.deathLeft = 10;
  }
  g.tick(DT);
  assert.equal(g.phase, 'over');
  const res = g.results();
  assert.equal(res.wave, 1);
  assert.ok(near(res.timeS, g.world.time));
  assert.deepEqual(res.players, [
    { nick: 'Ala', color: 0, kills: 0 },
    { nick: 'Bob', color: 1, kills: 0 },
  ]);
  const t = g.world.time;
  g.tick(DT);
  assert.equal(g.world.time, t);
});

test('removed players stay in results', () => {
  const g = makeGame();
  g.world.players.get(2).kills = 4;
  g.remove(2);
  assert.equal(g.world.players.has(2), false);
  assert.deepEqual(g.results().players.map((p) => [p.nick, p.kills]), [['Ala', 0], ['Bob', 4]]);
});

test('input queue rejects old seq and caps at 4', () => {
  const g = makeGame();
  const p = g.world.players.get(1);
  const input = (seq) => ({ seq, mx: 0, my: 0, aimX: 0, aimY: 0, fire: false });
  g.queueInput(1, input(5));
  g.queueInput(1, input(3));
  g.queueInput(1, input(5));
  assert.deepEqual(p.inputQueue.map((i) => i.seq), [5]);
  for (let s = 6; s <= 10; s++) g.queueInput(1, input(s));
  assert.deepEqual(p.inputQueue.map((i) => i.seq), [7, 8, 9, 10]);
  g.tick(DT);
  assert.equal(p.ackSeq, 7);
  g.queueInput(99, input(1));
});

test('snapshot shape', () => {
  const g = makeGame();
  run(g, 15.1);
  const s = g.snapshot(1);
  for (const k of ['t', 'seed', 'phase', 'wave', 'breakLeft', 'readyLock', 'mobsLeft', 'you', 'players', 'mobs', 'bullets', 'items']) {
    assert.ok(k in s, k);
  }
  assert.equal(s.phase, 'wave');
  assert.equal(s.wave, 1);
  assert.deepEqual(Object.keys(s.you), ['id', 'ackSeq']);
  assert.equal(s.you.id, 1);
  assert.deepEqual(Object.keys(s.players[0]).sort(), [
    'ammo', 'angle', 'busy', 'color', 'deathLeft', 'frenzyLeft', 'held', 'hp', 'id', 'invuln', 'maxHp', 'nick',
    'ready', 'reloadLeft', 'reviveProgress', 'speedMult', 'state', 'suspended', 'ult', 'ultKind', 'weaponLv', 'x', 'y',
  ]);
  assert.ok(s.mobs.length > 0);
  assert.equal(s.mobs[0].length, 9);
  assert.equal(s.mobsLeft, g.world.mobs.length + g.director.pending);
  assert.ok(g.director.pending > 0);
  for (const v of [s.t, s.players[0].x, s.players[0].angle, s.mobs[0][2], s.mobs[0][3]]) {
    assert.ok(near(v * 10, Math.round(v * 10), 1e-6));
  }

  const me = g.world.players.get(1);
  me.input = { ...me.input, aimX: me.x, aimY: me.y - 100, fire: true };
  g.world.items.set(500, { id: 500, kind: 'mine', state: 'active', x: 0, y: 0, tx: 3, ty: 4, rot: 0, hp: 1, timeLeft: 0, armLeft: 0 });
  g.world.items.set(501, { id: 501, kind: 'wall', state: 'held', x: 0, y: 0, hp: 150 });
  g.tick(DT);
  const s2 = g.snapshot(1);
  assert.ok(s2.bullets.length > 0);
  assert.equal(s2.bullets[0].length, 3);
  assert.deepEqual(s2.items.map((i) => i.id), [500]);
  assert.deepEqual(Object.keys(s2.items[0]).sort(), ['armed', 'flight', 'hp', 'id', 'kind', 'maxHp', 'rot', 'state', 'timeLeft', 'tx', 'ty', 'x', 'y']);
  assert.equal(s2.items[0].armed, true);
  assert.equal(s2.items[0].flight, null);
});

test('drainEvents empties the queue', () => {
  const g = makeGame();
  g.world.players.get(1).input.fire = true;
  g.tick(DT);
  assert.ok(g.drainEvents().some((e) => e.type === 'shot'));
  assert.deepEqual(g.drainEvents(), []);
});

test('no input for 10 s does not suspend', () => {
  const g = makeGame();
  const p = g.world.players.get(1);
  const { x, y } = p;
  run(g, 10);
  assert.equal(p.suspended, false);
  assert.equal(p.x, x);
  assert.equal(p.y, y);
});

test('resume clears suspension', () => {
  const g = makeGame();
  const p = g.world.players.get(1);
  g.queueInput(1, { seq: 5, mx: 0, my: 0, aimX: 0, aimY: 0, fire: false });
  g.tick(DT);
  g.suspend(1);
  g.resume(1);
  assert.equal(p.suspended, false);
  g.queueInput(1, { seq: 1, mx: 1, my: 0, aimX: 0, aimY: 0, fire: false });
  assert.equal(p.inputQueue.length, 1);
});
