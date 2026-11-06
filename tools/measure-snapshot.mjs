// Pomiar ruchu sieciowego gry: buduje Game z 4 graczami, 60 potworami, 120 dropami i 20 pociskami,
// po czym wypisuje rozmiar snapshotu z rozbiciem na sekcje i kB/s na gracza przy snapshotHz.
//
//   node tools/measure-snapshot.mjs            # rozmiary JSON (przed kompresja)
//   node tools/measure-snapshot.mjs --wire     # dodatkowo bajty z prawdziwego gniazda WebSocket, deflate wyl./wl.
//   --no-aoi     wylacza area of interest (sama delta); --full  wysyla zawsze pelny snapshot (stan sprzed zmian)
//   --seconds=N  (domyslnie 6)   --players=N   --mobs=N   --drops=N   --bullets=N   --layout=spread|cluster
//
// Uruchamiaj z katalogu repo (na Windows przez node.exe).
import { WebSocketServer, WebSocket } from 'ws';
import { loadBalance } from '../server/balance.js';
import { Game } from '../server/game.js';
import { makeMob } from '../server/mobspawn.js';
import { spawnDrop, spawnPlaced } from './scenario-helpers.mjs';
import * as app from '../server/app.js';
import { AOI } from '../server/aoi.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const N = { seconds: 6, players: 4, mobs: 60, drops: 120, bullets: 20, walls: 12, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== true).map(([k, v]) => [k, Number.isNaN(Number(v)) ? v : Number(v)])) };
const layout = args.layout ?? 'spread';

const balance = loadBalance();
const { tilesW, tilesH, tilePx } = balance.map;
const W = tilesW * tilePx;
const H = tilesH * tilePx;
const kinds = Object.keys(balance.mobs).filter((k) => !balance.mobs[k].split);
const dropKinds = Object.keys(balance.items);

export function buildScenario() {
  const ids = Array.from({ length: N.players }, (_, i) => ({ id: `p${i + 1}`, nick: `G${i + 1}`, color: i, ultKind: Object.keys(balance.ultimate.kinds)[0] }));
  const game = new Game({ balance, difficulty: 2, players: ids, seed: 7 });
  const w = game.world;
  w.phase = 'wave';
  w.wave = 6;
  game.director = { done: false, queue: [] };
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const spots = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  [...w.players.values()].forEach((p, i) => {
    if (layout === 'spread') { p.x = W * spots[i % 4][0]; p.y = H * spots[i % 4][1]; }
  });
  for (let i = 0; i < N.mobs; i++) {
    const m = makeMob(w, kinds[i % kinds.length], 20 + rnd() * (W - 40), 20 + rnd() * (H - 40));
    m.vx = (rnd() - 0.5) * 60;
    m.vy = (rnd() - 0.5) * 60;
  }
  for (let i = 0; i < N.drops; i++) spawnDrop(w, dropKinds[i % dropKinds.length], 20 + rnd() * (W - 40), 20 + rnd() * (H - 40));
  for (let i = 0; i < N.walls; i++) spawnPlaced(w, 'wall', Math.floor(rnd() * (tilesW - 2)), Math.floor(rnd() * (tilesH - 2)));
  for (let i = 0; i < N.bullets; i++) {
    const a = rnd() * Math.PI * 2;
    w.bullets.push({ id: w.nextId(), owner: 'p1', fromTurret: false, x: 20 + rnd() * (W - 40), y: 20 + rnd() * (H - 40), vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, travelLeft: 200, damage: 1, pierce: 0, passed: null });
  }
  return game;
}

// Ruch bez AI: potwory i pociski dryfuja, dropy stoja. Tak wyglada "zywa" plansza dla snapshotu.
function drift(game, dt) {
  const w = game.world;
  w.time += dt;
  for (const m of w.mobs) {
    m.x = Math.min(W - 10, Math.max(10, m.x + m.vx * dt));
    m.y = Math.min(H - 10, Math.max(10, m.y + m.vy * dt));
    m.angle = Math.atan2(m.vy, m.vx);
  }
  for (const b of w.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < 0 || b.x > W) b.vx = -b.vx; if (b.y < 0 || b.y > H) b.vy = -b.vy; }
  for (const p of w.players.values()) { p.x += Math.sin(w.time + p.spawnIndex) * 20 * dt; }
}

const bytes = (o) => Buffer.byteLength(typeof o === 'string' ? o : JSON.stringify(o));

function breakdown(snap) {
  const out = {};
  let rest = bytes(snap);
  for (const k of ['mobs', 'items', 'players', 'pstatic', 'bullets', 'mobBullets', 'droplets', 'rockets', 'del']) {
    if (snap[k] === undefined) continue;
    out[k] = { b: bytes(snap[k]), n: Array.isArray(snap[k]) ? snap[k].length : 0 };
    rest -= out[k].b;
  }
  out.other = { b: rest, n: 0 };
  return out;
}

function simulate(game) {
  const hz = balance.snapshotHz;
  const frames = Math.round(N.seconds * hz);
  const ids = [...game.world.players.keys()];
  const per = Object.fromEntries(ids.map((id) => [id, { total: 0, first: null, steady: [], sections: null, msgs: [] }]));
  for (let f = 0; f < frames; f++) {
    drift(game, 1 / hz);
    for (const id of ids) {
      const snap = { ...game.snapshot(id) };
      snap.time = snap.t;
      snap.t = 'snap';
      const str = JSON.stringify(snap);
      const rec = per[id];
      rec.total += Buffer.byteLength(str);
      rec.msgs.push(str);
      if (f === 0) { rec.first = Buffer.byteLength(str); rec.firstSections = breakdown(snap); } else { rec.steady.push(Buffer.byteLength(str)); rec.lastSections = breakdown(snap); }
    }
  }
  return { per, frames, hz };
}

function printReport(title, sim) {
  const ids = Object.keys(sim.per);
  const avgSteady = ids.reduce((a, id) => a + sim.per[id].steady.reduce((x, y) => x + y, 0) / sim.per[id].steady.length, 0) / ids.length;
  const perPlayerKBs = (avgSteady * sim.hz) / 1000;
  console.log(`\n=== ${title} ===`);
  console.log(`pierwszy snapshot (p1): ${sim.per[ids[0]].first} B`);
  console.log(`snapshot w stanie ustalonym (srednia po graczach): ${Math.round(avgSteady)} B`);
  const sec = sim.per[ids[0]].lastSections;
  console.log('rozbicie (stan ustalony, p1): ' + Object.entries(sec).map(([k, v]) => `${k} ${v.b} B${v.n ? ` (${v.n})` : ''}`).join(' | '));
  console.log(`na gracza: ${perPlayerKBs.toFixed(1)} kB/s = ${(perPlayerKBs * 8 / 1000).toFixed(2)} Mbit/s przy ${sim.hz} Hz; ${ids.length} graczy: ${(perPlayerKBs * 8 * ids.length / 1000).toFixed(2)} Mbit/s`);
  return perPlayerKBs;
}

async function wire(sim, deflate) {
  const opts = deflate ? (app.wsDeflateOptions?.() ?? { threshold: 256 }) : false;
  const wss = new WebSocketServer({ port: 0, perMessageDeflate: opts });
  const port = wss.address().port;
  const ids = Object.keys(sim.per);
  const got = await new Promise((resolve) => {
    wss.on('connection', (ws) => {
      const idx = wss.clients.size - 1;
      if (idx + 1 < 1) return;
      ws.on('message', () => {});
      ws.once('message', () => {});
      ws.idx = idx;
      ws.ready = true;
      if (wss.clients.size === 1) {
        // jeden klient testowy odbiera strumien pierwszego gracza (p1)
        const msgs = sim.per[ids[0]].msgs;
        for (const m of msgs) ws.send(m);
        ws.close();
      }
    });
    const c = new WebSocket(`ws://127.0.0.1:${port}`, { perMessageDeflate: deflate });
    let n = 0;
    c.on('message', () => { n++; });
    c.on('close', () => resolve({ n, bytes: c._socket.bytesRead }));
  });
  wss.close();
  const seconds = sim.frames / sim.hz;
  return { kBs: got.bytes / seconds / 1000, n: got.n };
}

if (args['no-aoi'] || args.full) { AOI.enterMul = 1e6; AOI.exitMul = 1e6; }
const game = buildScenario();
if (args.full) { const snap = game.snapshot.bind(game); game.snapshot = (id) => { game.views.delete(id); return snap(id); }; }
const w = game.world;
console.log(`scenariusz: ${N.players} graczy (${layout}), ${w.mobs.length} potworow, ${[...w.items.values()].filter((i) => i.state === 'ground').length} dropow na ziemi, ${[...w.items.values()].filter((i) => i.state !== 'ground').length} postawionych, ${w.bullets.length} pociskow, ${N.seconds} s @ ${balance.snapshotHz} Hz`);
const sim = simulate(game);
const kbs = printReport('JSON, przed kompresja', sim);
if (args.wire) {
  for (const d of [false, true]) {
    const r = await wire(sim, d);
    console.log(`WIRE perMessageDeflate=${d ? 'wl.' : 'wyl.'} (p1): ${r.kBs.toFixed(1)} kB/s = ${(r.kBs * 8 / 1000).toFixed(2)} Mbit/s, ${r.n} wiadomosci`);
  }
}
void kbs;
