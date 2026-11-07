# 01 - PRD: pixel-co-op

Wersja: 0.22 (2026-11-05)
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
| PRD-CON-05 | **Pixel art generuje Claude**. Grafika powstaje z kodu lub jako pliki wygenerowane przez Claude. Żadnych assetów z internetu, żadnych paczek sprite'ów. Kierunek artystyczny: **brudne post-apo** (ziemia brązowo-szara, beton poobijany, potwory odrażające, nie "wesołe"). |
| PRD-CON-06 | Widok z góry (top-down), postać gracza zawsze na środku ekranu. |

## 3. Zakres MVP

MVP to wersja, którą da się zagrać we 2-4 osoby na LAN-ie przez 15 minut i "poczuć" pętlę gry. W MVP **musi** być:

- Płaska mapa z granicą (arena).
- Sterowanie WSAD + celowanie myszką + strzał spacją.
- Kamera na graczu.
- Fale potworów (min. 3 typy potworów) rosnące w siłę, przerwy między falami rosnące w długość.
- Friendly fire 10%.
- Drop przedmiotów z potworów: min. 1 hard object (kawałek ściany) i min. 2 power-upy (działko 30s, mina).
- Podnoszenie / używanie / rzucanie (z obrażeniami) / odkładanie przedmiotów (E / E / Spacja+LPM / R, R54).
- Potwory powoli niszczą obiekty graczy (HP obiektów, 4 stany zużycia z kruszeniem krawędzi, animacja zawalenia, rumowisko; PRD-FX-08).
- Trupy potworów i krew zostają na ziemi (PRD-MAP-09).
- 7 losowych, częściowo zniszczonych ścian wokół spawnu na start gry (PRD-MAP-10).
- Widoczne trafienia pocisków w potwory i widoczny wybuch miny (PRD-FX-01, PRD-FX-04).
- Suwak trudności, 4 poziomy, wybierany przez hosta przed startem.
- ULTIMATE: kropelki, wspólny pasek, 3 progi, 7 umiejętności do wyboru w lobby, użycie `F` (`08-ULTIMATE.md`).
- HUD: HP, numer fali, odliczanie do następnej fali, trzymany przedmiot, pasek ULTIMATE.
- Stan przegranej (wszyscy gracze padli) i ekran wyniku (numer fali, czas).

Poza MVP (później): boss, statystyki, dźwięk, mapy inne niż płaska (`07-BACKLOG-V2.md`).

## 4. Gracze i sesja

| ID | Wymóg |
|---|---|
| PRD-SES-01 | Sesję tworzy **host**. Host wybiera trudność i startuje grę. |
| PRD-SES-02 | Dołączenie: gracz wpisuje adres hosta (IP:port) lub otwiera link w przeglądarce. Nie ma matchmakingu. **Zmienione przez PRD-SES-08**: w trybie hostowanym jest publiczna lista otwartych pokojów — to nadal nie jest matchmaking (nikt nikogo nie dobiera), tylko spis, z którego wybiera człowiek. |
| PRD-SES-03 | Liczba graczy: 1-4. Jeden gracz = też gra działa (do testów). |
| PRD-SES-04 | Gracz podaje nick (max 12 znaków). Każdy gracz dostaje inny kolor (4 kolory: zielony, niebieski, żółty, różowy). |
| PRD-SES-05 | Przed startem jest ekran lobby: lista graczy, trudność, wybór ULTIMATE per gracz, przycisk "Start" u hosta (aktywny, gdy każdy wybrał ultimate). Reszta widzi "czekam na hosta". **Układ lobby** (R46): panel szeroki, min. 900 px na ekranie 1366 x 768, **bez przewijania pionowego**: 7 kafelków ultimate w **jednym rzędzie** (na węższym oknie 4 + 3), każdy kafelek z **ikoną 32 x 32 pixel-art** powiększoną 3x, nazwą i jednym zdaniem opisu; opis trzech progów pokazuje się po najechaniu / zaznaczeniu pod rzędem, nie w kafelku. Lista graczy i trudność po lewej, ultimate po prawej lub pod spodem, całość mieści się na 768 px wysokości. |
| PRD-SES-06 | Dołączenie w trakcie gry (late join): **niedozwolone**. Po starcie sesja jest zamknięta, spóźniony gracz czeka na nową grę. Host po starcie przestaje przyjmować nowe połączenia (komunikat "gra w toku"). |
| PRD-SES-07 | Rozłączenie gracza: jego postać znika, przedmiot, który trzymał, spada na ziemię. Gra toczy się dalej. Rozłączenie hosta = koniec sesji dla wszystkich z komunikatem. |
| PRD-SES-08 | **Wejście do gry w trybie hostowanym** (V3-K, 2026-11-06): dwa ekrany. (1) **Ekran nicku** - tylko nick, zapamiętywany, więc pokazuje się raz. (2) **Ekran główny**: lista otwartych pokojów, **Nowy pokój**, leaderboard, **Sterowanie** i odnośnik "zmień nick". **Od v0.16.0 (V3-K-06)** menu dzieje się na tle żywej areny demo (bez serwera, nieme), z logotypem pixel-art, wizytówką gracza (sprite, wyniki, głośność, pełny ekran), dużym **GRAJ** (pierwszy wolny pokój albo nowy), kartami pokojów ze slotami, bestiariuszem, poradą, pulsem serwera i listą „co nowego". Wiersz pokoju niesie kod, `n / 4 graczy` oraz `mecz w toku - fala N`; wiersz pełny albo z trwającym meczem jest **nieklikalny**. Lista odświeża się co 5 s **wyłącznie wtedy, gdy ten ekran jest otwarty** - nigdy w lobby ani w trakcie gry. Link `?r=KOD` wchodzi prosto do pokoju z pominięciem ekranu głównego. Odmowa serwera (pokój pełny, zamknięty, gra w toku) wraca na ekran główny z komunikatem i czyści `?r=` z adresu, żeby próba się nie zapętliła. W trybie LAN listy nie ma (jedna sesja na serwer). |
| PRD-SES-09 | **Lista pokojów nie identyfikuje nikogo**: `GET /api/rooms` zwraca wyłącznie kod, liczbę graczy, limit, flagę meczu, numer fali i wiek pokoju - **żadnych nicków**. Endpoint istnieje tylko w trybie pokoi i ma limit zapytań na adres. **Pokój bez graczy jest martwy natychmiast**: znika z listy i nie da się do niego wejść, mimo że fizycznie żyje jeszcze 90 s (bo 30-sekundowa karencja na powrót po odświeżeniu karty nie może kasować pokoju z ludźmi w środku). Konsekwencja przyjęta świadomie: odświeżenie karty w **jednoosobowym lobby** zamyka pokój - gracz wraca na ekran główny i zakłada nowy. |

## 5. Sterowanie

| ID | Wymóg |
|---|---|
| PRD-CTRL-01 | `W A S D` - ruch w 8 kierunkach. Ruch po skosie znormalizowany (nie szybszy niż prosto). |
| PRD-CTRL-02 | **Celowanie myszką**: pozycja kursora względem postaci (która jest na środku ekranu) wyznacza kierunek celowania. Postać obraca się w stronę kursora. Celownik rysowany pod kursorem. |
| PRD-CTRL-03 | `Spacja` - strzał w kierunku celowania (ręce puste). Przytrzymanie = ogień ciągły z cooldownem broni. **Z przedmiotem w rękach spacja rzuca** (patrz `02-ITEMS.md`). **Lewy przycisk myszy robi dokładnie to samo co spacja** (R54). |
| PRD-CTRL-04 | `E` - **podnieś** przedmiot z ziemi (puste ręce) / **użyj** trzymanego (coś w rękach): hard object zostaje postawiony, power-up postawiony i aktywowany (R54, uchyla R1). Z przedmiotem w rękach `E` nigdy nie podnosi innego przedmiotu (ITM-GEN-11). Stawianie celuje najdalej w zasięgu w kierunku kursora, gdy kursor jest za daleko (ITM-PLACE-01). |
| PRD-CTRL-05 | `R` - **odłóż** trzymany przedmiot na ziemię pod nogi, bez używania (R54: odkładanie bez użycia jest rzadsze niż użycie, więc dostaje rzadszy klawisz). Z pustymi rękami: ręczne przeładowanie. **Obrót kawałka ściany o 90 stopni: kółko myszy albo `Q`.** |
| PRD-CTRL-06 | Rzut (spacja z przedmiotem) **zawsze zadaje obrażenia** trafionemu potworowi. Wartości w `02-ITEMS.md`. |
| PRD-CTRL-10 | `F` - użyj ULTIMATE (od progu I, `08-ULTIMATE.md`). |
| PRD-CTRL-07 | `Esc` - menu pauzy po stronie klienta (gra po stronie hosta NIE pauzuje, bo to multiplayer). Zawiera: wróć, ustawienia (głośność, pełny ekran), wyjdź. |
| PRD-CTRL-08 | `Tab` (przytrzymanie) - lista graczy z HP. |
| PRD-CTRL-11 | **Ekran "Sterowanie"** (V3-K-04): obrazek klawiatury i myszy w pixel-arcie **generowany z kodu** (CON-01/CON-05 zabraniają assetów z sieci), z podświetlonymi tylko tymi klawiszami, które coś robią, i opisem akcji przy każdym. Dostępny z ekranu głównego **i z menu pauzy**. Aktualizowany razem ze zmianami mapowania klawiszy. **Od v0.16.0 (V3-K-07) z ekranu głównego to poligon**: obok obrazka żyje wycinek gry bez serwera, w którym bohater reaguje na prawdziwe klawisze (ruch w miejscu, celowanie, strzał, podnoszenie i stawianie ściany, rzut, ULTIMATE), a trzymany klawisz świeci na obrazku. |
| PRD-CTRL-09 | Sprite postaci obraca się do kursora **płynnie** (rotacja całej postaci o dowolny kąt). Sprite rysowany "z góry" (top-down, nie 3/4), żeby obrót wyglądał naturalnie. Nearest neighbour bez wygładzania. |

Nie ma celowania klawiaturą ani sterowania padem w MVP.

## 6. Kamera i mapa

| ID | Wymóg |
|---|---|
| PRD-MAP-01 | Mapa na start: płaska, prostokątna arena 80 x 60 kafelków po 16 px (1280 x 960 px świata). Z nieprzekraczalną granicą (ściana/krawędź). |
| PRD-MAP-02 | Potwory spawnują się przy krawędziach mapy, poza polem widzenia graczy, jeśli to możliwe. Punkty spawnu rozłożone wzdłuż całego obwodu. |
| PRD-MAP-03 | Gracze spawnują się na środku mapy, obok siebie. |
| PRD-MAP-10 | **Startowe ruiny** (R50): na start każdej gry serwer stawia **7 kawałków ściany** (zwykłe hard objecty `wall`, 2 x 1, niszczone jak każde inne; **nie da się ich podnieść ani przestawić** - R53) **losowo w okolicy spawnu graczy**: w pierścieniu 4-9 kafelków od środka mapy, losowa orientacja (pozioma / pionowa), min. 2 kafelki odstępu między nimi i min. 2 kafelki od punktu spawnu graczy, nigdy na kafelkach spawnu. **Każda na innym, losowym poziomie zniszczenia**: HP losowane z przedziałów 4 stanów (PRD-FX-08) tak, żeby w 7 ścianach były co najmniej 2 stany poza pełnym; przykładowo 2 pełne, 2 pęknięte, 2 wykruszone, 1 prawie zawalona. Losowanie z seedu gry (ten sam układ u wszystkich graczy, inny w każdej grze). Ruiny nie liczą się do limitu przedmiotów na ziemi. Dają pierwszą osłonę i od razu pokazują stany zniszczenia. Liczba, promień i rozkład stanów w `balance.json`. |
| PRD-MAP-11 | **Pole bitwy się starzeje** (V3-G, V3-H): trup niesie numer fali śmierci i przechodzi stadia na granicy fali, nie w jej trakcie; kościotrup jest wspólny dla sylwetek o zbliżonym rozmiarze (16 / 32 / 64 px), żeby nie mnożyć grafiki. Plamy krwi **łączą się w kałuże**, więc liczba rysowanych obiektów **maleje**, a pole wygląda na coraz bardziej zarżnięte. Postać — gracz lub potwór — która przejdzie przez **świeżą** kałużę, zostawia **ślady butów** przez kilkanaście kroków, bladnące z każdym krokiem; ślady są trwałe i dzielą limit z plamami. Całość liczona **po stronie klienta** z numeru fali w snapshocie, więc nie kosztuje ani bajta pasma; konsekwencja przyjęta świadomie: kałuże i ślady mogą się nieznacznie różnić między graczami. |
| PRD-MAP-04 | Kamera: postać lokalnego gracza zawsze na środku ekranu. Kamera nie zatrzymuje się na krawędzi mapy (poza mapą rysujemy "pustkę" / ciemność). |
| PRD-MAP-05 | Skalowanie: render w natywnej rozdzielczości pixel-art **560 x 315** (PRD-MAP-07), powiększany **ułamkowo do pełnej wysokości okna** z zachowaniem proporcji 16:9 (R52, 2026-11-05: całkowita krotność zostawiała na 1080p ok. 135 px czarnych pasów). Bez wygładzania (nearest neighbour). Wszyscy gracze widzą to samo pole gry niezależnie od rozmiaru okna; kosztem jest niecałkowity piksel. |
| PRD-MAP-06 | Tło: brązowo-szara, spękana ziemia (klimat post-apo), 3 warianty kafelka, żeby ruch był widoczny. |
| PRD-MAP-08 | **Dekoracje podłoża**: na ziemi losowo rozrzucone małe kamyki, kępki suchej trawy, pęknięcia, plamy, drobny złom. Wszystko **bezkolizyjne** (nie blokuje ruchu, pocisków, budowy, pathfindingu) i **losowane na nowo przy każdej grze** (seed z serwera, żeby wszyscy gracze widzieli to samo). Gęstość: ok. 1 dekoracja na 6-10 kafelków, bez nakładania. Rysowane między podłożem a przedmiotami. Sprite'y: `decor_*` w `sprites.js`. |
| PRD-MAP-09 | **Trupy i krew**: zabity potwór zostawia na ziemi trupa (sprite per typ potwora, obrócony jak potwór w chwili śmierci) i plamę krwi pod nim. Trafienie potwora (bez zabicia) zostawia małą plamkę krwi. Wszystko **bezkolizyjne**, rysowane między dekoracjami a przedmiotami, **nie znika między falami**. Limit 300 trupów oraz **600 plam i śladów łącznie** na mapie, powyżej najstarsze znikają (żeby nie zabić wydajności, PRD-PERF-01). Trup **rozkłada się przez maksymalnie 4 fale** (świeży → rozdęty → kościotrup → wyblakły → znika), a plamy bliżej niż 6 px **łączą się w większą kałużę** (3 stopnie wielkości) — patrz PRD-MAP-11. Trup gracza: nie (gracz leży powalony albo respawnuje). Dane idą w snapshocie tylko przy zdarzeniu śmierci / trafienia (event `mobDeath`, `hit` z pozycją i kątem), klient trzyma listę lokalnie; dołączający po rozłączeniu dostaje pełną listę przy `resume`. |
| PRD-MAP-07 | **Stały, lekko oddalony widok, bez dynamicznego zoomu** (R42, 2026-11-05: dynamiczny zoom psuł rozgrywkę i został usunięty). Wewnętrzny canvas **560 x 315** px świata (było 480 x 270, czyli ok. 17% dalej), nadal skalowany całkowitą krotnością do okna (`computeScale` z 560 x 315), nearest neighbour. Skala nie zmienia się w trakcie gry. Sojusznicy poza ekranem: strzałki (PRD-HUD-07). Punkt spawnu potworów poza ekranem: `spawnHiddenDistPx` podnieść do ok. 330. |

## 7. Postać gracza

| ID | Wymóg |
|---|---|
| PRD-PLR-01 | HP: 100. Regeneracja naturalna **tylko w przerwie**: +2 HP/s. W trakcie fali brak (tylko platforma lecząca). |
| PRD-PLR-02 | Prędkość: ok. 5 kafelków/s (80 px/s). Z trzymanym hard objectem: 60% prędkości. Z power-upem: 100%. Z czymkolwiek w rękach gracz nie strzela. |
| PRD-PLR-03 | Broń podstawowa: **karabin maszynowy**. Obrażenia 8, ogień ciągły co **0.14 s (ok. 7 strz./s)** przy trzymanej spacji, **magazynek 30 pocisków**, po opróżnieniu automatyczny **przeładunek 1.5 s**. Rozrzut 3 stopnie. Prędkość pocisku **450 px/s** (po teście 2026-11-05: 600 było ciut za szybko, 300 za wolno), zasięg 14 kafelków. Pocisk znika po trafieniu lub po zasięgu. W trakcie przeładunku nie można strzelać; ruch, podnoszenie i rzut działają. `R` z pustymi rękami = ręczny przeładunek (gdy magazynek niepełny). Stare "pistolet" i cooldown 0.25 s nie obowiązują. |
| PRD-PLR-04 | Poziom broni: 1-5. Każdy poziom z "boostu" (rzadki item) podnosi obrażenia o 30%, powiększa magazynek o 10 i skraca przeładunek o 0.2 s. **Każde podniesienie losuje dodatkowo jeden z trzech modyfikatorów broni** (wachlarz / samonaprowadzanie / gwoździarka), patrz `10-BACKLOG-V3.md` punkt I. ~~Na poziomie 3+ pocisk przebija 1 cel. Na 5 strzał potrójny~~ - **uchylone przez R56**, to jest teraz domena modyfikatorów. |
| PRD-PLR-05 | **Friendly fire 10%**: pocisk gracza trafiający innego gracza zadaje 10% swoich obrażeń. Pocisk znika po trafieniu sojusznika (nie przebija). Gracz nie może trafić samego siebie. |
| PRD-PLR-06 | Działka (turrety) ustawione przez graczy NIE strzelają do graczy i nie zadają friendly fire. Miny ranią graczy w 10%. **[PROPOZYCJA]** |
| PRD-PLR-07 | Powalenie: gdy HP spada do 0, gracz jest "powalony" (leży, nie strzela, nie rusza się). Sojusznik stojący obok przez 3 s podnosi go z 30 HP. Bez pomocy przez 10 s (czas zależny od trudności, `03` sekcja 4) = śmierć do końca fali. **Licznik do śmierci stoi, dopóki trwa podnoszenie** (sojusznik w zasięgu): nie można zginąć w trakcie ratunku. Sprite powalonego: leży i macha ręką (2 klatki). |
| PRD-PLR-08 | Martwy gracz wraca na początku następnej przerwy między falami z 50 HP. Gdy wszyscy gracze są powaleni lub martwi w trakcie fali = koniec gry. |
| PRD-PLR-10 | **Tryb obserwatora po śmierci** (R49): gdy licznik śmierci powalonego gracza dobiegnie końca (stan `dead`), jego widok **przełącza się na śledzenie żywego sojusznika**: kamera centruje się na nim (płynny przejazd 0.5 s), HUD pokazuje u góry `OBSERWUJESZ: {nick}` i `wracasz w przerwie`, własny HUD HP/amunicji zgaszony. Domyślnie śledzony jest najbliższy żywy sojusznik; **lewy / prawy przycisk myszy albo A / D** przełączają na kolejnego żywego (po kółku). Gdy śledzony padnie, automatyczne przejście na następnego żywego. Gdy nikt nie żyje, gra i tak kończy się game over (PLR-08). Obserwator nie wysyła inputu ruchu ani strzału; `Tab` i `Esc` działają. W chwili respawnu w przerwie kamera wraca na własną postać (przejazd 0.5 s). Powalony (jeszcze z licznikiem) nadal widzi własną postać, żeby sojusznik mógł go znaleźć i podnieść. |
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
| PRD-LOOP-07 | **Fala ma być rozpoznawalna, nie jednostajna** (R60, zgłoszenie z gry 2026-11-06: „zawsze na początku idą runnery i tak w kółko"). Dwie reguły: (1) potwory nadchodzą **grupami** - każda zdominowana jednym typem i wychodząca **z jednego kierunku**, w losowej kolejności, więc gracz widzi stado, a nie równomierny deszcz z całej mapy; (2) **od fali 3 jeden typ nie pojawia się wcale**, losowany tak, że najsłabsi wypadają najczęściej. Razem mają dać falom własny charakter („to fala biegaczy", „tym razem bez ślimaków"). Liczby i zmierzone rozkłady: `03-WAVES-DIFFICULTY.md` 2.2 i 2.3. |
| PRD-LOOP-07 | Trudność jest stała przez całą sesję (wybrana w lobby). |

## 9. HUD

| ID | Element |
|---|---|
| PRD-HUD-01 | Pasek HP lokalnego gracza (lewy dolny róg) z wartością liczbową. |
| PRD-HUD-02 | Numer fali + stan: "FALA 4" w trakcie fali, "PRZERWA 0:37" w przerwie (góra, środek). W trakcie fali licznik pozostałych potworów. |
| PRD-HUD-03 | Trzymany przedmiot: ikona + nazwa + (dla power-upów z czasem) czas działania (prawy dolny róg). Pusty slot = "nic". |
| PRD-HUD-04 | Poziom broni (np. "BROŃ LV 2") obok HP, a obok licznik amunicji `18 / 30` (migający na czerwono przy 5 i mniej). |
| PRD-HUD-11 | **Przeładunek jako kółko wokół postaci**: w trakcie przeładunku wokół własnej postaci (środek ekranu) rysowany jest **pierścień o promieniu ok. 14 px świata, wypełniający się zgodnie z ruchem wskazówek zegara od godziny 12** przez 1.5 s, w kolorze kości, grubość 2 px. Pierścień jest **półprzezroczysty (krycie ok. 0.45; u sojusznika 0.3) i rysowany klockami 1-2 px po okręgu, nie gładką krzywą** - ma siedzieć w tle, a nie wybijać się na pierwszy plan (poprawka po teście 2026-11-05). Po domknięciu pierścień błyska raz i znika. Bez napisu. Wokół sojusznika w trakcie przeładunku ten sam pierścień, cieńszy (1 px) i w jego kolorze. Pierścień rysowany w warstwie świata. |
| PRD-HUD-10 | **Pasek ULTIMATE w lewym górnym rogu, w stylu paska super z bijatyk 16-bit** (R47): poziomy, długi (ok. 1/3 szerokości ekranu), gruby (10-12 px ekranu), z ikoną 32 x 32 wybranego ultimate po lewej, podzielony na **3 segmenty z wyraźnymi przerwami**, każdy wypełnia się od lewej; wypełniony segment świeci i ma animowany "połysk" przesuwający się co 2 s; pełny pasek pulsuje i obok pojawia się napis `ULTI GOTOWE [F]` w stylu bitmapowym. Pod paskiem licznik progu `I / II / III` rzymskimi. Pasek HP i broń zostają na dole (HUD-01, HUD-04). Kropka progu nad sojusznikami bez zmian (`08-ULTIMATE.md`, ULT-HUD). |
| PRD-HUD-05 | Nad każdym graczem: nick w jego kolorze i mały pasek HP. Nad powalonym: ikona i licznik do śmierci. W trybie obserwatora nad śledzonym sojusznikiem dodatkowo mała ikona oka. |
| PRD-HUD-06 | Nad działkami i platformami: mały pasek pozostałego czasu. |
| PRD-HUD-07 | Strzałki na krawędzi ekranu wskazujące sojuszników poza ekranem (kolor gracza). **Do powalonego sojusznika strzałka jest zawsze**, a przy grocie liczba sekund do jego śmierci - żeby dało się ocenić, czy zdążysz. |
| PRD-HUD-08 | Celownik pod kursorem. Kursor systemowy ukryty nad canvasem. |
| PRD-HUD-09 | Podpowiedź kontekstowa przy przedmiocie w zasięgu: "[E] podnieś: Kawałek ściany". **Przedmiot, który zostanie podniesiony po `E` (najbliższy w zasięgu), jest podświetlony**: jasny 1-px obrys sprite'a pulsujący 2 razy na sekundę plus lekkie uniesienie o 1 px. Podświetlony jest dokładnie jeden przedmiot, ten sam, który wybierze serwer (ta sama reguła: najbliższy środkowi gracza w promieniu podnoszenia, dla postawionej ściany odległość do najbliższego kafelka). Gdy w zasięgu nic nie ma, nic nie świeci i podpowiedzi nie ma. |
| PRD-HUD-12 | **Numer wersji widoczny w grze**: prawy górny róg, mały i przygaszony, ta sama wartość co w `/healthz`. Źródłem jest tag wdrożenia (`v*`), bo tylko otagowane wersje idą na produkcję; `APP_VERSION` może nadpisać. Bez wersji w HUD nie da się powiedzieć, w co się właśnie grało. |

## 9b. Efekty wizualne (feedback trafień)

Każde zdarzenie, które zmienia stan walki, musi być widoczne bez patrzenia na HUD. Efekty są czysto kliencie (z eventów `hit`, `mobDeath`, `explode`, `shot`), nie wpływają na symulację.

| ID | Zdarzenie | Efekt (obowiązkowy w MVP) |
|---|---|---|
| PRD-FX-01 | **Pocisk trafia potwora** (P0, po teście 2026-11-05 nadal niewidoczne) | Musi być widoczne z drugiego końca ekranu, cztery rzeczy naraz: (1) potwór **błyska na biało** przez 3 klatki (ok. 100 ms), cały sprite zalany bielą, nie tylko rozjaśniony; (2) **odrzut**: sprite potwora przesuwa się o 2 px w kierunku lotu pocisku i wraca w 0.1 s; (3) **krew**: 6-8 pikseli w kolorze krwi wylatuje stożkiem w kierunku lotu pocisku, lecą 0.3 s, na ziemi zostaje plamka (PRD-MAP-09); (4) **liczba obrażeń** nad potworem przez 0.4 s, unosi się o 6 px, kolor kości. Pocisk gaśnie 1-klatkową iskrą (`spark`). Dodatkowo **hit marker na celowniku**: 4 ramiona celownika rozchodzą się o 2 px na 0.1 s przy każdym trafieniu, żeby strzelec czuł trafienie bez patrzenia na potwora. Test X1 jest blokujący dla odbioru MVP. |
| PRD-FX-02 | **Pocisk trafia ścianę / obiekt** | Iskra 1-2 klatki i 2-3 odłamki w kolorze obiektu. Ten sam pojedynczy mikroruch 1 px co przy ciosie potwora (FX-08), nie wibracja. |
| PRD-FX-03 | **Pocisk trafia gracza (friendly fire)** | Krótki czerwony błysk sprite'a gracza, u trafionego winieta ekranu na 0.2 s, w HUD komunikat `{nick} trafił cię` na 1 s. |
| PRD-FX-04 | **Wybuch miny** | Sekwencja 0.5 s: jasny błysk (1 klatka pełny okrąg w promieniu rażenia), potem rozszerzający się pierścień ognia z pomarańczowego w ciemnoszary (4-6 klatek), 8-12 odłamków rozlatujących się promieniście, 2-3 kłęby dymu unoszące się 1 s. **Wstrząs kamery** 0.2 s o amplitudzie 2 px (mniejszy, im dalej od wybuchu, zero powyżej 12 kafelków). Na ziemi zostaje **ślad wypalenia** (ciemny okrąg o średnicy promienia rażenia), trwały jak krew, limit 100. Potwory w zasięgu dostają błysk z FX-01. |
| PRD-FX-05 | **Śmierć potwora** | Trup i krew (PRD-MAP-09) plus 4-6 odłamków ciała przez 0.3 s. |
| PRD-FX-06 | **Strzał z karabinu, muzzle flash** (obowiązkowy w MVP) | Przy każdym strzale na końcu lufy (ok. 9 px od środka gracza w kierunku `angle`) rysowany sprite `muzzle_0` (1 klatka) i `muzzle_1` (2. klatka, mniejszy), obrócony razem z graczem, zawsze nad sprite'em gracza. Jasnożółty rdzeń, pomarańczowa obwódka. Do tego: 1-px odrzut sprite'a gracza wstecz, łuska (1 piksel koloru mosiądzu) wyrzucana prostopadle do lufy, 0.3 s, zostaje na ziemi 2 s. Flash widoczny też u sojuszników i działek (działko: ten sam sprite). |
| PRD-FX-08 | **Niszczenie ściany / obiektu** | Obiekt nie znika z pełnego stanu. Przechodzi przez **4 stany zużycia** wg HP: 100-75% bez zmian; 75-50% wyraźne pęknięcia przez całą płytę i **rogi lekko zaokrąglone** (sprite `wall_dmg_1`); 50-25% sieć głębokich pęknięć, **rogi zaokrąglone mocno (promień ok. 4 px) i wykruszone**, ubytki na bokach, widać pod spodem ziemię (`wall_dmg_2`); 25-0% dziury na wylot, **rogi zaokrąglone do ok. 6 px, krawędzie poszarpane**, kafelek wygląda jak nadgryziony głaz (`wall_dmg_3`). Zasada R48: im bardziej zniszczony, tym bardziej obły i mniejszy obrys, pęknięć ma być dużo i mają być czytelne z odległości (czarne linie 1 px z ciemnym cieniem obok). Przy każdym przejściu stanu z obiektu **odpadają 3-5 odłamków** w kolorze obiektu, lecą 0.3 s i zostają na ziemi jako gruz (trwały jak krew, limit 400). Przy każdym ciosie potwora obiekt wykonuje **jeden mikroruch: 1 px w bok i z powrotem** (2 klatki: przesunięcie o 1 px w kierunku od potwora, w następnej klatce powrót, koniec), bez wibracji, bez powtórzeń, bez losowego trzęsienia (R51, po teście: ciągłe drganie było męczące). Kolejny cios w trakcie tych 2 klatek nie dokłada ruchu. Do tego 1-2 pyłki. Gdy HP spada do 0: **animacja zawalenia 0.4 s** (3 klatki `wall_collapse_0..2`: obiekt opada i rozsypuje się), 8-12 odłamków promieniście, obłok pyłu 0.6 s, i dopiero po niej obiekt znika; na jego kafelkach zostaje **rumowisko** (`rubble`, bezkolizyjne, trwałe, limit 200). Kolizja i pathfinding zwalniają kafelek w chwili HP = 0, nie po animacji. Dotyczy kawałka ściany, głazu, kolców i działka (działko: iskry zamiast pyłu, zostaje spalony wrak). Stan zużycia jest w snapshocie (`hp`), więc wszyscy gracze widzą to samo. |
| PRD-FX-09 | **Gracz obrywa** (zgloszone z gry 2026-11-05: nie dzialo sie NIC — `damagePlayer` wysylal zdarzenie wylacznie dla friendly fire, wiec cios potwora i mina nie dawaly ani blysku, ani dzwieku) | Kazde obrazenie gracza, niezaleznie od zrodla (potwor, pocisk potwora, mina, kolce, friendly fire), wysyla zdarzenie `hurt` i musi byc widoczne: **czerwony blysk sylwetki** (takze u sojusznikow, zeby druzyna widziala, kto obrywa), **winieta** u trafionego, **wstrzas kamery** skalowany obrazeniami (1-4 px, wylaczony przy `prefers-reduced-motion`), **migniecie paska HP** i liczba utraconych HP obok niego (kolejne ciosy w ciagu 0.9 s sumuja sie w jednej liczbie). **Ponizej 30% HP**: staly, pulsujacy czerwony obrys ekranu az do wyleczenia. Dzwiek osobny dla "oberwales ty" i "oberwal sojusznik", przy niskim HP wariant alarmowy; wlasny bez tlumienia odlegloscia. Friendly fire zachowuje dodatkowo komunikat `{nick} trafil cie` (FX-03), ale efekt i dzwiek nie moga sie dublowac. |
| PRD-FX-07 | Zasada ogólna | Efekty nie mogą zasłaniać stanu gry: cząsteczki mniejsze niż 3 px, czas życia poniżej 1 s (poza śladami trwałymi), limit 500 cząsteczek na raz, powyżej najstarsze znikają. Przy `prefers-reduced-motion` wstrząs kamery wyłączony. |

Sprite'y do tego (`sprites.js`): `muzzle` (6 x 6, 1 klatka), `spark` (3 x 3), `blood_splat_0/1/2` (plamki na ziemi), `scorch` (32 x 32), `smoke_0/1/2` (8 x 8), `corpse_slime/runner/brute` (16 x 16), `wall_dmg_1/2/3` (kafelek ściany w 3 stanach zużycia, z przezroczystymi ubytkami na krawędziach), `wall_collapse_0/1/2` (zawalenie), `rubble_0/1` (rumowisko), `turret_wreck` (wrak działka). Cząsteczki (krew, odłamki, łuski) to pojedyncze piksele z palety, bez sprite'ów.

## 10. Audio

Poza MVP. Jeśli będzie: proste efekty generowane syntezą (bez plików z sieci), wyciszalne w menu.

## 11. Wydajność i kompatybilność

| ID | Wymóg |
|---|---|
| PRD-PERF-01 | 60 FPS na zintegrowanej grafice laptopa z 2018+ przy 4 graczach, 60 potworach i 200 przedmiotach na mapie. |
| PRD-PERF-02 | Przeglądarki: aktualny Chrome / Edge / Firefox. Safari mile widziane, nie wymagane. |
| PRD-PERF-03 | Latencja LAN: ruch własnej postaci odczuwalnie natychmiastowy (predykcja lokalna). Ruch innych graczy płynny (interpolacja). Szczegóły w `04-TECH-ARCH.md`. |
| PRD-PERF-04 | Dołączenie do hosta w czasie poniżej 5 s od wpisania adresu. |
| PRD-PERF-05 | **Strzał odczuwalnie natychmiastowy** (V3-F-01, 2026-11-06): pocisk pojawia się u strzelca w tym samym kroku, w którym nacisnął, nie po odpowiedzi serwera. Lokalny pocisk jest **wyłącznie obrazem** - nie zadaje obrażeń, nie zatrzymuje potworów, ginie na ścianie, po zasięgu albo gdy nadejdzie prawdziwy. Przekazanie pałeczki jest odroczone o opóźnienie bufora interpolacji, bo prawdziwy pocisk staje się widoczny dopiero wtedy; inaczej między jednym a drugim powstawałaby dziura. **Czego lokalny pocisk nie zgaduje**: losowego rozrzutu (serwer losuje z własnego RNG) i zakrętu samonaprowadzania. Trafienia i krew przychodzą nadal z serwera - autorytatywna pozostaje symulacja serwerowa, zgodnie z PRD-CON-04. |

## 12. Kryteria akceptacji MVP (checklista)

- [ ] 4 osoby na 4 laptopach w jednym WLAN bez internetu grają 10 minut bez rozłączenia.
- [ ] Całość kopiuje się jednym katalogiem; na nowym komputerze uruchamia się w mniej niż 2 minuty.
- [ ] Postać reaguje na WSAD, obraca się do myszy, strzela spacją serią; po 30 strzałach przeładunek 1.5 s z paskiem na środku ekranu.
- [ ] Przechodzi min. 5 fal; każda kolejna wyraźnie trudniejsza; przerwy wyraźnie dłuższe.
- [ ] Friendly fire: trafienie sojusznika zabiera 10% obrażeń (sprawdzalne liczbowo).
- [ ] Potwory dropią przedmioty obu kategorii; da się podnieść, odstawić, rzucić.
- [ ] Postawiona ściana blokuje potwory i pociski, ale potwory ją powoli niszczą (ściana bez obrony pada w ciągu fali).
- [ ] Działko strzela do potworów przez swój czas i znika.
- [ ] Każde trafienie potwora widać (błysk, krew, liczba), wybuch miny widać z drugiego końca ekranu (błysk, pierścień, wstrząs, ślad).
- [ ] Ściana pęka i kruszy się po bokach w 4 stanach, zawala się z animacją i zostawia rumowisko, zamiast znikać w jednej klatce.
- [ ] 4 poziomy trudności dają mierzalnie inne liczby (HP potworów, ilość).
- [ ] Kropelki ładują pasek wszystkim; `F` od progu I odpala wybrany ultimate z siłą progu; pasek użytego zeruje się, innych nie.
- [ ] Pociski są szybkie (600 px/s), potwory nie idą idealnie po linii do gracza.
- [ ] Game over po powaleniu wszystkich. Ekran wyniku.

Szczegółowe scenariusze testów: `05-TEST-PLAN.md`.
