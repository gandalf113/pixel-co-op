import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadBalance } from './balance.js';
import { Session } from './session.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
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
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch {
    fail();
  }
}

export function startServer({ port, balance = loadBalance(), seed = Date.now() } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serveStatic);
    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
    const session = new Session({ balance, seed, addresses: [] });
    const { heartbeatS, timeoutS } = balance.session;

    wss.on('connection', (ws, req) => {
      ws.lastPong = Date.now();
      ws.on('pong', () => { ws.lastPong = Date.now(); });
      const conn = {
        isLocal: LOCAL.has(req.socket.remoteAddress),
        send: (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
        close: (code, reason) => ws.close(code, reason),
      };
      session.connect(conn);
      ws.on('message', (data) => session.message(conn, data.toString()));
      ws.on('close', () => session.disconnect(conn));
      ws.on('error', () => {});
    });

    const heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        if (Date.now() - ws.lastPong > timeoutS * 1000) ws.terminate();
        else ws.ping();
      }
    }, heartbeatS * 1000);
    const loop = setInterval(() => session.tick(1 / balance.tickHz), 1000 / balance.tickHz);

    server.on('error', reject);
    server.listen(port, () => {
      const actual = server.address().port;
      session.addresses = lanAddresses(actual);
      resolve({
        port: actual,
        close: () => new Promise((done) => {
          clearInterval(heartbeat);
          clearInterval(loop);
          for (const ws of wss.clients) ws.terminate();
          wss.close(() => server.close(() => done()));
          server.closeAllConnections?.();
        }),
      });
    });
  });
}
