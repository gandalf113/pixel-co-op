export const KIND = { EMPTY: 0, WALL: 1, TURRET: 2 };

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.kinds = new Uint8Array(w * h);
    this.ids = new Int32Array(w * h);
  }

  inside(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  kind(tx, ty) {
    return this.inside(tx, ty) ? this.kinds[ty * this.w + tx] : KIND.WALL;
  }

  id(tx, ty) {
    return this.inside(tx, ty) ? this.ids[ty * this.w + tx] : 0;
  }

  set(tx, ty, kind, id) {
    if (!this.inside(tx, ty)) return;
    this.kinds[ty * this.w + tx] = kind;
    this.ids[ty * this.w + tx] = kind === KIND.EMPTY ? 0 : id;
  }

  isSolid(tx, ty) {
    return this.kind(tx, ty) !== KIND.EMPTY;
  }

  isWall(tx, ty) {
    return this.kind(tx, ty) === KIND.WALL;
  }
}

export function tileOf(px, tilePx) {
  return Math.floor(px / tilePx);
}

export function footprint(kind, tx, ty, rot) {
  if (kind === 'wall') return rot === 1 ? [[tx, ty], [tx, ty + 1]] : [[tx, ty], [tx + 1, ty]];
  return [[tx, ty]];
}

export function buildGrid(w, h, items) {
  const grid = new Grid(w, h);
  for (const it of items) {
    let k = KIND.EMPTY;
    if (it.kind === 'wall' && it.state === 'placed') k = KIND.WALL;
    else if (it.kind === 'turret30' && it.state === 'active') k = KIND.TURRET;
    if (k === KIND.EMPTY) continue;
    for (const [tx, ty] of footprint(it.kind, it.tx, it.ty, it.rot)) grid.set(tx, ty, k, it.id);
  }
  return grid;
}

function colBlocked(grid, col, y, r, tilePx) {
  const r0 = Math.floor((y - r) / tilePx);
  const r1 = Math.ceil((y + r) / tilePx) - 1;
  for (let row = r0; row <= r1; row++) if (grid.isSolid(col, row)) return true;
  return false;
}

function rowBlocked(grid, row, x, r, tilePx) {
  const c0 = Math.floor((x - r) / tilePx);
  const c1 = Math.ceil((x + r) / tilePx) - 1;
  for (let col = c0; col <= c1; col++) if (grid.isSolid(col, row)) return true;
  return false;
}

function moveAxis(pos, d, r, tilePx, blocked) {
  const next = pos + d;
  if (d > 0) {
    const first = Math.floor((pos + r) / tilePx);
    const last = Math.ceil((next + r) / tilePx) - 1;
    for (let i = first; i <= last; i++) if (blocked(i)) return i * tilePx - r;
  } else if (d < 0) {
    const first = Math.ceil((pos - r) / tilePx) - 1;
    const last = Math.floor((next - r) / tilePx);
    for (let i = first; i >= last; i--) if (blocked(i)) return (i + 1) * tilePx + r;
  }
  return next;
}

export function moveCircle(grid, x, y, r, dx, dy, tilePx) {
  const nx = moveAxis(x, dx, r, tilePx, (col) => colBlocked(grid, col, y, r, tilePx));
  const ny = moveAxis(y, dy, r, tilePx, (row) => rowBlocked(grid, row, nx, r, tilePx));
  return { x: nx, y: ny };
}

export function segmentBlocked(grid, x0, y0, x1, y1, tilePx, wallsOnly = true) {
  const hit = wallsOnly ? (tx, ty) => grid.isWall(tx, ty) : (tx, ty) => grid.isSolid(tx, ty);
  let tx = tileOf(x0, tilePx);
  let ty = tileOf(y0, tilePx);
  const ex = tileOf(x1, tilePx);
  const ey = tileOf(y1, tilePx);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tDx = dx !== 0 ? Math.abs(tilePx / dx) : Infinity;
  const tDy = dy !== 0 ? Math.abs(tilePx / dy) : Infinity;
  let tMaxX = dx === 0 ? Infinity : (sx > 0 ? (tx + 1) * tilePx - x0 : x0 - tx * tilePx) / Math.abs(dx);
  let tMaxY = dy === 0 ? Infinity : (sy > 0 ? (ty + 1) * tilePx - y0 : y0 - ty * tilePx) / Math.abs(dy);
  while (tx !== ex || ty !== ey) {
    if (tMaxX < tMaxY) { tx += sx; tMaxX += tDx; } else { ty += sy; tMaxY += tDy; }
    if (hit(tx, ty)) return true;
  }
  return false;
}

function circleTouchesTile(c, tx, ty, tilePx) {
  const nx = Math.max(tx * tilePx, Math.min(c.x, (tx + 1) * tilePx));
  const ny = Math.max(ty * tilePx, Math.min(c.y, (ty + 1) * tilePx));
  const ddx = c.x - nx;
  const ddy = c.y - ny;
  return ddx * ddx + ddy * ddy < c.r * c.r;
}

export function placementValid({ grid, tiles, playerX, playerY, circles, tilePx, maxRangeTiles, limitReached }) {
  if (limitReached) return false;
  for (const [tx, ty] of tiles) {
    if (grid.isSolid(tx, ty)) return false;
    for (const c of circles) if (circleTouchesTile(c, tx, ty, tilePx)) return false;
  }
  const [ax, ay] = tiles[0];
  const range = Math.max(Math.abs(ax - tileOf(playerX, tilePx)), Math.abs(ay - tileOf(playerY, tilePx)));
  if (range > maxRangeTiles) return false;
  return !segmentBlocked(grid, playerX, playerY, (ax + 0.5) * tilePx, (ay + 0.5) * tilePx, tilePx, true);
}

function* tilesAlong(x0, y0, x1, y1, tilePx) {
  let tx = tileOf(x0, tilePx);
  let ty = tileOf(y0, tilePx);
  const ex = tileOf(x1, tilePx);
  const ey = tileOf(y1, tilePx);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tDx = dx !== 0 ? Math.abs(tilePx / dx) : Infinity;
  const tDy = dy !== 0 ? Math.abs(tilePx / dy) : Infinity;
  let tMaxX = dx === 0 ? Infinity : (sx > 0 ? (tx + 1) * tilePx - x0 : x0 - tx * tilePx) / Math.abs(dx);
  let tMaxY = dy === 0 ? Infinity : (sy > 0 ? (ty + 1) * tilePx - y0 : y0 - ty * tilePx) / Math.abs(dy);
  while (tx !== ex || ty !== ey) {
    if (tMaxX < tMaxY) { tx += sx; tMaxX += tDx; } else { ty += sy; tMaxY += tDy; }
    yield [tx, ty];
  }
}

export function placeTarget({ grid, kind, rot = 0, playerX, playerY, aimX, aimY, circles, tilePx, maxRangeTiles, limitReached }) {
  const ptx = tileOf(playerX, tilePx);
  const pty = tileOf(playerY, tilePx);
  const inRange = (tx, ty) => Math.max(Math.abs(tx - ptx), Math.abs(ty - pty)) <= maxRangeTiles;
  const valid = (tx, ty) => placementValid({
    grid, tiles: footprint(kind, tx, ty, rot), playerX, playerY, circles, tilePx, maxRangeTiles, limitReached,
  });
  const cx = tileOf(aimX, tilePx);
  const cy = tileOf(aimY, tilePx);
  if (limitReached || inRange(cx, cy)) return { tx: cx, ty: cy, valid: !limitReached && valid(cx, cy) };
  let best = null;
  let edge = [cx, cy];
  for (const [tx, ty] of tilesAlong(playerX, playerY, aimX, aimY, tilePx)) {
    if (!inRange(tx, ty)) break;
    edge = [tx, ty];
    if (valid(tx, ty)) best = [tx, ty];
    else if (best) break;
  }
  const [tx, ty] = best ?? edge;
  return { tx, ty, valid: !!best };
}
