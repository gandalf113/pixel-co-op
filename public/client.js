const W = 960, H = 640;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ws = new WebSocket(`ws://${location.host}`);
let myId = null, state = null, status = 'Connecting...';

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'welcome') myId = msg.id;
  else if (msg.type === 'state') state = msg;
};
ws.onclose = e => {
  state = null;
  status = e.reason ? `${e.reason} - refresh to retry` : 'Disconnected - refresh to reconnect';
};

const input = { u: false, d: false, l: false, r: false, shoot: false, aimX: W / 2, aimY: H / 2 };
const KEYS = {
  KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd',
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'shoot',
};

addEventListener('keydown', e => {
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyR' && state?.gameOver) ws.send(JSON.stringify({ type: 'restart' }));
});
addEventListener('keyup', e => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });
addEventListener('blur', () => { for (const k of Object.values(KEYS)) input[k] = false; });
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  input.aimX = ((e.clientX - rect.left) / rect.width) * W;
  input.aimY = ((e.clientY - rect.top) / rect.height) * H;
});
canvas.addEventListener('mousedown', () => { input.shoot = true; });
addEventListener('mouseup', () => { input.shoot = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', ...input }));
}, 1000 / 30);

function circle(x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function text(str, x, y, size = 16, color = '#e6e6e6', align = 'left') {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}

function draw() {
  ctx.fillStyle = '#161a22';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1f2430';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  if (!state) {
    text(status, W / 2, H / 2, 24, '#e6e6e6', 'center');
    return requestAnimationFrame(draw);
  }

  for (const [x, y] of state.bullets) circle(x, y, 4, '#ffee58');

  for (const [x, y, hp, maxHp] of state.enemies) {
    circle(x, y, 13, maxHp > 1 ? '#c62828' : '#ef5350');
    if (maxHp > 1) {
      ctx.fillStyle = '#000a';
      ctx.fillRect(x - 12, y - 20, 24, 3);
      ctx.fillStyle = '#ef9a9a';
      ctx.fillRect(x - 12, y - 20, 24 * (hp / maxHp), 3);
    }
  }

  for (const p of state.players) {
    if (p.downed) {
      circle(p.x, p.y, 14, '#555');
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.revive);
      ctx.stroke();
      text('DOWN', p.x, p.y - 28, 12, p.color, 'center');
      continue;
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
    ctx.stroke();
    circle(p.x, p.y, 14, p.color);
    if (p.id === myId) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#000a';
    ctx.fillRect(p.x - 16, p.y - 26, 32, 4);
    ctx.fillStyle = p.hp > 30 ? '#66bb6a' : '#ffa726';
    ctx.fillRect(p.x - 16, p.y - 26, 32 * (p.hp / 100), 4);
  }

  text(`Wave ${state.wave}`, 16, 28, 20);
  text(`Kills ${state.kills}`, 16, 52, 16, '#aaa');
  text(`${state.players.length} player${state.players.length === 1 ? '' : 's'}`, W - 16, 28, 16, '#aaa', 'right');

  const me = state.players.find(p => p.id === myId);
  if (state.gameOver) {
    ctx.fillStyle = '#000b';
    ctx.fillRect(0, 0, W, H);
    text('GAME OVER', W / 2, H / 2 - 20, 48, '#ef5350', 'center');
    text(`You survived to wave ${state.wave} with ${state.kills} kills`, W / 2, H / 2 + 20, 20, '#e6e6e6', 'center');
    text('Press R to restart', W / 2, H / 2 + 56, 18, '#aaa', 'center');
  } else if (state.nextWaveIn > 0) {
    text(`Wave ${state.wave + 1} in ${Math.ceil(state.nextWaveIn)}...`, W / 2, 80, 28, '#e6e6e6', 'center');
  } else if (me?.downed) {
    text("You're down! Get a teammate to stand next to you.", W / 2, H - 24, 18, '#ffa726', 'center');
  }

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
