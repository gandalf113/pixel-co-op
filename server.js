import { startServer, lanAddresses } from './server/app.js';
import { createTelemetry } from './server/telemetry.js';

const env = process.env;
const num = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : dflt);

// Tryb LAN (domyślny): jedna sesja, zero konfiguracji, zero telemetrii.
// Tryb hostowany: ROOMS=1 + reszta zmiennych — patrz docs/09-HOSTING.md.
const rooms = env.ROOMS === '1';
const telemetry = createTelemetry({
  url: env.STATS_URL || null,
  token: env.STATS_TOKEN || null,
  instance: env.INSTANCE || 'local',
  onError: (err) => console.warn(`[telemetry] ${err?.message ?? err}`),
});

const srv = await startServer({
  port: num(env.PORT, 3000),
  host: env.HOST || undefined,
  rooms,
  trustProxy: env.TRUST_PROXY === '1',
  telemetry,
  statsSalt: env.STATS_SALT || undefined,
  maxRooms: num(env.MAX_ROOMS, 40),
  maxConnections: num(env.MAX_CONNECTIONS, 200),
  roomsPerIp: num(env.ROOMS_PER_IP, 10),
});

console.log(`tryb: ${rooms ? 'pokoje' : 'LAN'}, telemetria: ${telemetry.enabled ? 'włączona' : 'wyłączona'}`);
console.log(`Lokalnie: http://localhost:${srv.port}`);
if (!rooms) for (const url of lanAddresses(srv.port)) console.log(`LAN: ${url}`);

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (stopping) return process.exit(0);
    stopping = true;
    // Twardy limit: systemctl restart nie może wisieć na flushu telemetrii.
    const hard = setTimeout(() => process.exit(0), 5000);
    hard.unref();
    srv.close().then(() => process.exit(0), () => process.exit(1));
  });
}
