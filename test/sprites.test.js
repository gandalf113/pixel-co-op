import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SPRITES } from '../public/client/sprites.js';

const REQUIRED = ['player_0', 'player_1', 'player_down_0', 'player_down_1', 'slime_0', 'slime_1', 'runner_0', 'runner_1', 'brute_0', 'brute_1', 'spitter_0', 'spitter_1', 'grenadier_0', 'grenadier_1',
  'swarm_0', 'swarm_1', 'boss_0', 'boss_1', 'boss_1_dmg_3',
  'stalker_0', 'stalker_1', 'ninja_0', 'ninja_1', 'tank_0', 'tank_1', 'tank_0_dmg_1', 'tank_1_dmg_3',
  'ground_0', 'ground_1', 'ground_2', 'wall', 'turret_0', 'turret_1', 'mine_0', 'mine_1',
  'item_wall', 'item_turret30', 'item_mine', 'bullet', 'crosshair'];

const BIG = { stalker: 32, ninja: 32, tank: 64 };
// Nowe typy (MOB-05/06): jeszcze bez wpisu w balance.json, wiec poza testem radiusPx.
const NEW = { swarm: 12, boss: 64 };
const ITEM32 = { spikes: 32, cage: 32 };

test('sprites are complete and well-formed', () => {
  for (const name of REQUIRED) assert.ok(SPRITES[name], name);
  for (const [name, rows] of Object.entries(SPRITES)) {
    const w = rows[0].length;
    assert.ok(rows.every(r => r.length === w), `${name}: równe wiersze`);
    if (name.startsWith('ult_')) assert.equal(rows.length, 32, `${name}: 32 wiersze`);
    else if (NEW[name.split('_')[0]]) assert.equal(rows.length, NEW[name.split('_')[0]], `${name}: ${NEW[name.split('_')[0]]} wierszy`);
    else if (BIG[name.split('_')[0]]) assert.equal(rows.length, BIG[name.split('_')[0]], `${name}: ${BIG[name.split('_')[0]]} wierszy`);
    else if (ITEM32[name.split('_')[0]]) assert.equal(rows.length, 32, `${name}: 32 wiersze`);
    else if (!['bullet', 'crosshair'].includes(name)) assert.equal(rows.length, 16, `${name}: 16 wierszy`);
    for (const r of rows) for (const ch of r) assert.ok(ch in PALETTE, `${name}: znak '${ch}' poza paletą`);
  }
});

test('klatki powalonego gracza są 16x16, z kolorem gracza i różnią się ręką', async () => {
  const { PLAYER_SPRITES } = await import('../public/client/sprites.js');
  for (const n of ['player_down_0', 'player_down_1']) {
    assert.ok(PLAYER_SPRITES.includes(n), n);
    assert.equal(SPRITES[n].length, 16);
    assert.ok(SPRITES[n].every(r => r.length === 16));
  }
  assert.notDeepEqual(SPRITES.player_down_0, SPRITES.player_down_1);
});

test('every item in balance.json has all the sprites its behavior needs', async () => {
  const { balance } = await import('./helpers.js');
  for (const [kind, c] of Object.entries(balance.items)) {
    const need = [`item_${kind}`];
    if (c.behavior === 'block') need.push(c.sprite, ...[1, 2, 3].map((n) => `${c.sprite}_dmg_${n}`));
    else if (c.behavior === 'spikes') need.push(c.sprite);
    else if (c.behavior === 'weaponboost') need.push(`item_${kind}`); // brak postawionego stanu, tylko ikona
    else need.push(`${c.sprite}_0`, `${c.sprite}_1`);
    if (c.wreck) need.push(c.wreck);
    for (const name of need) assert.ok(SPRITES[name], `${kind}: brak sprite'a ${name}`);
  }
});

test('duże sylwetki są kwadratowe, a radiusPx odpowiada ich rozmiarowi', async () => {
  const { balance } = await import('./helpers.js');
  for (const [type, size] of Object.entries(BIG)) {
    for (const name of [`${type}_0`, `${type}_1`]) assert.ok(SPRITES[name].every((r) => r.length === size), name);
    const r = balance.mobs[type].radiusPx;
    assert.ok(r > 8 && r <= size / 2, `${type}: radiusPx ${r} vs sprite ${size}`);
  }
});

test('stany zużycia tanka różnią się kolorem, ale nie kształtem', () => {
  const shape = (rows) => rows.map((r) => r.replace(/[^.]/g, '#')).join('');
  const stages = [SPRITES.tank_0, ...[1, 2, 3].map((n) => SPRITES[`tank_0_dmg_${n}`])];
  for (const st of stages.slice(1)) assert.equal(shape(st), shape(stages[0]));
  assert.equal(new Set(stages.map((r) => r.join(''))).size, 4);
});

const solid = (rows) => rows.join('').replace(/\./g, '').length;

test('rój i boss się bakują, rój jest mniejszy od biegacza, boss ma 64 x 64 i nie jest pusty', async () => {
  const { bakeSprites } = await import('../public/client/sprites.js');
  const made = [];
  const doc = { createElement: () => {
    const c = { width: 0, height: 0, getContext: () => ({
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData(img) { c.img = img; },
    }) };
    made.push(c);
    return c;
  } };
  const baked = bakeSprites(doc, ['#e05a3a']);
  const opaque = (cv) => { let n = 0; for (let i = 3; i < cv.img.data.length; i += 4) if (cv.img.data[i]) n++; return n; };
  for (const f of [0, 1]) {
    const swarm = baked.get(`swarm_${f}`);
    const runner = baked.get(`runner_${f}`);
    const boss = baked.get(`boss_${f}`);
    const tank = baked.get(`tank_${f}`);
    assert.ok(swarm && boss, 'bake');
    assert.ok(swarm.width <= 12 && swarm.height <= 12 && swarm.width < runner.width && swarm.height < runner.height, 'rój mniejszy od biegacza');
    assert.equal(boss.width, 64);
    assert.equal(boss.height, 64);
    assert.ok(opaque(swarm) > 20 && opaque(boss) > 1500, 'sylwetki mają piksele');
    assert.ok(opaque(swarm) < opaque(runner) * 0.8, 'rój zajmuje wyraźnie mniej niż biegacz');
    assert.ok(opaque(boss) > opaque(tank) * 0.8, 'boss nie mniejszy od tanka');
  }
});

test('rój i boss mają własne barwy: rój bursztynowy, boss fioletowy, inne niż biegacz i tank', () => {
  const colors = (name) => new Set(SPRITES[name].join('').replace(/[.K]/g, ''));
  assert.ok(colors('swarm_0').has('o') && !colors('swarm_0').has('s') && !colors('swarm_0').has('S'));
  assert.ok(colors('boss_0').has('m') && !colors('boss_0').has('B') && !colors('boss_0').has('b'));
  assert.notDeepEqual(SPRITES.swarm_0, SPRITES.swarm_1);
  assert.notDeepEqual(SPRITES.boss_0, SPRITES.boss_1);
});

test('stany zużycia bossa zmieniają kolor, nie kształt', () => {
  const shape = (rows) => rows.map((r) => r.replace(/[^.]/g, '#')).join('');
  const stages = [SPRITES.boss_0, ...[1, 2, 3].map((n) => SPRITES[`boss_0_dmg_${n}`])];
  for (const st of stages.slice(1)) assert.equal(shape(st), shape(stages[0]));
  assert.equal(new Set(stages.map((r) => r.join(''))).size, 4);
  assert.ok(solid(SPRITES.boss_0) > 0);
});
