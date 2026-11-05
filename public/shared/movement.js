import { moveCircle } from './world.js';

export function playerSpeedPx(balance, heldKind) {
  const base = balance.player.speedTiles * balance.map.tilePx;
  const hard = heldKind != null && balance.items[heldKind]?.category === 'hard';
  return hard ? base * balance.player.carryHardSpeedMult : base;
}

export function stepPlayer(pos, input, dt, speedPx, grid, balance) {
  let { mx, my } = input;
  if (mx !== 0 && my !== 0) {
    mx *= Math.SQRT1_2;
    my *= Math.SQRT1_2;
  }
  return moveCircle(grid, pos.x, pos.y, balance.player.radiusPx, mx * speedPx * dt, my * speedPx * dt, balance.map.tilePx);
}
