import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance, makeRules } from '../server/balance.js';
import { makeRng } from '../server/rng.js';
import { composeWave, spawnPoints, SpawnDirector } from '../server/waves.js';

const b = loadBalance();
const rules = makeRules(b, 2, 1);
const cost = (comp) => comp.reduce((s, t) => s + b.mobs[t].cost, 0);

test('wave 1 only slimes within budget', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const comp = composeWave(rules, 1, makeRng(seed));
    assert.ok(comp.every((t) => t === 'slime'));
    assert.ok(cost(comp) <= 17 && cost(comp) > 16);
  }
});

test('wave 2 unlocks runners', () => {
  let runners = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const comp = composeWave(rules, 2, makeRng(seed));
    assert.ok(!comp.includes('brute'));
    if (comp.includes('runner')) runners++;
  }
  assert.ok(runners > 0);
});

test('brute guaranteed from wave 4', () => {
  for (let seed = 1; seed <= 20; seed++) {
    assert.ok(composeWave(rules, 4, makeRng(seed)).includes('brute'));
  }
});

test('wave 5 has full budget (no boss)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = cost(composeWave(rules, 5, makeRng(seed)));
    assert.ok(c > 51 - 1.5 && c <= 51);
  }
});

test('batch size and interval', () => {
  const d = new SpawnDirector(rules, 1, composeWave(rules, 1, makeRng(1)), makeRng(2));
  assert.equal(d.pending, 17);
  assert.equal(d.update(0, 0, []).length, 3);
  assert.deepEqual(d.update(3.9, 3, []), []);
  assert.equal(d.update(0.1, 3, []).length, 3);
  assert.equal(d.pending, 11);
  assert.equal(d.done, false);
});

test('alive cap 60', () => {
  const d = new SpawnDirector(rules, 1, Array(100).fill('slime'), makeRng(1));
  assert.equal(d.update(0, 59, []).length, 1);
  assert.equal(d.pending, 99);
  assert.equal(d.update(4, 60, []).length, 0);
  assert.equal(d.pending, 99);
});

test('spawn away from players', () => {
  const pts = spawnPoints(rules);
  const player = { x: pts[0].x, y: pts[0].y };
  const d = new SpawnDirector(rules, 1, Array(150).fill('slime'), makeRng(5));
  let batches = 0;
  for (let i = 0; i < 50; i++) {
    for (const m of d.update(4, 0, [player])) {
      assert.ok(Math.hypot(m.x - player.x, m.y - player.y) > 280 - 4 * Math.SQRT2);
    }
    batches++;
  }
  assert.equal(batches, 50);
  assert.equal(d.done, true);
});

test('spawn points on perimeter', () => {
  const pts = spawnPoints(rules);
  const { tilesW, tilesH, tilePx } = b.map;
  assert.equal(pts.length, 12);
  for (const p of pts) {
    const tx = Math.floor(p.x / tilePx), ty = Math.floor(p.y / tilePx);
    assert.ok(tx === 0 || ty === 0 || tx === tilesW - 1 || ty === tilesH - 1);
    assert.equal(p.x, tx * tilePx + tilePx / 2);
    assert.equal(p.y, ty * tilePx + tilePx / 2);
  }
});
