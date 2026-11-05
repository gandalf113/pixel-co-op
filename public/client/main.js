import { COLORS } from '../shared/protocol.js';
import { buildGrid, footprint, placementValid, tileOf } from '../shared/world.js';
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
  paused = false;
  heldRot = 0;
  conn.inGame = false;
}

function enterLobbyScreen(msg) {
  mode = 'lobby';
  resetGame();
  ui.showLobby(msg, {
    difficulties: balance.difficulty,
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
      for (const e of msg.list) if (e.type === 'pickup' && e.player === myId) heldRot = itemRot.get(e.id) ?? 0;
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
  return { grid, heldKind: me.held, canMove: me.state === 'alive' && !me.suspended && !(me.busy > 0) };
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
  const tiles = footprint(me.held, tileOf(aim.x, tilePx), tileOf(aim.y, tilePx), me.held === 'wall' ? heldRot : 0);
  const circles = [];
  for (const p of players) if (p.state !== 'dead' && !p.suspended) circles.push({ x: p.x, y: p.y, r: balance.player.radiusPx });
  for (const m of snap.mobs) circles.push({ x: m[2], y: m[3], r: balance.mobs[m[1]].radiusPx });
  const limit = balance.items[me.held].limit;
  const valid = placementValid({
    grid, tiles, playerX: me.x, playerY: me.y, circles, tilePx,
    maxRangeTiles: balance.player.placeRangeTiles,
    limitReached: limit != null && activeCount(snap.items, me.held) >= limit,
  });
  return { tiles, valid };
}

function rectDist(x, y, tx, ty, tp) {
  const dx = Math.max(tx * tp - x, 0, x - (tx + 1) * tp);
  const dy = Math.max(ty * tp - y, 0, y - (ty + 1) * tp);
  return Math.hypot(dx, dy);
}

function pickupHint(me, items) {
  if (me.state !== 'alive') return null;
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
  return best ? balance.items[best.kind].name : null;
}

function frame(now) {
  requestAnimationFrame(frame);
  const playing = (mode === 'game' || mode === 'results') && latest && sprites;
  document.body.classList.toggle('playing', mode === 'game' && !paused);
  if (!playing) {
    wctx.fillStyle = '#000';
    wctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
  const view = {
    cam, balance, sprites, frame: Math.floor(now / (1000 / 60)), players,
    mobs: lerpEntities(a.mobs, b.mobs, alpha, MOB_KEY),
    bullets: lerpEntities(a.bullets, b.bullets, alpha, BULLET_KEY),
    items: b.items, myId, mobAngles,
    ghost: me && mode === 'game' ? ghostFor(me, latest, players, aimWorld()) : null,
  };
  renderWorld(wctx, view);
  renderHud(hctx, scale, offset, {
    snap: latest, balance, sprites, cam, me, players, status, tab, nowMs: now,
    hint: me && mode === 'game' ? pickupHint(me, latest.items) : null,
    mouse: input.mouse, showCursor: mode === 'game' && !paused,
  });
}

addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
if (nick && stored('token')) join(nick);
else ui.showNickForm(join, nick);
