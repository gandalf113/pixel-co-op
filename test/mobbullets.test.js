import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, placeWall, balance } from './helpers.js';
import { spawnBullet, updateBullets, updateMobBullets, spawnMobBullet } from '../server/combat.js';
import { updateMobs } from '../server/mobs.js';
import { composeWave } from '../server/waves.js';
import { makeRng } from '../server/rng.js';
import { Game } from '../server/game.js';

const DT = 1 / 30;
const T = 16;
const c = (t) => (t + 0.5) * T;
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hooks = (log = []) => ({ onWallHit: (item, dmg) => { item.hp -= dmg; log.push([item, dmg]); }, onObjectDestroyed() {} });
const flush = (w, h = hooks(), n = 90) => {
  for (let i = 0; i < n && w.mobBullets.length > 0; i++) updateMobBullets(w, DT, h);
};
const barrier = (w, tx) => {
  let first = null;
  for (let ty = 0; ty < balance.map.tilesH; ty += 2) {
    const it = placeWall(w, tx, ty, 1);
    first ??= it;
  }
  return first;
};
const evs = (w, type) => w.events.filter((e) => e.type === type);
const runMobs = (w, s, h = hooks()) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    updateMobs(w, DT, h);
    updateMobBullets(w, DT, h);
  }
};

test('pocisk wroga trafia gracza pelnym obrazeniem (bez friendlyFire) i daje hurt/spit', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }] });
  const p = w.players.get('p1');
  const m = addMob(w, 'spitter', c(24), c(20));
  spawnMobBullet(w, m, p.x, p.y);
  assert.equal(evs(w, 'mobShot').length, 1);
  flush(w);
  assert.ok(near(p.hp, p.maxHp - w.rules.mobDamage('spitter')));
  const hurt = evs(w, 'hurt');
  assert.equal(hurt.length, 1);
  assert.equal(hurt[0].source, 'spit');
  assert.equal(w.mobBullets.length, 0);
  assert.equal(evs(w, 'spitHit').length, 1);
});

test('pocisk wroga nie trafia potworow po drodze', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }] });
  const shooter = addMob(w, 'spitter', c(24), c(20));
  const slime = addMob(w, 'slime', c(27), c(20));
  const hp = slime.hp;
  spawnMobBullet(w, shooter, c(30), c(20));
  flush(w);
  assert.equal(slime.hp, hp);
  assert.ok(w.players.get('p1').hp < w.players.get('p1').maxHp);
});

test('pocisk wroga ginie na scianie gracza i ja uszkadza (objDamage)', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }] });
  const wall = placeWall(w, 27, 19, 1);
  const m = addMob(w, 'spitter', c(22), c(20));
  const log = [];
  spawnMobBullet(w, m, c(30), c(20));
  flush(w, hooks(log));
  assert.equal(w.mobBullets.length, 0);
  assert.equal(log.length, 1);
  assert.equal(log[0][0], wall);
  assert.ok(near(log[0][1], w.rules.mobObjDamage('spitter')));
  const p = w.players.get('p1');
  assert.equal(p.hp, p.maxHp);
});

test('pocisk gracza nie zestrzeliwuje pocisku wroga', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(20) }] });
  const m = addMob(w, 'spitter', c(30), c(20));
  spawnMobBullet(w, m, c(40), c(20));
  const b = spawnBullet(w, { owner: 'p1', fromTurret: false, x: c(36), y: c(20), angle: Math.PI, damage: 8, speedPx: 450, rangePx: 200 });
  const enemy = w.mobBullets[0];
  for (let i = 0; i < 3; i++) {
    updateBullets(w, DT, hooks());
    updateMobBullets(w, DT, hooks());
  }
  assert.ok(w.mobBullets.includes(enemy));
  assert.ok(enemy.x > c(30));
  assert.ok(b.id !== enemy.id);
});

test('Plujka: liczby z MOB-04', () => {
  const s = balance.mobs.spitter;
  assert.deepEqual([s.hp, s.damage, s.objDamage, s.speedTiles, s.fromWave, s.drop, s.cost, s.weight], [40, 12, 6, 2.2, 6, 0.35, 3, 15]);
  assert.deepEqual([s.ranged.projSpeedPx, s.ranged.rangeTiles, s.ranged.intervalS, s.ranged.keepTiles], [160, 7, 2, 5]);
  for (const t of Object.keys(balance.mobs)) assert.ok(balance.ultimate.droplets[t] >= 1, t);
  assert.equal(balance.ultimate.droplets.spitter, 2);
  assert.equal(balance.ultimate.droplets.grenadier, 2);
});

test('Plujka strzela tylko z linia strzalu', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20), invuln: 999 }] });
  barrier(w, 33);
  addMob(w, 'spitter', c(36), c(20));
  runMobs(w, 4);
  assert.equal(evs(w, 'mobShot').length, 0);

  const w2 = makeWorld({ players: [{ x: c(30), y: c(20), invuln: 999 }] });
  addMob(w2, 'spitter', c(36), c(20));
  runMobs(w2, 4);
  assert.ok(evs(w2, 'mobShot').length >= 1);
});

test('Plujka nie strzela poza zasiegiem 7 kafelkow', () => {
  const w = makeWorld({ players: [{ x: c(10), y: c(20), invuln: 999 }] });
  const m = addMob(w, 'spitter', c(30), c(20));
  runMobs(w, 1);
  assert.equal(evs(w, 'mobShot').length, 0);
  assert.ok(m.x < c(30));
});

test('Plujka podchodzi z 8 kafelkow i zatrzymuje sie na ok. 5', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), invuln: 999 }] });
  const m = addMob(w, 'spitter', c(28), c(20));
  runMobs(w, 6);
  const d = dist(m, w.players.get('p1'));
  assert.ok(Math.abs(d - 5 * T) <= 12, `d=${d}`);
});

test('Plujka cofa sie z 2 kafelkow do ok. 5', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), invuln: 999 }] });
  const m = addMob(w, 'spitter', c(22), c(20));
  runMobs(w, 4);
  const d = dist(m, w.players.get('p1'));
  assert.ok(Math.abs(d - 5 * T) <= 12, `d=${d}`);
});

test('Plujka strzela co 2 s', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), invuln: 999 }] });
  addMob(w, 'spitter', c(25), c(20));
  const times = [];
  for (let i = 0; i < Math.round(9 / DT); i++) {
    updateMobs(w, DT, hooks());
    updateMobBullets(w, DT, hooks());
    for (const e of w.events) if (e.type === 'mobShot') times.push(i * DT);
    w.events = [];
  }
  assert.ok(times.length >= 4, String(times.length));
  for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - 2) < 0.1, String(times));
});

test('Plujka atakuje mur na trasie (nie blokuje sie na zawsze)', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(20), invuln: 999 }] });
  barrier(w, 24);
  addMob(w, 'spitter', c(30), c(20));
  runMobs(w, 20);
  assert.ok([...w.items.values()].some((it) => it.hp < balance.items.wall.hp));
});

test('granatnik: AoE, 50% na krawedzi, explode, hard object dostaje obrazenia', () => {
  const w = makeWorld({ players: [
    { x: c(30), y: c(20) },
    { x: c(30) + 24 * 0.98, y: c(20) },
    { x: c(30) + 40, y: c(20) },
  ] });
  const [a, b, far] = ['p1', 'p2', 'p3'].map((id) => w.players.get(id));
  const wall = placeWall(w, 30, 21, 0);
  const m = addMob(w, 'grenadier', c(24), c(20));
  const log = [];
  spawnMobBullet(w, m, a.x, a.y);
  flush(w, hooks(log));
  const full = w.rules.mobDamage('grenadier');
  assert.ok(near(a.hp, a.maxHp - full, 1e-6), String(a.hp));
  assert.ok(b.hp < b.maxHp - full * 0.5 && b.hp > b.maxHp - full * 0.55, String(b.hp));
  assert.equal(far.hp, far.maxHp);
  const ex = evs(w, 'explode');
  assert.equal(ex.length, 1);
  assert.ok(near(ex[0].radiusPx, 24));
  assert.ok(near(ex[0].x, a.x, 1e-6));
  assert.ok(log.some(([it]) => it === wall));
  assert.equal(evs(w, 'hurt').filter((e) => e.source === 'grenade').length, 2);
});

test('granatnik: wybuch nie rani potworow; granat nie zahacza o gracza w locie', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(20) }, { x: c(27), y: c(20) }] });
  const m = addMob(w, 'grenadier', c(23), c(20));
  const slime = addMob(w, 'slime', c(30), c(23));
  const hp = slime.hp;
  spawnMobBullet(w, m, c(30), c(20));
  const g = w.mobBullets[0];
  for (let i = 0; i < 4; i++) updateMobBullets(w, DT, hooks());
  assert.ok(w.mobBullets.includes(g));
  assert.equal(w.players.get('p2').hp, w.players.get('p2').maxHp);
  flush(w);
  assert.equal(slime.hp, hp);
  assert.ok(w.players.get('p2').hp < w.players.get('p2').maxHp || dist(w.players.get('p2'), { x: c(30), y: c(20) }) > 24);
});

test('granat wybucha na scianie, gdy ta jest na drodze', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(20) }] });
  placeWall(w, 30, 19, 1);
  const m = addMob(w, 'grenadier', c(25), c(20));
  spawnMobBullet(w, m, c(40), c(20));
  flush(w);
  const ex = evs(w, 'explode')[0];
  assert.ok(ex.x < c(30) + 1 && ex.x > c(28));
});

test('marker upadku: snapshot niesie punkt i czas do upadku granatu', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 5 });
  const w = g.world;
  const p = w.players.get(1);
  const m = addMob(w, 'grenadier', p.x + 5 * T, p.y);
  spawnMobBullet(w, m, p.x, p.y);
  const s0 = g.snapshot(1).mobBullets[0];
  assert.equal(s0.length, 7);
  assert.equal(s0[3], 1);
  assert.ok(near(s0[4], Math.round(p.x * 10) / 10, 0.11));
  const total = s0[6];
  // Czas lotu liczymy z balansu, zeby strojenie predkosci pocisku nie wywracalo testu.
  const want = (5 * T) / balance.mobs.grenadier.ranged.projSpeedPx;
  assert.ok(Math.abs(total - want) < 0.12, `${total} vs ${want}`);
  updateMobBullets(w, 0.2, hooks());
  assert.ok(g.snapshot(1).mobBullets[0][6] < total - 0.15);
});

test('snapshot: mobBullets to krotki liczb, plwocina bez markera', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 5 });
  assert.deepEqual(g.snapshot(1).mobBullets, []);
  const m = addMob(g.world, 'spitter', 100, 100);
  spawnMobBullet(g.world, m, 200, 100);
  const [row] = g.snapshot(1).mobBullets;
  assert.equal(row.length, 7);
  assert.ok(row.every((v) => typeof v === 'number'));
  assert.equal(row[3], 0);
  assert.ok(g.snapshot(1).bullets.length === 0);
});

test('fale: Plujka od 6, granatnik od 9, budzet nie przekroczony', () => {
  const rules = makeWorld().rules;
  const cost = (comp) => comp.reduce((s, t) => s + balance.mobs[t].cost, 0);
  const seen = (n, type) => {
    let k = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const comp = composeWave(rules, n, makeRng(seed));
      assert.ok(cost(comp) <= rules.waveBudget(n) + 1e-9);
      if (comp.includes(type)) k++;
    }
    return k;
  };
  for (let n = 1; n <= 5; n++) assert.equal(seen(n, 'spitter'), 0, `fala ${n}`);
  assert.ok(seen(6, 'spitter') > 0);
  for (let n = 1; n <= 8; n++) assert.equal(seen(n, 'grenadier'), 0, `fala ${n}`);
  assert.ok(seen(9, 'grenadier') > 0);
});
