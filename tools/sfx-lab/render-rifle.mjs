// Offline renderer wariantow dzwieku karabinu. Uzycie: node tools/sfx-lab/render-rifle.mjs
// Wyjscie: tools/sfx-lab/out/NN_<body>__<reverb>.wav (stereo, 44.1 kHz, 16 bit) + INDEX.md
// Sekwencja w kazdym pliku: 1 s cisza, strzal, 2 s, strzal, 2 s, seria 8 strzalow co 0.14 s (jak w grze), 2.5 s wybrzmienia.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const FIRE_INTERVAL = 0.14; // balance.json rifle.fireIntervalS
const DETUNE = 0.07; // jak w sfx.js
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');

// ---------- deterministyczny RNG ----------
let seed = 12345;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// ---------- biquad (RBJ) ----------
class Biquad {
  constructor(type, f, q = 0.7071) { this.type = type; this.set(f, q); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(f, q) {
    f = Math.min(SR * 0.45, Math.max(10, f));
    const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // bp (constant skirt gain)
    a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// ---------- synteza jednej warstwy (semantyka jak RECIPES w sfx.js) ----------
// l: { n:'white'|'brown' | t:'sine'|'square'|'triangle', f0,f1, dur, at, a, level, hp, lp, lpTo, bp, bpTo, q, tail }
function renderLayer(l, pitch) {
  const at = l.at || 0, dur = l.dur, tail = l.tail || 0;
  const n = Math.ceil((at + dur + tail + 0.01) * SR);
  const out = new Float64Array(n);
  const start = Math.floor(at * SR);
  const attack = Math.max(1, Math.floor((l.a ?? 0.002) * SR));
  const durN = Math.max(1, Math.floor(dur * SR));
  const hp = l.hp ? new Biquad('hp', l.hp * pitch, l.q || 0.7071) : null;
  const lp = l.lp ? new Biquad('lp', l.lp * pitch, l.lpQ || 0.7071) : null;
  const bp = l.bp ? new Biquad('bp', l.bp * pitch, l.q || 1) : null;
  let brown = 0, phase = 0;
  for (let i = 0; i < durN + tail * SR && start + i < n; i++) {
    const u = i / durN; // 0..1 w trakcie dur
    let x;
    if (l.n === 'white') x = rnd() * 2 - 1;
    else if (l.n === 'brown') { brown = (brown + 0.02 * (rnd() * 2 - 1)) / 1.02; x = brown * 3.5; }
    else {
      const f0 = (l.f0 || 440) * pitch, f1 = (l.f1 || l.f0 || 440) * pitch;
      const f = f0 * Math.pow(f1 / f0, Math.min(1, u));
      phase += 2 * Math.PI * f / SR;
      const p = phase % (2 * Math.PI);
      if (l.t === 'square') x = p < Math.PI ? 1 : -1;
      else if (l.t === 'triangle') x = 1 - 4 * Math.abs(p / (2 * Math.PI) - 0.5);
      else x = Math.sin(p);
      if (l.fm) x *= 1 + 0.001 * l.fm.depth * Math.sin(2 * Math.PI * l.fm.f * i / SR);
    }
    if (lp && l.lpTo) lp.set(l.lp * pitch * Math.pow(l.lpTo / l.lp, Math.min(1, u)), l.lpQ || 0.7071);
    if (bp && l.bpTo) bp.set(l.bp * pitch * Math.pow(l.bpTo / l.bp, Math.min(1, u)), l.q || 1);
    if (hp) x = hp.run(x);
    if (bp) x = bp.run(x);
    if (lp) x = lp.run(x);
    // obwiednia: liniowy atak, potem zanik wykladniczy do -60 dB na koncu dur (+tail)
    let env = i < attack ? i / attack : 1;
    const decN = durN + tail * SR;
    env *= Math.exp(-6.9 * Math.max(0, i - attack) / decN);
    out[start + i] = x * env * l.level;
  }
  return out;
}

function renderShot(recipe, pitch) {
  const parts = recipe.map((l) => renderLayer(l, pitch));
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float64Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

// ---------- charaktery strzalu (body) ----------
const BODIES = {
  // Obecna receptura z gry (V3-C-13), bez zmian.
  current: [
    { n: 'white', dur: 0.008, hp: 3000, level: 0.63 },
    { n: 'white', dur: 0.035, bp: 1200, q: 1.5, lp: 4000, lpTo: 900, level: 0.42 },
    { t: 'sine', f0: 160, f1: 45, dur: 0.06, level: 0.35 },
    { t: 'square', f0: 2500, dur: 0.003, level: 0.105 },
    { n: 'white', dur: 0.18, lp: 1200, level: 0.126, at: 0.025 },
  ],
  // Ciezszy, wiecej dolu i "klatki piersiowej": dluzszy thump, cialo szumu nizej.
  heavy: [
    { n: 'white', dur: 0.006, hp: 2500, level: 0.55 },
    { n: 'white', dur: 0.05, bp: 700, q: 1.2, lp: 3000, lpTo: 500, level: 0.5 },
    { t: 'sine', f0: 120, f1: 38, dur: 0.11, level: 0.5 },
    { n: 'brown', dur: 0.12, lp: 400, level: 0.45, at: 0.004 },
    { n: 'white', dur: 0.22, lp: 900, level: 0.1, at: 0.03 },
  ],
  // Suchy, ostry trzask: krotki, jasny, malo dolu. Bardziej "klask" niz "bum".
  snappy: [
    { n: 'white', dur: 0.005, hp: 4000, level: 0.8 },
    { n: 'white', dur: 0.02, bp: 2200, q: 2, level: 0.45 },
    { t: 'sine', f0: 220, f1: 70, dur: 0.035, level: 0.3 },
    { t: 'square', f0: 3200, dur: 0.002, level: 0.12 },
    { n: 'white', dur: 0.09, lp: 1800, lpTo: 600, level: 0.12, at: 0.012 },
  ],
  // Mechaniczny: trzask + wyrazny metaliczny "klik" zamka 18 ms po strzale, srednie cialo.
  mech: [
    { n: 'white', dur: 0.007, hp: 3000, level: 0.6 },
    { n: 'white', dur: 0.03, bp: 1500, q: 1.4, lp: 3500, lpTo: 800, level: 0.4 },
    { t: 'sine', f0: 150, f1: 48, dur: 0.07, level: 0.38 },
    { n: 'white', dur: 0.006, bp: 4200, q: 6, level: 0.3, at: 0.018 },
    { t: 'square', f0: 1900, dur: 0.004, level: 0.1, at: 0.019 },
    { n: 'white', dur: 0.16, lp: 1000, level: 0.1, at: 0.03 },
  ],
  // Z duza lufa: wyrazny "crack" + nizszy, dluzszy "boom" (karabin wyzszego kalibru).
  boom: [
    { n: 'white', dur: 0.009, hp: 2000, level: 0.6 },
    { n: 'white', dur: 0.04, bp: 900, q: 1.3, lp: 3500, lpTo: 600, level: 0.45 },
    { t: 'sine', f0: 95, f1: 32, dur: 0.16, level: 0.55 },
    { t: 'triangle', f0: 260, f1: 90, dur: 0.05, level: 0.18 },
    { n: 'brown', dur: 0.25, lp: 300, level: 0.35, at: 0.01 },
  ],
};

// ---------- impulse responses ----------
// Kazda zwraca { L, R, wet, pre } — IR stereo (Float64Array), poziom send i pre-delay (s).

// IR z gry (makeOpenIR z sfx.js, 1.2 s, HP 400 Hz x2, LP 8 kHz, cisza 50 ms) — punkt odniesienia.
function irCurrent() {
  const secs = 1.2, g = { hpHz: 400, lpHz: 8000, quietS: 0.05, quietLevel: 0.03, riseS: 0.015 };
  const len = Math.floor(SR * secs);
  const hpA = Math.exp(-2 * Math.PI * g.hpHz / SR), lpA = 1 - Math.exp(-2 * Math.PI * g.lpHz / SR);
  const quiet = g.quietS * SR, rise = g.riseS * SR, decayLen = len - quiet;
  const chans = [new Float64Array(len), new Float64Array(len)];
  for (const d of chans) {
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      const x = rnd() * 2 - 1;
      y1 = hpA * (y1 + x - x1); x1 = x;
      y2 = hpA * (y2 + y1 - x2); x2 = y1;
      lp += lpA * (y2 - lp);
      let env;
      if (i < quiet) env = g.quietLevel;
      else { const u = Math.min(1, (i - quiet) / rise); env = (g.quietLevel + (1 - g.quietLevel) * u * u * (3 - 2 * u)) * Math.exp(-6.9 * (i - quiet) / decayLen); }
      d[i] = lp * env;
    }
  }
  return { L: chans[0], R: chans[1], wet: 0.34, pre: 0.065, desc: 'IR z gry: 1.2 s, HP 400 Hz, LP 8 kHz, jasny gesty ogon od razu po pre-delay (punkt odniesienia)' };
}

// Pomocnik: dyfuzyjny ogon szumowy z czasem RT60, pasmem i tlumieniem gory rosnacym w czasie (absorpcja powietrza).
// Ogon dyfuzyjny, silnie stereofoniczny: osobny szum na kanal (pelna dekorelacja), potem skladowa
// srodkowa tlumiona (mid) i boczna podbita (side), plus wolne przeciwfazowe falowanie poziomu L/R
// (wobble, Hz), zeby ogon "chodzil" w panoramie zamiast stac w srodku.
function diffuseTail(len, rt60, { hpHz = 150, lpStart = 6000, lpEnd = 1500, startAt = 0, build = 0.02, level = 1, mid = 0.75, side = 1.15, wobble = 0.45, wobbleDepth = 0.3 } = {}) {
  const chans = [new Float64Array(len), new Float64Array(len)];
  const s0 = Math.floor(startAt * SR), b = Math.max(1, Math.floor(build * SR));
  for (const d of chans) {
    const hp = new Biquad('hp', hpHz), lp = new Biquad('lp', lpStart);
    for (let i = s0; i < len; i++) {
      const t = (i - s0) / SR;
      if ((i & 63) === 0) lp.set(lpStart * Math.pow(lpEnd / lpStart, Math.min(1, t / rt60)), 0.7071);
      const u = Math.min(1, (i - s0) / b);
      const env = (u * u * (3 - 2 * u)) * Math.pow(10, -3 * t / rt60); // -60 dB po rt60
      d[i] = lp.run(hp.run(rnd() * 2 - 1)) * env * level;
    }
  }
  const ph = rnd() * 2 * Math.PI;
  for (let i = s0; i < len; i++) {
    const m = (chans[0][i] + chans[1][i]) * 0.5 * mid, s = (chans[0][i] - chans[1][i]) * 0.5 * side;
    const w = wobbleDepth * Math.sin(2 * Math.PI * wobble * i / SR + ph);
    chans[0][i] = (m + s) * (1 + w);
    chans[1][i] = (m - s) * (1 - w);
  }
  return chans;
}

// Pomocnik: dyskretne echo (pojedyncze odbicie od odleglej przeszkody) - krotki, dolnoprzepustowy "klaps".
function addEcho(chans, atS, level, lpHz, spreadS = 0.004, widthMs = 0) {
  const i0 = Math.floor(atS * SR);
  for (let ch = 0; ch < 2; ch++) {
    const d = chans[ch];
    const lp = new Biquad('lp', lpHz);
    const off = Math.floor(((ch === 0 ? -1 : 1) * widthMs / 1000) * SR);
    const n = Math.floor(spreadS * SR);
    for (let i = 0; i < n * 4; i++) {
      const idx = i0 + off + i;
      if (idx < 0 || idx >= d.length) continue;
      const env = Math.exp(-i / n);
      d[idx] += lp.run(rnd() * 2 - 1) * env * level;
    }
  }
}

function normalizeIR(chans, peak) {
  let m = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (const d of chans) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return chans;
}

// Otwarte pole, same odbicia: brak dyfuzyjnego ogona, 3-4 odlegle slapbacki (sciana lasu, budynki),
// kazde ciemniejsze i cichsze. Charakter: suchy strzal + "pa... pa" z oddali.
function irFieldEcho() {
  const len = Math.floor(SR * 1.4);
  const chans = [new Float64Array(len), new Float64Array(len)];
  addEcho(chans, 0.0, 1.0, 2500, 0.006, 1.5);
  addEcho(chans, 0.11, 0.45, 1800, 0.012, 4);
  addEcho(chans, 0.27, 0.3, 1200, 0.02, 7);
  addEcho(chans, 0.52, 0.18, 800, 0.035, 10);
  addEcho(chans, 0.9, 0.08, 600, 0.05, 12);
  normalizeIR(chans, 0.5);
  return { L: chans[0], R: chans[1], wet: 0.05, pre: 0.06, desc: 'otwarte pole, tylko odlegle odbicia (slapback 110/270/520/900 ms, coraz ciemniejsze), bez dyfuzyjnego ogona' };
}

// Otwarte pole z ogonem: jak wyzej + cichy, ciemny dyfuzyjny ogon 1.8 s (wiele slabych odbic z daleka).
function irFieldDiffuse() {
  const len = Math.floor(SR * 2.2);
  const tail = diffuseTail(len, 1.8, { hpHz: 1200, lpStart: 8000, lpEnd: 2500, startAt: 0.03, build: 0.08, level: 0.25 });
  addEcho(tail, 0.0, 1.0, 2500, 0.006, 1.5);
  addEcho(tail, 0.13, 0.4, 1600, 0.014, 5);
  addEcho(tail, 0.31, 0.25, 1000, 0.025, 8);
  normalizeIR(tail, 0.5);
  return { L: tail[0], R: tail[1], wet: 0.055, pre: 0.06, desc: 'otwarte pole + jasny dyfuzyjny ogon 1.8 s (HP 1.2 kHz, LP 8 kHz -> 2.5 kHz), dwa slapbacki, szerokie stereo' };
}

// Gigantyczna hala, 2.5 s, charakter sopranowy: pasmo 400 Hz - 3.5 kHz wyciete (to ono dawalo "wysoka
// srednice"). Zostaje jasny szelest od 3.5 kHz (LP 12 -> 6 kHz) i cichy niski pomruk ponizej 350 Hz.
function irHall25() {
  const len = Math.floor(SR * 3.0);
  const air = diffuseTail(len, 2.5, { hpHz: 2200, lpStart: 11000, lpEnd: 5000, startAt: 0.0, build: 0.08, level: 1 });
  const low = diffuseTail(len, 2.0, { hpHz: 70, lpStart: 350, lpEnd: 200, startAt: 0.0, build: 0.1, level: 0.5 });
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < len; i++) air[ch][i] += low[ch][i];
  normalizeIR(air, 0.5);
  return { L: air[0], R: air[1], wet: 0.018, pre: 0.05, desc: 'gigantyczna hala, RT60 2.5 s, sopranowa: HP 2.2 kHz (LP 11 -> 5 kHz) + pomruk < 350 Hz, srodek wyciety, szerokie stereo' };
}

// Arena: miedzy otwartym polem a hala. Ogon 1.8 s z narastaniem 40 ms, pasmo szersze niz w polu
// (LP 4.5 kHz -> 900 Hz), dwa slabe slapbacki z trybun (90/210 ms).
function irArena() {
  const len = Math.floor(SR * 2.2);
  const tail = diffuseTail(len, 2.0, { hpHz: 700, lpStart: 7000, lpEnd: 2000, startAt: 0.04, build: 0.07, level: 0.6 });
  addEcho(tail, 0.0, 0.5, 2500, 0.006, 1.5);
  addEcho(tail, 0.17, 0.25, 1800, 0.02, -9);
  addEcho(tail, 0.38, 0.15, 1200, 0.03, 11);
  normalizeIR(tail, 0.5);
  return { L: tail[0], R: tail[1], wet: 0.03, pre: 0.05, desc: 'arena: ogon 2.0 s, narastanie 70 ms, HP 700 Hz (LP 7 kHz -> 2 kHz), dwa dalekie slapbacki 170/380 ms, szerokie stereo' };
}

// Ulica miedzy budynkami: gesty klaster wczesnych odbic 30-140 ms (fasady), potem sredni ciemny ogon 1.1 s.
// Wieksze niz pokoj, mniejsze niz hala; brak "lazienkowej" gory bo LP od 3.5 kHz.
function irStreet() {
  const len = Math.floor(SR * 1.6);
  const tail = diffuseTail(len, 1.1, { hpHz: 180, lpStart: 3500, lpEnd: 700, startAt: 0.14, build: 0.05, level: 0.35 });
  const early = [0.03, 0.047, 0.062, 0.081, 0.095, 0.113, 0.128, 0.14];
  early.forEach((t, i) => addEcho(tail, t, 0.9 * Math.pow(0.78, i), 3500 - i * 250, 0.004 + i * 0.002, (i % 2 ? 1 : -1) * (3 + i * 1.5)));
  normalizeIR(tail, 0.5);
  return { L: tail[0], R: tail[1], wet: 0.045, pre: 0.04, desc: 'ulica miedzy budynkami: 8 wczesnych odbic 30-140 ms od fasad, potem ciemny ogon 1.1 s (LP 3.5 kHz -> 700 Hz)' };
}

// Drabinka STEREO na eq-darkest (ogon 1.2 s, HP 300 Hz, LP 3.5 -> 1 kHz, send 0.028). Kazdy wariant to inna
// technika poszerzania; zadna nie schodzi z korelacja L/R ponizej ok. -0.3 (mono-kompatybilnosc).
const EQ = { hpHz: 300, lpStart: 3500, lpEnd: 1000, startAt: 0.03, build: 0.08, level: 0.25 };
const RT = 1.2;

// Echo z panoramą: pan -1..1 (stala moc), plus roznica czasu miedzy uszami (ITD) proporcjonalna do pan.
function addEchoPan(chans, atS, level, lpHz, spreadS, pan) {
  const gL = Math.cos((pan + 1) * Math.PI / 4), gR = Math.sin((pan + 1) * Math.PI / 4);
  const itd = Math.round(pan * 0.0007 * SR); // do 0.7 ms
  const i0 = Math.floor(atS * SR), n = Math.floor(spreadS * SR);
  for (let ch = 0; ch < 2; ch++) {
    const d = chans[ch], lp = new Biquad('lp', lpHz), g = ch === 0 ? gL : gR, off = ch === 0 ? Math.max(0, itd) : Math.max(0, -itd);
    for (let i = 0; i < n * 4; i++) {
      const idx = i0 + off + i;
      if (idx >= d.length) break;
      d[idx] += lp.run(rnd() * 2 - 1) * Math.exp(-i / n) * level * g;
    }
  }
}

function slapbacksCenter(t) { addEcho(t, 0.0, 1.0, 2500, 0.006, 1.5); addEcho(t, 0.13, 0.4, 1600, 0.014, 5); addEcho(t, 0.31, 0.25, 1000, 0.025, 8); }
function slapbacksPingPong(t) { addEcho(t, 0.0, 1.0, 2500, 0.006, 1.5); addEchoPan(t, 0.13, 0.45, 1600, 0.014, -0.8); addEchoPan(t, 0.31, 0.3, 1000, 0.025, 0.8); addEchoPan(t, 0.52, 0.15, 800, 0.035, -0.6); }

function finish(tail, desc) { normalizeIR(tail, 0.5); return { L: tail[0], R: tail[1], wet: 0.028, pre: 0.06, desc }; }

const STEREO = {
  // 1. Punkt odniesienia: eq-base z poprzedniej rundy (mid 0.75, side 1.15, wobble 0.45 Hz).
  'st-base': () => { const len = Math.floor(SR * (RT + 0.4)); const t = diffuseTail(len, RT, EQ); slapbacksCenter(t); return finish(t, 'eq-darkest bez zmian (mid 0.75 / side 1.15, wobble 0.45 Hz)'); },
  // 2. Mocniejsze M/S, ale pod kontrola (mid 0.5, side 1.3).
  'st-wider-ms': () => { const len = Math.floor(SR * (RT + 0.4)); const t = diffuseTail(len, RT, { ...EQ, mid: 0.5, side: 1.3 }); slapbacksCenter(t); return finish(t, 'mocniejsze M/S: mid 0.5 / side 1.3'); },
  // 3. Autopan: szybsze i glebsze falowanie L/R (1.3 Hz, glebokosc 0.6) - ogon wyraznie "plywa".
  'st-autopan': () => { const len = Math.floor(SR * (RT + 0.4)); const t = diffuseTail(len, RT, { ...EQ, wobble: 1.3, wobbleDepth: 0.6 }); slapbacksCenter(t); return finish(t, 'autopan: falowanie 1.3 Hz, glebokosc 0.6'); },
  // 4. Pasma w panoramie: ogon podzielony na 4 pasma, kazde na innej pozycji L/R (jak rozne odbicia z roznych stron).
  'st-bands': () => {
    const len = Math.floor(SR * (RT + 0.4));
    const bands = [[300, 600, -0.9], [600, 1200, 0.6], [1200, 2200, -0.5], [2200, 3500, 0.9]];
    const t = [new Float64Array(len), new Float64Array(len)];
    for (const [lo, hi, pan] of bands) {
      const b = diffuseTail(len, RT, { ...EQ, hpHz: lo, lpStart: hi, lpEnd: hi * (1000 / 3500), mid: 1, side: 1, wobbleDepth: 0.15 });
      const gL = Math.cos((pan + 1) * Math.PI / 4), gR = Math.sin((pan + 1) * Math.PI / 4);
      for (let i = 0; i < len; i++) { t[0][i] += b[0][i] * gL; t[1][i] += b[1][i] * gR; }
    }
    slapbacksCenter(t);
    return finish(t, 'pasma w panoramie: 4 pasma ogona kazde w innym miejscu L/R');
  },
  // 5. Ping-pong slapbackow: odbicia na przemian mocno z lewej i z prawej, ogon jak base.
  'st-pingpong': () => { const len = Math.floor(SR * (RT + 0.4)); const t = diffuseTail(len, RT, EQ); slapbacksPingPong(t); return finish(t, 'slapbacki ping-pong L/R (130 ms lewo, 310 ms prawo, 520 ms lewo), ogon jak base'); },
  // 6. Asymetria: lewy kanal gasnie szybciej i ciemniej, prawy dluzej i jasniej - jak przestrzen niesymetryczna.
  'st-asym': () => {
    const len = Math.floor(SR * (RT + 0.6));
    const a = diffuseTail(len, 0.9, { ...EQ, lpStart: 2800, lpEnd: 800, mid: 1, side: 1, wobbleDepth: 0 });
    const b = diffuseTail(len, 1.5, { ...EQ, lpStart: 4200, lpEnd: 1400, mid: 1, side: 1, wobbleDepth: 0 });
    const t = [a[0], b[1]];
    slapbacksCenter(t);
    return finish(t, 'asymetria: L ogon 0.9 s ciemniejszy, R ogon 1.5 s jasniejszy');
  },
  // 7. Wszystko naraz: pasma w panoramie + ping-pong + lekki autopan.
  'st-max': () => {
    const len = Math.floor(SR * (RT + 0.4));
    const bands = [[300, 600, -0.9], [600, 1200, 0.6], [1200, 2200, -0.5], [2200, 3500, 0.9]];
    const t = [new Float64Array(len), new Float64Array(len)];
    for (const [lo, hi, pan] of bands) {
      const b = diffuseTail(len, RT, { ...EQ, hpHz: lo, lpStart: hi, lpEnd: hi * (1000 / 3500), mid: 1, side: 1, wobble: 0.9, wobbleDepth: 0.35 });
      const gL = Math.cos((pan + 1) * Math.PI / 4), gR = Math.sin((pan + 1) * Math.PI / 4);
      for (let i = 0; i < len; i++) { t[0][i] += b[0][i] * gL; t[1][i] += b[1][i] * gR; }
    }
    slapbacksPingPong(t);
    return finish(t, 'maks: pasma w panoramie + ping-pong + autopan 0.9 Hz');
  },
};

const REVERBS = { none: () => null, ...STEREO };

// ---------- FFT (radix-2, in place) ----------
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inverse ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function convolve(x, h, outLen) {
  let n = 1; while (n < x.length + h.length) n <<= 1;
  const xr = new Float64Array(n), xi = new Float64Array(n), hr = new Float64Array(n), hi = new Float64Array(n);
  xr.set(x); hr.set(h);
  fft(xr, xi, false); fft(hr, hi, false);
  for (let i = 0; i < n; i++) { const r = xr[i] * hr[i] - xi[i] * hi[i]; xi[i] = xr[i] * hi[i] + xi[i] * hr[i]; xr[i] = r; }
  fft(xr, xi, true);
  return xr.subarray(0, outLen);
}

// ---------- sekwencja ----------
const SHOT_TIMES = (() => {
  const t = [1.0, 3.0];
  for (let i = 0; i < 8; i++) t.push(5.0 + i * FIRE_INTERVAL);
  return t;
})();
const TOTAL_S = SHOT_TIMES[SHOT_TIMES.length - 1] + 2.5 + 0.5;
const TOTAL_N = Math.floor(TOTAL_S * SR);

function renderDry(body) {
  const dry = new Float64Array(TOTAL_N);
  for (const ts of SHOT_TIMES) {
    const pitch = 1 + (rnd() * 2 - 1) * DETUNE;
    const s = renderShot(BODIES[body], pitch);
    const i0 = Math.floor(ts * SR);
    for (let i = 0; i < s.length && i0 + i < TOTAL_N; i++) dry[i0 + i] += s[i];
  }
  return dry;
}

// Lagodny limiter (soft-clip tanh) + normalizacja do -1 dBFS.
function finalize(L, R) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.891 / peak : 1;
  const out = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = Math.round(Math.tanh(L[i] * g * 1.1) / Math.tanh(1.1) * 32767 * 0.95);
    out[2 * i + 1] = Math.round(Math.tanh(R[i] * g * 1.1) / Math.tanh(1.1) * 32767 * 0.95);
  }
  return out;
}

function writeWav(path, pcm) {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, dataBytes).copy(buf, 44);
  writeFileSync(path, buf);
}

// ---------- main ----------
mkdirSync(OUT, { recursive: true });
const irCache = {};
const index = ['# Warianty dzwieku karabinu', '', `Sekwencja: 1 s cisza, strzal, 2 s, strzal, 2 s, seria 8 strzalow co ${FIRE_INTERVAL} s, 2.5 s wybrzmienia. Stereo 44.1 kHz.`, '',
  '## Charaktery strzalu (body)', '',
  '- heavy: ciezszy, wiecej dolu (thump 120->38 Hz, 110 ms) i brazowego szumu',
  '- mech: jak current + metaliczny klik zamka 18 ms po strzale',
  '', '## Poglosy', ''];
for (const [k, f] of Object.entries(REVERBS)) {
  const ir = f(); irCache[k] = ir;
  index.push(`- ${k}: ${ir ? ir.desc + ` (send ${ir.wet}, pre-delay ${Math.round(ir.pre * 1000)} ms)` : 'bez poglosu, calkowicie sucho'}`);
}
index.push('', '## Pliki', '');
let n = 0;
for (const body of ['mech', 'heavy']) {
  seed = 777; // ten sam przebieg strzalow w kazdym body, zeby roznil sie tylko poglos
  const dry = renderDry(body);
  for (const rev of Object.keys(REVERBS)) {
    n++;
    const name = `${String(n).padStart(2, '0')}_${body}__${rev}.wav`;
    let L = Float64Array.from(dry), R = Float64Array.from(dry);
    const ir = irCache[rev];
    if (ir) {
      const preN = Math.floor(ir.pre * SR);
      const send = new Float64Array(TOTAL_N);
      for (let i = preN; i < TOTAL_N; i++) send[i] = dry[i - preN] * ir.wet;
      const wl = convolve(send, ir.L, TOTAL_N), wr = convolve(send, ir.R, TOTAL_N);
      for (let i = 0; i < TOTAL_N; i++) { L[i] += wl[i]; R[i] += wr[i]; }
    }
    writeWav(join(OUT, name), finalize(L, R));
    index.push(`- ${name}`);
    process.stdout.write(`${name}\n`);
  }
}
writeFileSync(join(OUT, 'INDEX.md'), index.join('\n') + '\n');
console.log(`OK: ${n} plikow w ${OUT}`);
