import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Predictor, SnapshotBuffer, lerpEntities } from '../public/client/predict.js';
import { buildGrid } from '../public/shared/world.js';
import { stepPlayer, playerSpeedPx } from '../public/shared/movement.js';
import { balance } from './helpers.js';

const grid = buildGrid(balance.map.tilesW, balance.map.tilesH, []);
const ctx = { grid, heldKind: null, canMove: true };
const dt = 1 / balance.tickHz;
const step = (pos, n) => {
  for (let i = 0; i < n; i++) pos = stepPlayer(pos, { mx: 1, my: 0 }, dt, playerSpeedPx(balance, null), grid, balance);
  return pos;
};

function fiveInputs() {
  const pr = new Predictor(balance);
  pr.reconcile({ x: 100, y: 100 }, 0, ctx);
  for (let seq = 1; seq <= 5; seq++) pr.apply({ seq, mx: 1, my: 0 }, ctx);
  return pr;
}

test('prediction replays pending inputs', () => {
  const pr = fiveInputs();
  assert.deepEqual(pr.pos, step({ x: 100, y: 100 }, 5));
  const server = step({ x: 100, y: 100 }, 2);
  const pos = pr.reconcile(server, 2, ctx);
  const expected = step(server, 3);
  assert.ok(Math.abs(pos.x - expected.x) < 1e-9);
  assert.equal(pos.y, expected.y);
});

test('reconcile drops acked', () => {
  const pr = fiveInputs();
  pr.reconcile({ x: 50, y: 60 }, 5, ctx);
  assert.equal(pr.pending.length, 0);
  assert.deepEqual(pr.pos, { x: 50, y: 60 });
});

test('cannot move uses server pos', () => {
  const pr = fiveInputs();
  const pos = pr.reconcile({ x: 70, y: 80 }, 2, { ...ctx, canMove: false });
  assert.deepEqual(pos, { x: 70, y: 80 });
  assert.deepEqual(pr.apply({ seq: 6, mx: 1, my: 0 }, { ...ctx, canMove: false }), { x: 70, y: 80 });
});

test('buffer interpolates', () => {
  const buf = new SnapshotBuffer();
  buf.push({ x: 0 }, 0);
  buf.push({ x: 10 }, 50);
  const s = buf.sample(125);
  assert.equal(s.a.x, 0);
  assert.equal(s.b.x, 10);
  assert.ok(Math.abs(s.alpha - 0.5) < 1e-9);
  assert.equal(buf.sample(0).alpha, 0);
  assert.equal(buf.sample(10_000).b.x, 10);
  assert.equal(new SnapshotBuffer().sample(0), null);
});

test('angle lerps shortest arc', () => {
  const key = { id: 'id', x: 'x', y: 'y', angle: 'angle' };
  const [p] = lerpEntities([{ id: 1, x: 0, y: 0, angle: 3.1 }], [{ id: 1, x: 10, y: 0, angle: -3.1 }], 0.5, key);
  assert.ok(Math.abs(Math.abs(p.angle) - Math.PI) < 0.01);
  assert.equal(p.x, 5);
});

test('array entities lerp by index and new ones appear as-is', () => {
  const key = { id: 0, x: 2, y: 3 };
  const out = lerpEntities([[1, 'slime', 0, 0]], [[1, 'slime', 10, 20], [2, 'runner', 5, 5]], 0.5, key);
  assert.deepEqual(out, [[1, 'slime', 5, 10], [2, 'runner', 5, 5]]);
});
