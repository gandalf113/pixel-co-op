import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScale, Camera, VIEW_W, VIEW_H, tileHash } from '../public/client/render.js';

test('computeScale never below 1', () => {
  assert.equal(computeScale(100, 100), 1);
  assert.equal(computeScale(0, 0), 1);
  assert.equal(computeScale(1920, 1080), 1080 / VIEW_H);
});

test('computeScale is fractional and fills the window height at 16:9', () => {
  const s = computeScale(1920, 1080);
  assert.ok(Math.abs(VIEW_H * s - 1080) < 1);
  assert.ok(Math.abs(VIEW_W * s - 1920) < 1);
  assert.ok(Math.abs(VIEW_H * computeScale(2560, 1080) - 1080) < 1);
});

test('computeScale is limited by width in windows narrower than 16:9', () => {
  const s = computeScale(1280, 1024);
  assert.equal(s, 1280 / VIEW_W);
  assert.ok(VIEW_H * s < 1024);
});

test('camera centers the followed point', () => {
  const cam = new Camera();
  cam.follow(100, 100);
  assert.deepEqual(cam.worldToView(100, 100), { x: VIEW_W / 2, y: VIEW_H / 2 });
  assert.deepEqual(cam.worldToView(100, 100), { x: 280, y: 157.5 });
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
