// Nakladanie delty przedmiotow ze snapshotu na slownik klienta (czysta funkcja, bez DOM).
// Snapshot z `full: true` zaczyna od zera; inaczej `items` to tylko nowe/zmienione, a `del` to id do skasowania.
// Zwraca swieza tablice kompletu przedmiotow (buildGrid, HUD i render pracuja na tablicy).
export function applyItemDelta(dict, snap) {
  if (snap.full) dict.clear();
  for (const id of snap.del ?? []) dict.delete(id);
  for (const it of snap.items ?? []) dict.set(it.id, it);
  return [...dict.values()];
}

// Zmienne pola gracza w snapshocie, w kolejnosci krotki (serwer: Game.#playersFor). id jest pierwszy.
export const PLAYER_FIELDS = ['id', 'x', 'y', 'angle', 'hp', 'maxHp', 'state', 'suspended', 'reviveProgress', 'deathLeft', 'invuln', 'busy',
  'held', 'ready', 'weaponLv', 'weaponMod', 'ammo', 'reloadLeft', 'ult', 'ultKind', 'frenzyLeft', 'speedMult', 'ultKind2', 'powerBonus'];

// Odtwarza z krotek tablice graczy w DAWNYM ksztalcie (obiekty z id, nick, color i polami zmiennymi) oraz `snap.seed`.
// `st` = { statics: Map(id -> {nick, color}), seed } zyje tak dlugo, jak polaczenie; snapshot `full` zaczyna od zera.
// Gracz, ktorego nie ma w `snap.players`, znika. Mutuje snap.seed (jesli brak, wstawia zapamietany).
export function applyPlayerDelta(st, snap) {
  if (snap.full) {
    st.statics.clear();
    st.seed = snap.seed;
  }
  for (const [id, nick, color] of snap.pstatic ?? []) st.statics.set(id, { nick, color });
  snap.seed = st.seed;
  return (snap.players ?? []).map((row) => {
    const o = {};
    PLAYER_FIELDS.forEach((k, i) => { o[k] = row[i]; });
    const s = st.statics.get(o.id);
    return { id: o.id, nick: s?.nick, color: s?.color, ...o };
  });
}

export function newPlayerState() {
  return { statics: new Map(), seed: undefined };
}
