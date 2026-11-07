// Kamikaze (V3-Q-03): podbiega, uzbraja sie, po 0.3 s wybucha; zabity uzbrojony tez wybucha (50%).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, placeWall, balance } from './helpers.js';
import { updateMobs } from '../server/mobs.js';
import { damageMob } from '../server/combat.js';
import { flameAt } from '../server/flames.js';
import { Game } from '../server/game.js';
import { MV } from '../public/shared/mobview.js';

const T = 16;
const c = (t) => (t + 0.5) * T;
const DT = 1 / 30;
const K = balance.mobs.kamikaze;
const hooks = (log = []) => ({ onWallHit: (item, dmg) => { item.hp -= dmg; log.push([item, dmg]); }, onObjectDestroyed() {} });
const run = (w, s, h = hooks()) => { for (let t = 0; t < s - 1e-9; t += DT) updateMobs(w, DT, h); };
const evs = (w, t) => w.events.filter((e) => e.type === t);

test('balance: kamikaze ma lont 0.3 s, zasieg uzbrojenia 1.5 kafelka, promien 2, kropelke i wpis w bestiariuszu', async () => {
  assert.equal(K.kamikaze.fuseS, 0.3);
  assert.equal(K.kamikaze.armTiles, 1.5);
  assert.equal(K.kamikaze.radiusTiles, 2);
  assert.equal(balance.ultimate.droplets.kamikaze, 1);
  const { BESTIARY } = await import('../public/client/content.js');
  assert.ok(BESTIARY.some(([t]) => t === 'kamikaze'));
});

test('podbiega do gracza, uzbraja sie na 1.5 kafelka (zdarzenie armed) i nie bije wrecz', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }] });
  const p = w.players.get('p1');
  const m = addMob(w, 'kamikaze', c(22), c(20));
  run(w, 1.2);
  assert.ok(m.armed > 0 || !w.mobs.includes(m), 'po sekundzie jest uzbrojony albo juz wybuchl');
  const armed = evs(w, 'armed');
  assert.equal(armed.length, 1);
  assert.ok(Math.hypot(armed[0].x - p.x, armed[0].y - p.y) <= K.kamikaze.armTiles * T + balance.player.radiusPx + 6, 'uzbroil sie przy graczu');
  assert.equal(evs(w, 'hurt').filter((e) => e.source === 'mob').length, 0, 'bez ciosu wrecz');
});

test('po 0.3 s od uzbrojenia wybucha: gracz w srodku pelne obrazenia, na krawedzi 50%, daleko nic; zostaje plomien', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }, { x: c(30) + 2 * T - 2, y: c(20) }, { x: c(30) + 4 * T, y: c(20) }] });
  const [a, b, far] = ['p1', 'p2', 'p3'].map((id) => w.players.get(id));
  const m = addMob(w, 'kamikaze', c(30), c(20));
  m.armed = K.kamikaze.fuseS;
  run(w, 0.2);
  assert.ok(w.mobs.includes(m), 'przed koncem lontu zyje');
  assert.equal(a.hp, a.maxHp);
  run(w, 0.2);
  assert.equal(w.mobs.includes(m), false, 'wybuchl');
  const full = w.rules.mobDamage('kamikaze');
  assert.ok(Math.abs((a.maxHp - a.hp) - full) < 1e-6, `srodek: ${a.maxHp - a.hp} vs ${full}`);
  const edgeLost = b.maxHp - b.hp;
  assert.ok(edgeLost > full * 0.45 && edgeLost < full * 0.6, `krawedz: ${edgeLost}`);
  assert.equal(far.hp, far.maxHp);
  assert.equal(evs(w, 'explode').filter((e) => e.foe).length, 1);
  assert.ok(evs(w, 'mobDeath').some((e) => e.id === m.id && e.killer == null));
  assert.ok(flameAt(w, 30, 20), 'plomien na kafelku wybuchu');
});

test('wybuch rani inne potwory i sciany, zabity uzbrojony wybucha na 50%', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  const m = addMob(w, 'kamikaze', c(30), c(20));
  const other = addMob(w, 'brute', c(31), c(20));
  const wall = placeWall(w, 30, 21, 0);
  const wallHp = wall.hp;
  const log = [];
  w.onWallHit = hooks(log).onWallHit;
  m.armed = K.kamikaze.fuseS;
  damageMob(w, m, 9999, 'p1');
  assert.equal(w.mobs.includes(m), false);
  const full = w.rules.mobDamage('kamikaze');
  const lost = balance.mobs.brute.hp - other.hp;
  assert.ok(lost > 0 && lost <= full * 0.5 + 1e-6, `potwor obok: ${lost} (max ${full * 0.5})`);
  assert.ok(wall.hp < wallHp && log.length === 1, 'sciana oberwala przez world.onWallHit');
  assert.equal(evs(w, 'explode').length, 1);
  assert.ok(evs(w, 'mobDeath').some((e) => e.id === m.id && e.killer === 'p1'), 'zabojca zaliczony graczowi');
});

test('zabity PRZED uzbrojeniem nie wybucha', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  const m = addMob(w, 'kamikaze', c(30), c(20));
  damageMob(w, m, 9999, 'p1');
  assert.equal(evs(w, 'explode').length, 0);
});

test('zamrozony uzbrojony i tak wybucha: lontu nie da sie zatrzymac', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }] });
  const m = addMob(w, 'kamikaze', c(30), c(20));
  m.armed = K.kamikaze.fuseS;
  m.frozen = 5;
  run(w, 0.5);
  assert.equal(w.mobs.includes(m), false);
  assert.equal(evs(w, 'explode').length, 1);
});

test('snapshot: uzbrojony ma flage armed = 1 na 13. polu, nieuzbrojony 0', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 3 });
  const me = g.world.players.get(1);
  const m = addMob(g.world, 'kamikaze', me.x + 40, me.y);
  let row = g.snapshot(1).mobs.find((r) => r[MV.id] === m.id);
  assert.equal(row.length, 13);
  assert.equal(row[MV.armed], 0);
  m.armed = 0.3;
  row = g.snapshot(1).mobs.find((r) => r[MV.id] === m.id);
  assert.equal(row[MV.armed], 1);
});

test('Game.tick: kamikaze w grze wybucha i rani gracza przez pelna petle', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 3 });
  const me = g.world.players.get(1);
  const m = addMob(g.world, 'kamikaze', me.x + 3 * T, me.y);
  for (let i = 0; i < 90 && g.world.mobs.includes(m); i++) g.tick(DT);
  assert.equal(g.world.mobs.includes(m), false, 'wybuchl w 3 s');
  assert.ok(me.hp < me.maxHp, 'gracz oberwal');
});
