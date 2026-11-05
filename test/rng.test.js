import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, pickWeighted, randInt } from '../server/rng.js';

test('same seed gives same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  const sa = [1,2,3,4,5].map(() => a()), sb = [1,2,3,4,5].map(() => b());
  assert.deepEqual(sa, sb);
});
test('values are in [0,1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
test('pickWeighted ignores zero weight', () => {
  const r = makeRng(1);
  for (let i = 0; i < 200; i++) assert.equal(pickWeighted(r, [['a', 1], ['b', 0]]), 'a');
});
test('pickWeighted follows weights', () => {
  const r = makeRng(3);
  let a = 0;
  for (let i = 0; i < 10000; i++) if (pickWeighted(r, [['a', 3], ['b', 1]]) === 'a') a++;
  assert.ok(a / 10000 >= 0.73 && a / 10000 <= 0.77);
});
test('randInt is inclusive and bounded', () => {
  const r = makeRng(5);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(randInt(r, 1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});
