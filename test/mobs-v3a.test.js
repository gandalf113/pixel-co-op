import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, makeWorld, addMob } from './helpers.js';
import { Game } from '../server/game.js';
import { updateMobs } from '../server/mobs.js';
import { updateBullets, spawnBullet, killMob, damageMob } from '../server/combat.js';
import { makeMob, splitCount } from '../server/mobspawn.js';
import { sizeBlocked } from '../server/flowfield.js';
import { composeWave } from '../server/waves.js';
import { makeRng } from '../server/rng.js';
import { makeRules } from '../server/balance.js';
import { buildGrid } from '../public/shared/world.js';
import { MV, MOB_KEY } from '../public/shared/mobview.js';
import { lerpEntities } from '../public/client/predict.js';
import { drawMobs, mobSpriteName } from '../public/client/render.js';

const DT = 1 / 30;
const T = 16;
const c = (t) => (t + 0.5) * T;
const hooks = { onObjectDestroyed() {} };
const first = (w) => w.players.get('p1');
const step = (w, n = 1) => { for (let i = 0; i < n; i++) updateMobs(w, DT, hooks); };
const ticks = (s) => Math.round(s / DT);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function placeBoulder(w, tx, ty) {
  const item = { id: w.nextId(), kind: 'boulder', state: 'placed', tx, ty, rot: 0, hp: 400 };
  w.items.set(item.id, item);
  w.grid = buildGrid(w.grid.w, w.grid.h, w.items.values());
  w.fieldsDirty = true;
  return item;
}

// Pionowa zapora na kolumnie tx z przejsciem o wysokosci `gap` kafelkow od wiersza 30.
function fence(w, tx, gap) {
  const boulders = [];
  for (let ty = 0; ty < w.grid.h; ty++) if (ty < 30 || ty >= 30 + gap) boulders.push(placeBoulder(w, tx, ty));
  return boulders;
}

const noSiege = (w, type) => {
  w.rules.balance = { ...balance, mobs: { ...balance.mobs, [type]: { ...balance.mobs[type], siege: false } } };
};

// --- 0. kat potwora w snapshocie ------------------------------------------------------------------

test('snapshot niesie jawny kat potwora, takze gdy stoi w miejscu', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 3 });
  const m = makeMob(g.world, 'slime', 100, 100);
  m.angle = 1.234;
  const row = g.snapshot(1).mobs.find((r) => r[MV.id] === m.id);
  assert.equal(row[MV.angle], 1.23);
  assert.equal(row.length, 12);
});

test('cofajaca sie plujka patrzy na gracza (kat z serwera), nie w kierunku ruchu', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  const m = addMob(w, 'spitter', c(30) + 3 * T, c(30)); // blizej niz keepTiles = 5, wiec sie cofa
  const x0 = m.x;
  step(w, ticks(0.5));
  assert.ok(m.x > x0 + 4, 'cofa sie od gracza');
  assert.ok(Math.abs(Math.abs(m.angle) - Math.PI) < 0.05, `kat ${m.angle}`);
});

test('potwor w zwarciu patrzy na gracza', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  const m = addMob(w, 'slime', c(30), c(30) + 10);
  step(w, 2);
  assert.ok(Math.abs(m.angle + Math.PI / 2) < 0.05);
});

test('klient interpoluje kat najkrotsza droga i rysuje potwora pod katem z snapshotu', () => {
  const row = (angle, x) => [7, 'slime', x, 50, 30, 30, 0, 0, 0, angle, 0, 0];
  const [mid] = lerpEntities([row(3.0, 10)], [row(-3.0, 10)], 0.5, MOB_KEY);
  assert.ok(Math.abs(Math.abs(mid[MV.angle]) - Math.PI) < 0.2, `przez zero byloby ${0}, jest ${mid[MV.angle]}`);

  const rot = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'rotate' ? (a) => rot.push(a) : k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const sprites = { get: () => ({ width: 16, height: 16 }) };
  // potwor stoi (brak roznicy pozycji miedzy klatkami) - stary kod zgadywal wtedy kat 0
  drawMobs(ctx, { sprites, frame: 0, mobs: [row(1.5, 10)], balance, fx: null, nowMs: 0 }, 0, 0);
  assert.deepEqual(rot, [1.5]);
});

// --- 1. V3-A-01: duze sylwetki ----------------------------------------------------------------

test('radiusPx duzych potworow odpowiada sylwetce i rosnie z nia', () => {
  const r = (t) => balance.mobs[t].radiusPx;
  assert.ok(r('stalker') > 8 && r('ninja') > 8 && r('tank') > r('stalker') * 2 - 1);
  assert.ok(r('tank') <= 32 && r('stalker') <= 16);
});

test('spawn duzego potwora przy krawedzi mapy jest przycinany promieniem', () => {
  const w = makeWorld();
  const m = makeMob(w, 'tank', 0, 0);
  assert.equal(m.x, 22);
  assert.equal(m.y, 22);
});

test('separacja uwzglednia faktyczne promienie duzych', () => {
  const w = makeWorld();
  const a = addMob(w, 'tank', c(30), c(30));
  const b = addMob(w, 'runner', c(30), c(30));
  step(w, ticks(0.5));
  assert.ok(dist(a, b) >= 22 + 5 - 1);
});

test('mapa zablokowanych kafelkow: waskie przejscie zamkniete dla duzych, otwarte dla malych', () => {
  const w = makeWorld();
  assert.equal(sizeBlocked(w.grid, 6, T), null);
  const gate = (gap) => {
    const x = makeWorld();
    fence(x, 40, gap);
    return x.grid;
  };
  const open = (grid, r, ty) => sizeBlocked(grid, r, T)[ty * grid.w + 40] === 0;
  assert.ok(!open(gate(1), 10, 30), 'stalker 1 kafelek');
  assert.ok(open(gate(2), 10, 30) || open(gate(2), 10, 31), 'stalker 2 kafelki');
  assert.ok(![29, 30, 31, 32].some((ty) => open(gate(2), 22, ty)), 'tank 2 kafelki');
  assert.ok([30, 31, 32].some((ty) => open(gate(3), 22, ty)), 'tank 3 kafelki');
});

function crossing(type, gap, seconds, tweak = () => {}) {
  const w = makeWorld({ players: [{ x: c(48), y: c(31) }] });
  tweak(w);
  const wall = fence(w, 40, gap);
  const m = addMob(w, type, c(32), c(31));
  if (type === 'stalker') m.stealth = { hide: false, left: 1e9, dir: 1 }; // jawny: idzie sciezka
  const xs = [];
  for (let i = 0; i < ticks(seconds); i++) {
    step(w);
    xs.push(m.x);
  }
  return { w, m, wall, xs };
}

test('duzy potwor przechodzi przejscie szersze od sylwetki bez niszczenia zapory i bez zakleszczenia', () => {
  const stalker = crossing('stalker', 2, 12);
  assert.ok(stalker.m.x > 41 * T, `stalker x=${stalker.m.x}`);
  assert.ok(stalker.wall.every((b) => b.hp === 400));
  const tank = crossing('tank', 3, 20, (w) => noSiege(w, 'tank'));
  assert.ok(tank.m.x > 41 * T, `tank x=${tank.m.x}`);
  assert.ok(tank.wall.every((b) => b.hp === 400));
  // brak drgan: w polowie czasu ruchu nie ma cofniec wiekszych niz kilka px
  let worstBack = 0;
  for (let i = 1; i < tank.xs.length; i++) worstBack = Math.max(worstBack, tank.xs[i - 1] - tank.xs[i]);
  assert.ok(worstBack < 3, `cofniecie ${worstBack}`);
});

test('duzy potwor nie przechodzi przejscia wezszego od sylwetki - nie wciska sie, tylko ostrzeliwuje zapore', () => {
  const stalker = crossing('stalker', 1, 12);
  assert.ok(stalker.m.x < 40 * T, `stalker x=${stalker.m.x}`);
  assert.ok(stalker.wall.some((b) => b.hp < 400), 'zapora atakowana');
  const tank = crossing('tank', 2, 8);
  assert.ok(tank.m.x < 40 * T - 22 + 1e-6, `tank x=${tank.m.x}`);
  assert.ok(tank.wall.some((b) => b.hp < 400), 'zapora atakowana');
  for (const { xs } of [stalker, tank]) {
    // nie drga: po dojsciu do zapory pozycja sie stabilizuje
    const tail = xs.slice(-30);
    assert.ok(Math.max(...tail) - Math.min(...tail) < 3, 'drgania przy scianie');
  }
});

// --- 2. V3-A-05: skradajacy sie -------------------------------------------------------------------

test('skradajacy sie w stealth jest nietykalny: pocisk przelatuje, brak trafienia, a po wyjsciu zadaje', () => {
  const w = makeWorld({ players: [{ x: c(20), y: c(30) }] });
  const m = addMob(w, 'stalker', c(26), c(30));
  m.invul = true;
  const shoot = () => spawnBullet(w, { owner: 'p1', fromTurret: false, x: c(22), y: c(30), angle: 0, damage: 8, speedPx: 450, rangePx: 200 });
  const hp0 = m.hp;
  shoot();
  for (let i = 0; i < 20; i++) updateBullets(w, DT);
  assert.equal(m.hp, hp0);
  assert.equal(w.events.filter((e) => e.type === 'hit').length, 0);
  assert.equal(w.bullets.length, 0, 'pocisk doleciał do końca zasięgu');
  damageMob(w, m, 50, 'p1');
  assert.equal(m.hp, hp0, 'zadne obrazenia nie przechodza');
  m.invul = false;
  shoot();
  for (let i = 0; i < 10; i++) updateBullets(w, DT);
  assert.equal(m.hp, hp0 - 8);
  assert.ok(w.events.some((e) => e.type === 'hit' && e.mob === m.id));
});

test('stan nietykalnosci jest w snapshocie', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 3 });
  const m = makeMob(g.world, 'stalker', 200, 200);
  m.invul = true;
  assert.equal(g.snapshot(1).mobs.find((r) => r[MV.id] === m.id)[MV.invul], 1);
  m.invul = false;
  assert.equal(g.snapshot(1).mobs.find((r) => r[MV.id] === m.id)[MV.invul], 0);
});

test('cykl skradajacego sie: stealth 4-6 s, jawny 3-4 s, zaczyna ukryty', () => {
  const w = makeWorld({ players: [{ x: c(70), y: c(50) }] });
  const m = addMob(w, 'stalker', c(10), c(10));
  const spans = [];
  let cur = null;
  let since = 0;
  const N = ticks(80);
  for (let i = 0; i < N; i++) {
    step(w);
    const now = (i + 1) * DT;
    if (cur === null) cur = m.invul;
    else if (m.invul !== cur) {
      spans.push({ hide: cur, len: now - since });
      cur = m.invul;
      since = now;
    }
  }
  assert.ok(spans.length >= 8, `faz: ${spans.length}`);
  assert.equal(spans[0].hide, true);
  for (const s of spans) {
    const [lo, hi] = s.hide ? [4, 6] : [3, 4];
    assert.ok(s.len >= lo - DT * 1.5 && s.len <= hi + DT * 1.5, `${s.hide ? 'stealth' : 'jawny'} ${s.len.toFixed(2)} s`);
  }
  assert.ok(spans.some((s) => s.len % 1 !== 0) && new Set(spans.map((s) => s.len.toFixed(2))).size > 3, 'czasy sa losowe');
});

test('w stealth tor jest styczny do gracza, nie wprost na niego; po wyjsciu idzie prosto', () => {
  const w = makeWorld({ players: [{ x: c(40), y: c(30) }] });
  const m = addMob(w, 'stalker', c(30), c(30));
  const d0 = dist(m, first(w));
  let worst = 0;
  let moved = 0;
  for (let i = 0; i < ticks(1.5); i++) {
    const { x, y } = m;
    const p = first(w);
    step(w);
    assert.equal(m.invul, true);
    const dx = m.x - x;
    const dy = m.y - y;
    const len = Math.hypot(dx, dy);
    moved += len;
    const rx = p.x - x;
    const ry = p.y - y;
    worst = Math.max(worst, Math.abs((dx * rx + dy * ry) / (len * Math.hypot(rx, ry))));
  }
  assert.ok(moved > 10, 'porusza sie');
  assert.ok(worst < 0.01, `skladowa promieniowa ${worst}`);
  assert.ok(dist(m, first(w)) >= d0 - 0.5, 'nie zbliza sie w stealth');

  // przejscie w tryb jawny: zdarzenie `reveal`, potem dystans maleje o ~speed
  w.events.length = 0;
  while (m.invul) step(w);
  assert.ok(w.events.some((e) => e.type === 'reveal' && e.id === m.id));
  const before = dist(m, first(w));
  step(w, ticks(0.5));
  const speed = balance.mobs.stalker.speedTiles * T;
  assert.ok(before - dist(m, first(w)) > speed * 0.5 * 0.8, 'idzie na gracza');
});

test('skradajacy sie nie bije w ukryciu', () => {
  const w = makeWorld({ players: [{ x: c(30), y: c(30) }] });
  const m = addMob(w, 'stalker', c(30) + 14, c(30));
  m.stealth = { hide: true, left: 3, dir: 1 };
  step(w, ticks(2));
  assert.equal(first(w).hp, 100);
  m.stealth.left = 0.01;
  step(w, 3);
  assert.equal(m.invul, false);
  step(w, ticks(0.5));
  assert.ok(first(w).hp < 100);
});

// --- 3. V3-A-06: tank --------------------------------------------------------------------------------

const waveGame = (difficulty = 2) => {
  const g = new Game({ balance, difficulty, players: [{ id: 1, nick: 'A', color: 0 }], seed: 5 });
  for (let i = 0; i < ticks(15.1); i++) g.tick(DT);
  assert.equal(g.phase, 'wave');
  g.world.mobs.length = 0;
  g.director.queue = [];
  g.world.items.clear();
  g.world.grid = buildGrid(g.world.grid.w, g.world.grid.h, []);
  const p = g.world.players.get(1);
  p.x = 100;
  p.y = 100;
  return g;
};

test('tank: 600 HP na Normalnym, szare progi koloru z hp/maxHp, bez dodatkowego pola w snapshocie', () => {
  const rules = makeRules(balance, 2, 1);
  assert.equal(rules.mobHp('tank', 1), 600);
  const cfg = balance.mobs.tank;
  assert.deepEqual([1, 0.76, 0.75, 0.5, 0.3, 0.25, 0.01].map((f) => mobSpriteName(cfg, 'tank', 0, f * 600, 600)), [
    'tank_0', 'tank_0', 'tank_0_dmg_1', 'tank_0_dmg_2', 'tank_0_dmg_2', 'tank_0_dmg_3', 'tank_0_dmg_3',
  ]);
  assert.equal(mobSpriteName(balance.mobs.slime, 'slime', 1, 1, 30), 'slime_1');
});

test('tank po smierci rozpada sie na N runnerow, promieniscie, na wolnych kafelkach', () => {
  for (const [difficulty, n] of [[1, 5], [2, 6], [3, 8], [4, 9]]) {
    const g = waveGame(difficulty);
    const w = g.world;
    assert.equal(splitCount(w.rules, 'tank'), n);
    placeBoulder(w, 28, 30);
    const tank = makeMob(w, 'tank', c(30), c(30));
    killMob(w, tank, 1);
    assert.equal(w.mobs.length, n);
    assert.ok(w.mobs.every((m) => m.type === 'runner' && m.hp > 0));
    for (const m of w.mobs) {
      assert.ok(dist(m, tank) > 5, 'rozrzucone, nie w jednym punkcie');
      assert.ok(!w.grid.isSolid(Math.floor(m.x / T), Math.floor(m.y / T)), 'nie w scianie');
    }
    const angles = w.mobs.map((m) => Math.atan2(m.y - tank.y, m.x - tank.x)).sort((a, b) => a - b);
    const gaps = angles.map((a, i) => (i ? a - angles[i - 1] : a + 2 * Math.PI - angles[n - 1]));
    assert.ok(Math.max(...gaps) < (2 * Math.PI * 2.2) / n, 'rownomiernie wokol');
  }
});

test('fala nie konczy sie, poki zyja runnery z tanka; licznik mobsLeft zgadza sie i nie skacze', () => {
  const g = waveGame();
  const w = g.world;
  const left = () => g.snapshot(1).mobsLeft;
  const tank = makeMob(w, 'tank', c(30), c(30));
  assert.equal(left(), 7, 'zywy tank to 1 + 6 potomkow');
  g.tick(DT);
  assert.equal(g.phase, 'wave');
  killMob(w, tank, 1);
  assert.equal(left(), 6, 'smierc tanka: 7 -> 6, bez skoku w gore');
  assert.equal(left(), w.mobs.length);
  const seen = [];
  while (w.mobs.length) {
    g.tick(DT);
    assert.equal(g.phase, 'wave', 'fala trwa, dopoki zyja runnery');
    seen.push(left());
    killMob(w, w.mobs[0], 1);
    seen.push(left());
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1], `licznik rosnie: ${seen.join(',')}`);
  assert.equal(left(), 0);
  g.tick(DT);
  assert.equal(g.phase, 'break');
});

test('tank w kolejce spawnu liczy sie tak samo jak zywy; przejscie kolejka -> swiat nie zmienia licznika', () => {
  const g = waveGame();
  g.director.queue = ['tank', 'slime'];
  const left = () => g.snapshot(1).mobsLeft;
  assert.equal(left(), 8);
  const series = [];
  for (let i = 0; i < ticks(9); i++) {
    g.tick(DT);
    series.push(left());
  }
  assert.ok(g.world.mobs.some((m) => m.type === 'tank'), 'tank wyszedl z kolejki');
  assert.ok(series.every((v) => v === 8), series.join(','));
});

test('tank jest oblezniczy: niszczy zapore na swojej drodze', () => {
  const crossingTank = crossing('tank', 2, 25);
  assert.ok(crossingTank.wall.some((b) => b.hp < 400));
});

// --- 4. V3-A-07: ninja ---------------------------------------------------------------------------------

function ninjaWorld(px = 44, py = 30) {
  const w = makeWorld({ players: [{ x: c(px), y: c(py) }] });
  const m = addMob(w, 'ninja', c(30), c(30));
  return { w, m, p: first(w) };
}

function untilPhase(w, m, phase, max = 10) {
  for (let i = 0; i < ticks(max) && m.ninja?.phase !== phase; i++) step(w);
  assert.equal(m.ninja?.phase, phase);
}

test('ninja: wandering 1-2 s, potem telegraf 0.6 s, potem szarza, potem znowu wandering', () => {
  const { w, m } = ninjaWorld();
  let t = 0;
  const marks = [];
  let phase = null;
  for (let i = 0; i < ticks(14) && marks.length < 6; i++) {
    step(w);
    t += DT;
    const ph = m.ninja.phase;
    if (ph !== phase) {
      marks.push({ ph, t });
      phase = ph;
    }
  }
  const dur = (i) => marks[i + 1].t - marks[i].t;
  assert.deepEqual(marks.slice(0, 5).map((x) => x.ph), ['wander', 'telegraph', 'charge', 'wander', 'telegraph']);
  assert.ok(dur(0) >= 1 - DT && dur(0) <= 2 + DT * 2, `wandering ${dur(0)}`);
  assert.ok(Math.abs(dur(1) - 0.6) <= DT * 1.5, `telegraf ${dur(1)}`);
  assert.ok(dur(2) > 0 && dur(2) < 1.3, `szarza ${dur(2)}`);
  assert.ok(dur(3) >= 1 - DT * 2 && dur(3) <= 2 + DT * 2, `wandering po szarzy ${dur(3)}`);
});

test('ninja: trajektoria ustalona w chwili telegrafu nie sledzi gracza, uskok dziala', () => {
  const { w, m, p } = ninjaWorld();
  untilPhase(w, m, 'telegraph');
  const fixed = { ang: m.ninja.ang, len: m.ninja.len, x: m.x, y: m.y };
  assert.ok(m.tele > 0 && Math.abs(m.tele - fixed.len) < 1e-9, 'telegraf ma dlugosc trajektorii');
  assert.ok(fixed.len <= balance.mobs.ninja.charge.maxTiles * T + 1e-9);
  // snapshot: kat + dlugosc
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 1 });
  g.world.mobs.push(m);
  const row = g.snapshot(1).mobs.find((r) => r[MV.id] === m.id);
  assert.equal(row[MV.tele], Math.round(fixed.len * 10) / 10);
  assert.equal(row[MV.angle], Math.round(fixed.ang * 100) / 100);
  // gracz uskakuje w bok o 6 kafelkow
  p.y += 6 * T;
  while (m.ninja.phase === 'telegraph') {
    step(w);
    assert.equal(m.ninja.ang, fixed.ang);
    assert.equal(m.ninja.len, fixed.len);
    assert.equal(m.angle, fixed.ang);
    assert.equal(m.x, fixed.x);
  }
  assert.equal(m.ninja.phase, 'charge');
  const trail = [];
  while (m.ninja.phase === 'charge') {
    step(w);
    trail.push([m.x, m.y]);
  }
  for (const [x, y] of trail) {
    const cross = Math.abs((x - fixed.x) * Math.sin(fixed.ang) - (y - fixed.y) * Math.cos(fixed.ang));
    assert.ok(cross < 0.01, 'dokladnie po zapowiedzianej linii');
  }
  const [ex, ey] = trail.at(-1);
  assert.ok(Math.abs(Math.hypot(ex - fixed.x, ey - fixed.y) - fixed.len) < 0.5, 'dlugosc szarzy = dlugosc telegrafu');
  assert.equal(p.hp, 100, 'uskok = brak obrazen');
});

test('ninja: szarza zadaje obrazenia przy przejsciu przez gracza raz, a potem wraca do wanderingu', () => {
  const { w, m, p } = ninjaWorld(40, 30);
  const dmg = 22;
  untilPhase(w, m, 'charge');
  const hpSeries = [];
  while (m.ninja.phase === 'charge') {
    step(w);
    hpSeries.push(p.hp);
  }
  assert.equal(p.hp, 100 - dmg, 'dokladnie jedno trafienie');
  assert.equal(hpSeries.filter((h, i) => i && h !== hpSeries[i - 1]).length <= 1, true);
  assert.equal(w.events.filter((e) => e.type === 'hurt').length, 1);
  assert.equal(m.ninja.phase, 'wander');
  assert.equal(m.tele, 0);
  // gracz stoi w tym samym miejscu, ale nastepna szarza dopiero po kolejnym telegrafie
  step(w, ticks(0.5));
  assert.equal(p.hp, 100 - dmg);
  untilPhase(w, m, 'telegraph');
  untilPhase(w, m, 'wander');
  assert.ok(p.hp <= 100 - dmg && p.hp >= 100 - 2 * dmg);
});

test('ninja: szarza zatrzymuje sie na scianie i uszkadza ja za objDamage', () => {
  const { w, m } = ninjaWorld(44, 30);
  const wall = placeBoulder(w, 34, 30);
  m.ninja = { phase: 'wander', left: 0 };
  untilPhase(w, m, 'charge');
  while (m.ninja.phase === 'charge') step(w);
  assert.ok(m.x < 34 * T, 'nie przeszedl przez glaz');
  assert.equal(wall.hp, 400 - balance.mobs.ninja.objDamage);
});

// --- 5. Fale ----------------------------------------------------------------------------------------

test('nowe typy wchodza do fal dopiero od swojej fali, a budzet sie nie psuje', () => {
  const rules = makeRules(balance, 2, 1);
  const cheapest = (n) => Math.min(...Object.values(balance.mobs).filter((m) => m.fromWave <= n).map((m) => m.cost));
  const seenFrom = { stalker: Infinity, ninja: Infinity, tank: Infinity };
  for (let n = 1; n <= 30; n++) {
    for (let seed = 1; seed <= 40; seed++) {
      const comp = composeWave(rules, n, makeRng(seed));
      const cost = comp.reduce((s, t) => s + balance.mobs[t].cost, 0);
      const budget = rules.waveBudget(n);
      assert.ok(cost <= budget + 1e-9, `fala ${n}: koszt ${cost} > budzet ${budget}`);
      assert.ok(cost > budget - cheapest(n) - 1e-9, `fala ${n}: niewykorzystany budzet`);
      for (const t of comp) {
        assert.ok(balance.mobs[t].fromWave <= n, `${t} w fali ${n}`);
        if (t in seenFrom) seenFrom[t] = Math.min(seenFrom[t], n);
      }
    }
  }
  assert.deepEqual(seenFrom, { stalker: 7, ninja: 8, tank: 10 });
  assert.deepEqual([balance.mobs.stalker, balance.mobs.ninja, balance.mobs.tank].map((m) => [m.fromWave, m.cost, m.weight, m.drop]), [
    [7, 3, 12, 0.35], [8, 4, 8, 0.45], [10, 8, 6, 0.6],
  ]);
  assert.deepEqual([balance.ultimate.droplets.stalker, balance.ultimate.droplets.tank, balance.ultimate.droplets.ninja], [2, 5, 3]);
});

// --- 5. zdarzenia dzwiekowe ------------------------------------------------------------------------------

test('ninja: ninjaTele raz na cykl, w chwili wejscia w telegraf; ninjaCharge raz na szarze', () => {
  const { w, m } = ninjaWorld();
  const cnt = (t) => w.events.filter((e) => e.type === t).length;
  for (let cycle = 1; cycle <= 2; cycle++) {
    untilPhase(w, m, 'telegraph');
    assert.equal(cnt('ninjaTele'), cycle);
    assert.equal(cnt('ninjaCharge'), cycle - 1, 'szarzy jeszcze nie ma');
    const ev = w.events.filter((e) => e.type === 'ninjaTele').pop();
    assert.deepEqual([ev.id, ev.x, ev.y], [m.id, m.x, m.y]);
    step(w, 3); // telegraf trwa dalej: bez powtorek
    assert.equal(cnt('ninjaTele'), cycle);
    untilPhase(w, m, 'charge');
    assert.equal(cnt('ninjaCharge'), cycle);
    untilPhase(w, m, 'wander');
    assert.equal(cnt('ninjaCharge'), cycle);
    assert.equal(cnt('ninjaTele'), cycle);
  }
});

test('tank: split raz na rozpad, z pozycja tanka', () => {
  const w = makeWorld({ players: [{ x: c(44), y: c(30) }] });
  const tank = addMob(w, 'tank', c(30), c(30));
  const { x, y } = tank;
  killMob(w, tank, 1);
  const ev = w.events.filter((e) => e.type === 'split');
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].x, ev[0].y], [x, y]);
});
