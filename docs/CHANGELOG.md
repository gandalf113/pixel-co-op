# Changelog dokumentacji

## 0.17 - 2026-11-05
- R48 sciany pekaja mocniej, rogi zaokraglaja sie i krusza (PRD-FX-08). Sprite'y zniszczen wygenerowane: wall_dmg_1..3, wall_collapse_0..2, rubble_0/1, turret_wreck.

## 0.16 - 2026-11-05
- R46 lobby: szeroki panel, 7 ultimate w jednym rzedzie bez przewijania, ikony 32x32 (PRD-SES-05, ULT-HUD-03, S5). Ikony ult_* dodane do sprites.js.
- R47 pasek ULTIMATE w lewym gornym rogu w stylu bijatyk 16-bit (PRD-HUD-10, ULT-HUD-01, S6).

## 0.15 - 2026-11-05
- R42 dynamiczny zoom USUNIETY (psul rozgrywke); staly widok 560x315 zamiast 480x270 (PRD-MAP-05, PRD-MAP-07, C8).
- R43 ULTIMATE laduje sie 5x szybciej (kropelka = 5 pkt). R44 magnes kropelek: 14 kafelkow, przyspiesza im blizej, zycie 30 s (08 sekcja 1-2, UL2, UL2b, UL3).
- R45 muzzle flash obowiazkowy (FX-06, X1b); FX-01 wzmocnione i test X1 blokujacy, bo po tescie trafien nadal nie widac.

## 0.14 - 2026-11-05
- R41 sciany krusza sie wizualnie: 4 stany zuzycia (pekniecia, wyszczerbione krawedzie, dziury), odlamki, drganie, animacja zawalenia, rumowisko, dopiero potem znikaja (PRD-FX-08, ITM-GEN-09, 03 sekcja 1, testy X7-X9). Nowe sprite'y: wall_dmg_1/2/3, wall_collapse_0..2, rubble_0/1, turret_wreck.

## 0.13 - 2026-11-05
- R39 stawianie: kursor poza zasiegiem = ghost przyciagany do najdalszego dozwolonego kafelka w kierunku kursora, nie czerwony (ITM-PLACE-01, ITM-GEN-07, testy I4b-I4d).
- R40 brak zamiany: E z przedmiotem w rekach zawsze odklada/stawia trzymany, nie podnosi innego (ITM-GEN-11, PRD-CTRL-04, test I4e).

## 0.12 - 2026-11-05
- Po tescie: R36 pociski 450 px/s i rate 0.14 s (PRD-PLR-03, C7, C9); R37 przeladunek jako pierscien wokol postaci (PRD-HUD-11, C12); R38 podswietlenie przedmiotu do podniesienia (PRD-HUD-09, ITM-GEN-04, C11).

## 0.11 - 2026-11-05
- R35 efekty wizualne: nowa sekcja PRD 9b (FX-01..07): widoczne trafienia pocisku w potwora (blysk, krew, liczba), w sciane, w gracza; widoczny wybuch miny (blysk, pierscien, odlamki, dym, wstrzas kamery, slad wypalenia); blysk z lufy; limity czasteczek. Testy X1-X6. Lista sprite'ow FX do zrobienia.

## 0.10 - 2026-11-05
- R34 bron startowa to karabin maszynowy: magazynek 30, seria 10 strz./s, 8 obr., przeladunek 1.5 s z paskiem na srodku ekranu, R przeladowuje (PRD-PLR-03, PRD-HUD-04, PRD-HUD-11, testy C9, C10, F1, D2).

## 0.9 - 2026-11-05
- R33 trupy i krew: zabity potwor zostawia trupa i krew, trafienie plamke; bezkolizyjne, trwale, z limitami (PRD-MAP-09, 03 sekcja 1).

## 0.8 - 2026-11-05
- R31 kierunek artystyczny post-apo (PRD-CON-05, PRD-MAP-06). R32 dekoracje podloza bezkolizyjne, losowane per gra (PRD-MAP-08).
- Sprite'y v2 na feat/mvp: public/client/sprites.js (29 sprite'ow, w tym 8 decor_*).

## 0.7 - 2026-11-05
- R30: potwory MUSZA powoli niszczyc obiekty graczy (MVP). Nowa kolumna obrazen obiektom per potwor, pathfinding po koszcie, 3 stany pekniec, testy I20-I23 (03 sekcja 1, ITM-GEN-09, PRD MVP).

## 0.6 - 2026-11-05
- Q13-Q15 zatwierdzone (R27-R29): Mur awaryjny podniesiony zostaje na stale, Rakieta nie niszczy fortyfikacji graczy, ultimate vs boss 0.5 obrazen i kontrola max 1 s. Brak otwartych pytan dla wlascicieli.

## 0.5 - 2026-11-05
- ULTIMATE przeniesiony z backlogu do MVP: nowy 08-ULTIMATE.md (zalozenia zatwierdzone R16-R21, 7 umiejetnosci z 3 progami, HUD, testy UL1-UL13).
- Feedback z testu silnika: pociski szybkie 600 px/s (PRD-PLR-03), potwory bladza zamiast isc po linii (03 sekcja 1), dynamiczny zoom kamery (PRD-MAP-07).
- Zatwierdzone: limity power-upow (R22), mapa 80x60 (R23). Nowe pytania Q13-Q15.
- PRD: zakres MVP, lobby z wyborem ultimate, PRD-CTRL-10 (F), PRD-HUD-10, kryteria akceptacji.

## 0.4 - 2026-11-05
- Nowy 07-BACKLOG-V2: ULTIMATE (shiny droplets laduja wspolny pasek wszystkim, kazdy uzywa swojego kiedy chce, 3 progi, wybor w lobby) + propozycja mechaniki i pytania U1-U5.

## 0.3 - 2026-11-05
- Decyzje wlascicieli produktu (06-OPEN-QUESTIONS R4-R15): max 4 graczy; powalenie i podnoszenie; timer power-upow liczy sie w przerwie;
  rzucony power-up AKTYWUJE sie w miejscu ladowania (poza boostem broni); sciana 2x1 z obrotem pod R; "Gotowy" u wszystkich skraca przerwe;
  BRAK late join; endless; PLYNNA rotacja postaci za kursorem; regeneracja +2 HP/s tylko w przerwie; boss co 5 fal poza MVP;
  skalowanie budzetu fali x(0.7 + 0.3 N).
- Zaktualizowane: 01-PRD (SES-06, CTRL-05, CTRL-09, PLR-01, PLR-07, LOOP-04, LOOP-05), 02-ITEMS (3.1, 3.2, 3.4, sekcja 5),
  03 (2.2, 3), 04 (sekcja 5), 05 (C2, I9, I9b, I9c, N5, F8, F9).

## 0.2 - 2026-11-05
- Zatwierdzona logika przedmiotow: E podnosi/odklada, Spacja rzuca z obrazeniami, R uzywa power-up (02-ITEMS sekcja 3, PRD-CTRL-03..06).
- Wlasciciele produktu: Aleksander Szczepaniak, Piotr Dejnak.

## 0.1 - 2026-11-05
- Pierwsza wersja: README, PRD, przedmioty, fale i trudnosc, architektura, plan testow, otwarte pytania.
