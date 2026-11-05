import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScale, Camera, VIEW_W, VIEW_H, tileHash } from '../public/client/render.js';

test('computeScale never below 1', () => {
  assert.equal(computeScale(100, 100), 1);
  assert.equal(computeScale(0, 0), 1);
  assert.equal(computeScale(1920, 1080), 4);
  assert.equal(computeScale(1440, 900), 3);
});

test('camera centers the followed point', () => {
  const cam = new Camera();
  cam.follow(100, 100);
  assert.deepEqual(cam.worldToView(100, 100), { x: VIEW_W / 2, y: VIEW_H / 2 });
  assert.deepEqual(cam.worldToView(100, 100), { x: 240, y: 135 });
});

test('camera round-trips view and world', () => {
  const cam = new Camera();
  cam.follow(-37.5, 812.25);
  for (const [x, y] of [[0, 0], [123.4, -56.7], [1280, 960]]) {
    const v = cam.worldToView(x, y);
    const w = cam.viewToWorld(v.x, v.y);
    assert.ok(Math.abs(w.x - x) < 1e-9 && Math.abs(w.y - y) < 1e-9);
  }
});

test('tile hash is deterministic and spreads variants', () => {
  assert.equal(tileHash(3, 7), tileHash(3, 7));
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(tileHash(i, i * 3) % 3);
  assert.equal(seen.size, 3);
});
