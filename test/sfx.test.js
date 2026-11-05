import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx, MAX_VOICES } from '../public/client/sfx.js';

// Atrapa Web Audio: liczy węzły i zapamiętuje, co zapisano w parametrach.
function makeCtx() {
  const ctx = { created: [], gains: [], state: 'running', currentTime: 0, sampleRate: 1000, destination: { dest: true }, resumed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (kind, extra = {}) => {
    const n = { kind, connect() {}, start() {}, stop() {}, ...extra };
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
  ctx.createBuffer = (ch, len) => node('buffer', { getChannelData: () => new Float32Array(len) });
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
  clock.t += 95;
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
