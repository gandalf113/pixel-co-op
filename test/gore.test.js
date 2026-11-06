import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gore, corpseStage } from '../public/client/gore.js';
import { balance, makeWorld } from './helpers.js';

const cfg = balance.gore;
const mk = () => new Gore(cfg);

test('stadium trupa: 0 swiezy, 1 rozdety, 2 szkielet, 3 wyblakly, 4 znika', () => {
  const life = cfg.corpseLifeWaves;
  assert.equal(life, 4);
  const got = [0, 1, 2, 3, 4, 7].map((age) => corpseStage(['slime', 0, 0, 0, 5], 5 + age, life));
  assert.deepEqual(got, [0, 1, 2, 3, null, null]);
});

test('krotka bez piatego pola jest swieza', () => {
  assert.equal(corpseStage(['slime', 0, 0, 0], 99, cfg.corpseLifeWaves), 0);
});

test('wzrost fali przycina trupy ponad zycie i zwalnia limit', () => {
  const g = mk();
  g.setWave(1);
  g.addCorpse('slime', 1, 1, 0, 1);
  g.addCorpse('slime', 2, 2, 0, 3);
  g.setWave(4); // wiek 3 i 1: oba zyja
  assert.equal(g.corpses.length, 2);
  g.setWave(5); // pierwszy ma wiek 4
  assert.equal(g.corpses.length, 1);
  assert.equal(g.corpses[0][1], 2);
  for (let i = 0; i < cfg.maxCorpses + 5; i++) g.addCorpse('slime', i, 0, 0, 5);
  assert.equal(g.corpses.length, cfg.maxCorpses);
});

test('serwer znakuje trupa numerem fali', async () => {
  const { killMob } = await import('../server/combat.js');
  const w = makeWorld({ players: [{ x: 100, y: 100, angle: 0 }] });
  w.wave = 6;
  const mob = { id: 1, type: 'slime', x: 50, y: 60, angle: 0, hp: 0 };
  w.mobs.push(mob);
  killMob(w, mob, null);
  assert.equal(w.gore.corpses[0][4], 6);
});

test('dwie plamy blizej niz 6 px to jeden obiekt o wyzszym poziomie', () => {
  const g = mk();
  g.addSplat(100, 100, 0, 0);
  g.addSplat(104, 100, 0, 0);
  assert.equal(g.marks.length, 1);
  assert.equal(g.marks[0].level, 1);
});

test('plama dalej niz 6 px to osobny obiekt', () => {
  const g = mk();
  g.addSplat(100, 100, 0, 0);
  g.addSplat(107, 100, 0, 0);
  assert.equal(g.marks.length, 2);
  // przez granice komorki hasza tez
  g.addSplat(200, 100, 0, 0);
  g.addSplat(205, 100, 0, 0);
  assert.equal(g.marks.length, 3);
});

test('poziom plamy nie przekracza 2', () => {
  const g = mk();
  for (let i = 0; i < 10; i++) g.addSplat(50, 50, 1, 0);
  assert.equal(g.marks.length, 1);
  assert.equal(g.marks[0].level, cfg.splatLevels - 1);
  assert.equal(g.marks[0].level, 2);
});

// kaluza w (100,100) stworzona w t=0, krok postaci co 80 ms
function walkAcross(g, t0, id = 'p1') {
  let t = t0;
  g.walk(t, [{ id, x: 70, y: 100 }]);
  for (let x = 74; x <= 400; x += 4) {
    t += cfg.checkMs;
    g.walk(t, [{ id, x: Math.min(x, 100), y: 100 }]);
    if (x >= 100) break;
  }
  const out = [];
  for (let x = 100; x <= 400; x += 6) {
    t += cfg.checkMs;
    g.walk(t, [{ id, x, y: 100 }]);
  }
  return g.marks.filter((m) => m.kind === 'step');
}

test('przejscie przez swieza kaluze zostawia slady, liczba = footprintSteps, krycie maleje', () => {
  const g = mk();
  g.addSplat(100, 100, 2, 0);
  const steps = walkAcross(g, 100);
  assert.equal(steps.length, cfg.footprintSteps);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].k < steps[i - 1].k);
  assert.ok(steps[0].k <= 1 && steps.at(-1).k > 0);
  // lewa/prawa stopa naprzemiennie (ruch w +x, offset w y)
  assert.ok(steps[0].y !== steps[1].y && steps[0].y === steps[2].y);
});

test('stara kaluza (ponad prog swiezosci) nie zostawia sladow', () => {
  const g = mk();
  g.addSplat(100, 100, 2, 0);
  const steps = walkAcross(g, cfg.freshPoolS * 1000 + 500);
  assert.equal(steps.length, 0);
});

test('plamy z restore nie sa swieze', () => {
  const g = mk();
  g.restore([], [[100, 100]]);
  assert.equal(walkAcross(g, 0).length, 0);
});

test('walk jest przepustnicowany do checkMs', () => {
  const g = mk();
  g.walk(1000, []);
  assert.equal(g.due(1000 + cfg.checkMs - 1), false);
  assert.equal(g.due(1000 + cfg.checkMs), true);
});

test('wspolny limit plam i sladow, wypada najstarszy', () => {
  const g = mk();
  const first = g.addSplat(0, 0, 0, 0);
  for (let i = 0; i < cfg.maxSplats - 1; i++) g.addStep(1000 + i, 0, 0, 1);
  assert.equal(g.marks.length, cfg.maxSplats);
  g.addSplat(500, 500, 0, 0);
  assert.equal(g.marks.length, cfg.maxSplats);
  assert.ok(!g.marks.includes(first));
  g.addStep(9, 9, 0, 1);
  assert.equal(g.marks.length, cfg.maxSplats);
  assert.equal(g.marks.filter((m) => m.kind === 'splat').length, 1);
});

test('usuniecie plamy przy limicie czysci hasz przestrzenny', () => {
  const g = mk();
  g.addSplat(300, 300, 0, 0);
  for (let i = 0; i < cfg.maxSplats; i++) g.addStep(i, 0, 0, 1); // wypycha plame
  assert.equal(g.marks.filter((m) => m.kind === 'splat').length, 0);
  assert.equal(g.grid.size, 0);
  assert.equal(g.nearestSplat(300, 300, 6), null);
  const s = g.addSplat(301, 300, 0, 0);
  assert.equal(s.level, 0); // nie scalona z nieistniejaca
  assert.equal(g.marks.filter((m) => m.kind === 'splat').length, 1);
});
