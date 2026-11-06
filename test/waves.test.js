import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance, makeRules } from '../server/balance.js';
import { makeRng } from '../server/rng.js';
import { composeWave, composeGroups, pickExcluded, spawnPoints, SpawnDirector } from '../server/waves.js';

const b = loadBalance();
const rules = makeRules(b, 2, 1);
const cost = (comp) => comp.reduce((s, t) => s + b.mobs[t].cost, 0);

test('wave 1 only slimes within budget', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const comp = composeWave(rules, 1, makeRng(seed));
    assert.ok(comp.every((t) => t === 'slime'));
    assert.ok(cost(comp) <= 17 && cost(comp) > 16);
  }
});

test('wave 2 unlocks runners', () => {
  let runners = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const comp = composeWave(rules, 2, makeRng(seed));
    assert.ok(!comp.includes('brute'));
    if (comp.includes('runner')) runners++;
  }
  assert.ok(runners > 0);
});

test('brute guaranteed from wave 4, unless it is the type excluded in that wave', () => {
  // Od fali 3 jeden typ wypada z fali; wymuszony osilek nie moze go obejsc, wiec asercja
  // "zawsze jest osilek" zamienila sie na "jest, chyba ze to on wypadl".
  let missing = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const excluded = pickExcluded(rules, 4, makeRng(seed));
    const has = composeWave(rules, 4, makeRng(seed)).includes('brute');
    if (excluded === 'brute') { assert.ok(!has); missing++; } else assert.ok(has);
  }
  assert.ok(missing < 60);
});

test('fala 4 zuzywa caly budzet, fala 5 tylko 60% (bo dochodzi boss)', () => {
  // Dawniej fala 5 brala caly budzet, bo bossa nie bylo w kodzie. 03-WAVES-DIFFICULTY.md 2.2 od zawsze
  // mowil "Boss plus 60% normalnego budzetu" — od v0.14.0 kod wreszcie to robi.
  const mul = b.waves.bossWaveBudgetMul;
  for (let seed = 1; seed <= 20; seed++) {
    const c4 = cost(composeWave(rules, 4, makeRng(seed)));
    assert.ok(c4 > rules.waveBudget(4) - 1.5 && c4 <= rules.waveBudget(4), `fala 4: ${c4}`);
    const c5 = cost(composeWave(rules, 5, makeRng(seed)));
    assert.ok(c5 > 51 * mul - 1.5 && c5 <= 51 * mul, `fala 5: ${c5}`);
  }
});

test('group release and interval', () => {
  // Dawniej co 4 s wychodzilo batchSize (3) sztuk; teraz co 4 s wychodzi cala jedna GRUPA.
  const comp = composeWave(rules, 1, makeRng(1));
  const d = new SpawnDirector(rules, 1, comp, makeRng(2));
  assert.equal(d.pending, comp.length);
  const first = d.update(0, 0, []);
  assert.equal(first.length, comp.groups[0].length);
  assert.deepEqual(d.update(3.9, 3, []), []);
  assert.equal(d.update(0.1, 3, []).length, comp.groups[1].length);
  assert.equal(d.done, false);
});

test('alive cap 60', () => {
  const d = new SpawnDirector(rules, 1, Array(100).fill('slime'), makeRng(1));
  assert.equal(d.update(0, 59, []).length, 1);
  assert.equal(d.pending, 99);
  assert.equal(d.update(4, 60, []).length, 0);
  assert.equal(d.pending, 99);
});

test('spawn away from players', () => {
  const pts = spawnPoints(rules);
  const player = { x: pts[0].x, y: pts[0].y };
  const d = new SpawnDirector(rules, 1, Array(150).fill('slime'), makeRng(5));
  let batches = 0;
  for (let i = 0; i < 50; i++) {
    for (const m of d.update(4, 0, [player])) {
      assert.ok(Math.hypot(m.x - player.x, m.y - player.y) > 280 - 4 * Math.SQRT2);
    }
    batches++;
  }
  assert.equal(batches, 50);
  assert.equal(d.done, true);
});

test('spawn points on perimeter', () => {
  const pts = spawnPoints(rules);
  const { tilesW, tilesH, tilePx } = b.map;
  assert.equal(pts.length, 12);
  for (const p of pts) {
    const tx = Math.floor(p.x / tilePx), ty = Math.floor(p.y / tilePx);
    assert.ok(tx === 0 || ty === 0 || tx === tilesW - 1 || ty === tilesH - 1);
    assert.equal(p.x, tx * tilePx + tilePx / 2);
    assert.equal(p.y, ty * tilePx + tilePx / 2);
  }
});

// --- grupy, wykluczenie typu -----------------------------------------------------------------

const mixedOnly = (g) => new Set(g).size;

test('fala dzieli sie na kilka grup, zdominowanych przez jeden typ; budzet sie zgadza', () => {
  for (const n of [1, 3, 5, 8, 12]) {
    let totalGroups = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const groups = composeGroups(rules, n, makeRng(seed));
      const flat = groups.flat();
      assert.deepEqual(flat, [...composeWave(rules, n, makeRng(seed))]);
      assert.ok(groups.every((g) => g.length >= 1 && mixedOnly(g) <= 2 || g.length === 1));
      const c = cost(flat);
      assert.ok(c <= rules.waveBudget(n) + 1e-9);
      totalGroups += groups.length;
    }
    const avg = totalGroups / 40;
    assert.ok(avg >= 3 && avg <= 15, `fala ${n}: srednio ${avg} grup`);
  }
});

test('grupy sa glownie jednotypowe, czesc mieszana', () => {
  let single = 0, mixed = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const g of composeGroups(rules, 8, makeRng(seed))) {
      if (g.length < 2 || g[0] === 'brute') continue;
      if (mixedOnly(g) === 1) single++; else mixed++;
    }
  }
  assert.ok(single > mixed && mixed > 0, `${single} / ${mixed}`);
});

test('kolejnosc grup zmienia sie z ziarnem, a to samo ziarno daje te sama fale', () => {
  const firsts = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const g = composeGroups(rules, 8, makeRng(seed));
    firsts.add(g[0][0]);
    assert.deepEqual(g, composeGroups(rules, 8, makeRng(seed)));
  }
  assert.ok(firsts.size >= 3, 'pierwsza grupa nie moze byc zawsze tym samym typem');
});

test('od fali 3 dokladnie jeden dostepny typ nie wystepuje; wczesniej zaden nie wypada', () => {
  for (let n = 1; n <= 12; n++) {
    const avail = Object.keys(b.mobs).filter((t) => b.mobs[t].fromWave <= n);
    for (let seed = 1; seed <= 40; seed++) {
      const present = new Set(composeWave(rules, n, makeRng(seed)));
      const absent = avail.filter((t) => !present.has(t));
      if (n < 3) assert.equal(pickExcluded(rules, n, makeRng(seed)), null); // wczesniej brak wykluczenia (typ moze brakowac z losu)
      else assert.ok(absent.length >= 1);
      if (n >= 3) assert.equal(pickExcluded(rules, n, makeRng(seed)) !== null, true);
    }
  }
  // dokladnie jeden: pickExcluded zwraca jeden typ, a on sie nie pojawia
  for (let seed = 1; seed <= 40; seed++) {
    const ex = pickExcluded(rules, 10, makeRng(seed));
    assert.ok(!composeWave(rules, 10, makeRng(seed)).includes(ex));
  }
});

test('wypada najczesciej slimak, najrzadziej tank (wazone weight)', () => {
  const cnt = {};
  for (let seed = 1; seed <= 2000; seed++) {
    const t = pickExcluded(rules, 10, makeRng(seed));
    cnt[t] = (cnt[t] ?? 0) + 1;
  }
  assert.ok(cnt.slime > cnt.runner && cnt.runner > cnt.tank, JSON.stringify(cnt));
  assert.ok(cnt.slime > 5 * cnt.tank, JSON.stringify(cnt));
});

test('przy jednym dostepnym typie nie ma wykluczenia', () => {
  const only = { ...b, mobs: { slime: b.mobs.slime } };
  const r = makeRules(only, 2, 1);
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(pickExcluded(r, 5, makeRng(seed)), null);
    assert.ok(composeWave(r, 5, makeRng(seed)).includes('slime'));
  }
});

test('nowy typ w balance.mobs dziala bez zmian w kodzie', () => {
  const extra = { ...b, mobs: { ...b.mobs, zzz: { ...b.mobs.slime, fromWave: 1, weight: 40, cost: 2 } } };
  const r = makeRules(extra, 2, 1);
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const comp = composeWave(r, 2, makeRng(seed));
    if (comp.includes('zzz')) seen++;
    assert.ok(comp.reduce((s, t) => s + extra.mobs[t].cost, 0) <= r.waveBudget(2) + 1e-9);
  }
  assert.ok(seen > 0);
});

test('wymuszony osilek nie wchodzi, gdy to on wypadl; w innym razie jest', () => {
  let excludedCase = 0, presentCase = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const ex = pickExcluded(rules, 5, makeRng(seed));
    const comp = composeWave(rules, 5, makeRng(seed));
    if (ex === 'brute') { assert.ok(!comp.includes('brute')); excludedCase++; }
    else { assert.ok(comp.includes('brute')); presentCase++; }
  }
  assert.ok(excludedCase > 0 && presentCase > 0);
});

test('grupa wychodzi z jednego punktu (lub dwoch sasiednich), nic nie ginie przy limicie', () => {
  const pts = spawnPoints(rules);
  const idxOf = (m) => pts.findIndex((p) => Math.hypot(p.x - m.x, p.y - m.y) < 6);
  for (let seed = 1; seed <= 30; seed++) {
    const comp = composeWave(rules, 8, makeRng(seed));
    const d = new SpawnDirector(rules, 8, comp, makeRng(seed + 100));
    const spawned = [];
    let alive = 0;
    for (let step = 0; step < 400 && !d.done; step++) {
      // symulacja: swiat "zjada" potwory, zywych jest zawsze kilkadziesiat, czasem pelny limit
      alive = step % 3 === 0 ? 58 : 0;
      const out = d.update(4, alive, []);
      if (out.length === 0) continue;
      const idx = new Set(out.map(idxOf));
      assert.ok(!idx.has(-1));
      assert.ok(idx.size <= 2, 'grupa rozrzucona');
      if (idx.size === 2) {
        const [a, c] = [...idx];
        const diff = Math.abs(a - c);
        assert.ok(diff === 1 || diff === pts.length - 1, 'punkty nie sa sasiednie');
      }
      assert.ok(out.length <= 60 - alive);
      spawned.push(...out.map((m) => m.type));
    }
    assert.ok(d.done);
    assert.deepEqual([...spawned].sort(), [...comp].sort(), 'cos zginelo');
  }
});

test('grupa, ktora nie miesci sie w limicie, dolewa sie w kolejnych krokach z tego samego kierunku', () => {
  const d = new SpawnDirector(rules, 1, Object.assign(Array(20).fill('slime'), {}), makeRng(3));
  d.queue = Array(20).fill('slime');
  const pts = spawnPoints(rules);
  const a = d.update(4, 50, []);
  assert.equal(a.length, 10);
  const b2 = d.update(4, 50, []);
  assert.equal(b2.length, 10);
  assert.equal(d.pending, 0);
  const near = (m, p) => Math.hypot(m.x - p.x, m.y - p.y) < 6;
  const set = (arr) => new Set(arr.map((m) => pts.findIndex((p) => near(m, p))));
  assert.ok(set(a.concat(b2)).size <= 2);
});

test('queue jest plaska lista typow (game.js liczy z niej mobsLeft)', () => {
  const comp = composeWave(rules, 6, makeRng(4));
  const d = new SpawnDirector(rules, 6, comp, makeRng(5));
  assert.deepEqual(d.queue, [...comp]);
  d.update(4, 0, []);
  assert.equal(d.queue.length, d.pending);
  assert.ok(d.queue.every((t) => typeof t === 'string'));
});

test('boost broni: waga 4 w kategorii power', () => {
  const power = Object.values(b.items).filter((i) => i.category === 'power');
  const sum = power.reduce((s, i) => s + i.weight, 0);
  assert.equal(b.items.weaponboost.weight, 4);
  assert.equal(sum, 96);
});

// Roj (`pack: 3`) rozpakowuje sie na trzy potwory z jednego wpisu kolejki. Zanim to policzono w potworach,
// a nie we wpisach, fala 12 potrafila postawic 105 zywych przy limicie 60 i grupe 72 sztuk z jednego punktu.
const mobsIn = (list) => list.reduce((s, t) => s + (b.mobs[t].pack ?? 1), 0);

test('grupa liczy POTWORY, nie wpisy kolejki (Roj to paczka po 3)', () => {
  const cap = b.waves.groupMaxMobs;
  const maxPack = Math.max(...Object.values(b.mobs).map((m) => m.pack ?? 1));
  for (const wave of [8, 10, 12, 15]) {
    for (let seed = 1; seed <= 30; seed++) {
      for (const g of composeGroups(rules, wave, makeRng(seed))) {
        // ostatnia paczka moze przekroczyc limit o swoj rozmiar minus jeden, bo wchodzi w calosci
        assert.ok(mobsIn(g) <= cap + maxPack - 1, `grupa ${mobsIn(g)} potworow przy limicie ${cap}`);
      }
    }
  }
});

test('maxAliveMobs jest limitem POTWOROW, nie wpisow', () => {
  const cap = b.waves.maxAliveMobs;
  const maxPack = Math.max(...Object.values(b.mobs).map((m) => m.pack ?? 1));
  for (const wave of [8, 12, 15]) {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = makeRng(seed);
      const dir = new SpawnDirector(rules, wave, composeWave(rules, wave, rng), rng);
      let alive = 0; // nikt nie zabija: czysty test sufitu
      for (let t = 0; t < 400 && !dir.done; t += 0.5) {
        alive += mobsIn(dir.update(0.5, alive, [{ x: 0, y: 0 }]).map((s) => s.type));
        assert.ok(alive <= cap + maxPack - 1, `fala ${wave}, ziarno ${seed}: ${alive} zywych przy limicie ${cap}`);
      }
    }
  }
});

test('paczka wieksza niz luz i tak wychodzi, wiec fala ma koniec', () => {
  const rng = makeRng(7);
  const dir = new SpawnDirector(rules, 10, composeWave(rules, 10, rng), rng);
  let guard = 0;
  // plansza stale niemal pelna: zostaje luz na 1 potwora, a Roj potrzebuje 3
  while (!dir.done && guard++ < 2000) dir.update(b.waves.batchIntervalS, b.waves.maxAliveMobs - 1, [{ x: 0, y: 0 }]);
  assert.ok(dir.done, 'kolejka musi sie oproznic mimo ciasnoty');
});
