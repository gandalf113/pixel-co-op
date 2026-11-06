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

// Adaptacyjny snapshotHz (V3-O-04). Sygnal: `ws.bufferedAmount`, czyli bajty, ktorych lacze tego gracza nie odebralo.
// To jedyna wielkosc, ktora mowi o zatorze; NetMeter.bytesPerSecond() mierzy tylko to, co wyslalismy, wiec dla duzego
// snapshotu zdlawilby gracza z dobrym laczem. Histereza: wejscie po ENTER_TICKS odczytach z rzedu powyzej ENTER_BYTES
// (pojedynczy skok nic nie robi), wyjscie dopiero po EXIT_TICKS odczytach z rzedu ponizej EXIT_BYTES (1 s przy 20 Hz).
// Odczyt pomiedzy progami zeruje oba liczniki.
export const THROTTLE = { enterBytes: 16384, exitBytes: 2048, enterTicks: 3, exitTicks: 20, slowHz: 12 };

export class LinkThrottle {
  constructor(cfg = THROTTLE) {
    this.cfg = cfg;
    this.throttled = false;
    this.hi = 0;
    this.lo = 0;
  }

  update(buffered) {
    const c = this.cfg;
    if (buffered > c.enterBytes) { this.hi++; this.lo = 0; }
    else if (buffered < c.exitBytes) { this.lo++; this.hi = 0; }
    else { this.hi = 0; this.lo = 0; }
    if (!this.throttled && this.hi >= c.enterTicks) { this.throttled = true; this.hi = 0; }
    else if (this.throttled && this.lo >= c.exitTicks) { this.throttled = false; this.lo = 0; }
    return this.throttled;
  }
}

export function summarize(meters) {
  let players = 0;
  let totalBps = 0;
  let maxBps = 0;
  let maxSnap = 0;
  let throttled = 0;
  for (const m of meters) {
    players++;
    const bps = m.bytesPerSecond();
    totalBps += bps;
    if (bps > maxBps) maxBps = bps;
    if (m.maxSnapBytes > maxSnap) maxSnap = m.maxSnapBytes;
    if (m.throttled) throttled++;
  }
  return { sendStreams: players, totalBytesPerSec: totalBps, maxPlayerBytesPerSec: maxBps, maxSnapshotBytes: maxSnap, throttledStreams: throttled };
}
