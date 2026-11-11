import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../server/app.js';
import { Rooms } from '../server/rooms.js';
import { loadBalance } from '../server/balance.js';

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

async function join(port, nick, room = null) {
  const c = client(port);
  await c.opened;
  c.send({ t: 'hello', token: null, nick, room });
  return c;
}

const get = (srv, p = '/api/rooms') => fetch(`http://127.0.0.1:${srv.port}${p}`);

test('/api/rooms: kształt, nagłówki, brak nicków', async () => {
  const srv = await startServer({ port: 0, rooms: true });
  try {
    assert.deepEqual((await (await get(srv)).json()), { rooms: [] });
    const a = await join(srv.port, 'SekretnyNick');
    const w = await a.wait((m) => m.t === 'welcome');
    const res = await get(srv);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const text = await res.text();
    assert.ok(!text.includes('SekretnyNick'));
    const { rooms } = JSON.parse(text);
    assert.equal(rooms.length, 1);
    // `spectators` doszlo z trybem widza. Lista nadal nie niesie NICZEGO, co identyfikuje gracza - to jest
    // sedno tego testu, wiec zbior pol trzymamy na sztywno, zeby nikt nie dolozyl tu nicku przez przypadek.
    assert.deepEqual(Object.keys(rooms[0]).sort(), ['ageS', 'code', 'inGame', 'maxPlayers', 'players', 'spectators', 'wave']);
    assert.equal(rooms[0].code, w.room);
    assert.equal(rooms[0].players, 1);
    assert.equal(rooms[0].maxPlayers, 4);
    assert.equal(rooms[0].inGame, false);
    assert.equal(rooms[0].wave, 0);
    assert.equal(rooms[0].spectators, 0);
    assert.ok(rooms[0].ageS >= 0);
    a.ws.close();
  } finally {
    await srv.close();
  }
});

test('/api/rooms nie istnieje w trybie LAN', async () => {
  const srv = await startServer({ port: 0 });
  try {
    assert.equal((await get(srv)).status, 404);
  } finally {
    await srv.close();
  }
});

test('/api/rooms: limit zapytań per IP daje 429', async () => {
  const srv = await startServer({ port: 0, rooms: true, roomListMax: 3 });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await get(srv)).status, 200);
    const res = await get(srv);
    assert.equal(res.status, 429);
    assert.match(res.headers.get('content-type'), /json/);
    assert.ok((await res.json()).error);
  } finally {
    await srv.close();
  }
});

function fakeSession(code, { players, inGame = false, age = 0 }) {
  return {
    playerCount: players,
    summary: () => ({ code, players, maxPlayers: 4, inGame, wave: inGame ? 3 : 0, ageS: age }),
  };
}

test('Rooms#list: sortowanie deterministyczne, puste pominięte', () => {
  const rooms = new Rooms({ balance: loadBalance() });
  const put = (code, o) => rooms.rooms.set(code, fakeSession(code, o));
  put('EMPT', { players: 0 });
  put('FULL', { players: 4, age: 10 });
  put('GAME', { players: 3, inGame: true, age: 10 });
  put('ONE1', { players: 1, age: 10 });
  put('TWOB', { players: 2, age: 5 });
  put('TWOA', { players: 2, age: 50 });
  put('TWOC', { players: 2, age: 50 });
  assert.deepEqual(rooms.list().map((r) => r.code), ['TWOA', 'TWOC', 'TWOB', 'ONE1', 'FULL', 'GAME']);
});

test('Rooms#open odmawia pustego pokoju, get() dalej go zwraca', () => {
  const rooms = new Rooms({ balance: loadBalance() });
  const s = rooms.create();
  assert.equal(s.playerCount, 0);
  assert.equal(rooms.get(s.code), s);
  assert.equal(rooms.open(s.code), null);
  assert.equal(rooms.list().length, 0);
  assert.equal(rooms.open('NOPE'), null);
  rooms.close();
});

test('pokój po wyjściu ostatniego gracza znika z listy i odrzuca dołączenie', async () => {
  const srv = await startServer({ port: 0, rooms: true });
  try {
    const a = await join(srv.port, 'A');
    const { room } = await a.wait((m) => m.t === 'welcome');
    assert.equal((await (await get(srv)).json()).rooms.length, 1);
    a.send({ t: 'leave' });
    for (let i = 0; i < 50 && (await (await get(srv)).json()).rooms.length; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal((await (await get(srv)).json()).rooms.length, 0);
    assert.ok(srv.rooms.get(room), 'fizycznie jeszcze żyje');
    const b = await join(srv.port, 'B', room);
    assert.equal((await b.wait((m) => m.t === 'reject')).reason, 'Pokój jest już zamknięty');
    const c = await join(srv.port, 'C', 'ZZZZ');
    assert.equal((await c.wait((m) => m.t === 'reject')).reason, 'Nie ma takiego pokoju');
  } finally {
    await srv.close();
  }
});
