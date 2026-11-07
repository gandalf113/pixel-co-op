# Changelog dokumentacji

## 0.30 - 2026-11-07
- v0.15.0: **V3-C-15 zaimplementowane** w `public/client/sfx.js` - karabin "mech" (6 warstw, klik zamka), dzialko "heavy" zamiast `cannon`, wspolna IR "st-max" (`GUN_IR`: 4 pasma w panoramie + 4 slapbacki ping-pong), pre-delay 60 ms, send 0.035. Testy dzwieku przepisane pod nowy projekt (ciemne pasmo, slapback na starcie).
- R64, ITM-DROP-03 zmienione: **boss zawsze zostawia boost broni** jako jeden z 3 dropow (`guaranteedDrops` w balansie, `server/items.js`). Powod: zgloszenie z gry - 10 fal bez ani jednego boostu z losowania (szansa ~17% na fale przy wadze 4/76 w puli power 45%).
- Po v0.15.0: **sendy hali obnizone** - zawalenie sciany 0.7 -> 0.15, rozpad tanka 0.6 -> 0.25 (wybuch 1.1 i ult bez zmian - wybuch byl dobry, cofniete po ograniu). Powod: po sciszeniu karabinu limiter szyny wet przestal dociskac hale i zawalenie bylo "dramatycznie zreverbowane". Niezatagowane.

## 0.29 - 2026-11-07
- V3-C-15 (nowe), R63: **dzwiek karabinu i dzialka wybrany z odsluchu**, zastepuje V3-C-10/13/14. Gracz: suchy strzal "mech" (klik zamka 18 ms po strzale). Dzialko: suchy strzal "heavy" (zamiast dzisiejszej recepty `cannon`). Wspolna szyna poglosu "st-max": ogon 1.2 s w pasmie 300 Hz - 3.5 kHz pociety na 4 pasma rozlozone w panoramie, 4 slapbacki ping-pong, pre-delay 60 ms, send 0.028. Pelne liczby w wierszu V3-C-15, wzorce WAV w `tools/sfx-lab/chosen/`, renderer `tools/sfx-lab/render-rifle.mjs`.
- Wnioski z ok. 100 odsluchanych wariantow, zeby nikt tego nie cofal: ogon ma byc **ciemny** (jasne warianty odpadly, wbrew hipotezie z V3-C-14), **krotki** (1.2 s; dluzszy brzmi "za glosno" niezaleznie od sendu) i **bardzo cichy** (send 0.028 wobec 0.34 dzis w grze); szerokosc stereo bierze sie z rozlozenia pasm i odbic po bokach, nie z podbijania side.

## 0.28 - 2026-11-06
- V3-E-02 i V3-E-03 zrobione w v0.14.0: **Roj** (trojkami, od fali 8) i **Boss** (co 5 fal, cios obszarowy, wzywa slimaki, pasek HP na gorze, drop x3, odporny na klatke, nigdy nie obciety przez AoI).
- R60 (nowe), przepisane 03 sekcje 2.2 i 2.3: fala to **ciag grup** jednego typu wychodzacych **z jednego kierunku**, a od fali 3 **jeden typ wypada z fali**, wazony `weight` (zmierzone na fali 12: slimak 32%, tank 3,7%). Powod: zgloszenie z gry, ze kazda fala wyglada tak samo i zawsze zaczyna sie od biegaczy.
- R61: waga dropu boostu broni 2 -> 4 (ITM-P-09). Z 2,1% na 4,2% dropow `power`, czyli z 8% na 16% szansy na co najmniej jeden boost w fali ~30 zabic.
- R62: szarza ninji rzadziej (1-2 -> 1.6-3.2 s), dluzszy telegraf (0.6 -> 0.85 s), duzo szybszy lot (10 -> 18 kaf./s) i dalszy (9 -> 13 kafli). "Dluzszy skok" = dluzszy dystans; sam lot jest krotszy.
- PRD-LOOP-07 (nowe): fala ma byc rozpoznawalna, nie jednostajna.
- Poprawione rozjazdy kod-dokument znalezione przy okazji: fala z bossem ma **60% normalnego skladu** (03 mowil to od poczatku, kod dawal pelna fale); limity `groupMaxMobs` i `maxAliveMobs` licza **potwory, nie wpisy kolejki** (Roj to trzy sztuki na wpis - przed poprawka fala 12 stawiala 105 zywych przy suficie 60); wezwania bossa podlegaja temu samemu sufitowi.
- MOB-05 i MOB-06 w 03 sekcji 1 oznaczone jako zaimplementowane, z liczbami dobranymi przy wdrozeniu (koszt, waga, promienie).

## 0.27 - 2026-11-06
- Punkt K zrobiony w v0.13.0: ekran nicku i ekran glowny z lista otwartych pokojow, "Nowy pokoj", leaderboard i ekran sterowania. Zapisane jako PRD-SES-08 i PRD-CTRL-11.
- PRD-SES-09 (nowe): `GET /api/rooms` bez nickow, tylko w trybie pokoi, z limitem zapytan na adres; pokoj bez graczy jest martwy natychmiast, choc fizycznie zyje jeszcze 90 s. Konsekwencja przyjeta swiadomie: odswiezenie karty w jednoosobowym lobby zamyka pokoj.
- PRD-SES-02 zmienione: publiczna lista pokojow to nie matchmaking, tylko spis do wyboru przez czlowieka.
- PRD-PERF-05 (nowe) i V3-F-01 zrobione w v0.13.0: strzal widac natychmiast, bez czekania na serwer. Lokalny pocisk jest wylacznie obrazem — nie trafia i nie zatrzymuje potworow. Przekazanie palki (ducha na prawdziwy pocisk) odroczone o opoznienie bufora interpolacji, bo prawdziwy pocisk staje sie widoczny dopiero wtedy.
- Punkt F domkniety poza F-05: F-02/F-03/F-06/F-07 zrobione przy punkcie O, F-04 w v0.10.0. F-05 (lag compensation) zostaje celowo — jego wlasny warunek mowi, zeby najpierw zmierzyc, czy F-01..F-04 wystarczaja (razem z O-09).
- Punkt M i cala sekcja C2 oznaczone jako zrobione (weryfikacja w kodzie 2026-11-06): M w v0.5.0, dzwiek w v0.6.0 / v0.8.0 / v0.9.0. Backlog trzymal je otwarte, mimo ze kod je mial.
- Nowa sekcja: mapowanie klawiszy kod kontra dokumentacja — `F`, `G`, `Tab`, `Esc`, PPM i `A`/`D` po smierci nie byly nigdzie opisane, a sa w grze.

## 0.26 - 2026-11-06
- **Punkt P (KRYTYCZNE), naprawiony w v0.12.0**: gracz po kilkunastu sekundach tracil obraz — znikali gracze, potwory, przedmioty i pociski, HUD zamarzal, a dzwieki i trafienia dzialaly dalej. Przyczyna: `cfg` zadeklarowane wewnatrz galezi `placed` w `drawItems`, a uzyte w galezi `ground` przez zlota poswiate boostu z v0.11.0 — `ReferenceError` ubijal klatke renderu, wiec kazdy drop lezacy w polu widzenia oslepial gracza.
- V3-P-02: `renderWorld` nigdy nie bylo uruchamiane w tescie — stad bezglowy harness renderu dla kazdego przedmiotu, potwora i stadium trupa, zweryfikowany celowym przywroceniem bledu (14 testow czerwonych).
- V3-P-03: brakujacy sprite i wyjatek w rysowaniu nie moga juz zabrac obrazu — swiat i HUD w osobnych `try`, czerwony pasek z trescia bledu na ekranie.
- PRD-MAP-11 (nowe) i PRD-MAP-09 (zmienione): pole bitwy sie starzeje — rozklad trupa przez maks. 4 fale, laczenie plam w kaluze, slady butow, wspolny limit 600 plam i sladow.
- Punkty G i H zrobione w v0.12.0 (rozklad trupow, kaluze, slady butow) — w calosci klientowo, zero kosztu pasma.
- V3-O-08 zrobione: sekcja `players` 1 241 -> 361 B (310 -> 90 B na gracza); na laczu 6,6 -> 5,6 kB/s.
- V3-O-04 zrobione: dlawienie per gracz na `ws.bufferedAmount` (16 kB / 150 ms wejscie, 2 kB / 1 s wyjscie, 12 Hz po zdlawieniu), pominiecie przed zbudowaniem snapshotu; `net.throttledStreams` w `/healthz`. Progi do weryfikacji na zywym laczu (O-09).

## 0.25 - 2026-11-06
- ITM-P-09 rozpisany zgodnie z R56: boost podnosi poziom I losuje modyfikator (wachlarz / samonaprowadzanie / gwozdziarka); Szal nadpisuje modyfikator na czas trwania.
- Punkt O zrobiony w v0.9.0: 500 -> 6,5 kB/s na gracza (77x), zmierzone na gnieździe. Zostaje V3-O-08 (sekcja players), O-04 i O-09 (weryfikacja na zywym laczu).
- V3-C-14: poglos karabinu brzmi "kiblowo" — ogon ciemnieje, jest krotki i mono. Naprawa: pasmo gorne od 400 Hz, dlugosc 1.2-1.6 s, wyciszone wczesne odbicia, IR stereo dekorelowane, pre-delay 60-70 ms.
- R59: kolce i klatka 2 x 2; klatka wyzwala sie z dowolnego kafelka i lapie wszystko w obrysie (V3-D-08, ITM-H-03, ITM-P-08).
- Punkt O (PILNE): gra niegrywalna przez internet powyzej ~30 potworow. Zmierzone: snapshot 23 kB, 79% to przedmioty, z czego 120 nieruchomych dropow wysylanych 20 Hz; 454 kB/s na gracza, 14,9 Mbit/s uploadu przy czworce. V3-O-01..07 z kolejnoscia i pulapka AoI (siatka kolizji klienta).

## 0.24 - 2026-11-06
- V3-C-13: karabin ciszej, poglos dluzszy (0.5-0.6 s) i z wyrazniejszym pre-delay (35-45 ms) — poglos ma wchodzic slyszalnie po czasie.
- R57: partie glosowe jednak PROBKAMI o niskim bitrate, nie synteza formantowa. Dwie persony: charczacy koks i spokojny zabojca ("Another one cleared"). Generowane u nas na bo3serverze (pocket-tts / VoxCPM2), nie pobierane (V3-N-05..07).
- Sekcja C2: diagnoza braku poglosu (normalize=true + limiter dociskajacy ogon + 14 ms dzwiek bez ogona) i naprawa (V3-C-09).
- V3-C-10/11/12: karabin, przeladowanie i ULTIMATE przeprojektowane — konkretne recepty warstwowe zamiast dotychczasowych dwuwarstwowych.
- V3-C-08: dzwiek stereo przez StereoPanner; wlasne dzwieki zostaja na srodku.
- Sekcja N: krotkie partie glosowe 16-bit (RELOADING!, przechwalki po fali) — trzy drogi do zbadania, rekomendacja: synteza formantowa.

## 0.23 - 2026-11-05
- PRD-FX-09: reakcja na obrazenia gracza (blysk, winieta, wstrzas, migniecie paska HP, obrys przy niskim HP, dzwiek) — FX-03 pokrywal wylacznie friendly fire.
- Punkt M (V3-M-01..05): brak JAKIEJKOLWIEK reakcji na obrazenia gracza — damagePlayer wysyla zdarzenie tylko dla friendly fire, wiec cios potwora i mina nie daja ani blysku, ani dzwieku. Do PRD jako FX-09.
- V3-C-07: przeladowanie slychac — trzyczesciowa wymiana magazynka na caly czas reloadu, wlasne glosniej i bez tlumienia (stara recepta "dwa kliki po 8 ms" ginela w serii).
- V3-C-06: poglos — lekki na karabinie, dlugi na wybuchach, przez ConvolverNode z generowana odpowiedzia impulsowa (bez plikow IR).

## 0.22 - 2026-11-05
- 10-BACKLOG-V3: backlog zgloszony po hostowaniu gry (punkty A-L) rozpisany na wymagania z ID (V3-A-01..V3-L-01), z audytem luk wobec PRD i kolejnoscia realizacji.
- R52 skala ulamkowa: gra wypelnia wysokosc okna, HUD wylacznie na planszy; uchyla calkowita krotnosc (PRD-MAP-05, V3-B-01).
- R53 raz postawione zostaje postawione: postawionego/aktywnego obiektu nie da sie podniesc, takze ruin startowych i muru z ultimate; kasuje ITM-GEN-08 i R27 (V3-J-02).
- R54 nowa logika klawiszy: E podnosi i uzywa, R odklada, obrot sciany Q/kolko myszy, LPM = spacja; uchyla R1 (PRD-CTRL-03/04/05, 02 sekcja 3, V3-J-03/04).
- R55 magnes kropelek oslabiony: zasieg 9 kafelkow, boost 380 px/s, wartosc kropelki bez zmian; modyfikuje R44 (ULT-07, V3-L-01).
- R56 boost broni podnosi poziom I losuje modyfikator (wachlarz / samonaprowadzanie / gwozdziarka); uchyla czesc PRD-PLR-04 (V3-I-01).
- PRD-HUD-12 numer wersji widoczny w grze, zrodlem tag wdrozenia (V3-J-01).
- PRD-PLR-07 licznik smierci pauzuje sie w trakcie podnoszenia; sprite powalonego lezy i macha (V3-J-09, V3-J-07).
- PRD-HUD-07 strzalka do powalonego zawsze, z sekundami do smierci (V3-J-08).
- PRD-HUD-11 pierscien przeladowania polprzezroczysty i rysowany klockami, zeby nie wybijal sie na pierwszy plan (V3-J-06).

## 0.21 - 2026-11-05
- 09-HOSTING: tryb hostowany (pokoje z kodem, telemetria faktycznej rozgrywki, leaderboard). Domyslnie wylaczony, TECH-01 dla trybu LAN bez zmian.

## 0.20 - 2026-11-05
- R51 sciana przy ciosie: jeden mikroruch 1 px lewo-prawo zamiast wibracji (FX-08, FX-02, 03 sekcja 1, X7).

## 0.19 - 2026-11-05
- R50 startowe ruiny: 7 losowych scian wokol spawnu na rozny poziomie zniszczenia, z seedu gry (PRD-MAP-10, 02 sekcja 4, testy M1-M2).

## 0.18 - 2026-11-05
- R49 tryb obserwatora po smierci: kamera na zywym sojuszniku, przelaczanie celu, HUD OBSERWUJESZ, powrot przy respawnie (PRD-PLR-10, HUD-05, testy F10-F13).

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
