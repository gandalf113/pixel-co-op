// Czat pokoju + wejscie do trwajacej gry jako WIDZ (spectator).
// Widz nie zajmuje miejsca, nie ma gracza w swiecie, dostaje snapshoty i moze pisac - a jego
// wiadomosci widza grajacy. Po powrocie do lobby widz awansuje na gracza, jesli jest miejsce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../server/session.js';
import { sanitizeChat, CHAT } from '../public/shared/protocol.js';
import { balance } from './helpers.js';

let n = 0;
let clock = 1_000_000;
function mk() {
  n = 0;
  clock = 1_000_000;
  return new Session({ balance, addresses: [], seed: 1, makeToken: () => `tok${++n}`, now: () => clock });
}
function conn(isLocal = false) {
  const c = { sent: [], closed: null, isLocal, send: (o) => c.sent.push(o), close: (code, reason) => { c.closed = reason; } };
  return c;
}
const send = (s, c, o) => s.message(c, JSON.stringify(o));
const last = (c, t) => c.sent.filter((m) => m.t === t).at(-1);
const all = (c, t) => c.sent.filter((m) => m.t === t);
function join(s, nick, isLocal = true) {
  const c = conn(isLocal);
  s.connect(c);
  send(s, c, { t: 'hello', token: null, nick });
  send(s, c, { t: 'ult', kind: 'shockwave' });
  send(s, c, { t: 'ult', kind: 'heal', slot: 2 });
  return c;
}
function watch(s, nick) {
  const c = conn();
  s.connect(c);
  send(s, c, { t: 'hello', token: null, nick, spectate: true });
  return c;
}
const chats = (c) => all(c, 'chat').filter((m) => !m.system);

test('sanitizeChat: zero-width, znaki sterujace i odwracanie tekstu wylatuja, dlugosc przycieta', () => {
  assert.equal(sanitizeChat('  hej   tam  '), 'hej tam');
  assert.equal(sanitizeChat('a​b'), 'ab', 'spacja zerowej szerokosci');
  assert.equal(sanitizeChat('​​​'), null, 'sama zerowa szerokosc to pusta wiadomosc');
  assert.equal(sanitizeChat('‮odwrocone'), 'odwrocone', 'znacznik RLO wylatuje');
  assert.equal(sanitizeChat('x'.repeat(500)).length, CHAT.maxLen);
  assert.equal(sanitizeChat(42), null);
  assert.equal(sanitizeChat(null), null);
});

test('czat w lobby: wiadomosc dociera do wszystkich, z nickiem i rola', () => {
  const s = mk();
  const a = join(s, 'A');
  const b = join(s, 'B');
  send(s, a, { t: 'chat', text: 'siema' });
  const got = chats(b).at(-1);
  assert.equal(got.text, 'siema');
  assert.equal(got.from, 'A');
  assert.equal(got.role, 'player');
  assert.ok(chats(a).at(-1), 'nadawca tez widzi swoja wiadomosc');
});

test('czat: pusta i sama-zerowa-szerokosc nie ida w swiat', () => {
  const s = mk();
  const a = join(s, 'A');
  const before = chats(a).length;
  send(s, a, { t: 'chat', text: '   ' });
  send(s, a, { t: 'chat', text: '​' });
  send(s, a, { t: 'chat', text: 42 });
  assert.equal(chats(a).length, before);
});

test('czat: limit tempa tnie zalew, a po przerwie znow wolno pisac', () => {
  const s = mk();
  const a = join(s, 'A');
  const before = chats(a).length;
  for (let i = 0; i < 20; i++) send(s, a, { t: 'chat', text: `spam ${i}` });
  const burst = chats(a).length - before;
  assert.equal(burst, CHAT.burst, `pod rzad przechodzi tylko ${CHAT.burst}`);
  clock += CHAT.minIntervalMs * CHAT.burst + 10;
  send(s, a, { t: 'chat', text: 'juz mozna' });
  assert.equal(chats(a).at(-1).text, 'juz mozna');
});

test('nowy w pokoju dostaje historie czatu, ale nie wiecej niz limit', () => {
  const s = mk();
  const a = join(s, 'A');
  for (let i = 0; i < CHAT.historyMax + 20; i++) {
    clock += CHAT.minIntervalMs * CHAT.burst + 1;
    send(s, a, { t: 'chat', text: `wiadomosc ${i}` });
  }
  const b = join(s, 'B');
  const log = last(b, 'chatLog');
  assert.ok(log, 'historia przychodzi przy wejsciu');
  assert.equal(log.list.length, CHAT.historyMax);
  assert.equal(log.list.at(-1).text, `wiadomosc ${CHAT.historyMax + 19}`);
});

test('stary klient (bez spectate) dostaje stare odrzucenie "Gra w toku"', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const c = conn();
  s.connect(c);
  send(s, c, { t: 'hello', token: null, nick: 'B' });
  assert.equal(last(c, 'reject').reason, 'Gra w toku');
  assert.equal(s.spectators.length, 0);
});

test('widz wchodzi do trwajacej gry, dostaje snapshoty i nie zajmuje miejsca', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const w = watch(s, 'WIDZ');
  const hello = last(w, 'welcome');
  assert.equal(hello.spectator, true, 'klient wie, ze oglada');
  assert.equal(s.playerCount, 1, 'widz nie liczy sie do miejsc w pokoju');
  assert.equal(s.summary().spectators, 1);
  assert.equal(s.summary().players, 1);
  s.tick(0.5);
  const snap = last(w, 'snap');
  assert.ok(snap, 'widz dostaje snapshoty');
  assert.ok(snap.players.length >= 1, 'widzi grajacych');
});

test('widz pisze, a GRAJACY to widzi - z rola spectator', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const w = watch(s, 'WIDZ');
  send(s, w, { t: 'chat', text: 'uwazaj z lewej' });
  const seen = chats(a).at(-1);
  assert.equal(seen.text, 'uwazaj z lewej');
  assert.equal(seen.from, 'WIDZ');
  assert.equal(seen.role, 'spectator', 'gracz widzi, ze to widz, a nie wspolgracz');
});

test('widz nie moze grac: input, akcja, start i trudnosc sa ignorowane', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const w = watch(s, 'WIDZ');
  const before = s.gameInputs;
  send(s, w, { t: 'input', seq: 1, mx: 1, my: 0, aimX: 10, aimY: 10, fire: true });
  send(s, w, { t: 'act', a: 'e' });
  send(s, w, { t: 'difficulty', level: 4 });
  send(s, w, { t: 'toLobby' });
  assert.equal(s.gameInputs, before, 'input widza nie wchodzi do gry');
  assert.equal(s.difficulty, 2, 'widz nie zmienia trudnosci');
  assert.ok(s.game, 'widz nie konczy partii');
  assert.equal(s.game.world.players.has(w.id), false);
});

test('po powrocie do lobby widz awansuje na gracza i ma nowe id', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const w = watch(s, 'WIDZ');
  const idAsSpectator = last(w, 'welcome').id;
  assert.ok(idAsSpectator.startsWith('s'), 'widz ma wlasna przestrzen id');
  s.game.world.phase = 'over';
  s.tick(1 / 30);
  send(s, a, { t: 'toLobby' });
  const now = last(w, 'welcome');
  assert.equal(now.spectator, false, 'juz nie oglada, tylko gra');
  assert.ok(now.id.startsWith('p'), `gra pod id gracza: ${now.id}`);
  assert.equal(now.token, last(w, 'welcome').token, 'token zostaje, wiec powrot po zerwaniu lacza dziala');
  assert.equal(s.playerCount, 2);
  assert.equal(s.spectators.length, 0);
  assert.ok(last(w, 'lobby'), 'widz dostaje lobby jak kazdy gracz');
});

test('widz nie awansuje, gdy pokoj jest pelny - zostaje widzem', () => {
  const s = mk();
  const players = [];
  for (let i = 0; i < balance.session.maxPlayers; i++) players.push(join(s, `P${i}`));
  send(s, players[0], { t: 'start' });
  const w = watch(s, 'WIDZ');
  s.game.world.phase = 'over';
  s.tick(1 / 30);
  send(s, players[0], { t: 'toLobby' });
  assert.equal(s.spectators.length, 1, 'brak miejsca = dalej oglada');
  assert.equal(last(w, 'welcome').spectator, true);
});

test('do PELNEGO pokoju w lobby tez da sie wejsc jako widz', () => {
  const s = mk();
  for (let i = 0; i < balance.session.maxPlayers; i++) join(s, `P${i}`);
  const w = watch(s, 'WIDZ');
  assert.equal(last(w, 'welcome')?.spectator, true);
  assert.equal(s.spectators.length, 1);
});

test('widz, ktory sie rozlaczyl, nie zostawia po sobie widoku ani wpisu', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const w = watch(s, 'WIDZ');
  const id = last(w, 'welcome').id;
  s.tick(0.5);
  assert.ok(s.game.views.has(id), 'widok powstal');
  s.disconnect(w);
  assert.equal(s.spectators.length, 0);
  assert.equal(s.game.views.has(id), false, 'widok posprzatany');
  s.tick(0.5); // nie moze rzucic
});

test('pokoj z samym widzem nie jest od razu uznany za pusty', () => {
  const s = mk();
  let empty = 0;
  const s2 = new Session({ balance, addresses: [], seed: 1, makeToken: () => `t${++n}`, now: () => clock, onEmpty: () => { empty++; } });
  const a = conn();
  s2.connect(a);
  send(s2, a, { t: 'hello', token: null, nick: 'A' });
  send(s2, a, { t: 'ult', kind: 'shockwave' });
  send(s2, a, { t: 'start' });
  const w = conn();
  s2.connect(w);
  send(s2, w, { t: 'hello', token: null, nick: 'W', spectate: true });
  s2.message(a, JSON.stringify({ t: 'leave' }));
  assert.equal(empty, 0, 'widz jeszcze oglada, pokoj nie jest pusty');
  s2.disconnect(w);
  assert.ok(empty > 0, 'dopiero bez widza pokoj jest pusty');
});

test('wejscia i wyjscia widac na czacie jako wpisy systemowe z kluczem, nie gotowym zdaniem', () => {
  const s = mk();
  const a = join(s, 'A');
  const b = join(s, 'B');
  const sys = all(a, 'chat').filter((m) => m.system);
  assert.ok(sys.some((m) => m.system === 'chat.joined' && m.vars.nick === 'B'), 'wejscie gracza');
  assert.equal(sys.every((m) => typeof m.text === 'undefined'), true, 'systemowe nie niosa gotowego tekstu');
  send(s, b, { t: 'leave' });
  assert.ok(all(a, 'chat').some((m) => m.system === 'chat.left' && m.vars.nick === 'B'), 'wyjscie gracza');
});

test('widz dostaje ekran wynikow, a nie zamrozony obraz', () => {
  const s = mk();
  const a = join(s, 'A');
  send(s, a, { t: 'start' });
  const w = watch(s, 'WIDZ');
  s.game.world.phase = 'over';
  s.tick(1 / 30);
  const res = last(w, 'results');
  assert.ok(res, 'widz tez dostaje wyniki');
  assert.equal(res.wave, last(a, 'results').wave, 'te same wyniki co gracze');
});
