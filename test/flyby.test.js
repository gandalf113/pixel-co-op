// Przelot ninja (V3-Q-06-04): ciemnosc, ninja przez cala mape z czterech krawedzi, despawn, drop po zabiciu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, placeWall, balance } from './helpers.js';
import { startEvent, updateEvent, endEvent } from '../server/events.js';
import { updateMobs } from '../server/mobs.js';
import { updateItems, spawnDrop, placeServer } from '../server/items.js';
import { damageMob } from '../server/combat.js';
import { damagePlayer } from '../server/players.js';

const T = 16;
const c = (t) => (t + 0.5) * T;
const DT = 1 / 30;
const KC = balance.events.kinds.flyby;
const { tilesW, tilesH } = balance.map;
const hooks = { onWallHit() {}, onObjectDestroyed() {} };
const step = (w) => { updateEvent(w, DT); updateMobs(w, DT, hooks); updateItems(w, DT); };
const run = (w, s) => { for (let t = 0; t < s - 1e-9 && w.event; t += DT) step(w); };
const screenHit = (lane, p) => (lane.vx !== 0 ? Math.abs(lane.y - p.y) <= 10 * T : Math.abs(lane.x - p.x) <= 17.5 * T);

test('balance: przelot od fali 8 (ninja), liczba przelotow rosnie z fala, drop 100%, ciemnosc', () => {
  assert.equal(KC.fromWave, balance.mobs.ninja.fromWave);
  assert.ok(KC.base >= 4 && KC.perWave > 0 && KC.durS > 5);
  assert.equal(KC.dropChance, 1);
  assert.ok(KC.dark.alpha > 0 && KC.dark.radiusTiles >= 3);
});

test('start: ciemnosc wlaczona, sterowanie NIE zablokowane, tory z czterech kierunkow, kazdy gracz ma >= 2 przez ekran', () => {
  const w = makeWorld({ players: [{ x: c(10), y: c(10) }, { x: c(70), y: c(50) }] });
  w.phase = 'break';
  w.wave = 10;
  const ev = startEvent(w, 'flyby');
  assert.ok(w.dark && w.dark.alpha === KC.dark.alpha, 'ciemnosc');
  assert.equal(w.lock, false, 'przelot nie blokuje sterowania');
  assert.ok(w.eventCombat);
  assert.equal(ev.lanes.length, Math.round(KC.base + KC.perWave * 10));
  const dirs = new Set(ev.lanes.map((l) => `${l.vx},${l.vy}`));
  assert.equal(dirs.size, 4, 'cztery kierunki');
  for (const id of ['p1', 'p2']) {
    const p = w.players.get(id);
    assert.ok(ev.lanes.filter((l) => screenHit(l, p)).length >= KC.perPlayerMin, `${id}: przeloty przez ekran`);
  }
  for (const l of ev.lanes) assert.ok(l.x < 0 || l.y < 0 || l.x > tilesW * T || l.y > tilesH * T, 'start poza mapa');
});

test('ninja przelatuje przez mape, ponad sciana, rani gracza na torze raz, despawnuje bez trupa i dropu', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  const p = w.players.get('p1');
  w.phase = 'break';
  w.wave = 8;
  const ev = startEvent(w, 'flyby');
  // jeden tor dokladnie przez gracza, z lewej do prawej, ze sciana po drodze
  ev.lanes = [{ x: -24, y: p.y, vx: 1, vy: 0, at: 0 }];
  ev.next = 0;
  placeWall(w, 30, 30, 0);
  step(w);
  const ninja = w.mobs.find((m) => m.flyby);
  assert.ok(ninja, 'ninja wystartowal');
  assert.ok(ninja.x < 0);
  run(w, 2);
  assert.ok(Math.hypot(ninja.x - 0, ninja.y - p.y) > 0);
  run(w, 4);
  assert.equal(w.mobs.includes(ninja), false, 'despawn za krawedzia');
  assert.equal(p.hp, p.maxHp - w.rules.mobDamage('ninja'), 'jedno trafienie');
  assert.equal(w.events.filter((e) => e.type === 'mobDeath').length, 0, 'despawn to nie smierc');
  assert.equal([...w.items.values()].filter((i) => i.state === 'ground').length, 0, 'bez dropu');
  assert.ok(w.grid.isSolid(30, 30), 'sciana stoi, przelot ponad nia');
});

test('zabity w locie ma drop 100%; miny i klatki nie reaguja na przelot', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  const p = w.players.get('p1');
  w.phase = 'break';
  w.wave = 8;
  const ev = startEvent(w, 'flyby');
  ev.lanes = [{ x: -24, y: c(20), vx: 1, vy: 0, at: 0 }];
  ev.next = 0;
  const mine = placeServer(w, 'mine', 20, 20, 0);
  const cage = placeServer(w, 'cage', 30, 20, 0);
  step(w);
  const ninja = w.mobs.find((m) => m.flyby);
  assert.equal(ninja.dropChance, 1);
  run(w, 2.5);
  assert.ok(ninja.x > c(32), `ninja minal pulapki: ${ninja.x / T}`);
  assert.ok(w.items.has(mine.id) && mine.state === 'active', 'mina nie wybuchla');
  assert.equal(cage.caught, null, 'klatka nie zlapala');
  damageMob(w, ninja, 99999, 'p1');
  assert.equal(w.mobs.includes(ninja), false);
  assert.ok(w.events.some((e) => e.type === 'mobDeath' && e.killer === 'p1'));
  assert.equal([...w.items.values()].filter((i) => i.state === 'ground').length, 1, 'drop na 100%');
  assert.equal(p.hp, p.maxHp);
});

test('po ostatnim przelocie swiatlo wraca, wydarzenie konczy sie, pozostali lotnicy znikaja; w przerwie da sie powalic', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  const p = w.players.get('p1');
  w.phase = 'break';
  w.wave = 9;
  startEvent(w, 'flyby');
  damagePlayer(w, p, 9999, 'mob');
  assert.equal(p.state, 'downed', 'eventCombat: przerwa nie chroni');
  run(w, KC.durS + 8);
  assert.equal(w.event, null, 'skonczylo sie');
  assert.equal(w.dark, null, 'swiatlo wrocilo');
  assert.equal(w.mobs.some((m) => m.flyby), false);
  assert.equal(w.eventCombat, false);
  assert.equal(p.state, 'alive', 'po wydarzeniu wstaje');
});

test('endEvent w trakcie: lotnicy usunieci, ciemnosc zgaszona', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  w.phase = 'break';
  w.wave = 8;
  startEvent(w, 'flyby');
  run(w, 2);
  assert.ok(w.mobs.some((m) => m.flyby));
  endEvent(w);
  assert.equal(w.mobs.length, 0);
  assert.equal(w.dark, null);
});
