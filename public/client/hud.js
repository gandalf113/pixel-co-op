import { VIEW_W, VIEW_H } from './render.js';
import { formatTime } from './ui.js';
import { rifleStats } from '../shared/weapon.js';

const PAD = 12;
const TIER_COLORS = ['#5a4f44', '#6fe0ff', '#d9b53a', '#ff5a4a'];

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

const ROMAN = ['I', 'II', 'III'];

function drawEye(ctx, x, y, scale) {
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, 4 * scale + 1, 2.5 * scale + 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.ellipse(x, y, 4 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#14120f';
  ctx.beginPath();
  ctx.arc(x, y, 1.5 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawUltBar(ctx, state, me, scale, fs, small) {
  const u = state.balance.ultimate;
  const now = state.nowMs;
  const W = ctx.canvas.width;
  const icon = state.sprites.get(u.kinds[me.ultKind].sprite);
  const iconPx = 16 * scale;
  const x0 = PAD;
  const y0 = PAD;
  const tier = Math.min(3, Math.floor(me.ult / u.tierPoints));
  const full = tier === 3;
  const pulse = full ? 0.75 + 0.25 * Math.sin(now / 120) : 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(x0 - 2, y0 - 2, iconPx + 4, iconPx + 4);
  if (icon) ctx.drawImage(icon, x0, y0, iconPx, iconPx);
  const bx = x0 + iconPx + 8;
  const barW = Math.max(180, W / 3);
  const h = 12;
  const gap = 6;
  const segW = (barW - gap * 2) / 3;
  const by = y0 + iconPx / 2 - h / 2 - 6;
  for (let i = 0; i < 3; i++) {
    const sx = bx + i * (segW + gap);
    const frac = Math.max(0, Math.min(1, (me.ult - i * u.tierPoints) / u.tierPoints));
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 2, by - 2, segW + 4, h + 4);
    ctx.fillStyle = '#2a1f14';
    ctx.fillRect(sx, by, segW, h);
    const lit = i < tier;
    ctx.globalAlpha = lit ? pulse : 1;
    const g = ctx.createLinearGradient(0, by, 0, by + h);
    g.addColorStop(0, lit ? '#fff3a0' : '#7fd6ff');
    g.addColorStop(0.5, lit ? '#ffb000' : '#2f8fc8');
    g.addColorStop(1, lit ? '#c25a00' : '#1d4f78');
    ctx.fillStyle = g;
    ctx.fillRect(sx, by, Math.round(segW * frac), h);
    if (lit) {
      const t = (now % 2000) / 2000;
      const shine = sx + (segW + 20) * t - 10;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, by, segW, h);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(shine, by + h);
      ctx.lineTo(shine + 6, by);
      ctx.lineTo(shine + 12, by);
      ctx.lineTo(shine + 6, by + h);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = lit ? '#ffe07a' : '#5a4f44';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 0.5, by - 0.5, segW + 1, h + 1);
  }
  let rx = bx;
  ROMAN.forEach((r, i) => {
    const lit = i < tier;
    text(ctx, r, rx, by + h + small + 4, { size: small, color: lit ? '#ffd23a' : '#5a4f44' });
    ctx.font = `bold ${small}px monospace`;
    rx += ctx.measureText(r).width + 8;
    if (i < 2) {
      text(ctx, '/', rx, by + h + small + 4, { size: small, color: '#5a4f44' });
      rx += ctx.measureText('/').width + 8;
    }
  });
  const ty = by + h + small + 4;
  if (full) {
    const blink = Math.floor(now / 300) % 2 === 0;
    text(ctx, 'ULTI GOTOWE [F]', rx + 12, ty, { size: small, color: blink ? '#ffd23a' : '#ff7a2a' });
  } else if (state.deny) {
    text(ctx, 'ZA MAŁO', rx + 12, ty, { size: small, color: '#ff5a4a' });
  }
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

  // Wersja widoczna takze przed startem gry — po to jest, zeby dalo sie powiedziec, w co sie gralo.
  if (state.version) text(ctx, `v${state.version}`, W - 6 * scale, 4 * scale, { size: small, color: '#5a4f44', align: 'right', base: 'top' });

  if (snap) {
    for (const p of state.players) {
      if (p.state === 'dead') continue;
      const s = toScreen(p.x, p.y);
      const top = s.y - 12 * scale;
      text(ctx, p.nick, s.x, top - 4 * scale, { color: p.color, size: small, align: 'center' });
      if (state.spectating?.id === p.id) drawEye(ctx, s.x + 12 * scale, top - 6 * scale, scale);
      if (p.id !== snap.you.id && balance.ultimate) {
        const tier = Math.min(3, Math.floor((p.ult ?? 0) / balance.ultimate.tierPoints));
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(s.x, top - 4 * scale - small - 2 * scale, 2 * scale + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = TIER_COLORS[tier];
        ctx.beginPath();
        ctx.arc(s.x, top - 4 * scale - small - 2 * scale, 2 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
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

    if (me && me.state === 'dead') {
      const who = state.spectating;
      text(ctx, who ? `OBSERWUJESZ: ${who.nick}` : 'NIKT NIE ŻYJE', W / 2, PAD + fs * 4 + 12, { size: fs, align: 'center', color: who?.color ?? '#ff5a4a' });
      text(ctx, 'wracasz w przerwie · klik / A / D: zmień', W / 2, PAD + fs * 5 + 16, { size: small, align: 'center' });
      if (me.ultKind && balance.ultimate) drawUltBar(ctx, state, me, scale, fs, small);
    } else if (me) {
      const bw = 60 * scale;
      bar(ctx, PAD, H - PAD - 6 * scale, bw, 6 * scale, me.hp / me.maxHp, me.hp / me.maxHp > 0.3 ? '#55b04a' : '#a8321f');
      text(ctx, String(Math.floor(me.hp)), PAD + bw / 2, H - PAD - 3 * scale, { size: small, align: 'center', base: 'middle' });
      const lvStr = `BROŃ LV ${me.weaponLv}`;
      text(ctx, lvStr, PAD + bw + 10, H - PAD - 3 * scale, { size: fs, base: 'middle' });
      const gun = rifleStats(balance, me.weaponLv);
      const low = me.ammo <= 5 && Math.floor(state.nowMs / 250) % 2 === 0;
      ctx.font = `bold ${fs}px monospace`;
      text(ctx, `${me.ammo} / ${gun.magazine}`, PAD + bw + 10 + ctx.measureText(lvStr).width + 12, H - PAD - 3 * scale,
        { size: fs, base: 'middle', color: low ? '#ff5a4a' : '#e8e2d4' });

      if (me.ultKind && balance.ultimate) drawUltBar(ctx, state, me, scale, fs, small);
      if (me.frenzyLeft > 0) text(ctx, `SZAŁ ${Math.ceil(me.frenzyLeft)} s`, W / 2, H - PAD - 40 * scale, { size: fs, align: 'center', color: '#ff5a4a' });

      const held = me.held;
      const label = held ? balance.items[held].name : 'nic';
      text(ctx, label, W - PAD, H - PAD - 3 * scale, { size: fs, align: 'right', base: 'middle' });
      if (held) {
        ctx.font = `bold ${fs}px monospace`;
        drawIcon(ctx, sprites.get(`item_${held}`), W - PAD - ctx.measureText(label).width - 12 * scale, H - PAD - 3 * scale, scale);
      }
    }

    state.fx?.drawHud(ctx, state.nowMs, toScreen, scale, text, small);

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

  if (state.flash) {
    ctx.globalAlpha = (state.flash.strong ? 0.35 : 0.12) * (1 - state.flash.k);
    ctx.fillStyle = state.flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (state.showCursor) {
    const { x, y } = state.mouse;
    const hit = state.fx && state.nowMs < state.fx.hitMarkerUntil;
    if (!hit) drawIcon(ctx, sprites.get('crosshair'), x, y, scale);
    else {
      const arm = 3 * scale;
      const gap = 3 * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(x - gap - arm - 1, y - scale / 2 - 1, arm + 2, scale + 2);
      ctx.fillRect(x + gap - 1, y - scale / 2 - 1, arm + 2, scale + 2);
      ctx.fillRect(x - scale / 2 - 1, y - gap - arm - 1, scale + 2, arm + 2);
      ctx.fillRect(x - scale / 2 - 1, y + gap - 1, scale + 2, arm + 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - gap - arm, y - scale / 2, arm, scale);
      ctx.fillRect(x + gap, y - scale / 2, arm, scale);
      ctx.fillRect(x - scale / 2, y - gap - arm, scale, arm);
      ctx.fillRect(x - scale / 2, y + gap, scale, arm);
    }
  }
}
