import { stepPlayer, playerSpeedPx } from '../shared/movement.js';

const BUFFER_MS = 1000;
const INTERP_DELAY_MS = 100;

// Wygladzanie korekty (V3-O-06). Rozbieznosc do SNAP_PX jest rozkladana wykladniczo ze stala czasowa TAU_S
// (~4 klatki @60 fps do 98%); wieksza (teleport, respawn, wybuch) jest natychmiastowa.
export const CORRECTION_SNAP_PX = 24;
export const CORRECTION_TAU_S = 0.06;

// Adaptacyjne opoznienie interpolacji (V3-O-07).
export const INTERP_MIN_MS = 60;
export const INTERP_MAX_MS = 150;
export const INTERP_RATE_MS_PER_S = 40;
const INTERVAL_WINDOW = 40;
const MAX_FRAME_S = 0.1;
const MAX_INTERVAL_MS = 500;

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export class Predictor {
  constructor(balance) {
    this.balance = balance;
    this.pending = [];
    this.current = null; // prawdziwa pozycja: na niej pracuje predykcja
    this.err = { x: 0, y: 0 }; // zanikajacy offset: tylko dla rysowania
  }

  get pos() {
    return this.current;
  }

  // Pozycja do RYSOWANIA (prawdziwa + niedoszla korekta). Nigdy nie wraca do predykcji.
  get viewPos() {
    if (!this.current) return null;
    return { x: this.current.x + this.err.x, y: this.current.y + this.err.y };
  }

  // Wolac raz na klatke renderu.
  smooth(dtSec) {
    const k = Math.exp(-Math.max(0, dtSec) / CORRECTION_TAU_S);
    this.err.x *= k;
    this.err.y *= k;
    if (Math.abs(this.err.x) < 0.01) this.err.x = 0;
    if (Math.abs(this.err.y) < 0.01) this.err.y = 0;
    return this.viewPos;
  }

  apply(input, ctx) {
    this.pending.push(input);
    if (this.current && ctx.canMove) this.current = this.#step(this.current, input, ctx);
    return this.current;
  }

  reconcile(serverPos, ackSeq, ctx) {
    this.pending = this.pending.filter((i) => i.seq > ackSeq);
    let pos = { x: serverPos.x, y: serverPos.y };
    if (ctx.canMove) for (const input of this.pending) pos = this.#step(pos, input, ctx);
    // Offset = to, co gracz widzial przed korekta, minus nowa prawda; duzy rozjazd = bez wygladzania.
    if (this.current) {
      const dx = this.current.x + this.err.x - pos.x;
      const dy = this.current.y + this.err.y - pos.y;
      const small = Math.hypot(dx, dy) <= CORRECTION_SNAP_PX;
      this.err = small ? { x: dx, y: dy } : { x: 0, y: 0 };
    } else {
      this.err = { x: 0, y: 0 };
    }
    this.current = pos;
    return pos;
  }

  #step(pos, input, ctx) {
    const b = this.balance;
    return stepPlayer(pos, input, 1 / b.tickHz, playerSpeedPx(b, ctx.heldKind, ctx.speedMult ?? 1), ctx.grid, b);
  }
}

export class SnapshotBuffer {
  constructor() {
    this.list = [];
    this.intervals = [];
    this.lastRecv = null;
    this.delayMs = INTERP_DELAY_MS;
    this.lastSampleMs = null;
  }

  get size() {
    return this.list.length;
  }

  // Jitter = p90 odchylenia odstepu miedzy snapshotami od mediany odstepow.
  get jitterMs() {
    const med = this.medianIntervalMs;
    if (med === null) return 0;
    return percentile(this.intervals.map((d) => Math.abs(d - med)).sort((a, b) => a - b), 0.9);
  }

  get medianIntervalMs() {
    if (this.intervals.length < 5) return null;
    return percentile([...this.intervals].sort((a, b) => a - b), 0.5);
  }

  // Cel: jeden typowy odstep (zeby miec dwa snapshoty do interpolacji) + 2x jitter zapasu.
  get targetDelayMs() {
    const med = this.medianIntervalMs;
    if (med === null) return INTERP_DELAY_MS;
    return Math.min(INTERP_MAX_MS, Math.max(INTERP_MIN_MS, med + 2 * this.jitterMs));
  }

  push(snap, recvMs) {
    if (this.lastRecv !== null && recvMs > this.lastRecv) {
      this.intervals.push(Math.min(MAX_INTERVAL_MS, recvMs - this.lastRecv));
      if (this.intervals.length > INTERVAL_WINDOW) this.intervals.shift();
    }
    this.lastRecv = recvMs;
    this.list.push({ snap, ms: recvMs });
    while (this.list.length > 2 && recvMs - this.list[0].ms > BUFFER_MS) this.list.shift();
  }

  sample(renderMs) {
    const l = this.list;
    if (l.length === 0) return null;
    this.#adapt(renderMs);
    const t = renderMs - this.delayMs;
    if (t <= l[0].ms) return { a: l[0].snap, b: l[0].snap, alpha: 0 };
    for (let i = 1; i < l.length; i++) {
      if (t <= l[i].ms) {
        const a = l[i - 1];
        const b = l[i];
        return { a: a.snap, b: b.snap, alpha: (t - a.ms) / (b.ms - a.ms) };
      }
    }
    const last = l[l.length - 1].snap;
    return { a: last, b: last, alpha: 0 };
  }

  // Opoznienie dojezdza do celu z ograniczonym tempem; brak nowych snapshotow nie zmienia celu.
  #adapt(renderMs) {
    const dt = this.lastSampleMs === null ? 0 : Math.min(MAX_FRAME_S, Math.max(0, (renderMs - this.lastSampleMs) / 1000));
    this.lastSampleMs = renderMs;
    const diff = this.targetDelayMs - this.delayMs;
    const maxStep = INTERP_RATE_MS_PER_S * dt;
    this.delayMs += Math.max(-maxStep, Math.min(maxStep, diff));
    this.delayMs = Math.min(INTERP_MAX_MS, Math.max(INTERP_MIN_MS, this.delayMs));
  }

  clear() {
    this.list = [];
    this.intervals = [];
    this.lastRecv = null;
    this.lastSampleMs = null;
  }
}

// RTT z potwierdzen inputow: czas od wyslania seq do snapshotu z ackSeq >= seq (wlicza do 1 ticka serwera).
export class RttTracker {
  constructor() {
    this.sentAt = new Map();
    this.rttMs = null;
  }

  sent(seq, ms) {
    this.sentAt.set(seq, ms);
    if (this.sentAt.size > 256) this.sentAt.delete(this.sentAt.keys().next().value);
  }

  acked(ackSeq, ms) {
    let best = null;
    for (const seq of this.sentAt.keys()) {
      if (seq > ackSeq) continue;
      if (seq === ackSeq) best = ms - this.sentAt.get(seq);
      this.sentAt.delete(seq);
    }
    if (best !== null && best >= 0) this.rttMs = this.rttMs === null ? best : this.rttMs + (best - this.rttMs) * 0.2;
    return this.rttMs;
  }

  clear() {
    this.sentAt.clear();
    this.rttMs = null;
  }
}

// kB/s z narastajacego licznika bajtow, okno kroczace.
export class RateMeter {
  constructor(windowMs = 1000) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  update(totalBytes, ms) {
    this.samples.push([ms, totalBytes]);
    while (this.samples.length > 2 && ms - this.samples[0][0] > this.windowMs) this.samples.shift();
    const [t0, b0] = this.samples[0];
    return ms > t0 ? ((totalBytes - b0) / 1024) / ((ms - t0) / 1000) : 0;
  }
}

export function lerpAngle(a, b, t) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export function lerpEntities(aList, bList, alpha, keyIndex) {
  const { id, x, y, angle } = keyIndex;
  const prev = new Map(aList.map((e) => [e[id], e]));
  return bList.map((e) => {
    const p = prev.get(e[id]);
    const out = Array.isArray(e) ? [...e] : { ...e };
    if (!p) return out;
    out[x] = p[x] + (e[x] - p[x]) * alpha;
    out[y] = p[y] + (e[y] - p[y]) * alpha;
    if (angle !== undefined) out[angle] = lerpAngle(p[angle], e[angle], alpha);
    return out;
  });
}
