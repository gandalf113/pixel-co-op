// Naklada czatu W TRAKCIE GRY: to ona sprawia, ze wiadomosc widza widzi grajacy.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeCtx(w = 1120, h = 630) {
  const calls = [];
  const ctx = {
    canvas: { width: w, height: h }, calls, globalAlpha: 1,
    measureText: (s) => ({ width: String(s).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    drawImage(img) { if (img == null) throw new TypeError('drawImage dostal undefined'); },
    fillText(s, x, y) { calls.push({ text: String(s), x, y, color: ctx.fillStyle, alpha: ctx.globalAlpha }); },
    fillRect() {},
  };
  for (const m of ['setTransform', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'strokeRect', 'clearRect', 'clip', 'strokeText']) ctx[m] = () => {};
  return ctx;
}
globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => fakeCtx() }) };

const { renderHud } = await import('../public/client/hud.js');
const { CHAT } = await import('../public/shared/protocol.js');
const i18n = await import('../public/client/i18n.js');
const { balance } = await import('./helpers.js');

const NOW = 100000;
function draw(chat, nowMs = NOW) {
  const ctx = fakeCtx();
  renderHud(ctx, 2, {
    snap: { phase: 'wave', wave: 3, mobsLeft: 0, breakLeft: 0, mobs: [], items: [], players: [], you: { id: 'p1' } },
    balance, sprites: new Map(), cam: { worldToView: (x, y) => ({ x, y }) },
    me: null, players: [], nowMs, status: 'playing', chat,
  });
  return ctx.calls;
}
const said = (calls, needle) => calls.some((c) => c.text.includes(needle));

test('wiadomosc widza pojawia sie na ekranie grajacego, z plakietka', () => {
  i18n.setLang('pl');
  const calls = draw([{ from: 'WIDZ', role: 'spectator', text: 'uwazaj z lewej', at: NOW - 500 }]);
  assert.ok(said(calls, 'uwazaj z lewej'), 'tresc narysowana');
  assert.ok(said(calls, 'widz'), 'widac, ze to widz');
  assert.ok(said(calls, 'WIDZ:'), 'widac, kto pisal');
});

test('wiadomosc gracza nie dostaje plakietki widza', () => {
  const calls = draw([{ from: 'A', role: 'player', text: 'buduje sciane', at: NOW - 500 }]);
  assert.ok(said(calls, 'buduje sciane'));
  assert.equal(said(calls, '[widz]'), false);
});

test('wiadomosci gasna: po liveMs juz ich nie ma, a w ostatniej sekundzie bledna', () => {
  const swieza = draw([{ from: 'A', role: 'player', text: 'nowa', at: NOW - 100 }]);
  assert.equal(swieza.find((c) => c.text.includes('nowa')).alpha, 1);
  const gasnaca = draw([{ from: 'A', role: 'player', text: 'stara', at: NOW - (CHAT.liveMs - 400) }]);
  const a = gasnaca.find((c) => c.text.includes('stara')).alpha;
  assert.ok(a > 0 && a < 1, `w trakcie zanikania: ${a}`);
  const martwa = draw([{ from: 'A', role: 'player', text: 'przeterminowana', at: NOW - CHAT.liveMs - 1 }]);
  assert.equal(martwa.find((c) => c.text.includes('przeterminowana'))?.alpha ?? 0, 0);
});

test('wpis systemowy na ekranie jest w jezyku gracza', () => {
  i18n.setLang('en');
  assert.ok(said(draw([{ system: 'chat.watching', vars: { nick: 'Z' }, at: NOW }]), 'Z is watching'));
  i18n.setLang('pl');
  assert.ok(said(draw([{ system: 'chat.watching', vars: { nick: 'Z' }, at: NOW }]), 'Z ogląda'));
});

test('brak czatu nie wywala klatki', () => {
  assert.doesNotThrow(() => draw([]));
  assert.doesNotThrow(() => draw(undefined));
});

test('wiele wiadomosci nie nachodzi na siebie i miesci sie na ekranie', () => {
  const chat = Array.from({ length: CHAT.liveMax }, (_, i) => ({ from: 'A', role: 'player', text: `linia ${i}`, at: NOW - 100 }));
  const calls = draw(chat);
  const ys = chat.map((_, i) => calls.find((c) => c.text.includes(`linia ${i}`)).y);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], 'kazda kolejna nizej');
  assert.ok(Math.min(...ys) > 0 && Math.max(...ys) < 630, `miesci sie w ekranie: ${ys.join(', ')}`);
});
