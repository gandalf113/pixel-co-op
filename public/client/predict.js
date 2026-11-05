import { stepPlayer, playerSpeedPx } from '../shared/movement.js';

const BUFFER_MS = 1000;
const INTERP_DELAY_MS = 100;

export class Predictor {
  constructor(balance) {
    this.balance = balance;
    this.pending = [];
    this.current = null;
  }

  get pos() {
    return this.current;
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
  }

  push(snap, recvMs) {
    this.list.push({ snap, ms: recvMs });
    while (this.list.length > 2 && recvMs - this.list[0].ms > BUFFER_MS) this.list.shift();
  }

  sample(renderMs) {
    const l = this.list;
    if (l.length === 0) return null;
    const t = renderMs - INTERP_DELAY_MS;
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

  clear() {
    this.list = [];
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
