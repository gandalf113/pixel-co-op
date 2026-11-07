// Logotyp "PIXEL CO-OP" (V3-K-06): bitmapowe litery 5x7 rysowane z kodu, zloto z ciemniejacym dolem,
// czarny obrys 1 px i cien. Zero fontow z sieci (PRD-CON-01/05). Testowalne atrapa kontekstu 2D.

export const GLYPHS = {
  P: ['###..', '#..#.', '#..#.', '###..', '#....', '#....', '#....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export const LOGO_TEXT = 'PIXEL CO-OP';
export const LOGO_PX = 6;
const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1;
const PAD = 2; // obrys + cien

// Kolory wierszy: jasne zloto u gory, miedz na dole - jak metalowa plakietka.
const ROWS = ['#fff0b0', '#ffe07a', '#d9b53a', '#d9b53a', '#c48a2e', '#b5652a', '#8c4a1e'];

export function logoSize(text = LOGO_TEXT, px = LOGO_PX) {
  const cells = text.length * (GLYPH_W + GAP) - GAP;
  return { w: cells * px + PAD * 2 + px, h: GLYPH_H * px + PAD * 2 + px };
}

function cells(text) {
  const out = [];
  let cx = 0;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) if (g[y][x] === '#') out.push([cx + x, y]);
    }
    cx += GLYPH_W + GAP;
  }
  return out;
}

// Rysuje napis w (0,0) kontekstu. Zwraca rozmiar.
export function drawLogo(ctx, text = LOGO_TEXT, px = LOGO_PX) {
  const size = logoSize(text, px);
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
  const pts = cells(text);
  const at = (x, y) => [PAD + x * px, PAD + y * px];
  // cien: przesuniety o jeden piksel logiczny w dol i w prawo
  ctx.fillStyle = '#0b0a09';
  for (const [x, y] of pts) {
    const [sx, sy] = at(x, y);
    ctx.fillRect(sx + px, sy + px, px, px);
  }
  // obrys: czarna otoczka 2 px (wyglada jak 1 px przy 6x powiekszeniu)
  ctx.fillStyle = '#000';
  for (const [x, y] of pts) {
    const [sx, sy] = at(x, y);
    ctx.fillRect(sx - 2, sy - 2, px + 4, px + 4);
  }
  for (const [x, y] of pts) {
    const [sx, sy] = at(x, y);
    ctx.fillStyle = ROWS[y];
    ctx.fillRect(sx, sy, px, px);
  }
  // blik: jasna kropka w lewym gornym rogu kazdego piksela gornych wierszy
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [x, y] of pts) {
    if (y > 1) continue;
    const [sx, sy] = at(x, y);
    ctx.fillRect(sx, sy, Math.max(1, px / 3), Math.max(1, px / 3));
  }
  return size;
}
