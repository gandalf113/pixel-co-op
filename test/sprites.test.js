import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SPRITES } from '../public/client/sprites.js';

const REQUIRED = ['player_0', 'player_1', 'player_down_0', 'player_down_1', 'slime_0', 'slime_1', 'runner_0', 'runner_1', 'brute_0', 'brute_1', 'spitter_0', 'spitter_1', 'grenadier_0', 'grenadier_1',
  'ground_0', 'ground_1', 'ground_2', 'wall', 'turret_0', 'turret_1', 'mine_0', 'mine_1',
  'item_wall', 'item_turret30', 'item_mine', 'bullet', 'crosshair'];

test('sprites are complete and well-formed', () => {
  for (const name of REQUIRED) assert.ok(SPRITES[name], name);
  for (const [name, rows] of Object.entries(SPRITES)) {
    const w = rows[0].length;
    assert.ok(rows.every(r => r.length === w), `${name}: równe wiersze`);
    if (name.startsWith('ult_')) assert.equal(rows.length, 32, `${name}: 32 wiersze`);
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
    else need.push(`${c.sprite}_0`, `${c.sprite}_1`);
    if (c.wreck) need.push(c.wreck);
    for (const name of need) assert.ok(SPRITES[name], `${kind}: brak sprite'a ${name}`);
  }
});
