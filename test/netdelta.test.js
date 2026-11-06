import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { balance, placeWall } from './helpers.js';
import { Game } from '../server/game.js';
import { Session } from '../server/session.js';
import { startServer } from '../server/app.js';
import { NetMeter, LinkThrottle, summarize } from '../server/netmeter.js';
import { makeMob } from '../server/mobspawn.js';
import { spawnDrop } from '../server/items.js';
import { applyItemDelta, applyPlayerDelta, newPlayerState, PLAYER_FIELDS } from '../public/shared/delta.js';
import { buildGrid } from '../public/shared/world.js';

const TILE = balance.map.tilePx;
const mk = () => new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }], seed: 3 });
const ids = (s) => s.items.map((i) => i.id).sort((a, b) => a - b);
function farFrom(g, tiles) {
  const p = g.world.players.get(1);
  return { x: p.x + tiles * TILE, y: p.y };
}
function put(g, kind, x, y) {
  const it = spawnDrop(g.world, kind, x, y);
  it.x = x;
  it.y = y;
  return it;
}

// --- V3-O-01: delta przedmiotow ----------------------------------------------------------------

test('delta: pierwszy snapshot jest pelny, drugi bez zmian nie niesie przedmiotow', () => {
  const g = mk();
  const p = g.world.players.get(1);
  put(g, 'mine', p.x + 30, p.y);
  put(g, 'wall', p.x + 60, p.y);
  const a = g.snapshot(1);
  assert.equal(a.full, true);
  assert.ok(a.items.length >= 2);
  const b = g.snapshot(1);
  assert.equal(b.full, undefined);
  assert.deepEqual(b.items, []);
  assert.equal(b.del, undefined);
});

test('delta: zmiana jednego przedmiotu wysyla tylko jego, usuniecie przychodzi jako id', () => {
  const g = mk();
  const p = g.world.players.get(1);
  const one = put(g, 'mine', p.x + 30, p.y);
  const two = put(g, 'wall', p.x + 60, p.y);
  g.snapshot(1);
  one.x += 5;
  const b = g.snapshot(1);
  assert.deepEqual(ids(b), [one.id]);
  assert.equal(b.items[0].x, Math.round(one.x * 10) / 10);
  g.world.items.delete(two.id);
  const c = g.snapshot(1);
  assert.deepEqual(c.items, []);
  assert.deepEqual(c.del, [two.id]);
  assert.equal(g.snapshot(1).del, undefined);
});

test('delta: przedmiot podniesiony (held) znika jako id do skasowania', () => {
  const g = mk();
  const p = g.world.players.get(1);
  const it = put(g, 'mine', p.x + 30, p.y);
  g.snapshot(1);
  it.state = 'held';
  assert.deepEqual(g.snapshot(1).del, [it.id]);
});

test('delta: timeLeft nie leci co snapshot, tylko gdy zmieni sie pelna sekunda', () => {
  const g = mk();
  const p = g.world.players.get(1);
  const it = put(g, 'turret30', p.x + 30, p.y);
  Object.assign(it, { state: 'active', tx: 5, ty: 5, timeLeft: 9.95 });
  g.snapshot(1);
  let sent = 0;
  for (let i = 0; i < 20; i++) {
    it.timeLeft -= 0.05; // 1 s w 20 snapshotach
    if (g.snapshot(1).items.length) sent++;
  }
  assert.ok(sent >= 1 && sent <= 2, `wyslano ${sent} razy`);
});

test('delta: resume daje pelny snapshot', () => {
  const g = mk();
  const p = g.world.players.get(1);
  put(g, 'mine', p.x + 30, p.y);
  g.snapshot(1);
  assert.equal(g.snapshot(1).full, undefined);
  g.suspend(1);
  g.resume(1);
  const r = g.snapshot(1);
  assert.equal(r.full, true);
  assert.ok(r.items.length >= 1);
});

test('delta: po reconnekcie przez Session pierwszy snapshot jest pelny', () => {
  let n = 0;
  const s = new Session({ balance, addresses: [], seed: 1, makeToken: () => `t${++n}` });
  const mkConn = () => { const c = { sent: [], isLocal: true, send: (o) => c.sent.push(o), close() {} }; return c; };
  const msg = (c, o) => s.message(c, JSON.stringify(o));
  const c1 = mkConn();
  s.connect(c1);
  msg(c1, { t: 'hello', token: null, nick: 'A' });
  msg(c1, { t: 'ult', kind: 'shockwave' });
  msg(c1, { t: 'start' });
  const token = c1.sent.find((m) => m.t === 'welcome').token;
  for (let i = 0; i < 12; i++) s.tick(0.05);
  const snaps = c1.sent.filter((m) => m.t === 'snap');
  assert.equal(snaps[0].full, true);
  assert.ok(snaps.length > 1 && snaps.slice(1).every((m) => !m.full));
  s.disconnect(c1);
  const c2 = mkConn();
  s.connect(c2);
  msg(c2, { t: 'hello', token });
  for (let i = 0; i < 4; i++) s.tick(0.05);
  const again = c2.sent.filter((m) => m.t === 'snap');
  assert.equal(again[0].full, true);
  assert.ok(again[0].items.length > 0, 'ruiny startowe musza byc w pelnym snapshocie');
});

// --- klient: nakladanie delty ---------------------------------------------------------------------

test('klient: delta nalozona na slownik daje ten sam komplet co pelny snapshot', () => {
  const g = mk();
  const p = g.world.players.get(1);
  const dict = new Map();
  const a = put(g, 'mine', p.x + 30, p.y);
  put(g, 'wall', p.x + 60, p.y);
  let view = applyItemDelta(dict, g.snapshot(1));
  const gone = put(g, 'boulder', p.x + 90, p.y);
  a.x += 3;
  view = applyItemDelta(dict, g.snapshot(1));
  g.world.items.delete(gone.id);
  view = applyItemDelta(dict, g.snapshot(1));
  view = applyItemDelta(dict, g.snapshot(1)); // pusta delta
  g.views.delete(1); // swiezy klient widzi ten sam swiat od zera
  const fresh = applyItemDelta(new Map(), g.snapshot(1));
  assert.deepEqual(view.sort((x, y) => x.id - y.id), fresh.sort((x, y) => x.id - y.id));
  assert.ok(view.length >= 2);
});

test('klient: pelny snapshot czysci slownik po poprzedniej grze', () => {
  const dict = new Map([[99, { id: 99 }]]);
  const out = applyItemDelta(dict, { full: true, items: [{ id: 1 }] });
  assert.deepEqual(out, [{ id: 1 }]);
});

// --- V3-O-03: area of interest -----------------------------------------------------------------

test('AoI: postawiona sciana 40 kafelkow dalej JEST w snapshocie, drop na ziemi NIE', () => {
  const g = mk();
  const p = g.world.players.get(1);
  p.x = 10 * TILE;
  p.y = 30 * TILE;
  const wall = placeWall(g.world, 50, 30, 0);
  const drop = put(g, 'mine', ...Object.values(farFrom(g, 40)));
  const s = g.snapshot(1);
  assert.ok(ids(s).includes(wall.id), 'sciana');
  assert.ok(!ids(s).includes(drop.id), 'drop');
  // klient buduje z tego siatke kolizji: sciana musi byc w niej
  const grid = buildGrid(balance.map.tilesW, balance.map.tilesH, applyItemDelta(new Map(), s));
  assert.equal(grid.isSolid(50, 30), true);
});

test('AoI: aktywne dzialko i platforma daleko tez leca zawsze', () => {
  const g = mk();
  const p = g.world.players.get(1);
  p.x = 5 * TILE;
  p.y = 5 * TILE;
  const t = put(g, 'turret30', 70 * TILE, 50 * TILE);
  Object.assign(t, { state: 'active', tx: 70, ty: 50 });
  assert.ok(ids(g.snapshot(1)).includes(t.id));
});

test('AoI: drop wchodzi po zblizeniu sie i jest kasowany po oddaleniu (z histereza)', () => {
  const g = mk();
  const p = g.world.players.get(1);
  p.x = 10 * TILE;
  p.y = 30 * TILE;
  const drop = put(g, 'mine', 10 * TILE + 400, 30 * TILE); // 400 < 420: w zasiegu
  assert.ok(ids(g.snapshot(1)).includes(drop.id));
  p.x -= 60; // 460 px: miedzy 1,5 a 1,8 ekranu - zostaje
  const mid = g.snapshot(1);
  assert.ok(!ids(mid).includes(drop.id) && !mid.del, 'nie miga na granicy');
  p.x -= 80; // 540 px > 504: wypada
  assert.deepEqual(g.snapshot(1).del, [drop.id]);
});

test('AoI: potwor na granicy nie miga (histereza 1,5 -> 1,8 ekranu)', () => {
  const g = mk();
  const p = g.world.players.get(1);
  p.x = 20 * TILE;
  p.y = 30 * TILE;
  const m = makeMob(g.world, 'slime', p.x + 700, p.y);
  const has = () => g.snapshot(1).mobs.some((r) => r[0] === m.id);
  assert.equal(has(), false);
  m.x = p.x + 410; // wchodzi
  assert.equal(has(), true);
  const seen = [];
  for (const dx of [430, 415, 440, 420, 460, 480, 450]) { // klebi sie wokol 1,5 ekranu, ale ponizej 1,8
    m.x = p.x + dx;
    seen.push(has());
  }
  assert.ok(seen.every(Boolean), `migalo: ${seen}`);
  m.x = p.x + 520; // powyzej 1,8 ekranu (504)
  assert.equal(has(), false);
  m.x = p.x + 430; // z powrotem tylko po przekroczeniu progu wejscia
  assert.equal(has(), false);
  m.x = p.x + 410;
  assert.equal(has(), true);
});

test('AoI: pociski i kropelki daleko sa ciete, pobliskie nie', () => {
  const g = mk();
  const w = g.world;
  const p = w.players.get(1);
  p.x = 20 * TILE;
  p.y = 30 * TILE;
  const bullet = (x) => ({ id: w.nextId(), owner: 1, fromTurret: false, x, y: p.y, vx: 0, vy: 0, travelLeft: 10, damage: 1, pierce: 0, passed: null });
  w.bullets.push(bullet(p.x + 100), bullet(p.x + 640));
  assert.equal(g.snapshot(1).bullets.length, 1);
});

test('AoI: martwy gracz dostaje swiat wokol towarzyszy (kamera spectate)', () => {
  const g = new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'A', color: 0 }, { id: 2, nick: 'B', color: 1 }], seed: 3 });
  const [a, b] = [g.world.players.get(1), g.world.players.get(2)];
  a.x = 5 * TILE; a.y = 5 * TILE;
  b.x = 70 * TILE; b.y = 50 * TILE;
  const m = makeMob(g.world, 'slime', b.x + 50, b.y);
  assert.ok(!g.snapshot(1).mobs.some((r) => r[0] === m.id));
  a.state = 'dead';
  assert.ok(g.snapshot(1).mobs.some((r) => r[0] === m.id));
});

// --- V3-O-05: pomiar ---------------------------------------------------------------------------------

test('NetMeter: bajty na sekunde ze sredniej kroczacej i rozmiar snapshotu', () => {
  let t = 10_000;
  const m = new NetMeter({ windowS: 5, now: () => t });
  for (let s = 0; s < 5; s++) {
    m.record(1000, true);
    m.record(500);
    t += 1000;
  }
  assert.equal(m.bytesPerSecond(), 1500);
  assert.equal(m.lastSnapBytes, 1000);
  assert.equal(m.maxSnapBytes, 1000);
  t += 10_000;
  assert.equal(m.bytesPerSecond(), 0);
});

test('/healthz zwraca bajty na sekunde (suma i maksimum na gracza)', async () => {
  const srv = await startServer({ port: 0 });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const got = [];
    ws.on('message', (d) => got.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'hello', token: null, nick: 'A' }));
    ws.send(JSON.stringify({ t: 'ult', kind: 'heal' }));
    await new Promise((r) => setTimeout(r, 100));
    ws.send(JSON.stringify({ t: 'start' }));
    await new Promise((r) => setTimeout(r, 400));
    const j = await (await fetch(`http://127.0.0.1:${srv.port}/healthz`)).json();
    assert.equal(j.net.sendStreams, 1);
    assert.ok(j.net.totalBytesPerSec > 0, JSON.stringify(j.net));
    assert.ok(j.net.maxPlayerBytesPerSec > 0);
    assert.ok(j.net.maxPlayerBytesPerSec <= j.net.totalBytesPerSec);
    assert.ok(j.net.maxSnapshotBytes > 500);
    ws.close();
  } finally {
    await srv.close();
  }
});

test('perMessageDeflate jest wynegocjowane z klientem', async () => {
  const srv = await startServer({ port: 0 });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    await new Promise((r) => ws.on('open', r));
    assert.ok(ws.extensions.includes('permessage-deflate'), ws.extensions);
    ws.close();
  } finally {
    await srv.close();
  }
});

// --- V3-O-08: odchudzone `players` ------------------------------------------------------------------

const mk2 = () => new Game({ balance, difficulty: 2, players: [{ id: 1, nick: 'Ala', color: 2 }, { id: 2, nick: 'Bob', color: 3 }], seed: 77 });
// Ksztalt sprzed zmiany: obiekt z id, nick, color i polami zmiennymi; sluzy za wzorzec.

test('players: pierwszy snapshot (full) niesie nicki, kolory i seed', () => {
  const g = mk2();
  const a = g.snapshot(1);
  assert.equal(a.full, true);
  assert.equal(a.seed, 77);
  assert.deepEqual(a.pstatic, [[1, 'Ala', 2], [2, 'Bob', 3]]);
  assert.ok(a.players.every((r) => Array.isArray(r)));
});

test('players: kolejny snapshot nie niesie statykow ani seeda, a applyPlayerDelta oddaje stary ksztalt', () => {
  const g = mk2();
  const st = newPlayerState();
  const a = g.snapshot(1);
  const first = applyPlayerDelta(st, a);
  const b = g.snapshot(1);
  assert.equal(b.pstatic, undefined);
  assert.equal(b.seed, undefined);
  const out = applyPlayerDelta(st, b);
  assert.equal(b.seed, 77, 'seed odtworzony w snapshocie klienta');
  assert.deepEqual(out, first);
  const p = g.world.players.get(1);
  assert.deepEqual(Object.keys(out[0]), ['id', 'nick', 'color', ...PLAYER_FIELDS.slice(1)]);
  assert.equal(out[0].nick, 'Ala');
  assert.equal(out[0].color, 2);
  assert.equal(out[0].x, Math.round(p.x * 10) / 10);
  assert.equal(out[0].held, null);
  assert.equal(out[0].ammo, p.ammo);
});

test('players: gracz dolaczajacy w trakcie dostaje komplet statykow, reszta nie dostaje ich ponownie', () => {
  const g = mk2();
  const st = newPlayerState();
  applyPlayerDelta(st, g.snapshot(1));
  assert.equal(g.snapshot(1).pstatic, undefined);
  // dojscie nowego gracza do swiata w trakcie gry
  const donor = g.world.players.get(2);
  g.world.players.set(3, { ...donor, id: 3, nick: 'Cez', color: 5 });
  const s = g.snapshot(1);
  assert.deepEqual(s.pstatic, [[3, 'Cez', 5]]);
  const out = applyPlayerDelta(st, s);
  assert.equal(out.find((p) => p.id === 3).nick, 'Cez');
  assert.equal(out.length, 3);
  // jego wlasny pierwszy snapshot jest pelny i ma wszystkich
  const own = g.snapshot(3);
  assert.equal(own.full, true);
  assert.equal(own.pstatic.length, 3);
  assert.equal(own.seed, 77);
});

test('players: reconnect dostaje full z seedem i statykami; klient z pustym stanem widzi nicki', () => {
  const g = mk2();
  g.snapshot(1);
  g.snapshot(1);
  g.suspend(1);
  g.resume(1);
  const s = g.snapshot(1);
  assert.equal(s.full, true);
  assert.equal(s.seed, 77);
  const out = applyPlayerDelta(newPlayerState(), s);
  assert.deepEqual(out.map((p) => p.nick), ['Ala', 'Bob']);
});

test('players: gracz, ktory wyszedl, znika z tablicy po stronie klienta', () => {
  const g = mk2();
  const st = newPlayerState();
  applyPlayerDelta(st, g.snapshot(1));
  g.remove(2);
  const out = applyPlayerDelta(st, g.snapshot(1));
  assert.deepEqual(out.map((p) => p.id), [1]);
});

test('players: krotka jest mniejsza niz stary obiekt', () => {
  const g = mk2();
  g.snapshot(1);
  const b = g.snapshot(1);
  const full = applyPlayerDelta(newPlayerState(), { ...g.snapshot(2), full: true });
  assert.ok(JSON.stringify(b.players).length < JSON.stringify(full).length / 2);
});

// --- V3-O-04: adaptacyjny snapshotHz ------------------------------------------------------------------

function slowSession() {
  let n = 0;
  const s = new Session({ balance, addresses: [], seed: 1, makeToken: () => `t${++n}` });
  const c = { sent: [], isLocal: true, buf: 0, meter: new NetMeter(), send: (o) => c.sent.push(o), buffered: () => c.buf, close() {} };
  s.connect(c);
  s.message(c, JSON.stringify({ t: 'hello', token: null, nick: 'A' }));
  s.message(c, JSON.stringify({ t: 'ult', kind: 'shockwave' }));
  s.message(c, JSON.stringify({ t: 'start' }));
  return { s, c };
}
const snapsOf = (c) => c.sent.filter((m) => m.t === 'snap');

test('throttle: zatkane lacze schodzi do ok. 12 Hz, a po odetkaniu wraca do 20 Hz', () => {
  const { s, c } = slowSession();
  for (let i = 0; i < 20; i++) s.tick(0.05);
  assert.equal(snapsOf(c).length, 20);
  c.buf = 100000;
  c.sent.length = 0;
  for (let i = 0; i < 60; i++) s.tick(0.05);
  const slow = snapsOf(c).length;
  assert.ok(slow >= 30 && slow <= 40, `przy dlawieniu ~12 Hz z 20, jest ${slow}/60`);
  assert.equal(summarize([c.meter]).throttledStreams, 1);
  c.buf = 0;
  for (let i = 0; i < 25; i++) s.tick(0.05);
  c.sent.length = 0;
  for (let i = 0; i < 20; i++) s.tick(0.05);
  assert.equal(snapsOf(c).length, 20);
  assert.equal(summarize([c.meter]).throttledStreams, 0);
});

test('throttle: pominiecie wysylki nie przesuwa punktu odniesienia delty przedmiotow', () => {
  const { s, c } = slowSession();
  for (let i = 0; i < 5; i++) s.tick(0.05);
  const g = s.game;
  const p = g.world.players.get(g.world.players.keys().next().value);
  const drop = put(g, 'mine', p.x + 30, p.y);
  const dict = new Map();
  const st = newPlayerState();
  const feed = () => { for (const m of snapsOf(c)) { applyItemDelta(dict, m); applyPlayerDelta(st, m); } c.sent.length = 0; };
  feed();
  c.buf = 100000;
  for (let i = 0; i < 40; i++) {
    drop.x += 1; // przedmiot zmienia sie w KAZDYM ticku, takze w pominietych
    s.tick(0.05);
  }
  feed();
  c.buf = 0;
  for (let i = 0; i < 30; i++) s.tick(0.05);
  feed();
  assert.equal(dict.get(drop.id).x, Math.round(drop.x * 10) / 10, 'klient ma ostatnia pozycje');
  const truth = [...g.world.items.values()].filter((it) => it.state !== 'held').map((it) => it.id).sort((a, b) => a - b);
  assert.deepEqual([...dict.keys()].sort((a, b) => a - b), truth);
});

test('throttle: pominiecie nie wola snapshot() (nie rusza widoku gracza)', () => {
  const { s, c } = slowSession();
  for (let i = 0; i < 5; i++) s.tick(0.05);
  c.buf = 100000;
  let calls = 0;
  const orig = s.game.snapshot.bind(s.game);
  s.game.snapshot = (id) => { calls++; return orig(id); };
  for (let i = 0; i < 50; i++) s.tick(0.05);
  assert.equal(calls, snapsOf(c).length - 5, 'snapshot() zawolany tylko dla faktycznie wyslanych');
  assert.ok(calls < 50);
});

test('throttle: zdarzenia leca takze w pominietych tickach', () => {
  const { s, c } = slowSession();
  for (let i = 0; i < 5; i++) s.tick(0.05);
  c.buf = 100000;
  for (let i = 0; i < 4; i++) s.tick(0.05);
  c.sent.length = 0;
  for (let i = 0; i < 10; i++) { s.game.world.events.push({ t: 'x', i }); s.tick(0.05); }
  assert.equal(c.sent.filter((m) => m.t === 'ev').length, 10);
});

test('throttle: histereza - pojedynczy skok nie wlacza, pojedynczy spadek i skok nie wylaczaja', () => {
  const l = new LinkThrottle();
  assert.equal(l.update(500000), false, 'jeden skok nie dlawi');
  assert.equal(l.update(0), false);
  for (let i = 0; i < 3; i++) l.update(500000);
  assert.equal(l.throttled, true);
  assert.equal(l.update(0), true, 'jeden niski odczyt nie zwalnia');
  assert.equal(l.update(500000), true);
  for (let i = 0; i < 19; i++) assert.equal(l.update(0), true);
  assert.equal(l.update(5000), true, 'odczyt miedzy progami zeruje licznik wyjscia');
  for (let i = 0; i < 19; i++) assert.equal(l.update(0), true);
  assert.equal(l.update(0), false, 'dopiero 20 niskich z rzedu');
  assert.equal(l.update(500000), false, 'skok zaraz po powrocie nie wraca do dlawienia');
});
