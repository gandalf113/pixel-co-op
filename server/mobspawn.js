import { circleFree } from './flowfield.js';

// Wspolne miejsce tworzenia potworow (spawn z fali i potomstwo tanka), zeby oba korzystaly z tego samego clampu.
export function makeMob(world, type, x, y) {
  const { balance } = world.rules;
  const { tilesW, tilesH, tilePx } = balance.map;
  const r = balance.mobs[type].radiusPx;
  const hp = world.rules.mobHp(type, world.wave);
  const mob = {
    id: world.nextId(), type, hp, maxHp: hp, stun: 0, attackCd: 0, angle: 0,
    x: Math.min(tilesW * tilePx - r, Math.max(r, x)),
    y: Math.min(tilesH * tilePx - r, Math.max(r, y)),
  };
  world.mobs.push(mob);
  return mob;
}

// Ile potworow wyjdzie z martwego `type` (0 = nie dzieli sie). Skalowane budzetem trudnosci.
export function splitCount(rules, type) {
  const sp = rules.balance.mobs[type].split;
  return sp ? Math.max(1, Math.round(sp.count * rules.diff.budget)) : 0;
}

// Ile zabic zostalo "w jednym potworze": on sam plus cale jego przyszle potomstwo. Dzieki temu licznik fali
// nie skacze w gore, gdy tank umiera, tylko spada o 1.
export const killsLeftIn = (rules, type) => 1 + splitCount(rules, type);

// Potomstwo rozrzucone promieniscie wokol miejsca smierci, na wolnych kafelkach: kazdy promien probuje
// od najdalszego punktu ku srodkowi (srodek jest wolny, bo stalo tam cialo rodzica).
export function spawnSplit(world, parent) {
  const { balance } = world.rules;
  const cfg = balance.mobs[parent.type];
  const n = splitCount(world.rules, parent.type);
  const rc = balance.mobs[cfg.split.type].radiusPx;
  const { tilePx, } = world.rules;
  const { tilesW, tilesH } = balance.map;
  const reach = cfg.radiusPx + rc + 2;
  const a0 = world.rng() * Math.PI * 2;
  const out = [];
  world.events.push({ type: 'split', id: parent.id, x: parent.x, y: parent.y });
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * Math.PI * 2) / n;
    let x = parent.x;
    let y = parent.y;
    for (let d = reach; d > 0; d -= 3) {
      const px = parent.x + Math.cos(a) * d;
      const py = parent.y + Math.sin(a) * d;
      if (px < rc || py < rc || px > tilesW * tilePx - rc || py > tilesH * tilePx - rc) continue;
      if (circleFree(world.grid, px, py, rc, tilePx)) {
        x = px;
        y = py;
        break;
      }
    }
    out.push(makeMob(world, cfg.split.type, x, y));
  }
  return out;
}
