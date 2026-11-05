import { DECOR_SPRITES } from './sprites.js';
import { footprint } from '../shared/world.js';
import { rifleStats } from '../shared/weapon.js';

export const VIEW_W = 560;
export const VIEW_H = 315;
const DECOR_PERCENT = 12;
const SPLAT_VARIANTS = 4;
const THROW_ARC_PX = 8;

export function computeScale(winW, winH) {
  return Math.max(1, Math.floor(Math.min(winW / VIEW_W, winH / VIEW_H)));
}

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  follow(x, y) {
    this.x = x;
    this.y = y;
  }

  worldToView(x, y) {
    return { x: x - this.x + VIEW_W / 2, y: y - this.y + VIEW_H / 2 };
  }

  viewToWorld(x, y) {
    return { x: x + this.x - VIEW_W / 2, y: y + this.y - VIEW_H / 2 };
  }
}

export function tileHash(tx, ty, seed = 0) {
  let h = (Math.imul(tx, 374761393) + Math.imul(ty, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function drawCentered(ctx, img, x, y, angle = 0, flipY = false) {
  if (!img) return;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (angle) ctx.rotate(angle);
  if (flipY) ctx.scale(1, -1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function drawGround(ctx, view, ox, oy) {
  const { balance, sprites, cam } = view;
  const { tilesW, tilesH, tilePx } = balance.map;
  const hw = VIEW_W / 2;
  const hh = VIEW_H / 2;
  const x0 = Math.max(0, Math.floor((cam.x - hw) / tilePx));
  const y0 = Math.max(0, Math.floor((cam.y - hh) / tilePx));
  const x1 = Math.min(tilesW - 1, Math.floor((cam.x + hw) / tilePx));
  const y1 = Math.min(tilesH - 1, Math.floor((cam.y + hh) / tilePx));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const h = tileHash(tx, ty);
      const d = tileHash(tx, ty, view.seed ?? 0);
      const px = tx * tilePx + ox;
      const py = ty * tilePx + oy;
      ctx.drawImage(sprites.get(`ground_${h % 3}`), px, py);
      if ((d >>> 8) % 100 < DECOR_PERCENT && DECOR_SPRITES.length) {
        ctx.drawImage(sprites.get(DECOR_SPRITES[(d >>> 16) % DECOR_SPRITES.length]), px, py);
      }
    }
  }
  ctx.strokeStyle = '#5e1a10';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 1, oy - 1, tilesW * tilePx + 2, tilesH * tilePx + 2);
}

const goreCache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function corpseSprite(sprites, type) {
  let img = goreCache.get(type);
  if (img) return img;
  const src = sprites.get(`${type}_0`);
  img = canvas(src.width, src.height);
  const c = img.getContext('2d');
  c.filter = 'brightness(0.5) saturate(0.6)';
  c.drawImage(src, 0, 0);
  c.filter = 'none';
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(90, 10, 5, 0.35)';
  c.fillRect(0, 0, img.width, img.height);
  goreCache.set(type, img);
  return img;
}

function splatSprite(big, variant) {
  const key = `splat_${big ? 1 : 0}_${variant}`;
  let img = goreCache.get(key);
  if (img) return img;
  const size = big ? 14 : 5;
  img = canvas(size, size);
  const c = img.getContext('2d');
  let s = tileHash(variant, big ? 7 : 3);
  const rnd = () => ((s = tileHash(s, 11)) % 1000) / 1000;
  const r = size / 2;
  const blobs = big ? 7 : 2;
  for (let i = 0; i < blobs; i++) {
    const a = rnd() * Math.PI * 2;
    const dist = rnd() * r * 0.5;
    const br = 1 + rnd() * r * (big ? 0.45 : 0.6);
    const cx = r + Math.cos(a) * dist;
    const cy = r + Math.sin(a) * dist;
    c.fillStyle = i % 3 === 2 ? '#4a0d08' : '#6e140c';
    for (let y = Math.floor(cy - br); y <= cy + br; y++) {
      for (let x = Math.floor(cx - br); x <= cx + br; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= br * br) c.fillRect(x, y, 1, 1);
      }
    }
  }
  goreCache.set(key, img);
  return img;
}

function baked(key, w, h, paint) {
  let img = goreCache.get(key);
  if (img) return img;
  img = canvas(w, h);
  paint(img.getContext('2d'), img);
  goreCache.set(key, img);
  return img;
}

const silhouettes = new Map();

function silhouette(src, color) {
  let byColor = silhouettes.get(color);
  if (!byColor) silhouettes.set(color, (byColor = new WeakMap()));
  let img = byColor.get(src);
  if (img) return img;
  img = canvas(src.width, src.height);
  const c = img.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, img.width, img.height);
  byColor.set(src, img);
  return img;
}

function muzzleSprite(frame) {
  return baked(`muzzle_${frame}`, 8, 8, (c) => {
    if (frame === 0) {
      c.fillStyle = '#ff9a2a';
      c.fillRect(1, 2, 6, 4);
      c.fillRect(2, 1, 4, 6);
      c.fillStyle = '#ffe07a';
      c.fillRect(2, 3, 5, 2);
      c.fillRect(3, 2, 3, 4);
      c.fillStyle = '#ffffff';
      c.fillRect(3, 3, 3, 2);
    } else {
      c.fillStyle = '#ff9a2a';
      c.fillRect(2, 3, 4, 2);
      c.fillStyle = '#ffe07a';
      c.fillRect(3, 3, 2, 2);
    }
  });
}

export function fxSprites(sprites) {
  return {
    rubble(ctx, kind, tx, ty, rot, ox, oy) {
      const tp = 16;
      if (kind === 'turret30') {
        ctx.drawImage(sprites.get('turret_wreck'), tx * tp + ox, ty * tp + oy);
        return;
      }
      for (const [x, y] of footprint(kind, tx, ty, rot)) ctx.drawImage(sprites.get(`rubble_${tileHash(x, y) % 2}`), x * tp + ox, y * tp + oy);
    },
    collapse(ctx, c, k, ox, oy, tp) {
      const frame = Math.min(2, Math.floor(k * 3));
      const img = sprites.get(c.kind === 'turret30' ? 'turret_wreck' : `wall_collapse_${frame}`);
      for (const [x, y] of c.tiles) ctx.drawImage(img, x * tp + ox, y * tp + oy);
    },
    muzzle(ctx, x, y, a, frame) {
      drawCentered(ctx, muzzleSprite(frame), x, y, a);
    },
  };
}

function onScreen(view, x, y) {
  const { cam } = view;
  return Math.abs(x - cam.x) < VIEW_W / 2 + 16 && Math.abs(y - cam.y) < VIEW_H / 2 + 16;
}

function drawGore(ctx, view, ox, oy) {
  const gore = view.gore;
  if (!gore) return;
  for (const [x, y, big] of gore.splats) {
    if (!onScreen(view, x, y)) continue;
    drawCentered(ctx, splatSprite(big, tileHash(x, y) % SPLAT_VARIANTS), x + ox, y + oy);
  }
  for (const [type, x, y, a] of gore.corpses) {
    if (!onScreen(view, x, y)) continue;
    drawCentered(ctx, corpseSprite(view.sprites, type), x + ox, y + oy, a, Math.abs(a) > Math.PI / 2);
  }
}

const SHAKE_MS = 160;

function outline(ctx, img, x, y, view) {
  const on = Math.floor(view.nowMs / 250) % 2 === 0;
  const sil = silhouette(img, on ? '#ffffff' : '#e8e2d4');
  ctx.globalAlpha = on ? 1 : 0.6;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(sil, x + dx, y + dy);
  ctx.globalAlpha = 1;
}

function drawItems(ctx, view, ox, oy) {
  const { balance, sprites, frame } = view;
  const tp = balance.map.tilePx;
  for (const it of view.items) {
    if (it.state === 'placed' || it.state === 'active') {
      const hitAt = view.shakes?.get(it.id);
      const shake = hitAt != null && view.nowMs - hitAt < SHAKE_MS ? ((frame & 1) ? 1 : -1) : 0;
      const sx = ox + shake;
      if (it.kind === 'wall') {
        const frac = it.maxHp ? it.hp / it.maxHp : 1;
        const center = (w) => ({ x: (w.tx + (w.rot ? 0.5 : 1)) * tp, y: (w.ty + (w.rot ? 1 : 0.5)) * tp });
        const stage = view.fx ? view.fx.wearStage(view.nowMs, it, frac, tp, center) : 0;
        const lit = it.id === view.highlightId;
        for (const [tx, ty] of footprint('wall', it.tx, it.ty, it.rot)) {
          const img = sprites.get(stage ? `wall_dmg_${stage}` : 'wall');
          if (lit) outline(ctx, img, tx * tp + sx, ty * tp + oy - 1, view);
          ctx.drawImage(img, tx * tp + sx, ty * tp + oy - (lit ? 1 : 0));
        }
      } else {
        const base = it.kind === 'turret30' ? 'turret' : 'mine';
        const f = it.kind === 'mine' && !it.armed ? 0 : (frame >> 3) & 1;
        ctx.drawImage(sprites.get(`${base}_${f}`), it.tx * tp + sx, it.ty * tp + oy);
      }
    } else if (it.state === 'flying' && it.flight) {
      const { x0, y0, x1, y1, p } = it.flight;
      const x = x0 + (x1 - x0) * p;
      const y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * THROW_ARC_PX;
      drawCentered(ctx, sprites.get(`item_${it.kind}`), x + ox, y + oy);
    } else if (it.state === 'ground') {
      const img = sprites.get(`item_${it.kind}`);
      const lit = it.id === view.highlightId;
      if (lit) outline(ctx, img, Math.round(it.x + ox - img.width / 2), Math.round(it.y + oy - img.height / 2) - 1, view);
      drawCentered(ctx, img, it.x + ox, it.y + oy - (lit ? 1 : 0));
    }
  }
}

function drawMobs(ctx, view, ox, oy) {
  const { sprites, frame } = view;
  for (const m of view.mobs) {
    const [id, type, x, y, , , stunned, frozen, burning] = m;
    const angle = view.mobAngles?.get(id) ?? 0;
    const flip = Math.abs(angle) > Math.PI / 2;
    if (stunned && !frozen) ctx.globalAlpha = (frame >> 2) & 1 ? 0.5 : 1;
    const k = view.fx ? view.fx.knock(id, view.nowMs) : { x: 0, y: 0 };
    let img = sprites.get(`${type}_${frozen ? 0 : ((frame >> 3) + id) & 1}`);
    if (view.fx && view.nowMs < (view.fx.mobFlash.get(id) ?? 0)) img = silhouette(img, '#ffffff');
    drawCentered(ctx, img, x + ox + k.x, y + oy + k.y, angle, flip);
    ctx.globalAlpha = 1;
    const r = view.balance.mobs[type].radiusPx + 1;
    if (frozen) {
      ctx.fillStyle = 'rgba(140, 220, 255, 0.35)';
      ctx.strokeStyle = 'rgba(190, 240, 255, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (burning) {
      ctx.fillStyle = (frame >> 2) & 1 ? '#ff9a2a' : '#ffd23a';
      ctx.fillRect(Math.round(x + ox - 2 + ((frame + id) % 4)), Math.round(y + oy - r - 1), 2, 2);
    }
  }
}

function drawPlayers(ctx, view, ox, oy) {
  const { sprites, frame, balance } = view;
  for (const p of view.players) {
    if (p.state === 'dead') continue;
    if (p.invuln > 0 && (frame >> 2) & 1) continue;
    const walk = p.moving ? (frame >> 3) & 1 : 0;
    ctx.save();
    if (p.state === 'downed') {
      ctx.filter = 'grayscale(1)';
      ctx.globalAlpha = 0.7;
    }
    if (p.suspended) ctx.globalAlpha = 0.4;
    const rc = view.fx ? view.fx.recoilOf(p.id, view.nowMs) : { x: 0, y: 0 };
    let img = sprites.get(`player_${walk}@${p.color}`);
    if (view.fx && view.nowMs < (view.fx.playerFlash.get(p.id) ?? 0)) img = silhouette(img, '#ff3a2a');
    drawCentered(ctx, img, p.x + ox + rc.x, p.y + oy + rc.y, p.state === 'downed' ? 0 : p.angle);
    ctx.restore();
    drawReloadRing(ctx, view, p, ox, oy);
    if (p.frenzyLeft > 0) {
      ctx.strokeStyle = (frame >> 2) & 1 ? '#ff5a4a' : '#ffd23a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.held) {
      const img = sprites.get(`item_${p.held}`);
      ctx.save();
      ctx.translate(Math.round(p.x + ox), Math.round(p.y + oy - balance.map.tilePx * 0.75));
      ctx.scale(0.75, 0.75);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
  }
}

const reloadSeen = new Map();
const RING_FLASH_MS = 150;

function drawReloadRing(ctx, view, p, ox, oy) {
  const mine = p.id === view.myId;
  const total = rifleStats(view.balance, p.weaponLv ?? 1).reloadS;
  const x = p.x + ox;
  const y = p.y + oy;
  const r = 14;
  if (p.reloadLeft > 0) {
    reloadSeen.set(p.id, 0);
    const k = Math.max(0, Math.min(1, 1 - p.reloadLeft / total));
    ctx.lineWidth = mine ? 2 : 1;
    if (mine) {
      ctx.strokeStyle = 'rgba(20, 18, 15, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = mine ? '#e8e2d4' : p.color;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
    return;
  }
  if (reloadSeen.get(p.id) === 0) reloadSeen.set(p.id, view.nowMs);
  const doneAt = reloadSeen.get(p.id);
  if (doneAt && view.nowMs - doneAt < RING_FLASH_MS) {
    ctx.globalAlpha = 1 - (view.nowMs - doneAt) / RING_FLASH_MS;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = mine ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawGhost(ctx, view, ox, oy) {
  const g = view.ghost;
  if (!g) return;
  const tp = view.balance.map.tilePx;
  ctx.fillStyle = g.valid ? 'rgba(80, 220, 90, 0.4)' : 'rgba(230, 50, 40, 0.4)';
  ctx.strokeStyle = g.valid ? 'rgba(80, 220, 90, 0.9)' : 'rgba(230, 50, 40, 0.9)';
  ctx.lineWidth = 1;
  for (const [tx, ty] of g.tiles) {
    ctx.fillRect(tx * tp + ox, ty * tp + oy, tp, tp);
    ctx.strokeRect(tx * tp + ox + 0.5, ty * tp + oy + 0.5, tp - 1, tp - 1);
  }
}

function drawDroplets(ctx, view, ox, oy) {
  const pulse = (view.frame >> 3) & 1;
  for (const [, x, y] of view.droplets ?? []) {
    const s = pulse ? 6 : 4;
    ctx.fillStyle = pulse ? '#bff6ff' : '#6fe0ff';
    ctx.fillRect(Math.round(x + ox - s / 2), Math.round(y + oy - s / 2), s, s);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x + ox - 1), Math.round(y + oy - 1), 2, 2);
  }
}

function drawRockets(ctx, view, ox, oy) {
  for (const [, x, y, a] of view.rockets ?? []) {
    ctx.save();
    ctx.translate(Math.round(x + ox), Math.round(y + oy));
    ctx.rotate(a);
    ctx.fillStyle = (view.frame >> 1) & 1 ? '#ffd23a' : '#ff7a2a';
    ctx.fillRect(-9, -1, 4, 2);
    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(-5, -2, 8, 4);
    ctx.fillStyle = '#a8321f';
    ctx.fillRect(3, -1, 2, 2);
    ctx.restore();
  }
}

function ring(ctx, x, y, r, color, alpha, fill = 0) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
  ctx.stroke();
  if (fill) {
    ctx.globalAlpha = alpha * fill;
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEffects(ctx, view, ox, oy) {
  const { balance, nowMs } = view;
  const tp = balance.map.tilePx;
  for (const e of view.effects ?? []) {
    const k = Math.min(1, (nowMs - e.start) / e.durMs);
    const x = e.x + ox;
    const y = e.y + oy;
    const fade = 1 - k;
    if (e.kind === 'explode') {
      ring(ctx, x, y, e.radiusPx * (0.4 + 0.6 * k), '#ff9a2a', fade, 0.5);
      continue;
    }
    const c = balance.ultimate.kinds[e.kind].tiers[e.tier - 1];
    const big = e.tier === 3 ? 1.4 : 1;
    if (e.kind === 'shockwave') {
      ring(ctx, x, y, c.radiusTiles * tp * k, e.color, fade, 0.25);
      if (e.tier === 3) ring(ctx, x, y, c.radiusTiles * tp * k * 0.7, '#ffffff', fade);
    } else if (e.kind === 'heal') {
      ring(ctx, x, y, (c.radiusTiles || 20) * tp * k, '#55e06a', fade, 0.2 * big);
    } else if (e.kind === 'freeze') {
      ring(ctx, x, y, (c.radiusTiles || 40) * tp * k, '#9fe6ff', fade, 0.3 * big);
    } else if (e.kind === 'widegun') {
      const half = (c.coneDeg * Math.PI) / 360;
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = '#ffe07a';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, c.rangeTiles * tp, e.angle - half, e.angle + half);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ring(ctx, x, y, 12 * big * k, e.color, fade);
    }
  }
}

export function renderWorld(ctx, view) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(view.pxScale, 0, 0, view.pxScale, 0, 0);
  const shake = view.fx ? view.fx.shakeOffset(view.nowMs) : { x: 0, y: 0 };
  const ox = Math.round(VIEW_W / 2 - view.cam.x) + shake.x;
  const oy = Math.round(VIEW_H / 2 - view.cam.y) + shake.y;
  const fxs = fxSprites(view.sprites);
  drawGround(ctx, view, ox, oy);
  drawGore(ctx, view, ox, oy);
  view.fx?.drawGround(ctx, ox, oy, fxs);
  drawDroplets(ctx, view, ox, oy);
  drawItems(ctx, view, ox, oy);
  drawGhost(ctx, view, ox, oy);
  drawMobs(ctx, view, ox, oy);
  drawPlayers(ctx, view, ox, oy);
  const bullet = view.sprites.get('bullet');
  for (const [, x, y] of view.bullets) drawCentered(ctx, bullet, x + ox, y + oy);
  drawRockets(ctx, view, ox, oy);
  view.fx?.drawTop(ctx, ox, oy, view.nowMs, fxs, view.balance.map.tilePx);
  drawEffects(ctx, view, ox, oy);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
