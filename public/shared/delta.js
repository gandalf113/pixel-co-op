// Nakladanie delty przedmiotow ze snapshotu na slownik klienta (czysta funkcja, bez DOM).
// Snapshot z `full: true` zaczyna od zera; inaczej `items` to tylko nowe/zmienione, a `del` to id do skasowania.
// Zwraca swieza tablice kompletu przedmiotow (buildGrid, HUD i render pracuja na tablicy).
export function applyItemDelta(dict, snap) {
  if (snap.full) dict.clear();
  for (const id of snap.del ?? []) dict.delete(id);
  for (const it of snap.items ?? []) dict.set(it.id, it);
  return [...dict.values()];
}
