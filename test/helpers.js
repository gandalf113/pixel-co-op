import { loadBalance, makeRules } from '../server/balance.js';
import { makeRng } from '../server/rng.js';
import { Grid } from '../public/shared/world.js';
import { createPlayer } from '../server/players.js';

export const balance = loadBalance();

export function makeWorld({ difficulty = 2, players = [] } = {}) {
  const rules = makeRules(balance, difficulty, Math.max(1, players.length));
  let next = 1000;
  const world = {
    rules,
    grid: new Grid(balance.map.tilesW, balance.map.tilesH),
    phase: 'wave',
    wave: 1,
    time: 0,
    players: new Map(),
    mobs: [],
    bullets: [],
    items: new Map(),
    events: [],
    rng: makeRng(1),
    nextId: () => next++,
    fieldsDirty: false,
    mobFields: null,
    fieldTimer: 0,
  };
  players.forEach((overrides, i) => {
    const p = createPlayer({ id: `p${i + 1}`, nick: `P${i + 1}`, color: i }, rules, i);
    Object.assign(p, overrides);
    world.players.set(p.id, p);
  });
  return world;
}
