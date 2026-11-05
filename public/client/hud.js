import { VIEW_W, VIEW_H } from './render.js';
import { formatTime } from './ui.js';

const PAD = 12;

function text(ctx, str, x, y, { color = '#e8e2d4', size, align = 'left', base = 'alphabetic' }) {
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.lineWidth = Math.max(2, size / 5);
  ctx.strokeStyle = '#000';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3b342d';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
}

function drawIcon(ctx, img, x, y, scale) {
  if (!img) return;
  ctx.drawImage(img, Math.round(x - (img.width * scale) / 2), Math.round(y - (img.height * scale) / 2), img.width * scale, img.height * scale);
}

export function renderHud(ctx, scale, offset, state) {
  const { snap, balance, sprites, cam, me } = state;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const fs = 6 * scale + 4;
  const small = 4 * scale + 3;
  const toScreen = (x, y) => {
    const v = cam.worldToView(x, y);
    return { x: offset.x + v.x * scale, y: offset.y + v.y * scale, vx: v.x, vy: v.y };
  };

  if (snap) {
    for (const p of state.players) {
      if (p.state === 'dead') continue;
      const s = toScreen(p.x, p.y);
      const top = s.y - 12 * scale;
      text(ctx, p.nick, s.x, top - 4 * scale, { color: p.color, size: small, align: 'center' });
      bar(ctx, s.x - 8 * scale, top - 2 * scale, 16 * scale, Math.max(2, scale), p.hp / p.maxHp, p.color);
      if (p.state === 'downed') {
        text(ctx, `✚ ${Math.ceil(p.deathLeft)}`, s.x, s.y + 14 * scale, { color: '#ff5a4a', size: fs, align: 'center' });
        if (p.reviveProgress > 0) bar(ctx, s.x - 8 * scale, s.y + 16 * scale, 16 * scale, Math.max(2, scale), p.reviveProgress / balance.player.reviveTimeS, '#6fc7c9');
      }
    }

    const tp = balance.map.tilePx;
    const turretS = balance.items.turret30.durationS;
    for (const it of snap.items) {
      if (it.kind !== 'turret30' || it.state !== 'active') continue;
      const s = toScreen((it.tx + 0.5) * tp, it.ty * tp);
      bar(ctx, s.x - 7 * scale, s.y - 3 * scale, 14 * scale, Math.max(2, scale), it.timeLeft / turretS, '#d9b53a');
    }

    for (const p of state.players) {
      if (p.id === snap.you.id || p.state === 'dead') continue;
      const s = toScreen(p.x, p.y);
      if (s.vx >= 0 && s.vx <= VIEW_W && s.vy >= 0 && s.vy <= VIEW_H) continue;
      const cx = VIEW_W / 2;
      const cy = VIEW_H / 2;
      const a = Math.atan2(s.vy - cy, s.vx - cx);
      const k = Math.min((cx - 10) / Math.abs(Math.cos(a) || 1e-9), (cy - 10) / Math.abs(Math.sin(a) || 1e-9));
      const ax = offset.x + (cx + Math.cos(a) * k) * scale;
      const ay = offset.y + (cy + Math.sin(a) * k) * scale;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6 * scale, 0);
      ctx.lineTo(-4 * scale, -5 * scale);
      ctx.lineTo(-4 * scale, 5 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    let topLine;
    if (snap.phase === 'break') {
      const blink = snap.breakLeft <= 5 && Math.floor(state.nowMs / 250) % 2 === 0;
      topLine = { str: `PRZERWA ${formatTime(snap.breakLeft)}`, color: blink ? '#ff5a4a' : '#d9b53a' };
    } else {
      topLine = { str: `FALA ${snap.wave} · potwory: ${snap.mobsLeft}`, color: '#e8e2d4' };
    }
    text(ctx, topLine.str, W / 2, PAD + fs, { color: topLine.color, size: fs, align: 'center' });
    if (snap.phase === 'break') {
      const ready = snap.players.filter((p) => p.ready).map((p) => p.nick);
      const line = `${ready.length ? `Gotowi: ${ready.join(', ')} · ` : ''}${me?.ready ? 'gotowy ✓' : '[G] Gotowy'}`;
      text(ctx, line, W / 2, PAD + fs * 2 + 4, { size: small, align: 'center' });
    }

    let sy = PAD + fs * 3 + 8;
    for (const p of snap.players) {
      if (!p.suspended) continue;
      text(ctx, `${p.nick}: wraca…`, W / 2, sy, { color: p.color, size: small, align: 'center' });
      sy += small + 4;
    }

    if (me) {
      const bw = 60 * scale;
      bar(ctx, PAD, H - PAD - 6 * scale, bw, 6 * scale, me.hp / me.maxHp, me.hp / me.maxHp > 0.3 ? '#55b04a' : '#a8321f');
      text(ctx, String(Math.floor(me.hp)), PAD + bw / 2, H - PAD - 3 * scale, { size: small, align: 'center', base: 'middle' });
      text(ctx, `BROŃ LV ${me.weaponLv}`, PAD + bw + 10, H - PAD - 3 * scale, { size: fs, base: 'middle' });

      const held = me.held;
      const label = held ? balance.items[held].name : 'nic';
      text(ctx, label, W - PAD, H - PAD - 3 * scale, { size: fs, align: 'right', base: 'middle' });
      if (held) {
        ctx.font = `bold ${fs}px monospace`;
        drawIcon(ctx, sprites.get(`item_${held}`), W - PAD - ctx.measureText(label).width - 12 * scale, H - PAD - 3 * scale, scale);
      }
    }

    if (state.hint) text(ctx, `[E] podnieś: ${state.hint}`, W / 2, H - PAD - 24 * scale, { size: fs, align: 'center' });

    if (state.tab) {
      const rowH = fs + 8;
      const tw = 280 + 20 * scale;
      const th = rowH * (snap.players.length + 1) + 16;
      const tx = (W - tw) / 2;
      const ty = (H - th) / 2;
      ctx.fillStyle = 'rgba(20, 18, 15, 0.88)';
      ctx.fillRect(tx, ty, tw, th);
      snap.players.forEach((p, i) => {
        const y = ty + 8 + rowH * (i + 1);
        text(ctx, p.nick, tx + 12, y, { color: p.color, size: fs });
        const status = p.state === 'alive' ? `${Math.floor(p.hp)} HP` : p.state === 'downed' ? 'powalony' : 'martwy';
        text(ctx, status, tx + tw - 12, y, { size: fs, align: 'right' });
      });
    }
  }

  if (state.status === 'lost' || state.status === 'connecting') {
    text(ctx, 'Utracono połączenie — łączę ponownie…', W / 2, H / 2, { color: '#ff5a4a', size: fs, align: 'center' });
  }

  if (state.showCursor) drawIcon(ctx, sprites.get('crosshair'), state.mouse.x, state.mouse.y, scale);
}
