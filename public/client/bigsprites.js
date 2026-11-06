// Duze sylwetki potworow (V3-A-01): 32x32 (skradajacy sie, ninja) i 64x64 (tank). Rysowane proceduralnie na
// siatce znakow z palety sprites.js, a wynik to zwykle tablice stringow jak kazdy inny sprite. Wszystko patrzy
// w prawo (kat 0). Obrys 'K' dokladany automatycznie.

function grid(n) {
  return { n, p: Array.from({ length: n }, () => Array(n).fill('.')) };
}

function put(g, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < g.n && y < g.n) g.p[y][x] = c;
}

// Elipsa; kolor wybiera fn(nx, ny) w zakresie -1..1 (null = nie rysuj).
function ellipse(g, cx, cy, rx, ry, fn) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = typeof fn === 'string' ? fn : fn(nx, ny, x, y);
      if (c) put(g, x, y, c);
    }
  }
}

// Swiatlo z lewej gory: jasny, sredni i ciemny ton.
const shaded = ([hi, mid, lo]) => (nx, ny) => {
  const v = -0.55 * nx - 0.75 * ny;
  return v > 0.35 ? hi : v > -0.3 ? mid : lo;
};

function line(g, x0, y0, x1, y1, w, c) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) || 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (w <= 1) put(g, x, y, c);
    else ellipse(g, x, y, w / 2, w / 2, c);
  }
}

function rect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c);
}

function outline(g) {
  const src = g.p.map((r) => r.slice());
  for (let y = 0; y < g.n; y++) {
    for (let x = 0; x < g.n; x++) {
      if (src[y][x] !== '.') continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if ((src[y + dy]?.[x + dx] ?? '.') !== '.') {
          g.p[y][x] = 'K';
          break;
        }
      }
    }
  }
  return g.p.map((r) => r.join(''));
}

// --- Tank: wzdety kolos ze zlomu --------------------------------------------------------------
// Cialo z bladego miesa (B/b/d - te znaki zmieniaja kolor wraz z utrata HP), na barkach spawane naramienniki,
// na plecach garb z blach i rur, malutka glowa z czerwonymi slepiami. `swing` = faza kroku (0/1).
export function tankRows(swing) {
  const g = grid(64);
  const bob = swing ? 1 : 0;
  // rury wydechowe na plecach
  for (const y of [20, 31, 42]) {
    line(g, 4, y + bob, 14, y + bob, 3, 'g');
    rect(g, 3, y - 1 + bob, 4, y + 1 + bob, 'o');
  }
  // rece: z barkow do piesci
  const fy = swing ? 5 : 0;
  line(g, 36, 15, 52, 14 + fy, 9, 'b');
  line(g, 36, 49, 52, 50 - fy, 9, 'b');
  ellipse(g, 54, 14 + fy, 8, 7, shaded(['B', 'b', 'd']));
  ellipse(g, 54, 50 - fy, 8, 7, shaded(['B', 'b', 'd']));
  for (const [x, y] of [[60, 11 + fy], [61, 15 + fy], [60, 19 + fy], [60, 45 - fy], [61, 49 - fy], [60, 53 - fy]]) {
    rect(g, x - 1, y - 1, x + 1, y + 1, 'S');
  }
  // korpus
  ellipse(g, 30, 32 + bob, 21, 23, shaded(['B', 'b', 'd']));
  // garb z lataniny
  ellipse(g, 17, 32 + bob, 11, 15, shaded(['x', 'u', 'v']));
  for (const [x, y] of [[10, 26], [14, 22], [14, 42], [20, 32], [10, 38], [22, 24], [22, 40]]) put(g, x, y + bob, 'y');
  line(g, 8, 30 + bob, 24, 34 + bob, 1, 'K');
  line(g, 11, 22 + bob, 22, 24 + bob, 1, 'K');
  // pasy blachy na piersi
  for (const x of [28, 33]) rect(g, x, 20 + bob, x + 2, 44 + bob, 'u');
  rect(g, 28, 20 + bob, 28, 44 + bob, 'x');
  rect(g, 33, 20 + bob, 33, 44 + bob, 'x');
  for (const y of [24, 32, 40]) {
    put(g, 29, y + bob, 'S');
    put(g, 34, y + bob, 'S');
  }
  // blizny i sluz
  for (const [x, y] of [[26, 18], [27, 19], [38, 46], [39, 47], [24, 46], [40, 20]]) put(g, x, y + bob, 'R');
  for (const [x, y] of [[22, 46], [23, 47], [38, 17]]) put(g, x, y + bob, 'l');
  // naramienniki
  for (const sy of [13, 51]) {
    ellipse(g, 36, sy, 11, 9, shaded(['S', 's', 'g']));
    ellipse(g, 36, sy, 7, 5, shaded(['s', 'g', 'G']));
    put(g, 30, sy - 5, 'y');
    put(g, 42, sy - 5, 'y');
    put(g, 30, sy + 5, 'y');
    put(g, 42, sy + 5, 'y');
    put(g, 36, sy + (sy < 32 ? -9 : 9), 'o');
  }
  // glowa: malutka, wciagnieta w bark, z paszcza i czerwonymi slepiami
  ellipse(g, 46, 32 + bob, 8, 7, shaded(['B', 'b', 'd']));
  rect(g, 50, 29 + bob, 52, 30 + bob, 'r');
  rect(g, 50, 34 + bob, 52, 35 + bob, 'r');
  rect(g, 50, 31 + bob, 52, 33 + bob, 'K');
  for (const y of [31, 33]) put(g, 52, y + bob, 'W');
  return outline(g);
}

const FLESH = new Set(['B', 'b', 'd']);

// Stan zuzycia tanka (1-3): ciemniejszy -> sine plamy -> poczernialy. Zmienia sie tylko cialo, blacha zostaje.
export function tankWear(rows, stage) {
  const map = [
    null,
    { B: 'b', b: 'd', d: 'v' },
    { B: 'b', b: 'd', d: 'v' },
    { B: 'G', b: 'n', d: 'K' },
  ][stage];
  return rows.map((row, y) => [...row].map((ch, x) => {
    if (!FLESH.has(ch)) return ch;
    if (stage === 2 && (Math.floor(x / 3) * 5 + Math.floor(y / 3) * 7) % 4 === 0) return { B: 'N', b: 'e', d: 'M' }[ch];
    return map[ch];
  }).join(''));
}

// --- Skradajacy sie: chudy, zakapturowany pajak w strzepach plaszcza ----------------------------
export function stalkerRows(frame) {
  const g = grid(32);
  const a = frame ? 3 : 0;
  // tylne konczyny
  line(g, 9, 12, 3, 5 + a, 1, 'm');
  line(g, 9, 20, 3, 27 - a, 1, 'm');
  line(g, 3, 5 + a, 1, 8 + a, 1, 'W');
  line(g, 3, 27 - a, 1, 24 - a, 1, 'W');
  // postrzepiony plaszcz zostajacy z tylu
  for (let i = 0; i < 6; i++) {
    const y = 8 + i * 3 + (i % 2 ? (frame ? 1 : -1) : 0);
    line(g, 4 + (i % 3), y, 12, y, 1, i % 2 ? 'M' : 'm');
  }
  ellipse(g, 15, 16, 9, 6, shaded(['m', 'M', 'n']));
  // przednie rece z pazurami
  line(g, 18, 10, 28, 4 + a, 2, 'M');
  line(g, 18, 22, 28, 28 - a, 2, 'M');
  for (const [x, y] of [[29, 3 + a], [30, 5 + a], [29, 29 - a], [30, 27 - a]]) put(g, x, y, 'W');
  // kaptur i kościana maska
  ellipse(g, 23, 16, 6, 6, shaded(['M', 'n', 'K']));
  ellipse(g, 25, 16, 4, 4.5, shaded(['W', 'W', 'S']));
  put(g, 26, 14, 'y');
  put(g, 26, 18, 'y');
  put(g, 27, 14, 'y');
  put(g, 27, 18, 'y');
  rect(g, 28, 15, 28, 17, 'K');
  put(g, 14, 12, 'R');
  put(g, 12, 20, 'R');
  return outline(g);
}

// --- Ninja: niski, plaski, z dwoma ostrzami wyciagnietymi przed siebie i dlugim czerwonym szalem ----
export function ninjaRows(frame) {
  const g = grid(32);
  const w = frame ? 2 : -2;
  // szal falujacy za plecami
  for (let i = 0; i < 12; i++) {
    const y = 16 + Math.round(Math.sin(i * 0.9 + (frame ? 1.6 : 0)) * (1 + i * 0.25)) + (i > 8 ? w / 2 : 0);
    put(g, 10 - i, y, 'r');
    put(g, 10 - i, y + 1, 'R');
  }
  // nogi
  line(g, 11, 12, 6, 8 - (frame ? 2 : 0), 2, 'G');
  line(g, 11, 20, 6, 24 + (frame ? 2 : 0), 2, 'G');
  ellipse(g, 15, 16, 7, 6, shaded(['g', 'G', 'n']));
  rect(g, 12, 13, 12, 19, 'r');
  // ostrza: dlugie, jasne, rozchylone w "V"
  line(g, 19, 10, 31, 2 + (frame ? 1 : 0), 1, 'S');
  line(g, 19, 22, 31, 30 - (frame ? 1 : 0), 1, 'S');
  line(g, 20, 9, 30, 3 + (frame ? 1 : 0), 1, 'W');
  line(g, 20, 23, 30, 29 - (frame ? 1 : 0), 1, 'W');
  ellipse(g, 19, 10, 2, 2, 'f');
  ellipse(g, 19, 22, 2, 2, 'f');
  // glowa: kaptur z czerwona opaska i zolta szczelina oczu
  ellipse(g, 21, 16, 5, 5, shaded(['G', 'n', 'K']));
  rect(g, 18, 15, 25, 15, 'r');
  rect(g, 23, 16, 25, 17, 'y');
  put(g, 14, 13, 'R');
  put(g, 16, 19, 'R');
  return outline(g);
}

// --- Przedmioty 2 x 2 kafelki (V3-D-08): kolce i klatka, 32x32 ---------------------------------

// Kolce: zardzewiala plyta z szachownica stalowych szpikulcow (jasny czubek, ciemny cien), slad krwi, nity w rogach.
export function spikesRows() {
  const g = grid(32);
  rect(g, 1, 1, 30, 30, 'K');
  rect(g, 2, 2, 29, 29, 'G');
  rect(g, 2, 2, 29, 2, 'g');
  rect(g, 2, 2, 2, 29, 'g');
  for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27]]) {
    rect(g, x - 1, y - 1, x, y, 's');
    put(g, x, y, 'x');
  }
  // szpikulce: 4 x 4, piramidka z lewym swiatlem
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = 7 + col * 6;
      const cy = 7 + row * 6;
      put(g, cx, cy - 2, 'S');
      rect(g, cx - 1, cy - 1, cx, cy, 'S');
      rect(g, cx + 1, cy - 1, cx + 1, cy + 1, 's');
      rect(g, cx - 2, cy + 1, cx, cy + 1, 's');
      rect(g, cx - 2, cy + 2, cx + 1, cy + 2, 'K');
    }
  }
  for (const [x, y] of [[9, 12], [10, 13], [22, 20], [23, 21], [16, 27], [6, 22]]) put(g, x, y, 'r');
  for (const [x, y] of [[13, 4], [20, 28], [28, 14]]) put(g, x, y, 'o');
  return g.p.map((r) => r.join(''));
}

// Klatka: stan 0 = otwarta (prety podniesione, lampka zielona-zolta), stan 1 = zamknieta (pelna krata, lampka czerwona).
export function cageRows(closed) {
  const g = grid(32);
  rect(g, 1, 1, 30, 30, 'K');
  rect(g, 2, 2, 29, 29, 'n');
  // rama
  rect(g, 2, 2, 29, 4, 'g');
  rect(g, 2, 27, 29, 29, 'g');
  rect(g, 2, 2, 4, 29, 'g');
  rect(g, 27, 2, 29, 29, 'g');
  rect(g, 2, 2, 29, 2, 'S');
  rect(g, 2, 2, 2, 29, 'S');
  rect(g, 5, 5, 26, 26, 'G');
  if (closed) {
    for (let x = 7; x <= 24; x += 4) {
      rect(g, x, 5, x + 1, 26, 's');
      rect(g, x, 5, x, 26, 'S');
    }
    for (const y of [10, 20]) rect(g, 5, y, 26, y + 1, 'g');
  } else {
    // prety uniesione: tylko stercza krotkie kikuty u gornej belki, wnetrze puste i ciemne
    for (let x = 7; x <= 24; x += 4) rect(g, x, 5, x + 1, 8, 's');
    for (const [x, y] of [[10, 18], [11, 19], [18, 14], [19, 22]]) put(g, x, y, 'g');
  }
  for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28]]) put(g, x, y, 'y');
  rect(g, 14, 27, 17, 28, closed ? 'r' : 'y');
  return g.p.map((r) => r.join(''));
}
