# 01 - PRD: pixel-co-op

Wersja: 0.5 (2026-11-05)
Status: draft do przeglądu przez developera
Właściciele produktu: Aleksander Szczepaniak, Piotr Dejnak

---

## 1. Wizja

Czteroosobowa (2-4 graczy) gra co-op w widoku z góry, pixel art. Gracze bronią się przed kolejnymi falami potworów na płaskiej arenie. Między falami mają coraz dłuższe przerwy, w których z dropów po potworach budują fortyfikacje i rozstawiają power-upy. Gra toczy się po sieci lokalnej (WLAN) bez dostępu do internetu i ma być na tyle lekka, żeby skopiować ją między komputerami pendrivem.

Jedno zdanie: **"Fala, przerwa, zbuduj, powtórz. Razem, na LAN-ie, bez internetu."**

## 2. Ograniczenia twarde (nie negocjujemy)

| ID | Ograniczenie |
|---|---|
| PRD-CON-01 | Gra działa w pełni **bez internetu**. Żadnych CDN-ów, fontów z sieci, telemetrii, logowania. |
| PRD-CON-02 | Multiplayer przez **WLAN**. Jeden komputer hostuje, reszta dołącza po adresie IP w sieci lokalnej. |
| PRD-CON-03 | **Lightweight**: całość (gra + to, co trzeba, żeby hostować) mieści się w jednym katalogu, kopiowalnym między komputerami. Cel: poniżej 20 MB bez runtime'u. Zero instalatorów. |
| PRD-CON-04 | Forma: **przeglądarkowa** (preferowana) lub natywna, o ile spełnia CON-03. Szczegóły w `04-TECH-ARCH.md`. |
| PRD-CON-05 | **Pixel art generuje Claude**. Grafika powstaje z kodu lub jako pliki wygenerowane przez Claude. Żadnych assetów z internetu, żadnych paczek sprite'ów. |
| PRD-CON-06 | Widok z góry (top-down), postać gracza zawsze na środku ekranu. |

## 3. Zakres MVP

MVP to wersja, którą da się zagrać we 2-4 osoby na LAN-ie przez 15 minut i "poczuć" pętlę gry. W MVP **musi** być:

- Płaska mapa z granicą (arena).
- Sterowanie WSAD + celowanie myszką + strzał spacją.
- Kamera na graczu.
- Fale potworów (min. 3 typy potworów) rosnące w siłę, przerwy między falami rosnące w długość.
- Friendly fire 10%.
- Drop przedmiotów z potworów: min. 1 hard object (kawałek ściany) i min. 2 power-upy (działko 30s, mina).
- Podnoszenie / odkładanie / rzucanie (z obrażeniami) / używanie przedmiotów (E / E / Spacja / R).
- Suwak trudności, 4 poziomy, wybierany przez hosta przed startem.
- ULTIMATE: kropelki, wspólny pasek, 3 progi, 7 umiejętności do wyboru w lobby, użycie `F` (`08-ULTIMATE.md`).
- HUD: HP, numer fali, odliczanie do następnej fali, trzymany przedmiot, pasek ULTIMATE.
- Stan przegranej (wszyscy gracze padli) i ekran wyniku (numer fali, czas).

Poza MVP (później): boss, statystyki, dźwięk, mapy inne niż płaska (`07-BACKLOG-V2.md`).

## 4. Gracze i sesja

| ID | Wymóg |
|---|---|
| PRD-SES-01 | Sesję tworzy **host**. Host wybiera trudność i startuje grę. |
| PRD-SES-02 | Dołączenie: gracz wpisuje adres hosta (IP:port) lub otwiera link w przeglądarce. Nie ma matchmakingu ani lobby w internecie. |
| PRD-SES-03 | Liczba graczy: 1-4. Jeden gracz = też gra działa (do testów). |
| PRD-SES-04 | Gracz podaje nick (max 12 znaków). Każdy gracz dostaje inny kolor (4 kolory: zielony, niebieski, żółty, różowy). |
| PRD-SES-05 | Przed startem jest ekran lobby: lista graczy, trudność, wybór ULTIMATE per gracz (7 kafelków), przycisk "Start" u hosta (aktywny, gdy każdy wybrał ultimate). Reszta widzi "czekam na hosta". |
| PRD-SES-06 | Dołączenie w trakcie gry (late join): **niedozwolone**. Po starcie sesja jest zamknięta, spóźniony gracz czeka na nową grę. Host po starcie przestaje przyjmować nowe połączenia (komunikat "gra w toku"). |
| PRD-SES-07 | Rozłączenie gracza: jego postać znika, przedmiot, który trzymał, spada na ziemię. Gra toczy się dalej. Rozłączenie hosta = koniec sesji dla wszystkich z komunikatem. |

## 5. Sterowanie

| ID | Wymóg |
|---|---|
| PRD-CTRL-01 | `W A S D` - ruch w 8 kierunkach. Ruch po skosie znormalizowany (nie szybszy niż prosto). |
| PRD-CTRL-02 | **Celowanie myszką**: pozycja kursora względem postaci (która jest na środku ekranu) wyznacza kierunek celowania. Postać obraca się w stronę kursora. Celownik rysowany pod kursorem. |
| PRD-CTRL-03 | `Spacja` - strzał w kierunku celowania (ręce puste). Przytrzymanie = ogień ciągły z cooldownem broni. **Z przedmiotem w rękach spacja rzuca** (patrz `02-ITEMS.md`). |
| PRD-CTRL-04 | `E` - podnieś przedmiot z ziemi / odłóż trzymany. Dotyczy obu kategorii (`02-ITEMS.md`, sekcja 3). |
| PRD-CTRL-05 | `R` - użyj trzymany przedmiot "używalny" (power-up), np. spawnuje platformę leczącą, działko, minę. Z hard objectem w rękach: obrót kawałka ściany o 90 stopni. |
| PRD-CTRL-06 | Rzut (spacja z przedmiotem) **zawsze zadaje obrażenia** trafionemu potworowi. Wartości w `02-ITEMS.md`. |
| PRD-CTRL-10 | `F` - użyj ULTIMATE (od progu I, `08-ULTIMATE.md`). |
| PRD-CTRL-07 | `Esc` - menu pauzy po stronie klienta (gra po stronie hosta NIE pauzuje, bo to multiplayer). Zawiera: wróć, ustawienia (głośność, pełny ekran), wyjdź. |
| PRD-CTRL-08 | `Tab` (przytrzymanie) - lista graczy z HP. |
| PRD-CTRL-09 | Sprite postaci obraca się do kursora **płynnie** (rotacja całej postaci o dowolny kąt). Sprite rysowany "z góry" (top-down, nie 3/4), żeby obrót wyglądał naturalnie. Nearest neighbour bez wygładzania. |

Nie ma celowania klawiaturą ani sterowania padem w MVP.

## 6. Kamera i mapa

| ID | Wymóg |
|---|---|
| PRD-MAP-01 | Mapa na start: płaska, prostokątna arena 80 x 60 kafelków po 16 px (1280 x 960 px świata). Z nieprzekraczalną granicą (ściana/krawędź). |
| PRD-MAP-02 | Potwory spawnują się przy krawędziach mapy, poza polem widzenia graczy, jeśli to możliwe. Punkty spawnu rozłożone wzdłuż całego obwodu. |
| PRD-MAP-03 | Gracze spawnują się na środku mapy, obok siebie. |
| PRD-MAP-04 | Kamera: postać lokalnego gracza zawsze na środku ekranu. Kamera nie zatrzymuje się na krawędzi mapy (poza mapą rysujemy "pustkę" / ciemność). |
| PRD-MAP-05 | Skalowanie: render w natywnej rozdzielczości pixel-art (np. 320 x 180 lub 480 x 270) i powiększenie całkowitą krotnością do okna. Bez wygładzania (nearest neighbour). |
| PRD-MAP-06 | Tło: podłoże z lekką wariacją kafelków (2-3 warianty), żeby ruch był widoczny. |
| PRD-MAP-07 | **Dynamiczny zoom kamery** (feedback 2026-11-05): lokalna postać zostaje na środku, ale widok oddala się płynnie w miarę rozchodzenia się graczy, tak aby sojusznicy byli widoczni na ekranie. Zoom ograniczony do rozsądnego maksimum: skala od 1.0 (480 x 270 świata) do 0.5 (960 x 540 świata), zmiana płynna (lerp, ok. 1 s), bez skokow. Przy maksymalnym oddaleniu sojusznicy poza ekranem pokazywani są strzałkami na krawędzi (PRD-HUD-07). Zoom w pixel-art: skala całkowita lub renderowanie świata w wyższej rozdzielczości i skalowanie w dół nearest neighbour; developer wybiera, byle piksele zostały ostre. Zoom wraca do 1.0, gdy gracze są blisko. Gracz solo: zoom 1.0. |

## 7. Postać gracza

| ID | Wymóg |
|---|---|
| PRD-PLR-01 | HP: 100. Regeneracja naturalna **tylko w przerwie**: +2 HP/s. W trakcie fali brak (tylko platforma lecząca). |
| PRD-PLR-02 | Prędkość: ok. 5 kafelków/s (80 px/s). Z trzymanym hard objectem: 60% prędkości. Z power-upem: 100%. Z czymkolwiek w rękach gracz nie strzela. |
| PRD-PLR-03 | Broń podstawowa: pistolet. Obrażenia 10, cooldown 0.25 s, **prędkość pocisku 600 px/s** (szybkie, nie wolne: feedback z testu silnika 2026-11-05), zasięg 14 kafelków. Pocisk znika po trafieniu lub po zasięgu. |
| PRD-PLR-04 | Poziom broni: 1-5. Każdy poziom z "boostu" (rzadki item) podnosi obrażenia o 30% i skraca cooldown o 10%. Na poziomie 3+ pocisk przebija 1 cel. Na 5 strzał potrójny (wachlarz). **[PROPOZYCJA]** |
| PRD-PLR-05 | **Friendly fire 10%**: pocisk gracza trafiający innego gracza zadaje 10% swoich obrażeń. Pocisk znika po trafieniu sojusznika (nie przebija). Gracz nie może trafić samego siebie. |
| PRD-PLR-06 | Działka (turrety) ustawione przez graczy NIE strzelają do graczy i nie zadają friendly fire. Miny ranią graczy w 10%. **[PROPOZYCJA]** |
| PRD-PLR-07 | Powalenie: gdy HP spada do 0, gracz jest "powalony" (leży, nie strzela, nie rusza się). Sojusznik stojący obok przez 3 s podnosi go z 30 HP. Bez pomocy przez 10 s (czas zależny od trudności, `03` sekcja 4) = śmierć do końca fali. |
| PRD-PLR-08 | Martwy gracz wraca na początku następnej przerwy między falami z 50 HP. Gdy wszyscy gracze są powaleni lub martwi w trakcie fali = koniec gry. |
| PRD-PLR-09 | Nietykalność 1 s po podniesieniu / respawnie (miganie sprite'a). |

## 8. Pętla rozgrywki

```
LOBBY -> START -> [PRZERWA 0 (krótka)] -> FALA 1 -> PRZERWA 1 -> FALA 2 -> PRZERWA 2 -> ... -> GAME OVER
```

| ID | Wymóg |
|---|---|
| PRD-LOOP-01 | Fala kończy się, gdy wszystkie potwory z fali są martwe. Potwory z fali spawnują się porcjami (nie wszystkie naraz), patrz `03-WAVES-DIFFICULTY.md`. |
| PRD-LOOP-02 | Po fali startuje przerwa z widocznym odliczaniem. Długość przerwy rośnie z numerem fali (tabela w `03`). |
| PRD-LOOP-03 | W przerwie: gracze podnoszą dropy, budują, rozstawiają power-upy, leczą się. Nic nie atakuje. Dropy z poprzedniej fali leżą na ziemi do podniesienia. |
| PRD-LOOP-04 | Przerwę można skrócić: każdy gracz klika "Gotowy" (klawisz `G` lub przycisk w HUD). Gdy wszyscy są gotowi, rusza 5-sekundowe odliczanie i fala startuje. Gotowość można cofnąć do końca odliczania. HUD pokazuje, kto jest gotowy. |
| PRD-LOOP-05 | Dropy leżące na ziemi nie znikają między falami. Limit 200 przedmiotów na mapie, powyżej najstarsze znikają. |
| PRD-LOOP-06 | Gra nie ma końca (endless). Cel: dotrwać jak najdalej. Ekran końcowy pokazuje numer fali, czas, zabójstwa per gracz. |
| PRD-LOOP-07 | Trudność jest stała przez całą sesję (wybrana w lobby). |

## 9. HUD

| ID | Element |
|---|---|
| PRD-HUD-01 | Pasek HP lokalnego gracza (lewy dolny róg) z wartością liczbową. |
| PRD-HUD-02 | Numer fali + stan: "FALA 4" w trakcie fali, "PRZERWA 0:37" w przerwie (góra, środek). W trakcie fali licznik pozostałych potworów. |
| PRD-HUD-03 | Trzymany przedmiot: ikona + nazwa + (dla power-upów z czasem) czas działania (prawy dolny róg). Pusty slot = "nic". |
| PRD-HUD-04 | Poziom broni (np. "BROŃ LV 2") obok HP. |
| PRD-HUD-10 | Pasek ULTIMATE (3 segmenty) nad HP, ikona wybranego ultimate, kropka progu nad sojusznikami (`08-ULTIMATE.md`, ULT-HUD). |
| PRD-HUD-05 | Nad każdym graczem: nick w jego kolorze i mały pasek HP. Nad powalonym: ikona i licznik do śmierci. |
| PRD-HUD-06 | Nad działkami i platformami: mały pasek pozostałego czasu. |
| PRD-HUD-07 | Strzałki na krawędzi ekranu wskazujące sojuszników poza ekranem (kolor gracza). |
| PRD-HUD-08 | Celownik pod kursorem. Kursor systemowy ukryty nad canvasem. |
| PRD-HUD-09 | Podpowiedź kontekstowa przy przedmiocie w zasięgu: "[E] podnieś: Kawałek ściany". |

## 10. Audio

Poza MVP. Jeśli będzie: proste efekty generowane syntezą (bez plików z sieci), wyciszalne w menu.

## 11. Wydajność i kompatybilność

| ID | Wymóg |
|---|---|
| PRD-PERF-01 | 60 FPS na zintegrowanej grafice laptopa z 2018+ przy 4 graczach, 60 potworach i 200 przedmiotach na mapie. |
| PRD-PERF-02 | Przeglądarki: aktualny Chrome / Edge / Firefox. Safari mile widziane, nie wymagane. |
| PRD-PERF-03 | Latencja LAN: ruch własnej postaci odczuwalnie natychmiastowy (predykcja lokalna). Ruch innych graczy płynny (interpolacja). Szczegóły w `04-TECH-ARCH.md`. |
| PRD-PERF-04 | Dołączenie do hosta w czasie poniżej 5 s od wpisania adresu. |

## 12. Kryteria akceptacji MVP (checklista)

- [ ] 4 osoby na 4 laptopach w jednym WLAN bez internetu grają 10 minut bez rozłączenia.
- [ ] Całość kopiuje się jednym katalogiem; na nowym komputerze uruchamia się w mniej niż 2 minuty.
- [ ] Postać reaguje na WSAD, obraca się do myszy, strzela spacją.
- [ ] Przechodzi min. 5 fal; każda kolejna wyraźnie trudniejsza; przerwy wyraźnie dłuższe.
- [ ] Friendly fire: trafienie sojusznika zabiera 10% obrażeń (sprawdzalne liczbowo).
- [ ] Potwory dropią przedmioty obu kategorii; da się podnieść, odstawić, rzucić.
- [ ] Postawiona ściana blokuje potwory i pociski.
- [ ] Działko strzela do potworów przez swój czas i znika.
- [ ] 4 poziomy trudności dają mierzalnie inne liczby (HP potworów, ilość).
- [ ] Kropelki ładują pasek wszystkim; `F` od progu I odpala wybrany ultimate z siłą progu; pasek użytego zeruje się, innych nie.
- [ ] Pociski są szybkie (600 px/s), potwory nie idą idealnie po linii do gracza.
- [ ] Game over po powaleniu wszystkich. Ekran wyniku.

Szczegółowe scenariusze testów: `05-TEST-PLAN.md`.
