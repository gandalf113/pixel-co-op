// Pomocnicy scenariusza pomiarowego (nie czesc gry).
import { spawnDrop as realDrop } from '../server/items.js';
import { buildGrid } from '../public/shared/world.js';

export function spawnDrop(world, kind, x, y) {
  const item = realDrop(world, kind, x, y);
  return item;
}

export function spawnPlaced(world, kind, tx, ty) {
  const hp = world.rules.balance.items[kind].hp ?? 100;
  const item = {
    id: world.nextId(), kind, state: 'placed', tx, ty, rot: 0, hp, maxHp: hp, x: 0, y: 0,
    holder: null, owner: null, groundSince: world.time, timeLeft: 0, armLeft: 0, cooldown: 0, flight: null,
  };
  world.items.set(item.id, item);
  world.grid = buildGrid(world.grid.w, world.grid.h, world.items.values());
  return item;
}
