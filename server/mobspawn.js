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

// Ile potworow wychodzi z JEDNEGO wpisu kolejki spawnu (`pack`: Roj wychodzi trojka).
export const packSize = (rules, type) => rules.balance.mobs[type].pack ?? 1;

// Ile zabic siedzi w jednym WPISIE KOLEJKI: cala paczka, kazdy z potomstwem. Dzieki temu licznik fali
// nie skacze w gore, gdy tank umiera ani gdy Roj sie pojawia.
export const killsLeftIn = (rules, type) => packSize(rules, type) * (1 + splitCount(rules, type));

// To samo dla potwora, ktory juz zyje (paczka jest rozpakowana): on sam plus jego przyszle potomstwo.
export const killsLeftInMob = (rules, type) => 1 + splitCount(rules, type);

// Spawn z fali: jeden wpis kolejki = `pack` potworow obok siebie, na wolnych miejscach.
export function spawnFromQueue(world, type, x, y) {
  const n = packSize(world.rules, type);
  if (n <= 1) return [makeMob(world, type, x, y)];
  const { tilePx } = world.rules;
  const r = world.rules.balance.mobs[type].radiusPx;
  const a0 = world.rng() * Math.PI * 2;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * Math.PI * 2) / n;
    let px = x;
    let py = y;
    for (let d = r * 2 + 2; d > 0; d -= 2) {
      const cx = x + Math.cos(a) * d;
      const cy = y + Math.sin(a) * d;
      if (circleFree(world.grid, cx, cy, r, tilePx)) { px = cx; py = cy; break; }
    }
    out.push(makeMob(world, type, px, py));
  }
  return out;
}

// Potomstwo rozrzucone promieniscie wokol miejsca smierci, na wolnych kafelkach: kazdy promien probuje
// od najdalszego punktu ku srodkowi (srodek jest wolny, bo stalo tam cialo rodzica).
export function spawnSplit(world, parent) {
  const cfg = world.rules.balance.mobs[parent.type];
  return spawnAround(world, parent, cfg.split.type, splitCount(world.rules, parent.type));
}

// `n` potworow typu `type` wokol `parent` (potomstwo tanka, ślimaki wezwane przez bossa). Zdarzenie `split`
// klient juz obsluguje (obloczek w miejscu rodzica), wiec wezwanie bossa nie ma wlasnego.
export function spawnAround(world, parent, type, n) {
  const { balance } = world.rules;
  const cfg = balance.mobs[parent.type];
  const rc = balance.mobs[type].radiusPx;
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
    out.push(makeMob(world, type, x, y));
  }
  return out;
}
