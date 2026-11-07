import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Rooms, makeCode } from '../server/rooms.js';
import { Session } from '../server/session.js';
import { startServer } from '../server/app.js';
import { balance } from './helpers.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function conn(isLocal = false, pid = null) {
  const c = {
    sent: [], closed: null, isLocal, pid, ipHash: 'ip',
    send: (o) => c.sent.push(o), close: (code, reason) => { c.closed = reason; },
  };
  return c;
}
const send = (s, c, o) => s.message(c, JSON.stringify(o));
const last = (c, t) => c.sent.filter((m) => m.t === t).at(-1);

function join(s, nick, isLocal = false) {
  const c = conn(isLocal);
  s.connect(c);
  send(s, c, { t: 'hello', token: null, nick });
  send(s, c, { t: 'ult', kind: 'shockwave' });
  send(s, c, { t: 'ult', kind: 'heal', slot: 2 });
  return c;
}

test('kod pokoju bez znaków mylących', () => {
  for (let i = 0; i < 50; i++) {
    const code = makeCode(4);
    assert.equal(code.length, 4);
    for (const ch of code) assert.ok(ALPHABET.includes(ch), `${ch} spoza alfabetu`);
    assert.ok(!/[IO01]/.test(code));
  }
});

test('limit pokoi odmawia zamiast rosnąć w nieskończoność', () => {
  const rooms = new Rooms({ balance, maxRooms: 2 });
  assert.ok(rooms.create());
  assert.ok(rooms.create());
  assert.equal(rooms.create(), null);
  assert.equal(rooms.size, 2);
});

test('pusty pokój znika po TTL, pokój z graczem zostaje', () => {
  let t = 0;
  const rooms = new Rooms({ balance, emptyTtlS: 10, now: () => t });
  const empty = rooms.create();
  const used = rooms.create();
  join(used, 'A');
  t = 20_000;
  rooms.tick(1 / 30);
  assert.equal(rooms.get(empty.code), null);
  assert.equal(rooms.get(used.code), used);
});

test('pokój opuszczony w trakcie gry znika dopiero po TTL', () => {
  let t = 0;
  const rooms = new Rooms({ balance, emptyTtlS: 10, now: () => t });
  const room = rooms.create();
  const a = join(room, 'A');
  send(room, a, { t: 'start' });
  assert.ok(room.game);
  room.disconnect(a);
  t = 5_000;
  rooms.tick(1 / 30);
  assert.equal(rooms.get(room.code), room, 'gracz ma jeszcze grace na powrót');
  room.tick(31);
  t = 20_000;
  rooms.tick(1 / 30);
  assert.equal(rooms.get(room.code), null);
});

test('kod pokoju jest niewrażliwy na wielkość liter', () => {
  const rooms = new Rooms({ balance });
  const room = rooms.create();
  assert.equal(rooms.get(room.code.toLowerCase()), room);
  assert.equal(rooms.get('ZZZZ-nie-ma'), null);
  assert.equal(rooms.get(42), null);
});

test('hostPolicy first: host bez localhosta i promocja następnego', () => {
  const s = new Session({ balance, code: 'TEST', hostPolicy: 'first', seed: 1 });
  const a = join(s, 'A');
  const b = join(s, 'B');
  assert.equal(last(a, 'lobby').youAreHost, true);
  assert.equal(last(b, 'lobby').youAreHost, false);
  send(s, a, { t: 'start' });
  assert.ok(s.game, 'host zdalny może wystartować w trybie pokoi');
  s.message(a, JSON.stringify({ t: 'leave' }));
  assert.equal(last(b, 'host').youAreHost, true, 'B przejmuje hosta');
  assert.ok(s.game, 'gra toczy się dalej mimo odejścia hosta');
  send(s, b, { t: 'difficulty', level: 4 });
});

test('tryb LAN zachowuje stare zachowanie: wyjście hosta kończy grę', () => {
  const s = new Session({ balance, seed: 1 });
  const a = join(s, 'A', true);
  const b = join(s, 'B');
  send(s, a, { t: 'start' });
  s.message(a, JSON.stringify({ t: 'leave' }));
  assert.equal(last(b, 'ended').reason, 'Host opuścił grę');
  assert.equal(s.game, null);
});

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  const opened = new Promise((r) => ws.on('open', r));
  return {
    ws, msgs, opened,
    send: (o) => ws.send(JSON.stringify(o)),
    wait: (pred) => new Promise((res) => {
      const hit = msgs.find(pred);
      if (hit) res(hit); else waiters.push({ pred, res });
    }),
  };
}

test('routing pokoi po WebSocketcie: tworzenie, dołączanie, zły kod, izolacja', async () => {
  const srv = await startServer({ port: 0, rooms: true });
  try {
    const health = await (await fetch(`http://127.0.0.1:${srv.port}/healthz`)).json();
    assert.equal(health.mode, 'rooms');

    const a = client(srv.port);
    await a.opened;
    a.send({ t: 'hello', nick: 'A', token: null, room: null, pid: 'pid-a' });
    const welcomeA = await a.wait((m) => m.t === 'welcome');
    assert.match(welcomeA.room, /^[A-Z2-9]{4}$/);

    const b = client(srv.port);
    await b.opened;
    b.send({ t: 'hello', nick: 'B', token: null, room: welcomeA.room.toLowerCase(), pid: 'pid-b' });
    await b.wait((m) => m.t === 'welcome');
    const lobby = await b.wait((m) => m.t === 'lobby' && m.players.length === 2);
    assert.deepEqual(lobby.players.map((p) => p.nick), ['A', 'B']);
    assert.equal(lobby.room, welcomeA.room);

    const bad = client(srv.port);
    await bad.opened;
    bad.send({ t: 'hello', nick: 'X', token: null, room: 'ZZZZ' });
    assert.equal((await bad.wait((m) => m.t === 'reject')).reason, 'Nie ma takiego pokoju');

    const c = client(srv.port);
    await c.opened;
    c.send({ t: 'hello', nick: 'C', token: null, room: null });
    const welcomeC = await c.wait((m) => m.t === 'welcome');
    assert.notEqual(welcomeC.room, welcomeA.room);
    const lobbyC = await c.wait((m) => m.t === 'lobby');
    assert.deepEqual(lobbyC.players.map((p) => p.nick), ['C'], 'pokoje są odizolowane');
    assert.equal(srv.rooms.stats().rooms, 2);
    assert.equal(srv.rooms.stats().players, 3);
  } finally {
    await srv.close();
  }
});

test('limit nowych pokoi na adres IP', async () => {
  const srv = await startServer({ port: 0, rooms: true, roomsPerIp: 1 });
  try {
    const a = client(srv.port);
    await a.opened;
    a.send({ t: 'hello', nick: 'A', token: null, room: null });
    await a.wait((m) => m.t === 'welcome');
    const b = client(srv.port);
    await b.opened;
    b.send({ t: 'hello', nick: 'B', token: null, room: null });
    assert.equal((await b.wait((m) => m.t === 'reject')).reason, 'Za dużo nowych pokoi z tego adresu');
  } finally {
    await srv.close();
  }
});

test('brak wolnych pokoi odrzuca czytelnie', async () => {
  const srv = await startServer({ port: 0, rooms: true, maxRooms: 1 });
  try {
    const a = client(srv.port);
    await a.opened;
    a.send({ t: 'hello', nick: 'A', token: null, room: null });
    await a.wait((m) => m.t === 'welcome');
    const b = client(srv.port);
    await b.opened;
    b.send({ t: 'hello', nick: 'B', token: null, room: null });
    assert.equal((await b.wait((m) => m.t === 'reject')).reason, 'Brak wolnych pokoi');
  } finally {
    await srv.close();
  }
});

test('tryb LAN nie wymaga kodu pokoju i nie zna pokoi', async () => {
  const srv = await startServer({ port: 0 });
  try {
    const health = await (await fetch(`http://127.0.0.1:${srv.port}/healthz`)).json();
    assert.equal(health.mode, 'lan');
    const a = client(srv.port);
    await a.opened;
    a.send({ t: 'hello', nick: 'A', token: null, room: 'ZZZZ' });
    const w = await a.wait((m) => m.t === 'welcome');
    assert.equal(w.room, null, 'kod pokoju jest ignorowany w LAN');
  } finally {
    await srv.close();
  }
});
