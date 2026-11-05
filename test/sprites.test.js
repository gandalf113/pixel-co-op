import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SPRITES } from '../public/client/sprites.js';

const REQUIRED = ['player_0', 'player_1', 'slime_0', 'slime_1', 'runner_0', 'runner_1', 'brute_0', 'brute_1',
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
