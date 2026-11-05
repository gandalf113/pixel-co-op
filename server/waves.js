import { pickWeighted, randInt } from './rng.js';

export function composeWave(rules, n, rng) {
  const { mobs, waves } = rules.balance;
  const types = Object.keys(mobs).filter((t) => mobs[t].fromWave <= n);
  let budget = rules.waveBudget(n);
  const comp = [];
  if (n >= waves.minBruteFromWave) {
    comp.push('brute');
    budget -= mobs.brute.cost;
  }
  for (;;) {
    const fits = types.filter((t) => mobs[t].cost <= budget);
    if (fits.length === 0) break;
    const type = pickWeighted(rng, fits.map((t) => [t, mobs[t].weight]));
    comp.push(type);
    budget -= mobs[type].cost;
  }
  return comp;
}

export function spawnPoints(rules) {
  const { tilesW: w, tilesH: h, tilePx } = rules.balance.map;
  const ring = [];
  for (let x = 0; x < w; x++) ring.push([x, 0]);
  for (let y = 1; y < h; y++) ring.push([w - 1, y]);
  for (let x = w - 2; x >= 0; x--) ring.push([x, h - 1]);
  for (let y = h - 2; y >= 1; y--) ring.push([0, y]);
  const count = rules.balance.waves.spawnPoints;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const [tx, ty] = ring[Math.floor((i * ring.length) / count)];
    pts.push({ x: tx * tilePx + tilePx / 2, y: ty * tilePx + tilePx / 2 });
  }
  return pts;
}

export class SpawnDirector {
  constructor(rules, n, composition, rng) {
    this.rules = rules;
    this.rng = rng;
    this.queue = composition.slice();
    this.points = spawnPoints(rules);
    const w = rules.balance.waves;
    this.batchSize = Math.max(w.batchMin, Math.floor(rules.waveBudget(n) / w.batchDivisor));
    this.timer = w.batchIntervalS;
  }

  get pending() { return this.queue.length; }

  get done() { return this.queue.length === 0; }

  update(dt, aliveCount, playerPositions) {
    const w = this.rules.balance.waves;
    this.timer += dt;
    if (this.timer < w.batchIntervalS) return [];
    this.timer -= w.batchIntervalS;
    const count = Math.min(this.batchSize, this.queue.length, Math.max(0, w.maxAliveMobs - aliveCount));
    if (count === 0) return [];
    const chosen = this.#choosePoints(playerPositions);
    const out = [];
    for (let i = 0; i < count; i++) {
      const p = chosen[i % chosen.length];
      out.push({
        type: this.queue.shift(),
        x: p.x + (this.rng() * 8 - 4),
        y: p.y + (this.rng() * 8 - 4),
      });
    }
    return out;
  }

  #choosePoints(playerPositions) {
    const w = this.rules.balance.waves;
    const want = randInt(this.rng, w.spawnPointsPerBatchMin, w.spawnPointsPerBatchMax);
    const far = [], near = [];
    for (const p of this.points) {
      const hidden = playerPositions.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > w.spawnHiddenDistPx);
      (hidden ? far : near).push(p);
    }
    const chosen = this.#shuffle(far).slice(0, want);
    if (chosen.length < want) chosen.push(...this.#shuffle(near).slice(0, want - chosen.length));
    return chosen;
  }

  #shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(this.rng, 0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
