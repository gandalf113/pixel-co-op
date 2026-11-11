export const COLORS = ['#5ec85e', '#4fa3e8', '#f2d24b', '#f27bbf'];

export function sanitizeNick(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  const nick = [...clean].slice(0, 12).join('').trim();
  return nick === '' ? null : nick;
}

// --- Czat (pokoj + gra) ---------------------------------------------------------------------------
// Limity sa WSPOLNE dla klienta i serwera: klient obcina pole, serwer i tak sprawdza jeszcze raz.
export const CHAT = {
  maxLen: 160,        // dluzsze wiadomosci rozwalaja naklade w grze
  historyMax: 50,     // ile pamieta pokoj i ile dostaje nowo wchodzacy
  minIntervalMs: 700, // minimalny odstep miedzy wiadomosciami jednego nadawcy
  burst: 3,           // tyle wiadomosci pod rzad wolno wyslac szybciej niz minIntervalMs
  liveMs: 9000,       // jak dlugo wiadomosc wisi na ekranie w trakcie gry
  liveMax: 5,         // ile naraz widac w grze
};

// Wiadomosc czatu z sieci. Zwraca czysty tekst albo null (nie ma czego wysylac).
//
// `\p{C}` to znaki sterujace I FORMATUJACE - w tym spacja zerowej szerokosci. To nie jest
// przesada: u nas sam zero-width potrafil zawiesic uslugę po drugiej stronie, a tutaj taka
// wiadomosc wygladalaby na pusta, przechodzila limit dlugosci i smiecila w logu pokoju.
// Dla pewnosci lecimy tez po znacznikach kierunku pisma (RLO/LRO), ktorymi da sie odwrocic
// wyswietlanie calej linijki.
export function sanitizeChat(raw, max = CHAT.maxLen) {
  if (typeof raw !== 'string') return null;
  const clean = raw
    .replace(/\p{C}/gu, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = [...clean].slice(0, max).join('').trim();
  return text === '' ? null : text;
}
