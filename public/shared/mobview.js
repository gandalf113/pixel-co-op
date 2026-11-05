// Ksztalt krotki potwora w snapshocie (jedno zrodlo prawdy dla serwera i klienta).
export const MV = { id: 0, type: 1, x: 2, y: 3, hp: 4, maxHp: 5, stun: 6, frozen: 7, burn: 8, angle: 9, invul: 10, tele: 11 };

// Klucze dla lerpEntities: pozycja i KAT (interpolowany najkrotsza droga), zamiast zgadywania kata z roznicy pozycji.
export const MOB_KEY = { id: MV.id, x: MV.x, y: MV.y, angle: MV.angle };

export const mobView = (m, r1) => [
  m.id, m.type, r1(m.x), r1(m.y), r1(m.hp), r1(m.maxHp), m.stun > 0 ? 1 : 0, m.frozen > 0 ? 1 : 0, m.burnLeft > 0 ? 1 : 0,
  Math.round((m.angle ?? 0) * 100) / 100, m.invul ? 1 : 0, r1(m.tele > 0 ? m.tele : 0),
];

// Stan zuzycia (0-3) z hp/maxHp: te same progi co sciany (100-75-50-25%), bez dodatkowego pola w snapshocie.
export const wearStageOf = (frac) => (frac > 0.75 ? 0 : frac > 0.5 ? 1 : frac > 0.25 ? 2 : 3);
