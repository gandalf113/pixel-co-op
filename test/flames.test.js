// Plomien (V3-Q-04) i ciemnosc (V3-Q-05): zrodla wrogie, zanik, obrazenia na kafelku, snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, placeWall, balance } from './helpers.js';
import { spawnFlame, igniteBlast, updateFlames, flameAt, setDark } from '../server/flames.js';
import { spawnMobBullet, updateMobBullets } from '../server/combat.js';
import { Game } from '../server/game.js';

const T = 16;
const c = (t) => (t + 0.5) * T;
const DT = 1 / 30;
const F = balance.flames;
const hooks = (log = []) => ({ onWallHit: (item, dmg) => { item.hp -= dmg; log.push([item, dmg]); }, onObjectDestroyed() {} });
const run = (w, s, h = hooks()) => { for (let t = 0; t < s - 1e-9; t += DT) updateFlames(w, DT, h); };

test('balance: plomien ma czas zycia, dps, rytm i limit', () => {
  assert.ok(F.lifeS > 0 && F.dps > 0 && F.tickS > 0 && F.max > 0);
  assert.equal(F.grenade.center, 1);
});

test('plomien gasnie liniowo i znika po lifeS; ten sam kafelek = max sily, nie suma', () => {
  const w = makeWorld();
  const f = spawnFlame(w, 10, 10, 1);
  spawnFlame(w, 10, 10, 0.4);
  assert.equal(w.flames.length, 1);
  assert.equal(f.strength, 1);
  run(w, F.lifeS / 2);
  assert.ok(Math.abs(f.strength - 0.5) < 0.05, String(f.strength));
  run(w, F.lifeS / 2 + 0.1);
  assert.equal(w.flames.length, 0);
  assert.equal(flameAt(w, 10, 10), null);
  assert.equal(spawnFlame(w, -1, 5), null, 'poza mapa nic');
  assert.ok(w.events.some((e) => e.type === 'flame' && e.x === c(10)));
});

test('limit plomieni: ponad max wylatuja najstarsze', () => {
  const w = makeWorld();
  for (let i = 0; i < F.max + 5; i++) spawnFlame(w, i % 70, Math.floor(i / 70) + 1, 1);
  assert.equal(w.flames.length, F.max);
  assert.equal(flameAt(w, 0, 1), null);
});

test('plomien rani gracza, potwora i sciane na kafelku proporcjonalnie do sily; obok nic', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20) }, { x: c(22), y: c(20) }] });
  const [p, q] = ['p1', 'p2'].map((id) => w.players.get(id));
  const m = addMob(w, 'brute', c(20), c(20));
  const far = addMob(w, 'brute', c(25), c(25));
  const wall = placeWall(w, 20, 21, 0);
  const wallHp = wall.hp;
  spawnFlame(w, 20, 20, 1);
  spawnFlame(w, 20, 21, 1);
  const log = [];
  updateFlames(w, F.tickS, hooks(log));
  const perTick = F.dps * F.tickS * (1 - F.tickS / F.lifeS);
  assert.ok(Math.abs((p.maxHp - p.hp) - perTick) < 1e-6, String(p.maxHp - p.hp));
  assert.equal(q.hp, q.maxHp, 'sasiedni kafelek nietkniety');
  assert.ok(Math.abs((balance.mobs.brute.hp - m.hp) - perTick) < 1e-6);
  assert.equal(far.hp, balance.mobs.brute.hp);
  assert.ok(wall.hp < wallHp && log.some(([it]) => it === wall), 'hard object na kafelku tez plonie');
  assert.ok(w.events.some((e) => e.type === 'hurt' && e.source === 'flame'));
});

test('potwor zabity ogniem: smierc bez zabojcy, bez wyjatku', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  const m = addMob(w, 'slime', c(20), c(20));
  spawnFlame(w, 20, 20, 1);
  run(w, 5);
  assert.equal(w.mobs.includes(m), false);
  assert.ok(w.events.some((e) => e.type === 'mobDeath' && e.id === m.id && e.killer == null));
});

test('granat Granatnika zostawia plomien: srodek pelny, czterech sasiadow polowa', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }] });
  const m = addMob(w, 'grenadier', c(24), c(20));
  spawnMobBullet(w, m, c(30), c(20));
  for (let i = 0; i < 90; i++) updateMobBullets(w, DT, hooks());
  assert.ok(w.events.some((e) => e.type === 'explode'));
  const center = flameAt(w, 30, 20);
  assert.ok(center && center.strength > 0.9, 'srodek');
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const f = flameAt(w, 30 + dx, 20 + dy);
    assert.ok(f && f.strength > 0.4 && f.strength <= 0.5, `sasiad ${dx},${dy}`);
  }
  assert.equal(flameAt(w, 31, 21), null, 'naroznik nie');
});

test('igniteBlast bez pierscienia zapala tylko srodek', () => {
  const w = makeWorld();
  igniteBlast(w, c(8), c(8), { center: 0.7, ring: 0 });
  assert.equal(w.flames.length, 1);
  assert.equal(flameAt(w, 8, 8).strength, 0.7);
});

test('snapshot niesie plomienie w zasiegu jako [id, tx, ty, sila] i pole dark', () => {
  const g = new Game({ balance, players: [{ id: 'a', nick: 'A', color: 0 }], difficulty: 2, seed: 1 });
  const w = g.world;
  const me = w.players.get('a');
  const tx = Math.floor(me.x / T);
  const ty = Math.floor(me.y / T);
  spawnFlame(w, tx + 1, ty, 0.8);
  spawnFlame(w, 0, 0, 1); // drugi koniec mapy: poza AOI
  let s = g.snapshot('a');
  assert.deepEqual(s.flames.map((f) => [f[1], f[2], f[3]]), [[tx + 1, ty, 0.8]]);
  assert.equal(s.dark, null);
  setDark(w, { alpha: 0.7, tint: '#200000', radiusTiles: 4 });
  s = g.snapshot('a');
  assert.deepEqual(s.dark, { alpha: 0.7, tint: '#200000', radiusTiles: 4 });
  setDark(w, null);
  assert.equal(g.snapshot('a').dark, null);
});

test('Game.tick wypala plomienie (petla jest wpieta)', () => {
  const g = new Game({ balance, players: [{ id: 'a', nick: 'A', color: 0 }], difficulty: 2, seed: 1 });
  spawnFlame(g.world, 3, 3, 1);
  for (let i = 0; i < 30 * (F.lifeS + 1); i++) g.tick(DT);
  assert.equal(g.world.flames.length, 0);
});
