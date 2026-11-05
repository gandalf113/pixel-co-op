// Telemetria: wypychanie zdarzeń o faktycznej rozgrywce do zewnętrznego kolektora.
//
// Wyłączona, dopóki nie podasz `url` (zmienna STATS_URL). Gra w LAN nie wysyła
// niczego i nie wymaga konfiguracji. Moduł nigdy nie rzuca wyjątku w stronę gry:
// błąd sieci kosztuje najwyżej porzuconą paczkę zdarzeń.

const DEFAULTS = { batchMs: 2000, maxQueue: 1000, maxBatch: 100, timeoutMs: 3000 };

export function createTelemetry(opts = {}) {
  const {
    url = null,
    token = null,
    instance = 'local',
    batchMs = DEFAULTS.batchMs,
    maxQueue = DEFAULTS.maxQueue,
    maxBatch = DEFAULTS.maxBatch,
    timeoutMs = DEFAULTS.timeoutMs,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    onError = () => {},
  } = opts;

  const state = { queued: 0, sent: 0, dropped: 0, failed: 0 };
  if (!url) {
    return {
      enabled: false, state,
      event: () => {},
      flush: async () => {},
      close: async () => {},
    };
  }

  const queue = [];
  let timer = null;
  let inFlight = null;
  let closed = false;

  const arm = () => {
    if (timer || closed) return;
    timer = setTimeout(() => { timer = null; void flush(); }, batchMs);
    timer.unref?.();
  };

  async function post(batch) {
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ instance, events: batch }),
        signal: ctrl.signal,
      });
      if (!res || res.ok !== true) throw new Error(`HTTP ${res?.status ?? '?'}`);
      state.sent += batch.length;
    } catch (err) {
      state.failed += batch.length;
      onError(err);
    } finally {
      clearTimeout(kill);
    }
  }

  async function flush() {
    if (inFlight) return inFlight;
    if (!queue.length) return;
    const batch = queue.splice(0, maxBatch);
    inFlight = post(batch).finally(() => {
      inFlight = null;
      if (queue.length) arm();
    });
    return inFlight;
  }

  return {
    enabled: true,
    state,
    event(type, data = {}) {
      if (closed || typeof type !== 'string') return;
      if (queue.length >= maxQueue) {
        queue.shift();
        state.dropped++;
      }
      queue.push({ ts: now(), type, ...data });
      state.queued++;
      arm();
    },
    flush,
    async close() {
      closed = true;
      clearTimeout(timer);
      timer = null;
      while (queue.length) {
        const batch = queue.splice(0, maxBatch);
        await post(batch);
      }
      await inFlight;
    },
  };
}
