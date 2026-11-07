// Plomien (V3-Q-04): byt swiata na kafelku, sila 1 -> 0 liniowo przez `lifeS`, potem znika.
// Rani graczy, potwory i hard objecty stojace na kafelku, proporcjonalnie do sily, w rytmie `tickS`.
// Zrodla sa WYLACZNIE wrogie (wybuch granatu, Kamikaze, random eventy): gracz nie ma niczego, co stawia ogien.
// Ciemnosc (V3-Q-05): `world.dark` = null albo { alpha, tint, radiusTiles }; serwer tylko niesie to w snapshocie,
// rysuje klient (maska z kolami swiatla wokol graczy i plomieni).
import { damagePlayer } from './players.js';
import { damageMob } from './combat.js';
import { tileOf, footprint } from '../public/shared/world.js';

const cfgOf = (world) => world.rules.balance.flames;

export function flameAt(world, tx, ty) {
  return world.flames.find((f) => f.tx === tx && f.ty === ty) ?? null;
}

// Zapala kafelek. Istniejacy plomien dostaje max(sila), nowy wchodzi na koniec listy; ponad limit
// wylatuja najstarsze. Zwraca plomien albo null (poza mapa, sciana kafelka nie blokuje: ogien pali sie na ruinach).
export function spawnFlame(world, tx, ty, strength = 1) {
  if (!world.grid.inside(tx, ty)) return null;
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 0) return null;
  const old = flameAt(world, tx, ty);
  if (old) {
    old.strength = Math.max(old.strength, s);
    return old;
  }
  const f = { id: world.nextId(), tx, ty, strength: s };
  world.flames.push(f);
  const max = cfgOf(world).max;
  if (world.flames.length > max) world.flames.splice(0, world.flames.length - max);
  const tp = world.rules.tilePx;
  world.events.push({ type: 'flame', id: f.id, x: (tx + 0.5) * tp, y: (ty + 0.5) * tp });
  return f;
}

// Plomienie po wybuchu wrogim: srodek pelna sila, czterech sasiadow `ringStrength` (0 = bez pierscienia).
export function igniteBlast(world, x, y, { center = 1, ring = 0 } = {}) {
  const tp = world.rules.tilePx;
  const tx = tileOf(x, tp);
  const ty = tileOf(y, tp);
  spawnFlame(world, tx, ty, center);
  if (ring > 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) spawnFlame(world, tx + dx, ty + dy, ring);
}

function burnTick(world, hooks) {
  const cfg = cfgOf(world);
  const tp = world.rules.tilePx;
  const perTick = cfg.dps * cfg.tickS;
  const byTile = new Map(world.flames.map((f) => [`${f.tx},${f.ty}`, f]));
  const at = (x, y) => byTile.get(`${tileOf(x, tp)},${tileOf(y, tp)}`);
  for (const p of world.players.values()) {
    if (p.state !== 'alive' || p.suspended) continue;
    const f = at(p.x, p.y);
    if (f) damagePlayer(world, p, perTick * f.strength, 'flame');
  }
  for (const m of [...world.mobs]) {
    const f = at(m.x, m.y);
    if (f) damageMob(world, m, perTick * f.strength, null);
  }
  for (const item of [...world.items.values()]) {
    if (item.state !== 'placed' || world.rules.balance.items[item.kind]?.category !== 'hard' || !(item.hp > 0)) continue;
    let best = 0;
    for (const [tx, ty] of footprint(item.kind, item.tx, item.ty, item.rot)) {
      const f = byTile.get(`${tx},${ty}`);
      if (f) best = Math.max(best, f.strength);
    }
    if (best > 0) hooks.onWallHit?.(item, perTick * best);
  }
}

export function updateFlames(world, dt, hooks = {}) {
  if (!world.flames.length) {
    world.flameTick = 0;
    return;
  }
  const cfg = cfgOf(world);
  for (const f of world.flames) f.strength -= dt / cfg.lifeS;
  world.flames = world.flames.filter((f) => f.strength > 0);
  world.flameTick = (world.flameTick ?? 0) + dt;
  while (world.flameTick >= cfg.tickS - 1e-9) {
    world.flameTick -= cfg.tickS;
    burnTick(world, hooks);
  }
}

// Ciemnosc: null gasi. Pola: alpha 0..1, tint '#rrggbb', radiusTiles (kolo swiatla wokol gracza).
export function setDark(world, dark) {
  world.dark = dark ? { alpha: dark.alpha ?? 0.75, tint: dark.tint ?? '#200000', radiusTiles: dark.radiusTiles ?? 4 } : null;
}
