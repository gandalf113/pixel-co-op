import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShotPredictor } from '../public/client/shotpred.js';
import { Grid, KIND } from '../public/shared/world.js';
import { balance } from './helpers.js';

const dt = 1 / balance.tickHz;
const me0 = (o = {}) => ({ ammo: 30, reloadLeft: 0, weaponLv: 1, weaponMod: null, held: null, busy: 0, state: 'alive', suspended: false, frenzyLeft: 0, ...o });
const mk = (o) => { const sp = new ShotPredictor(balance); const me = me0(o); sp.syncFromSnapshot(me); return { sp, me }; };
const ctx = (me, extra = {}) => ({ me, fire: true, angle: 0, x: 100, y: 100, grid: null, ...extra });
const open = () => new Grid(balance.map.tilesW, balance.map.tilesH);

test('duch powstaje w tym samym ticku', () => {
  const { sp, me } = mk();
  const g = sp.tick(dt, ctx(me));
  assert.equal(g.length, 1);
  assert.equal(sp.bullets().length, 1);
  assert.equal(typeof sp.bullets()[0][0], 'string');
  assert.equal(sp.bullets()[0].length, 3);
});

test('odstep miedzy strzalami zgodny z fireIntervalS', () => {
  const { sp, me } = mk();
  let shots = 0;
  const T = 3;
  for (let t = 0; t < T; t += dt) shots += sp.tick(dt, ctx(me)).length;
  assert.ok(Math.abs(shots - T / balance.rifle.fireIntervalS) <= 2, `shots=${shots}`);
});

test('brak ducha: przeladowanie, przedmiot, busy, martwy, suspended, pusty, brak fire', () => {
  const cases = [{ reloadLeft: 1 }, { held: 5 }, { busy: 0.5 }, { state: 'dead' }, { suspended: true }, { ammo: 0 }];
  for (const o of cases) {
    const { sp, me } = mk(o);
    assert.equal(sp.tick(dt, ctx(me)).length, 0, JSON.stringify(o));
  }
  const { sp, me } = mk();
  assert.equal(sp.tick(dt, ctx(me, { fire: false })).length, 0);
});

test('onShotEvent kasuje najstarsza grupe', () => {
  const { sp, me } = mk();
  sp.setRtt(400);
  sp.tick(dt, ctx(me));
  for (let i = 0; i < 5; i++) sp.step(dt, null);
  for (let i = 0; i < 5; i++) sp.tick(dt, ctx(me, { fire: false }));
  sp.tick(dt, ctx(me));
  assert.equal(sp.ghosts.length, 2);
  const second = sp.ghosts[1].id;
  sp.onShotEvent({ type: 'shot', id: 'p1' });
  assert.equal(sp.ghosts.length, 1);
  assert.equal(sp.ghosts[0].id, second);
});

test('zdarzenie z opoznieniem: duch zyje az prawdziwy pocisk stanie sie widoczny', () => {
  const { sp, me } = mk();
  sp.setRtt(60, 120);
  sp.tick(dt, ctx(me));
  assert.equal(sp.bullets().length, 1);
  // Opoznienie interpolacji: po zdarzeniu duch ma jeszcze zyc, inaczej na ekranie powstaje dziura.
  sp.onShotEvent({ type: 'shot', id: 'p1' }, 120);
  assert.equal(sp.bullets().length, 1);
  for (let t = 0; t < 0.1; t += dt) sp.step(dt, null);
  assert.equal(sp.bullets().length, 1, 'duch zyje przez caly czas opoznienia');
  for (let t = 0; t < 0.04; t += dt) sp.step(dt, null);
  assert.equal(sp.bullets().length, 0, 'po uplywie opoznienia duch znika');
});

test('drugie zdarzenie skazuje kolejna grupe, nie te sama', () => {
  const { sp, me } = mk();
  sp.setRtt(400); // dlugi czas zycia, zeby pierwszy duch dotrwal do drugiego strzalu
  sp.tick(dt, ctx(me));
  for (let i = 0; i < 5; i++) sp.step(dt, null);
  for (let i = 0; i < 5; i++) sp.tick(dt, ctx(me, { fire: false }));
  sp.tick(dt, ctx(me));
  assert.equal(sp.ghosts.length, 2);
  const groups = sp.ghosts.map((g) => g.group);
  sp.onShotEvent({ type: 'shot' }, 100);
  sp.onShotEvent({ type: 'shot' }, 100);
  assert.deepEqual(sp.ghosts.map((g) => g.group), groups, 'obie grupy jeszcze zyja');
  assert.ok(sp.ghosts.every((g) => g.killIn != null), 'obie sa skazane, kazda osobnym zdarzeniem');
});

test('duch znika po maxAgeMs bez zdarzenia', () => {
  const { sp, me } = mk();
  sp.setRtt(50);
  sp.tick(dt, ctx(me));
  const max = sp.maxAgeMs;
  assert.ok(max >= 60 && max <= 500);
  for (let t = 0; t < max / 1000 - dt; t += dt) sp.step(dt, null);
  assert.equal(sp.bullets().length, 1);
  for (let i = 0; i < 5; i++) sp.step(dt, null);
  assert.equal(sp.bullets().length, 0);
  // Gorny limit 500 ms: duch musi dozyc do RTT + opoznienia interpolacji (do 150 ms), inaczej miedzy
  // duchem a prawdziwym pociskiem robi sie dziura.
  sp.setRtt(5000, 150);
  assert.equal(sp.maxAgeMs, 500);
});

test('wachlarz daje mod.count duchow jednej grupy', () => {
  const { sp, me } = mk({ weaponMod: 'fan' });
  const g = sp.tick(dt, ctx(me));
  assert.equal(g.length, balance.weaponMods.fan.count);
  assert.equal(new Set(g.map((x) => x.group)).size, 1);
  const span = (balance.weaponMods.fan.spreadDeg * Math.PI) / 180;
  assert.ok(Math.abs(g[0].angle + span / 2) < 1e-9);
  sp.onShotEvent({ type: 'shot' });
  assert.equal(sp.bullets().length, 0);
});

test('gwozdziarka: krotka z lenPx i wlasny interwal', () => {
  const { sp, me } = mk({ weaponMod: 'nailgun' });
  const g = sp.tick(dt, ctx(me));
  assert.equal(g.length, 1);
  const t = sp.bullets()[0];
  assert.equal(t.length, 5);
  assert.equal(t[4], balance.weaponMods.nailgun.lenPx);
  assert.ok(Math.abs(sp.cooldown - (balance.weaponMods.nailgun.fireIntervalS - dt)) < 1e-9);
});

test('szal przeslania modyfikator', () => {
  const { sp, me } = mk({ weaponMod: 'fan', frenzyLeft: 5 });
  assert.equal(sp.tick(dt, ctx(me)).length, 1);
});

test('syncFromSnapshot przyjmuje serwerowe ammo i reloadLeft', () => {
  const { sp, me } = mk();
  sp.tick(dt, ctx(me));
  assert.equal(sp.ammo, 29);
  sp.syncFromSnapshot(me0({ ammo: 12, reloadLeft: 0.4 }));
  assert.equal(sp.ammo, 12);
  assert.equal(sp.reloadLeft, 0.4);
});

test('ostatni naboj uruchamia lokalne przeladowanie', () => {
  const { sp, me } = mk({ ammo: 1 });
  assert.equal(sp.tick(dt, ctx(me)).length, 1);
  assert.ok(sp.reloadLeft > 0);
  assert.equal(sp.tick(dt, ctx(me)).length, 0);
});

test('duch ginie na scianie', () => {
  const grid = open();
  const tp = balance.map.tilePx;
  grid.set(10, 5, KIND.WALL, 1);
  const { sp, me } = mk();
  sp.tick(dt, ctx(me, { x: 5 * tp, y: 5.5 * tp }));
  let n = 0;
  while (sp.ghosts.length && n++ < 200) { sp.ghosts[0].ageMs = 0; sp.step(dt, grid); if (sp.ghosts[0]) assert.ok(sp.ghosts[0].x < 10 * tp); }
  assert.equal(sp.ghosts.length, 0);
});

test('duch ginie po przebyciu zasiegu', () => {
  const grid = open();
  const tp = balance.map.tilePx;
  const { sp, me } = mk();
  sp.tick(dt, ctx(me, { x: 2 * tp, y: 5.5 * tp }));
  const g = sp.ghosts[0];
  let dist = 0;
  let n = 0;
  while (sp.ghosts.length && n++ < 500) { g.ageMs = 0; const x0 = g.x; sp.step(dt, grid); dist += g.x - x0; }
  assert.equal(sp.ghosts.length, 0);
  assert.ok(dist <= balance.rifle.rangeTiles * tp + 1);
  assert.ok(dist >= balance.rifle.rangeTiles * tp - balance.rifle.speedPx * dt - 1);
});

test('reset czysci wszystko', () => {
  const { sp, me } = mk();
  sp.tick(dt, ctx(me));
  sp.reset();
  assert.equal(sp.bullets().length, 0);
  assert.equal(sp.cooldown, 0);
});
