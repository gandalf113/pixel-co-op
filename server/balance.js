import { readFileSync } from 'node:fs';

const DEFAULT_PATH = new URL('../public/balance.json', import.meta.url);

export function loadBalance(path = DEFAULT_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function makeRules(balance, difficulty, playerCount) {
  const diff = balance.difficulty[difficulty - 1];
  const w = balance.waves;
  const tilePx = balance.map.tilePx;
  return {
    balance, difficulty, playerCount, diff, tilePx,
    waveBudget: (n) =>
      (w.budgetBase + w.budgetPerWave * n + Math.floor(n ** w.budgetPow)) * diff.budget *
      (w.playerScaleBase + w.playerScalePer * playerCount),
    breakLength: (n) => n <= 0
      ? w.firstBreakS
      : Math.round(Math.min(w.breakMax, w.breakBase + w.breakPerWave * n) * diff.breakMult),
    mobHp: (type, n) => balance.mobs[type].hp * diff.mobHp * (1 + w.hpPerWave * (n - 1)),
    mobDamage: (type) => balance.mobs[type].damage * diff.mobDamage,
    mobObjDamage: (type) => balance.mobs[type].objDamage * diff.mobDamage,
    mobSpeedPx: (type) => balance.mobs[type].speedTiles * tilePx * diff.mobSpeed,
    dropChance: (type) => balance.mobs[type].drop * diff.drop,
    playerMaxHp: () => diff.playerHp,
    downedDeathTime: () => diff.downedS,
  };
}
