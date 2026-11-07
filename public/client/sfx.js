// Dźwięk w całości syntetyczny (Web Audio) — zero plików, zero sieci (PRD-CON-01).
// Recepty: docs/10-BACKLOG-V3.md, "Research: recepty syntezy".
// Cała warstwa jest cichą atrapą, gdy AudioContext nie istnieje albo rzuca.

export const MAX_VOICES = 24;
export const MIN_GAP_MS = 30;
export const MAX_DIST_TILES = 20;
const DETUNE = 0.07;
const FLOOR = 0.0001; // exponentialRamp nie znosi zera
export const OWN_BOOST = 1.6; // własne przeładowanie: informacja taktyczna, ma przebić walkę
export const RELOAD_FALLBACK_S = 1.5;
// Długości ogonów pogłosu (s): "klaps pomieszczenia", osobna szyna karabinu (V3-C-13) i wybuch w hali.
export const REVERB_S = { room: 0.25, gun: 1.3, hall: 1.3 };
// Pre-delay przed konwolwerem (s): bez niego ogon zlewa się z transjentem (V3-C-09).
// Szyna karabinu: 60 ms (V3-C-15) - na otwartej przestrzeni nie ma blisko czego odbic, wiec ogon
// startuje wyraznie po transjencie (dopiero od ok. 35 ms ucho slyszy odbicie jako osobne zdarzenie).
export const PREDELAY_S = { room: 0.012, gun: 0.06, hall: 0.035 };
// IR szyny karabinu "st-max" (V3-C-15): 4 pasma ogona [dolna, gorna krawedz (Hz), pan -1..1] + slapbacki
// [czas s, poziom, lowpass Hz, zanik s, pan]. Ogon 1.2 s (-60 dB), gora kazdego pasma gasnie do `absorb` swojej
// wartosci (absorpcja), autopan przeciwfazowy L/R. IR znormalizowana do IR_PEAK; send w RECIPES.
export const GUN_IR = {
  rt60: 1.2, startS: 0.03, buildS: 0.08, tailLevel: 0.25, absorb: 1000 / 3500, wobbleHz: 0.9, wobbleDepth: 0.35,
  bands: [[300, 600, -0.9], [600, 1200, 0.6], [1200, 2200, -0.5], [2200, 3500, 0.9]],
  slaps: [[0, 1.0, 2500, 0.006, 0], [0.13, 0.45, 1600, 0.014, -0.8], [0.31, 0.3, 1000, 0.025, 0.8], [0.52, 0.15, 800, 0.035, -0.6]],
};
export const IR_PEAK = 0.4; // normalize=false: skalę IR ustalamy sami
export const WET_MAKEUP = 1; // szyna wet ma wlasny, lagodny limiter — nie ten od dzwiekow suchych
export const PAN_MAX = 0.85;

// Warstwy: n = szum (white/brown), t = ton. `at` = przesunięcie w sekundach.
// Opcje: lp/hp/bp (+ lpTo = przesuw lowpassa, q/lpQ = dobroć), a = czas narastania (s, domyślnie 2 ms),
// bpTo = przesuw bandpassa, tail = dodatkowy zanik po `dur`. Poziomy to ułamek pełnej skali przed masterem.

// Przeładowanie (V3-C-11): cztery zdarzenia rozłożone na faktyczny czas `s` (maleje z poziomem broni).
// Sumy poziomów: zatrzask 0.3, wysunięcie 0.25, wbicie 0.8 (najgłośniejsze), zamek 0.67.
export function reloadRecipe(s) {
  const dur = Math.max(0.3, s);
  const lock = Math.max(dur * 0.6 + 0.07, dur - 0.03);
  return Object.assign([
    // 1. 0%: zatrzask magazynka
    { n: 'white', dur: 0.003, bp: 3500, level: 0.1 },
    { t: 'square', f0: 1800, dur: 0.004, level: 0.1 },
    { t: 'triangle', f0: 900, f1: 1400, dur: 0.04, level: 0.1 },
    // 2. 10%: wysunięcie magazynka
    { n: 'brown', dur: 0.06, lp: 1500, level: 0.25, at: dur * 0.1 },
    // 3. 60%: wbicie nowego
    { n: 'brown', dur: 0.07, lp: 600, level: 0.4, at: dur * 0.6 },
    { t: 'sine', f0: 140, f1: 50, dur: 0.06, level: 0.3, at: dur * 0.6 },
    { n: 'white', dur: 0.012, bp: 2200, level: 0.1, at: dur * 0.6 },
    // 4. koniec: zamek + metaliczny ring
    { n: 'white', dur: 0.025, hp: 2500, level: 0.45, at: lock },
    { t: 'square', f0: 3200, dur: 0.005, level: 0.1, at: lock },
    { t: 'triangle', f0: 2600, dur: 0.09, level: 0.12, at: lock },
  ], { rev: 'room', wet: 0.25 });
}

// ULTIMATE (V3-C-12): narastanie -> uderzenie -> wybrzmienie. Próg III: dłuższe narastanie, bogatszy akord, większy wet.
export function ultRecipe(tier) {
  const big = tier >= 3;
  const rise = 0.45 + (Math.min(3, Math.max(1, tier || 1)) - 1) * 0.075; // I 0.45, II 0.525, III 0.6
  const chord = big ? [110, 138.6, 165, 220, 277.2] : [110, 165, 220];
  const layers = [
    // 1. narastanie
    { t: 'sawtooth', f0: 120, f1: 1400, dur: rise, level: 0.3, a: rise, tail: 0.02, lp: 300, lpTo: 5000, lpQ: 8 },
    { n: 'white', dur: rise, level: 0.3, a: rise, tail: 0.02, bp: 600, q: 0.8 },
    // 2. uderzenie
    { t: 'sine', f0: 90, f1: 35, dur: big ? 0.7 : 0.5, level: 0.7, at: rise },
    { n: 'brown', dur: big ? 0.5 : 0.35, lp: 1500, lpTo: 200, level: 0.6, at: rise },
    { n: 'white', dur: 0.01, level: 0.5, at: rise },
  ];
  // 3. wybrzmienie: rozstrojony akord
  chord.forEach((f, i) => {
    layers.push({ t: i % 2 ? 'sawtooth' : 'triangle', f0: f * (1 + (i - 1) * 0.004), dur: big ? 0.8 : 0.6, level: big ? 0.14 : 0.18, at: rise + 0.05, lp: 1800 });
  });
  return Object.assign(layers, { rev: 'hall', wet: big ? 0.9 : 0.8 });
}

const RECIPES = {
  // rev/wet: do której szyny pogłosu i ile sygnału tam wysłać (ułamek głośności dźwięku)
  // Karabin (V3-C-10): transjent / body / dół / mechanika / własny ogon.
  // Karabin gracza "mech" (V3-C-15, odsluch 2026-11-07): transjent / body / dol / klik zamka 18 ms po strzale / ogon.
  // Send 0.035 = 0.028 z renderu offline (IR o szczycie 0.5) przeliczone na IR_PEAK 0.4.
  shot: Object.assign([
    { n: 'white', dur: 0.007, hp: 3000, level: 0.6 },
    { n: 'white', dur: 0.03, bp: 1500, q: 1.4, lp: 3500, lpTo: 800, level: 0.4 },
    { t: 'sine', f0: 150, f1: 48, dur: 0.07, level: 0.38 },
    { n: 'white', dur: 0.006, bp: 4200, q: 6, level: 0.3, at: 0.018 },
    { t: 'square', f0: 1900, dur: 0.004, level: 0.1, at: 0.019 },
    { n: 'white', dur: 0.16, lp: 1000, level: 0.1, at: 0.03 },
  ], { rev: 'gun', wet: 0.035 }),
  // Dzialko "heavy" (V3-C-15): ciezszy strzal, wiecej dolu i brazowego szumu; ta sama szyna poglosu co gracz.
  cannon: Object.assign([
    { n: 'white', dur: 0.006, hp: 2500, level: 0.55 },
    { n: 'white', dur: 0.05, bp: 700, q: 1.2, lp: 3000, lpTo: 500, level: 0.5 },
    { t: 'sine', f0: 120, f1: 38, dur: 0.11, level: 0.5 },
    { n: 'brown', dur: 0.12, lp: 400, level: 0.45, at: 0.004 },
    { n: 'white', dur: 0.22, lp: 900, level: 0.1, at: 0.03 },
  ], { rev: 'gun', wet: 0.035 }),
  hit: [
    { n: 'white', dur: 0.024, bp: 900, level: 0.7 },
    { t: 'sine', f0: 180, f1: 90, dur: 0.06, level: 0.35 },
  ],
  ff: [
    { n: 'white', dur: 0.024, bp: 900, level: 0.5 },
    { t: 'sine', f0: 180, f1: 90, dur: 0.06, level: 0.3 },
    { t: 'square', f0: 880, dur: 0.07, level: 0.14 },
    { t: 'square', f0: 660, dur: 0.09, level: 0.14, at: 0.08 },
  ],
  objHit: [
    { n: 'white', dur: 0.01, hp: 2000, level: 0.5 },
    { t: 'square', f0: 1800, dur: 0.002, level: 0.3 },
  ],
  // Sendy hali (destroyed/split) obnizone 2026-11-07: po sciszeniu karabinu limiter szyny wet przestal
  // je dociskac i zawalenie sciany bylo "dramatycznie zreverbowane". Wybuch (1.1) i ult (0.8/0.9) bez zmian.
  destroyed: Object.assign([
    { n: 'brown', dur: 0.4, lp: 800, lpTo: 200, level: 0.7 },
    { n: 'white', dur: 0.02, level: 0.4 },
  ], { rev: 'hall', wet: 0.15 }),
  explode: Object.assign([
    { n: 'brown', dur: 0.7, lp: 800, lpTo: 200, level: 0.4 },
    { t: 'sine', f0: 60, f1: 30, dur: 0.5, level: 0.6 },
    { n: 'white', dur: 0.5, lp: 500, level: 0.15, at: 0.1 },
  ], { rev: 'hall', wet: 1.1 }),
  // Plujka: mokre "ptuu" — szum w górę + opadający ton z modulacją. Inny charakter niż suchy trzask karabinu.
  spit: Object.assign([
    { n: 'brown', dur: 0.1, lp: 500, lpTo: 1800, level: 0.5 },
    { t: 'sine', f0: 420, f1: 130, dur: 0.12, level: 0.35, fm: { f: 38, depth: 90 } },
    { n: 'white', dur: 0.03, bp: 2500, level: 0.12, at: 0.02 },
  ], { rev: 'room', wet: 0.3 }),
  // Granatnik: głuche "bump" moździerza i opadający gwizd.
  lob: Object.assign([
    { n: 'brown', dur: 0.14, lp: 400, level: 0.7 },
    { t: 'sine', f0: 110, f1: 40, dur: 0.18, level: 0.6 },
    { t: 'triangle', f0: 900, f1: 350, dur: 0.22, level: 0.12, at: 0.05 },
  ], { rev: 'room', wet: 0.4 }),
  // Plwocina trafia w ziemię/ścianę/gracza: mokry plask, bez "metalu" trafienia w potwora.
  spitHit: [
    { n: 'white', dur: 0.045, bp: 700, q: 1.2, level: 0.5 },
    { t: 'sine', f0: 220, f1: 70, dur: 0.07, level: 0.3 },
  ],
  // Wyjscie ze stealthu: krotki, jasny, dwutonowy "ping" z szumem — ma wyrwac wzrok, nie przypominac trafienia.
  reveal: Object.assign([
    { n: 'white', dur: 0.05, bp: 3200, q: 2, level: 0.35 },
    { t: 'square', f0: 1500, dur: 0.06, level: 0.16 },
    { t: 'square', f0: 2250, dur: 0.1, level: 0.16, at: 0.06 },
  ], { rev: 'room', wet: 0.3 }),
  // Telegraf ninji: narastajacy swist (bandpass jedzie w gore) — "zaraz tne".
  ninjaTele: [
    { n: 'white', dur: 0.5, a: 0.45, tail: 0.02, bp: 600, q: 4, level: 0.3 },
    { t: 'sawtooth', f0: 500, f1: 2400, dur: 0.5, a: 0.45, tail: 0.02, lp: 700, lpTo: 4500, lpQ: 5, level: 0.14 },
  ],
  // Szarza: ostry swist ciecia, filtr spada w dol.
  ninjaCharge: Object.assign([
    { n: 'white', dur: 0.16, bp: 5000, bpTo: 1200, q: 3, level: 0.5 },
    { n: 'white', dur: 0.012, hp: 4000, level: 0.35 },
  ], { rev: 'room', wet: 0.2 }),
  // Rozpad tanka: gluche, niskie pekniecie, dluzsze i nizsze niz death/hit.
  split: Object.assign([
    { n: 'brown', dur: 0.45, lp: 500, lpTo: 90, level: 0.8 },
    { t: 'sine', f0: 70, f1: 28, dur: 0.5, level: 0.8, tail: 0.1 },
    { n: 'white', dur: 0.03, bp: 400, level: 0.4, at: 0.05 },
  ], { rev: 'hall', wet: 0.25 }),
  pickup: [{ t: 'sine', f0: 440, f1: 880, dur: 0.08, level: 0.25 }],
  place: [
    { t: 'square', f0: 200, dur: 0.04, level: 0.22 },
    { n: 'white', dur: 0.004, hp: 1500, level: 0.4 },
  ],
  drop: [{ t: 'sine', f0: 150, f1: 90, dur: 0.09, level: 0.3 }],
  // Interfejs (V3-K-06): blip przy najechaniu i klik przy wyborze - krotkie, ciche, bez poglosu.
  uiHover: [{ t: 'triangle', f0: 900, f1: 1100, dur: 0.03, level: 0.027 }],
  uiClick: [
    { t: 'square', f0: 520, f1: 780, dur: 0.05, level: 0.047 },
    { n: 'white', dur: 0.006, hp: 2500, level: 0.04 },
  ],
  deny: [
    { t: 'square', f0: 160, dur: 0.04, level: 0.2 },
    { t: 'square', f0: 160, dur: 0.04, level: 0.2, at: 0.1 },
  ],
  // Wymiana magazynka rozłożona na cały czas przeładowania (V3-C-07); patrz reloadRecipe().
  reload: reloadRecipe(RELOAD_FALLBACK_S),
  // Oberwał ten, kto gra: niski, tępy cios z dołu — nie myli się z trafieniem potwora (wysoki szum 900 Hz).
  hurtMe: [
    { n: 'brown', dur: 0.12, lp: 500, level: 0.8 },
    { t: 'sawtooth', f0: 140, f1: 45, dur: 0.18, level: 0.4, lp: 600 },
  ],
  // Niskie HP: ten sam cios + dwa ostre, opadające tony alarmu
  hurtMeLow: [
    { n: 'brown', dur: 0.12, lp: 500, level: 0.8 },
    { t: 'sawtooth', f0: 140, f1: 45, dur: 0.18, level: 0.4, lp: 600 },
    { t: 'square', f0: 1100, f1: 900, dur: 0.07, level: 0.16, at: 0.04 },
    { t: 'square', f0: 1100, f1: 900, dur: 0.07, level: 0.16, at: 0.16 },
  ],
  // Oberwał sojusznik: krótszy, wyżej, bez dołu — informacja, nie ból
  hurtAlly: [
    { n: 'white', dur: 0.03, bp: 1300, level: 0.35 },
    { t: 'triangle', f0: 520, f1: 300, dur: 0.1, level: 0.22 },
  ],
  droplet: [{ t: 'triangle', f0: 1200, f1: 1600, dur: 0.06, level: 0.22, fm: { f: 90, depth: 50 } }],
  ult: ultRecipe(1),
  down: [{ t: 'sine', f0: 300, f1: 80, dur: 0.5, level: 0.4, tail: 0.3 }],
  death: [{ t: 'sine', f0: 260, f1: 60, dur: 0.6, level: 0.45, tail: 0.4 }],
  revive: [
    { t: 'sine', f0: 440, dur: 0.07, level: 0.25 },
    { t: 'sine', f0: 554, dur: 0.07, level: 0.25, at: 0.07 },
    { t: 'sine', f0: 659, dur: 0.1, level: 0.25, at: 0.14 },
  ],
  // Awans broni (V3-I-05): rosnacy akord (A-cis-e-A) z metalicznym blyskiem; glosniejszy u wlasnego gracza (own).
  weaponUp: Object.assign([
    { t: 'square', f0: 440, dur: 0.09, level: 0.2 },
    { t: 'square', f0: 554, dur: 0.09, level: 0.2, at: 0.07 },
    { t: 'square', f0: 659, dur: 0.09, level: 0.2, at: 0.14 },
    { t: 'triangle', f0: 880, dur: 0.3, level: 0.3, at: 0.21, tail: 0.15 },
    { n: 'white', dur: 0.05, hp: 4000, level: 0.2, at: 0.21 },
  ], { rev: 'room', wet: 0.3 }),
  expire: [{ t: 'sine', f0: 400, f1: 200, dur: 0.15, level: 0.15 }],
  // trzesienie ziemi (V3-Q-06-01): dlugi dudniacy pomruk
  quake: Object.assign([
    { n: 'brown', dur: 3.0, lp: 140, level: 0.5, tail: 0.6 },
    { t: 'sine', f0: 38, f1: 30, dur: 3.0, level: 0.35, tail: 0.6 },
  ], { rev: 'hall', wet: 0.6 }),
  // wydarzenie (V3-Q-06): krotka fanfara, dwa tony w gore i tremolo
  eventStart: Object.assign([
    { t: 'square', f0: 392, dur: 0.12, level: 0.2 },
    { t: 'square', f0: 523, dur: 0.12, level: 0.2, at: 0.12 },
    { t: 'square', f0: 784, dur: 0.35, level: 0.22, at: 0.24, tail: 0.2 },
    { t: 'triangle', f0: 1568, dur: 0.3, level: 0.1, at: 0.24, tail: 0.2 },
  ], { rev: 'hall', wet: 0.5 }),
  // kamikaze uzbrojony (V3-Q-03): trzy szybkie piski w gore, dlugosc = lont 0.3 s
  armed: [
    { t: 'square', f0: 1200, dur: 0.05, level: 0.22 },
    { t: 'square', f0: 1500, dur: 0.05, level: 0.22, at: 0.09 },
    { t: 'square', f0: 1900, dur: 0.07, level: 0.24, at: 0.18 },
  ],
  // plomien (V3-Q-04): krotki trzask i buchniecie, bez petli
  flame: [
    { n: 'white', dur: 0.22, hp: 900, level: 0.16 },
    { t: 'triangle', f0: 160, f1: 70, dur: 0.18, level: 0.12 },
    { n: 'white', dur: 0.05, hp: 3000, level: 0.1, at: 0.09 },
  ],
};
RECIPES.ultDeny = RECIPES.deny;

export const SFX_NAMES = Object.keys(RECIPES);

function defaultCtxFactory() {
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  return C ? new C() : null;
}

function defaultNow() {
  return globalThis.performance?.now ? performance.now() : Date.now();
}

// pan = clamp((x - camX) / (viewW / 2), -1, 1) * 0.85; brak danych = środek
export function panFor(x, camX, viewW) {
  if (!Number.isFinite(x) || !Number.isFinite(camX) || !(viewW > 0)) return 0;
  return Math.min(1, Math.max(-1, (x - camX) / (viewW / 2))) * PAN_MAX;
}

export function createSfx({ now = defaultNow, ctxFactory = defaultCtxFactory, random = Math.random } = {}) {
  let ctx = null;
  let dead = false; // próba utworzenia kontekstu się nie udała — nie ponawiamy
  let master = null;
  let dry = null; // wejście toru suchego (limiter)
  let noise = null; // { white, brown }
  let reverb = null; // { room: ConvolverNode, hall: ConvolverNode } — szyna wet, kończy w masterze
  let volume = 1;
  let muted = false;
  const lastPlayed = new Map();
  let voices = []; // czasy końca (ms, wg `now`)

  const masterLevel = () => (muted ? 0 : volume);
  function applyMaster() {
    if (master) master.gain.value = masterLevel();
  }

  function makeNoise(kind) {
    const len = Math.floor(ctx.sampleRate); // 1 s, zapętlane
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  // Odpowiedź impulsowa: szum z wykładniczym zanikiem (-60 dB po `secs`), z ciemnieniem ogona.
  // Liczona raz przy starcie — żadnych plików IR (PRD-CON-01).
  function makeIR(secs, open = false) {
    if (open) return makeGunIR(secs);
    const len = Math.max(1, Math.floor(ctx.sampleRate * secs));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const a = 0.9 - 0.7 * k; // coraz mocniejszy dolnoprzepust: ogon cieplejszy niż początek
      lp += a * ((random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-6.9 * k);
    }
    // normalize=false => skala IR jest nasza: szczyt IR_PEAK
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] *= IR_PEAK / peak;
    return buf;
  }

  // IR szyny karabinu "st-max" (V3-C-15, wybrana odsluchem 2026-11-07): ogon dyfuzyjny 1.2 s pociety na
  // 4 pasma rozlozone w panoramie (osobny szum na kanal, autopan przeciwfazowy) + 4 slapbacki ping-pong.
  // Ciemna (300 Hz - 3.5 kHz), krotka i cicha - jasne, dlugie i glosne warianty odpadly w odsluchu.
  function makeGunIR(secs) {
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * secs));
    const buf = ctx.createBuffer(2, len, sr);
    const g = GUN_IR;
    const chans = [buf.getChannelData(0), buf.getChannelData(1)];
    // biquad RBJ (lowpass/highpass), liczony na probkach - tylko tu, przy starcie
    const biquad = (type, f, q = 0.7071) => {
      const s = { x1: 0, x2: 0, y1: 0, y2: 0 };
      const set = (fr) => {
        fr = Math.min(sr * 0.45, Math.max(10, fr));
        const w = 2 * Math.PI * fr / sr, c = Math.cos(w), a = Math.sin(w) / (2 * q);
        const b0 = type === 'lp' ? (1 - c) / 2 : (1 + c) / 2, b1 = type === 'lp' ? 1 - c : -(1 + c), a0 = 1 + a;
        s.b0 = b0 / a0; s.b1 = b1 / a0; s.b2 = b0 / a0; s.a1 = -2 * c / a0; s.a2 = (1 - a) / a0;
      };
      set(f);
      const run = (x) => {
        const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
        s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y;
        return y;
      };
      return { set, run };
    };
    const s0 = Math.floor(g.startS * sr), build = Math.max(1, Math.floor(g.buildS * sr));
    for (const [lo, hi, pan] of g.bands) {
      const gL = Math.cos((pan + 1) * Math.PI / 4), gR = Math.sin((pan + 1) * Math.PI / 4);
      const ph = random() * 2 * Math.PI;
      for (let ch = 0; ch < 2; ch++) {
        const d = chans[ch], gain = ch === 0 ? gL : gR, sign = ch === 0 ? 1 : -1;
        const hp = biquad('hp', lo), lp = biquad('lp', hi);
        for (let i = s0; i < len; i++) {
          const t = (i - s0) / sr;
          if ((i & 63) === 0) lp.set(hi * Math.pow(g.absorb, Math.min(1, t / g.rt60)));
          const u = Math.min(1, (i - s0) / build);
          const env = (u * u * (3 - 2 * u)) * Math.pow(10, -3 * t / g.rt60); // -60 dB po rt60
          const w = 1 + sign * g.wobbleDepth * Math.sin(2 * Math.PI * g.wobbleHz * i / sr + ph);
          d[i] += lp.run(hp.run(random() * 2 - 1)) * env * g.tailLevel * gain * w;
        }
      }
    }
    for (const [atS, level, lpHz, spreadS, pan] of g.slaps) {
      const gL = Math.cos((pan + 1) * Math.PI / 4), gR = Math.sin((pan + 1) * Math.PI / 4);
      const itd = Math.round(pan * 0.0007 * sr);
      const i0 = Math.floor(atS * sr), n = Math.max(1, Math.floor(spreadS * sr));
      for (let ch = 0; ch < 2; ch++) {
        const d = chans[ch], lp = biquad('lp', lpHz), gain = ch === 0 ? gL : gR, off = ch === 0 ? Math.max(0, itd) : Math.max(0, -itd);
        for (let i = 0; i < n * 4; i++) {
          const idx = i0 + off + i;
          if (idx >= len) break;
          d[idx] += lp.run(random() * 2 - 1) * Math.exp(-i / n) * level * gain;
        }
      }
    }
    let peak = 0;
    for (const d of chans) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (const d of chans) for (let i = 0; i < len; i++) d[i] *= IR_PEAK / peak;
    return buf;
  }

  // Szyna wet: send -> [pre-delay] -> konwolwer -> makeup -> master. Omija limiter dźwięków suchych,
  // a master (głośność/wyciszenie) steruje nią tak samo jak resztą.
  function makeReverb() {
    if (typeof ctx.createConvolver !== 'function') return null;
    const makeup = ctx.createGain();
    makeup.gain.value = WET_MAKEUP;
    // Wlasny, lagodny limiter na szynie wet: ogon ma przezyc (dlatego nie ten sam co na torze
    // suchym, ktory dociskal go zaraz po transjencie), ale wybuch z wet 1.1 nie moze klipowac.
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const guard = ctx.createDynamicsCompressor();
      try {
        guard.threshold.value = -6;
        guard.knee.value = 6;
        guard.ratio.value = 4;
        guard.attack.value = 0.005;
        guard.release.value = 0.25;
      } catch {}
      makeup.connect(guard);
      guard.connect(master);
    } else {
      makeup.connect(master);
    }
    const r = {};
    for (const [name, secs] of Object.entries(REVERB_S)) {
      const c = ctx.createConvolver();
      c.normalize = false;
      c.buffer = makeIR(secs, name === 'gun');
      c.connect(makeup);
      let input = c;
      if (typeof ctx.createDelay === 'function') {
        const pre = ctx.createDelay(0.1);
        pre.delayTime.value = PREDELAY_S[name];
        pre.connect(c);
        input = pre;
      }
      r[name] = input;
    }
    return r;
  }

  function unlock() {
    if (dead) return;
    try {
      if (!ctx) {
        ctx = ctxFactory();
        if (!ctx) {
          dead = true;
          return;
        }
        master = ctx.createGain();
        master.connect(ctx.destination);
        dry = ctx.createDynamicsCompressor(); // limiter tylko na torze suchym
        dry.connect(master);
        noise = { white: makeNoise('white'), brown: makeNoise('brown') };
        reverb = makeReverb();
        applyMaster();
      }
      if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
    } catch {
      dead = true;
      ctx = null;
      master = null;
      dry = null;
      reverb = null;
    }
  }

  function resume() {
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume?.()?.catch?.(() => {});
    } catch { /* cicho */ }
  }

  const jitter = () => 1 + (random() * 2 - 1) * DETUNE;

  function layer(l, t0, pitch, out, tier) {
    const t = t0 + (l.at ?? 0);
    const boost = tier === 3 ? 1.4 : 1;
    const env = ctx.createGain();
    const end = t + l.dur + (typeof l.tail === 'number' ? l.tail : 0);
    env.gain.setValueAtTime(FLOOR, t);
    env.gain.linearRampToValueAtTime(l.level * boost, t + (l.a ?? 0.002));
    env.gain.exponentialRampToValueAtTime(FLOOR, end);
    let tip = env;
    let src;
    if (l.n) {
      src = ctx.createBufferSource();
      src.buffer = noise[l.n];
      src.loop = true;
      src.playbackRate.value = pitch * (0.9 + random() * 0.2);
      src.connect(env);
      src.start(t, random() * 0.5);
    } else {
      src = ctx.createOscillator();
      src.type = l.t;
      const f0 = l.f0 * pitch;
      src.frequency.setValueAtTime(f0, t);
      if (l.f1) src.frequency.exponentialRampToValueAtTime(l.f1 * pitch, t + l.dur);
      src.connect(env);
      src.start(t);
      if (l.fm) {
        const mod = ctx.createOscillator();
        const depth = ctx.createGain();
        mod.frequency.value = l.fm.f;
        depth.gain.value = l.fm.depth;
        mod.connect(depth);
        depth.connect(src.frequency);
        mod.start(t);
        mod.stop(end + 0.02);
      }
    }
    const filt = (type, f, q) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f * pitch;
      if (q && b.Q) b.Q.value = q;
      tip.connect(b);
      tip = b;
      return b;
    };
    if (l.lp) {
      const b = filt('lowpass', l.lp, l.lpQ);
      if (l.lpTo) {
        b.frequency.setValueAtTime(l.lp * pitch, t);
        b.frequency.exponentialRampToValueAtTime(l.lpTo * pitch, t + l.dur);
      }
    }
    if (l.hp) filt('highpass', l.hp);
    if (l.bp) {
      const b = filt('bandpass', l.bp, l.q);
      if (l.bpTo) {
        b.frequency.setValueAtTime(l.bp * pitch, t);
        b.frequency.exponentialRampToValueAtTime(l.bpTo * pitch, t + l.dur);
      }
    }
    tip.connect(out);
    src.stop(end + 0.02);
    return end;
  }

  // own: własny dźwięk gracza — bez tłumienia odległością i głośniej.
  // dur: czas trwania (s) dla dźwięków rozciąganych, dziś tylko przeładowanie.
  function play(name, { dist = 0, tier, own = false, dur, x, camX, viewW } = {}) {
    let recipe = RECIPES[name];
    if (!recipe || !ctx || !master) return false;
    if (name === 'ult') recipe = ultRecipe(tier);
    if (name === 'reload') recipe = reloadRecipe(Number.isFinite(dur) && dur > 0 ? dur : RELOAD_FALLBACK_S);
    if (muted || volume <= 0) return false;
    const d = Number.isFinite(dist) ? Math.max(0, dist) : 0;
    if (!own && d >= MAX_DIST_TILES) return false; // V3-C-04
    const t = now();
    const prev = lastPlayed.get(name);
    if (prev !== undefined && t - prev < MIN_GAP_MS) return false;
    voices = voices.filter((end) => end > t);
    if (voices.length >= MAX_VOICES) return false;
    try {
      const att = own ? OWN_BOOST : (1 - d / MAX_DIST_TILES) ** 2;
      const out = ctx.createGain();
      out.gain.value = att;
      const dest = dry || master;
      // V3-C-08: pan wg pozycji zdarzenia względem kamery; własne dźwięki zostają na środku
      const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = own ? 0 : panFor(x, camX, viewW);
        out.connect(panner);
        panner.connect(dest);
      } else out.connect(dest);
      const bus = recipe.rev && reverb?.[recipe.rev];
      if (bus) {
        const send = ctx.createGain();
        send.gain.value = recipe.wet ?? 0.2; // out niesie już tłumienie odległością
        out.connect(send);
        send.connect(bus);
      }
      const t0 = ctx.currentTime;
      const pitch = jitter();
      let end = t0;
      for (const l of recipe) end = Math.max(end, layer(l, t0, pitch, out, tier));
      lastPlayed.set(name, t);
      voices.push(t + (end - t0) * 1000);
      return true;
    } catch {
      return false;
    }
  }

  return {
    unlock,
    resume,
    play,
    setVolume(v) {
      volume = Math.min(1, Math.max(0, Number(v) || 0));
      applyMaster();
    },
    setMuted(b) {
      muted = !!b;
      applyMaster();
    },
    getVolume: () => volume,
    isMuted: () => muted,
    // do testów i diagnostyki
    get voices() {
      const t = now();
      return voices.filter((end) => end > t).length;
    },
    get ready() {
      return !!ctx;
    },
  };
}
