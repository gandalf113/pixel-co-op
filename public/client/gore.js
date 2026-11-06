// Model gore po stronie klienta: trupy ze stadiami rozkladu, kaluze (laczenie plam)
// i slady butow. Czysty JS, bez DOM - importowalny w testach node'owych.
// Wszystko klientowe (V3-G-03, V3-H-03): nic z tego nie jedzie po sieci poza
// numerem fali w krotce trupa [typ, x, y, kat, fala].

export const STAGE_FRESH = 0;
export const STAGE_BLOAT = 1;
export const STAGE_BONES = 2;
export const STAGE_FADED = 3;

// Stadium z wieku (fale od smierci); null = trup zniknal. Brak znacznika fali = swiezy.
export function corpseStage(corpse, wave, lifeWaves) {
  const w = corpse[4];
  const age = w == null ? 0 : Math.max(0, wave - w);
  if (age >= lifeWaves) return null;
  return Math.min(age, STAGE_FADED);
}

export class Gore {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.corpses = [];
    this.marks = []; // plamy i slady razem, od najstarszego; wspolny limit
    this.wave = 0;
    this.grid = new Map(); // klucz komorki -> plamy (nie slady)
    this.walkers = new Map();
    this.lastCheck = -Infinity;
  }

  // ---- trupy ----

  addCorpse(type, x, y, a, wave) {
    this.corpses.push([type, x, y, a, wave]);
    if (this.corpses.length > this.cfg.maxCorpses) this.corpses.splice(0, this.corpses.length - this.cfg.maxCorpses);
  }

  stageOf(corpse) {
    return corpseStage(corpse, this.wave, this.cfg.corpseLifeWaves);
  }

  // Przejscia stadiow dzieja sie same przez numer fali; przy jego wzroscie
  // przycinamy te, ktore przekroczyly zycie, zeby zwolnic limit.
  setWave(wave) {
    if (wave === this.wave) return;
    const grew = wave > this.wave;
    this.wave = wave;
    if (grew) this.corpses = this.corpses.filter((c) => this.stageOf(c) !== null);
  }

  // ---- plamy ----

  #cell(v) {
    return Math.floor(v / this.cfg.cellPx);
  }

  #gridAdd(s) {
    const key = `${this.#cell(s.x)},${this.#cell(s.y)}`;
    s.key = key;
    const arr = this.grid.get(key);
    if (arr) arr.push(s);
    else this.grid.set(key, [s]);
  }

  #gridRemove(s) {
    const arr = this.grid.get(s.key);
    if (!arr) return;
    const i = arr.indexOf(s);
    if (i >= 0) arr.splice(i, 1);
    if (arr.length === 0) this.grid.delete(s.key);
  }

  // Najblizsza plama w promieniu r (haszem przestrzennym, bez skanu wszystkich).
  nearestSplat(x, y, r) {
    let best = null;
    let bd = r * r;
    const x0 = this.#cell(x - r), x1 = this.#cell(x + r);
    const y0 = this.#cell(y - r), y1 = this.#cell(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.grid.get(`${cx},${cy}`);
        if (!arr) continue;
        for (const s of arr) {
          const d = (s.x - x) ** 2 + (s.y - y) ** 2;
          if (d <= bd) { bd = d; best = s; }
        }
      }
    }
    return best;
  }

  // level: 0 trafienie, 1 smierc. Blisko istniejacej plamy -> podnosi jej poziom.
  addSplat(x, y, level, now) {
    const { mergePx, splatLevels } = this.cfg;
    const near = this.nearestSplat(x, y, mergePx);
    if (near) {
      near.level = Math.min(splatLevels - 1, near.level + Math.max(1, level));
      near.t = now;
      return near;
    }
    const s = { kind: 'splat', x, y, level: Math.min(splatLevels - 1, level), t: now, key: '' };
    this.marks.push(s);
    this.#gridAdd(s);
    this.#trim();
    return s;
  }

  addStep(x, y, a, k) {
    const s = { kind: 'step', x, y, a, k };
    this.marks.push(s);
    this.#trim();
    return s;
  }

  #trim() {
    const over = this.marks.length - this.cfg.maxSplats;
    if (over <= 0) return;
    for (let i = 0; i < over; i++) {
      const m = this.marks[i];
      if (m.kind === 'splat') this.#gridRemove(m);
    }
    this.marks.splice(0, over);
  }

  // Odtworzenie po reconnekcie: plamy serwera (bez czasu, wiec nie swieze) + trupy.
  restore(corpses, splats) {
    this.corpses = corpses.slice(-this.cfg.maxCorpses);
    this.marks = [];
    this.grid = new Map();
    this.walkers = new Map();
    for (const [x, y] of splats) this.addSplat(x, y, 0, -Infinity);
    for (const c of this.corpses) this.addSplat(c[1], c[2], 1, -Infinity);
  }

  // ---- slady butow ----

  isFresh(s, now) {
    return now - s.t < this.cfg.freshPoolS * 1000;
  }

  due(now) {
    return now - this.lastCheck >= this.cfg.checkMs;
  }

  // Wywolywane co klatke; wlasna przepustnica co checkMs. ents: [{ id, x, y }].
  // Wejscie w swieza kaluze = umoczenie na footprintSteps krokow.
  walk(now, ents) {
    if (now - this.lastCheck < this.cfg.checkMs) return;
    this.lastCheck = now;
    const { footprintSteps, strideStepPx, stepOffsetPx, splatSizes } = this.cfg;
    const seen = new Set();
    for (const e of ents) {
      seen.add(e.id);
      let w = this.walkers.get(e.id);
      if (!w) {
        w = { x: e.x, y: e.y, acc: 0, left: 0, side: 1 };
        this.walkers.set(e.id, w);
      }
      const dx = e.x - w.x, dy = e.y - w.y;
      const d = Math.hypot(dx, dy);
      // ruch dopiero po krokach: najpierw slady z biezacego umoczenia, potem test kaluzy
      if (w.left > 0 && d > 0 && d < strideStepPx * 8) {
        const a = Math.atan2(dy, dx);
        const nx = -Math.sin(a), ny = Math.cos(a);
        w.acc += d;
        let walked = 0;
        while (w.acc >= strideStepPx && w.left > 0) {
          w.acc -= strideStepPx;
          walked += strideStepPx;
          const f = Math.min(1, walked / d);
          const px = w.x + dx * f, py = w.y + dy * f;
          const k = w.left / footprintSteps;
          this.addStep(px + nx * stepOffsetPx * w.side, py + ny * stepOffsetPx * w.side, a, k);
          w.side = -w.side;
          w.left--;
        }
      }
      w.x = e.x;
      w.y = e.y;
      const inPool = this.#insidePool(e.x, e.y, splatSizes);
      if (inPool && this.isFresh(inPool, now)) {
        w.left = footprintSteps;
        w.acc = 0;
      }
    }
    for (const id of this.walkers.keys()) if (!seen.has(id)) this.walkers.delete(id);
  }

  // Plama, w ktorej obrebie (promien = pol rozmiaru jej sprite'a) stoi punkt.
  #insidePool(x, y, sizes) {
    const rmax = sizes[sizes.length - 1] / 2;
    const near = this.nearestSplat(x, y, rmax);
    if (!near) return null;
    return Math.hypot(near.x - x, near.y - y) <= sizes[near.level] / 2 ? near : null;
  }
}
