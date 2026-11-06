import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Predictor, SnapshotBuffer, lerpEntities } from '../public/client/predict.js';
import { buildGrid } from '../public/shared/world.js';
import { stepPlayer, playerSpeedPx } from '../public/shared/movement.js';
import { balance } from './helpers.js';

const grid = buildGrid(balance.map.tilesW, balance.map.tilesH, []);
const ctx = { grid, heldKind: null, canMove: true };
const dt = 1 / balance.tickHz;
const step = (pos, n) => {
  for (let i = 0; i < n; i++) pos = stepPlayer(pos, { mx: 1, my: 0 }, dt, playerSpeedPx(balance, null), grid, balance);
  return pos;
};

function fiveInputs() {
  const pr = new Predictor(balance);
  pr.reconcile({ x: 100, y: 100 }, 0, ctx);
  for (let seq = 1; seq <= 5; seq++) pr.apply({ seq, mx: 1, my: 0 }, ctx);
  return pr;
}

test('prediction replays pending inputs', () => {
  const pr = fiveInputs();
  assert.deepEqual(pr.pos, step({ x: 100, y: 100 }, 5));
  const server = step({ x: 100, y: 100 }, 2);
  const pos = pr.reconcile(server, 2, ctx);
  const expected = step(server, 3);
  assert.ok(Math.abs(pos.x - expected.x) < 1e-9);
  assert.equal(pos.y, expected.y);
});

test('reconcile drops acked', () => {
  const pr = fiveInputs();
  pr.reconcile({ x: 50, y: 60 }, 5, ctx);
  assert.equal(pr.pending.length, 0);
  assert.deepEqual(pr.pos, { x: 50, y: 60 });
});

test('cannot move uses server pos', () => {
  const pr = fiveInputs();
  const pos = pr.reconcile({ x: 70, y: 80 }, 2, { ...ctx, canMove: false });
  assert.deepEqual(pos, { x: 70, y: 80 });
  assert.deepEqual(pr.apply({ seq: 6, mx: 1, my: 0 }, { ...ctx, canMove: false }), { x: 70, y: 80 });
});

test('buffer interpolates', () => {
  const buf = new SnapshotBuffer();
  buf.push({ x: 0 }, 0);
  buf.push({ x: 10 }, 50);
  const s = buf.sample(125);
  assert.equal(s.a.x, 0);
  assert.equal(s.b.x, 10);
  assert.ok(Math.abs(s.alpha - 0.5) < 1e-9);
  assert.equal(buf.sample(0).alpha, 0);
  assert.equal(buf.sample(10_000).b.x, 10);
  assert.equal(new SnapshotBuffer().sample(0), null);
});

test('angle lerps shortest arc', () => {
  const key = { id: 'id', x: 'x', y: 'y', angle: 'angle' };
  const [p] = lerpEntities([{ id: 1, x: 0, y: 0, angle: 3.1 }], [{ id: 1, x: 10, y: 0, angle: -3.1 }], 0.5, key);
  assert.ok(Math.abs(Math.abs(p.angle) - Math.PI) < 0.01);
  assert.equal(p.x, 5);
});

test('array entities lerp by index and new ones appear as-is', () => {
  const key = { id: 0, x: 2, y: 3 };
  const out = lerpEntities([[1, 'slime', 0, 0]], [[1, 'slime', 10, 20], [2, 'runner', 5, 5]], 0.5, key);
  assert.deepEqual(out, [[1, 'slime', 5, 10], [2, 'runner', 5, 5]]);
});

// --- V3-O-06: wygladzanie korekty ---
import { CORRECTION_SNAP_PX, INTERP_MIN_MS, INTERP_MAX_MS, INTERP_RATE_MS_PER_S, RttTracker, RateMeter } from '../public/client/predict.js';
import { debugLines } from '../public/client/debug.js';

const FRAME = 1 / 60;
function settled(x = 100, y = 100) {
  const pr = new Predictor(balance);
  pr.reconcile({ x, y }, 0, ctx);
  return pr;
}

test('small correction is spread over frames', () => {
  const pr = settled();
  pr.reconcile({ x: 110, y: 100 }, 0, ctx); // serwer: +10 px
  assert.deepEqual(pr.pos, { x: 110, y: 100 }); // prawda od razu
  assert.equal(pr.viewPos.x, 100); // rysowanie jeszcze w starym miejscu
  const v1 = pr.smooth(FRAME);
  assert.ok(v1.x > 100 && v1.x < 110, `po 1 klatce miedzy: ${v1.x}`);
  let v = v1;
  for (let i = 0; i < 12; i++) v = pr.smooth(FRAME);
  assert.ok(Math.abs(v.x - 110) < 0.5, `zbiega: ${v.x}`);
});

test('large correction is instant', () => {
  const pr = settled();
  pr.reconcile({ x: 100 + CORRECTION_SNAP_PX + 1, y: 100 }, 0, ctx);
  assert.deepEqual(pr.viewPos, pr.pos);
  assert.equal(pr.smooth(FRAME).x, 100 + CORRECTION_SNAP_PX + 1);
});

test('prediction continues from true server pos, not smoothed one', () => {
  const pr = settled();
  pr.reconcile({ x: 110, y: 100 }, 0, ctx);
  pr.smooth(FRAME);
  const before = pr.viewPos.x;
  assert.ok(before < 110);
  for (let seq = 1; seq <= 4; seq++) pr.apply({ seq, mx: 1, my: 0 }, ctx);
  const expected = step({ x: 110, y: 100 }, 4);
  assert.ok(Math.abs(pr.pos.x - expected.x) < 1e-9);
  assert.equal(pr.pos.y, expected.y);
  // widok = prawda + zanikajacy offset, nigdy odwrotnie
  assert.ok(pr.viewPos.x < pr.pos.x);
  for (let i = 0; i < 30; i++) pr.smooth(FRAME);
  assert.ok(Math.abs(pr.viewPos.x - pr.pos.x) < 0.05);
});

test('input stays immediate while a correction is pending', () => {
  const pr = settled();
  pr.reconcile({ x: 110, y: 100 }, 0, ctx);
  const x0 = pr.viewPos.x;
  pr.apply({ seq: 1, mx: 1, my: 0 }, ctx);
  assert.ok(pr.viewPos.x > x0); // ruch widoczny natychmiast w tej samej klatce
});

// --- V3-O-07: adaptacyjny bufor ---
function feed(buf, gaps, start = 0) {
  let t = start;
  for (const g of gaps) {
    t += g;
    buf.push({ x: t }, t);
  }
  return t;
}
function run(buf, from, seconds) {
  let t = from;
  for (let i = 0; i < seconds * 60; i++) {
    t += 1000 / 60;
    buf.sample(t);
  }
  return t;
}

test('steady link: delay settles at lower bound', () => {
  const buf = new SnapshotBuffer();
  const t = feed(buf, Array(40).fill(50));
  run(buf, t, 5);
  assert.equal(buf.delayMs, INTERP_MIN_MS);
});

test('jittery link: delay rises, never above max', () => {
  const buf = new SnapshotBuffer();
  const gaps = Array.from({ length: 40 }, (_, i) => (i % 2 ? 110 : 10));
  const t = feed(buf, gaps);
  const steady = buf.targetDelayMs;
  assert.ok(steady > 100);
  run(buf, t, 10);
  assert.ok(buf.delayMs > 100 && buf.delayMs <= INTERP_MAX_MS);
  const wild = new SnapshotBuffer();
  const t2 = feed(wild, Array.from({ length: 40 }, (_, i) => (i % 2 ? 500 : 1)));
  run(wild, t2, 30);
  assert.equal(wild.delayMs, INTERP_MAX_MS);
});

test('delay change is rate limited', () => {
  const buf = new SnapshotBuffer();
  const t = feed(buf, Array(40).fill(50));
  buf.sample(t);
  const d0 = buf.delayMs; // 100
  const next = t + 1000 / 60;
  buf.sample(next);
  assert.ok(Math.abs(buf.delayMs - d0) <= INTERP_RATE_MS_PER_S / 60 + 1e-9);
  // nawet po dlugiej pauzie klatek krok jest ograniczony (dt przyciete do 0.1 s)
  const before = buf.delayMs;
  buf.sample(next + 10000);
  assert.ok(Math.abs(buf.delayMs - before) <= INTERP_RATE_MS_PER_S * 0.1 + 1e-9);
});

test('no new snapshots: holds last state, no extrapolation, delay stays in range', () => {
  const buf = new SnapshotBuffer();
  const t = feed(buf, Array(10).fill(50));
  for (const dt of [200, 1000, 60000]) {
    const s = buf.sample(t + dt);
    assert.equal(s.alpha, 0);
    assert.equal(s.a, s.b);
    assert.equal(s.a.x, t);
  }
  assert.ok(buf.delayMs >= INTERP_MIN_MS && buf.delayMs <= INTERP_MAX_MS);
});

test('RTT from input acks and debug lines', () => {
  const r = new RttTracker();
  r.sent(1, 0);
  r.sent(2, 16);
  assert.equal(r.acked(2, 80), 64);
  assert.equal(r.sentAt.size, 0);
  assert.equal(debugLines({ rttMs: null, kbps: 6.54, delayMs: 60, buffered: 3, fps: 59.6 })[0], 'RTT -- ms');
  const m = new RateMeter(1000);
  m.update(0, 0);
  assert.equal(Math.round(m.update(2048, 1000)), 2);
});
