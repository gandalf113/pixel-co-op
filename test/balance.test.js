import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance, makeRules } from '../server/balance.js';

const b = loadBalance();

test('wave budget base table (normal, 1 player)', () => {
  const r = makeRules(b, 2, 1);
  for (const [n, v] of [[1,17],[2,24],[3,33],[5,51],[8,80],[10,101],[15,158],[20,219]]) assert.equal(r.waveBudget(n), v);
});
test('budget scales with players and difficulty', () => {
  assert.equal(makeRules(b, 2, 4).waveBudget(1), 17 * 1.9);
  assert.equal(makeRules(b, 4, 1).waveBudget(1), 17 * 1.5);
});
test('break lengths (normal)', () => {
  const r = makeRules(b, 2, 2);
  for (const [n, v] of [[0,15],[1,26],[3,38],[5,50],[10,80],[15,110],[17,120],[30,120]]) assert.equal(r.breakLength(n), v);
});
test('break after wave 1 per difficulty (D4)', () => {
  assert.deepEqual([1,2,3,4].map(d => makeRules(b, d, 1).breakLength(1)), [34, 26, 22, 18]);
  assert.equal(makeRules(b, 4, 1).breakLength(0), 15);
});
test('slime HP per difficulty wave 1 (D2)', () => {
  assert.deepEqual([1,2,3,4].map(d => makeRules(b, d, 1).mobHp('slime', 1)), [21, 30, 42, 60]);
});
test('mob HP grows 4% per wave', () => assert.ok(Math.abs(makeRules(b, 2, 1).mobHp('slime', 10) - 40.8) < 1e-9));
test('player HP and downed time per difficulty (D3)', () => {
  assert.deepEqual([1,2,3,4].map(d => makeRules(b, d, 1).playerMaxHp()), [120, 100, 100, 80]);
  assert.deepEqual([1,2,3,4].map(d => makeRules(b, d, 1).downedDeathTime()), [20, 10, 8, 5]);
});
test('mob damage/speed/drop apply difficulty', () => {
  const r = makeRules(b, 4, 1);
  assert.ok(Math.abs(r.mobDamage('slime') - 14.4) < 1e-9);
  assert.ok(Math.abs(r.mobSpeedPx('slime') - 2.5 * 16 * 1.15) < 1e-9);
  assert.ok(Math.abs(r.dropChance('slime') - 0.175) < 1e-9);
});
