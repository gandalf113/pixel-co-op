import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetry } from '../server/telemetry.js';
import { Session } from '../server/session.js';
import { balance } from './helpers.js';

function recorder() {
  const events = [];
  return { events, event: (type, data) => events.push({ type, ...data }) };
}

test('bez STATS_URL telemetria jest wyłączona i nic nie robi', async () => {
  const t = createTelemetry({});
  assert.equal(t.enabled, false);
  t.event('cokolwiek', { a: 1 });
  await t.flush();
  await t.close();
  assert.equal(t.state.sent, 0);
});

test('zdarzenia lecą paczką, z tokenem i nazwą instancji', async () => {
  const calls = [];
  const t = createTelemetry({
    url: 'http://x/ingest', token: 'sekret', instance: 'prod', now: () => 1000,
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; },
  });
  t.event('join', { nick: 'A' });
  t.event('join', { nick: 'B' });
  await t.flush();
  assert.equal(calls.length, 1, 'jedna paczka, nie dwa requesty');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer sekret');
  assert.equal(body.instance, 'prod');
  assert.deepEqual(body.events, [
    { ts: 1000, type: 'join', nick: 'A' },
    { ts: 1000, type: 'join', nick: 'B' },
  ]);
  assert.equal(t.state.sent, 2);
  await t.close();
});

test('padnięty kolektor nie wywraca gry', async () => {
  const errors = [];
  const t = createTelemetry({
    url: 'http://x/ingest',
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    onError: (e) => errors.push(e),
  });
  t.event('join', {});
  await t.flush();
  assert.equal(t.state.failed, 1);
  assert.equal(errors.length, 1);
  await t.close();
});

test('kolektor zwracający błąd HTTP liczony jako porażka, nie wyjątek', async () => {
  const t = createTelemetry({ url: 'http://x', fetchImpl: async () => ({ ok: false, status: 500 }) });
  t.event('join', {});
  await t.flush();
  assert.equal(t.state.failed, 1);
  await t.close();
});

test('kolejka ma sufit — gubimy najstarsze, nie pamięć', async () => {
  const sent = [];
  const t = createTelemetry({
    url: 'http://x', maxQueue: 3, maxBatch: 100,
    fetchImpl: async (_u, o) => { sent.push(...JSON.parse(o.body).events); return { ok: true }; },
  });
  for (let i = 0; i < 10; i++) t.event('e', { i });
  await t.flush();
  assert.equal(t.state.dropped, 7);
  assert.deepEqual(sent.map((e) => e.i), [7, 8, 9]);
  await t.close();
});

test('close dosyła to, co zostało w kolejce', async () => {
  const sent = [];
  const t = createTelemetry({
    url: 'http://x', batchMs: 100000,
    fetchImpl: async (_u, o) => { sent.push(...JSON.parse(o.body).events); return { ok: true }; },
  });
  t.event('game_end', { wave: 3 });
  await t.close();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].wave, 3);
});

function play(s, { inputs, seconds }) {
  const c = { sent: [], isLocal: true, pid: 'hash-a', ipHash: 'ip', send: (o) => c.sent.push(o), close: () => {} };
  s.connect(c);
  s.message(c, JSON.stringify({ t: 'hello', token: null, nick: 'A' }));
  s.message(c, JSON.stringify({ t: 'ult', kind: 'shockwave' }));
  s.message(c, JSON.stringify({ t: 'start' }));
  for (let i = 1; i <= inputs; i++) {
    s.message(c, JSON.stringify({ t: 'input', seq: i, mx: 1, my: 0, aimX: 1, aimY: 1 }));
  }
  s.game.world.time = seconds;
  s.game.world.phase = 'over';
  s.game.overAt = seconds;
  s.tick(1 / 30);
  return c;
}

test('krótkie wejście NIE liczy się jako rozegrana partia', () => {
  const rec = recorder();
  const s = new Session({ balance, code: 'AAAA', hostPolicy: 'first', telemetry: rec, seed: 1 });
  play(s, { inputs: 5, seconds: 12 });
  const end = rec.events.find((e) => e.type === 'game_end');
  assert.equal(end.realPlay, false);
  assert.equal(end.durationS, 12);
  assert.equal(s.realGamesPlayed, 0);
  assert.equal(s.gamesPlayed, 1);
});

test('partia 60 s+ z realnym sterowaniem liczy się jako faktyczna rozgrywka', () => {
  const rec = recorder();
  const s = new Session({ balance, code: 'AAAA', hostPolicy: 'first', telemetry: rec, seed: 1 });
  play(s, { inputs: 250, seconds: 300 });
  const end = rec.events.find((e) => e.type === 'game_end');
  assert.equal(end.realPlay, true);
  assert.equal(end.inputs, 250);
  assert.equal(end.room, 'AAAA');
  assert.equal(end.players[0].pid, 'hash-a');
  assert.equal(s.realGamesPlayed, 1);
});

test('bot łomoczący w WebSocket bez grania nie produkuje zdarzeń rozgrywki', () => {
  const rec = recorder();
  const s = new Session({ balance, code: 'AAAA', hostPolicy: 'first', telemetry: rec, seed: 1 });
  const c = { sent: [], isLocal: false, pid: null, ipHash: 'bot', send: () => {}, close: () => {} };
  s.connect(c);
  for (let i = 0; i < 100; i++) s.message(c, 'śmieci-nie-json');
  s.message(c, JSON.stringify({ t: 'input', seq: 1, aimX: 1, aimY: 1 }));
  assert.equal(rec.events.length, 0);
  assert.equal(s.gameInputs, 0);
});

test('przerwana partia też raportuje koniec, z powodem', () => {
  const rec = recorder();
  const s = new Session({ balance, code: 'AAAA', hostPolicy: 'first', telemetry: rec, seed: 1 });
  play(s, { inputs: 3, seconds: 5 });
  rec.events.length = 0;
  const c2 = { sent: [], isLocal: false, pid: 'p2', ipHash: 'ip', send: () => {}, close: () => {} };
  s.connect(c2);
  s.message(c2, JSON.stringify({ t: 'hello', token: null, nick: 'B' }));
  s.close('shutdown');
  assert.ok(rec.events.some((e) => e.type === 'room_close' && e.games === 1));
});

test('zdarzenia wejścia i wyjścia gracza niosą anonimowy identyfikator', () => {
  const rec = recorder();
  const s = new Session({ balance, code: 'AAAA', hostPolicy: 'first', telemetry: rec, seed: 1, now: () => 0 });
  const c = { sent: [], isLocal: false, pid: 'hash-x', ipHash: 'hash-ip', send: () => {}, close: () => {} };
  s.connect(c);
  s.message(c, JSON.stringify({ t: 'hello', token: null, nick: 'X' }));
  const join = rec.events.find((e) => e.type === 'join');
  assert.deepEqual({ pid: join.pid, nick: join.nick, ipHash: join.ipHash }, { pid: 'hash-x', nick: 'X', ipHash: 'hash-ip' });
  s.disconnect(c);
  const leave = rec.events.find((e) => e.type === 'leave');
  assert.equal(leave.pid, 'hash-x');
  assert.equal(leave.players, 0);
});
