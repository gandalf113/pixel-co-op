# 04 - Ograniczenia techniczne i rekomendowana architektura

Wersja: 0.3 (2026-11-05). Sekcje 1-2 to wymagania. Sekcja 3+ to **rekomendacja** dla developera; może wybrać inaczej, o ile sekcje 1-2 są spełnione.

## 1. Wymagania twarde

| ID | Wymóg |
|---|---|
| TECH-01 | Zero zależności od internetu w runtime: brak CDN, fontów z sieci, telemetrii, aktualizacji. Test: odłączony Wi-Fi od internetu, gra działa. |
| TECH-02 | Dystrybucja = jeden katalog. Kopiowanie pendrivem / udziałem sieciowym. Brak instalatora. Cel: poniżej 20 MB bez runtime'u. |
| TECH-03 | Host uruchamia grę jedną komendą lub dwuklikiem. Klienci dołączają przez adres `http://IP-hosta:PORT` w przeglądarce. |
| TECH-04 | Host wyświetla swój adres IP w LAN na ekranie lobby (żeby nie trzeba było szukać w `ipconfig`). |
| TECH-05 | Cały pixel art generowany przez Claude: albo jako dane w kodzie (tablice pikseli / palety), albo jako pliki PNG wygenerowane przez Claude i wrzucone do repo. Żadnych assetów z zewnątrz. |
| TECH-06 | Host jest autorytatywny (symulacja po stronie hosta). Klienci wysyłają input, dostają stan. Blokuje to desync i upraszcza friendly fire, dropy, podnoszenie. |
| TECH-07 | Parametry balansu w jednym pliku konfiguracyjnym (`balance.json` lub równoważny), edytowalnym bez przebudowy. |

## 2. Wymagania miękkie

- Repo z kodem gry może być osobne. Ten PRD dotyczy produktu, nie repo.
- Build powinien być odtwarzalny jedną komendą, ale **artefakt dystrybucyjny** nie może wymagać builda na docelowym komputerze.

## 3. Rekomendacja: przeglądarka + mały serwer hosta

```
[Host PC]                              [Klient PC x3]
  server (Node lub pojedynczy exe)       przeglądarka
    - serwuje index.html + js            http://192.168.x.y:8080
    - WebSocket: /ws                       <----- WebSocket ----->
    - symulacja gry (tick 30 Hz)
  przeglądarka hosta (też klient)
```

- **Klient**: jeden `index.html` + `game.js` (vanilla JS + Canvas 2D). Bez frameworka, bez bundlera, albo z bundlerem, który produkuje jeden plik. Render pixel-perfect: canvas 480 x 270, skalowany całkowitą krotnością, `imageSmoothingEnabled = false`.
- **Serwer hosta**: Node.js (`ws`) albo pojedynczy plik wykonywalny (`bun build --compile` lub `pkg`), żeby host nie musiał nic instalować. Preferowany wariant: **exe/binarka per OS w katalogu** (`host-win.exe`, `host-mac`, `host-linux`) + ten sam kod klienta. Rozmiar binarki Bun ~50-90 MB przekracza cel 20 MB; akceptujemy to jako "runtime" (TECH-02 liczy bez runtime'u), ale jeśli Node jest na hoście, wystarczy `node server.js`.
- Alternatywa, jeśli developer woli natywnie: Godot 4 z eksportem na Windows (ok. 30-70 MB per build, też do skopiowania). Wtedy TECH-03 nadal przez wpisanie IP. Decyzja po stronie developera, patrz `06-OPEN-QUESTIONS.md`.

## 4. Sieć (rekomendacja)

- Transport: WebSocket, wiadomości binarne lub JSON (JSON wystarczy w LAN przy 4 graczach; zmierzyć).
- Tick serwera: 30 Hz. Snapshot stanu do klientów: 20 Hz. Input od klienta: co klatkę lub 60 Hz, z numerem sekwencji.
- Klient: predykcja lokalnego ruchu + rekonsyliacja ze snapshotem hosta. Inni gracze i potwory: interpolacja między dwoma ostatnimi snapshotami (opóźnienie 100 ms).
- Snapshot: delta lub pełny stan (pełny stan przy 60 potworach i 200 przedmiotach to ok. 10-20 KB JSON przy 20 Hz = 200-400 KB/s per klient; w LAN OK, ale delta jest lepsza).
- Zdarzenia jednorazowe (strzał, trafienie, drop, podniesienie, śmierć) jako osobne komunikaty, żeby klient mógł odpalić efekt.
- Rozłączenie: heartbeat 2 s, timeout 6 s.

## 5. Pixel art generowany przez Claude

- Rozdzielczość: postaci 16 x 16, potwory 16 x 16 (boss 32 x 32), przedmioty 16 x 16, kafelki 16 x 16.
- Format rekomendowany: sprite'y jako **tablice stringów z indeksami palety** w kodzie (np. 16 linii po 16 znaków, `.` = przezroczysty), paleta 16-32 kolorów współdzielona. Przy starcie gry rysowane do offscreen canvas. Zero plików PNG, zero zależności, diff w git czytelny.
- Gracz: sprite top-down (widok dokładnie z góry), rotowany płynnie o dowolny kąt (`ctx.rotate`), idle 1-2 klatki, ruch 2-4 klatki. Przy rotacji nearest neighbour, bez wygładzania. Potwory: ta sama metoda (rotacja do kierunku ruchu) albo 4 kierunki + lustro, do wyboru przez developera.
- Efekty (pocisk, wybuch, odłamki, leczenie) jako proste kształty proceduralne albo 2-4-klatkowe sprite'y.

## 6. Struktura katalogu dystrybucji (propozycja)

```
pixel-co-op/
  README.txt          (jak uruchomić, 5 linii)
  host-win.exe        (lub: node + server.js)
  public/
    index.html
    game.js
    balance.json
```

## 7. Czego nie robimy

- Brak kont, zapisów w chmurze, rankingów online.
- Brak P2P / WebRTC (wymaga sygnalizacji, w LAN i tak host-klient jest prostszy).
- Brak obsługi pada w MVP.
