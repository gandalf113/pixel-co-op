const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function inside(grid, tx, ty) {
  return tx >= 0 && ty >= 0 && tx < grid.w && ty < grid.h;
}

// Czy kolo (x, y, r) nie zachacza o zadna sciane/dzialko. Kafelki poza plansza sa tu "wolne": fizyka
// (moveCircle) i tak nie wpusci ciala poza mape, a dzieki temu duzy potwor nie jest odciety od kafelkow brzegowych.
export function circleFree(grid, x, y, r, tilePx) {
  const x0 = Math.floor((x - r) / tilePx);
  const x1 = Math.floor((x + r) / tilePx);
  const y0 = Math.floor((y - r) / tilePx);
  const y1 = Math.floor((y + r) / tilePx);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!grid.inside(tx, ty) || !grid.isSolid(tx, ty)) continue;
      const nx = Math.max(tx * tilePx, Math.min(x, (tx + 1) * tilePx));
      const ny = Math.max(ty * tilePx, Math.min(y, (ty + 1) * tilePx));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r - 1e-6) return false;
    }
  }
  return true;
}

const SAMPLES = [-6, 0, 6];

// V3-A-01: mapa kafelkow nieprzechodnich dla potwora o promieniu r (1 = zablokowany). Kafelek jest
// przechodni, gdy w jego obrebie (srodek +-6 px) miesci sie cale cialo; dla r <= polowa kafelka to po prostu
// "nie jest sciana" i zwracamy null, czyli stara sciezke bez zadnych kosztow.
export function sizeBlocked(grid, r, tilePx) {
  if (r <= tilePx / 2) return null;
  const out = new Uint8Array(grid.w * grid.h);
  // gdzie w kafelku faktycznie stanac cialem (przesuniecie od srodka) - cel kroku, bo srodek kafelka bywa za blisko sciany
  out.ox = new Int8Array(grid.w * grid.h);
  out.oy = new Int8Array(grid.w * grid.h);
  const order = [...SAMPLES.flatMap((sy) => SAMPLES.map((sx) => [sx, sy]))].sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.w; tx++) {
      const i = ty * grid.w + tx;
      const spot = grid.isSolid(tx, ty)
        ? null
        : order.find(([sx, sy]) => circleFree(grid, (tx + 0.5) * tilePx + sx, (ty + 0.5) * tilePx + sy, r, tilePx));
      if (!spot) out[i] = 1;
      else [out.ox[i], out.oy[i]] = spot;
    }
  }
  return out;
}

const solidAt = (grid, bm, x, y) => (bm ? bm[y * grid.w + x] === 1 : grid.isSolid(x, y));

function moveAllowed(grid, tx, ty, dx, dy, wallCost, bm) {
  const nx = tx + dx;
  const ny = ty + dy;
  if (!inside(grid, nx, ny)) return false;
  if (wallCost !== null) return true;
  if (solidAt(grid, bm, nx, ny)) return false;
  return dx === 0 || dy === 0 || (!solidAt(grid, bm, tx + dx, ty) && !solidAt(grid, bm, tx, ty + dy));
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

export function buildField(grid, sources, wallCost, bm = null) {
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
      if (!moveAllowed(grid, tx, ty, dx, dy, wallCost, bm)) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      const enter = wallCost !== null && solidAt(grid, bm, nx, ny) ? wallCost : 1;
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

export function nextStep(field, grid, tx, ty, wallCost = null, bm = null) {
  let best = null;
  let bestVal = field[ty * grid.w + tx];
  for (const [dx, dy] of DIRS) {
    if (!moveAllowed(grid, tx, ty, dx, dy, wallCost, bm)) continue;
    const v = field[(ty + dy) * grid.w + tx + dx];
    if (v < bestVal) {
      bestVal = v;
      best = [tx + dx, ty + dy];
    }
  }
  return best;
}
