// Overlay debug (F3): czyste formatowanie + minimalne rysowanie.
export function debugLines({ rttMs, kbps, delayMs, buffered, fps }) {
  const n = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '--' : v.toFixed(d));
  return [
    `RTT ${n(rttMs)} ms`,
    `RX ${n(kbps, 1)} kB/s`,
    `interp ${n(delayMs)} ms`,
    `buf ${buffered}`,
    `FPS ${n(fps)}`,
  ];
}

export function drawDebug(ctx, scale, lines) {
  const size = 3 * scale + 3;
  ctx.save();
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(200,200,190,0.55)';
  lines.forEach((l, i) => ctx.fillText(l, 4 * scale, 4 * scale + i * (size + 2)));
  ctx.restore();
}
