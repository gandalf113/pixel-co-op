// Area of interest: co gracz dostaje w snapshocie.
//
// Ekran gry ma stale 560 x 315 px swiata (render.js: VIEW_W/VIEW_H), a kamera siedzi na graczu, wiec
// widac +-280 x +-157,5 px od niego. Wysylamy byty do 1,5 ekranu od srodka (prostokat o polowkach
// 1,5 x polowka ekranu), a potwor, ktory juz jest wysylany, przestaje byc dopiero powyzej 1,8 -
// histereza, zeby nie migal na granicy.
//
// NIE WOLNO obciac postawionych/aktywnych przedmiotow (sciany, glazy, kolce, dzialka, platformy):
// klient buduje z nich siatke kolizji do predykcji ruchu. Zob. Game.snapshot.
export const VIEW_W = 560;
export const VIEW_H = 315;
// Obiekt, nie stale: tools/measure-snapshot.mjs wylacza AoI, zeby zmierzyc sama delte.
export const AOI = { enterMul: 1.5, exitMul: 1.8 };

export function inRange(centers, x, y, mul) {
  const hw = (VIEW_W / 2) * mul;
  const hh = (VIEW_H / 2) * mul;
  for (const c of centers) if (Math.abs(x - c.x) <= hw && Math.abs(y - c.y) <= hh) return true;
  return false;
}

// Srodki zainteresowania: wlasna pozycja, a gdy gracz juz nie gra (martwy - kamera przeskakuje
// na towarzyszy) wszyscy pozostali.
export function centersFor(world, me) {
  if (me && me.state !== 'dead') return [{ x: me.x, y: me.y }];
  const out = [];
  for (const p of world.players.values()) out.push({ x: p.x, y: p.y });
  return out;
}
