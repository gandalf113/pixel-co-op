// Predykcja strzalu (V3-F-01): lokalny pocisk-duch rysowany natychmiast, porzucany gdy przyjdzie prawdziwy.
// Czysta logika, bez DOM. Odwzorowuje warunki i geometrie `fireWeapons` z server/combat.js.
import { modConfig, rifleStats } from '../shared/weapon.js';
import { segmentBlocked } from '../shared/world.js';

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rad = (deg) => (deg * Math.PI) / 180;

// Szal: snapshot niesie tylko `frenzyLeft`, nie tier. Domyslnie fireMult 0.5 (wszystkie tiery), bez potrojnego strzalu;
// wywolujacy moze podac `frenzy` w tick(), jesli zna tier.
const DEFAULT_FRENZY = { fireMult: 0.5, triple: false };

export class ShotPredictor {
  constructor(balance) {
    this.balance = balance;
    this.rttMs = null;
    this.interpMs = 0;
    this.reset();
  }

  reset() {
    this.ghosts = [];
    this.nextGhost = 1;
    this.nextGroup = 1;
    this.cooldown = 0;
    this.ammo = 0;
    this.reloadLeft = 0;
    this.me = null;
    this.synced = false;
  }

  // interpMs = biezace opoznienie bufora interpolacji. Prawdziwy pocisk staje sie WIDOCZNY dopiero
  // tyle po odebraniu snapshotu, wiec duch musi dozyc do tego momentu — inaczej miedzy jednym a drugim
  // jest dziura, czyli strzal bez pocisku.
  setRtt(ms, interpMs = 0) {
    this.rttMs = Number.isFinite(ms) ? ms : null;
    this.interpMs = Number.isFinite(interpMs) ? Math.max(0, interpMs) : 0;
  }

  get maxAgeMs() {
    const snapMs = 1000 / (this.balance.snapshotHz || 20);
    return clamp((this.rttMs ?? 100) + (this.interpMs ?? 0) + snapMs, 60, 500);
  }

  // Serwer jest prawda dla ammo i reloadLeft; cooldown liczymy sami.
  syncFromSnapshot(me) {
    if (!me) return;
    this.me = me;
    this.ammo = me.ammo;
    this.reloadLeft = me.reloadLeft ?? 0;
    this.synced = true;
  }

  tick(dtS, { me, fire, angle, x, y, grid: _grid, frenzy } = {}) {
    const b = this.balance;
    const m = me ?? this.me;
    if (!m) return [];
    if (!this.synced) this.syncFromSnapshot(m);
    const stats = rifleStats(b, m.weaponLv ?? 1);
    // Lokalne przeladowanie (serwer i tak skoryguje w kolejnym snapshocie).
    if (this.reloadLeft > 0) {
      this.reloadLeft = Math.max(0, this.reloadLeft - dtS);
      if (this.reloadLeft <= EPS) {
        this.reloadLeft = 0;
        this.ammo = stats.magazine;
      }
      this.cooldown = Math.max(-dtS, this.cooldown - dtS); // jak players.js: dolny klamp -dt
      return [];
    }
    this.cooldown = Math.max(-dtS, this.cooldown - dtS); // jak players.js: dolny klamp -dt
    if (m.state !== 'alive' || m.suspended || (m.busy ?? 0) > 0 || (m.held ?? null) !== null) return [];
    if (fire !== true || this.cooldown > EPS || this.ammo <= 0) return [];

    const { rifle } = b;
    const tilePx = b.map.tilePx;
    const fz = m.frenzyLeft > 0 ? frenzy ?? DEFAULT_FRENZY : null;
    // Szal przeslania modyfikator, jak na serwerze.
    const modName = fz ? null : m.weaponMod;
    const mod = fz ? null : modConfig(b, m.weaponMod);
    let fan = fz?.triple ? [-0.2, 0, 0.2] : [0];
    let speedPx = rifle.speedPx;
    let lenPx = 0;
    let interval = rifle.fireIntervalS;
    if (modName === 'fan' && mod) {
      const span = rad(mod.spreadDeg);
      fan = Array.from({ length: mod.count }, (_, i) => (mod.count > 1 ? (i / (mod.count - 1) - 0.5) * span : 0));
    } else if (modName === 'nailgun' && mod) {
      speedPx = mod.speedPx;
      lenPx = mod.lenPx;
      interval = mod.fireIntervalS;
    }
    // Samonaprowadzanie: duch leci prosto (zakret i tak jest widoczny dopiero po ~100 ms, a duch tyle nie zyje).
    // ROZRZUT: serwer losuje kat z world.rng(), czego klient nie odtworzy. Duch leci BEZ rozrzutu, po kacie
    // celowania - swiadoma roznica kilku pikseli na krotkim dystansie (rifle.spreadDeg 3 stopnie, nailgun 8).
    const r = b.player.radiusPx;
    const sx = x + Math.cos(angle) * r;
    const sy = y + Math.sin(angle) * r;
    const group = this.nextGroup++;
    const created = fan.map((off) => ({
      id: `g${this.nextGhost++}`, group, x: sx, y: sy,
      angle: angle + off, vx: Math.cos(angle + off) * speedPx, vy: Math.sin(angle + off) * speedPx,
      lenPx, travelLeft: rifle.rangeTiles * tilePx, ageMs: 0,
    }));
    this.ghosts.push(...created);
    this.cooldown += interval * (fz?.fireMult ?? 1);
    this.ammo--;
    if (this.ammo <= 0 && this.reloadLeft <= 0 && this.ammo < stats.magazine) this.reloadLeft = stats.reloadS;
    return created;
  }

  step(dtS, grid) {
    const tilePx = this.balance.map.tilePx;
    const maxAge = this.maxAgeMs;
    this.ghosts = this.ghosts.filter((g) => {
      g.ageMs += dtS * 1000;
      if (g.ageMs > maxAge) return false;
      if (g.killIn != null) {
        g.killIn -= dtS * 1000;
        if (g.killIn <= 0) return false;
      }
      const speed = Math.hypot(g.vx, g.vy);
      const len = Math.min(speed * dtS, g.travelLeft);
      const nx = g.x + (g.vx / speed) * len;
      const ny = g.y + (g.vy / speed) * len;
      // wallsOnly=false: solid = sciana + wieza, jak solidAlong na serwerze
      if (grid && segmentBlocked(grid, g.x, g.y, nx, ny, tilePx, false)) return false;
      g.x = nx;
      g.y = ny;
      g.travelLeft -= len;
      return g.travelLeft > EPS;
    });
  }

  // Zdarzenie {type:'shot', id: mojId}: skazuje najstarsza jeszcze nieskazana grupe (jeden strzal = 1 lub 3 pociski).
  // `delayMs` odracza zgon o opoznienie interpolacji, bo prawdziwy pocisk tyle czeka, zanim go widac.
  onShotEvent(e, delayMs = 0) {
    if (e?.type !== 'shot') return;
    const first = this.ghosts.find((g) => g.killIn == null);
    if (!first) return;
    if (!(delayMs > 0)) {
      this.ghosts = this.ghosts.filter((g) => g.group !== first.group);
      return;
    }
    for (const g of this.ghosts) if (g.group === first.group) g.killIn = delayMs;
  }

  // Krotki w ksztalcie snapshotu: [id,x,y] albo gwozdz [id,x,y,angle,lenPx].
  bullets() {
    return this.ghosts.map((g) => (g.lenPx ? [g.id, g.x, g.y, g.angle, g.lenPx] : [g.id, g.x, g.y]));
  }
}
