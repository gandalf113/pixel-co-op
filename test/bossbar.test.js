// Pasek HP bossa na gorze ekranu (MOB-06) i odpornosc klatki na potwora bez sprite'a.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeCtx(w = 1120, h = 630) {
  const calls = [];
  const ctx = {
    canvas: { width: w, height: h }, calls,
    measureText: (s) => ({ width: String(s).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    drawImage(img) { if (img == null) throw new TypeError('drawImage dostal undefined'); },
    fillText(s, x, y) { calls.push(['text', String(s), x, y]); },
    fillRect(x, y, ww, hh) { calls.push(['rect', ctx.fillStyle, x, y, ww, hh]); },
  };
  for (const m of ['setTransform', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'arc', 'ellipse', 'rect', 'fill', 'stroke', 'strokeRect', 'clearRect', 'clip', 'strokeText']) ctx[m] = () => {};
  return ctx;
}
globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => fakeCtx() }) };

const { renderHud } = await import('../public/client/hud.js');
const { MV } = await import('../public/shared/mobview.js');
const { balance } = await import('./helpers.js');

const mob = (id, type, hp, maxHp) => { const m = []; m[MV.id] = id; m[MV.type] = type; m[MV.x] = 100; m[MV.y] = 100; m[MV.hp] = hp; m[MV.maxHp] = maxHp; return m; };

function state(mobs, over = {}) {
  return {
    snap: { phase: 'wave', wave: 5, mobsLeft: mobs.length, breakLeft: 0, mobs, items: [], players: [], you: { id: 1 } },
    balance, sprites: new Map(), cam: { worldToView: (x, y) => ({ x, y }) }, me: null, players: [], nowMs: 1000, status: 'playing',
    ...over,
  };
}

const bossTexts = (ctx) => ctx.calls.filter((c) => c[0] === 'text' && /BOSS|\d+%/.test(c[1]));
const BAR_RED = '#a8321f';
const redRects = (ctx) => ctx.calls.filter((c) => c[0] === 'rect' && c[1] === BAR_RED);

test('pasek bossa pojawia się, gdy wśród potworów jest boss: nazwa, ułamek, wypełnienie proporcjonalne do HP', () => {
  const ctx = fakeCtx();
  renderHud(ctx, 2, state([mob(1, 'slime', 10, 10), mob(2, 'boss', 600, 1200)]));
  const t = bossTexts(ctx).map((c) => c[1]);
  assert.ok(t.some((x) => x.includes('BOSS')), `nazwa: ${t}`);
  assert.ok(t.some((x) => x.includes('600 / 1200') && x.includes('50%')), `ułamek: ${t}`);
  const fill = redRects(ctx).at(-1);
  const track = ctx.calls.find((c) => c[0] === 'rect' && c[1] === '#3b342d');
  assert.ok(fill && track);
  assert.equal(fill[4], Math.round(track[4] * 0.5));
});

test('bez bossa pasek się nie rysuje i nie ma po nim śladu', () => {
  const ctx = fakeCtx();
  renderHud(ctx, 2, state([mob(1, 'slime', 10, 10), mob(2, 'runner', 5, 10)]));
  assert.equal(bossTexts(ctx).length, 0);
  assert.equal(redRects(ctx).length, 0);
  const empty = fakeCtx();
  renderHud(empty, 2, state([]));
  assert.equal(bossTexts(empty).length, 0);
});

test('pasek działa przy ułamkowej skali, przy hp 0 i przy maxHp 0', () => {
  for (const scale of [1, 1.5, 2.25, 3.4]) {
    const ctx = fakeCtx(Math.round(560 * scale), Math.round(315 * scale));
    assert.doesNotThrow(() => renderHud(ctx, scale, state([mob(1, 'boss', 0, 1200)])));
    assert.ok(bossTexts(ctx).length > 0);
    const bad = fakeCtx();
    assert.doesNotThrow(() => renderHud(bad, scale, state([mob(1, 'boss', 5, 0)])));
    assert.equal(bossTexts(bad).length, 0, 'maxHp 0 = brak paska, nie NaN');
  }
});

test('pasek bossa przesuwa linie pod spodem zamiast się z nimi nakładać', () => {
  const players = [{ id: 2, nick: 'x', color: '#fff', suspended: true, state: 'alive', x: 0, y: 0, hp: 1, maxHp: 1 }];
  const withBoss = fakeCtx();
  const none = fakeCtx();
  const mk = (mobs) => { const s = state(mobs); s.snap.players = players; return s; };
  renderHud(withBoss, 2, mk([mob(1, 'boss', 1, 2)]));
  renderHud(none, 2, mk([]));
  const y = (ctx) => ctx.calls.find((c) => c[0] === 'text' && c[1].includes('wraca'))[3];
  assert.ok(y(withBoss) > y(none));
});

test('klatka z potworem bez sprite\'a nie rzuca (strażnik w drawMobs)', async () => {
  const { drawMobs, Camera } = await import('../public/client/render.js');
  const ctx = fakeCtx();
  const view = {
    cam: new Camera(), balance: { ...balance, mobs: { ...balance.mobs, boss: { radiusPx: 28, wear: true }, swarm: { radiusPx: 4 } } },
    sprites: new Map(), frame: 3, nowMs: 1, fx: null,
    mobs: [mob(1, 'boss', 10, 20), mob(2, 'swarm', 5, 10)],
  };
  assert.doesNotThrow(() => drawMobs(ctx, view, 0, 0));
});
