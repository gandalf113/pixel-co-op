const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function inside(grid, tx, ty) {
  return tx >= 0 && ty >= 0 && tx < grid.w && ty < grid.h;
}

function moveAllowed(grid, tx, ty, dx, dy, wallCost) {
  const nx = tx + dx;
  const ny = ty + dy;
  if (!inside(grid, nx, ny)) return false;
  if (wallCost !== null) return true;
  if (grid.isSolid(nx, ny)) return false;
  return dx === 0 || dy === 0 || (!grid.isSolid(tx + dx, ty) && !grid.isSolid(tx, ty + dy));
}

class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }

  get size() {
    return this.keys.length;
  }

  push(key, val) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop() {
    const { keys, vals } = this;
    const top = vals[0];
    const key = keys.pop();
    const val = vals.pop();
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}

export function buildField(grid, sources, wallCost) {
  const { w, h } = grid;
  const field = new Float64Array(w * h).fill(Infinity);
  const heap = new MinHeap();
  for (const [tx, ty] of sources) {
    if (!inside(grid, tx, ty)) continue;
    field[ty * w + tx] = 0;
    heap.push(0, ty * w + tx);
  }
  while (heap.size > 0) {
    const idx = heap.pop();
    const tx = idx % w;
    const ty = (idx - tx) / w;
    const d = field[idx];
    for (const [dx, dy, step] of DIRS) {
      if (!moveAllowed(grid, tx, ty, dx, dy, wallCost)) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      const enter = wallCost !== null && grid.isSolid(nx, ny) ? wallCost : 1;
      const nd = d + enter * (step === 1 ? 1 : Math.SQRT2);
      const ni = ny * w + nx;
      if (nd < field[ni]) {
        field[ni] = nd;
        heap.push(nd, ni);
      }
    }
  }
  return field;
}

export function nextStep(field, grid, tx, ty, wallCost = null) {
  let best = null;
  let bestVal = field[ty * grid.w + tx];
  for (const [dx, dy] of DIRS) {
    if (!moveAllowed(grid, tx, ty, dx, dy, wallCost)) continue;
    const v = field[(ty + dy) * grid.w + tx + dx];
    if (v < bestVal) {
      bestVal = v;
      best = [tx + dx, ty + dy];
    }
  }
  return best;
}
