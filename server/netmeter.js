// Licznik ruchu wychodzacego do jednego gracza (jednego polaczenia): bajty na sekunde ze sredniej kroczacej
// po oknie, rozmiar ostatniego i najwiekszego snapshotu. Mierzy bajty JSON przed kompresja ws.
export class NetMeter {
  constructor({ windowS = 5, now = () => Date.now() } = {}) {
    this.windowS = windowS;
    this.now = now;
    this.buckets = new Map(); // sekunda -> bajty
    this.totalBytes = 0;
    this.messages = 0;
    this.lastSnapBytes = 0;
    this.maxSnapBytes = 0;
    this.startedAt = now();
  }

  record(bytes, isSnap = false) {
    const s = Math.floor(this.now() / 1000);
    this.buckets.set(s, (this.buckets.get(s) ?? 0) + bytes);
    this.totalBytes += bytes;
    this.messages++;
    if (isSnap) {
      this.lastSnapBytes = bytes;
      if (bytes > this.maxSnapBytes) this.maxSnapBytes = bytes;
    }
    if (this.buckets.size > this.windowS + 2) this.#trim(s);
  }

  #trim(s) {
    for (const k of this.buckets.keys()) if (k <= s - this.windowS - 1) this.buckets.delete(k);
  }

  // Bajty/s po oknie: `windowS` pelnych sekund plus biezaca, niepelna (dzielone przez rzeczywisty czas okna).
  bytesPerSecond() {
    const nowMs = this.now();
    const s = Math.floor(nowMs / 1000);
    this.#trim(s);
    const span = Math.max(1, Math.min(this.windowS + (nowMs % 1000) / 1000, (nowMs - this.startedAt) / 1000));
    let sum = 0;
    for (const [k, v] of this.buckets) if (k >= s - this.windowS) sum += v;
    return Math.round(sum / span);
  }
}

export function summarize(meters) {
  let players = 0;
  let totalBps = 0;
  let maxBps = 0;
  let maxSnap = 0;
  for (const m of meters) {
    players++;
    const bps = m.bytesPerSecond();
    totalBps += bps;
    if (bps > maxBps) maxBps = bps;
    if (m.maxSnapBytes > maxSnap) maxSnap = m.maxSnapBytes;
  }
  return { sendStreams: players, totalBytesPerSec: totalBps, maxPlayerBytesPerSec: maxBps, maxSnapshotBytes: maxSnap };
}
