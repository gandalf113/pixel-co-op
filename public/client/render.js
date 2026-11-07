import { DECOR_SPRITES } from './sprites.js';
import { footprint, itemDef, setItemDefs } from '../shared/world.js';
import { rifleStats } from '../shared/weapon.js';
import { STAGE_BONES, STAGE_BLOAT, STAGE_FADED } from './gore.js';
import { MV, wearStageOf } from '../shared/mobview.js';

export const VIEW_W = 560;
export const VIEW_H = 315;
const DECOR_PERCENT = 12;
const SPLAT_VARIANTS = 4;
const THROW_ARC_PX = 8;

export function computeScale(winW, winH) {
  // Skala ulamkowa: swiat ma stale 560x315, zeby wszyscy gracze widzieli to samo pole gry.
  return Math.max(1, Math.min(winW / VIEW_W, winH / VIEW_H));
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

// Brak sprite'a nie moze ubic calej klatki: w przegladarce drawImage(undefined) rzuca TypeError,
// a wyjatek w srodku renderu zostawia ekran bez przedmiotow, potworow, graczy i HUD-u.
function blit(ctx, img, x, y) {
  if (!img) return;
  ctx.drawImage(img, x, y);
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
      blit(ctx, sprites.get(`ground_${h % 3}`), px, py);
      if ((d >>> 8) % 100 < DECOR_PERCENT && DECOR_SPRITES.length) {
        blit(ctx, sprites.get(DECOR_SPRITES[(d >>> 16) % DECOR_SPRITES.length]), px, py);
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

function sizeClass(w) {
  return w <= 20 ? 16 : w <= 40 ? 32 : 64;
}

function typeSeed(type) {
  let h = 7;
  for (let i = 0; i < type.length; i++) h = tileHash(h, type.charCodeAt(i));
  return h;
}

// Swiezy i rozdety: filtr zywego sprite'a. Rozdety = ciemniej, mniej koloru,
// zgnila zielen i deterministyczne plamy rozkladu (seed z typu, wiec identyczne u wszystkich).
function corpseSprite(sprites, type, stage) {
  const key = `corpse_${type}_${stage}`;
  let img = goreCache.get(key);
  if (img) return img;
  const src = sprites.get(`${type}_0`);
  img = canvas(src.width, src.height);
  const c = img.getContext('2d');
  c.filter = stage === STAGE_BLOAT ? 'brightness(0.38) saturate(0.35)' : 'brightness(0.5) saturate(0.6)';
  c.drawImage(src, 0, 0);
  c.filter = 'none';
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = stage === STAGE_BLOAT ? 'rgba(45, 70, 15, 0.45)' : 'rgba(90, 10, 5, 0.35)';
  c.fillRect(0, 0, img.width, img.height);
  if (stage === STAGE_BLOAT) {
    let s = typeSeed(type);
    const n = 3 + (s % 3);
    c.fillStyle = 'rgba(20, 28, 8, 0.7)';
    for (let i = 0; i < n; i++) {
      s = tileHash(s, 13);
      const x = s % img.width;
      s = tileHash(s, 17);
      const y = s % img.height;
      c.fillRect(x, y, 1 + (s >>> 8) % 2, 1 + (s >>> 12) % 2);
    }
  }
  goreCache.set(key, img);
  return img;
}

// Szkielet wspolny dla klasy rozmiaru (16 / 32 / 64 px), zwrocony glowa w +x jak sprite zywego.
function skeletonSprite(cls) {
  return baked(`bones_${cls}`, cls, cls, (c) => {
    const mid = cls / 2;
    const bone = '#d8d2bc', shade = '#a89e85';
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const u = cls / 16;
    const head = Math.max(2, Math.round(cls * 0.22));
    const spineX0 = Math.round(cls * 0.12), spineX1 = Math.round(cls * 0.66);
    px(spineX0, mid - 0.5 * u, spineX1 - spineX0, u, shade);
    const ribs = Math.max(2, Math.round(cls / 8));
    for (let i = 0; i < ribs; i++) {
      const rx = spineX0 + (spineX1 - spineX0) * (0.25 + 0.7 * (i / ribs));
      const h = cls * 0.3 * (1 - Math.abs(i / ribs - 0.4) * 0.8);
      px(rx, mid - h, u, h * 2 + u, bone);
      px(rx, mid - h, u * 1.5, u, shade);
      px(rx, mid + h, u * 1.5, u, shade);
    }
    const hx = spineX1 + u;
    px(hx, mid - head / 2, head, head, bone);
    px(hx + head - u * 1.5, mid - head / 2 + u, u * 1.5, Math.max(1, head - 2 * u), shade);
    px(hx + u * 0.5, mid - head / 2 + u, u, u, '#2a251b');
    px(hx + u * 0.5, mid + head / 2 - 2 * u, u, u, '#2a251b');
    px(cls * 0.06, mid - u, u, 2 * u, bone);
  });
}

function splatSprite(level, variant, size) {
  const key = `splat_${level}_${variant}`;
  let img = goreCache.get(key);
  if (img) return img;
  img = canvas(size, size);
  const c = img.getContext('2d');
  let s = tileHash(variant, 3 + level * 4);
  const rnd = () => ((s = tileHash(s, 11)) % 1000) / 1000;
  const r = size / 2;
  const blobs = level === 0 ? 2 : 5 + level * 3;
  for (let i = 0; i < blobs; i++) {
    const a = rnd() * Math.PI * 2;
    const dist = rnd() * r * (level === 0 ? 0.5 : 0.55);
    const br = 1 + rnd() * r * (level === 0 ? 0.6 : 0.4);
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

// Odcisk buta 3 x 5 px, czubkiem w +x: podeszwa i oddzielona pieta.
function stepSprite() {
  return baked('step', 5, 3, (c) => {
    c.fillStyle = '#6e140c';
    c.fillRect(2, 0, 3, 3);
    c.fillRect(0, 0, 1, 3);
    c.clearRect(4, 0, 1, 1);
    c.clearRect(4, 2, 1, 1);
  });
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
      const wreck = itemDef(kind)?.wreck;
      if (wreck) {
        blit(ctx, sprites.get(wreck), tx * tp + ox, ty * tp + oy);
        return;
      }
      for (const [x, y] of footprint(kind, tx, ty, rot)) blit(ctx, sprites.get(`rubble_${tileHash(x, y) % 2}`), x * tp + ox, y * tp + oy);
    },
    collapse(ctx, c, k, ox, oy, tp) {
      const frame = Math.min(2, Math.floor(k * 3));
      const img = sprites.get(itemDef(c.kind)?.wreck ?? `wall_collapse_${frame}`);
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
  const cfg = gore.cfg;
  // plamy -> slady -> trupy
  for (const m of gore.marks) {
    if (m.kind !== 'splat' || !onScreen(view, m.x, m.y)) continue;
    drawCentered(ctx, splatSprite(m.level, tileHash(m.x, m.y) % SPLAT_VARIANTS, cfg.splatSizes[m.level]), m.x + ox, m.y + oy);
  }
  const prev = ctx.globalAlpha;
  for (const m of gore.marks) {
    if (m.kind !== 'step' || !onScreen(view, m.x, m.y)) continue;
    ctx.globalAlpha = 0.25 + 0.65 * m.k;
    drawCentered(ctx, stepSprite(), m.x + ox, m.y + oy, m.a);
  }
  for (const corpse of gore.corpses) {
    const [type, x, y, a] = corpse;
    if (!onScreen(view, x, y)) continue;
    const stage = gore.stageOf(corpse);
    if (stage === null) continue;
    let img;
    ctx.globalAlpha = prev;
    if (stage >= STAGE_BONES) {
      img = skeletonSprite(sizeClass(view.sprites.get(`${type}_0`).width));
      if (stage === STAGE_FADED) ctx.globalAlpha = cfg.bonesFadedAlpha;
    } else {
      img = corpseSprite(view.sprites, type, stage);
    }
    drawCentered(ctx, img, x + ox, y + oy, a, Math.abs(a) > Math.PI / 2);
  }
  ctx.globalAlpha = prev;
}

const SHAKE_MS = 160;

function outline(ctx, img, x, y, view) {
  if (!img) return;
  const on = Math.floor(view.nowMs / 250) % 2 === 0;
  const sil = silhouette(img, on ? '#ffffff' : '#e8e2d4');
  ctx.globalAlpha = on ? 1 : 0.6;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(sil, x + dx, y + dy);
  ctx.globalAlpha = 1;
}

// Platforma 3x3: ten sam kafelek powtorzony, pulsujaca zielona obwodka dookola calosci i lampka w rogu.
function drawPlatform(ctx, view, it, base, ox, oy) {
  const tp = view.balance.map.tilePx;
  const f = (view.frame >> 4) & 1;
  const tiles = footprint(it.kind, it.tx, it.ty, 0);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [tx, ty] of tiles) {
    blit(ctx, view.sprites.get(`${base}_${f}`), tx * tp + ox, ty * tp + oy);
    x0 = Math.min(x0, tx);
    y0 = Math.min(y0, ty);
    x1 = Math.max(x1, tx + 1);
    y1 = Math.max(y1, ty + 1);
  }
  ctx.strokeStyle = f ? '#8ea845' : '#55682a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 * tp + ox + 0.5, y0 * tp + oy + 0.5, (x1 - x0) * tp - 1, (y1 - y0) * tp - 1);
  ctx.fillStyle = f ? '#ffe07a' : '#d9b53a';
  ctx.fillRect(x0 * tp + ox + 2, y0 * tp + oy + 2, 2, 2);
}

function drawItems(ctx, view, ox, oy) {
  const { balance, sprites, frame } = view;
  const tp = balance.map.tilePx;
  setItemDefs(balance.items);
  for (const it of view.items) {
    // cfg/base MUSZA byc nad `if`: galaz `ground` tez ich uzywa (zlota poswiata boostu).
    // Deklaracja wewnatrz galezi `placed` dawala ReferenceError i ubijala cala klatke renderu.
    const cfg = itemDef(it.kind);
    const base = cfg?.sprite ?? it.kind;
    if (it.state === 'placed' || it.state === 'active') {
      const hitAt = view.shakes?.get(it.id);
      const shake = hitAt != null && view.nowMs - hitAt < SHAKE_MS ? ((frame & 1) ? 1 : -1) : 0;
      const sx = ox + shake;
      if (cfg?.behavior === 'block') {
        const frac = it.maxHp ? it.hp / it.maxHp : 1;
        const [w, h] = cfg.size ?? [1, 1];
        const center = (o) => ({ x: (o.tx + (o.rot ? h : w) / 2) * tp, y: (o.ty + (o.rot ? w : h) / 2) * tp });
        const stage = view.fx ? view.fx.wearStage(view.nowMs, it, frac, tp, center) : 0;
        const lit = it.id === view.highlightId;
        for (const [tx, ty] of footprint(it.kind, it.tx, it.ty, it.rot)) {
          const img = sprites.get(stage ? `${base}_dmg_${stage}` : base);
          if (lit) outline(ctx, img, tx * tp + sx, ty * tp + oy - 1, view);
          blit(ctx, img, tx * tp + sx, ty * tp + oy - (lit ? 1 : 0));
        }
      } else if (cfg?.behavior === 'platform') {
        drawPlatform(ctx, view, it, base, ox, oy);
      } else if (cfg?.behavior === 'cage') {
        blit(ctx, sprites.get(`${base}_${it.timeLeft > 0 ? 1 : 0}`), it.tx * tp + sx, it.ty * tp + oy);
      } else if (cfg?.behavior === 'spikes') {
        blit(ctx, sprites.get(base), it.tx * tp + sx, it.ty * tp + oy);
      } else {
        const f = cfg?.behavior === 'mine' && !it.armed ? 0 : (frame >> 3) & 1;
        blit(ctx, sprites.get(`${base}_${f}`), it.tx * tp + sx, it.ty * tp + oy);
      }
    } else if (it.state === 'flying' && it.flight) {
      const { x0, y0, x1, y1, p } = it.flight;
      const x = x0 + (x1 - x0) * p;
      const y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * THROW_ARC_PX;
      drawCentered(ctx, sprites.get(`item_${it.kind}`), x + ox, y + oy);
    } else if (it.state === 'ground') {
      const img = sprites.get(`item_${it.kind}`);
      const lit = it.id === view.highlightId;
      if (cfg?.glow) {
        // poswiata pulsuje (boost broni ITM-P-09 zlota, dropy stale V3-Q-01/02 we wlasnym kolorze): wyraznie inne niz reszta
        const k = 0.5 + 0.5 * Math.sin(view.nowMs / 140);
        const hr = Math.round(8 + 2 * k);
        ctx.globalAlpha = 0.18 + 0.3 * k;
        ctx.fillStyle = cfg.glow;
        ctx.fillRect(Math.round(it.x + ox) - hr, Math.round(it.y + oy) - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 1;
      }
      if (lit && img) outline(ctx, img, Math.round(it.x + ox - img.width / 2), Math.round(it.y + oy - img.height / 2) - 1, view);
      drawCentered(ctx, img, it.x + ox, it.y + oy - (lit ? 1 : 0));
    }
  }
}

// Gwozdz z gwozdziarki (V3-I-04): cienka kreska `len` px wzdluz toru lotu, jasny rdzen na zlotym.
function drawNail(ctx, x, y, angle, len) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.fillStyle = '#d9b53a';
  ctx.fillRect(-len / 2, -1, len, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-len / 2 + 1, -0.5, len - 1, 1);
  ctx.restore();
}

// Nazwa sprite'a potwora: klatka animacji, a dla `wear` (tank) dodatkowo stan zuzycia liczony z hp/maxHp.
export function mobSpriteName(cfg, type, frame, hp, maxHp) {
  const stage = cfg.wear && maxHp > 0 ? wearStageOf(hp / maxHp) : 0;
  return stage ? `${type}_${frame}_dmg_${stage}` : `${type}_${frame}`;
}

// Telegraf szarzy (ninja): pas trajektorii na ziemi, widoczny dla wszystkich; kat i dlugosc pochodza ze snapshotu,
// wiec to dokladnie ta linia, po ktorej potem poleci.
function drawTelegraphs(ctx, view, ox, oy) {
  for (const m of view.mobs) {
    const len = m[MV.tele];
    if (!(len > 0)) continue;
    const r = view.balance.mobs[m[MV.type]].radiusPx;
    const blink = (view.frame >> 2) & 1;
    ctx.save();
    ctx.translate(Math.round(m[MV.x] + ox), Math.round(m[MV.y] + oy));
    ctx.rotate(m[MV.angle]);
    ctx.globalAlpha = 0.16 + 0.12 * blink;
    ctx.fillStyle = '#ff3a2a';
    ctx.fillRect(0, -r, len, r * 2);
    ctx.globalAlpha = 0.55 + 0.35 * blink;
    ctx.fillRect(0, -1, len, 2);
    ctx.fillRect(len - 2, -r, 2, r * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export function drawMobs(ctx, view, ox, oy) {
  const { sprites, frame } = view;
  for (const m of view.mobs) {
    const [id, type, x, y, hp, maxHp, stunned, frozen, burning] = m;
    const invul = m[MV.invul];
    const angle = m[MV.angle] ?? 0;
    const flip = Math.abs(angle) > Math.PI / 2;
    const cfg = view.balance.mobs[type];
    if (stunned && !frozen) ctx.globalAlpha = (frame >> 2) & 1 ? 0.5 : 1;
    const k = view.fx ? view.fx.knock(id, view.nowMs) : { x: 0, y: 0 };
    let img = sprites.get(mobSpriteName(cfg, type, frozen ? 0 : ((frame >> 3) + id) & 1, hp, maxHp));
    if (!img) {
      ctx.globalAlpha = 1; // brak sprite'a (nowy typ bez grafiki) nie moze wywrocic klatki w silhouette()
      continue;
    }
    if (view.fx && view.nowMs < (view.fx.mobFlash.get(id) ?? 0)) img = silhouette(img, '#ffffff');
    if (invul) {
      // nietykalny: sam zarys (biala poswiata dookola) i ledwo widoczne wnetrze
      const sil = silhouette(img, '#c9c2b4');
      ctx.globalAlpha = 0.3 + 0.1 * ((frame >> 3) & 1);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawCentered(ctx, sil, x + ox + k.x + dx, y + oy + k.y + dy, angle, flip);
      ctx.globalAlpha = 0.22;
    }
    drawCentered(ctx, img, x + ox + k.x, y + oy + k.y, angle, flip);
    ctx.globalAlpha = 1;
    const r = cfg.radiusPx + 1;
    if (img && img.height > 16 && !invul && hp < maxHp) {
      const bw = Math.round(img.width * 0.6);
      const bx = Math.round(x + ox - bw / 2);
      const by = Math.round(y + oy - img.height / 2 - 3);
      ctx.fillStyle = '#14120f';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = hp / maxHp > 0.3 ? '#a8321f' : '#d9b53a';
      ctx.fillRect(bx, by, Math.max(1, Math.round(bw * Math.max(0, hp / maxHp))), 2);
    }
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
      ctx.globalAlpha = 0.85;
    }
    if (p.suspended) ctx.globalAlpha = 0.4;
    const rc = view.fx ? view.fx.recoilOf(p.id, view.nowMs) : { x: 0, y: 0 };
    // powalony macha ręką ok. 2 razy na sekundę (frame liczy 60 fps)
    let img = p.state === 'downed'
      ? sprites.get(`player_down_${(frame >> 5) & 1}@${p.color}`)
      : sprites.get(`player_${walk}@${p.color}`);
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
  const dot = mine ? 2 : 1;
  const baseA = mine ? 0.45 : 0.3;
  // klocki po okręgu zamiast gładkiego łuku — ma wyglądać jak pixel-art
  const ring = (fromK, toK, color, alpha) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      if (t < fromK || t >= toK) continue;
      const a = -Math.PI / 2 + t * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(a) * r - dot / 2), Math.round(y + Math.sin(a) * r - dot / 2), dot, dot);
    }
    ctx.globalAlpha = 1;
  };
  if (p.reloadLeft > 0) {
    reloadSeen.set(p.id, 0);
    const k = Math.max(0, Math.min(1, 1 - p.reloadLeft / total));
    if (mine) ring(0, 1, '#14120f', baseA * 0.5);
    ring(0, k, mine ? '#e8e2d4' : p.color, baseA);
    return;
  }
  if (reloadSeen.get(p.id) === 0) reloadSeen.set(p.id, view.nowMs);
  const doneAt = reloadSeen.get(p.id);
  if (doneAt && view.nowMs - doneAt < RING_FLASH_MS) {
    ring(0, 1, '#ffffff', 0.5 * (1 - (view.nowMs - doneAt) / RING_FLASH_MS));
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

// Znacznik upadku granatu: strefa rażenia widoczna przez ostatnie markerS sekund lotu, wypełniająca się od środka.
function drawLandingMarkers(ctx, view, ox, oy) {
  const rg = Object.values(view.balance.mobs).find((m) => m.ranged?.blastTiles)?.ranged;
  if (!rg) return;
  const r = rg.blastTiles * view.balance.map.tilePx;
  for (const [, , , kind, lx, ly, left] of view.mobBullets ?? []) {
    if (kind !== 1 || left > rg.markerS) continue;
    const k = 1 - Math.max(0, left) / rg.markerS;
    const blink = (view.frame >> 2) & 1;
    ctx.globalAlpha = 0.14 + 0.2 * k;
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath();
    ctx.arc(Math.round(lx + ox), Math.round(ly + oy), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5 + 0.3 * blink;
    ctx.fillStyle = '#ff6a3a';
    ctx.beginPath();
    ctx.arc(Math.round(lx + ox), Math.round(ly + oy), Math.max(1, r * k), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ring(ctx, Math.round(lx + ox), Math.round(ly + oy), r, blink ? '#ffd23a' : '#ff3a2a', 0.95);
  }
}

// Pociski wrogow: wyraznie wieksze od 4x4 pocisku gracza, pulsuja i maja ciemny obrys.
function drawMobBullets(ctx, view, ox, oy) {
  for (const [id, x, y, kind] of view.mobBullets ?? []) {
    const pulse = ((view.frame >> 2) + id) & 1;
    const px = Math.round(x + ox);
    const py = Math.round(y + oy);
    const s = (kind === 1 ? 7 : 6) + pulse;
    ctx.fillStyle = '#14120f';
    ctx.fillRect(px - (s >> 1) - 1, py - (s >> 1) - 1, s + 2, s + 2);
    ctx.fillStyle = kind === 1 ? '#b5652a' : '#8ea845';
    ctx.fillRect(px - (s >> 1), py - (s >> 1), s, s);
    ctx.fillStyle = kind === 1 ? (pulse ? '#ffd23a' : '#ff3a2a') : (pulse ? '#eaffb0' : '#b6ff3a');
    ctx.fillRect(px - 1, py - 1, 3, 3);
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
    if (e.kind === 'reveal') {
      ring(ctx, x, y, 6 + 22 * k, '#e8e2d4', fade, 0.35);
      continue;
    }
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
  drawLandingMarkers(ctx, view, ox, oy);
  drawTelegraphs(ctx, view, ox, oy);
  drawMobs(ctx, view, ox, oy);
  drawPlayers(ctx, view, ox, oy);
  const bullet = view.sprites.get('bullet');
  for (const [, x, y, a, len] of view.bullets) {
    if (len > 0) drawNail(ctx, x + ox, y + oy, a, len);
    else drawCentered(ctx, bullet, x + ox, y + oy);
  }
  drawRockets(ctx, view, ox, oy);
  drawMobBullets(ctx, view, ox, oy);
  view.fx?.drawTop(ctx, ox, oy, view.nowMs, fxs, view.balance.map.tilePx);
  drawEffects(ctx, view, ox, oy);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
