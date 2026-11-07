// Random eventy (V3-Q-06) i Armia budowniczych (V3-Q-06-03).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, balance } from './helpers.js';
import { EVENTS, pickEvent, startEvent, updateEvent, endEvent } from '../server/events.js';
import { updatePlayers } from '../server/players.js';
import { fireWeapons } from '../server/combat.js';
import { handleAction, spawnDrop, updateItems, placeServer } from '../server/items.js';
import { activeInGroup, footprint } from '../public/shared/world.js';
import { Game } from '../server/game.js';

const T = 16;
const c = (t) => (t + 0.5) * T;
const DT = 1 / 30;
const E = balance.events;
const KC = E.kinds.builders;
const runEvent = (w, maxS = 20) => { for (let t = 0; t < maxS && w.event; t += DT) { updateEvent(w, DT); updateItems(w, DT); } };

test('balance: wydarzenia maja szanse, prog fali i Armie budowniczych z nazwa', () => {
  assert.ok(E.chance > 0 && E.chance < 1);
  assert.ok(E.fromWave >= 2);
  assert.equal(typeof KC.name, 'string');
  assert.ok(EVENTS.builders, 'zarejestrowane');
});

test('losowanie: nie przed fromWave, nie na fali bossa, nie dwa razy z rzedu, nie gdy rng >= szansa', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  w.rng = () => 0;
  assert.equal(pickEvent(w, E.fromWave - 1), null, 'za wczesnie');
  assert.equal(pickEvent(w, E.fromWave), 'builders', 'od progu losuje');
  assert.equal(pickEvent(w, 5), null, 'fala bossa (co 5.) bez wydarzenia');
  w.lastEventWave = 6;
  assert.equal(pickEvent(w, 7), null, 'nie dwa razy z rzedu');
  assert.equal(pickEvent(w, 8), 'builders');
  w.lastEventWave = -1;
  w.rng = () => 0.99;
  assert.equal(pickEvent(w, 8), null, 'rng powyzej szansy');
});

test('wydarzenie blokuje ruch, strzal, akcje i ultimate; po koncu wszystko wraca', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30), ult: 300, ultKind: 'heal', ultKind2: 'freeze' }] });
  const p = w.players.get('p1');
  w.phase = 'break';
  startEvent(w, 'builders');
  assert.ok(w.event && w.lock);
  assert.ok(w.events.some((e) => e.type === 'eventStart' && e.kind === 'builders'));
  const x0 = p.x;
  p.inputQueue.push({ seq: 1, mx: 1, my: 0, aimX: p.x + 50, aimY: p.y, fire: true });
  updatePlayers(w, DT);
  assert.equal(p.x, x0, 'bez ruchu');
  p.input.fire = true;
  fireWeapons(w, DT);
  assert.equal(w.bullets.length, 0, 'bez strzalu');
  const it = spawnDrop(w, 'mine', p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  assert.equal(p.held, null, 'bez podnoszenia');
  endEvent(w);
  assert.equal(w.lock, false);
  assert.equal(w.event, null);
  assert.ok(w.events.some((e) => e.type === 'eventEnd'));
  handleAction(w, p, 'e');
  assert.equal(p.held, it.id, 'po wydarzeniu akcje dzialaja');
});

test('Armia budowniczych: stawia do limitow, nic na graczu, obiekty blokujace z odstepem, budowniczowie znikaja', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }, { x: c(44), y: c(31) }] });
  w.phase = 'break';
  const ev = startEvent(w, 'builders');
  assert.ok(w.builders.length >= 8 && w.builders.length <= KC.count, `budowniczych: ${w.builders.length}`);
  assert.ok(ev.jobs > 30, `plan ma ${ev.jobs} robot`);
  assert.equal(ev.emote, '?!');
  runEvent(w, KC.maxS + 1);
  assert.equal(w.event, null, 'wydarzenie sie skonczylo');
  assert.equal(w.builders.length, 0, 'budowniczowie wybiegli');
  const items = [...w.items.values()];
  const count = (pred) => items.filter(pred).length;
  const lim = balance.items;
  assert.equal(activeInGroup(items, 'turret30'), lim.turret30.limit, 'dzialka do pelnej puli');
  assert.equal(activeInGroup(items, 'mine'), lim.mine.limit, 'miny do limitu');
  assert.equal(activeInGroup(items, 'cage'), lim.cage.limit, 'klatki do limitu');
  assert.equal(activeInGroup(items, 'platform30'), lim.platform30.limit, 'platformy do puli');
  assert.equal(count((i) => i.kind === 'wall' && i.state === 'placed'), KC.hard.wall, 'sciany wedlug planu (makeWorld nie ma ruin)');
});

test('Armia budowniczych w makeWorld bez ruin: dokladnie tyle scian, ile w planie, bez nakladania sie obrysow', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  w.phase = 'break';
  startEvent(w, 'builders');
  runEvent(w, KC.maxS + 1);
  const items = [...w.items.values()].filter((i) => ['placed', 'active'].includes(i.state));
  assert.equal(items.filter((i) => i.kind === 'wall').length, KC.hard.wall);
  assert.equal(items.filter((i) => i.kind === 'boulder').length, KC.hard.boulder);
  assert.equal(items.filter((i) => i.kind === 'spikes').length, KC.hard.spikes);
  const seen = new Set();
  for (const it of items) {
    for (const [x, y] of footprint(it.kind, it.tx, it.ty, it.rot)) {
      const k = `${x},${y}`;
      assert.ok(!seen.has(k), `kafelek ${k} zajety dwa razy`);
      seen.add(k);
    }
  }
  const p = w.players.get('p1');
  const ptx = Math.floor(p.x / T);
  const pty = Math.floor(p.y / T);
  assert.ok(!seen.has(`${ptx},${pty}`), 'nic na kafelku gracza');
  // obiekty blokujace cialo: zaden solidny kafelek nie ma solidnego sasiada w promieniu 2 (odstep >= 3)
  const solid = [];
  for (let y = 0; y < w.grid.h; y++) for (let x = 0; x < w.grid.w; x++) if (w.grid.isSolid(x, y)) solid.push([x, y]);
  assert.ok(solid.length >= KC.hard.wall * 2 + KC.hard.boulder, `solidnych kafelkow: ${solid.length}`);
  for (const [x, y] of solid) {
    const own = items.find((i) => footprint(i.kind, i.tx, i.ty, i.rot).some(([a, b]) => a === x && b === y));
    const ownTiles = new Set(footprint(own.kind, own.tx, own.ty, own.rot).map(([a, b]) => `${a},${b}`));
    for (const [sx, sy] of solid) {
      if (ownTiles.has(`${sx},${sy}`)) continue;
      assert.ok(Math.max(Math.abs(sx - x), Math.abs(sy - y)) >= 3, `kafelki ${x},${y} i ${sx},${sy} za blisko`);
    }
  }
});

test('Armia nie liczy limitu podwojnie: dzialka juz stojace zmniejszaja plan', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  w.phase = 'break';
  for (let i = 0; i < 5; i++) placeServer(w, 'turret60', 20 + i * 3, 10, 0);
  startEvent(w, 'builders');
  runEvent(w, KC.maxS + 1);
  assert.equal(activeInGroup([...w.items.values()], 'turret30'), balance.items.turret30.limit);
});

test('Game: po fali >= 3 z rng=0 startuje wydarzenie, licznik przerwy stoi, snapshot niesie event i budowniczych', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 5 });
  const w = g.world;
  w.wave = 3;
  w.phase = 'wave';
  g.director = { done: true, pending: 0, update: () => [] };
  w.rng = () => 0;
  g.tick(DT);
  assert.equal(w.phase, 'break');
  assert.ok(w.event && w.event.type === 'builders', 'wydarzenie wystartowalo po fali 3');
  const left0 = g.breakLeft;
  for (let i = 0; i < 30; i++) g.tick(DT);
  assert.equal(g.breakLeft, left0, 'licznik przerwy stoi w trakcie wydarzenia');
  const s = g.snapshot(1);
  assert.equal(s.event.type, 'builders');
  assert.equal(s.event.name, KC.name);
  assert.equal(s.event.lock, true);
  assert.equal(s.event.emote, '?!');
  assert.ok(Array.isArray(s.builders));
  for (let i = 0; i < 30 * (KC.maxS + 2) && w.event; i++) g.tick(DT);
  assert.equal(w.event, null);
  g.tick(DT);
  assert.ok(g.breakLeft < left0, 'po wydarzeniu przerwa biegnie');
  assert.equal(g.snapshot(1).event, null);
});

test('Game: fala 4 po wydarzeniu na 3 nie losuje (nie dwa razy z rzedu), fala 5 to boss', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 5 });
  const w = g.world;
  w.rng = () => 0;
  w.lastEventWave = 3;
  w.wave = 4;
  w.phase = 'wave';
  g.director = { done: true, pending: 0, update: () => [] };
  g.tick(DT);
  assert.equal(w.event, null);
});
