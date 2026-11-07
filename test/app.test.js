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
    // Limit czasu: bez niego brak wiadomosci wieszal cala suite (zauwazone 2026-11-07 przy rownoleglym biegu plikow).
    wait: (pred, label = pred.toString()) => new Promise((res, rej) => {
      const hit = msgs.find(pred);
      if (hit) return res(hit);
      const t = setTimeout(() => rej(new Error(`brak wiadomosci: ${label}; odebrane: ${msgs.map((m) => m.t).join(',')}`)), 15000);
      waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } });
    }),
  };
}

test('healthz reports version', async () => {
  const srv = await startServer({ port: 0 });
  try {
    const j = await (await fetch(`http://127.0.0.1:${srv.port}/healthz`)).json();
    assert.equal(typeof j.version, 'string');
    assert.ok(j.version.length > 0);
  } finally {
    await srv.close?.();
  }
});

test('http static and websocket flow', async () => {
  const srv = await startServer({ port: 0 });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const root = await fetch(`${base}/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get('content-type'), /html/);
    assert.equal((await fetch(`${base}/balance.json`)).status, 200);
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/server.js`)).status, 404);

    const a = client(srv.port);
    const b = client(srv.port);
    await Promise.all([a.opened, b.opened]);
    // Host = pierwszy `hello`. Dwa gniazda nie gwarantuja kolejnosci dostarczenia, wiec B wita sie dopiero po
    // welcome A; inaczej pod obciazeniem B bywal hostem, `start` od A byl ignorowany i test wisial bez snapshotu.
    a.send({ t: 'hello', token: null, nick: 'A' });
    await a.wait((m) => m.t === 'welcome', 'welcome A');
    b.send({ t: 'hello', token: null, nick: 'B' });
    for (const c of [a, b]) {
      await c.wait((m) => m.t === 'welcome');
      await c.wait((m) => m.t === 'lobby');
    }
    a.send({ t: 'ult', kind: 'heal' });
    a.send({ t: 'ult', kind: 'rocket', slot: 2 });
    b.send({ t: 'ult', kind: 'freeze' });
    b.send({ t: 'ult', kind: 'wall', slot: 2 });
    await b.wait((m) => m.t === 'lobby' && m.players.every((p) => p.ultKind && p.ultKind2), 'lobby z dwoma ult');
    a.send({ t: 'start' });
    for (const c of [a, b]) assert.equal((await c.wait((m) => m.t === 'snap')).phase, 'break');

    const x = client(srv.port);
    await x.opened;
    x.send({ t: 'hello', token: null, nick: 'X' });
    assert.equal((await x.wait((m) => m.t === 'reject')).reason, 'Gra w toku');
  } finally {
    await srv.close();
  }
});
