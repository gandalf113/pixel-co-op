import { DECOR_SPRITES } from './sprites.js';
import { footprint } from '../shared/world.js';

export const VIEW_W = 480;
export const VIEW_H = 270;
const DECOR_PERCENT = 8;
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

export function tileHash(tx, ty) {
  let h = (Math.imul(tx, 374761393) + Math.imul(ty, 668265263)) | 0;
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
  const x0 = Math.max(0, Math.floor((cam.x - VIEW_W / 2) / tilePx));
  const y0 = Math.max(0, Math.floor((cam.y - VIEW_H / 2) / tilePx));
  const x1 = Math.min(tilesW - 1, Math.floor((cam.x + VIEW_W / 2) / tilePx));
  const y1 = Math.min(tilesH - 1, Math.floor((cam.y + VIEW_H / 2) / tilePx));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const h = tileHash(tx, ty);
      const px = tx * tilePx + ox;
      const py = ty * tilePx + oy;
      ctx.drawImage(sprites.get(`ground_${h % 3}`), px, py);
      if ((h >>> 8) % 100 < DECOR_PERCENT && DECOR_SPRITES.length) {
        ctx.drawImage(sprites.get(DECOR_SPRITES[(h >>> 16) % DECOR_SPRITES.length]), px, py);
      }
    }
  }
  ctx.strokeStyle = '#5e1a10';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 1, oy - 1, tilesW * tilePx + 2, tilesH * tilePx + 2);
}

function drawItems(ctx, view, ox, oy) {
  const { balance, sprites, frame } = view;
  const tp = balance.map.tilePx;
  for (const it of view.items) {
    if (it.state === 'placed' || it.state === 'active') {
      if (it.kind === 'wall') {
        for (const [tx, ty] of footprint('wall', it.tx, it.ty, it.rot)) ctx.drawImage(sprites.get('wall'), tx * tp + ox, ty * tp + oy);
      } else {
        const base = it.kind === 'turret30' ? 'turret' : 'mine';
        const f = it.kind === 'mine' && !it.armed ? 0 : (frame >> 3) & 1;
        ctx.drawImage(sprites.get(`${base}_${f}`), it.tx * tp + ox, it.ty * tp + oy);
      }
    } else if (it.state === 'flying' && it.flight) {
      const { x0, y0, x1, y1, p } = it.flight;
      const x = x0 + (x1 - x0) * p;
      const y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * THROW_ARC_PX;
      drawCentered(ctx, sprites.get(`item_${it.kind}`), x + ox, y + oy);
    } else if (it.state === 'ground') {
      drawCentered(ctx, sprites.get(`item_${it.kind}`), it.x + ox, it.y + oy);
    }
  }
}

function drawMobs(ctx, view, ox, oy) {
  const { sprites, frame } = view;
  for (const m of view.mobs) {
    const [id, type, x, y, , , stunned] = m;
    const angle = view.mobAngles?.get(id) ?? 0;
    const flip = Math.abs(angle) > Math.PI / 2;
    if (stunned) ctx.globalAlpha = (frame >> 2) & 1 ? 0.5 : 1;
    drawCentered(ctx, sprites.get(`${type}_${((frame >> 3) + id) & 1}`), x + ox, y + oy, angle, flip);
    ctx.globalAlpha = 1;
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
    drawCentered(ctx, sprites.get(`player_${walk}@${p.color}`), p.x + ox, p.y + oy, p.state === 'downed' ? 0 : p.angle);
    ctx.restore();
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

export function renderWorld(ctx, view) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const o = view.cam.worldToView(0, 0);
  const ox = Math.round(o.x);
  const oy = Math.round(o.y);
  drawGround(ctx, view, ox, oy);
  drawItems(ctx, view, ox, oy);
  drawGhost(ctx, view, ox, oy);
  drawMobs(ctx, view, ox, oy);
  drawPlayers(ctx, view, ox, oy);
  const bullet = view.sprites.get('bullet');
  for (const [, x, y] of view.bullets) drawCentered(ctx, bullet, x + ox, y + oy);
}
