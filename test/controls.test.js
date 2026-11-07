import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawControls, CONTROL_ROWS, CONTROLS_SIZE } from '../public/client/controls.js';

// Atrapa kontekstu 2D: zlicza wywołania, nie dotyka DOM ani globalnego `document`.
function fakeCtx() {
  const calls = { fillRect: 0, fillText: [] };
  return {
    calls,
    fillRect: () => { calls.fillRect++; },
    fillText: (t) => { calls.fillText.push(t); },
  };
}

test('drawControls rysuje klawiatury, mysz i opisy akcji bez wyjątku', () => {
  const ctx = fakeCtx();
  drawControls(ctx);
  assert.ok(ctx.calls.fillRect > 30);
  for (const k of ['W', 'A', 'S', 'D', 'E', 'R', 'Q', 'F', 'G', 'SPACJA']) assert.ok(ctx.calls.fillText.includes(k), k);
  for (const [, , keys, text] of CONTROL_ROWS) {
    assert.ok(ctx.calls.fillText.includes(keys), keys);
    assert.ok(ctx.calls.fillText.includes(text), text);
  }
  assert.ok(CONTROLS_SIZE.w > 0 && CONTROLS_SIZE.h > 0);
});

// V3-K-07: trzymany klawisz jest podswietlony na bialo (poligon).
test('drawControls z pressed podswietla wskazane klawisze i przyciski myszy', () => {
  const fills = [];
  const ctx = {
    set fillStyle(v) { fills.push(v); },
    fillRect() {}, fillText() {},
  };
  drawControls(ctx);
  const plain = fills.filter((f) => f === '#ffffff').length;
  fills.length = 0;
  drawControls(ctx, new Set(['W', 'SPACJA', 'LPM', 'kółko']));
  const hot = fills.filter((f) => f === '#ffffff').length;
  assert.ok(hot >= plain + 4, `bialych wypelnien: ${hot} vs ${plain}`);
});
