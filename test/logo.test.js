import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawLogo, logoSize, GLYPHS, LOGO_TEXT } from '../public/client/logo.js';

test('logo: kazdy znak napisu ma glif 5x7, rozmiar liczy sie z liter', () => {
  for (const ch of LOGO_TEXT) {
    const g = GLYPHS[ch];
    assert.ok(g, `glif ${JSON.stringify(ch)}`);
    assert.equal(g.length, 7);
    for (const row of g) assert.equal(row.length, 5);
  }
  const s = logoSize();
  assert.ok(s.w > 300 && s.w < 500, `szerokosc ${s.w}`);
  assert.ok(s.h > 40 && s.h < 60, `wysokosc ${s.h}`);
});

test('logo: rysuje piksele w obrebie rozmiaru, zlotem i z obrysem', () => {
  const rects = [];
  const fills = new Set();
  const ctx = {
    set fillStyle(v) { fills.add(v); this._f = v; },
    get fillStyle() { return this._f; },
    fillRect: (x, y, w, h) => rects.push([x, y, w, h]),
  };
  const s = drawLogo(ctx);
  assert.ok(rects.length > 100);
  for (const [x, y, w, h] of rects) {
    assert.ok(x >= -2 && y >= -2 && x + w <= s.w + 2 && y + h <= s.h + 2, `prostokat poza logo: ${x},${y},${w},${h}`);
  }
  assert.ok(fills.has('#d9b53a'), 'zloto z palety');
  assert.ok(fills.has('#000'), 'obrys');
});
