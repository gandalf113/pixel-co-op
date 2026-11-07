// Ekran "Sterowanie" (V3-K-04): klawiatura i mysz rysowane z kodu na przekazanym kontekście 2D.
// Zero assetów z sieci (PRD-CON-01/05), zero dostępu do `document` — da się testować atrapą kontekstu.
// Opisy akcji pochodzą z kodu: input.js (mapowanie), session.js #act, items.js handleAction, game.js action.

export const CONTROLS_SIZE = { w: 620, h: 316 };

const COL = {
  move: '#6fb36f', use: '#d9b53a', drop: '#b5652a', rot: '#6fc7c9',
  fire: '#a8321f', ult: '#a06fd0', ready: '#7fa6e0', misc: '#a39b8c',
};

// [id, kolor, klawisze/przyciski na obrazku, tekst akcji]
export const CONTROL_ROWS = [
  ['move', COL.move, 'W A S D', 'ruch (po śmierci A / D: kolejny obserwowany gracz)'],
  ['use', COL.use, 'E', 'podnieś przedmiot; trzymany: postaw lub użyj'],
  ['drop', COL.drop, 'R', 'odłóż trzymany; puste ręce: przeładuj'],
  ['rot', COL.rot, 'Q / kółko', 'obróć trzymaną ścianę'],
  ['fire', COL.fire, 'Spacja / LPM', 'strzał; z przedmiotem w rękach: rzut'],
  ['spec', COL.misc, 'PPM', 'po śmierci: następny obserwowany gracz'],
  ['ult', COL.ult, 'F / C', 'ULTIMATE 1 / ULTIMATE 2 (wspólny pasek)'],
  ['ready', COL.ready, 'G', 'gotowy (w przerwie między falami)'],
  ['tab', COL.misc, 'Tab', 'tablica wyników (przytrzymaj)'],
  ['esc', COL.misc, 'Esc', 'pauza'],
];

// `hot` = klawisz trzymany w tej chwili (poligon, V3-K-07): wcisniety w dol i rozjasniony.
function key(ctx, x, y, w, h, label, color, hot = false) {
  const lit = !!color;
  ctx.fillStyle = hot ? '#fff6d0' : '#0c0b09';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hot ? '#ffffff' : lit ? color : '#3b342d';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 6);
  ctx.fillStyle = lit ? 'rgba(255,255,255,0.28)' : '#4a4238';
  ctx.fillRect(x + 2, y + 2, w - 4, 3);
  ctx.fillStyle = lit ? 'rgba(0,0,0,0.35)' : '#2a2520';
  ctx.fillRect(x + 2, y + h - 7, w - 4, 3);
  ctx.fillStyle = lit ? '#14120f' : '#7d766b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(label, x + w / 2, y + h / 2 - 2);
}

function mouse(ctx, x, y, pressed) {
  ctx.fillStyle = '#0c0b09';
  ctx.fillRect(x, y, 64, 92);
  ctx.fillRect(x + 4, y - 4, 56, 4);
  ctx.fillRect(x + 4, y + 92, 56, 4);
  ctx.fillStyle = '#3b342d';
  ctx.fillRect(x + 4, y + 4, 56, 84);
  ctx.fillStyle = pressed.has('LPM') ? '#ffffff' : COL.fire;
  ctx.fillRect(x + 4, y + 4, 25, 36);
  ctx.fillStyle = pressed.has('PPM') ? '#ffffff' : COL.misc;
  ctx.fillRect(x + 35, y + 4, 25, 36);
  ctx.fillStyle = pressed.has('kółko') ? '#ffffff' : COL.rot;
  ctx.fillRect(x + 28, y + 8, 8, 26);
  ctx.fillStyle = '#0c0b09';
  ctx.fillRect(x + 4, y + 40, 56, 3);
  ctx.fillRect(x + 29, y + 4, 2, 36);
  ctx.fillRect(x + 33, y + 4, 2, 36);
  ctx.fillStyle = '#14120f';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('L', x + 16, y + 22);
  ctx.fillText('P', x + 47, y + 22);
}

// Rysuje całość w obszarze CONTROLS_SIZE. Nic nie czyta z globali.
// `pressed` = zbiór etykiet trzymanych w tej chwili ('W', 'SPACJA', 'LPM', 'kółko'...), poligon V3-K-07.
export function drawControls(ctx, pressed = new Set()) {
  const { w, h } = CONTROLS_SIZE;
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#17150f';
  ctx.fillRect(0, 0, w, h);

  // Klawiatura: tylko klawisze, które coś robią.
  const k = 38;
  const x0 = 8;
  const K = (x, y, kw, label, color) => key(ctx, x, y, kw, k, label, color, pressed.has(label));
  K(x0, 12, 52, 'Tab', COL.misc);
  K(x0 + 56, 12, k, 'Q', COL.rot);
  K(x0 + 56 + 42, 12, k, 'W', COL.move);
  K(x0 + 56 + 84, 12, k, 'E', COL.use);
  K(x0 + 56 + 126, 12, k, 'R', COL.drop);
  K(x0 + 12, 56, k, 'A', COL.move);
  K(x0 + 12 + 42, 56, k, 'S', COL.move);
  K(x0 + 12 + 84, 56, k, 'D', COL.move);
  K(x0 + 12 + 126, 56, k, 'F', COL.ult);
  K(x0 + 12 + 168, 56, k, 'G', COL.ready);
  K(x0 + 12 + 210, 56, k, 'C', COL.ult);
  K(x0 + 56, 100, 168, 'SPACJA', COL.fire);
  K(x0, 100, 48, 'Esc', COL.misc);
  mouse(ctx, 40, 176, pressed);
  ctx.fillStyle = '#a39b8c';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('LPM = Spacja · kółko = Q', 120, 204);
  ctx.fillText('PPM: obserwowanie', 120, 224);

  // Legenda: kolor klawisza -> akcja.
  const lx = 276;
  let y = 14;
  for (const [, color, keys, text] of CONTROL_ROWS) {
    ctx.fillStyle = color;
    ctx.fillRect(lx, y, 10, 10);
    ctx.fillStyle = '#e8e2d4';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(keys, lx + 18, y - 1);
    ctx.fillStyle = '#a39b8c';
    ctx.font = '11px monospace';
    ctx.fillText(text, lx + 18, y + 13);
    y += 30;
  }
}
