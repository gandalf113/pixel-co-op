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
// Długości ogonów pogłosu (s): "klaps pomieszczenia" i wybuch w hali.
export const REVERB_S = { room: 0.25, hall: 1.3 };

// Warstwy: n = szum (white/brown), t = ton. `at` = przesunięcie w sekundach.
// Poziomy to ułamek pełnej skali przed masterem; limiter łapie szczyty.
// Trzy części rozstawione proporcjonalnie do czasu przeładowania `s` (maleje z poziomem broni).
function reloadRecipe(s) {
  const dur = Math.max(0.3, s);
  return Object.assign([
    // 1. wyjęcie magazynka: metaliczny klik
    { n: 'white', dur: 0.012, bp: 2800, level: 0.55 },
    { t: 'square', f0: 2400, dur: 0.004, level: 0.18 },
    // 2. wbicie nowego (~60%): głębszy "thunk"
    { t: 'sine', f0: 130, f1: 55, dur: 0.07, level: 0.5, at: dur * 0.6 },
    { n: 'brown', dur: 0.05, lp: 700, level: 0.5, at: dur * 0.6 },
    // 3. zamek: ostry szczęk równo z domknięciem pierścienia
    { n: 'white', dur: 0.02, hp: 1800, level: 0.7, at: Math.max(0, dur - 0.03) },
    { t: 'square', f0: 3200, dur: 0.006, level: 0.22, at: Math.max(0, dur - 0.03) },
    { t: 'square', f0: 900, f1: 600, dur: 0.03, level: 0.2, at: Math.max(0, dur - 0.025) },
  ], { rev: 'room', wet: 0.12 });
}

const RECIPES = {
  // rev/wet: do której szyny pogłosu i ile sygnału tam wysłać (ułamek głośności dźwięku)
  shot: Object.assign([
    { n: 'white', dur: 0.014, lp: 3500, level: 0.5 },
    { t: 'square', f0: 220, f1: 60, dur: 0.04, level: 0.22 },
  ], { rev: 'room', wet: 0.3 }),
  cannon: Object.assign([
    { n: 'white', dur: 0.02, lp: 1800, level: 0.55 },
    { t: 'square', f0: 150, f1: 40, dur: 0.06, level: 0.28, lp: 1800 },
  ], { rev: 'room', wet: 0.3 }),
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
  destroyed: Object.assign([
    { n: 'brown', dur: 0.4, lp: 800, lpTo: 200, level: 0.7 },
    { n: 'white', dur: 0.02, level: 0.4 },
  ], { rev: 'hall', wet: 0.45 }),
  explode: Object.assign([
    { n: 'brown', dur: 0.7, lp: 800, lpTo: 200, level: 0.4 },
    { t: 'sine', f0: 60, f1: 30, dur: 0.5, level: 0.6 },
  ], { rev: 'hall', wet: 0.8 }),
  pickup: [{ t: 'sine', f0: 440, f1: 880, dur: 0.08, level: 0.25 }],
  place: [
    { t: 'square', f0: 200, dur: 0.04, level: 0.22 },
    { n: 'white', dur: 0.004, hp: 1500, level: 0.4 },
  ],
  drop: [{ t: 'sine', f0: 150, f1: 90, dur: 0.09, level: 0.3 }],
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
  ult: [
    { t: 'sawtooth', f0: 100, f1: 1200, dur: 0.3, level: 0.2, fm: { f: 40, depth: 80 } },
    { n: 'white', dur: 0.3, bp: 1500, level: 0.25, tail: true },
  ],
  down: [{ t: 'sine', f0: 300, f1: 80, dur: 0.5, level: 0.4, tail: 0.3 }],
  death: [{ t: 'sine', f0: 260, f1: 60, dur: 0.6, level: 0.45, tail: 0.4 }],
  revive: [
    { t: 'sine', f0: 440, dur: 0.07, level: 0.25 },
    { t: 'sine', f0: 554, dur: 0.07, level: 0.25, at: 0.07 },
    { t: 'sine', f0: 659, dur: 0.1, level: 0.25, at: 0.14 },
  ],
  expire: [{ t: 'sine', f0: 400, f1: 200, dur: 0.15, level: 0.15 }],
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

export function createSfx({ now = defaultNow, ctxFactory = defaultCtxFactory, random = Math.random } = {}) {
  let ctx = null;
  let dead = false; // próba utworzenia kontekstu się nie udała — nie ponawiamy
  let master = null;
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
  function makeIR(secs) {
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
    return buf;
  }

  function makeReverb() {
    if (typeof ctx.createConvolver !== 'function') return null;
    const r = {};
    for (const [name, secs] of Object.entries(REVERB_S)) {
      const c = ctx.createConvolver();
      c.buffer = makeIR(secs);
      c.connect(master);
      r[name] = c;
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
        const limiter = ctx.createDynamicsCompressor();
        master.connect(limiter);
        limiter.connect(ctx.destination);
        noise = { white: makeNoise('white'), brown: makeNoise('brown') };
        reverb = makeReverb();
        applyMaster();
      }
      if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
    } catch {
      dead = true;
      ctx = null;
      master = null;
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
    env.gain.linearRampToValueAtTime(l.level * boost, t + 0.002);
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
    const filt = (type, f) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f * pitch;
      tip.connect(b);
      tip = b;
      return b;
    };
    if (l.lp) {
      const b = filt('lowpass', l.lp);
      if (l.lpTo) {
        b.frequency.setValueAtTime(l.lp * pitch, t);
        b.frequency.exponentialRampToValueAtTime(l.lpTo * pitch, t + l.dur);
      }
    }
    if (l.hp) filt('highpass', l.hp);
    if (l.bp) filt('bandpass', l.bp);
    tip.connect(out);
    src.stop(end + 0.02);
    return end;
  }

  // own: własny dźwięk gracza — bez tłumienia odległością i głośniej.
  // dur: czas trwania (s) dla dźwięków rozciąganych, dziś tylko przeładowanie.
  function play(name, { dist = 0, tier, own = false, dur } = {}) {
    let recipe = RECIPES[name];
    if (!recipe || !ctx || !master) return false;
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
      out.connect(master);
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
