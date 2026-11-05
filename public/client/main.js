import { COLORS } from '../shared/protocol.js';
import { buildGrid, footprint, placeTarget } from '../shared/world.js';
import { Fx } from './fx.js';
import { Connection, stored } from './net.js';
import { InputState } from './input.js';
import { Predictor, SnapshotBuffer, lerpEntities } from './predict.js';
import { bakeSprites } from './sprites.js';
import { VIEW_W, VIEW_H, Camera, computeScale, renderWorld } from './render.js';
import { renderHud } from './hud.js';
import * as ui from './ui.js';

const ENDED_MSG_MS = 2500;
const PLAYER_KEY = { id: 'id', x: 'x', y: 'y', angle: 'angle' };
const MOB_KEY = { id: 0, x: 2, y: 3 };
const BULLET_KEY = { id: 0, x: 1, y: 2 };

const worldCanvas = document.getElementById('world');
const hudCanvas = document.getElementById('hud');
const wctx = worldCanvas.getContext('2d');
const hctx = hudCanvas.getContext('2d');

const cam = new Camera();
const buffer = new SnapshotBuffer();
const input = new InputState(worldCanvas);
const conn = new Connection(onMessage, onStatus);

let balance = null;
let sprites = null;
let predictor = null;
let myId = null;
let nick = stored('nick') ?? '';
let isHost = false;
let mode = 'nick';
let status = 'idle';
let paused = false;
let tab = false;
let latest = null;
let grid = null;
let seq = 0;
let heldRot = 0;
let tickTimer = null;
let lobbyDelayUntil = 0;
let lobbyTimer = null;
const itemRot = new Map();
const mobAngles = new Map();
const gore = { corpses: [], splats: [] };
const shakes = new Map();
const fx = new Fx();
let lastFrameMs = 0;
let effects = [];
let denyUntil = 0;
let flash = null;
const EFFECT_MS = { shockwave: 500, heal: 700, freeze: 700, widegun: 300, rocket: 300, wall: 400, frenzy: 400, explode: 400 };
const FLASH_MS = 300;
let scale = 1;
const offset = { x: 0, y: 0 };

function join(n) {
  nick = n;
  ui.showMessage('Łączę…');
  conn.connect(n);
}

function resetGame() {
  latest = null;
  grid = null;
  buffer.clear();
  itemRot.clear();
  mobAngles.clear();
  gore.corpses = [];
  gore.splats = [];
  shakes.clear();
  fx.reset();
  effects = [];
  paused = false;
  heldRot = 0;
  conn.inGame = false;
}

function enterLobbyScreen(msg) {
  mode = 'lobby';
  resetGame();
  ui.showLobby(msg, {
    difficulties: balance.difficulty,
    ultimates: balance.ultimate.kinds,
    myId,
    onUlt: (kind) => conn.send({ t: 'ult', kind }),
    onDifficulty: (level) => conn.send({ t: 'difficulty', level }),
    onStart: () => conn.send({ t: 'start' }),
  });
}

function onMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      myId = msg.id;
      balance = msg.balance;
      sprites ??= bakeSprites(document, COLORS);
      predictor ??= new Predictor(balance);
      if (!tickTimer) tickTimer = setInterval(tick, 1000 / balance.tickHz);
      break;
    case 'lobby': {
      isHost = msg.youAreHost;
      clearTimeout(lobbyTimer);
      const wait = lobbyDelayUntil - performance.now();
      if (wait > 0) lobbyTimer = setTimeout(() => enterLobbyScreen(msg), wait);
      else enterLobbyScreen(msg);
      break;
    }
    case 'snap':
      onSnap(msg);
      break;
    case 'ev':
      for (const e of msg.list) onEvent(e);
      break;
    case 'gore':
      gore.corpses = msg.corpses.slice();
      gore.splats = msg.splats.map(([x, y]) => [x, y, 0]);
      for (const [, x, y] of gore.corpses) gore.splats.push([x, y, 1]);
      fx.restore(msg.scorches ?? [], msg.rubble ?? []);
      break;
    case 'results':
      mode = 'results';
      paused = false;
      ui.showResults(msg, isHost, () => conn.send({ t: 'toLobby' }));
      break;
    case 'ended':
      lobbyDelayUntil = performance.now() + ENDED_MSG_MS;
      resetGame();
      mode = 'ended';
      ui.showMessage(msg.reason);
      break;
  }
}

function pushCapped(list, entry, max) {
  list.push(entry);
  if (list.length > max) list.splice(0, list.length - max);
}

function itemCenter(id) {
  const it = latest?.items.find((i) => i.id === id);
  if (!it) return null;
  const tp = balance.map.tilePx;
  if (it.kind === 'wall') return { x: (it.tx + (it.rot ? 0.5 : 1)) * tp, y: (it.ty + (it.rot ? 1 : 0.5)) * tp };
  return { x: (it.tx + 0.5) * tp, y: (it.ty + 0.5) * tp };
}

function onEvent(e) {
  const max = balance.gore;
  const now = performance.now();
  const tp = balance.map.tilePx;
  switch (e.type) {
    case 'pickup':
      if (e.player === myId) heldRot = itemRot.get(e.id) ?? 0;
      break;
    case 'hit':
      if (!e.mob) break;
      pushCapped(gore.splats, [Math.round(e.x), Math.round(e.y), 0], max.maxSplats);
      fx.mobHit(now, e, myId);
      break;
    case 'objHit': {
      shakes.set(e.id, now);
      const c = e.x != null ? e : itemCenter(e.id);
      if (c) fx.objHit(now, c.x, c.y, e.x != null);
      break;
    }
    case 'destroyed':
      fx.destroyed(now, e, e.kind === 'wall' ? footprint('wall', e.tx, e.ty, e.rot) : [[e.tx, e.ty]], tp);
      break;
    case 'explode':
      fx.explode(now, e, predictor?.pos, tp, latest?.mobs ?? []);
      break;
    case 'shot': {
      const shooter = latest?.players.find((p) => p.id === e.id);
      const origin = shooter ? (e.id === myId && predictor?.pos ? predictor.pos : shooter) : e;
      fx.shot(now, e, !!shooter, origin.x, origin.y);
      break;
    }
    case 'ff':
      fx.ff(now, e, myId, (id) => latest?.players.find((p) => p.id === id)?.nick ?? '?');
      break;
    case 'ultDeny':
      if (e.id === myId) denyUntil = now + 800;
      break;
    case 'ult': {
      const color = latest?.players.find((p) => p.id === e.id)?.color ?? '#ffffff';
      effects.push({ ...e, color, start: now, durMs: EFFECT_MS[e.kind] * (e.tier === 3 ? 1.6 : 1) });
      flash = { color, start: now, strong: e.id === myId };
      break;
    }
    case 'mobDeath':
      pushCapped(gore.splats, [Math.round(e.x), Math.round(e.y), 1], max.maxSplats);
      pushCapped(gore.corpses, [e.mobType, Math.round(e.x), Math.round(e.y), e.a], max.maxCorpses);
      fx.mobDeath(now, e);
      break;
  }
}

function onStatus(s, reason) {
  status = s;
  if (s !== 'rejected') return;
  mode = 'nick';
  resetGame();
  ui.showMessage(reason ?? 'Odrzucono');
  setTimeout(() => {
    if (mode === 'nick') ui.showNickForm(join, nick);
  }, ENDED_MSG_MS);
}

function moveCtx(me) {
  return { grid, heldKind: me.held, speedMult: me.speedMult ?? 1, canMove: me.state === 'alive' && !me.suspended && !(me.busy > 0) };
}

function onSnap(snap) {
  if (mode === 'lobby' || mode === 'nick') {
    mode = 'game';
    ui.hideAll();
  }
  if (mode !== 'game' && mode !== 'results') return;
  conn.inGame = true;
  const prev = latest;
  latest = snap;
  buffer.push(snap, performance.now());
  grid = buildGrid(balance.map.tilesW, balance.map.tilesH, snap.items);
  for (const it of snap.items) itemRot.set(it.id, it.rot ?? 0);
  if (prev) {
    const before = new Map(prev.mobs.map((m) => [m[0], m]));
    for (const m of snap.mobs) {
      const p = before.get(m[0]);
      if (p && (p[2] !== m[2] || p[3] !== m[3])) mobAngles.set(m[0], Math.atan2(m[3] - p[3], m[2] - p[2]));
    }
  }
  const me = myView(snap);
  if (me) predictor.reconcile(me, snap.you.ackSeq, moveCtx(me));
}

function myView(snap) {
  return snap?.players.find((p) => p.id === myId) ?? null;
}

function aimWorld() {
  const a = input.aimScreen();
  return cam.viewToWorld(a.x / scale, a.y / scale);
}

function tick() {
  if (mode !== 'game' || !latest) return;
  const me = myView(latest);
  if (!me) return;
  const raw = paused ? { mx: 0, my: 0, fire: false } : input.sample();
  const aim = aimWorld();
  const inp = { seq: ++seq, mx: Math.sign(raw.mx), my: Math.sign(raw.my) };
  predictor.apply(inp, moveCtx(me));
  conn.send({ t: 'input', ...inp, aimX: aim.x, aimY: aim.y, fire: raw.fire });
}

input.onAction((a, down) => {
  if (a === 'tab') {
    tab = down;
    return;
  }
  if (mode !== 'game') return;
  if (a === 'esc') {
    paused ? resume() : pause();
    return;
  }
  if (paused) return;
  if (a === 'r' && myView(latest)?.held === 'wall') heldRot ^= 1;
  conn.send({ t: 'act', a });
});

function pause() {
  paused = true;
  input.clear();
  ui.showPause({
    onResume: resume,
    onFullscreen: () => document.documentElement.requestFullscreen?.().catch(() => {}),
    onLeave: () => {
      conn.leave();
      mode = 'nick';
      status = 'idle';
      resetGame();
      ui.showNickForm(join, nick);
    },
  });
}

function resume() {
  paused = false;
  ui.hideAll();
}

function resize() {
  scale = computeScale(innerWidth, innerHeight);
  const w = VIEW_W * scale;
  const h = VIEW_H * scale;
  worldCanvas.width = w;
  worldCanvas.height = h;
  offset.x = Math.floor((innerWidth - w) / 2);
  offset.y = Math.floor((innerHeight - h) / 2);
  Object.assign(worldCanvas.style, { width: `${w}px`, height: `${h}px`, left: `${offset.x}px`, top: `${offset.y}px` });
  hudCanvas.width = innerWidth;
  hudCanvas.height = innerHeight;
}

function activeCount(items, kind) {
  let n = 0;
  for (const it of items) if (it.kind === kind && it.state === 'active') n++;
  return n;
}

function ghostFor(me, snap, players, aim) {
  if (!me.held || me.state !== 'alive') return null;
  const { tilePx } = balance.map;
  const circles = [];
  for (const p of players) if (p.state !== 'dead' && !p.suspended) circles.push({ x: p.x, y: p.y, r: balance.player.radiusPx });
  for (const m of snap.mobs) circles.push({ x: m[2], y: m[3], r: balance.mobs[m[1]].radiusPx });
  const limit = balance.items[me.held].limit;
  const rot = me.held === 'wall' ? heldRot : 0;
  const t = placeTarget({
    grid, kind: me.held, rot, playerX: me.x, playerY: me.y, aimX: aim.x, aimY: aim.y, circles, tilePx,
    maxRangeTiles: balance.player.placeRangeTiles,
    limitReached: me.held !== 'wall' && limit != null && activeCount(snap.items, me.held) >= limit,
  });
  return { tiles: footprint(me.held, t.tx, t.ty, rot), valid: t.valid };
}

function rectDist(x, y, tx, ty, tp) {
  const dx = Math.max(tx * tp - x, 0, x - (tx + 1) * tp);
  const dy = Math.max(ty * tp - y, 0, y - (ty + 1) * tp);
  return Math.hypot(dx, dy);
}

function pickupTarget(me, items) {
  if (me.state !== 'alive' || me.held) return null;
  const tp = balance.map.tilePx;
  const range = balance.player.pickupRangeTiles * tp;
  let best = null;
  let bestD = Infinity;
  for (const it of items) {
    let d = Infinity;
    if (it.state === 'ground') d = Math.hypot(it.x - me.x, it.y - me.y);
    else if (it.kind === 'wall' && it.state === 'placed') {
      for (const [tx, ty] of footprint('wall', it.tx, it.ty, it.rot)) d = Math.min(d, rectDist(me.x, me.y, tx, ty, tp));
    }
    if (d <= range && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

function frame(now) {
  requestAnimationFrame(frame);
  const playing = (mode === 'game' || mode === 'results') && latest && sprites;
  const dt = lastFrameMs ? Math.min(0.1, (now - lastFrameMs) / 1000) : 0;
  lastFrameMs = now;
  fx.update(now, dt);
  document.body.classList.toggle('playing', mode === 'game' && !paused);
  if (!playing) {
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.fillStyle = '#000';
    wctx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
    renderHud(hctx, scale, offset, { status, mouse: input.mouse, showCursor: false, sprites, cam });
    return;
  }
  const { a, b, alpha } = buffer.sample(now);
  const raw = input.sample();
  const before = new Map(a.players.map((p) => [p.id, p]));
  const players = lerpEntities(a.players, b.players, alpha, PLAYER_KEY).map((p, i) => {
    const old = before.get(p.id);
    const cur = b.players[i];
    return { ...p, moving: !!old && (old.x !== cur.x || old.y !== cur.y) };
  });
  const snapMe = myView(latest);
  let me = null;
  if (snapMe && predictor.pos) {
    const aim = aimWorld();
    const pos = predictor.pos;
    me = {
      ...snapMe, x: pos.x, y: pos.y,
      angle: Math.atan2(aim.y - pos.y, aim.x - pos.x),
      moving: !paused && (raw.mx !== 0 || raw.my !== 0),
    };
    const i = players.findIndex((p) => p.id === myId);
    if (i >= 0) players[i] = me;
    cam.follow(Math.round(me.x), Math.round(me.y));
  }
  effects = effects.filter((e) => now - e.start < e.durMs);
  const pickTarget = me && mode === 'game' ? pickupTarget(me, latest.items) : null;
  const view = {
    cam, balance, sprites, frame: Math.floor(now / (1000 / 60)), players,
    mobs: lerpEntities(a.mobs, b.mobs, alpha, MOB_KEY),
    bullets: lerpEntities(a.bullets, b.bullets, alpha, BULLET_KEY),
    items: b.items, myId, mobAngles, gore, seed: latest.seed,
    droplets: lerpEntities(a.droplets ?? [], b.droplets ?? [], alpha, BULLET_KEY),
    rockets: lerpEntities(a.rockets ?? [], b.rockets ?? [], alpha, BULLET_KEY),
    effects, shakes, nowMs: now, pxScale: scale, fx,
    highlightId: pickTarget?.id ?? null,
    ghost: me && mode === 'game' ? ghostFor(me, latest, players, aimWorld()) : null,
  };
  renderWorld(wctx, view);
  renderHud(hctx, scale, offset, {
    snap: latest, balance, sprites, cam, me, players, status, tab, nowMs: now,
    hint: pickTarget ? balance.items[pickTarget.kind].name : null, fx,
    mouse: input.mouse, showCursor: mode === 'game' && !paused,
    deny: now < denyUntil,
    flash: flash && now - flash.start < FLASH_MS ? { ...flash, k: (now - flash.start) / FLASH_MS } : null,
  });
}

addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
if (nick && stored('token')) join(nick);
else ui.showNickForm(join, nick);
