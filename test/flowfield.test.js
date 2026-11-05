import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, KIND } from '../public/shared/world.js';
import { buildField, nextStep } from '../server/flowfield.js';

const W = 80;
const H = 60;
const at = (f, x, y) => f[y * W + x];

test('distance on open grid', () => {
  const f = buildField(new Grid(W, H), [[10, 10]], null);
  assert.equal(at(f, 10, 10), 0);
  assert.equal(at(f, 13, 10), 3);
  assert.ok(Math.abs(at(f, 13, 13) - 3 * Math.SQRT2) < 1e-9);
});

test('wall forces detour', () => {
  const g = new Grid(W, H);
  for (let y = 5; y <= 15; y++) g.set(12, y, KIND.WALL, 1);
  const f = buildField(g, [[10, 10]], null);
  assert.ok(at(f, 14, 10) > 4);
  assert.ok(Number.isFinite(at(f, 14, 10)));
});

function enclosed() {
  const g = new Grid(W, H);
  for (let x = 9; x <= 11; x++) for (let y = 9; y <= 11; y++) if (x !== 10 || y !== 10) g.set(x, y, KIND.WALL, 1);
  return g;
}

test('enclosed source unreachable without wallCost', () => {
  const f = buildField(enclosed(), [[10, 10]], null);
  assert.equal(at(f, 20, 10), Infinity);
});

test('siege field passes walls', () => {
  const f = buildField(enclosed(), [[10, 10]], 4);
  assert.ok(Number.isFinite(at(f, 20, 10)));
  assert.equal(at(f, 11, 10), 4);
});

test('out of map is never passable', () => {
  const g = new Grid(5, 5);
  const f = buildField(g, [[0, 0]], 4);
  assert.equal(f.length, 25);
  assert.equal(f[4 * 5 + 4], 4 * Math.SQRT2);
});

test('nextStep descends', () => {
  const g = new Grid(W, H);
  const f = buildField(g, [[10, 10]], null);
  assert.deepEqual(nextStep(f, g, 13, 10), [12, 10]);
  assert.equal(nextStep(f, g, 10, 10), null);
});

test('no corner cutting', () => {
  const g = new Grid(W, H);
  g.set(11, 10, KIND.WALL, 1);
  g.set(10, 11, KIND.WALL, 2);
  const f = buildField(g, [[10, 10]], null);
  assert.ok(at(f, 11, 11) > 2 * Math.SQRT2);
  const s = nextStep(f, g, 11, 11);
  assert.notDeepEqual(s, [10, 10]);
});

test('siege nextStep may cut corners', () => {
  const g = new Grid(W, H);
  g.set(11, 10, KIND.WALL, 1);
  g.set(10, 11, KIND.WALL, 2);
  const f = buildField(g, [[10, 10]], 4);
  assert.deepEqual(nextStep(f, g, 11, 11, 4), [10, 10]);
});
