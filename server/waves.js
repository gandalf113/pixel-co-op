import { pickWeighted, randInt } from './rng.js';
// Jeden wpis kolejki moze byc paczka (Roj = 3 potwory), wiec limity licza POTWORY, nie wpisy.
import { packSize } from './mobspawn.js';

// Wypada jeden typ (od fali excludeFromWave), losowany wazony `weight` - najslabsi (najwyzszy weight) najczesciej.
export function pickExcluded(rules, n, rng) {
  const { mobs, waves } = rules.balance;
  const types = Object.keys(mobs).filter((t) => mobs[t].fromWave <= n && !mobs[t].bossEvery);
  if (n < waves.excludeFromWave || types.length < 2) return null;
  return pickWeighted(rng, types.map((t) => [t, mobs[t].weight])) ?? null;
}

// Fala = ciag grup (tablic typow), kazda zdominowana przez jeden typ, w losowej kolejnosci.
export function composeGroups(rules, n, rng) {
  const { mobs, waves } = rules.balance;
  const excluded = pickExcluded(rules, n, rng);
  const types = Object.keys(mobs).filter((t) => mobs[t].fromWave <= n && !mobs[t].bossEvery && t !== excluded);
  // Fala z bossem ma mniejszy sklad zwyklych potworow (03-WAVES-DIFFICULTY.md 2.2: "Boss plus 60% budzetu").
  const total = rules.waveBudget(n) * (bossesForWave(rules, n).length ? waves.bossWaveBudgetMul : 1);
  let budget = total;
  let forcedBrute = false;
  if (n >= waves.minBruteFromWave && excluded !== 'brute' && mobs.brute) {
    forcedBrute = true;
    budget -= mobs.brute.cost;
  }
  const groups = [];
  for (;;) {
    const fits = types.filter((t) => mobs[t].cost <= budget);
    if (fits.length === 0) break;
    const share = waves.groupShareMin + rng() * (waves.groupShareMax - waves.groupShareMin);
    let target = Math.min(total * share, budget);
    if (budget - target < total * waves.groupShareMin * 0.5) target = budget;
    const primary = pickWeighted(rng, fits.map((t) => [t, mobs[t].weight]));
    if (!primary) break; // same zerowe wagi: nie ma z czego zbudowac grupy (bez tego leci TypeError w srodku gry)
    const kinds = [[primary, 1 - waves.groupMixedMinorShare]];
    if (fits.length > 1 && rng() < waves.groupMixedChance) {
      const second = pickWeighted(rng, fits.filter((t) => t !== primary).map((t) => [t, mobs[t].weight]));
      kinds.push([second, waves.groupMixedMinorShare]);
    }
    const group = [];
    let left = target;
    let inGroup = 0; // liczone w potworach, nie we wpisach: 24 wpisy Roju to 72 potwory
    while (inGroup < waves.groupMaxMobs) {
      const ok = kinds.filter(([t]) => mobs[t].cost <= left && mobs[t].cost <= budget);
      if (ok.length === 0) {
        if (inGroup > 0) break;
        group.push(primary); inGroup += packSize(rules, primary); left -= mobs[primary].cost; budget -= mobs[primary].cost; continue;
      }
      const t = pickWeighted(rng, ok);
      group.push(t);
      inGroup += packSize(rules, t);
      left -= mobs[t].cost;
      budget -= mobs[t].cost;
    }
    groups.push(group);
  }
  if (forcedBrute) groups.splice(randInt(rng, 0, groups.length), 0, ['brute']);
  Object.defineProperty(groups, 'excluded', { value: excluded, enumerable: false });
  return groups;
}

// Zwraca plaska liste typow (w kolejnosci grup); `.groups` niesie podzial dla SpawnDirector,
// a `.excluded` typ, ktory w tej fali nie wystapi (null przed `excludeFromWave`). Oba niewyliczalne,
// zeby lista zachowywala sie jak zwykla tablica typow.
export function composeWave(rules, n, rng) {
  const groups = composeGroups(rules, n, rng);
  const flat = groups.flat();
  Object.defineProperty(flat, 'groups', { value: groups, enumerable: false });
  Object.defineProperty(flat, 'excluded', { value: groups.excluded ?? null, enumerable: false });
  return flat;
}

// Typy z `bossEvery` (boss) stawia sie osobno przy starcie fali, poza kompozycja i budzetem.
export function bossesForWave(rules, n) {
  const mobs = rules.balance.mobs;
  return Object.keys(mobs).filter((t) => mobs[t].bossEvery && n >= mobs[t].fromWave && n % mobs[t].bossEvery === 0);
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
    const w = rules.balance.waves;
    this.groups = composition.groups
      ? composition.groups.map((g) => g.slice())
      : chunk(composition, w.groupMaxMobs);
    this.current = null; // { list, points } - grupa w trakcie wypuszczania
    this.points = spawnPoints(rules);
    this.timer = w.batchIntervalS;
  }

  // Plaska lista pozostalych typow (game.js liczy z niej mobsLeft).
  get queue() {
    return [...(this.current?.list ?? []), ...this.groups.flat()];
  }

  // Podmiana kolejki plaska lista (testy, narzedzia): grupowanie liczy sie od nowa.
  set queue(list) {
    this.current = null;
    this.groups = chunk(list, this.rules.balance.waves.groupMaxMobs);
  }

  get pending() {
    return (this.current?.list.length ?? 0) + this.groups.reduce((s, g) => s + g.length, 0);
  }

  get done() { return this.pending === 0; }

  update(dt, aliveCount, playerPositions) {
    const w = this.rules.balance.waves;
    this.timer += dt;
    if (this.timer < w.batchIntervalS) return [];
    this.timer -= w.batchIntervalS;
    const room = Math.max(0, w.maxAliveMobs - aliveCount);
    if (room === 0) return [];
    if (!this.current) {
      if (this.groups.length === 0) return [];
      this.current = { list: this.groups.shift(), points: this.#choosePoints(playerPositions) };
    }
    const cur = this.current;
    const out = [];
    // `room` jest w POTWORACH: wpis Roju to trzy sztuki. Pierwszy wpis wychodzi zawsze, nawet gdy paczka
    // jest wieksza niz luz - inaczej przy pelnej planszy Roj nigdy by nie wyszedl i fala nie mialaby konca.
    let spawned = 0;
    while (cur.list.length > 0) {
      const type = cur.list[0];
      const n = packSize(this.rules, type);
      if (spawned > 0 && spawned + n > room) break;
      cur.list.shift();
      const p = cur.points[out.length % cur.points.length];
      out.push({ type, x: p.x + (this.rng() * 8 - 4), y: p.y + (this.rng() * 8 - 4) });
      spawned += n;
      if (spawned >= room) break;
    }
    if (cur.list.length === 0) this.current = null;
    return out;
  }

  // Jeden punkt (lub dwa sasiednie na pierscieniu), najchetniej poza wzrokiem graczy.
  #choosePoints(playerPositions) {
    const w = this.rules.balance.waves;
    const n = this.points.length;
    const hidden = this.points.map((p) => playerPositions.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > w.spawnHiddenDistPx));
    let idx = [];
    for (let i = 0; i < n; i++) if (hidden[i]) idx.push(i);
    if (idx.length === 0) idx = this.points.map((_, i) => i);
    const i = idx[randInt(this.rng, 0, idx.length - 1)];
    const chosen = [this.points[i]];
    if (this.rng() < w.groupTwoPointChance) {
      const nb = [(i + 1) % n, (i + n - 1) % n].filter((j) => j !== i && hidden[j] === hidden[i]);
      if (nb.length) chosen.push(this.points[nb[randInt(this.rng, 0, nb.length - 1)]]);
    }
    return chosen;
  }
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
