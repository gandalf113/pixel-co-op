import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, makeWorld, addMob } from './helpers.js';
import { makeRng } from '../server/rng.js';
import { Game } from '../server/game.js';
import { fireWeapons, updateBullets } from '../server/combat.js';
import { handleAction, updateItems, spawnDrop } from '../server/items.js';
import { applyPlayerDelta, newPlayerState } from '../public/shared/delta.js';
import { rifleStats } from '../public/shared/weapon.js';

const DT = 1 / 30;
const T = balance.map.tilePx;
const C = (t) => (t + 0.5) * T;
const M = balance.weaponMods;
const noHooks = { onWallHit() {} };
const rad = (d) => (d * Math.PI) / 180;

function oneWorld(overrides = {}) {
  const w = makeWorld({ players: [{ x: C(40), y: C(30), angle: 0, ...overrides }] });
  return { w, p: w.players.get('p1') };
}

function useBoost(w, p) {
  const it = spawnDrop(w, 'weaponboost', p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  p.busy = 0;
  assert.equal(p.held, it.id, 'boost podniesiony');
  handleAction(w, p, 'e');
  p.busy = 0;
  return it;
}

// Jeden strzal z wyzerowanym cooldownem; zwraca pociski, ktore powstaly.
function shootOnce(w, p) {
  w.bullets.length = 0;
  p.input.fire = true;
  p.cooldown = 0;
  fireWeapons(w, DT);
  p.input.fire = false;
  return [...w.bullets];
}

// Ile strzalow pada w `seconds` przy trzymanym spuscie (magazynek ogromny, zeby nie liczyc przeladowan).
function shotsIn(w, p, seconds) {
  p.ammo = 100000;
  p.input.fire = true;
  p.cooldown = 0;
  let n = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    p.cooldown = Math.max(-DT, p.cooldown - DT);
    w.events.length = 0;
    w.bullets.length = 0;
    fireWeapons(w, DT);
    n += w.events.filter((e) => e.type === 'shot').length;
  }
  return n;
}

test('balance.json: weaponMods ma wszystkie liczby, boost wazy 4 i jest power-upem', () => {
  assert.equal(M.maxLevel, 5);
  assert.deepEqual([...M.kinds].sort(), ['fan', 'homing', 'nailgun']);
  assert.equal(M.fan.count, 3);
  assert.equal(M.fan.damageMult, 0.6);
  assert.equal(M.homing.coneDeg, 25);
  assert.equal(M.nailgun.speedPx, 900);
  assert.ok(M.nailgun.lenPx >= 4 && M.nailgun.lenPx <= 6);
  const b = balance.items.weaponboost;
  assert.equal(b.weight, 4); // 2026-11-06: podbite z 2 (2,1% -> 4,2% dropow mocy)
  assert.equal(b.category, 'power');
  assert.equal(b.throwDamage, 5);
});

test('gracz bez boosta strzela jak dawniej: poziom 1, brak modyfikatora, jeden prosty pocisk', () => {
  const { w, p } = oneWorld();
  assert.equal(p.weaponLv, 1);
  assert.equal(p.weaponMod, null);
  const [b, ...rest] = shootOnce(w, p);
  assert.equal(rest.length, 0);
  assert.equal(b.damage, 8);
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - balance.rifle.speedPx) < 1e-9);
  assert.equal(b.pierce, 0);
  assert.equal(b.homing, undefined);
  assert.equal(b.lenPx, undefined);
  assert.ok(Math.abs(p.cooldown - balance.rifle.fireIntervalS) < 1e-9);
});

test('V3-I-06: poziom broni sam z siebie nie daje przebijania ani potrojnego strzalu', () => {
  for (let lv = 1; lv <= 5; lv++) {
    const { w, p } = oneWorld({ weaponLv: lv });
    const bullets = shootOnce(w, p);
    assert.equal(bullets.length, 1, `lv ${lv}: jeden pocisk`);
    assert.equal(bullets[0].pierce, 0, `lv ${lv}: bez przebijania`);
  }
});

test('boost: +1 poziom i losowy modyfikator, przedmiot znika, zdarzenie weaponUp', () => {
  const { w, p } = oneWorld();
  w.rng = () => 0; // pierwszy rodzaj z listy
  const mag0 = p.ammo;
  const it = useBoost(w, p);
  assert.equal(p.weaponLv, 2);
  assert.equal(p.weaponMod, M.kinds[0]);
  assert.equal(p.held, null);
  assert.equal(w.items.has(it.id), false);
  assert.equal(p.ammo, mag0 + balance.rifle.levelMagazine, 'dodatkowy magazynek od razu w komorze');
  assert.deepEqual(w.events.filter((e) => e.type === 'weaponUp').map((e) => [e.id, e.lv, e.mod]), [['p1', 2, M.kinds[0]]]);
});

test('drugi boost: poziom 2 -> 3 i modyfikator jest przelosowany, nie dolozony', () => {
  const { w, p } = oneWorld();
  w.rng = () => 0;
  useBoost(w, p);
  assert.equal(p.weaponMod, 'fan');
  w.rng = () => 0.99; // ostatni rodzaj
  useBoost(w, p);
  assert.equal(p.weaponLv, 3);
  assert.equal(p.weaponMod, M.kinds.at(-1));
  assert.equal(typeof p.weaponMod, 'string', 'jeden modyfikator, nie lista');
  // strzal ma cechy tylko aktualnego (gwozdzia), nie wachlarza
  const bullets = shootOnce(w, p);
  assert.equal(bullets.length, 1);
  assert.equal(bullets[0].lenPx, M.nailgun.lenPx);
});

test('poziom 5 jest sufitem, ale kolejny boost dalej losuje modyfikator', () => {
  const { w, p } = oneWorld({ weaponLv: 5, weaponMod: 'fan' });
  const ammo = p.ammo;
  w.rng = () => 0.5;
  useBoost(w, p);
  assert.equal(p.weaponLv, 5);
  assert.equal(p.weaponMod, M.kinds[Math.floor(0.5 * M.kinds.length)]);
  assert.notEqual(p.weaponMod, 'fan');
  assert.equal(p.ammo, ammo, 'na sficie poziomu nie przybywa naboi');
  assert.equal(w.events.filter((e) => e.type === 'weaponUp').at(-1).lv, 5);
});

test('losowanie modyfikatora idzie z world.rng: ten sam seed, ten sam przebieg', () => {
  const sequence = (seed) => {
    const { w, p } = oneWorld();
    w.rng = makeRng(seed);
    const out = [];
    for (let i = 0; i < 12; i++) {
      p.held = null;
      useBoost(w, p);
      out.push(p.weaponMod);
    }
    return out;
  };
  assert.deepEqual(sequence(42), sequence(42));
  assert.ok(new Set(sequence(42)).size > 1, 'rozne seedy/losowania daja rozne rodzaje');
  assert.ok(sequence(42).every((m) => M.kinds.includes(m)));
});

test('wachlarz: 3 pociski, rozrzut ok. 12 stopni, obrazenia x0.6, jeden naboj', () => {
  const { w, p } = oneWorld({ weaponMod: 'fan' });
  const ammo = p.ammo;
  p.angle = 0;
  w.rng = () => 0.5; // zero losowego rozrzutu bazowego
  const bullets = shootOnce(w, p);
  assert.equal(bullets.length, 3);
  for (const b of bullets) assert.ok(Math.abs(b.damage - 8 * 0.6) < 1e-9);
  const angles = bullets.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
  assert.ok(Math.abs(angles[2] - angles[0] - rad(12)) < 1e-9, 'calkowity rozrzut 12 stopni');
  assert.ok(Math.abs(angles[1]) < 1e-9, 'srodkowy leci prosto');
  assert.equal(p.ammo, ammo - 1);
  assert.ok(Math.abs(p.cooldown - balance.rifle.fireIntervalS) < 1e-9, 'tempo jak karabin');
});

test('wachlarz skaluje sie z poziomem broni (x0.6 po modyfikatorze poziomu)', () => {
  const { w, p } = oneWorld({ weaponMod: 'fan', weaponLv: 3 });
  const [b] = shootOnce(w, p);
  assert.ok(Math.abs(b.damage - rifleStats(balance, 3).damage * 0.6) < 1e-9);
});

test('gwozdziarka: wyraznie czestszy ogien i szybszy, slabszy pocisk', () => {
  const base = oneWorld();
  const nail = oneWorld({ weaponMod: 'nailgun' });
  const nBase = shotsIn(base.w, base.p, 2);
  const nNail = shotsIn(nail.w, nail.p, 2);
  assert.ok(nNail >= 2.5 * nBase, `${nNail} vs ${nBase}`);
  const [b] = shootOnce(nail.w, nail.p);
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 900) < 1e-9);
  assert.ok(b.damage < 8 * 0.5, 'obrazenia pojedynczego pocisku mocno w dol');
  assert.equal(b.lenPx, M.nailgun.lenPx);
  assert.ok(Math.abs(nail.p.cooldown - M.nailgun.fireIntervalS) < 1e-9);
});

test('gwozdziarka ma wiekszy rozrzut niz karabin', () => {
  const spreadOf = (mod) => {
    const { w, p } = oneWorld({ weaponMod: mod });
    let max = 0;
    w.rng = makeRng(5);
    for (let i = 0; i < 400; i++) {
      p.ammo = 1000;
      const [b] = shootOnce(w, p);
      max = Math.max(max, Math.abs(Math.atan2(b.vy, b.vx)));
    }
    return max;
  };
  assert.ok(spreadOf('nailgun') > spreadOf(null) * 1.8);
});

// ---- samonaprowadzanie ----

// Strzal na wprost z (C(20), C(20)); zwraca potwora i pocisk po locie.
function homingShot({ mobAt, mod = 'homing' }) {
  const w = makeWorld({ players: [{ x: C(20), y: C(20), angle: 0, weaponMod: mod }] });
  const p = w.players.get('p1');
  w.rng = () => 0.5;
  const mob = addMob(w, 'brute', mobAt[0], mobAt[1]);
  const hp0 = mob.hp;
  const [b] = shootOnce(w, p);
  for (let i = 0; i < 90 && w.bullets.includes(b); i++) updateBullets(w, DT, noHooks);
  return { w, mob, hp0, b };
}

test('samonaprowadzanie: pocisk zakreca do potwora w stozku i go trafia', () => {
  // ~15 stopni od osi: prosty pocisk by chybil
  const mobAt = [C(20) + 120, C(20) + 32];
  const plain = homingShot({ mobAt, mod: null });
  assert.equal(plain.mob.hp, plain.hp0, 'kontrola: bez modyfikatora pudlo');
  const homing = homingShot({ mobAt });
  assert.ok(homing.mob.hp < homing.hp0, 'z samonaprowadzaniem trafia');
});

test('samonaprowadzanie nie zakreca do potwora za plecami ani poza stozkiem', () => {
  const behind = homingShot({ mobAt: [C(20) - 100, C(20) + 4] });
  assert.equal(behind.mob.hp, behind.hp0);
  assert.ok(behind.b.vx > 0 && Math.abs(behind.b.vy) < 1e-6, 'tor prosty, bez skretu');
  // 45 stopni od osi: poza stozkiem 25
  const wide = homingShot({ mobAt: [C(20) + 80, C(20) + 80] });
  assert.equal(wide.mob.hp, wide.hp0);
  assert.ok(Math.abs(wide.b.vy) < 1e-6);
});

test('samonaprowadzanie: skret ograniczony do ok. 180 stopni na sekunde', () => {
  const w = makeWorld({ players: [{ x: C(20), y: C(20), angle: 0, weaponMod: 'homing' }] });
  const p = w.players.get('p1');
  w.rng = () => 0.5;
  addMob(w, 'brute', C(20) + 100, C(20) + 38); // ~22 stopnie, w stozku
  const [b] = shootOnce(w, p);
  updateBullets(w, DT, noHooks);
  const turned = Math.abs(Math.atan2(b.vy, b.vx));
  assert.ok(turned > 0 && turned <= rad(M.homing.turnDegPerS) * DT + 1e-9, `skret ${turned}`);
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - balance.rifle.speedPx) < 1e-6, 'predkosc bez zmian');
});

test('samonaprowadzanie nie widzi przez sciane', () => {
  const w = makeWorld({ players: [{ x: C(20), y: C(20), angle: 0, weaponMod: 'homing' }] });
  const p = w.players.get('p1');
  w.rng = () => 0.5;
  addMob(w, 'brute', C(20) + 100, C(20) + 30);
  for (let ty = 17; ty <= 24; ty++) w.grid.kinds[ty * w.grid.w + 24] = 1; // KIND.WALL
  const [b] = shootOnce(w, p);
  updateBullets(w, DT, noHooks);
  assert.ok(Math.abs(b.vy) < 1e-6);
});

// ---- Szal kontra modyfikator ----

const FRENZY = { damageMult: 2, fireMult: 0.5, pierce: 2, triple: true };

test('Szal w trakcie dzialania wygrywa z modyfikatorem, a po nim modyfikator wraca', () => {
  const { w, p } = oneWorld({ weaponMod: 'fan' });
  Object.assign(p, { frenzy: FRENZY, frenzyLeft: 5 });
  const during = shootOnce(w, p);
  assert.equal(during.length, 3, 'potrojny strzal Szalu, nie 3 z wachlarza x 3');
  for (const b of during) {
    assert.equal(b.damage, 16, 'x2 Szalu, bez x0.6 wachlarza');
    assert.equal(b.pierce, 2);
  }
  assert.ok(Math.abs(p.cooldown - balance.rifle.fireIntervalS * 0.5) < 1e-9);
  assert.equal(p.weaponMod, 'fan', 'modyfikator nie zostal skasowany');
  p.frenzyLeft = 0;
  const after = shootOnce(w, p);
  assert.equal(after.length, 3);
  for (const b of after) assert.ok(Math.abs(b.damage - 4.8) < 1e-9 && b.pierce === 0);
});

test('Szal bez potrojnego strzalu i gwozdziarka: zwykly pocisk z predkoscia karabinu, tempo Szalu', () => {
  const { w, p } = oneWorld({ weaponMod: 'nailgun' });
  Object.assign(p, { frenzy: { ...FRENZY, triple: false }, frenzyLeft: 5 });
  const bullets = shootOnce(w, p);
  assert.equal(bullets.length, 1);
  assert.ok(Math.abs(Math.hypot(bullets[0].vx, bullets[0].vy) - balance.rifle.speedPx) < 1e-9);
  assert.equal(bullets[0].lenPx, undefined);
  assert.equal(bullets[0].homing, undefined);
  assert.ok(Math.abs(p.cooldown - balance.rifle.fireIntervalS * 0.5) < 1e-9);
});

// ---- rzut ----

test('rzucony boost nie aktywuje sie: zadaje 5 obrazen i lezy na ziemi', () => {
  const { w, p } = oneWorld();
  const mob = addMob(w, 'brute', C(43), C(30));
  const hp0 = mob.hp;
  const it = spawnDrop(w, 'weaponboost', p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  p.busy = 0;
  p.input = { ...p.input, aimX: C(43), aimY: C(30) };
  handleAction(w, p, 'space');
  for (let i = 0; i < 40; i++) updateItems(w, DT);
  assert.equal(mob.hp, hp0 - 5);
  assert.equal(p.weaponLv, 1);
  assert.equal(p.weaponMod, null);
  assert.ok(w.items.has(it.id), 'przedmiot nie zniknal');
  assert.equal(it.state, 'ground', 'nie aktywny, mozna go podniesc ponownie');
  assert.equal(w.events.filter((e) => e.type === 'weaponUp').length, 0);
});

test('rzucony boost, ktory nikogo nie trafil, tez laduje na ziemi i nie aktywuje sie', () => {
  const { w, p } = oneWorld();
  const it = spawnDrop(w, 'weaponboost', p.x, p.y);
  it.x = p.x;
  it.y = p.y;
  handleAction(w, p, 'e');
  p.busy = 0;
  p.input = { ...p.input, aimX: C(42), aimY: C(30) };
  handleAction(w, p, 'space');
  for (let i = 0; i < 40; i++) updateItems(w, DT);
  assert.equal(it.state, 'ground');
  assert.equal(p.weaponLv, 1);
});

// ---- snapshot ----

test('snapshot niesie modyfikator gracza, a gwozdz ma kat i dlugosc', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'Ala', color: 0 }, { id: 2, nick: 'Bob', color: 1 }], seed: 7 });
  const p1 = g.world.players.get(1);
  p1.weaponMod = 'nailgun';
  p1.weaponLv = 3;
  g.world.bullets.push({ id: 900, owner: 1, fromTurret: false, x: p1.x + 10, y: p1.y, vx: 900, vy: 0, travelLeft: 100, damage: 2, pierce: 0, passed: null, lenPx: 5 });
  g.world.bullets.push({ id: 901, owner: 1, fromTurret: false, x: p1.x + 12, y: p1.y, vx: 450, vy: 0, travelLeft: 100, damage: 8, pierce: 0, passed: null });
  const s = g.snapshot(2);
  s.players = applyPlayerDelta(newPlayerState(), s);
  assert.equal(s.players.find((p) => p.id === 1).weaponMod, 'nailgun');
  assert.equal(s.players.find((p) => p.id === 2).weaponMod, null);
  assert.deepEqual(s.bullets.find((b) => b[0] === 900), [900, p1.x + 10, p1.y, 0, 5].map((v, i) => (i === 1 || i === 2 ? Math.round(v * 10) / 10 : v)));
  assert.equal(s.bullets.find((b) => b[0] === 901).length, 3);
});

// Zgloszenie 2026-11-07: gwozdz ma przebijac potwory, kazdy kolejny dostaje 15% mniej.
test('gwozdziarka przebija potwory w linii, obrazenia spadaja o 15% na kazdym kolejnym', () => {
  const { w, p } = oneWorld({ weaponMod: 'nailgun' });
  w.rng = () => 0.5; // bez rozrzutu
  const mobs = [1, 2, 3].map((i) => addMob(w, 'tank', p.x + i * 24, p.y));
  const hp0 = mobs[0].hp;
  const [b] = shootOnce(w, p);
  assert.ok(b.pierce >= 3 && b.pierceDecay === 0.15);
  const d0 = b.damage;
  for (let i = 0; i < 20; i++) updateBullets(w, DT, noHooks);
  const lost = mobs.map((m) => hp0 - m.hp);
  assert.ok(Math.abs(lost[0] - d0) < 1e-6, `pierwszy pelne: ${lost[0]} vs ${d0}`);
  assert.ok(Math.abs(lost[1] - d0 * 0.85) < 1e-6, `drugi 85%: ${lost[1]}`);
  assert.ok(Math.abs(lost[2] - d0 * 0.85 * 0.85) < 1e-6, `trzeci 72%: ${lost[2]}`);
  assert.equal(w.bullets.length, 0, 'poza zasiegiem znika');
});

test('zwykly karabin i wachlarz nie przebijaja (gwozdz to wyjatek)', () => {
  for (const mod of [null, 'fan', 'homing']) {
    const { w, p } = oneWorld({ weaponMod: mod });
    const [b] = shootOnce(w, p);
    assert.equal(b.pierce, 0, String(mod));
    assert.equal(b.pierceDecay, undefined, String(mod));
  }
});
