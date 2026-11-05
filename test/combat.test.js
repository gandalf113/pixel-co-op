import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, placeWall } from './helpers.js';
import { fireWeapons, spawnBullet, updateBullets, killMob } from '../server/combat.js';

const DT = 1 / 30;
const T = 16;
const c = (t) => (t + 0.5) * T;
const noHooks = { onWallHit() {} };
const flush = (world, hooks = noHooks) => {
  for (let i = 0; i < 60 && world.bullets.length > 0; i++) updateBullets(world, DT, hooks);
};
const pistol = (world, owner, x, y, angle, fromTurret = false) => {
  const { damage, speedPx, rangeTiles } = world.rules.balance.pistol;
  return spawnBullet(world, { owner, fromTurret, x, y, angle, damage, speedPx, rangePx: rangeTiles * T });
};
const shoot = (world, p) => {
  p.input.fire = true;
  p.cooldown = 0;
  fireWeapons(world, DT);
  p.input.fire = false;
  flush(world);
};

test('fireWeapons spawns bullet at player edge and sets cooldown', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0 }] });
  const a = w.players.get('p1');
  a.input.fire = true;
  fireWeapons(w, DT);
  assert.equal(w.bullets.length, 1);
  const b = w.bullets[0];
  assert.equal(b.owner, 'p1');
  assert.equal(b.fromTurret, false);
  assert.ok(Math.abs(b.x - (a.x + 6)) < 1e-9);
  assert.ok(Math.abs(b.y - a.y) < 1e-9);
  assert.equal(b.damage, 10);
  assert.equal(a.cooldown, 0.25);
  assert.equal(w.events.filter((e) => e.type === 'shot').length, 1);
  fireWeapons(w, DT);
  assert.equal(w.bullets.length, 1);
});

test('no fire while holding, busy, downed or suspended', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20) }] });
  const a = w.players.get('p1');
  a.input.fire = true;
  for (const patch of [{ held: 5 }, { busy: 0.1 }, { state: 'downed' }, { suspended: true }]) {
    Object.assign(a, { held: null, busy: 0, state: 'alive', suspended: false }, patch);
    fireWeapons(w, DT);
  }
  assert.equal(w.bullets.length, 0);
});

test('ff deals 10% (F1)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0 }, { x: c(23), y: c(20) }] });
  const a = w.players.get('p1');
  const b = w.players.get('p2');
  shoot(w, a);
  assert.ok(Math.abs(b.hp - 99) < 1e-9);
  for (let i = 0; i < 9; i++) shoot(w, a);
  assert.ok(Math.abs(b.hp - 90) < 1e-9);
  assert.equal(b.state, 'alive');
});

test('cannot shoot self (F2)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20) }] });
  const a = w.players.get('p1');
  const bullet = pistol(w, 'p1', a.x - 20, a.y, 0);
  updateBullets(w, DT, noHooks);
  updateBullets(w, DT, noHooks);
  updateBullets(w, DT, noHooks);
  assert.equal(a.hp, 100);
  assert.ok(w.bullets.includes(bullet));
  assert.ok(bullet.x > a.x + 6);
});

test('bullet stops on ally (F3)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0 }, { x: c(22), y: c(20) }] });
  const m = addMob(w, 'slime', c(25), c(20));
  shoot(w, w.players.get('p1'));
  assert.equal(m.hp, m.maxHp);
  assert.ok(w.players.get('p2').hp < 100);
});

test('bullet passes through downed or invulnerable ally', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0 }, { x: c(22), y: c(20), invuln: 1 }] });
  const m = addMob(w, 'slime', c(25), c(20));
  shoot(w, w.players.get('p1'));
  assert.equal(w.players.get('p2').hp, 100);
  assert.equal(m.hp, m.maxHp - 10);
});

test('bullet range 12 tiles', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  const b = pistol(w, 'p1', c(20), c(20), 0);
  const x0 = b.x;
  let lastX = x0;
  for (let i = 0; i < 60 && w.bullets.length > 0; i++) {
    lastX = b.x;
    updateBullets(w, DT, noHooks);
  }
  assert.equal(w.bullets.length, 0);
  assert.ok(b.x - x0 <= 192 + 1e-9);
  assert.ok(lastX - x0 > 192 - 10 - 1e-9);
});

test('bullet leaving map disappears', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  pistol(w, 'p1', 3, c(20), Math.PI);
  updateBullets(w, DT, noHooks);
  assert.equal(w.bullets.length, 0);
});

test('bullet damages wall at full damage', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0 }] });
  const wall = placeWall(w, 25, 20, 1);
  const m = addMob(w, 'slime', c(28), c(20));
  const hits = [];
  pistol(w, 'p1', c(20) + 6, c(20), 0);
  flush(w, { onWallHit: (item, dmg) => hits.push([item, dmg]) });
  assert.deepEqual(hits, [[wall, 10]]);
  assert.equal(m.hp, m.maxHp);
});

test('turret bullet vanishes on wall without damage', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  placeWall(w, 25, 20, 1);
  const hits = [];
  pistol(w, 'p1', c(20), c(20), 0, true);
  flush(w, { onWallHit: () => hits.push(1) });
  assert.equal(hits.length, 0);
  assert.equal(w.bullets.length, 0);
});

test('bullets pass turret tiles', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  w.grid.set(23, 20, 2, 77);
  const m = addMob(w, 'slime', c(26), c(20));
  pistol(w, 'p1', c(20), c(20), 0);
  flush(w);
  assert.equal(m.hp, m.maxHp - 10);
});

test('turret bullet ignores players (F4)', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }, { x: c(22), y: c(20) }] });
  const b = w.players.get('p2');
  const bullet = pistol(w, 'p1', c(20), c(20), 0, true);
  for (let i = 0; i < 6; i++) updateBullets(w, DT, noHooks);
  assert.equal(b.hp, 100);
  assert.ok(w.bullets.includes(bullet));
  assert.ok(bullet.x > b.x + 6);
});

test('fast bullet does not tunnel through mob', () => {
  const w = makeWorld({ players: [{ x: c(5), y: c(5) }] });
  const m = addMob(w, 'runner', c(22), c(20));
  spawnBullet(w, { owner: 'p1', fromTurret: false, x: c(20), y: c(20), angle: 0, damage: 10, speedPx: 3000, rangePx: 192 });
  updateBullets(w, DT, noHooks);
  assert.equal(m.hp, m.maxHp - 10);
  assert.equal(w.bullets.length, 0);
});

const shotsToKill = (difficulty) => {
  const w = makeWorld({ difficulty, players: [{ x: c(20), y: c(20), angle: 0 }] });
  const a = w.players.get('p1');
  addMob(w, 'slime', c(25), c(20));
  let shots = 0;
  while (w.mobs.length > 0 && shots < 20) {
    shoot(w, a);
    shots++;
  }
  return shots;
};

test('slime dies after 3 shots on normal (D2)', () => {
  assert.equal(shotsToKill(2), 3);
});

test('slime dies after 5 shots on hard', () => {
  assert.equal(shotsToKill(3), 5);
});

test('kill credited', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), angle: 0 }] });
  const a = w.players.get('p1');
  const m = addMob(w, 'slime', c(25), c(20));
  for (let i = 0; i < 3; i++) shoot(w, a);
  assert.equal(a.kills, 1);
  const death = w.events.find((e) => e.type === 'mobDeath');
  assert.equal(death.id, m.id);
  assert.equal(death.killer, 'p1');
});

test('killMob without killer removes mob', () => {
  const w = makeWorld({ players: [{}] });
  const m = addMob(w, 'slime', c(25), c(20));
  killMob(w, m, null);
  assert.equal(w.mobs.length, 0);
  assert.equal(w.players.get('p1').kills, 0);
});
