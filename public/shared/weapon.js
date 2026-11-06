// Aktywny modyfikator broni (V3-I) z balance.weaponMods albo null. Szal go przesłania (patrz fireWeapons).
export function modConfig(balance, mod) {
  return mod ? balance.weaponMods?.[mod] ?? null : null;
}

export function rifleStats(balance, level) {
  const r = balance.rifle;
  const up = level - 1;
  return {
    damage: r.damage * (1 + r.levelDamageMult * up),
    magazine: r.magazine + r.levelMagazine * up,
    reloadS: Math.max(0.3, r.reloadS - r.levelReloadS * up),
  };
}
