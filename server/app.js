import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadBalance } from './balance.js';
import { Session } from './session.js';
import { Rooms } from './rooms.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

function clientIp(req, trustProxy) {
  const direct = req.socket.remoteAddress ?? '';
  if (!trustProxy || !LOCAL.has(direct)) return direct;
  const fwd = req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'];
  if (typeof fwd !== 'string' || !fwd) return direct;
  return fwd.split(',')[0].trim();
}

function hasher(salt) {
  return (value) => (value ? createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 16) : null);
}

class RateLimit {
  constructor({ max, windowMs, now = () => Date.now() }) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }

  allow(key) {
    if (!key || this.max <= 0) return true;
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (!v.some((x) => x > t - this.windowMs)) this.hits.delete(k);
    return true;
  }
}

async function serveStatic(req, res) {
  const fail = () => {
    res.writeHead(404);
    res.end('Not found');
  };
  if (req.method !== 'GET') return fail();
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return fail();
  }
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  const type = TYPES[path.extname(file)];
  if (!type || !file.startsWith(PUBLIC_DIR + path.sep)) return fail();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    fail();
  }
}

export function appVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? 'dev';
  } catch {
    return 'dev';
  }
}

export function startServer({
  port, host = undefined, balance = loadBalance(), seed = Date.now(),
  rooms = false, trustProxy = false, telemetry = null,
  maxRooms = 40, maxConnections = 200, roomsPerIp = 10, roomsPerIpWindowMs = 10 * 60 * 1000,
  emptyTtlS = 90, statsSalt = randomBytes(16).toString('hex'), heartbeatMs = 15000,
} = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const version = appVersion();
    const hash = hasher(statsSalt);
    const roomSeed = (() => { let n = seed; return () => n++; })();
    const manager = rooms
      ? new Rooms({ balance, version, telemetry, seed: roomSeed, maxRooms, emptyTtlS })
      : null;
    const single = rooms ? null : new Session({ balance, seed, addresses: [], telemetry, version });
    const createLimit = new RateLimit({ max: roomsPerIp, windowMs: roomsPerIpWindowMs });

    const server = http.createServer((req, res) => {
      if (req.url === '/healthz') {
        const stats = manager ? manager.stats() : { rooms: single.playerCount ? 1 : 0, players: single.playerCount, games: single.game ? 1 : 0 };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, version, mode: rooms ? 'rooms' : 'lan', uptimeS: Math.round((Date.now() - started) / 1000), ...stats }));
        return;
      }
      serveStatic(req, res);
    });
    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
    const { heartbeatS, timeoutS } = balance.session;

    wss.on('connection', (ws, req) => {
      if (wss.clients.size > maxConnections) {
        ws.send(JSON.stringify({ t: 'reject', reason: 'Serwer przeciążony' }));
        ws.close(1013, 'overloaded');
        return;
      }
      ws.lastPong = Date.now();
      ws.on('pong', () => { ws.lastPong = Date.now(); });
      const ip = clientIp(req, trustProxy);
      const conn = {
        isLocal: LOCAL.has(ip),
        ipHash: hash(ip),
        pid: null,
        send: (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
        close: (code, reason) => ws.close(code, reason),
      };

      let session = single;
      if (session) session.connect(conn);

      const route = (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return null;
        }
        if (!msg || msg.t !== 'hello') return null;
        if (typeof msg.pid === 'string' && msg.pid.length <= 64) conn.pid = hash(msg.pid);
        if (typeof msg.room === 'string' && msg.room.trim() !== '') {
          const found = manager.get(msg.room.trim());
          if (!found) {
            conn.send({ t: 'reject', reason: 'Nie ma takiego pokoju' });
            ws.close(1000, 'no room');
            return null;
          }
          return found;
        }
        if (!createLimit.allow(conn.ipHash)) {
          conn.send({ t: 'reject', reason: 'Za dużo nowych pokoi z tego adresu' });
          ws.close(1013, 'rate limited');
          return null;
        }
        const made = manager.create();
        if (!made) {
          conn.send({ t: 'reject', reason: 'Brak wolnych pokoi' });
          ws.close(1013, 'no capacity');
          return null;
        }
        return made;
      };

      ws.on('message', (data) => {
        const raw = data.toString();
        if (!session) {
          session = route(raw);
          if (!session) return;
          session.connect(conn);
        }
        session.message(conn, raw);
      });
      ws.on('close', () => session?.disconnect(conn));
      ws.on('error', () => {});
    });

    const heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        if (Date.now() - ws.lastPong > timeoutS * 1000) ws.terminate();
        else ws.ping();
      }
    }, heartbeatS * 1000);
    const loop = setInterval(() => {
      const dt = 1 / balance.tickHz;
      if (manager) manager.tick(dt);
      else single.tick(dt);
    }, 1000 / balance.tickHz);
    const pulse = telemetry?.enabled
      ? setInterval(() => {
        const stats = manager ? manager.stats() : { rooms: single.playerCount ? 1 : 0, players: single.playerCount, games: single.game ? 1 : 0 };
        telemetry.event('heartbeat', { ...stats, connections: wss.clients.size, uptimeS: Math.round((Date.now() - started) / 1000) });
      }, heartbeatMs)
      : null;
    pulse?.unref?.();

    server.on('error', reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      if (single) single.addresses = lanAddresses(actual);
      resolve({
        port: actual,
        rooms: manager,
        session: single,
        close: () => new Promise((done) => {
          clearInterval(heartbeat);
          clearInterval(loop);
          if (pulse) clearInterval(pulse);
          manager?.close();
          single?.close('shutdown');
          for (const ws of wss.clients) ws.terminate();
          wss.close(() => server.close(async () => {
            await telemetry?.close();
            done();
          }));
          server.closeAllConnections?.();
        }),
      });
    });
  });
}
