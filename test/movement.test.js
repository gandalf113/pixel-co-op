import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from '../server/balance.js';
import { Grid } from '../public/shared/world.js';
import { playerSpeedPx, stepPlayer } from '../public/shared/movement.js';

const b = loadBalance();

test('diagonal not faster', () => {
  for (const [mx, my] of [[1, 1], [1, 0]]) {
    const g = new Grid(80, 60);
    const start = { x: 100, y: 100 };
    let p = start;
    for (let i = 0; i < 30; i++) p = stepPlayer(p, { mx, my }, 1 / 30, playerSpeedPx(b, null), g, b);
    assert.ok(Math.abs(Math.hypot(p.x - start.x, p.y - start.y) - 80) < 0.01);
  }
});

test('carry hard object slows to 60%', () => {
  assert.equal(playerSpeedPx(b, 'wall'), 48);
  assert.equal(playerSpeedPx(b, 'mine'), 80);
  assert.equal(playerSpeedPx(b, null), 80);
});
