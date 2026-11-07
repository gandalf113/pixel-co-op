import { VIEW_W, VIEW_H } from './render.js';
import { formatTime } from './ui.js';
import { rifleStats } from '../shared/weapon.js';
import { LOW_HP } from './fx.js';
import { MV } from '../shared/mobview.js';
import { footprint, itemDef, setItemDefs } from '../shared/world.js';

const PAD = 12;
const BAR_COLORS = { turret: '#d9b53a', platform: '#8ea845', cage: '#6fc7c9' };
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
const TIER_FLASH_MS = 500;
// Poprzedni poziom ulta miedzy klatkami (jak reloadSeen w render.js); null = jeszcze nie widzielismy.
let tierSeen = null;
let tierFlashAt = -Infinity;

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
  const iconPx = 16 * scale;
  const x0 = PAD;
  const y0 = PAD;
  // Dwa sloty (V3-Q-08): ikona 1 z [F], ikona 2 z [C], obie swieca od progu I.
  const slots = [[me.ultKind, 'F'], [me.ultKind2, 'C']].filter(([k]) => k && u.kinds[k]);
  const tier = Math.min(3, Math.floor(me.ult / u.tierPoints));
  const full = tier === 3;
  if (tierSeen !== null && tier > tierSeen) tierFlashAt = now;
  tierSeen = tier;
  const flashK = (now - tierFlashAt) / TIER_FLASH_MS;
  const pulse = full ? 0.75 + 0.25 * Math.sin(now / 120) : 1;
  slots.forEach(([kind, key], i) => {
    const ix = x0 + i * (iconPx + 6);
    const icon = state.sprites.get(u.kinds[kind].sprite);
    ctx.fillStyle = '#000';
    ctx.fillRect(ix - 2, y0 - 2, iconPx + 4, iconPx + 4);
    ctx.globalAlpha = tier > 0 ? 1 : 0.55;
    if (icon) ctx.drawImage(icon, ix, y0, iconPx, iconPx);
    ctx.globalAlpha = 1;
    text(ctx, key, ix + iconPx - 2, y0 + iconPx - small + 1, { size: small, color: tier > 0 ? '#ffd23a' : '#a39b8c', align: 'right' });
  });
  const bx = x0 + slots.length * (iconPx + 6) + 2;
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
  if (full) {
    // Przy pelnym pasku migocze cala ramka paska, nie tylko napis.
    const k = 0.5 + 0.5 * Math.sin(now / 80);
    ctx.fillStyle = `rgba(255, 245, 190, ${0.1 + 0.35 * k})`;
    ctx.fillRect(bx - 2, by - 2, barW + 4, h + 4);
    ctx.strokeStyle = k > 0.5 ? '#ffffff' : '#ffb000';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 3, by - 3, barW + 6, h + 6);
  }
  let rx = bx;
  ROMAN.forEach((r, i) => {
    const lit = i < tier;
    // Cyfra aktualnie zdobytego poziomu jest wieksza i biala przez chwile po awansie.
    const flashing = i === tier - 1 && flashK >= 0 && flashK < 1;
    const sz = flashing ? Math.round(small * (1 + 0.8 * (1 - flashK))) : small;
    text(ctx, r, rx, by + h + small + 4, { size: sz, color: flashing ? '#ffffff' : lit ? '#ffd23a' : '#5a4f44' });
    ctx.font = `bold ${sz}px monospace`;
    rx += ctx.measureText(r).width + 8;
    if (i < 2) {
      text(ctx, '/', rx, by + h + small + 4, { size: small, color: '#5a4f44' });
      rx += ctx.measureText('/').width + 8;
    }
  });
  const ty = by + h + small + 4;
  if (full) {
    const blink = Math.floor(now / 300) % 2 === 0;
    text(ctx, slots.length > 1 ? 'ULTI GOTOWE [F] / [C]' : 'ULTI GOTOWE [F]', rx + 12, ty, { size: small, color: blink ? '#ffd23a' : '#ff7a2a' });
  } else if (state.deny) {
    text(ctx, 'ZA MAŁO', rx + 12, ty, { size: small, color: '#ff5a4a' });
  }
}

// Pasek bossa (MOB-06) pod napisem fali, na srodku. Zwraca wysokosc zajeta w pionie (0, gdy bossa nie ma),
// zeby linie pod spodem (gotowi, wracajacy, obserwacja) przesunely sie zamiast sie nakladac.
// Zrodlem jest lista potworow ze snapshotu; kilku bossow naraz = jeden pasek z sumy HP.
export function drawBossBar(ctx, state, scale, top, fs, small) {
  let hp = 0;
  let maxHp = 0;
  for (const m of state.snap?.mobs ?? []) {
    if (m[MV.type] !== 'boss') continue;
    hp += Math.max(0, m[MV.hp]);
    maxHp += Math.max(0, m[MV.maxHp]);
  }
  if (!(maxHp > 0)) return 0;
  const W = ctx.canvas.width;
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  const bw = Math.round(Math.min(W * 0.6, 220 * scale));
  const bh = Math.max(6, Math.round(4 * scale + 2));
  const bx = Math.round((W - bw) / 2);
  const name = (state.balance?.mobs?.boss?.name ?? 'BOSS').toUpperCase();
  const ty = Math.round(top + small);
  text(ctx, name, bx, ty, { size: small, color: '#ff7a5a' });
  text(ctx, `${Math.ceil(hp)} / ${Math.ceil(maxHp)} · ${Math.ceil(frac * 100)}%`, bx + bw, ty, { size: small, align: 'right' });
  const by = ty + 4;
  bar(ctx, bx, by, bw, bh, frac, frac > 0.3 ? '#a8321f' : '#d9b53a');
  // znaczniki co 25%, tak jak progi zuzycia scian
  ctx.fillStyle = '#000';
  for (const q of [0.25, 0.5, 0.75]) ctx.fillRect(bx + Math.round(bw * q), by, 1, bh);
  return by + bh + 4 - top;
}

// Canvas HUD ma ten sam rozmiar i pozycje co plansza; `mouse` jest juz we wspolrzednych planszy (main.js).
export function renderHud(ctx, scale, state) {
  const { snap, balance, sprites, cam, me } = state;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const fs = 6 * scale + 4;
  const small = 4 * scale + 3;
  const toScreen = (x, y) => {
    const v = cam.worldToView(x, y);
    return { x: v.x * scale, y: v.y * scale, vx: v.x, vy: v.y };
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
    setItemDefs(balance.items);
    for (const it of snap.items) {
      const cfg = itemDef(it.kind);
      if (!cfg?.durationS || it.state !== 'active' || !(it.timeLeft > 0)) continue;
      // Pasek nad calym obrysem (platforma 3x3 jest wyzsza niz dzialko), wypelnienie = pozostaly czas.
      const tiles = footprint(it.kind, it.tx, it.ty, 0);
      const top = Math.min(...tiles.map(([, ty]) => ty));
      const s = toScreen((it.tx + 0.5) * tp, top * tp);
      bar(ctx, s.x - 7 * scale, s.y - 3 * scale, 14 * scale, Math.max(2, scale), it.timeLeft / cfg.durationS, BAR_COLORS[cfg.behavior] ?? '#d9b53a');
    }

    for (const p of state.players) {
      if (p.id === snap.you.id || p.state === 'dead') continue;
      const s = toScreen(p.x, p.y);
      if (s.vx >= 0 && s.vx <= VIEW_W && s.vy >= 0 && s.vy <= VIEW_H) continue;
      const cx = VIEW_W / 2;
      const cy = VIEW_H / 2;
      const a = Math.atan2(s.vy - cy, s.vx - cx);
      const k = Math.min((cx - 10) / Math.abs(Math.cos(a) || 1e-9), (cy - 10) / Math.abs(Math.sin(a) || 1e-9));
      const ax = (cx + Math.cos(a) * k) * scale;
      const ay = (cy + Math.sin(a) * k) * scale;
      const downed = p.state === 'downed';
      // Wolanie o pomoc: migajacy alarmowy obrys i sekundy do smierci przy grocie.
      const alarm = downed && Math.floor(state.nowMs / 200) % 2 === 0;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = alarm ? '#ff2a1a' : '#000';
      ctx.lineWidth = downed ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(6 * scale, 0);
      ctx.lineTo(-4 * scale, -5 * scale);
      ctx.lineTo(-4 * scale, 5 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (downed) {
        // Tekst lezy w strone srodka planszy od grotu, wiec nie wypada poza krawedz.
        text(ctx, String(Math.ceil(p.deathLeft)), ax - Math.cos(a) * 14 * scale, ay - Math.sin(a) * 14 * scale,
          { color: p.color, size: small, align: 'center', base: 'middle' });
      }
    }

    const bossH = drawBossBar(ctx, state, scale, PAD + fs + 6, fs, small);
    let topLine;
    if (snap.event) {
      // wydarzenie (V3-Q-06): nazwa miga przez pierwsze 2 s, potem stoi na zloto
      const fresh = snap.event.t < 2 && Math.floor(state.nowMs / 200) % 2 === 0;
      topLine = { str: `WYDARZENIE: ${snap.event.name}`, color: fresh ? '#ffffff' : '#ffd23a' };
    } else if (snap.phase === 'break') {
      const blink = snap.breakLeft <= 5 && Math.floor(state.nowMs / 250) % 2 === 0;
      topLine = { str: `PRZERWA ${formatTime(snap.breakLeft)}`, color: blink ? '#ff5a4a' : '#d9b53a' };
    } else {
      topLine = { str: `FALA ${snap.wave} · potwory: ${snap.mobsLeft}`, color: '#e8e2d4' };
    }
    text(ctx, topLine.str, W / 2, PAD + fs, { color: topLine.color, size: fs, align: 'center' });
    if (snap.phase === 'break' && !snap.event) {
      const ready = snap.players.filter((p) => p.ready).map((p) => p.nick);
      const line = `${ready.length ? `Gotowi: ${ready.join(', ')} · ` : ''}${me?.ready ? 'gotowy ✓' : '[G] Gotowy'}`;
      text(ctx, line, W / 2, PAD + fs * 2 + 4 + bossH, { size: small, align: 'center' });
    }

    let sy = PAD + fs * 3 + 8 + bossH;
    for (const p of snap.players) {
      if (!p.suspended) continue;
      text(ctx, `${p.nick}: wraca…`, W / 2, sy, { color: p.color, size: small, align: 'center' });
      sy += small + 4;
    }

    if (me && me.state === 'dead') {
      const who = state.spectating;
      text(ctx, who ? `OBSERWUJESZ: ${who.nick}` : 'NIKT NIE ŻYJE', W / 2, PAD + fs * 4 + 12 + bossH, { size: fs, align: 'center', color: who?.color ?? '#ff5a4a' });
      text(ctx, 'wracasz w przerwie · klik / A / D: zmień', W / 2, PAD + fs * 5 + 16 + bossH, { size: small, align: 'center' });
      if (me.ultKind && balance.ultimate) drawUltBar(ctx, state, me, scale, fs, small);
    } else if (me) {
      const bw = 60 * scale;
      const flashing = state.fx && state.nowMs < state.fx.hpFlashUntil && Math.floor(state.nowMs / 60) % 2 === 0;
      bar(ctx, PAD, H - PAD - 6 * scale, bw, 6 * scale, me.hp / me.maxHp, flashing ? '#ffffff' : me.hp / me.maxHp > LOW_HP ? '#55b04a' : '#a8321f');
      const lost = state.fx?.lostHp;
      if (lost && state.nowMs < lost.until) {
        ctx.globalAlpha = Math.min(1, (lost.until - state.nowMs) / 300);
        text(ctx, `-${Math.ceil(lost.v)}`, PAD + bw + 6, H - PAD - 10 * scale, { size: small, color: '#ff5a4a', base: 'middle' });
        ctx.globalAlpha = 1;
      }
      text(ctx, String(Math.floor(me.hp)), PAD + bw / 2, H - PAD - 3 * scale, { size: small, align: 'center', base: 'middle' });
      const mod = balance.weaponMods?.[me.weaponMod];
      const lvStr = `BROŃ LV ${me.weaponLv}${mod ? ` ${mod.icon} ${mod.name}` : ''}`;
      text(ctx, lvStr, PAD + bw + 10, H - PAD - 3 * scale, { size: fs, base: 'middle' });
      const gun = rifleStats(balance, me.weaponLv);
      const low = me.ammo <= 5 && Math.floor(state.nowMs / 250) % 2 === 0;
      ctx.font = `bold ${fs}px monospace`;
      text(ctx, `${me.ammo} / ${gun.magazine}`, PAD + bw + 10 + ctx.measureText(lvStr).width + 12, H - PAD - 3 * scale,
        { size: fs, base: 'middle', color: low ? '#ff5a4a' : '#e8e2d4' });

      if (me.ultKind && balance.ultimate) drawUltBar(ctx, state, me, scale, fs, small);
      if (me.frenzyLeft > 0) text(ctx, `SZAŁ ${Math.ceil(me.frenzyLeft)} s`, W / 2, H - PAD - 40 * scale, { size: fs, align: 'center', color: '#ff5a4a' });

      const held = me.held;
      const offensive = held && ['turret', 'mine', 'spikes'].includes(balance.items[held].behavior);
      const bonus = offensive && me.powerBonus > 0 ? ` +${Math.round(me.powerBonus * 100)}%` : '';
      const label = held ? balance.items[held].name + bonus : 'nic';
      text(ctx, label, W - PAD, H - PAD - 3 * scale, { size: fs, align: 'right', base: 'middle' });
      if (held) {
        ctx.font = `bold ${fs}px monospace`;
        drawIcon(ctx, sprites.get(`item_${held}`), W - PAD - ctx.measureText(label).width - 12 * scale, H - PAD - 3 * scale, scale);
      }
    }

    state.fx?.drawHud(ctx, state.nowMs, toScreen, scale, text, small, me);

    if (state.hint) text(ctx, `[E] podnieś: ${state.hint}`, W / 2, H - PAD - 24 * scale, { size: fs, align: 'center' });

    if (state.tab) {
      const rowH = fs + 8;
      const tw = 400 + 20 * scale;
      const th = rowH * (snap.players.length + 1) + 16;
      const tx = (W - tw) / 2;
      const ty = (H - th) / 2;
      ctx.fillStyle = 'rgba(20, 18, 15, 0.88)';
      ctx.fillRect(tx, ty, tw, th);
      snap.players.forEach((p, i) => {
        const y = ty + 8 + rowH * (i + 1);
        text(ctx, p.nick, tx + 12, y, { color: p.color, size: fs });
        const pm = balance.weaponMods?.[p.weaponMod];
        text(ctx, `LV ${p.weaponLv}${pm ? ` ${pm.icon} ${pm.name}` : ''}`, tx + 120, y, { size: fs, color: pm ? '#ffd23a' : '#e8e2d4' });
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
