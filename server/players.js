import { stepPlayer, playerSpeedPx } from '../public/shared/movement.js';

const EPS = 1e-9;
let dropHeld = () => {};
let padReviveS = () => null;

export function speedMultOf(p) {
  return p.frenzyLeft > 0 ? p.frenzy?.speedMult ?? 1 : 1;
}

export function setDropHeld(fn) {
  dropHeld = fn;
}

// Sonda platformy leczacej (items.js): ile sekund wstaje powalony stojacy na niej, albo null.
export function setPadReviveProbe(fn) {
  padReviveS = fn;
}

function spawnPos(rules, index) {
  const { map } = rules.balance;
  return {
    x: (map.tilesW * map.tilePx) / 2 + (index - 1.5) * 16,
    y: (map.tilesH * map.tilePx) / 2,
  };
}

export function createPlayer({ id, nick, color, ultKind = null }, rules, index) {
  const { x, y } = spawnPos(rules, index);
  const hp = rules.playerMaxHp();
  return {
    id, nick, color, x, y, angle: 0, hp, maxHp: hp,
    state: 'alive', suspended: false, suspendLeft: 0,
    reviveProgress: 0, deathLeft: 0, invuln: 0, cooldown: 0, busy: 0,
    held: null, ready: false, kills: 0, downs: 0, ultsUsed: 0, weaponLv: 1,
    ammo: rules.balance.rifle.magazine, reloadLeft: 0,
    ult: 0, ultKind, frenzy: null, frenzyLeft: 0,
    inputQueue: [],
    input: { seq: 0, mx: 0, my: 0, aimX: x + 1, aimY: y, fire: false },
    ackSeq: 0,
    spawnIndex: index,
  };
}

export function damagePlayer(world, player, amount, source) {
  if (player.state !== 'alive' || player.suspended || player.invuln > 0) return;
  player.hp -= amount;
  if (world.phase === 'break') {
    player.hp = Math.max(1, player.hp);
    return;
  }
  if (player.hp > 0) return;
  player.hp = 0;
  player.state = 'downed';
  player.downs++;
  player.deathLeft = world.rules.downedDeathTime();
  player.reviveProgress = 0;
  dropHeld(world, player);
  world.events.push({ type: 'down', id: player.id, source });
}

function tickDowned(world, p, dt) {
  const { reviveRangeTiles, reviveTimeS, reviveHp, invulnS } = world.rules.balance.player;
  const range = reviveRangeTiles * world.rules.tilePx;
  let helped = false;
  for (const o of world.players.values()) {
    if (o === p || o.state !== 'alive' || o.suspended) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) <= range) {
      helped = true;
      break;
    }
  }
  // Platforma stawia bez sojusznika, szybciej niz sojusznik: postep rosnie tak, by pelny byl po reviveS.
  const padS = padReviveS(world, p);
  const rate = padS !== null ? Math.max(1, reviveTimeS / padS) : 1;
  helped ||= padS !== null;
  p.reviveProgress = helped ? p.reviveProgress + dt * rate : Math.max(0, p.reviveProgress - dt);
  if (p.reviveProgress < EPS) p.reviveProgress = 0;
  if (p.reviveProgress >= reviveTimeS - EPS) {
    p.state = 'alive';
    p.hp = reviveHp;
    p.invuln = invulnS;
    p.reviveProgress = 0;
    p.deathLeft = 0;
    world.events.push({ type: 'revive', id: p.id });
    return;
  }
  p.deathLeft -= dt;
  if (p.deathLeft <= EPS) {
    p.deathLeft = 0;
    p.reviveProgress = 0;
    p.state = 'dead';
    world.events.push({ type: 'death', id: p.id });
  }
}

export function updatePlayers(world, dt) {
  const { balance } = world.rules;
  for (const p of world.players.values()) {
    const input = p.inputQueue.shift();
    if (input) {
      p.input = input;
      p.ackSeq = input.seq;
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.busy = Math.max(0, p.busy - dt);
    p.cooldown = Math.max(-dt, p.cooldown - dt);
    if (p.suspended) p.suspendLeft = Math.max(0, p.suspendLeft - dt);

    p.angle = Math.atan2(p.input.aimY - p.y, p.input.aimX - p.x);

    if (input && p.state === 'alive' && !p.suspended && p.busy <= 0) {
      const heldKind = p.held != null ? world.items.get(p.held)?.kind ?? null : null;
      const pos = stepPlayer(p, input, dt, playerSpeedPx(balance, heldKind, speedMultOf(p)), world.grid, balance);
      p.x = pos.x;
      p.y = pos.y;
    }

    if (p.state === 'alive' && !p.suspended && world.phase === 'break') {
      p.hp = Math.min(p.maxHp, p.hp + balance.player.breakRegenPerS * dt);
    }
    if (p.state === 'downed') tickDowned(world, p, dt);
  }
}

export function startBreakFor(world) {
  const { reviveHp, respawnHp, invulnS } = world.rules.balance.player;
  for (const p of world.players.values()) {
    if (p.state === 'downed') {
      p.state = 'alive';
      p.hp = reviveHp;
      p.invuln = invulnS;
    } else if (p.state === 'dead') {
      const { x, y } = spawnPos(world.rules, p.spawnIndex);
      p.state = 'alive';
      p.hp = respawnHp;
      p.x = x;
      p.y = y;
      p.invuln = invulnS;
    }
    p.reviveProgress = 0;
    p.deathLeft = 0;
    p.ready = false;
  }
}

export function allDown(world) {
  if (world.players.size === 0) return false;
  for (const p of world.players.values()) {
    if (p.state === 'alive' && !p.suspended) return false;
  }
  return true;
}
