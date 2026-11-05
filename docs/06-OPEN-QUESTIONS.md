# 06 - Otwarte pytania i decyzje

Wersja: 0.1 (2026-11-05). Właściciele produktu: Aleksander Szczepaniak, Piotr Dejnak. Każda odpowiedź trafia do właściwego dokumentu i do `CHANGELOG.md`.

## Rozstrzygnięte

| # | Pytanie | Decyzja | Data |
|---|---|---|---|
| R1 | Logika przedmiotów | `E` podnosi / odkłada, `Spacja` rzuca (z obrażeniami), `R` używa power-up. Opis w `02-ITEMS.md` sekcja 3. | 2026-11-05 |
| R2 | Friendly fire | 10%, stałe na każdej trudności | 2026-11-05 |
| R3 | Liczba poziomów trudności | 4 | 2026-11-05 |

## Otwarte: dla właścicieli produktu

| # | Pytanie | Nasza propozycja | Gdzie |
|---|---|---|---|
| Q1 | Max liczba graczy: 4? | 4 | PRD-SES-03 |
| Q2 | Powalenie i podnoszenie (downed / revive) czy natychmiastowa śmierć do końca fali? | Powalenie, 3 s podnoszenia, 10 s do śmierci | PRD-PLR-07 |
| Q3 | Czy czas działania działka / platformy liczy się w przerwie? | Tak (gracz decyduje kiedy użyć). Alternatywa: pauza timera w przerwie, mniej kary za błąd | ITM sekcja 5 |
| Q4 | Rzucony power-up aktywuje się po wylądowaniu, czy tylko leży? | Tylko leży (rzut = transport + cios). Aktywacja wyłącznie przez `R` | ITM 3.2 |
| Q5 | `R` z hard objectem w rękach obraca ścianę? Czy ściana jest 1 x 1 i obrót niepotrzebny? | Obraca, ściana 2 x 1 | ITM 3.1 |
| Q6 | Skrócenie przerwy przyciskiem "Gotowi"? | Tak, wymaga wszystkich | PRD-LOOP-04 |
| Q7 | Late join w trakcie gry? | Tak, spawn w najbliższej przerwie | PRD-SES-06 |
| Q8 | Endless czy z końcem (np. fala 20 = zwycięstwo)? | Endless | PRD-LOOP-06 |
| Q9 | 8 kierunków sprite'a vs płynna rotacja? | 8 kierunków, lufa rotowana płynnie | PRD-CTRL-09 |
| Q10 | Naturalna regeneracja HP? | Brak, tylko platforma | PRD-PLR-01 |
| Q11 | Boss co 5 fal, czy w ogóle w MVP? | Co 5 fal, poza MVP | MOB-06 |
| Q12 | Skalowanie budżetu fali z liczbą graczy? | Tak: x(0.7 + 0.3 * N) | 03 sekcja 2.2 |

## Otwarte: dla developera

| # | Pytanie | Nasza rekomendacja | Gdzie |
|---|---|---|---|
| T1 | Przeglądarka + serwer Node/Bun czy natywnie (Godot)? | Przeglądarka + Bun/Node, host-autorytatywny | 04 sekcja 3 |
| T2 | Jak host dostaje serwer bez instalacji Node: exe z Bun, czy zakładamy Node na hoście? | Exe per OS w katalogu, Node jako fallback | 04 sekcja 3 |
| T3 | Snapshot pełny czy delta? | Delta, ale zacząć od pełnego i zmierzyć | 04 sekcja 4 |
| T4 | Sprite'y jako dane w kodzie czy PNG? | Dane w kodzie (paleta + stringi) | 04 sekcja 5, TECH-05 |
| T5 | Pathfinding: A* per potwór czy flow field od graczy? | Flow field (tańsze przy 60 potworach i 4 celach) | 03 sekcja 1 |
| T6 | Repo kodu: to samo czy osobne? | Osobne; tu docs i raporty testów | README |
