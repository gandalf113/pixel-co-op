import { COLORS } from '../shared/protocol.js';
import { applyItemDelta, applyPlayerDelta, newPlayerState } from '../shared/delta.js';
import { buildGrid, footprint, placeTarget, setItemDefs, itemDef, itemLimitReached } from '../shared/world.js';
import { Fx, LOW_HP } from './fx.js';
import { Gore } from './gore.js';
import { rifleStats } from '../shared/weapon.js';
import { MV, MOB_KEY } from '../shared/mobview.js';
import { Connection, stored, saveNick } from './net.js';
import { InputState } from './input.js';
import { Predictor, SnapshotBuffer, RttTracker, RateMeter, lerpEntities } from './predict.js';
import { ShotPredictor } from './shotpred.js';
import { debugLines, drawDebug } from './debug.js';
import { bakeSprites, BUILDER_COLOR } from './sprites.js';
import { VIEW_W, VIEW_H, Camera, computeScale, renderWorld } from './render.js';
import { renderHud } from './hud.js';
import * as ui from './ui.js';
import { createSfx } from './sfx.js';
import { DemoWorld } from './demo.js';

const ENDED_MSG_MS = 2500;
const PLAYER_KEY = { id: 'id', x: 'x', y: 'y', angle: 'angle' };
const BULLET_KEY = { id: 0, x: 1, y: 2 };

const worldCanvas = document.getElementById('world');
const hudCanvas = document.getElementById('hud');
const wctx = worldCanvas.getContext('2d');
const hctx = hudCanvas.getContext('2d');

const cam = new Camera();
const buffer = new SnapshotBuffer();
const rtt = new RttTracker();
const rxMeter = new RateMeter();
let debugOn = false;
// Ciemnosc (V3-Q-05): cel z serwera (snapshot.dark) albo lokalny podglad (F4); alpha dochodzi do celu w 1 s.
const DARK_FADE_MS = 1000;
const DARK_PREVIEW = { alpha: 0.78, tint: '#1a0000', radiusTiles: 4 };
let darkPreview = false;
let darkNow = { alpha: 0, tint: '#000000', radiusTiles: 4 };
let darkLastMs = 0;

function darkFor(now, target) {
  const dt = darkLastMs ? Math.min(0.25, (now - darkLastMs) / DARK_FADE_MS) : 1;
  darkLastMs = now;
  const want = target ? Math.min(1, target.alpha ?? 0.75) : 0;
  if (target) darkNow = { ...darkNow, tint: target.tint ?? darkNow.tint, radiusTiles: target.radiusTiles ?? darkNow.radiusTiles };
  darkNow.alpha += Math.sign(want - darkNow.alpha) * Math.min(Math.abs(want - darkNow.alpha), dt);
  return darkNow.alpha > 0.005 ? darkNow : null;
}
let fpsEma = 60;
let kbps = 0;
const input = new InputState(worldCanvas);
const conn = new Connection(onMessage, onStatus);

let balance = null;
let sprites = null;
let predictor = null;
let shots = null; // V3-F-01: pocisk-duch rysowany natychmiast, zanim serwer odpowie
let myId = null;
let nick = stored('nick') ?? '';
let isHost = false;
let serverMode = 'lan';
let leaderboard = null;
let mode = 'nick';
let status = 'idle';
let paused = false;
let tab = false;
let latest = null;
let grid = null;
let seq = 0;
let heldRot = 0;
let version = null;
let tickTimer = null;
let lobbyDelayUntil = 0;
let lobbyTimer = null;
const itemRot = new Map();
const gore = new Gore(null); // cfg ustawiany po otrzymaniu balansu
const shakes = new Map();
const fx = new Fx();
const sfx = createSfx();
const SFX_KEY = 'pixelcoop.sfx';
const audio = loadAudioPrefs();
sfx.setVolume(audio.volume);
sfx.setMuted(audio.muted);
ui.setUiSfx((name) => sfx.play(name, { own: true }));

// Swiat demo bez serwera (V3-K-06/07): tlo ekranu nicku i glownego ('attract') oraz poligon ('range').
// Wlasne Fx i Gore, zeby krew z poligonu nie trafila do prawdziwej partii.
let demo = null;
let rangeView = null;
let rangeBack = null;
const demoFx = new Fx();
const demoGore = new Gore(null);
const pressedHold = new Map(); // etykieta klawisza -> do kiedy swieci (akcje krawedziowe E/R/Q/F/G)
const PRESS_HOLD_MS = 150;
const KEY_LABEL = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D' };

function heroColor() {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function startDemo(demoMode) {
  demoFx.reset();
  demoGore.cfg = balance.gore;
  demoGore.reset();
  demo = balance && sprites ? new DemoWorld(balance, { mode: demoMode, seed: (Date.now() % 100000) | 1, color: heroColor(), nick: nick || 'ty' }) : null;
}

function stopDemo() {
  demo = null;
  rangeView = null;
  rangeBack = null;
}
// AudioContext wolno utworzyć dopiero po geście użytkownika (polityka autoplay).
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sfx.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sfx.resume();
});

function loadAudioPrefs() {
  const prefs = { volume: 0.7, muted: false };
  try {
    const o = JSON.parse(localStorage.getItem(SFX_KEY) ?? 'null');
    if (typeof o?.volume === 'number') prefs.volume = Math.min(1, Math.max(0, o.volume));
    if (typeof o?.muted === 'boolean') prefs.muted = o.muted;
  } catch { /* prywatne okno albo uszkodzony wpis */ }
  return prefs;
}

function saveAudioPrefs() {
  try {
    localStorage.setItem(SFX_KEY, JSON.stringify(audio));
  } catch { /* j.w. */ }
}
const PAN_MS = 500;
let specId = null;
let camFocus = null;
let pan = null;
let lastFrameMs = 0;
let effects = [];
let denyUntil = 0;
let flash = null;
const EFFECT_MS = { shockwave: 500, heal: 700, freeze: 700, widegun: 300, rocket: 300, wall: 400, frenzy: 400, explode: 400 };
const FLASH_MS = 300;
let scale = 1;
const offset = { x: 0, y: 0 };

function roomFromUrl() {
  const code = new URL(location.href).searchParams.get('r');
  return code ? code.trim().toUpperCase() : null;
}

function setUrlRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('r', code);
  else url.searchParams.delete('r');
  history.replaceState(null, '', url);
}

const ROOMS_REFRESH_MS = 5000;
let homeTimer = null;
let homeGen = 0;

// Odświeżanie listy pokojów żyje tylko, póki otwarty jest ekran główny (V3-K-05).
function stopHome() {
  clearInterval(homeTimer);
  homeTimer = null;
  homeGen++;
}

async function fetchRooms() {
  try {
    const res = await fetch('/api/rooms', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.rooms) ? data.rooms : null;
  } catch {
    return null;
  }
}

async function fetchHealth() {
  try {
    const res = await fetch('/healthz', { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function setAudio({ volume, muted }) {
  if (volume != null) {
    audio.volume = volume;
    sfx.setVolume(volume);
  }
  if (muted != null) {
    audio.muted = muted;
    sfx.setMuted(muted);
  }
  saveAudioPrefs();
}

const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

// Ekran główny (V3-K-06). W trybie LAN nie ma listy i nie wołamy /api/rooms w ogóle; /healthz pytamy w obu trybach
// (puls serwera w stopce), ale tylko poki ten ekran jest otwarty.
function showHome(message = '') {
  stopHome();
  mode = 'home';
  startDemo('attract');
  const lan = serverMode !== 'rooms';
  const gen = homeGen;
  const view = ui.showHome({ nick, lan, rooms: null, leaderboard, message, color: heroColor(), sprites, version, audio }, {
    onJoin: (code) => join(nick, code),
    onNew: () => join(nick, null),
    onPlay: (code) => join(nick, lan ? null : code),
    onControls: () => {
      stopHome();
      showRange(() => showHome());
    },
    onChangeNick: () => {
      stopHome();
      showNick();
    },
    onVolume: (v) => setAudio({ volume: v }),
    onMute: (m) => setAudio({ muted: m }),
    onFullscreen: fullscreen,
  });
  let n = 0;
  const refresh = async () => {
    const [rooms, health] = await Promise.all([lan ? null : fetchRooms(), fetchHealth()]);
    if (gen !== homeGen) return;
    if (!lan) view.setRooms(rooms);
    view.setOnline(health);
    if (health?.version) version = health.version;
    if (++n % 2 === 0) view.tick();
  };
  refresh();
  homeTimer = setInterval(refresh, ROOMS_REFRESH_MS);
}

function showNick() {
  mode = 'nick';
  startDemo('attract');
  ui.showNickScreen({ nick }, (n) => {
    nick = n;
    saveNick(n);
    enterFlow();
  });
}

// Poligon sterowania (V3-K-07): scena z gry po lewej, klawiatura po prawej. Esc albo "Wróć" = back().
function showRange(back) {
  mode = 'range';
  startDemo('range');
  rangeBack = () => {
    stopDemo();
    back();
  };
  rangeView = ui.showControls(() => rangeBack());
}

// Przesuniecie kamery, zeby bohater stal na srodku wolnego miejsca obok panelu (w px swiata).
function rangeShift() {
  const panel = document.querySelector('#ui .panel.range');
  return panel ? panel.offsetWidth / (2 * scale) : 0;
}

function pressedLabels(now) {
  const out = new Set();
  for (const code of input.down) if (KEY_LABEL[code]) out.add(KEY_LABEL[code]);
  if (input.fire) {
    out.add('SPACJA');
    out.add('LPM');
  }
  for (const [label, until] of pressedHold) {
    if (now < until) out.add(label);
    else pressedHold.delete(label);
  }
  return out;
}

// Zdarzenia z poligonu -> dzwiek i efekty (ten sam jezyk co prawdziwe zdarzenia serwera). Tlo (attract) jest nieme.
function demoEvent(e, now) {
  const tp = balance.map.tilePx;
  const loud = mode === 'range';
  const dist = e.x != null ? Math.hypot(e.x - cam.x, e.y - cam.y) / tp : 0;
  switch (e.type) {
    case 'shot':
      demoFx.shot(now, { id: demo.hero.id, angle: e.angle }, true, e.x, e.y);
      if (loud) sfx.play('shot', { own: true });
      break;
    case 'reload':
      if (loud) sfx.play('reload', { own: true, dur: e.dur });
      break;
    case 'hit':
      demoGore.addSplat(Math.round(e.x), Math.round(e.y), 0, now);
      demoFx.mobHit(now, e, demo.hero.id);
      if (loud) sfx.play('hit', { dist });
      break;
    case 'mobDeath':
      demoGore.addCorpse(e.kind, e.x, e.y, e.a, 0);
      demoFx.mobDeath(now, e);
      if (loud) sfx.play('death', { dist });
      break;
    case 'pickup': case 'place': case 'drop': case 'deny':
      if (loud) sfx.play(e.type, { own: true });
      break;
    case 'ult':
      if (loud) sfx.play('ult', { own: true, tier: e.tier });
      break;
  }
}

function renderDemo(now, dt) {
  const range = mode === 'range';
  const raw = range ? input.sample() : { mx: 0, my: 0, fire: false };
  const aim = aimWorld();
  for (const e of demo.update(now, dt, { ...raw, aim })) demoEvent(e, now);
  const h = demo.hero;
  cam.follow(h.x + (range ? rangeShift() : 0), h.y);
  demoFx.update(now, dt);
  const view = demo.view(now, { cam, sprites, fx: demoFx, gore: demoGore, pxScale: scale, aim });
  view.dark = darkFor(now, darkPreview && range ? DARK_PREVIEW : null);
  guardedDraw('demo', () => renderWorld(wctx, view));
  guardedDraw('hud', () => renderHud(hctx, scale, { version, status, mouse: boardMouse(), showCursor: range, sprites, cam, nowMs: now, fx: demoFx }));
  if (!range) {
    // przyciemnienie pod panelem: scena ma byc tlem, nie konkurencja dla tekstu
    hctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    hctx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  } else {
    rangeView?.setPressed(pressedLabels(now));
  }
}

// Po nicku: link ?r=KOD wchodzi prosto do pokoju, inaczej ekran główny.
function enterFlow(message = '') {
  const url = serverMode === 'rooms' ? roomFromUrl() : null;
  if (url) join(nick, url);
  else showHome(message);
}

function showJoin(message = '') {
  if (!nick) showNick();
  else enterFlow(message);
}

function join(n, room = null) {
  stopHome();
  stopDemo();
  mode = 'nick';
  nick = n;
  ui.showMessage('Łączę…');
  conn.connect(n, serverMode === 'rooms' ? room : null);
}

function resetGame() {
  latest = null;
  grid = null;
  buffer.clear();
  rtt.clear();
  shots?.reset();
  itemRot.clear();
  gore.reset();
  shakes.clear();
  fx.reset();
  specId = null;
  camFocus = null;
  pan = null;
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
    icons: Object.fromEntries(Object.entries(balance.ultimate.kinds).map(([k, u]) => [k, sprites.get(u.sprite)?.toDataURL()])),
    myId,
    onUlt: (kind, slot = 1) => conn.send({ t: 'ult', kind, slot }),
    onDifficulty: (level) => conn.send({ t: 'difficulty', level }),
    onStart: () => conn.send({ t: 'start' }),
  });
}

function onMessage(msg) {
  switch (msg.t) {
    case 'host':
      isHost = msg.youAreHost;
      break;
    case 'welcome':
      myId = msg.id;
      if (msg.room) setUrlRoom(msg.room);
      balance = msg.balance;
      gore.cfg = balance.gore;
      // Ksztalty i limity przedmiotow musza byc znane, zanim przyjdzie pierwszy snapshot.
      setItemDefs(balance.items);
      version = msg.version ?? null;
      sprites ??= bakeSprites(document, [...COLORS, BUILDER_COLOR]);
      predictor ??= new Predictor(balance);
      shots ??= new ShotPredictor(balance);
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
      gore.restore(msg.corpses, msg.splats);
      fx.restore(msg.scorches ?? [], msg.rubble ?? []);
      break;
    case 'results':
      mode = 'results';
      paused = false;
      ui.showResults(msg, isHost, () => conn.send({ t: 'toLobby' }), leaderboard);
      void refreshLeaderboard();
      break;
    case 'ended':
      lobbyDelayUntil = performance.now() + ENDED_MSG_MS;
      resetGame();
      mode = 'ended';
      ui.showMessage(msg.reason);
      break;
  }
}

const itemDict = new Map();
const playerState = newPlayerState();

function itemCenter(id) {
  const it = latest?.items.find((i) => i.id === id);
  if (!it) return null;
  const tp = balance.map.tilePx;
  if (it.kind === 'wall') return { x: (it.tx + (it.rot ? 0.5 : 1)) * tp, y: (it.ty + (it.rot ? 1 : 0.5)) * tp };
  return { x: (it.tx + 0.5) * tp, y: (it.ty + 0.5) * tp };
}

// Pozycja zdarzenia w pikselach świata; null = brak (gramy bez tłumienia).
function eventPos(e, tp) {
  if (e.x != null && e.y != null) return e;
  if (e.tx != null) return { x: (e.tx + 0.5) * tp, y: (e.ty + 0.5) * tp };
  const pid = e.player ?? e.id;
  return latest?.players.find((p) => p.id === pid) ?? itemCenter(e.id);
}

function playSfx(name, e, tp, opts) {
  const pos = eventPos(e, tp);
  const dist = pos ? Math.hypot(pos.x - cam.x, pos.y - cam.y) / tp : 0;
  // pan: pozycja względem kamery; własne strzały/przeładowanie (center) zostają na środku
  const pan = pos && !opts?.center && !opts?.own ? { x: pos.x, camX: cam.x, viewW: VIEW_W } : {};
  sfx.play(name, { dist, ...pan, ...opts });
}

function onEvent(e) {
  const now = performance.now();
  const tp = balance.map.tilePx;
  switch (e.type) {
    case 'shot':
      // Prawdziwy strzal dotarl: duch moze odejsc, ale dopiero gdy prawdziwy pocisk stanie sie widoczny.
      if (e.id === myId) shots?.onShotEvent(e, buffer.delayMs);
      playSfx(latest?.players.some((p) => p.id === e.id) ? 'shot' : 'cannon', e, tp, { center: e.id === myId });
      break;
    case 'hit':
      if (e.mob) playSfx('hit', e, tp);
      break;
    case 'mobShot':
      playSfx(e.kind === 'grenade' ? 'lob' : 'spit', e, tp);
      break;
    case 'spitHit':
      playSfx('spitHit', e, tp);
      break;
    case 'objHit': case 'destroyed': case 'explode': case 'pickup': case 'place':
    case 'drop': case 'down': case 'revive': case 'death':
    case 'droplet': case 'ff': case 'expire': case 'flame': case 'armed':
      playSfx(e.type, e, tp);
      break;
    case 'eventStart':
      sfx.play('eventStart', { own: true });
      break;
    case 'quake':
      sfx.play('quake', { own: true });
      break;
    case 'pitsOpen':
      playSfx('destroyed', e, tp);
      break;
    case 'fall':
      playSfx('expire', e, tp);
      break;
    case 'reload': {
      const lv = latest?.players.find((p) => p.id === e.id)?.weaponLv ?? 1;
      playSfx('reload', e, tp, { own: e.id === myId, dur: rifleStats(balance, lv).reloadS });
      break;
    }
    case 'hurt': {
      // friendly fire gra własny dźwięk ze zdarzenia `ff` — drugi nałożyłby się na niego
      if (e.source === 'ff') break;
      if (e.id === myId) {
        const me = latest?.players.find((p) => p.id === myId);
        const low = me ? Math.min(me.hp, me.hp - e.amount) / me.maxHp < LOW_HP : false;
        sfx.play(low ? 'hurtMeLow' : 'hurtMe', { own: true });
      } else playSfx('hurtAlly', e, tp);
      break;
    }
    case 'deny': case 'ultDeny':
      if (e.id === myId) sfx.play(e.type); // cudze odmowy to szum
      break;
    case 'ult':
      playSfx('ult', e, tp, { tier: e.tier });
      break;
    case 'weaponUp': case 'permUp':
      playSfx('weaponUp', e, tp, { own: e.id === myId });
      break;
  }
  switch (e.type) {
    case 'pickup':
      if (e.player === myId) heldRot = itemRot.get(e.id) ?? 0;
      break;
    case 'hit':
      if (!e.mob) break;
      gore.addSplat(Math.round(e.x), Math.round(e.y), 0, now);
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
      fx.explode(now, e, predictor?.pos, tp, (latest?.mobs ?? []).filter((m) => !m[MV.invul]));
      break;
    case 'shot': {
      const shooter = latest?.players.find((p) => p.id === e.id);
      const origin = shooter ? (e.id === myId && predictor?.viewPos ? predictor.viewPos : shooter) : e;
      fx.shot(now, e, !!shooter, origin.x, origin.y);
      break;
    }
    case 'hurt':
      fx.hurt(now, e, myId);
      break;
    case 'mobShot':
      fx.mobShot(now, e);
      break;
    case 'spitHit':
      fx.spitHit(now, e);
      break;
    case 'ff':
      fx.ff(now, e, myId, (id) => latest?.players.find((p) => p.id === id)?.nick ?? '?');
      break;
    case 'weaponUp':
      fx.weaponUp(now, e, myId, balance.weaponMods);
      flash = { color: '#ffd23a', start: now, strong: e.id === myId };
      break;
    case 'permUp':
      fx.permUp(now, e, myId, balance.items[e.kind]);
      break;
    case 'flame':
      fx.ignite(now, e.x, e.y);
      break;
    case 'quake':
      // wstrzas kamery przez caly etap sciagania graczy (Trzesienie ziemi)
      fx.shake = { until: now + (e.durS ?? 3) * 1000, amp: 3 };
      break;
    case 'pitsOpen':
      fx.shake = { until: now + 400, amp: 5 };
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
    case 'reveal':
      effects.push({ kind: 'reveal', x: e.x, y: e.y, start: now, durMs: 350 });
      fx.mobFlash.set(e.id, now + 140);
      break;
    case 'mobDeath': {
      gore.addSplat(Math.round(e.x), Math.round(e.y), 1, now);
      // duza sylwetka = wieksza kaluza: dodatkowe plamy rozrzucone w obrebie ciala
      const rr = balance.mobs[e.mobType]?.radiusPx ?? 0;
      for (let i = 0; i < Math.floor(rr / 6); i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * rr * 0.8;
        gore.addSplat(Math.round(e.x + Math.cos(a) * d), Math.round(e.y + Math.sin(a) * d), 1, now);
      }
      gore.addCorpse(e.mobType, Math.round(e.x), Math.round(e.y), e.a, latest?.wave ?? 0);
      fx.mobDeath(now, e);
      break;
    }
  }
}

function onStatus(s, reason) {
  status = s;
  if (s !== 'rejected') return;
  mode = 'nick';
  resetGame();
  setUrlRoom(null);
  if (!nick) showNick();
  else showHome(reason ?? 'Odrzucono');
}

function moveCtx(me) {
  return { grid, heldKind: me.held, speedMult: me.speedMult ?? 1, canMove: me.state === 'alive' && !me.suspended && !(me.busy > 0) && !latest?.event?.lock };
}

function onSnap(snap) {
  // Delta ZAWSZE, zanim cokolwiek zdecyduje o pominieciu: pominiety pelny snapshot = pusta mapa do konca gry.
  snap.items = applyItemDelta(itemDict, snap);
  snap.players = applyPlayerDelta(playerState, snap);
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
  const me = myView(snap);
  rtt.acked(snap.you.ackSeq, performance.now());
  shots?.setRtt(rtt.rttMs, buffer.delayMs);
  if (me) shots.syncFromSnapshot(me);
  if (me) predictor.reconcile(me, snap.you.ackSeq, moveCtx(me));
}

function myView(snap) {
  return snap?.players.find((p) => p.id === myId) ?? null;
}

// Kursor z okna we wspolrzednych planszy (= canvasu HUD); jedyne miejsce tej konwersji.
function boardMouse() {
  return { x: input.mouse.x - offset.x, y: input.mouse.y - offset.y };
}

function aimWorld() {
  const a = input.aimScreen();
  // Dzielimy przez faktyczny rozmiar canvasu w px (zaokraglony), nie przez `scale` -
  // inaczej przy skali ulamkowej celowanie rozjezdzaloby sie o ulamek piksela.
  const r = worldCanvas.getBoundingClientRect();
  return cam.viewToWorld(a.x * VIEW_W / (r.width || VIEW_W), a.y * VIEW_H / (r.height || VIEW_H));
}

function tick() {
  if (mode !== 'game' || !latest) return;
  const me = myView(latest);
  if (!me) return;
  const raw = paused || me.state === 'dead' ? { mx: 0, my: 0, fire: false } : input.sample();
  const aim = aimWorld();
  const inp = { seq: ++seq, mx: Math.sign(raw.mx), my: Math.sign(raw.my) };
  predictor.apply(inp, moveCtx(me));
  const muzzle = predictor.viewPos ?? predictor.pos ?? me;
  shots?.tick(1 / balance.tickHz, {
    me, fire: raw.fire, grid, x: muzzle.x, y: muzzle.y,
    angle: Math.atan2(aim.y - muzzle.y, aim.x - muzzle.x),
  });
  rtt.sent(inp.seq, performance.now());
  conn.send({ t: 'input', ...inp, aimX: aim.x, aimY: aim.y, fire: raw.fire });
}

input.onAction((a, down) => {
  if (a === 'debug') {
    debugOn = !debugOn;
    return;
  }
  if (a === 'dark') {
    darkPreview = !darkPreview;
    return;
  }
  if (a === 'tab') {
    tab = down;
    if (mode === 'range') pressedHold.set('Tab', down ? Infinity : 0);
    return;
  }
  if (mode === 'range' && demo) {
    if (a === 'esc') {
      rangeBack?.();
      return;
    }
    const now = performance.now();
    if (a === 'next' && !input.down.has('KeyD')) pressedHold.set('PPM', now + PRESS_HOLD_MS);
    const label = { e: 'E', r: 'R', q: 'Q', f: 'F', c: 'C', g: 'G' }[a];
    if (!label) return;
    pressedHold.set(label, now + PRESS_HOLD_MS);
    demo.action(a, aimWorld());
    return;
  }
  if (mode !== 'game') return;
  if (a === 'esc') {
    paused ? resume() : pause();
    return;
  }
  if (paused) return;
  if (a === 'prev' || a === 'next') {
    if (myView(latest)?.state === 'dead') cycleSpectate(a === 'next' ? 1 : -1);
    return;
  }
  if (a === 'q' && itemDef(myView(latest)?.held)?.rotatable) heldRot ^= 1;
  conn.send({ t: 'act', a });
});

function watchable() {
  return (latest?.players ?? []).filter((p) => p.id !== myId && p.state === 'alive' && !p.suspended);
}

function cycleSpectate(dir) {
  const list = watchable();
  if (!list.length) return;
  const i = list.findIndex((p) => p.id === specId);
  specId = list[(i + dir + list.length) % list.length].id;
}

function updateSpectate(me) {
  if (me.state !== 'dead') {
    specId = null;
    return;
  }
  const list = watchable();
  if (list.some((p) => p.id === specId)) return;
  let best = null;
  for (const p of list) if (!best || Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y)) best = p;
  specId = best?.id ?? null;
}

function focusCamera(now, target, key) {
  if (camFocus !== key) {
    if (camFocus !== null) pan = { x: cam.x, y: cam.y, start: now };
    camFocus = key;
  }
  let { x, y } = target;
  if (pan) {
    const k = Math.min(1, (now - pan.start) / PAN_MS);
    const e = k * k * (3 - 2 * k);
    x = pan.x + (x - pan.x) * e;
    y = pan.y + (y - pan.y) * e;
    if (k >= 1) pan = null;
  }
  cam.follow(Math.round(x), Math.round(y));
}

function pause() {
  paused = true;
  input.clear();
  ui.showPause({
    volume: audio.volume,
    muted: audio.muted,
    onVolume: (v) => {
      audio.volume = v;
      sfx.setVolume(v);
      saveAudioPrefs();
    },
    onMute: (m) => {
      audio.muted = m;
      sfx.setMuted(m);
      saveAudioPrefs();
    },
    onResume: resume,
    onControls: () => ui.showControls(() => pause()),
    onFullscreen: fullscreen,
    onLeave: () => {
      conn.leave();
      mode = 'nick';
      status = 'idle';
      resetGame();
      setUrlRoom(null);
      showJoin();
    },
  });
}

function resume() {
  paused = false;
  ui.hideAll();
}

function resize() {
  scale = computeScale(innerWidth, innerHeight);
  // Zaokraglamy wymiary w px, nie skale.
  const w = Math.round(VIEW_W * scale);
  const h = Math.round(VIEW_H * scale);
  worldCanvas.width = w;
  worldCanvas.height = h;
  offset.x = Math.floor((innerWidth - w) / 2);
  offset.y = Math.floor((innerHeight - h) / 2);
  Object.assign(worldCanvas.style, { width: `${w}px`, height: `${h}px`, left: `${offset.x}px`, top: `${offset.y}px` });
  // HUD pokrywa sie co do piksela z plansza: ten sam rozmiar i pozycja co #world.
  hudCanvas.width = w;
  hudCanvas.height = h;
  Object.assign(hudCanvas.style, { width: `${w}px`, height: `${h}px`, left: `${offset.x}px`, top: `${offset.y}px` });
}


function ghostFor(me, snap, players, aim) {
  if (!me.held || me.state !== 'alive') return null;
  const { tilePx } = balance.map;
  const circles = [];
  for (const p of players) if (p.state !== 'dead' && !p.suspended) circles.push({ x: p.x, y: p.y, r: balance.player.radiusPx });
  for (const m of snap.mobs) circles.push({ x: m[MV.x], y: m[MV.y], r: balance.mobs[m[MV.type]].radiusPx });
  const rot = itemDef(me.held)?.rotatable ? heldRot : 0;
  const t = placeTarget({
    grid, kind: me.held, rot, playerX: me.x, playerY: me.y, aimX: aim.x, aimY: aim.y, circles, tilePx,
    maxRangeTiles: balance.player.placeRangeTiles,
    // Limit liczy sie po grupie (wszystkie dzialka razem), nie po pojedynczym wariancie.
    limitReached: itemLimitReached(snap.items, me.held),
  });
  return { tiles: footprint(me.held, t.tx, t.ty, rot), valid: t.valid };
}

function pickupTarget(me, items) {
  if (me.state !== 'alive' || me.held) return null;
  const tp = balance.map.tilePx;
  const range = balance.player.pickupRangeTiles * tp;
  let best = null;
  let bestD = Infinity;
  for (const it of items) {
    if (it.state !== 'ground') continue;
    const d = Math.hypot(it.x - me.x, it.y - me.y);
    if (d <= range && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

// Wyjatek w rysowaniu nie moze zabrac graczowi obrazu. Przed v0.12.0 jeden blad w `drawItems`
// przerywal klatke w polowie: zostawala ziemia i krew, a przedmioty, potwory, gracze i caly HUD
// znikaly, wiec gracz gral na slepo i nie mial jak tego zglosic. Teraz kazda sekcja leci osobno,
// blad jest logowany raz i widoczny na ekranie.
let renderFault = null;

function guardedDraw(label, fn) {
  try {
    fn();
  } catch (e) {
    if (!renderFault) {
      renderFault = `${label}: ${e?.message ?? e}`;
      console.error('[render]', label, e);
    }
  }
}

function drawRenderFault(ctx, pxScale) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#c0261b';
  ctx.fillRect(0, 0, ctx.canvas.width, 3 * pxScale);
  ctx.font = `${7 * pxScale}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd7d2';
  ctx.fillText(`BLAD RENDERU - ${renderFault}`, 4 * pxScale, 11 * pxScale);
}

function frame(now) {
  requestAnimationFrame(frame);
  const playing = (mode === 'game' || mode === 'results') && latest && sprites;
  const dt = lastFrameMs ? Math.min(0.1, (now - lastFrameMs) / 1000) : 0;
  lastFrameMs = now;
  if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.05;
  predictor?.smooth(dt);
  fx.update(now, dt);
  document.body.classList.toggle('playing', (mode === 'game' && !paused) || mode === 'range');
  if (!playing) {
    if (demo && sprites && balance && (mode === 'home' || mode === 'nick' || mode === 'range')) {
      renderDemo(now, dt);
      return;
    }
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.fillStyle = '#000';
    wctx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
    renderHud(hctx, scale, { version, status, mouse: boardMouse(), showCursor: false, sprites, cam });
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
    const pos = predictor.viewPos;
    me = {
      ...snapMe, x: pos.x, y: pos.y,
      angle: Math.atan2(aim.y - pos.y, aim.x - pos.x),
      moving: !paused && (raw.mx !== 0 || raw.my !== 0),
    };
    const i = players.findIndex((p) => p.id === myId);
    if (i >= 0) players[i] = me;
    updateSpectate(snapMe);
    const watched = specId ? players.find((p) => p.id === specId) : null;
    focusCamera(now, watched ?? me, watched ? specId : myId);
  }
  effects = effects.filter((e) => now - e.start < e.durMs);
  const pickTarget = me && mode === 'game' ? pickupTarget(me, latest.items) : null;
  shots?.step(dt, grid);
  const view = {
    cam, balance, sprites, frame: Math.floor(now / (1000 / 60)), players,
    mobs: lerpEntities(a.mobs, b.mobs, alpha, MOB_KEY),
    // Duchy ida tym samym kanalem co prawdziwe pociski: render dostaje krotki w tym samym ksztalcie.
    bullets: [...lerpEntities(a.bullets, b.bullets, alpha, BULLET_KEY), ...(shots?.bullets() ?? [])],
    mobBullets: lerpEntities(a.mobBullets ?? [], b.mobBullets ?? [], alpha, BULLET_KEY),
    items: b.items, myId, gore, seed: latest.seed,
    droplets: lerpEntities(a.droplets ?? [], b.droplets ?? [], alpha, BULLET_KEY),
    rockets: lerpEntities(a.rockets ?? [], b.rockets ?? [], alpha, BULLET_KEY),
    flames: b.flames ?? [],
    dark: darkFor(now, darkPreview ? DARK_PREVIEW : latest.dark),
    event: latest.event ?? null,
    builders: lerpEntities(a.builders ?? [], b.builders ?? [], alpha, BULLET_KEY),
    pits: b.pits ?? [],
    effects, shakes, nowMs: now, pxScale: scale, fx,
    highlightId: pickTarget?.id ?? null,
    ghost: me && mode === 'game' ? ghostFor(me, latest, players, aimWorld()) : null,
  };
  gore.setWave(latest.wave ?? 0);
  if (gore.due(now)) gore.walk(now, [
    ...players.map((p) => ({ id: `p${p.id}`, x: p.x, y: p.y })),
    ...view.mobs.map((m) => ({ id: `m${m[MV.id]}`, x: m[MV.x], y: m[MV.y] })),
  ]);
  guardedDraw('swiat', () => renderWorld(wctx, view));
  guardedDraw('hud', () => renderHud(hctx, scale, {
    version, snap: latest, balance, sprites, cam, me, players, status, tab, nowMs: now,
    hint: pickTarget ? balance.items[pickTarget.kind].name : null, fx,
    spectating: specId ? players.find((p) => p.id === specId) ?? null : null,
    mouse: boardMouse(), showCursor: mode === 'game' && !paused,
    deny: now < denyUntil,
    flash: flash && now - flash.start < FLASH_MS ? { ...flash, k: (now - flash.start) / FLASH_MS } : null,
  }));
  if (renderFault) drawRenderFault(hctx, scale);
  if (debugOn) {
    kbps = rxMeter.update(conn.rxBytes, now);
    drawDebug(hctx, scale, debugLines({ rttMs: rtt.rttMs, kbps, delayMs: buffer.delayMs, buffered: buffer.size, fps: fpsEma }));
  }
}

async function refreshLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && Array.isArray(data.runs)) leaderboard = data;
  } catch {
    leaderboard = null;
  }
}

// Balans do swiata demo pobieramy z pliku statycznego, zanim serwer przysle swoj w `welcome`
// (ten z `welcome` i tak go nadpisze). Bez niego ekran glowny ma czarne tlo, jak dawniej.
async function loadDemoBalance() {
  try {
    const res = await fetch('/balance.json', { cache: 'no-store' });
    if (!res.ok) return;
    const b = await res.json();
    if (balance) return;
    balance = b;
    gore.cfg = balance.gore;
    setItemDefs(balance.items);
    sprites ??= bakeSprites(document, [...COLORS, BUILDER_COLOR]);
  } catch { /* demo jest opcjonalne */ }
}

async function boot() {
  const health = await fetchHealth();
  if (health) {
    serverMode = health.mode ?? 'lan';
    version = health.version ?? null;
  }
  await Promise.all([refreshLeaderboard(), loadDemoBalance()]);
  const url = roomFromUrl();
  if (nick && serverMode !== 'rooms' && stored('token')) join(nick, null);
  else if (nick && serverMode === 'rooms' && url) join(nick, url);
  else showJoin();
}

addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
boot();
