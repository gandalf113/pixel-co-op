import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid, KIND, footprint, buildGrid, moveCircle, segmentBlocked, placementValid, tileOf } from '../public/shared/world.js';

import './helpers.js'; // wczytuje balans i rejestruje definicje przedmiotow (ksztalt to dane)

const T = 16;

test('out of map is solid', () => {
  const g = new Grid(80, 60);
  assert.equal(g.isSolid(-1, 0), true);
  assert.equal(g.isSolid(80, 0), true);
  assert.equal(g.isSolid(5, 5), false);
});

test('wall footprint rotates', () => {
  assert.deepEqual(footprint('wall', 3, 4, 0), [[3, 4], [4, 4]]);
  assert.deepEqual(footprint('wall', 3, 4, 1), [[3, 4], [3, 5]]);
  assert.deepEqual(footprint('mine', 3, 4, 0), [[3, 4]]);
});

test('buildGrid marks placed walls and active turrets only', () => {
  const items = [
    { id: 1, kind: 'wall', state: 'placed', tx: 3, ty: 4, rot: 0 },
    { id: 2, kind: 'turret30', state: 'active', tx: 10, ty: 10, rot: 0 },
    { id: 3, kind: 'wall', state: 'ground', tx: 20, ty: 20, rot: 0 },
    { id: 4, kind: 'mine', state: 'active', tx: 30, ty: 30, rot: 0 },
  ];
  const g = buildGrid(80, 60, items);
  assert.equal(g.kind(3, 4), KIND.WALL);
  assert.equal(g.kind(4, 4), KIND.WALL);
  assert.equal(g.id(4, 4), 1);
  assert.equal(g.kind(10, 10), KIND.TURRET);
  assert.equal(g.kind(20, 20), KIND.EMPTY);
  assert.equal(g.kind(30, 30), KIND.EMPTY);
});

test('moveCircle stops at wall', () => {
  const g = new Grid(80, 60);
  g.set(10, 5, KIND.WALL, 1);
  const p = moveCircle(g, 150, 88, 6, 20, 0, T);
  assert.ok(p.x <= 160 - 6);
  assert.equal(p.y, 88);
});

test('moveCircle stops at map edge', () => {
  const g = new Grid(80, 60);
  assert.equal(moveCircle(g, 8, 100, 6, -50, 0, T).x, 6);
});

test('moveCircle slides along wall', () => {
  const g = new Grid(80, 60);
  g.set(10, 5, KIND.WALL, 1);
  const p = moveCircle(g, 150, 88, 6, 20, 5, T);
  assert.ok(p.x <= 154);
  assert.equal(p.y, 93);
});

test('segmentBlocked through wall', () => {
  const g = new Grid(80, 60);
  g.set(5, 5, KIND.WALL, 1);
  const c = (t) => t * T + T / 2;
  assert.equal(segmentBlocked(g, c(3), c(5), c(7), c(5), T), true);
  assert.equal(segmentBlocked(g, c(3), c(4), c(7), c(4), T), false);
});

test('placementValid', () => {
  const g = new Grid(80, 60);
  const base = {
    grid: g, tiles: [[11, 10]], playerX: 10 * T + 8, playerY: 10 * T + 8,
    circles: [], tilePx: T, maxRangeTiles: 2, limitReached: false,
  };
  assert.equal(placementValid(base), true);
  assert.equal(placementValid({ ...base, tiles: [[13, 10]] }), false);
  assert.equal(placementValid({ ...base, circles: [{ x: 11 * T + 8, y: 10 * T + 8, r: 5 }] }), false);
  assert.equal(placementValid({ ...base, tiles: [[79, 10], [80, 10]], playerX: 79 * T, playerY: 10 * T }), false);
  assert.equal(placementValid({ ...base, limitReached: true }), false);
  g.set(11, 10, KIND.WALL, 1);
  assert.equal(placementValid({ ...base, tiles: [[12, 10]] }), false);
});

test('tileOf floors', () => {
  assert.equal(tileOf(15.9, T), 0);
  assert.equal(tileOf(-0.1, T), -1);
});
