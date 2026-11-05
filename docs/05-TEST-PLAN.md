# 05 - Plan testów

Wersja: 0.11 (2026-11-05). Testuje zespół produktowy (Aleksander Szczepaniak, Piotr Dejnak). Każdy test odwołuje się do ID wymagania. Wynik zapisujemy w `docs/test-reports/YYYY-MM-DD.md` (data, build, trudność, liczba graczy, wynik, uwagi).

## 1. Smoke (przed każdą sesją testowej)

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| S1 | Skopiuj katalog na czysty komputer, uruchom hosta | TECH-02, TECH-03 | Lobby w przeglądarce w < 2 min, bez instalacji |
| S2 | Odłącz internet (zostaw WLAN), uruchom i dołącz drugim PC | TECH-01, PRD-CON-01 | Działa identycznie |
| S3 | Host pokazuje IP w lobby | TECH-04 | Adres zgodny z `ipconfig` |
| S4 | Dołącz 3 klientów, start | PRD-SES-01..05 | Wszyscy widzą 4 postacie w różnych kolorach na środku mapy |

## 2. Sterowanie i kamera

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| C1 | WSAD w 8 kierunkach | PRD-CTRL-01 | Ruch po skosie nie szybszy niż prosto (zmierzyć czas przejścia 10 kafelków) |
| C2 | Krąż myszką wokół postaci | PRD-CTRL-02, 09 | Postać obraca się płynnie do kursora (bez skoków co 45 stopni), celownik pod kursorem |
| C3 | Spacja raz / przytrzymanie | PRD-CTRL-03, PRD-PLR-03 | Jeden pocisk / seria 10 strz./s w stronę kursora z lekkim rozrzutem |
| C9 | Trzymaj spację 4 s | PRD-PLR-03, PRD-HUD-11 | Po 30 strzałach (3 s) ogień ustaje, pasek PRZEŁADOWANIE pod postacią 1.5 s, potem seria wraca; licznik w HUD 30 → 0 → 30 |
| C10 | R z pustymi rękami przy 12 / 30 | PRD-PLR-03 | Przeładunek 1.5 s, licznik 30; R przy 30 / 30 nic nie robi |
| C7 | Prędkość pocisku: strzał na 14 kafelków | PRD-PLR-03 | Pocisk dolatuje w ok. 0.4 s (600 px/s), wrażenie "szybki" |
| C8 | Dwóch graczy rozchodzi się powoli na 40 kafelków, potem wraca | PRD-MAP-07 | Widok oddala się płynnie do max 0.5, obaj widoczni; powyżej zasięgu strzałka; po powrocie zoom wraca do 1.0; piksele ostre |
| C4 | Idź do krawędzi mapy | PRD-MAP-01, 04 | Nie da się wyjść; postać zostaje na środku ekranu, za krawędzią pustka |
| C5 | Zmień rozmiar okna | PRD-MAP-05 | Piksele ostre, bez rozmycia, proporcje OK |
| C6 | Esc, Tab | PRD-CTRL-07, 08 | Menu nie pauzuje hosta; Tab pokazuje graczy i HP |

## 3. Fale i przerwy

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| W1 | Zagraj fale 1-5 na Normalnym, 2 graczy | PRD-LOOP-01..03, 03 sekcja 2 | Każda fala ma więcej potworów; HUD pokazuje numer fali i licznik potworów |
| W2 | Zmierz przerwy po falach 1, 3, 5 stoperem | 03 sekcja 3 | 26 / 38 / 50 s (+/- 1 s) na Normalnym |
| W3 | Fala 5: boss | MOB-06 | Boss spawnuje się, ma pasek HP u góry, dropuje 3 przedmioty |
| W4 | W przerwie nic nie atakuje | PRD-LOOP-03 | Zero obrażeń przez całą przerwę |
| W5 | Potwory spawnują się przy krawędziach, z różnych stron | PRD-MAP-02 | Obserwacja z 3 pozycji na mapie |
| W6 | Fala 1 nie powala nikogo kto się rusza | 03 sekcja 5 | 3 próby, 0 powaleń |
| W7 | Stój nieruchomo, obserwuj 10 ślimaków z daleka | 03 sekcja 1 (błądzenie) | Nie idą w jednej prostej kolejce, widać odchylenia i rozglądanie; ostatnie 4 kafelki prosto |

## 4. Walka i friendly fire

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| F1 | Gracz A strzela do gracza B z pełnym HP (100), broń LV1 (8 obr.) | PRD-PLR-05 | B ma 99.2 HP po 1 trafieniu (HUD pokazuje 99), 92 po 10 |
| F2 | Strzał w siebie niemożliwy | PRD-PLR-05 | Pocisk nie rani strzelającego |
| F3 | Pocisk po trafieniu sojusznika znika | PRD-PLR-05 | Nie przebija dalej |
| F4 | Działko z potworem za graczem | PRD-PLR-06 | Działko nie strzela przez / do gracza, gracz nie traci HP |
| F5 | Mina pod graczem | PRD-PLR-06 | 6 HP straty (10% z 60) |
| F6 | Powalenie i podniesienie | PRD-PLR-07..09 | 0 HP = leży; sojusznik 3 s obok = wstaje z 30 HP; 1 s nietykalności |
| F8 | Regeneracja w przerwie: 50 HP na starcie przerwy | PRD-PLR-01 | +2 HP/s, 100 HP po 25 s; w trakcie fali brak regeneracji |
| F9 | Wszyscy klikają Gotowy w przerwie | PRD-LOOP-04 | 5 s odliczania, fala startuje; cofnięcie gotowości przerywa odliczanie |
| F7 | Wszyscy powaleni | PRD-PLR-08, PRD-LOOP-06 | Game over, ekran z numerem fali i czasem |

## 5. Przedmioty

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| I1 | Zabij 20 ślimaków na Normalnym | ITM-DROP-01, 02 | ok. 5 dropów (25%), obie kategorie się pojawiają w 3 falach |
| I2 | E przy kawałku ściany | ITM 3.1 | Podniesiony nad głowę, prędkość 60%, spacja nie strzela |
| I3 | E z trzymaną ścianą, kursor 1 kafelek obok | ITM 3.1, ITM-GEN-07 | Ghost zielony, po E ściana na siatce, blokuje gracza, potwory i pociski |
| I4 | E z trzymaną ścianą, kursor na potworze / 5 kafelków dalej | ITM-GEN-07 | Ghost czerwony, nic się nie dzieje |
| I5 | Spacja z trzymanym głazem w stronę potwora | ITM 3.1, ITM-H-02 | Potwór dostaje 30 obr. i stoi 0.5 s; głaz leży na ziemi, da się podnieść |
| I6 | E przy postawionej ścianie | ITM-GEN-08 | Podnosi ją z powrotem |
| I7 | R z działkiem 30 s w rękach | ITM 3.2, ITM-P-01 | Działko stoi, strzela do najbliższego potwora, pasek czasu nad nim, znika po 30 s (stoper) |
| I8 | E z działkiem w rękach (zamiast R) | ITM 3.2 | Działko leży na ziemi nieaktywne, da się podnieść ponownie |
| I9 | Spacja z działkiem w rękach | ITM 3.2 | Leci, rani potwora (10), po wylądowaniu działko jest aktywne i strzela |
| I9b | Spacja z boostem broni w rękach | ITM 3.2 | Leci, ląduje na ziemi nieaktywny, kolega może podnieść |
| I9c | Spacja z działkiem przy limicie 8 aktywnych | ITM sekcja 5 | Ląduje nieaktywne na ziemi |
| I10 | R z platformą 30 s, stań na niej z 50 HP | ITM-P-04 | +5 HP / 0.5 s, 100 HP po ok. 5 s |
| I11 | Powalony na platformie | ITM-P-04 | Wstaje po 2 s bez sojusznika |
| I12 | R z miną, wpuść potwora | ITM-P-07 | Uzbrojenie 1 s, wybuch gdy potwór wejdzie, 60 obr. w promieniu |
| I13 | R z klatką, wpuść biegacza | ITM-P-08 | Biegacz stoi 8 s, obrażenia x1.5, klatka znika |
| I14 | R z klatką przy bossie | ITM-P-08 | Boss nie jest łapany |
| I15 | R z boostem broni | ITM-P-09, PRD-PLR-04 | "BROŃ LV 2" w HUD, obrażenia 13 (sprawdź testem F1: 1.3 HP straty u sojusznika, zaokrąglenie do ustalenia) |
| I16 | Dwóch graczy E na ten sam przedmiot w tej samej klatce | ITM-GEN-06 | Dokładnie jeden go ma, drugi ma puste ręce |
| I17 | Rozłącz gracza z przedmiotem w rękach | ITM-GEN-10, PRD-SES-07 | Przedmiot leży tam, gdzie stał |
| I18 | Osiłek vs ściana na drodze | MOB-03, ITM-GEN-09 | Atakuje ścianę (50 obr. na cios), ściana pęka po 3 ciosach |
| I20 | Jeden ślimak vs ściana, gracz za ścianą nie strzela | 03 sekcja 1, ITM-GEN-09 | Ślimak nie stoi bezczynnie: bije co 1 s po 5, ściana pada po ok. 30 s; widać 3 stany pęknięć |
| I21 | Pełne okrążenie 8 ścian, 2 graczy w środku nie strzela, fala 3 | 03 sekcja 1 | Mur pada przed końcem fali; potwory wchodzą |
| I22 | Mur z luką 3 kafelki dalej | 03 sekcja 1 | Biegacze idą luką; Osiłek przegryza, gdy luka daleko |
| I23 | Ślimak bije ścianę, gracz podchodzi na 1 kafelek | 03 sekcja 1 | Ślimak przełącza się na gracza |
| I19 | Kolce w korytarzu, przepuść ślimaki | ITM-H-03 | 8 obr. / 0.5 s na każdym; gracz na kolcach traci 0.8 / 0.5 s |

## 5b. Efekty wizualne

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| X1 | Strzelaj do ślimaka z 8 kafelków | PRD-FX-01 | Każde trafienie: biały błysk potwora, rozprysk krwi, liczba 8 nad nim, plamka zostaje na ziemi |
| X2 | Strzelaj w postawioną ścianę | PRD-FX-02 | Iskra i odłamki przy każdym trafieniu, ściana drga |
| X3 | Trafienie sojusznika | PRD-FX-03 | Czerwony błysk trafionego, u niego winieta i komunikat z nickiem strzelca |
| X4 | Mina wybucha pod ślimakami, kamera 6 kafelków dalej | PRD-FX-04 | Błysk, pierścień ognia, odłamki, dym, wstrząs kamery, trwały ślad wypalenia; potwory w zasięgu błyskają |
| X5 | Mina wybucha 20 kafelków dalej (poza ekranem) | PRD-FX-04 | Brak wstrząsu; po dojściu na miejsce ślad wypalenia jest |
| X6 | 10 min na fali 8+ | PRD-FX-07, PRD-PERF-01 | FPS nie spada przez cząsteczki, stare ślady znikają po limicie |

## 6. Trudność

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| D1 | Suwak w lobby ma 4 pozycje z nazwami | 03 sekcja 4 | Łatwy / Normalny / Trudny / Koszmar, opis pod spodem |
| D2 | Zabij ślimaka na każdej trudności karabinem LV1 (8 obr.) | 03 sekcja 4 | Łatwy: 3 strzały (21 HP), Normalny: 4 (30), Trudny: 6 (42), Koszmar: 8 (60) |
| D3 | HP gracza na start per trudność | 03 sekcja 4 | 120 / 100 / 100 / 80 |
| D4 | Przerwa po fali 1 per trudność (stoper) | 03 sekcja 4 | 34 / 26 / 22 / 18 s |
| D5 | Trudność nie zmienia się w trakcie sesji | PRD-LOOP-07 | Brak możliwości zmiany po starcie |

## 7. Sieć i wydajność

| # | Test | Wymóg | Oczekiwane |
|---|---|---|---|
| N1 | 4 graczy, 10 minut, Wi-Fi | PRD-PERF-01, 03 | Brak rozłączeń, własna postać reaguje natychmiast, inni płynni |
| N2 | Fala 10+ z 60 potworami i 200 przedmiotami | PRD-PERF-01 | 60 FPS na laptopie z iGPU (licznik FPS w menu debug) |
| N3 | Zamknij przeglądarkę klienta w trakcie fali | PRD-SES-07 | Postać znika, gra toczy się dalej, reszta nie widzi laga |
| N4 | Zamknij hosta | PRD-SES-07 | Klienci dostają komunikat o końcu sesji |
| N5 | Próba dołączenia po starcie gry | PRD-SES-06 | Odrzucone z komunikatem "gra w toku", nie wpływa na graczy |
| N6 | Dołączenie: czas od wpisania adresu do lobby | PRD-PERF-04 | < 5 s |

## 7b. ULTIMATE

Testy UL1-UL13 w `08-ULTIMATE.md`, sekcja 6.

## 8. Testy balansu (sesje grywalnościowe)

Po przejściu testów 1-7 gramy sesje i notujemy w raporcie:

- Trudność, liczba graczy, osiągnięta fala, czas gry, przyczyna przegranej.
- Co było za łatwe / za trudne, który przedmiot był bezużyteczny, który dominował.
- Czy przerwy były za długie (nuda) czy za krótkie (nie dało się zbudować).
- Cel z `03` sekcja 5: Normalny 2 graczy pierwszy raz = fala 5-7. Jeśli rozjazd o więcej niż 2 fale, kręcimy budżetem fal i HP w `balance.json`, nie kodem.

## 9. Szablon raportu

```
# Raport testów YYYY-MM-DD
Build: <hash / wersja>
Testerzy: ...
Setup: N komputerów, Wi-Fi/Ethernet, internet odłączony: tak/nie

| Test | Wynik | Uwagi |
|---|---|---|
| S1 | PASS | |
| F1 | FAIL | B stracił 10 HP, nie 1 |

Sesje balansu:
- Normalny, 2 graczy: fala 4, przegrana przez Osiłki w fali 4 (za wcześnie?)
```
