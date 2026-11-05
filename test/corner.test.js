import test from 'node:test';
import assert from 'node:assert/strict';
import { Grid, moveCircle } from '../public/shared/world.js';

test('circle overlapping map edge cannot drift out of the map', () => {
  const grid = new Grid(80, 60);
  let x = 1276;
  let y = 956;
  for (let i = 0; i < 100; i++) ({ x, y } = moveCircle(grid, x, y, 6, 1, 1, 16));
  assert.ok(x <= 1280 - 6 && y <= 960 - 6, `escaped to ${x},${y}`);
});
