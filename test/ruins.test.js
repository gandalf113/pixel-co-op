import test from 'node:test';
import assert from 'node:assert/strict';
import { balance } from './helpers.js';
import { Game } from '../server/game.js';
import { handleAction, spawnDrop } from '../server/items.js';
import { footprint, tileOf } from '../public/shared/world.js';

const cfg = balance.ruins;
const tilePx = balance.map.tilePx;
const PLAYERS = [
  { id: 1, nick: 'Ala', color: 0 },
  { id: 2, nick: 'Bob', color: 1 },
  { id: 3, nick: 'Cez', color: 2 },
  { id: 4, nick: 'Dan', color: 3 },
];
const makeGame = (seed = 7, n = 4) => new Game({ balance, difficulty: 2, players: PLAYERS.slice(0, n), seed });
const ruinsOf = (g) => [...g.world.items.values()].filter((i) => i.kind === 'wall' && i.state === 'placed');
const gap = (a, b) => Math.min(...a.flatMap(([ax, ay]) => b.map(([bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) - 1)));
const stateOf = (r) => { const f = r.hp / r.maxHp; return f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3; };
const layout = (g) => ruinsOf(g).map((r) => [r.tx, r.ty, r.rot, r.hp]);

test('new game has 7 placed walls in the 4-9 tile ring, full maxHp, no expiry', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const g = makeGame(seed);
    const rs = ruinsOf(g);
    assert.equal(rs.length, cfg.count);
    for (const r of rs) {
      const t = footprint('wall', r.tx, r.ty, r.rot);
      const mx = t.reduce((s, [x]) => s + x + 0.5, 0) / 2;
      const my = t.reduce((s, [, y]) => s + y + 0.5, 0) / 2;
      const d = Math.hypot(mx - balance.map.tilesW / 2, my - balance.map.tilesH / 2);
      assert.ok(d >= cfg.minRadiusTiles && d <= cfg.maxRadiusTiles, `seed ${seed}: ring ${d}`);
      assert.equal(r.maxHp, balance.items.wall.hp);
      assert.ok(r.hp > 0 && r.hp <= r.maxHp);
      assert.equal(r.expireLeft, undefined);
      assert.ok(t.every(([x, y]) => g.world.grid.isSolid(x, y)));
    }
  }
});

test('ruins keep the gaps from spawn points and from each other', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const g = makeGame(seed);
    const rs = ruinsOf(g).map((r) => footprint('wall', r.tx, r.ty, r.rot));
    const spawns = [...g.world.players.values()].map((p) => [tileOf(p.x, tilePx), tileOf(p.y, tilePx)]);
    rs.forEach((t, i) => {
      assert.ok(gap(t, spawns) >= cfg.minSpawnGapTiles, `seed ${seed}: spawn gap`);
      for (let j = i + 1; j < rs.length; j++) assert.ok(gap(t, rs[j]) >= cfg.minGapTiles, `seed ${seed}: ruin gap`);
    });
  }
});

test('at least 2 different damaged states among the ruins', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const states = new Set(ruinsOf(makeGame(seed)).map(stateOf));
    states.delete(0);
    assert.ok(states.size >= cfg.minDamagedStates, `seed ${seed}: ${[...states]}`);
  }
});

test('same seed gives same layout, different seed a different one', () => {
  assert.deepEqual(layout(makeGame(5)), layout(makeGame(5)));
  assert.notDeepEqual(layout(makeGame(5)), layout(makeGame(6)));
  assert.deepEqual(layout(makeGame(5, 1)), layout(makeGame(5, 1)));
});

test('ruins survive the ground limit and cannot be picked up', () => {
  const g = makeGame(11, 1);
  const before = layout(g);
  const w = g.world;
  for (let i = 0; i < balance.drops.groundLimit + 20; i++) spawnDrop(w, 'mine', 10, 10);
  assert.deepEqual(layout(g), before);
  const r = ruinsOf(g)[0];
  const p = [...w.players.values()][0];
  p.x = (r.tx + 0.5) * tilePx;
  p.y = (r.ty + 0.5) * tilePx;
  handleAction(w, p, 'e');
  assert.equal(p.held, null);
  assert.equal(r.state, 'placed');
});
