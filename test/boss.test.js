// V3-E-02 Roj (MOB-05) i V3-E-03 Boss (MOB-06). Liczby z docs/03-WAVES-DIFFICULTY.md, tabela w sekcji 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, makeWorld, addMob } from './helpers.js';
import { Game } from '../server/game.js';
import { updateMobs } from '../server/mobs.js';
import { updateItems, onMobKilled } from '../server/items.js';
import { killMob } from '../server/combat.js';
import { makeMob, spawnFromQueue, killsLeftIn, killsLeftInMob } from '../server/mobspawn.js';
import { composeWave, bossesForWave } from '../server/waves.js';
import { makeRng } from '../server/rng.js';

const DT = 1 / 30;
const T = 16;
const hooks = { onObjectDestroyed() {} };
const run = (w, s) => { for (let i = 0; i < Math.round(s / DT); i++) updateMobs(w, DT, hooks); };
const P = (x, y) => ({ x, y });
const mkRules = () => mk(2).world.rules;
const mk = (n = 1) => new Game({ balance, difficulty: 2, players: Array.from({ length: n }, (_, i) => ({ id: i + 1, nick: 'P' + i, color: i })), seed: 11 });

test('balans: liczby Roju i Bossa zgodne z tabela', () => {
  const s = balance.mobs.swarm;
  assert.deepEqual([s.hp, s.damage, s.objDamage, s.speedTiles, s.attackS, s.fromWave, s.drop, s.pack], [10, 4, 2, 4, 0.8, 8, 0.1, 3]);
  assert.ok(s.radiusPx < balance.mobs.slime.radiusPx);
  for (const [k, m] of Object.entries(balance.mobs)) if (k !== 'swarm') assert.ok(s.radiusPx <= m.radiusPx, k);
  const b = balance.mobs.boss;
  assert.deepEqual([b.hp, b.damage, b.objDamage, b.speedTiles, b.attackS, b.drop, b.dropCount, b.aoe.radiusTiles, b.summon.count, b.summon.everyS],
    [1200, 40, 100, 1.5, 2, 1, 3, 2, 4, 10]);
});

test('Roj: jeden wpis kolejki to trzy potwory, killsLeftIn liczy 3, a zywy potwor 1', () => {
  const w = makeWorld({ players: [P(0, 0)] });
  const out = spawnFromQueue(w, 'swarm', 40 * T, 30 * T);
  assert.equal(out.length, 3);
  assert.equal(w.mobs.length, 3);
  assert.equal(killsLeftIn(w.rules, 'swarm'), 3);
  assert.equal(killsLeftInMob(w.rules, 'swarm'), 1);
  assert.equal(killsLeftIn(w.rules, 'slime'), 1);
  assert.ok(killsLeftIn(w.rules, 'tank') > 1);
  assert.equal(spawnFromQueue(w, 'slime', 100, 100).length, 1);
});

test('Roj: mobsLeft w Game nie skacze przy rozpakowaniu paczki', () => {
  const g = mk();
  g.world.phase = 'wave';
  g.world.wave = 8;
  g.director = { queue: ['swarm', 'slime'], done: false };
  assert.equal(g.snapshot(1).mobsLeft, 4);
  spawnFromQueue(g.world, 'swarm', 400, 400);
  g.director.queue = ['slime'];
  assert.equal(g.snapshot(1).mobsLeft, 4);
});

test('Roj: w kompozycji dopiero od fali 8', () => {
  for (let n = 1; n < 8; n++) for (let s = 1; s <= 20; s++) {
    const w = makeWorld({ players: [P(0, 0)] });
    assert.ok(!composeWave(w.rules, n, makeRng(s)).includes('swarm'), `fala ${n}`);
  }
  let seen = false;
  for (let s = 1; s <= 40 && !seen; s++) {
    const w = makeWorld({ players: [P(0, 0)] });
    seen = composeWave(w.rules, 12, makeRng(s)).includes('swarm');
  }
  assert.ok(seen);
});

test('Boss: poza kompozycja; fale 5, 10, 15 tak, 4 i 6 nie', () => {
  const w = makeWorld({ players: [P(0, 0)] });
  for (const n of [5, 10, 15]) assert.deepEqual(bossesForWave(w.rules, n), ['boss']);
  for (const n of [1, 4, 6, 9, 11]) assert.deepEqual(bossesForWave(w.rules, n), []);
  for (let n = 1; n <= 20; n++) assert.ok(!composeWave(w.rules, n, makeRng(n)).includes('boss'));
});

function gameAtWave(n) {
  const g = mk();
  g.world.wave = n - 1;
  g.breakLeft = 0;
  g.tick(DT);
  return g;
}

test('Boss: Game stawia go na starcie fali 5 (z normalna kompozycja), nie na 4 ani 6', () => {
  const g5 = gameAtWave(5);
  assert.equal(g5.world.wave, 5);
  assert.equal(g5.world.mobs.filter((m) => m.type === 'boss').length, 1);
  assert.ok(g5.director.pending > 0, 'zwykle potwory tez');
  for (const n of [4, 6]) assert.equal(gameAtWave(n).world.mobs.filter((m) => m.type === 'boss').length, 0);
});

test('Boss: HP skalowane jak innych, a mobsLeft i koniec fali go uwzgledniaja', () => {
  const g = gameAtWave(10);
  const boss = g.world.mobs.find((m) => m.type === 'boss');
  assert.equal(boss.hp, g.world.rules.mobHp('boss', 10));
  assert.equal(boss.hp, 1200 * (1 + 0.04 * 9));
  g.director.groups = []; g.director.current = null;
  g.world.mobs = [boss];
  assert.equal(g.snapshot(1).mobsLeft, 1);
  g.tick(DT);
  assert.equal(g.world.phase, 'wave', 'fala trwa, poki boss zyje');
  killMob(g.world, boss, 1);
  g.world.mobs.length = 0;
  g.tick(DT);
  assert.equal(g.world.phase, 'break');
});

test('Boss: cios obszarowy trafia wszystkich graczy w promieniu 2 kafelkow i nikogo dalej', () => {
  const w = makeWorld({ players: [P(40 * T + 30, 30 * T), P(40 * T, 30 * T + 20), P(40 * T - 30, 30 * T), P(40 * T + 3 * T + 8, 30 * T)] });
  const boss = addMob(w, 'boss', 40 * T, 30 * T);
  const ps = [...w.players.values()];
  const hp0 = ps.map((p) => p.hp);
  updateMobs(w, DT, hooks);
  const dmg = w.rules.mobDamage('boss');
  for (let i = 0; i < 3; i++) assert.equal(hp0[i] - ps[i].hp, dmg, `gracz ${i}`);
  assert.equal(ps[3].hp, hp0[3], 'poza promieniem');
  assert.ok(w.events.filter((e) => e.type === 'hurt').length >= 3);
  assert.ok(boss.attackCd > 1.9);
  // nastepny cios dopiero po 2 s
  updateMobs(w, DT, hooks);
  assert.equal(hp0[0] - ps[0].hp, dmg);
});

test('Boss: co 10 s przybywaja 4 slimaki, zdarzenie split', () => {
  const w = makeWorld({ players: [P(10, 10)] });
  w.players.get('p1').hp = 1e9;
  const boss = addMob(w, 'boss', 40 * T, 30 * T);
  run(w, 9.5);
  assert.equal(w.mobs.filter((m) => m.type === 'slime').length, 0);
  run(w, 1);
  assert.equal(w.mobs.filter((m) => m.type === 'slime').length, 4);
  assert.ok(w.events.some((e) => e.type === 'split' && e.id === boss.id));
  run(w, 10);
  assert.equal(w.mobs.filter((m) => m.type === 'slime').length, 8);
});

test('Boss: jednym ciosem rozwala sciane (100 obr.)', () => {
  assert.equal(makeWorld({ players: [P(0, 0)] }).rules.mobObjDamage('boss'), 100);
});

function caged(type) {
  const w = makeWorld({ players: [P(10, 10)] });
  const it = { id: w.nextId(), kind: 'cage', state: 'active', tx: 32, ty: 10, rot: 0, hp: 0, timeLeft: 8 };
  w.items.set(it.id, it);
  const mob = addMob(w, type, 33 * T, 11 * T);
  updateItems(w, DT);
  return { mob, it };
}

test('Klatka: nie lapie bossa, dalej lapie zwyklego potwora', () => {
  assert.equal(caged('boss').mob.frozen ?? 0, 0);
  assert.ok(caged('brute').mob.frozen > 0);
  assert.ok(caged('slime').mob.frozen > 0);
});

test('Boss: po smierci leza trzy przedmioty, gwarantowane; zwykly potwor dalej losuje', () => {
  for (let s = 0; s < 10; s++) {
    const w = makeWorld({ players: [P(10, 10)] });
    w.rng = makeRng(s + 1);
    const boss = addMob(w, 'boss', 300, 300);
    killMob(w, boss, 'p1');
    assert.equal([...w.items.values()].filter((i) => i.state === 'ground').length, 3);
    assert.equal(w.events.filter((e) => e.type === 'drop').length, 3);
  }
  const w = makeWorld({ players: [P(10, 10)] });
  w.wave = 2;
  w.rng = () => 0.99;
  onMobKilled(w, addMob(w, 'slime', 300, 300), 'p1');
  assert.equal(w.items.size, 0);
});

test('AoI: boss jest w snapshocie z drugiego konca mapy, zwykly potwor nie', () => {
  const g = mk();
  const w = g.world;
  const me = w.players.get(1);
  me.x = 50; me.y = 50;
  makeMob(w, 'slime', 70 * T, 50 * T);
  makeMob(w, 'boss', 70 * T, 50 * T);
  const types = g.snapshot(1).mobs.map((m) => m[1]);
  assert.deepEqual(types, ['boss']);
  assert.deepEqual(g.snapshot(1).mobs.map((m) => m[1]), ['boss']);
});

// Boss wzywa slimaki co 10 s bez konca. Bez sufitu dluga walka zasypywala plansze ponad maxAliveMobs,
// czyli ponad to, co PRD-PERF-01 obiecuje utrzymac przy 60 FPS.
test('wezwania bossa nie przekraczaja maxAliveMobs', () => {
  const w = makeWorld({ players: [P(10, 10)] });
  w.players.get('p1').hp = 1e9;
  addMob(w, 'boss', 40 * T, 30 * T);
  const cap = w.rules.balance.waves.maxAliveMobs;
  while (w.mobs.length < cap) addMob(w, 'slime', 20 * T, 20 * T);
  run(w, 60);
  assert.ok(w.mobs.length <= cap, `po minucie wzywania ${w.mobs.length} potworow przy sufcie ${cap}`);
});

test('boss wzywa dalej, gdy zrobi sie miejsce', () => {
  const w = makeWorld({ players: [P(10, 10)] });
  w.players.get('p1').hp = 1e9;
  addMob(w, 'boss', 40 * T, 30 * T);
  run(w, 10.5);
  assert.equal(w.mobs.length, 1 + balance.mobs.boss.summon.count);
});

// 03-WAVES-DIFFICULTY.md 2.2: fala z bossem to boss PLUS 60% normalnego skladu, a nie boss plus pelna fala.
test('fala z bossem ma mniejszy sklad zwyklych potworow', () => {
  const sum = (n) => {
    let t = 0;
    for (let seed = 1; seed <= 40; seed++) t += composeWave(mkRules(), n, makeRng(seed)).reduce((a, k) => a + balance.mobs[k].cost, 0);
    return t / 40;
  };
  const before = sum(9);
  const boss = sum(10);
  const after = sum(11);
  const normal = (before + after) / 2;
  const ratio = boss / normal;
  assert.ok(ratio > 0.5 && ratio < 0.75, `fala z bossem ma ${(100 * ratio).toFixed(0)}% skladu sasiednich fal`);
});
