const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const W = 960, H = 640;
const DT = 1 / 60;
const PLAYER_R = 14, ENEMY_R = 13;
const PLAYER_SPEED = 220, BULLET_SPEED = 650, FIRE_COOLDOWN = 0.15;
const CONTACT_DPS = 35;
const REVIVE_RANGE = 45, REVIVE_TIME = 2;
const MAX_PLAYERS = 4;
const COLORS = ['#4fc3f7', '#ffb74d', '#aed581', '#f06292'];

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
};

const server = http.createServer((req, res) => {
  const file = FILES[req.url.split('?')[0]];
  if (!file) return res.writeHead(404).end('Not found');
  fs.readFile(path.join(__dirname, 'public', file[0]), (err, data) => {
    if (err) return res.writeHead(500).end('Server error');
    res.writeHead(200, { 'Content-Type': file[1] }).end(data);
  });
});

const players = new Map();
let enemies = [], bullets = [];
let wave = 0, toSpawn = 0, spawnTimer = 0, waveDelay = 2, kills = 0, gameOver = false;
let nextId = 1;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function emptyInput() {
  return { u: false, d: false, l: false, r: false, shoot: false, aimX: W / 2, aimY: H / 2 };
}

function respawn(p) {
  p.x = W / 2 + (Math.random() - 0.5) * 120;
  p.y = H / 2 + (Math.random() - 0.5) * 120;
  p.hp = 100;
  p.downed = false;
  p.revive = 0;
  p.cooldown = 0;
  p.angle = 0;
}

function resetGame() {
  enemies = [];
  bullets = [];
  wave = 0; toSpawn = 0; spawnTimer = 0; waveDelay = 2; kills = 0;
  gameOver = false;
  for (const p of players.values()) respawn(p);
}

function spawnEnemy() {
  const side = Math.floor(Math.random() * 4);
  const t = Math.random();
  const x = side === 0 ? -ENEMY_R : side === 1 ? W + ENEMY_R : t * W;
  const y = side === 2 ? -ENEMY_R : side === 3 ? H + ENEMY_R : t * H;
  const hp = 1 + Math.floor(wave / 3);
  enemies.push({ x, y, hp, maxHp: hp, speed: 70 + wave * 6 + Math.random() * 30 });
}

function update(dt) {
  if (gameOver || players.size === 0) return;
  const alive = [...players.values()].filter(p => !p.downed);

  for (const p of alive) {
    const i = p.input;
    const dx = (i.r ? 1 : 0) - (i.l ? 1 : 0);
    const dy = (i.d ? 1 : 0) - (i.u ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / len) * PLAYER_SPEED * dt, PLAYER_R, W - PLAYER_R);
    p.y = clamp(p.y + (dy / len) * PLAYER_SPEED * dt, PLAYER_R, H - PLAYER_R);
    p.angle = Math.atan2(i.aimY - p.y, i.aimX - p.x);
    p.cooldown -= dt;
    if (i.shoot && p.cooldown <= 0) {
      p.cooldown = FIRE_COOLDOWN;
      bullets.push({
        x: p.x + Math.cos(p.angle) * PLAYER_R,
        y: p.y + Math.sin(p.angle) * PLAYER_R,
        vx: Math.cos(p.angle) * BULLET_SPEED,
        vy: Math.sin(p.angle) * BULLET_SPEED,
        ttl: 1.5,
      });
    }
  }

  for (const p of players.values()) {
    if (!p.downed) continue;
    const helped = alive.some(a => dist(a, p) < REVIVE_RANGE);
    p.revive = helped ? p.revive + dt : Math.max(0, p.revive - dt);
    if (p.revive >= REVIVE_TIME) {
      p.downed = false;
      p.hp = 50;
      p.revive = 0;
    }
  }

  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ttl -= dt;
    for (const e of enemies) {
      if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < ENEMY_R + 4) {
        e.hp -= 1;
        b.ttl = 0;
        if (e.hp <= 0) kills++;
        break;
      }
    }
  }
  bullets = bullets.filter(b => b.ttl > 0 && b.x > 0 && b.x < W && b.y > 0 && b.y < H);
  enemies = enemies.filter(e => e.hp > 0);

  for (const e of enemies) {
    let target = null, best = Infinity;
    for (const p of alive) {
      const d = dist(e, p);
      if (d < best) { best = d; target = p; }
    }
    if (target && best > 0) {
      e.x += ((target.x - e.x) / best) * e.speed * dt;
      e.y += ((target.y - e.y) / best) * e.speed * dt;
    }
    for (const o of enemies) {
      if (o === e) continue;
      const d = dist(e, o);
      if (d > 0 && d < ENEMY_R * 2) {
        const push = (ENEMY_R * 2 - d) / 2;
        e.x += ((e.x - o.x) / d) * push;
        e.y += ((e.y - o.y) / d) * push;
      }
    }
    for (const p of alive) {
      if (!p.downed && dist(e, p) < PLAYER_R + ENEMY_R) {
        p.hp -= CONTACT_DPS * dt;
        if (p.hp <= 0) {
          p.hp = 0;
          p.downed = true;
          p.revive = 0;
        }
      }
    }
  }

  if (toSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      toSpawn--;
      spawnTimer = Math.max(0.15, 0.8 - wave * 0.05);
    }
  } else if (enemies.length === 0) {
    waveDelay -= dt;
    if (waveDelay <= 0) {
      wave++;
      toSpawn = (3 + wave * 2) * players.size;
      spawnTimer = 0;
      waveDelay = 3;
    }
  }

  if ([...players.values()].every(p => p.downed)) gameOver = true;
}

function snapshot() {
  const r = v => Math.round(v);
  return JSON.stringify({
    type: 'state',
    wave, kills, gameOver,
    nextWaveIn: toSpawn === 0 && enemies.length === 0 ? Math.max(0, waveDelay) : 0,
    players: [...players.values()].map(p => ({
      id: p.id, color: p.color, x: r(p.x), y: r(p.y), angle: +p.angle.toFixed(2),
      hp: r(p.hp), downed: p.downed, revive: +(p.revive / REVIVE_TIME).toFixed(2),
    })),
    enemies: enemies.map(e => [r(e.x), r(e.y), e.hp, e.maxHp]),
    bullets: bullets.map(b => [r(b.x), r(b.y)]),
  });
}

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'Server full');
  const used = new Set([...players.values()].map(p => p.color));
  const p = { id: nextId++, color: COLORS.find(c => !used.has(c)), input: emptyInput() };
  respawn(p);
  players.set(p.id, p);
  ws.send(JSON.stringify({ type: 'welcome', id: p.id }));
  console.log(`Player ${p.id} joined (${players.size} online)`);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'input') {
      const aimX = Number(msg.aimX), aimY = Number(msg.aimY);
      p.input = {
        u: !!msg.u, d: !!msg.d, l: !!msg.l, r: !!msg.r, shoot: !!msg.shoot,
        aimX: Number.isFinite(aimX) ? aimX : p.input.aimX,
        aimY: Number.isFinite(aimY) ? aimY : p.input.aimY,
      };
    } else if (msg.type === 'restart' && gameOver) {
      resetGame();
    }
  });

  ws.on('close', () => {
    players.delete(p.id);
    console.log(`Player ${p.id} left (${players.size} online)`);
    if (players.size === 0) resetGame();
  });
});

setInterval(() => {
  update(DT);
  const msg = snapshot();
  for (const client of wss.clients) if (client.readyState === 1) client.send(msg);
}, 1000 * DT);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running. Open one of these in a browser:`);
  console.log(`  http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  http://${n.address}:${PORT}`);
    }
  }
});
