import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob } from './helpers.js';
import { killMob } from '../server/combat.js';
import { updateUltimate, useUltimate } from '../server/ultimate.js';
import { updateItems } from '../server/items.js';

const T = 16;
const c = (t) => (t + 0.5) * T;
const run = (w, s) => { for (let t = 0; t < s; t += 1 / 30) updateUltimate(w, 1 / 30); };

test('droplet picked by one player charges everyone (UL1) and expires out of magnet range (UL3)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20) }, { x: c(70), y: c(55) }] });
  killMob(w, addMob(w, 'slime', c(21), c(20)), 'p1');
  killMob(w, addMob(w, 'slime', c(45), c(5)), 'p1');
  run(w, 1);
  assert.equal(w.players.get('p1').ult, 5);
  assert.equal(w.players.get('p2').ult, 5);
  run(w, 30);
  assert.equal(w.droplets.length, 0);
});

test('F below tier I is denied, at tier resets only own bar (UL4, UL5)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), ultKind: 'heal', ult: 99 }, { ult: 150 }] });
  const a = w.players.get('p1');
  useUltimate(w, a);
  assert.equal(a.ult, 99);
  assert.ok(w.events.some((e) => e.type === 'ultDeny'));
  a.ult = 100;
  useUltimate(w, a);
  assert.equal(a.ult, 0);
  assert.equal(w.players.get('p2').ult, 150);
});

test('shockwave III kills slimes, ally unharmed (UL6)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), ultKind: 'shockwave', ult: 300 }, { x: c(22), y: c(20) }] });
  for (let i = 0; i < 5; i++) addMob(w, 'slime', c(23 + i), c(22));
  useUltimate(w, w.players.get('p1'));
  assert.equal(w.mobs.length, 0);
  assert.equal(w.players.get('p2').hp, 100);
});

test('emergency wall I places 3 walls that expire after 30 s (UL7)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0, ultKind: 'wall', ult: 100 }] });
  useUltimate(w, w.players.get('p1'));
  const walls = [...w.items.values()].filter((i) => i.kind === 'wall' && i.state === 'placed');
  assert.equal(walls.length, 3);
  for (let t = 0; t < 30.1; t += 1 / 30) updateItems(w, 1 / 30);
  assert.equal(w.items.size, 0);
});

test('freeze II stops mobs and they take 150% damage (UL11)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), ultKind: 'freeze', ult: 200 }] });
  const m = addMob(w, 'brute', c(25), c(20));
  useUltimate(w, w.players.get('p1'));
  assert.equal(m.frozen, 5);
  assert.equal(m.vuln, 1.5);
});

test('magnet pulls droplet from 8 tiles, ignores it at 10 (UL2)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20) }] });
  w.droplets.push({ id: 1, x: c(28), y: c(20), age: 0 }, { id: 2, x: c(30), y: c(20), age: 0 });
  run(w, 0.5);
  assert.ok(w.droplets[0].x < c(28) && w.droplets[0].x > c(23));
  run(w, 2);
  assert.deepEqual(w.droplets.map((d) => d.id), [2]);
  assert.equal(w.droplets[0].x, c(30));
});

test('rocket I: 140 dmg in full radius, stuns mobs 0.5 s, no falloff at the edge (V3-Q-07)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), ultKind: 'rocket', ult: 100, angle: 0 }] });
  const brute = addMob(w, 'brute', c(26), c(20));
  const edge = addMob(w, 'slime', c(26), c(22));
  useUltimate(w, w.players.get('p1'));
  run(w, 1);
  assert.equal(w.rockets.length, 0);
  assert.equal(brute.hp, 10);
  assert.ok(brute.stun > 0 && brute.stun <= 0.5);
  assert.ok(!w.mobs.includes(edge));
});

// Dwa ultimate na gracza (V3-Q-08): slot 1 = F, slot 2 = C, jeden wspolny pasek.
test('dwa sloty: C uzywa drugiego ultimate, oba zeruja ten sam pasek', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), ultKind: 'heal', ultKind2: 'freeze', ult: 200, hp: 10 }] });
  const p = w.players.get('p1');
  const m = addMob(w, 'brute', c(25), c(20));
  useUltimate(w, p, 2);
  assert.equal(m.frozen, 5, 'slot 2 = zamrozenie');
  assert.equal(p.ult, 0, 'wspolny pasek wyzerowany');
  assert.ok(w.events.some((e) => e.type === 'ult' && e.kind === 'freeze' && e.slot === 2));
  p.ult = 100;
  useUltimate(w, p, 1);
  assert.ok(p.hp > 10, 'slot 1 = leczenie');
  assert.equal(p.ult, 0);
});

test('pusty slot 2: C nic nie robi i nie zeruje paska', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), ultKind: 'heal', ult: 150 }] });
  const p = w.players.get('p1');
  useUltimate(w, p, 2);
  assert.equal(p.ult, 150);
  assert.equal(w.events.length, 0);
});
