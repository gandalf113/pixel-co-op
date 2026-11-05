# 06 - Otwarte pytania i decyzje

Wersja: 0.11 (2026-11-05). Właściciele produktu: Aleksander Szczepaniak, Piotr Dejnak. Każda odpowiedź trafia do właściwego dokumentu i do `CHANGELOG.md`.

## Rozstrzygnięte

| # | Pytanie | Decyzja | Data |
|---|---|---|---|
| R1 | Logika przedmiotów | `E` podnosi / odkłada, `Spacja` rzuca (z obrażeniami), `R` używa power-up. Opis w `02-ITEMS.md` sekcja 3. | 2026-11-05 |
| R2 | Friendly fire | 10%, stałe na każdej trudności | 2026-11-05 |
| R3 | Liczba poziomów trudności | 4 | 2026-11-05 |
| R4 | Max graczy | 4 | 2026-11-05 |
| R5 | 0 HP w trakcie fali | Powalenie; sojusznik 3 s podnosi z 30 HP; bez pomocy śmierć do końca fali (PRD-PLR-07) | 2026-11-05 |
| R6 | Timer działka / platformy w przerwie | Liczy się zawsze, także w przerwie | 2026-11-05 |
| R7 | Rzucony power-up | **Aktywuje się tam, gdzie spadł**. Wyjątek: boost broni tylko leży (podanie). (ITM 3.2) | 2026-11-05 |
| R8 | Kawałek ściany | 2 x 1, `R` obraca | 2026-11-05 |
| R9 | Skrócenie przerwy | "Gotowy" u każdego gracza; komplet = 5 s odliczania (PRD-LOOP-04) | 2026-11-05 |
| R10 | Late join | **Nie**. Po starcie sesja zamknięta (PRD-SES-06) | 2026-11-05 |
| R11 | Koniec gry | Endless | 2026-11-05 |
| R12 | Rotacja postaci | **Płynna rotacja całej postaci** za kursorem, sprite top-down (PRD-CTRL-09) | 2026-11-05 |
| R13 | Regeneracja HP | **Tylko w przerwie, +2 HP/s**; w fali brak (PRD-PLR-01) | 2026-11-05 |
| R14 | Boss | Co 5 fal, poza MVP | 2026-11-05 |
| R15 | Skalowanie fali z liczbą graczy | Tak, budżet x(0.7 + 0.3 N) | 2026-11-05 |
| R16 | ULTIMATE: wybór | Tylko w lobby, na całą sesję | 2026-11-05 |
| R17 | ULTIMATE: w MVP? | **Tak, w MVP** | 2026-11-05 |
| R18 | ULTIMATE: użycie | Od progu I, siła wg progu, pasek zeruje się w całości | 2026-11-05 |
| R19 | Kropelki | Magnes 2 kafelki, znikają po 20 s | 2026-11-05 |
| R20 | Pasek między falami | Przenosi się, bez resetu | 2026-11-05 |
| R21 | Lista ultimate | 7: Fala uderzeniowa, Mur awaryjny, Uzdrowienie, Szał, **Działko szerokie (celowane), Rakieta AoE, Zamrożenie** | 2026-11-05 |
| R22 | Limity aktywnych power-upów | Działka 8, platformy 4, miny 20 | 2026-11-05 |
| R23 | Mapa | 80 x 60 kafelków po 16 px, render 480 x 270 | 2026-11-05 |
| R24 | Pociski (po teście silnika) | Szybkie: 600 px/s | 2026-11-05 |
| R25 | Ruch potworów (po teście silnika) | Nie tylko do gracza: błądzenie / szum kierunku (03 sekcja 1) | 2026-11-05 |
| R27 | Mur awaryjny | Kawalek podniesiony przez gracza traci timer, zostaje na stale (08 sekcja 4) | 2026-11-05 |
| R28 | Rakieta | Nie niszczy fortyfikacji graczy | 2026-11-05 |
| R29 | Ultimate vs boss | 0.5 obrazen, kontrola max 1 s | 2026-11-05 |
| R30 | Niszczenie obiektów przez potwory | **W MVP, obowiązkowe.** Każdy potwór dotykający obiektu gracza na trasie powoli go niszczy; pathfinding wybiera obejście vs przegryzienie po koszcie (03 sekcja 1) | 2026-11-05 |
| R31 | Kierunek artystyczny | Brudne post-apo: ziemia brązowo-szara, potwory odrażające, działko z góry, gracz jako człowiek z góry, ściana poobijana | 2026-11-05 |
| R32 | Dekoracje podłoża | Kamyki, sucha trawa, pęknięcia, plamy, złom: bezkolizyjne, losowane przy każdej grze (PRD-MAP-08) | 2026-11-05 |
| R33 | Trupy i krew | Zabite potwory zostawiają trupa i plamę krwi, trafienia małe plamki; bezkolizyjne, zostają między falami, limity 300 / 600 (PRD-MAP-09) | 2026-11-05 |
| R34 | Broń startowa | Karabin maszynowy: 8 obr., 10 strz./s, magazynek 30, przeładunek 1.5 s z paskiem na środku ekranu, R = ręczny przeładunek (PRD-PLR-03, PRD-HUD-11) | 2026-11-05 |
| R35 | Feedback trafień | Trafienie potwora i wybuch miny muszą być wyraźnie widoczne: błysk, krew, liczby obrażeń, pierścień wybuchu, wstrząs kamery, trwały ślad (PRD sekcja 9b, FX-01..07) | 2026-11-05 |
| R26 | Kamera (po teście silnika) | Dynamiczny zoom-out w miarę rozchodzenia graczy do rozsądnego maksimum, dalej strzałki (PRD-MAP-07) | 2026-11-05 |

## Otwarte: dla właścicieli produktu

Brak. Q13-Q15 zatwierdzone 2026-11-05 (R27-R29).

## Otwarte: dla developera

| # | Pytanie | Nasza rekomendacja | Gdzie |
|---|---|---|---|
| T1 | Przeglądarka + serwer Node/Bun czy natywnie (Godot)? | Przeglądarka + Bun/Node, host-autorytatywny | 04 sekcja 3 |
| T2 | Jak host dostaje serwer bez instalacji Node: exe z Bun, czy zakładamy Node na hoście? | Exe per OS w katalogu, Node jako fallback | 04 sekcja 3 |
| T3 | Snapshot pełny czy delta? | Delta, ale zacząć od pełnego i zmierzyć | 04 sekcja 4 |
| T4 | Sprite'y jako dane w kodzie czy PNG? | Dane w kodzie (paleta + stringi) | 04 sekcja 5, TECH-05 |
| T5 | Pathfinding: A* per potwór czy flow field od graczy? | Flow field (tańsze przy 60 potworach i 4 celach) | 03 sekcja 1 |
| T6 | Repo kodu: to samo czy osobne? | Osobne; tu docs i raporty testów | README |
