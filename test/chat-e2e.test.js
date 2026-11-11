// Czat i tryb widza przez PRAWDZIWY WebSocket: testy jednostkowe wolaja Session wprost, a tu
// sprawdzamy, ze pola `spectate` i `chat` przechodza cala droga przez app.js i serializacje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../server/app.js';

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
    wait: (pred, ms = 4000) => new Promise((res, rej) => {
      const hit = msgs.find(pred);
      if (hit) return res(hit);
      const timer = setTimeout(() => rej(new Error('czekanie przekroczylo limit')), ms);
      waiters.push({ pred, res: (m) => { clearTimeout(timer); res(m); } });
    }),
  };
}

async function hello(port, nick, { room = null, spectate = false } = {}) {
  const c = client(port);
  await c.opened;
  c.send({ t: 'hello', token: null, nick, room, spectate });
  return c;
}

test('e2e: czat w pokoju i wejscie jako widz do trwajacej gry', async () => {
  const srv = await startServer({ port: 0, rooms: true });
  try {
    // host zaklada pokoj
    const a = await hello(srv.port, 'HOST');
    const wa = await a.wait((m) => m.t === 'welcome');
    const room = wa.room;
    assert.ok(room, 'pokoj ma kod');
    assert.equal(wa.spectator, false, 'host gra, nie oglada');

    // drugi gracz dolacza i pisze
    const b = await hello(srv.port, 'GOSC', { room });
    await b.wait((m) => m.t === 'welcome');
    b.send({ t: 'chat', text: 'siema  ​ ' });
    const seen = await a.wait((m) => m.t === 'chat' && m.from === 'GOSC');
    assert.equal(seen.text, 'siema', 'tekst oczyszczony po drodze');
    assert.equal(seen.role, 'player');

    // start gry
    a.send({ t: 'ult', kind: 'shockwave' });
    a.send({ t: 'ult', kind: 'heal', slot: 2 });
    b.send({ t: 'ult', kind: 'frenzy' });
    b.send({ t: 'ult', kind: 'rocket', slot: 2 });
    a.send({ t: 'start' });
    await a.wait((m) => m.t === 'snap');

    // stary klient: odbicie
    const stary = await hello(srv.port, 'STARY', { room });
    const rej = await stary.wait((m) => m.t === 'reject');
    assert.equal(rej.reason, 'Gra w toku');
    stary.ws.close();

    // widz: wchodzi, dostaje historie i snapshoty
    const w = await hello(srv.port, 'WIDZ', { room, spectate: true });
    const ww = await w.wait((m) => m.t === 'welcome');
    assert.equal(ww.spectator, true, 'klient wie, ze oglada');
    const log = await w.wait((m) => m.t === 'chatLog');
    assert.ok(log.list.some((e) => e.text === 'siema'), 'widz widzi, co bylo wczesniej');
    const snap = await w.wait((m) => m.t === 'snap');
    assert.ok(snap.players.length >= 1, 'widz widzi grajacych');

    // widz pisze -> GRAJACY to dostaje
    w.send({ t: 'chat', text: 'z lewej!' });
    const uGracza = await a.wait((m) => m.t === 'chat' && m.from === 'WIDZ');
    assert.equal(uGracza.text, 'z lewej!');
    assert.equal(uGracza.role, 'spectator', 'gracz widzi, ze pisal widz');

    // widz nie zajmuje miejsca w pokoju
    const { rooms } = await (await fetch(`http://127.0.0.1:${srv.port}/api/rooms`)).json();
    const mine = rooms.find((r) => r.code === room);
    assert.equal(mine.players, 2, 'widz nie liczy sie do graczy');
    assert.equal(mine.spectators, 1);
    assert.equal(mine.inGame, true);

    for (const c of [a, b, w]) c.ws.close();
  } finally {
    await srv.close();
  }
});
