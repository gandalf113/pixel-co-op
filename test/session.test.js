import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../server/session.js';
import { sanitizeNick } from '../public/shared/protocol.js';
import { applyPlayerDelta, newPlayerState } from '../public/shared/delta.js';
import { balance } from './helpers.js';

let n = 0;
function mk() {
  n = 0;
  return new Session({ balance, addresses: [], seed: 1, makeToken: () => `tok${++n}` });
}
function conn(isLocal = false) {
  const c = { sent: [], closed: null, isLocal, send: (o) => c.sent.push(o), close: (code, reason) => { c.closed = reason; } };
  return c;
}
const send = (s, c, o) => s.message(c, JSON.stringify(o));
const last = (c, t) => c.sent.filter((m) => m.t === t).at(-1);
function join(s, nick, isLocal = false) {
  const c = conn(isLocal);
  s.connect(c);
  send(s, c, { t: 'hello', token: null, nick });
  send(s, c, { t: 'ult', kind: 'shockwave' });
  return c;
}
function run(s, secs, dt = 0.5) {
  for (let t = 0; t < secs; t += dt) s.tick(dt);
}

test('nick sanitized', () => {
  assert.equal(sanitizeNick('  Ala\u0007   ma  kota123456 '), 'Ala ma kota1');
  assert.equal(sanitizeNick('   '), null);
  assert.equal(sanitizeNick(42), null);
});

test('only first local player is host', () => {
  const s = mk();
  const a = join(s, 'A', true);
  const b = join(s, 'B', true);
  assert.equal(last(a, 'lobby').youAreHost, true);
  assert.equal(last(b, 'lobby').youAreHost, false);
});

test('remote player cannot start or set difficulty', () => {
  const s = mk();
  join(s, 'A', true);
  const b = join(s, 'B');
  send(s, b, { t: 'difficulty', level: 4 });
  send(s, b, { t: 'start' });
  assert.equal(s.game, null);
  assert.equal(s.difficulty, 2);
});

test('fifth player rejected', () => {
  const s = mk();
  for (let i = 0; i < 4; i++) join(s, `P${i}`, i === 0);
  const c = join(s, 'X');
  assert.deepEqual(last(c, 'reject'), { t: 'reject', reason: 'Serwer pełny' });
});

test('join after start rejected', () => {
  const s = mk();
  const a = join(s, 'A', true);
  send(s, a, { t: 'start' });
  const c = join(s, 'B');
  assert.equal(last(c, 'reject').reason, 'Gra w toku');
});

test('reconnect within 30 s restores same player', () => {
  const s = mk();
  const a = join(s, 'A', true);
  join(s, 'B');
  send(s, a, { t: 'start' });
  const b = [...s.byConn.keys()][1];
  const id = s.byConn.get(b).id;
  s.disconnect(b);
  run(s, 10);
  const b2 = conn();
  send(s, b2, { t: 'hello', token: 'tok2', nick: 'x' });
  assert.equal(last(b2, 'welcome').id, id);
  run(s, 0.1, 0.05);
  const me = applyPlayerDelta(newPlayerState(), last(b2, 'snap')).find((p) => p.id === id);
  assert.equal(me.suspended, false);
});

test('removed after 30 s', () => {
  const s = mk();
  const a = join(s, 'A', true);
  const b = join(s, 'B');
  send(s, a, { t: 'start' });
  const id = s.byConn.get(b).id;
  s.disconnect(b);
  run(s, 31);
  assert.equal(last(a, 'snap').players.some((p) => p[0] === id), false);
  const b2 = conn();
  send(s, b2, { t: 'hello', token: 'tok2', nick: 'B' });
  assert.equal(last(b2, 'reject').reason, 'Gra w toku');
});

test('host timeout ends session', () => {
  const s = mk();
  const a = join(s, 'A', true);
  const b = join(s, 'B');
  send(s, a, { t: 'start' });
  s.disconnect(a);
  run(s, 31);
  const types = b.sent.map((m) => m.t);
  const ei = types.lastIndexOf('ended');
  assert.ok(ei >= 0);
  assert.equal(b.sent[ei].reason, 'Host opuścił grę');
  assert.ok(types.indexOf('lobby', ei) > ei);
  assert.equal(s.game, null);
  assert.deepEqual(last(b, 'lobby').players.map((p) => p.nick), ['B']);
});

test('host refresh keeps host role', () => {
  const s = mk();
  const a = join(s, 'A', true);
  join(s, 'B', true);
  send(s, a, { t: 'start' });
  s.disconnect(a);
  const a2 = conn(true);
  send(s, a2, { t: 'hello', token: 'tok1', nick: 'A' });
  send(s, a2, { t: 'difficulty', level: 3 });
  assert.equal(s.hostToken, 'tok1');
  assert.equal(s.game.world.players.get('p1').suspended, false);
});

test('lobby disconnect removes immediately', () => {
  const s = mk();
  join(s, 'A', true);
  const b = join(s, 'B');
  s.disconnect(b);
  assert.equal(s.players.length, 1);
});

test('malformed messages are ignored', () => {
  const s = mk();
  const a = join(s, 'A', true);
  send(s, a, { t: 'start' });
  const calls = [];
  const orig = s.game.queueInput.bind(s.game);
  s.game.queueInput = (id, i) => { calls.push(i); orig(id, i); };
  s.message(a, 'nie json');
  send(s, a, { t: 'input', seq: -1 });
  send(s, a, { t: 'input', seq: 2, aimX: NaN });
  send(s, a, { t: 'input', seq: 3, mx: 1e308, aimX: 1, aimY: 1 });
  send(s, a, { t: 'difficulty', level: 7 });
  send(s, a, { t: 'xyz' });
  send(s, a, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mx, 1);
  assert.equal(s.difficulty, 2);
});

test('snapshots at 20 Hz', () => {
  const s = mk();
  const a = join(s, 'A', true);
  send(s, a, { t: 'start' });
  for (let i = 0; i < 30; i++) s.tick(1 / 30);
  const count = a.sent.filter((m) => m.t === 'snap').length;
  assert.ok(Math.abs(count - 20) <= 1, `got ${count}`);
});

test('results sent on game over, toLobby returns', () => {
  const s = mk();
  const a = join(s, 'A', true);
  send(s, a, { t: 'start' });
  s.game.world.phase = 'over';
  s.tick(1 / 30);
  assert.ok(last(a, 'results'));
  send(s, a, { t: 'toLobby' });
  assert.equal(s.game, null);
  assert.ok(last(a, 'lobby'));
});

test('host and guest timing out together does not crash', () => {
  const s = mk();
  const a = join(s, 'A', true);
  const b = join(s, 'B');
  send(s, a, { t: 'start' });
  s.disconnect(a);
  s.disconnect(b);
  run(s, 31);
  assert.equal(s.game, null);
  assert.equal(s.players.length, 0);
});
