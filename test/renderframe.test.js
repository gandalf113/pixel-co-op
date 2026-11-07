// Klatka renderu nie moze rzucac. Do v0.12.0 nic nie uruchamialo `renderWorld` w tescie, przez co
// ReferenceError w `drawItems` (cfg poza zasiegiem w galezi `ground`) wyjechal na produkcje: gracz
// widzial ziemie i krew, a przedmioty, potwory, gracze i HUD znikaly, bo wyjatek przerywal klatke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const balance = JSON.parse(readFileSync(new URL('../public/balance.json', import.meta.url), 'utf8'));

function fakeCanvas(w = 64, h = 64) {
  const c = { width: w, height: h, getContext: () => fakeCtx(c), toDataURL: () => 'data:,' };
  return c;
}

// Kontekst, ktory zachowuje sie jak przegladarka w jednym istotnym punkcie:
// drawImage(undefined) rzuca TypeError. Bez tego test nie wykrylby brakujacego sprite'a.
function fakeCtx(canvas) {
  const ctx = {
    canvas,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    drawImage(img) {
      if (img == null) throw new TypeError('drawImage dostal undefined');
      if (typeof img.width !== 'number') throw new TypeError('drawImage dostal nie-obraz');
    },
  };
  for (const m of ['setTransform', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath',
    'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'fillRect',
    'strokeRect', 'clearRect', 'clip', 'fillText', 'strokeText', 'setLineDash', 'transform',
    'resetTransform']) ctx[m] = () => {};
  return ctx;
}

globalThis.document ??= { createElement: (t) => (t === 'canvas' ? fakeCanvas() : {}) };

const { bakeSprites } = await import('../public/client/sprites.js');
const { renderWorld, Camera } = await import('../public/client/render.js');
const { Fx } = await import('../public/client/fx.js');
const { Gore } = await import('../public/client/gore.js');

const COLORS = ['#e05a3a', '#4aa3d8', '#7bc24a', '#d8c84a'];
const sprites = bakeSprites(document, COLORS);
const MOB_TYPES = Object.keys(balance.mobs);
const ITEM_KINDS = Object.keys(balance.items);
const STATES = ['ground', 'placed', 'active', 'flying'];

function makeItem(id, kind, state) {
  return {
    id, kind, state, tx: 4 + (id % 8), ty: 4 + (id % 6), rot: id % 2,
    x: 280 + (id % 40), y: 280 + (id % 30), hp: 40, maxHp: 100,
    armed: id % 2 === 0, timeLeft: id % 2 ? 5 : 0,
    flight: state === 'flying' ? { x0: 100, y0: 100, x1: 200, y1: 200, p: 0.5 } : undefined,
  };
}

function makeGore(corpses = []) {
  const g = new Gore(balance.gore);
  for (const [type, x, y, a, wave] of corpses) g.addCorpse(type, x, y, a, wave);
  g.addSplat(300, 300, 0, 1000);
  g.addSplat(340, 320, 1, 1000);
  return g;
}

function makeView(over = {}) {
  const cam = new Camera();
  cam.follow(300, 300);
  const items = ITEM_KINDS.flatMap((kind, i) => STATES.map((st, j) => makeItem(i * 10 + j + 1, kind, st)));
  return {
    cam, balance, sprites, frame: 7, myId: 1, seed: 12345, nowMs: 5000, pxScale: 2,
    players: COLORS.map((c, i) => ({
      id: i + 1, nick: 'g' + i, color: c, x: 300 + i * 4, y: 300, angle: 0.3, hp: 70, maxHp: 100,
      state: i === 3 ? 'down' : 'alive', suspended: false, reviveProgress: 0.4, deathLeft: 12,
      invuln: 0, busy: 0, held: i === 1 ? 'wall' : null, ready: true, weaponLv: 3,
      weaponMod: ['fan', 'homing', 'nail', null][i], ammo: 12, reloadLeft: i === 2 ? 0.7 : 0,
      ult: 0.5, ultKind: 'frenzy', frenzyLeft: 0, speedMult: 1, moving: true,
    })),
    // [id, typ, x, y, hp, maxHp, stun, frozen, burn, kat, invul, telegraf]
    mobs: MOB_TYPES.map((t, i) => [100 + i, t, 290 + i * 3, 300, 20, 60, 0, 0, 0, 0.5, i % 2, i % 3 === 0 ? 90 : 0]),
    bullets: [[1, 300, 300], [2, 310, 300, 0.5, 6]],
    mobBullets: [[1, 305, 305, 0, 0, 0, 0], [2, 315, 305, 1, 400, 400, 0.2]],
    droplets: [[1, 300, 300]], rockets: [[1, 300, 300, 0.2]],
    items, gore: makeGore(MOB_TYPES.map((t, i) => [t, 290 + i * 5, 310, 0.4, 1])),
    effects: [], shakes: new Map(), fx: new Fx(), highlightId: items[0].id, ghost: null,
    ...over,
  };
}

const ctx = fakeCtx(fakeCanvas(1120, 630));

test('klatka z kazdym rodzajem bytu naraz nie rzuca', () => {
  renderWorld(ctx, makeView());
});

// Regresja wprost: przedmiot LEZACY NA ZIEMI wywalal cala klatke (cfg poza zasiegiem).
for (const kind of ITEM_KINDS) {
  for (const state of STATES) {
    test(`przedmiot ${kind} w stanie ${state} nie wywala klatki`, () => {
      renderWorld(ctx, makeView({ mobs: [], items: [makeItem(1, kind, state)] }));
    });
  }
}

for (const type of MOB_TYPES) {
  test(`potwor ${type} nie wywala klatki`, () => {
    renderWorld(ctx, makeView({ items: [], mobs: [[1, type, 300, 300, 20, 60, 0, 0, 0, 0.5, 1, 90]] }));
  });
}

for (const type of MOB_TYPES) {
  test(`trup ${type} we wszystkich stadiach nie wywala klatki`, () => {
    for (let wiek = 0; wiek <= balance.gore.corpseLifeWaves; wiek++) {
      const gore = makeGore([[type, 300, 300, 0.2, 1]]);
      gore.setWave(1 + wiek);
      renderWorld(ctx, makeView({ items: [], mobs: [], gore }));
    }
  });
}

test('pusty swiat nie rzuca', () => {
  renderWorld(ctx, makeView({ items: [], mobs: [], players: [], bullets: [], mobBullets: [], droplets: [], rockets: [], gore: makeGore() }));
});

test('podswietlony przedmiot bez sprite\'a nie wywala klatki', () => {
  const it = makeItem(1, ITEM_KINDS[0], 'ground');
  it.kind = 'przedmiot-ktorego-nie-ma';
  assert.doesNotThrow(() => renderWorld(ctx, makeView({ mobs: [], items: [it], highlightId: it.id })));
});

// Plomienie (V3-Q-04) i ciemnosc (V3-Q-05): nowa warstwa i maska nie moga wywalic klatki.
test('klatka z plomieniami i ciemnoscia renderuje sie bez wyjatku', () => {
  const canvas = fakeCanvas(560, 315);
  const ctx = canvas.getContext('2d');
  renderWorld(ctx, makeView({
    flames: [[1, 18, 18, 1], [2, 19, 18, 0.5], [3, 18, 19, 0.02]],
    dark: { alpha: 0.75, tint: '#200000', radiusTiles: 4 },
  }));
  renderWorld(ctx, makeView({ flames: [], dark: { alpha: 0.4, tint: '#000000', radiusTiles: 6, flicker: false } }));
  renderWorld(ctx, makeView({ flames: undefined, dark: null }));
});
