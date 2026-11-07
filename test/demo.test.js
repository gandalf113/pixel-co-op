// Swiat demo (V3-K-06 tlo ekranu glownego, V3-K-07 poligon): czysta logika, bez DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DemoWorld, makeRng } from '../public/client/demo.js';
import { MV } from '../public/shared/mobview.js';

const balance = JSON.parse(readFileSync(new URL('../public/balance.json', import.meta.url), 'utf8'));
const tp = balance.map.tilePx;

function run(d, seconds, input, onEvents = () => {}) {
  const dt = 1 / 60;
  let now = 0;
  for (let i = 0; i < seconds * 60; i++) {
    now += dt * 1000;
    onEvents(d.update(now, dt, input), now);
  }
  return now;
}

test('makeRng: deterministyczny i w [0,1)', () => {
  const a = makeRng(5);
  const b = makeRng(5);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('attract: bohater wedruje i strzela, potwory sie snuja, zaden nie gryzie (hp bohatera stale)', () => {
  const d = new DemoWorld(balance, { mode: 'attract', seed: 3 });
  assert.ok(d.mobs.length >= 6, 'kilka potworow w tle');
  const x0 = d.hero.x;
  const types = new Set();
  let shots = 0;
  let hits = 0;
  run(d, 12, undefined, (evs) => {
    for (const e of evs) {
      types.add(e.type);
      if (e.type === 'shot') shots++;
      if (e.type === 'hit') hits++;
    }
  });
  assert.notEqual(d.hero.x, x0, 'bohater sie rusza');
  assert.ok(shots > 10, `serie w tle (${shots} strzalow)`);
  assert.ok(hits > 0, 'duchy trafiaja potwory');
  assert.equal(d.hero.hp, d.hero.maxHp);
  for (const m of d.mobs) {
    assert.ok(m.x >= tp && m.x <= (balance.map.tilesW - 1) * tp, 'potwor w arenie');
  }
  const view = d.view(1000, { cam: { x: 0, y: 0 }, sprites: new Map(), fx: null, gore: null, pxScale: 1, aim: null });
  assert.equal(view.players.length, 1);
  for (const m of view.mobs) {
    assert.equal(m.length, 13, 'krotka potwora w ksztalcie MV');
    assert.ok(balance.mobs[m[MV.type]]);
  }
  assert.ok(view.items.some((i) => i.state === 'placed'), 'ruiny w tle');
});

test('attract: zabity potwor znika i wraca po chwili z pelnym hp', () => {
  const d = new DemoWorld(balance, { mode: 'attract', seed: 11 });
  let died = null;
  run(d, 20, undefined, (evs) => {
    for (const e of evs) if (e.type === 'mobDeath' && !died) died = e;
  });
  assert.ok(died, 'w 20 s ktorys potwor pada');
  const m = d.mobs.find((x) => x.id === died.id);
  assert.ok(m.deadFor < 0 || m.deadFor <= 2.5, 'po smierci albo juz wrocil, albo czeka');
  run(d, 3, undefined);
  assert.ok(d.mobs.every((x) => x.hp > 0 || x.deadFor >= 0));
});

test('range: bohater stoi w miejscu, drepcze pod WASD i celuje za myszka', () => {
  const d = new DemoWorld(balance, { mode: 'range', seed: 1 });
  const { x, y } = d.hero;
  run(d, 1, { mx: 1, my: 0, fire: false, aim: { x: x, y: y - 100 } });
  assert.equal(d.hero.x, x);
  assert.equal(d.hero.y, y);
  assert.equal(d.hero.moving, true);
  assert.ok(Math.abs(d.hero.angle + Math.PI / 2) < 1e-9, 'celuje w gore');
  run(d, 0.1, { mx: 0, my: 0, fire: false, aim: { x: x + 10, y } });
  assert.equal(d.hero.moving, false);
});

test('range: strzal tworzy pociski i zdarzenie shot, pusty magazynek = reload, slimak-tarcza pada i wraca', () => {
  const d = new DemoWorld(balance, { mode: 'range', seed: 1 });
  const slime = d.mobs.find((m) => m.type === 'slime');
  const aim = { x: slime.x, y: slime.y };
  const seen = [];
  run(d, 5, { mx: 0, my: 0, fire: true, aim }, (evs) => seen.push(...evs.map((e) => e.type)));
  assert.ok(seen.includes('shot'));
  assert.ok(seen.includes('hit'), 'tarcza oberwala');
  assert.ok(seen.includes('mobDeath'), '30 hp pada od kilku strzalow');
  assert.ok(seen.includes('reload'), '30 nabojow w 5 s = przeladowanie');
  run(d, 3, { mx: 0, my: 0, fire: false, aim });
  assert.ok(slime.deadFor < 0 && slime.hp === slime.maxHp, 'tarcza wrocila na miejsce');
  assert.equal(slime.x, slime.spawnX);
});

test('range: E podnosi sciane, Q obraca, E stawia, R odklada, R z pustymi rekami przeladowuje', () => {
  const d = new DemoWorld(balance, { mode: 'range', seed: 1 });
  const ground = d.items.find((i) => i.state === 'ground');
  // za daleko: nic
  assert.equal(d.action('e', { x: 0, y: 0 }), false);
  d.hero.x = ground.x;
  d.hero.y = ground.y;
  assert.equal(d.action('e'), true);
  assert.equal(d.hero.held, 'wall');
  assert.ok(d.hero.busy > 0);
  assert.equal(d.action('q'), true);
  assert.equal(d.heldRot, 1);
  const aim = { x: d.hero.x + 2 * tp, y: d.hero.y };
  const t = d.placeTargetFor(aim);
  assert.ok(t.tiles.length === 2 && t.valid);
  assert.equal(d.action('e', aim), true);
  assert.equal(d.hero.held, null);
  const placed = d.items.filter((i) => i.state === 'placed');
  assert.equal(placed.length, 3, 'dwie z ruin + postawiona');
  assert.equal(placed.at(-1).rot, 1);
  // podnies z powrotem nie da sie (postawiona), wiec nowa sciana na ziemi do testu R
  d.items.push({ id: 99, kind: 'wall', state: 'ground', x: d.hero.x, y: d.hero.y });
  d.hero.busy = 0;
  assert.equal(d.action('e'), true);
  assert.equal(d.action('r'), true);
  assert.equal(d.hero.held, null);
  assert.ok(d.items.some((i) => i.state === 'ground' && i.x === d.hero.x));
  // R bez przedmiotu z pelnym magazynkiem: nic; po strzale: przeladowanie
  d.hero.busy = 0;
  assert.equal(d.action('r'), false);
  run(d, 0.2, { mx: 0, my: 0, fire: true, aim: { x: d.hero.x + 50, y: d.hero.y } });
  assert.ok(d.shots.ammo < balance.rifle.magazine);
  assert.equal(d.action('r'), true);
  assert.ok(d.shots.reloadLeft > 0);
});

test('range: spacja z przedmiotem w rekach to rzut, przedmiot laduje jako ground po czasie lotu', () => {
  const d = new DemoWorld(balance, { mode: 'range', seed: 1 });
  d.hero.held = 'wall';
  const seen = [];
  run(d, 0.05, { mx: 0, my: 0, fire: true, aim: { x: d.hero.x + 300, y: d.hero.y } }, (evs) => seen.push(...evs.map((e) => e.type)));
  assert.ok(seen.includes('throw'));
  assert.equal(d.hero.held, null);
  const fly = d.items.find((i) => i.state === 'flying');
  assert.ok(fly, 'przedmiot leci');
  assert.ok(Math.hypot(fly.flight.x1 - d.hero.x, fly.flight.y1 - d.hero.y) <= balance.throw.rangeTiles * tp + 1e-9, 'zasieg rzutu');
  run(d, balance.throw.flightS + 0.1, { mx: 0, my: 0, fire: false, aim: null }, (evs) => seen.push(...evs.map((e) => e.type)));
  assert.equal(fly.state, 'ground');
  assert.ok(seen.includes('drop'));
  // trzymany przedmiot blokuje strzal (jak na serwerze)
  d.hero.held = 'wall';
  d.prevFire = true;
  const before = d.shots.ammo;
  run(d, 0.5, { mx: 0, my: 0, fire: true, aim: { x: d.hero.x + 50, y: d.hero.y } });
  assert.equal(d.shots.ammo, before);
});

test('range: F odpala efekt fali uderzeniowej z cooldownem, pociski gina na scianie', () => {
  const d = new DemoWorld(balance, { mode: 'range', seed: 1 });
  d.update(1000, 1 / 60, { mx: 0, my: 0, fire: false, aim: null });
  assert.equal(d.action('f'), true);
  assert.equal(d.action('f'), false, 'cooldown');
  assert.equal(d.effects.length, 1);
  assert.equal(d.effects[0].kind, 'shockwave');
  for (let now = 1000; now < 2200; now += 1000 / 60) d.update(now, 1 / 60, { mx: 0, my: 0, fire: false, aim: null });
  assert.equal(d.effects.length, 0, 'efekt gasnie');
  assert.equal(d.action('f'), true, 'po cooldownie znowu');
  // strzal w sciane na polnocy: duchy nie przelatuja na druga strone
  const wall = d.items.find((i) => i.state === 'placed' && i.tx > d.hero.x / tp - 3);
  const aim = { x: (wall.tx + 1) * tp, y: (wall.ty + 0.5) * tp };
  let maxUp = 0;
  run(d, 1.5, { mx: 0, my: 0, fire: true, aim }, () => {
    for (const [, , y] of d.shots.bullets()) maxUp = Math.max(maxUp, d.hero.y - y);
  });
  assert.ok(maxUp > 0 && maxUp < (d.hero.y - wall.ty * tp) + tp, `pociski zatrzymane na scianie (${maxUp.toFixed(0)} px)`);
});
