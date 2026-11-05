# 06 - Otwarte pytania i decyzje

Wersja: 0.3 (2026-11-05). Właściciele produktu: Aleksander Szczepaniak, Piotr Dejnak. Każda odpowiedź trafia do właściwego dokumentu i do `CHANGELOG.md`.

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

## Otwarte: dla właścicieli produktu

Brak. Wszystkie pytania z wersji 0.1 rozstrzygnięte 2026-11-05 (R4-R15). Nowe pytania dopisujemy tu w tym samym formacie.

## Otwarte: dla developera

| # | Pytanie | Nasza rekomendacja | Gdzie |
|---|---|---|---|
| T1 | Przeglądarka + serwer Node/Bun czy natywnie (Godot)? | Przeglądarka + Bun/Node, host-autorytatywny | 04 sekcja 3 |
| T2 | Jak host dostaje serwer bez instalacji Node: exe z Bun, czy zakładamy Node na hoście? | Exe per OS w katalogu, Node jako fallback | 04 sekcja 3 |
| T3 | Snapshot pełny czy delta? | Delta, ale zacząć od pełnego i zmierzyć | 04 sekcja 4 |
| T4 | Sprite'y jako dane w kodzie czy PNG? | Dane w kodzie (paleta + stringi) | 04 sekcja 5, TECH-05 |
| T5 | Pathfinding: A* per potwór czy flow field od graczy? | Flow field (tańsze przy 60 potworach i 4 celach) | 03 sekcja 1 |
| T6 | Repo kodu: to samo czy osobne? | Osobne; tu docs i raporty testów | README |
