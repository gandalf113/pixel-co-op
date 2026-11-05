const MAX_PARTICLES = 500;
const MAX_CHIPS = 400;
const BONE = '#e8e2d4';
const BLOOD = ['#8a1a10', '#6e140c', '#a8321f'];
const DEBRIS = ['#7d766b', '#58534b', '#4a4139', '#8a7a4a'];
const SPARK = ['#ffe07a', '#ffd23a', '#ffffff'];
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Fx {
  constructor() {
    this.reset();
  }

  reset() {
    this.particles = [];
    this.chips = [];
    this.scorches = [];
    this.rubble = [];
    this.numbers = [];
    this.collapses = [];
    this.muzzles = [];
    this.rings = [];
    this.mobFlash = new Map();
    this.mobKnock = new Map();
    this.shells = [];
    this.hitMarkerUntil = 0;
    this.playerFlash = new Map();
    this.recoil = new Map();
    this.wear = new Map();
    this.shake = { until: 0, amp: 0 };
    this.vignetteUntil = 0;
    this.message = null;
  }

  #particle(p) {
    this.particles.push(p);
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  #burst(now, x, y, n, { colors, speed, life, angle = null, spread = Math.PI * 2, size = 1, settle = false, rise = 0 }) {
    for (let i = 0; i < n; i++) {
      const a = angle === null ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * spread;
      const v = rand(speed * 0.4, speed);
      this.#particle({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rise, born: now, life: rand(life * 0.6, life),
        color: pick(colors), size, settle,
      });
    }
  }

  restore(scorches, rubble) {
    this.scorches = scorches.slice();
    this.rubble = rubble.slice();
  }

  mobHit(now, e, myId) {
    this.mobFlash.set(e.mob, now + 100);
    this.mobKnock.set(e.mob, { a: e.a, until: now + 100 });
    this.#burst(now, e.x, e.y, Math.floor(rand(6, 9)), { colors: BLOOD, speed: 90, life: 0.3, angle: e.a, spread: 0.9 });
    this.#burst(now, e.x, e.y, 2, { colors: SPARK, speed: 20, life: 0.05 });
    if (e.dmg) this.numbers.push({ x: e.x, y: e.y - 8, v: e.dmg, born: now });
    if (e.by === myId) this.hitMarkerUntil = now + 100;
  }

  knock(id, now) {
    const k = this.mobKnock.get(id);
    if (!k || now >= k.until) return { x: 0, y: 0 };
    return { x: Math.round(Math.cos(k.a) * 2), y: Math.round(Math.sin(k.a) * 2) };
  }

  objHit(now, x, y, bullet) {
    if (bullet) this.#burst(now, x, y, 2, { colors: SPARK, speed: 40, life: 0.08 });
    this.#burst(now, x, y, bullet ? 3 : 2, { colors: DEBRIS, speed: bullet ? 50 : 20, life: 0.3 });
  }

  wearStage(now, item, frac, tp, centerOf) {
    const stage = frac > 0.75 ? 0 : frac > 0.5 ? 1 : frac > 0.25 ? 2 : 3;
    const prev = this.wear.get(item.id);
    this.wear.set(item.id, stage);
    if (prev === undefined || stage <= prev) return stage;
    const c = centerOf(item);
    this.#burst(now, c.x, c.y, Math.floor(rand(3, 6)), { colors: DEBRIS, speed: 45, life: 0.3, settle: true });
    return stage;
  }

  destroyed(now, e, tiles, tp) {
    this.wear.delete(e.id);
    const turret = e.kind === 'turret30';
    this.collapses.push({ kind: e.kind, tiles, born: now });
    for (const [tx, ty] of tiles) {
      const x = (tx + 0.5) * tp;
      const y = (ty + 0.5) * tp;
      this.#burst(now, x, y, Math.floor(rand(4, 7)), { colors: turret ? SPARK : DEBRIS, speed: 70, life: 0.35, settle: !turret });
      this.#burst(now, x, y, 3, { colors: ['#9a9286', '#7d766b'], speed: 8, life: 0.6, size: 2, rise: 6 });
    }
    this.rubble.push([e.kind, e.tx, e.ty, e.rot]);
  }

  explode(now, e, me, tp, mobs) {
    this.rings.push({ x: e.x, y: e.y, r: e.radiusPx, born: now });
    this.#burst(now, e.x, e.y, Math.floor(rand(8, 13)), { colors: ['#ff9a2a', '#7d766b', '#3b342d'], speed: 110, life: 0.45 });
    this.#burst(now, e.x, e.y, 3, { colors: ['#6a645b', '#4a4139'], speed: 6, life: 1, size: 3, rise: 10 });
    for (const m of mobs) if (Math.hypot(m[2] - e.x, m[3] - e.y) <= e.radiusPx) this.mobFlash.set(m[0], now + 70);
    if (e.mine) this.scorches.push([Math.round(e.x), Math.round(e.y), Math.round(e.radiusPx)]);
    if (this.scorches.length > 100) this.scorches.shift();
    if (me && !reducedMotion) {
      const d = Math.hypot(me.x - e.x, me.y - e.y) / tp;
      if (d < 12) this.shake = { until: now + 200, amp: 2 * (1 - d / 12) };
    }
  }

  mobDeath(now, e) {
    this.#burst(now, e.x, e.y, Math.floor(rand(4, 7)), { colors: [...BLOOD, '#4f6e2a'], speed: 50, life: 0.3, settle: true });
  }

  shot(now, e, isPlayer, originX, originY) {
    const a = e.angle ?? 0;
    this.muzzles.push({ x: originX + Math.cos(a) * 9, y: originY + Math.sin(a) * 9, a, born: now });
    if (!isPlayer) return;
    this.recoil.set(e.id, { a, until: now + 60 });
    const side = a + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const v = rand(25, 40);
    this.shells.push({ x: originX, y: originY, vx: Math.cos(side) * v, vy: Math.sin(side) * v, born: now });
    if (this.shells.length > 150) this.shells.shift();
  }

  recoilOf(id, now) {
    const r = this.recoil.get(id);
    if (!r || now >= r.until) return { x: 0, y: 0 };
    return { x: -Math.round(Math.cos(r.a)), y: -Math.round(Math.sin(r.a)) };
  }

  ff(now, e, myId, nickOf) {
    this.playerFlash.set(e.id, now + 120);
    if (e.id !== myId) return;
    this.vignetteUntil = now + 200;
    this.message = { text: `${nickOf(e.by)} trafił cię`, until: now + 1000 };
  }

  update(now, dt) {
    this.particles = this.particles.filter((p) => {
      const age = (now - p.born) / 1000;
      if (age >= p.life) {
        if (p.settle) {
          this.chips.push([Math.round(p.x), Math.round(p.y), p.color]);
          if (this.chips.length > MAX_CHIPS) this.chips.shift();
        }
        return false;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      return true;
    });
    this.numbers = this.numbers.filter((n) => now - n.born < 400);
    this.shells = this.shells.filter((s) => {
      const age = (now - s.born) / 1000;
      if (age < 0.3) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      return age < 2.3;
    });
    this.collapses = this.collapses.filter((c) => now - c.born < 400);
    this.muzzles = this.muzzles.filter((m) => now - m.born < 70);
    this.rings = this.rings.filter((r) => now - r.born < 500);
  }

  shakeOffset(now) {
    if (now >= this.shake.until) return { x: 0, y: 0 };
    const a = this.shake.amp;
    return { x: Math.round((Math.random() * 2 - 1) * a), y: Math.round((Math.random() * 2 - 1) * a) };
  }

  drawGround(ctx, ox, oy, sprites) {
    for (const [x, y, r] of this.scorches) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#14120f';
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const [x, y, c] of this.chips) {
      ctx.fillStyle = c;
      ctx.fillRect(x + ox, y + oy, 1, 1);
    }
    for (const [kind, tx, ty, rot] of this.rubble) sprites.rubble(ctx, kind, tx, ty, rot, ox, oy);
    ctx.fillStyle = '#c9a23a';
    for (const s of this.shells) ctx.fillRect(Math.round(s.x + ox), Math.round(s.y + oy), 1, 1);
  }

  drawTop(ctx, ox, oy, now, sprites, tp) {
    for (const c of this.collapses) sprites.collapse(ctx, c, (now - c.born) / 400, ox, oy, tp);
    for (const r of this.rings) {
      const k = (now - r.born) / 500;
      if (k < 0.06) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#fff6d0';
        ctx.beginPath();
        ctx.arc(r.x + ox, r.y + oy, r.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = k < 0.5 ? '#ff9a2a' : '#5a4f44';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x + ox, r.y + oy, r.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0.2, 1 - (now - p.born) / 1000 / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x + ox), Math.round(p.y + oy), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const m of this.muzzles) sprites.muzzle(ctx, m.x + ox, m.y + oy, m.a, now - m.born < 35 ? 0 : 1);
  }

  drawHud(ctx, now, toScreen, scale, text, small) {
    for (const n of this.numbers) {
      const k = (now - n.born) / 400;
      const s = toScreen(n.x, n.y - k * 8);
      ctx.globalAlpha = 1 - k * 0.6;
      text(ctx, String(n.v), s.x, s.y, { size: small, align: 'center', color: BONE });
    }
    ctx.globalAlpha = 1;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (now < this.vignetteUntil) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(168, 50, 31, 0)');
      g.addColorStop(1, `rgba(168, 50, 31, ${0.5 * ((this.vignetteUntil - now) / 200)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.message && now < this.message.until) text(ctx, this.message.text, W / 2, H / 2 - 40 * scale, { size: small + 4, align: 'center', color: '#ff5a4a' });
  }
}
