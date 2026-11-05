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
    wait: (pred) => new Promise((res) => {
      const hit = msgs.find(pred);
      if (hit) res(hit); else waiters.push({ pred, res });
    }),
  };
}

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
    a.send({ t: 'hello', token: null, nick: 'A' });
    b.send({ t: 'hello', token: null, nick: 'B' });
    for (const c of [a, b]) {
      await c.wait((m) => m.t === 'welcome');
      await c.wait((m) => m.t === 'lobby');
    }
    a.send({ t: 'ult', kind: 'heal' });
    b.send({ t: 'ult', kind: 'freeze' });
    await b.wait((m) => m.t === 'lobby' && m.players.every((p) => p.ultKind));
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
