// Dropy stale (V3-Q-01 Serce, V3-Q-02 Buty): bonus na stale, sufit, odmowa przy suficie, rzut = podanie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, makeWorld } from './helpers.js';
import { handleAction, updateItems, spawnDrop } from '../server/items.js';
import { speedMultOf } from '../server/players.js';
import { playerSpeedPx } from '../public/shared/movement.js';

const T = balance.map.tilePx;
const C = (t) => (t + 0.5) * T;

function oneWorld() {
  const w = makeWorld({ players: [{ x: C(40), y: C(30), angle: 0 }] });
  return { w, p: w.players.get('p1') };
}

function use(w, p, kind) {
  const it = spawnDrop(w, kind, p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  p.busy = 0;
  handleAction(w, p, 'e');
  return it;
}

test('balance: oba dropy stale sa w puli power z waga i sufitem', () => {
  for (const kind of ['hpboost', 'speedboost']) {
    const c = balance.items[kind];
    assert.equal(c.category, 'power');
    assert.equal(c.behavior, 'permanent');
    assert.ok(c.weight > 0 && c.amount > 0 && c.cap > c.amount, kind);
  }
  assert.equal(balance.items.speedboost.amount, 0.03, 'buty: bardzo lekkie, 3% na sztuke');
});

test('Serce: +10 maxHp i +10 hp na stale, przedmiot znika, zdarzenie permUp', () => {
  const { w, p } = oneWorld();
  p.hp = 60;
  const max0 = p.maxHp;
  const it = use(w, p, 'hpboost');
  assert.equal(p.maxHp, max0 + 10);
  assert.equal(p.hp, 70);
  assert.equal(p.held, null);
  assert.equal(w.items.has(it.id), false);
  const ev = w.events.filter((e) => e.type === 'permUp');
  assert.deepEqual(ev.map((e) => [e.id, e.kind, e.effect, e.total]), [['p1', 'hpboost', 'hp', 10]]);
});

test('Serce: sufit +100, jedenaste odmawia i zostaje w rekach', () => {
  const { w, p } = oneWorld();
  const max0 = p.maxHp;
  for (let i = 0; i < 10; i++) use(w, p, 'hpboost');
  assert.equal(p.maxHp, max0 + 100);
  const it = use(w, p, 'hpboost');
  assert.equal(p.maxHp, max0 + 100);
  assert.equal(p.held, it.id, 'przy suficie przedmiot zostaje w rekach');
  assert.ok(w.events.some((e) => e.type === 'deny' && e.id === 'p1'));
});

test('Buty: +3% predkosci na sztuke, sufit +30%, mnoznik trafia do speedMult i do predykcji', () => {
  const { w, p } = oneWorld();
  const base = playerSpeedPx(balance, null, 1);
  use(w, p, 'speedboost');
  assert.equal(speedMultOf(p), 1.03);
  assert.ok(Math.abs(playerSpeedPx(balance, null, speedMultOf(p)) - base * 1.03) < 1e-6);
  for (let i = 0; i < 12; i++) use(w, p, 'speedboost');
  assert.equal(speedMultOf(p), 1.3);
  assert.equal(p.held != null, true, 'przy suficie ostatni zostaje w rekach');
});

test('Buty i szal mnoza sie, nie dodaja', () => {
  const { w, p } = oneWorld();
  use(w, p, 'speedboost');
  p.frenzy = { speedMult: 1.3 };
  p.frenzyLeft = 5;
  assert.ok(Math.abs(speedMultOf(p) - 1.03 * 1.3) < 1e-9);
});

test('rzucony drop staly nie aktywuje sie: lezy na ziemi (podanie koledze)', () => {
  const { w, p } = oneWorld();
  const max0 = p.maxHp;
  const it = spawnDrop(w, 'hpboost', p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  p.busy = 0;
  p.input.aimX = p.x + 3 * T;
  p.input.aimY = p.y;
  handleAction(w, p, 'space');
  assert.equal(it.state, 'flying');
  for (let i = 0; i < 30; i++) updateItems(w, 1 / 30);
  assert.equal(it.state, 'ground');
  assert.equal(p.maxHp, max0, 'rzut nie daje bonusu');
});

// Zbrojmistrz (V3-Q-09): mocniejsze ofensywne przedmioty stawiane przez tego, kto go podniosl.
test('Zbrojmistrz: +25% na sztuke, sufit +100%, zdarzenie permUp z effect power', () => {
  const { w, p } = oneWorld();
  use(w, p, 'armorer');
  assert.equal(p.powerBonus, 0.25);
  assert.ok(w.events.some((e) => e.type === 'permUp' && e.effect === 'power' && e.total === 0.25));
  for (let i = 0; i < 5; i++) use(w, p, 'armorer');
  assert.equal(p.powerBonus, 1);
  assert.ok(p.held != null, 'przy suficie zostaje w rekach');
});

test('Zbrojmistrz: dzialko postawione przez wzmocnionego strzela mocniej, postawione przez kolege nie; power zapisany przy stawianiu', async () => {
  const { updateItems, spawnDrop: sd, placeServer } = await import('../server/items.js');
  const { addMob } = await import('./helpers.js');
  const w = makeWorld({ players: [{ x: C(40), y: C(30), angle: 0 }, { x: C(40), y: C(36), angle: 0 }] });
  const a = w.players.get('p1');
  const b = w.players.get('p2');
  use(w, a, 'armorer');
  use(w, a, 'armorer');
  const place = (p, kind, tx, ty) => {
    const it = sd(w, kind, p.x, p.y);
    it.x = p.x; it.y = p.y;
    handleAction(w, p, 'e');
    p.busy = 0;
    p.input.aimX = (tx + 0.5) * T; p.input.aimY = (ty + 0.5) * T;
    handleAction(w, p, 'e');
    return it;
  };
  const ta = place(a, 'turret30', 42, 30);
  const tb = place(b, 'turret30', 42, 36);
  assert.equal(ta.state, 'active');
  assert.equal(ta.power, 1.5, 'power z chwili postawienia');
  assert.equal(tb.power, 1);
  use(w, a, 'armorer');
  assert.equal(ta.power, 1.5, 'pozniejszy drop nie zmienia juz stojacego');
  const srv = placeServer(w, 'turret60', 50, 30, 0);
  assert.equal(srv.power, 1, 'wydarzenia stawiaja bez bonusu');
  addMob(w, 'tank', C(46), C(30));
  addMob(w, 'tank', C(46), C(36));
  updateItems(w, 1 / 30);
  const dmgA = w.bullets.find((bu) => bu.owner === 'p1' && bu.fromTurret)?.damage;
  const dmgB = w.bullets.find((bu) => bu.owner === 'p2' && bu.fromTurret)?.damage;
  assert.equal(dmgA, balance.items.turret30.damage * 1.5);
  assert.equal(dmgB, balance.items.turret30.damage);
});

test('Zbrojmistrz: mina mocniejsza i szersza, kolce mocniejsze', async () => {
  const { updateItems, placeServer } = await import('../server/items.js');
  const { addMob } = await import('./helpers.js');
  const w = makeWorld({ players: [{ x: C(10), y: C(10), angle: 0 }] });
  const p = w.players.get('p1');
  p.powerBonus = 1; // 4 sztuki
  const mine = placeServer(w, 'mine', 40, 30, 0);
  mine.power = 2; // jak po postawieniu przez p (placeServer daje 1)
  mine.owner = 'p1';
  const near = addMob(w, 'tank', C(40), C(30));
  const rr = balance.items.mine.radiusTiles * (1 + 1 * balance.items.armorer.radiusPerPower);
  const edge = addMob(w, 'tank', C(40) + (rr - 0.1) * T, C(30));
  const out = addMob(w, 'tank', C(40) + (rr + 0.5) * T, C(30));
  for (let i = 0; i < 60; i++) updateItems(w, 1 / 30);
  assert.equal(balance.mobs.tank.hp - near.hp, balance.items.mine.damage * 2, 'x2 obrazenia');
  assert.equal(balance.mobs.tank.hp - edge.hp, balance.items.mine.damage * 2, 'promien x1.6');
  assert.equal(out.hp, balance.mobs.tank.hp, 'poza nowym promieniem');
  const sp = placeServer(w, 'spikes', 60, 30, 0);
  sp.power = 1.25;
  const m = addMob(w, 'tank', C(60), C(30));
  updateItems(w, 1 / 30);
  assert.ok(Math.abs((balance.mobs.tank.hp - m.hp) - balance.items.spikes.tickDamage * 1.25) < 1e-9);
});
