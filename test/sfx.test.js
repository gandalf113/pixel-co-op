import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx, MAX_VOICES, MIN_GAP_MS } from '../public/client/sfx.js';

// Atrapa Web Audio: liczy węzły i zapamiętuje, co zapisano w parametrach.
function makeCtx() {
  const ctx = { created: [], gains: [], state: 'running', currentTime: 0, sampleRate: 1000, destination: { dest: true }, resumed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (kind, extra = {}) => {
    const n = { kind, connect(to) { (n.to ??= []).push(to); }, start(t) { (n.starts ??= []).push(t); }, stop(t) { (n.stops ??= []).push(t); }, ...extra };
    ctx.created.push(n);
    return n;
  };
  ctx.createGain = () => {
    const n = node('gain', { gain: param() });
    ctx.gains.push(n);
    return n;
  };
  ctx.createDynamicsCompressor = () => node('comp');
  ctx.createBiquadFilter = () => node('filter', { frequency: param() });
  ctx.createOscillator = () => node('osc', { frequency: param() });
  ctx.createBufferSource = () => node('src', { playbackRate: param() });
  ctx.createBuffer = (ch, len) => node('buffer', { len, getChannelData: () => new Float32Array(len) });
  ctx.createConvolver = () => node('convolver', { buffer: null, normalize: true });
  ctx.createDelay = (max) => node('delay', { max, delayTime: { value: 0 } });
  ctx.createStereoPanner = () => node('panner', { pan: { value: 0 } });
  ctx.resume = async () => { ctx.resumed++; };
  return ctx;
}

function setup() {
  const ctx = makeCtx();
  const clock = { t: 1000 };
  let made = 0;
  const sfx = createSfx({ now: () => clock.t, ctxFactory: () => { made++; return ctx; } });
  return { ctx, clock, sfx, made: () => made };
}

test('przed unlock() nic nie powstaje', () => {
  const { ctx, sfx, made } = setup();
  assert.equal(sfx.play('shot'), false);
  assert.equal(made(), 0);
  assert.equal(ctx.created.length, 0);
  sfx.unlock();
  assert.equal(made(), 1);
  sfx.unlock();
  assert.equal(made(), 1);
});

test('nieznana nazwa nie wywala się', () => {
  const { sfx } = setup();
  sfx.unlock();
  assert.equal(sfx.play('nie-ma-takiego'), false);
  assert.equal(sfx.play(undefined), false);
});

test('odstęp minimalny między tym samym dźwiękiem', () => {
  const { clock, sfx } = setup();
  sfx.unlock();
  assert.equal(sfx.play('shot'), true);
  clock.t += 5;
  assert.equal(sfx.play('shot'), false);
  assert.equal(sfx.voices, 1);
  clock.t += 295; // ogon karabinu trwa ~0.2 s
  assert.equal(sfx.play('shot'), true);
  assert.equal(sfx.voices, 1, "pierwszy strzał już wybrzmiał");
  assert.equal(sfx.play('hit'), true, 'inny dźwięk ma własny odstęp');
});

test('limit głosów nie jest przekraczany', () => {
  const { clock, sfx } = setup();
  sfx.unlock();
  const names = ['explode', 'death', 'down', 'destroyed'];
  for (let i = 0; i < 100; i++) {
    clock.t += 10; // 4 długie dźwięki po kolei: każdy wraca co 40 ms, ogony trwają 0.5-0.7 s
    sfx.play(names[i % names.length]);
    assert.ok(sfx.voices <= MAX_VOICES);
  }
  assert.equal(sfx.voices, MAX_VOICES);
});

test('tłumienie odległością', () => {
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  const run = (dist) => {
    clock.t += 1000;
    const before = ctx.gains.length;
    const ok = sfx.play('shot', { dist });
    return ok ? ctx.gains[before].gain.value : null;
  };
  const near = run(0);
  const mid = run(10);
  assert.ok(near > mid && mid > 0);
  assert.equal(run(25), null);
  assert.equal(run(20), null);
  const created = ctx.created.length;
  clock.t += 1000;
  sfx.play('shot', { dist: 30 });
  assert.equal(ctx.created.length, created, 'zero węzłów dla zbyt dalekiego dźwięku');
});

test('wyciszenie i głośność sterują masterem', () => {
  const { ctx, clock, sfx } = setup();
  sfx.setVolume(0.5); // przed unlock — ma zostać zapamiętane
  sfx.unlock();
  const master = ctx.gains[0];
  assert.equal(master.gain.value, 0.5);
  sfx.setVolume(0.25);
  assert.equal(master.gain.value, 0.25);
  sfx.setMuted(true);
  assert.equal(master.gain.value, 0);
  assert.equal(sfx.play('shot'), false);
  sfx.setMuted(false);
  assert.equal(master.gain.value, 0.25);
  clock.t += 100;
  assert.equal(sfx.play('shot'), true);
  sfx.setVolume(5);
  assert.equal(master.gain.value, 1);
});

test('bufory szumu powstają raz, nie per zdarzenie', () => {
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  const buffers = () => ctx.created.filter((n) => n.kind === 'buffer').length;
  const n = buffers();
  for (let i = 0; i < 5; i++) { clock.t += 100; sfx.play('shot'); }
  assert.equal(buffers(), n);
});

test('brak AudioContext lub wyjątek w fabryce = cicha atrapa', () => {
  const none = createSfx({ ctxFactory: () => null });
  none.unlock();
  assert.equal(none.play('shot'), false);
  const boom = createSfx({ ctxFactory: () => { throw new Error('x'); } });
  assert.doesNotThrow(() => { boom.unlock(); boom.resume(); boom.setVolume(1); boom.setMuted(true); });
  assert.equal(boom.play('shot'), false);
});

test('resume() wznawia zawieszony kontekst', () => {
  const { ctx, sfx } = setup();
  sfx.unlock();
  ctx.state = 'suspended';
  sfx.resume();
  assert.equal(ctx.resumed, 1);
});

test('pogłos: nic przed unlock(), bufory IR liczone raz, szyna kończy w masterze', () => {
  const { ctx, clock, sfx } = setup();
  assert.equal(ctx.created.filter((n) => n.kind === 'convolver').length, 0);
  sfx.unlock();
  const conv = ctx.created.filter((n) => n.kind === 'convolver');
  assert.equal(conv.length, 3); // room, gun, hall
  const makeup = conv[0].to[0];
  assert.ok(conv.every((c) => c.buffer && c.to[0] === makeup), 'wet przez wspólny makeup');
  // Wet kończy w masterze (głośność steruje pogłosem), ale przez WŁASNY, łagodny limiter —
  // nie przez ten od dźwięków suchych, który dociskał ogon zaraz po transjencie.
  const wetGuard = makeup.to.find((n) => n.kind === 'comp');
  const reachesMaster = makeup.to.includes(ctx.gains[0]) || wetGuard?.to?.includes(ctx.gains[0]);
  assert.ok(reachesMaster, 'makeup kończy w masterze (głośność steruje pogłosem)');
  assert.ok(!ctx.created.some((n) => n.kind === 'comp' && n.to?.includes(makeup)), 'nic nie wpina limitera PRZED wet');
  if (wetGuard) {
    const dryLimiter = ctx.created.find((n) => n.kind === 'comp' && n !== wetGuard);
    assert.ok(dryLimiter && dryLimiter !== wetGuard, 'wet ma własny limiter, nie ten od toru suchego');
    if (wetGuard.threshold) assert.ok(wetGuard.threshold.value > -24, 'limiter wet łagodniejszy');
  }
  assert.ok(conv[2].buffer.len > conv[0].buffer.len * 3, 'hala dłuższa niż pokój');
  const buffers = () => ctx.created.filter((n) => n.kind === 'buffer').length;
  const n = buffers();
  for (let i = 0; i < 4; i++) { clock.t += 1000; sfx.play('shot'); sfx.play('explode'); }
  assert.equal(buffers(), n);
  sfx.unlock();
  assert.equal(ctx.created.filter((x) => x.kind === 'convolver').length, 3);
});

test('pogłos: strzał dostaje mało wet, wybuch dużo, dźwięk bez szyny nic', () => {
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  const sendOf = (name) => {
    clock.t += 1000;
    const before = ctx.gains.length;
    sfx.play(name);
    const out = ctx.gains[before];
    const send = out.to.find((t) => t.kind === 'gain' && t !== ctx.gains[0]);
    if (send && !send.to.some((n) => n.kind === 'delay')) throw new Error('send bez pre-delay');
    return send ? send.gain.value : 0;
  };
  const shot = sendOf('shot');
  const boom = sendOf('explode');
  assert.ok(shot > 0 && boom > shot * 2, 'wybuch wielokrotnie więcej wet niż strzał');
  assert.equal(sendOf('pickup'), 0);
});

test('kontekst bez ConvolverNode nadal gra na sucho', () => {
  const { ctx, clock, sfx } = setup();
  delete ctx.createConvolver;
  sfx.unlock();
  clock.t += 100;
  assert.equal(sfx.play('explode'), true);
});

test('przeładowanie: cztery zdarzenia rozłożone w podanym czasie, wbicie najgłośniejsze', async () => {
  const { reloadRecipe } = await import('../public/client/sfx.js');
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  for (const dur of [1.5, 0.9]) {
    clock.t += 5000;
    const from = ctx.created.length;
    assert.equal(sfx.play('reload', { dur }), true);
    const t = ctx.created.slice(from).filter((n) => n.kind === 'osc' || n.kind === 'src').flatMap((n) => n.starts);
    assert.equal(Math.min(...t), 0, 'zatrzask na 0%');
    assert.ok(t.some((x) => Math.abs(x - dur * 0.1) < 1e-9), 'wysunięcie 10%');
    assert.ok(t.some((x) => Math.abs(x - dur * 0.6) < 1e-9), 'wbicie 60%');
    assert.ok(Math.abs(Math.max(...t) - (dur - 0.03)) < 1e-9, `zamek na końcu (${dur})`);
    const sums = new Map();
    for (const l of reloadRecipe(dur)) sums.set(l.at ?? 0, (sums.get(l.at ?? 0) ?? 0) + l.level);
    assert.equal(sums.size, 4);
    const top = [...sums.entries()].sort((a, b) => b[1] - a[1])[0][0];
    assert.ok(Math.abs(top - dur * 0.6) < 1e-9, 'najgłośniejsze: wbicie');
  }
});

test('pogłos: normalize=false, pre-delay 12/40/35 ms, IR skalowane do szczytu', () => {
  const { ctx, sfx } = setup();
  sfx.unlock();
  const conv = ctx.created.filter((n) => n.kind === 'convolver');
  assert.ok(conv.every((c) => c.normalize === false));
  const delays = ctx.created.filter((n) => n.kind === 'delay');
  assert.deepEqual(delays.map((d) => d.delayTime.value), [0.012, 0.04, 0.035]);
  assert.ok(delays.every((d, i) => d.to.includes(conv[i])));
});

test('karabin: pięć warstw i ogon wyraźnie dłuższy niż 40 ms', () => {
  const { ctx, sfx } = setup();
  sfx.unlock();
  const from = ctx.created.length;
  assert.equal(sfx.play('shot'), true);
  const src = ctx.created.slice(from).filter((n) => n.kind === 'osc' || n.kind === 'src');
  assert.equal(src.length, 5);
  const end = Math.max(...src.flatMap((n) => n.stops)) - 0.02;
  assert.ok(end > 0.15, `trwa ${end}`);
});

function ultInfo(tier) {
  const { ctx, sfx } = setup();
  sfx.unlock();
  const from = ctx.created.length;
  assert.equal(sfx.play('ult', { tier }), true);
  const nodes = ctx.created.slice(from);
  const src = nodes.filter((n) => n.kind === 'osc' || n.kind === 'src');
  const send = nodes.find((n) => n.kind === 'gain' && n.to?.some((x) => x.kind === 'delay'));
  return { end: Math.max(...src.flatMap((n) => n.stops)), wet: send.gain.value, layers: src.length, nodes, ctx };
}

test('ultimate: próg III dłuższy, bogatszy i z większym wet niż próg I', () => {
  const a = ultInfo(1);
  const c = ultInfo(3);
  assert.ok(c.end > a.end + 0.1, `${c.end} vs ${a.end}`);
  assert.ok(c.layers > a.layers);
  assert.ok(c.wet > a.wet);
});

test('ultimate: próg III głośniejszy (poziomy obwiedni)', () => {
  const peak = (tier) => {
    const { ctx, sfx } = setup();
    const lv = [];
    const mk = ctx.createGain;
    ctx.createGain = () => {
      const g = mk();
      g.gain.linearRampToValueAtTime = (v) => lv.push(v);
      return g;
    };
    sfx.unlock();
    sfx.play('ult', { tier });
    return lv.reduce((a, b) => a + b, 0);
  };
  assert.ok(peak(3) > peak(1));
});

test('panoramowanie: lewo < 0, prawo > 0, własne 0, brak danych 0', () => {
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  const pan = (opts) => {
    clock.t += 1000;
    const from = ctx.created.length;
    assert.equal(sfx.play('shot', opts), true);
    return ctx.created.slice(from).find((n) => n.kind === 'panner').pan.value;
  };
  const cam = { camX: 500, viewW: 560 };
  assert.ok(pan({ x: 300, ...cam }) < 0);
  assert.ok(pan({ x: 700, ...cam }) > 0);
  assert.equal(pan({ x: 700, ...cam, own: true }), 0);
  assert.equal(pan({}), 0);
  assert.ok(Math.abs(pan({ x: 9999, ...cam }) - 0.85) < 1e-9, 'przycięte do 0.85');
});

test('brak StereoPannerNode: play gra bez panoramowania', () => {
  const { ctx, clock, sfx } = setup();
  delete ctx.createStereoPanner;
  sfx.unlock();
  clock.t += 100;
  assert.equal(sfx.play('shot', { x: 100, camX: 500, viewW: 560 }), true);
});

test('przeładowanie: własne głośniejsze i bez tłumienia, cudze milknie powyżej 20', () => {
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  const gain = (opts) => {
    clock.t += 5000;
    const before = ctx.gains.length;
    const ok = sfx.play('reload', { dur: 1.5, ...opts });
    return ok ? ctx.gains[before].gain.value : null;
  };
  const own = gain({ own: true, dist: 30 });
  const near = gain({ dist: 0 });
  assert.ok(own > near, 'własne głośniejsze nawet od cudzego z dist 0');
  assert.ok(gain({ dist: 10 }) < near);
  assert.equal(gain({ dist: 21 }), null);
  assert.equal(gain({ dist: 20 }), null);
});

test('dźwięki obrażeń istnieją i różnią się od trafienia potwora', async () => {
  const { SFX_NAMES } = await import('../public/client/sfx.js');
  for (const n of ['hurtMe', 'hurtMeLow', 'hurtAlly', 'hit']) assert.ok(SFX_NAMES.includes(n), n);
  const { clock, sfx } = setup();
  sfx.unlock();
  for (const n of ['hurtMe', 'hurtMeLow', 'hurtAlly']) { clock.t += 100; assert.equal(sfx.play(n, { own: n !== 'hurtAlly' }), true); }
});

// V3-C-13: karabin ciszej, osobna szyna z dłuższym ogonem i wyraźnym pre-delay.
test('karabin: osobna szyna, IR między pokojem a halą, pre-delay 35-45 ms', async () => {
  const { REVERB_S, PREDELAY_S } = await import('../public/client/sfx.js');
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  const conv = ctx.created.filter((n) => n.kind === 'convolver');
  const delays = ctx.created.filter((n) => n.kind === 'delay');
  const [room, gun, hall] = conv;
  assert.ok(gun.buffer.len > room.buffer.len && gun.buffer.len < hall.buffer.len, 'IR strzału: dłuższy niż pokój, krótszy niż hala');
  assert.ok(REVERB_S.gun >= 0.5 && REVERB_S.gun <= 0.6);
  const pre = delays.find((d) => d.to.includes(gun)).delayTime.value;
  assert.ok(pre >= 0.035 && pre <= 0.045, `pre-delay strzału ${pre}`);
  assert.equal(PREDELAY_S.gun, pre);
  // strzał rzeczywiście trafia na tę szynę, a nie na pokój
  clock.t += 1000;
  const before = ctx.gains.length;
  sfx.play('shot');
  const send = ctx.gains[before].to.find((t) => t.kind === 'gain' && t !== ctx.gains[0]);
  assert.ok(delays.find((d) => d.to.includes(gun)) && send.to.includes(delays.find((d) => d.to.includes(gun))), 'strzał -> szyna gun');
});

test('karabin: suma poziomów warstw wyraźnie niższa niż przed V3-C-13 (2.33)', () => {
  const { ctx, clock, sfx } = setup();
  sfx.unlock();
  clock.t += 1000;
  // poziom warstwy = cel linearRamp na jej obwiedni; przechwytujemy go w atrapie
  const levels = [];
  const orig = ctx.createGain;
  ctx.createGain = () => {
    const n = orig();
    n.gain.linearRampToValueAtTime = (v) => levels.push(v);
    return n;
  };
  assert.equal(sfx.play('shot'), true);
  assert.equal(levels.length, 5, 'pięć warstw');
  const sum = levels.reduce((a, b) => a + b, 0);
  assert.ok(sum <= 2.33 * 0.72, `suma ${sum} musi być <= 1.68 (>= 28% ciszej niż 2.33)`);
  assert.ok(sum >= 1.0, 'ale nie wyzerowana');
});

test('nowe recepty swiata istnieja i graja; dwa w odstepie < MIN_GAP_MS to jeden glos', () => {
  for (const name of ['reveal', 'ninjaTele', 'ninjaCharge', 'split']) {
    const { clock, sfx } = setup();
    sfx.unlock();
    assert.equal(sfx.play(name, { dist: 3, x: 100, camX: 0, viewW: 400 }), true, name);
    assert.equal(sfx.voices, 1);
    clock.t += MIN_GAP_MS - 1;
    assert.equal(sfx.play(name), false, `${name}: seria`);
    assert.equal(sfx.voices, 1);
    clock.t += 2;
    assert.equal(sfx.play(name), true);
  }
});
