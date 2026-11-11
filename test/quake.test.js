// Trzesienie ziemi (V3-Q-06-01): wstrzas, sciaganie graczy, 8 zapadni 3 x 3 przy krawedzi ekranu, extra fala z zapadni, koniec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, addMob, placeWall, balance } from './helpers.js';
import { startEvent, updateEvent } from '../server/events.js';
import { updatePlayers, damagePlayer } from '../server/players.js';
import { updateMobs } from '../server/mobs.js';
import { spawnDrop } from '../server/items.js';
import { damageMob } from '../server/combat.js';
import { Game } from '../server/game.js';

const T = 16;
const c = (t) => (t + 0.5) * T;
const DT = 1 / 30;
const KC = balance.events.kinds.quake;
const SCREEN = { w: 560 / T, h: 315 / T }; // VIEW_W / VIEW_H z render.js, w kafelkach
const hooks = { onWallHit() {}, onObjectDestroyed() {} };
const until = (w, pred, maxS = 30) => { for (let t = 0; t < maxS && w.event && !pred(); t += DT) { updateEvent(w, DT); updateMobs(w, DT, hooks); } };

test('balance: trzesienie ma wstrzas, sciaganie, 8 zapadni 3 x 3 przy krawedzi ekranu i budzet mniejszy niz fala', () => {
  assert.ok(KC.shakeS > 0 && KC.pullTiles > 0 && KC.pitSize === 3);
  // Zapadnie maja siedziec PRZY KRAWEDZI EKRANU, nie pod nogami: zewnetrzny brzeg zapadni ma byc jeszcze
  // widoczny (<= pol ekranu), ale nie blizej niz kilka kafelkow od tej krawedzi.
  const hp = Math.floor(KC.pitSize / 2);
  assert.ok(KC.pitDistX + hp <= SCREEN.w / 2 && KC.pitDistX + hp >= SCREEN.w / 2 - 3, `w poziomie przy krawedzi: ${KC.pitDistX}`);
  assert.ok(KC.pitDistY + hp <= SCREEN.h / 2 && KC.pitDistY + hp >= SCREEN.h / 2 - 2, `w pionie przy krawedzi: ${KC.pitDistY}`);
  assert.ok(KC.budgetMul > 0 && KC.budgetMul < 1, `extra fala mniejsza niz zwykla: ${KC.budgetMul}`);
  assert.equal(typeof KC.name, 'string');
});

test('faza wstrzasu blokuje sterowanie, potem gracze sa sciagani do wspolnego punktu', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }, { x: c(42), y: c(30) }, { x: c(36), y: c(22) }] });
  const ps = ['p1', 'p2', 'p3'].map((id) => w.players.get(id));
  w.phase = 'break';
  const ev = startEvent(w, 'quake');
  assert.equal(ev.phase, 'shake');
  assert.ok(w.lock);
  assert.ok(w.events.some((e) => e.type === 'quake'));
  until(w, () => ev.phase === 'pull');
  assert.equal(ev.phase, 'pull');
  const x0 = ps.map((p) => [p.x, p.y]);
  until(w, () => ev.phase === 'fight');
  assert.equal(ev.phase, 'fight');
  assert.ok(ps.some((p, i) => p.x !== x0[i][0] || p.y !== x0[i][1]), 'ktos sie przesunal');
  for (const p of ps) assert.ok(Math.hypot(p.x - ev.meet.x, p.y - ev.meet.y) <= T * 0.7, 'wszyscy w punkcie spotkania');
  assert.equal(w.lock, false, 'po otwarciu zapadni sterowanie wraca');
});

test('zapadnie: 8 sztuk przy krawedzi ekranu, przedmioty na nich znikaja, gracz nie moze wejsc', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  const p = w.players.get('p1');
  const ex = 40 + KC.pitDistX; // srodek zapadni "wschod"
  const sy = 30 + KC.pitDistY; // srodek zapadni "poludnie"
  w.phase = 'break';
  const wall = placeWall(w, ex, 30, 0);
  const gnd = spawnDrop(w, 'mine', c(40), c(sy));
  gnd.x = c(40);
  gnd.y = c(sy);
  const near = placeWall(w, 44, 30, 0); // tam, gdzie zapadnie bywaly kiedys: tuz przy graczu, ma ocalec
  const ev = startEvent(w, 'quake');
  until(w, () => ev.phase === 'fight');
  assert.equal(w.pits.length, 8);
  assert.ok(w.pits.some((q) => q.tx === ex && q.ty === 30), 'zapadnia na wschod');
  // zadna zapadnia nie moze otworzyc sie pod nogami: obrys trzyma sie z dala od punktu spotkania
  for (const q of w.pits) {
    assert.ok(Math.abs(q.tx - 40) >= KC.pitDistY - 1 || Math.abs(q.ty - 30) >= KC.pitDistY - 1, `zapadnia za blisko: ${q.tx},${q.ty}`);
  }
  assert.equal(w.items.has(wall.id), false, 'sciana na zapadni spadla');
  assert.equal(w.items.has(gnd.id), false, 'lezacy przedmiot na zapadni spadl');
  assert.equal(w.items.has(near.id), true, 'sciana tuz przy graczu stoi');
  assert.ok(w.events.filter((e) => e.type === 'fall').length === 2);
  assert.ok(!w.grid.isSolid(ex, 30), 'siatka przebudowana');
  // gracz probuje wejsc na zapadnie: stoi tuz przed nia i idzie w prawo
  const edge = ex - Math.floor(KC.pitSize / 2); // pierwszy kafelek zapadni
  p.x = c(edge - 1) + 4;
  p.y = c(30);
  for (let i = 0; i < 30; i++) {
    p.inputQueue.push({ seq: i + 1, mx: 1, my: 0, aimX: p.x + 50, aimY: p.y, fire: false });
    updatePlayers(w, DT);
  }
  assert.ok(Math.floor(p.x / T) <= edge - 1, `gracz zatrzymany przed zapadnia: ${p.x / T}`);
});

test('zapadnie w rogu mapy: nadal 8 sztuk, zadne dwie na siebie nie nachodza', () => {
  const { tilesW, tilesH } = balance.map;
  const corners = [[2, 2], [tilesW - 3, 2], [2, tilesH - 3], [tilesW - 3, tilesH - 3], [40, tilesH - 2], [1, 30]];
  for (const [tx, ty] of corners) {
    const w = makeWorld({ players: [{ x: c(tx), y: c(ty) }] });
    w.phase = 'break';
    const ev = startEvent(w, 'quake');
    until(w, () => ev.phase === 'fight');
    assert.equal(w.pits.length, 8, `osiem zapadni w ${tx},${ty}`);
    const seen = new Set();
    for (const q of w.pits) {
      const h = Math.floor(KC.pitSize / 2);
      for (let dy = -h; dy <= h; dy++) {
        for (let dx = -h; dx <= h; dx++) {
          const key = `${q.tx + dx},${q.ty + dy}`;
          assert.equal(seen.has(key), false, `zapadnie nachodza na siebie w ${tx},${ty}: ${key}`);
          seen.add(key);
          assert.ok(q.tx + dx >= 0 && q.ty + dy >= 0 && q.tx + dx < tilesW && q.ty + dy < tilesH, 'zapadnia w granicach mapy');
        }
      }
    }
  }
});

test('z zapadni wychodzi extra fala o budzecie fali, w przerwie da sie powalic, po wybiciu zapadnie znikaja i wszyscy wstaja', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  const p = w.players.get('p1');
  w.phase = 'break';
  w.wave = 6;
  const ev = startEvent(w, 'quake');
  until(w, () => ev.phase === 'fight');
  assert.ok(w.mobs.length > 0, 'potwory wyszly');
  const budget = w.rules.waveBudget(6) * KC.budgetMul;
  const cost = (list) => list.reduce((s, m) => s + balance.mobs[m.type].cost / (balance.mobs[m.type].pack ?? 1), 0);
  const spent = cost(w.mobs) + ev.queue.reduce((s, t) => s + balance.mobs[t].cost, 0);
  assert.ok(spent <= budget + 1e-6 && spent >= budget - 5, `budzet ${spent} vs ${budget}`);
  for (const m of w.mobs) assert.ok(w.pits.some((q) => Math.hypot(m.x - c(q.tx), m.y - c(q.ty)) <= 2.5 * T), 'potwor wyszedl z zapadni');
  assert.ok(w.eventCombat);
  damagePlayer(w, p, 9999, 'mob');
  assert.equal(p.state, 'downed', 'w walce wydarzenia przerwa nie chroni przed powaleniem');
  for (const m of [...w.mobs]) damageMob(w, m, 99999, 'p1');
  until(w, () => !w.event, 40);
  assert.equal(w.event, null, 'po wybiciu wydarzenie konczy sie');
  assert.equal(w.pits.length, 0);
  assert.equal(w.pitTiles.size, 0);
  assert.equal(w.eventCombat, false);
  assert.equal(p.state, 'alive', 'powalony wstal jak na poczatku przerwy');
  damagePlayer(w, p, 9999, 'mob');
  assert.equal(p.state, 'alive', 'zwykla przerwa znow chroni');
});

test('Game: wydarzenie quake z rng=0 na fali 4 - snapshot niesie pits, licznik przerwy stoi do konca walki', async () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 9 });
  const w = g.world;
  w.wave = 4;
  w.phase = 'wave';
  g.director = { done: true, pending: 0, update: () => [] };
  w.rng = () => 0; // chance ok, pickWeighted -> pierwszy wpis (builders) ... wiec wymuszamy quake recznie
  g.tick(DT);
  assert.equal(w.phase, 'break');
  if (w.event?.type !== 'quake') {
    const { endEvent, startEvent: se } = await import('../server/events.js');
    endEvent(w);
    se(w, 'quake');
  }
  w.rng = Math.random;
  const left0 = g.breakLeft;
  for (let i = 0; i < 30 * 8 && w.event?.phase !== 'fight'; i++) g.tick(DT);
  assert.equal(w.event?.phase, 'fight');
  const s = g.snapshot(1);
  assert.equal(s.pits.length, 8);
  assert.equal(s.event.type, 'quake');
  assert.equal(s.event.lock, false);
  assert.equal(g.breakLeft, left0, 'przerwa stoi');
  for (const m of [...w.mobs]) damageMob(w, m, 99999, 1);
  for (let i = 0; i < 60 && w.event; i++) g.tick(DT);
  assert.equal(w.event, null);
  assert.deepEqual(g.snapshot(1).pits, []);
});
