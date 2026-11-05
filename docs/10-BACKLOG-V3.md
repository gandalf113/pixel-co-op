# 10 - Backlog V3

Wersja: 0.1 (2026-11-05). Zgłoszone przez właściciela produktu (Piotr) po hostowaniu gry na
`obrzyn.online`. Punkty A-L to oryginalne zgłoszenie; tutaj są rozpisane na wymagania z ID,
z oznaczeniem, co już jest w kodzie, a co trzeba dopisać.

Stan kodu, do którego to się odnosi: 3 z 6 typów potworów, 3 z 9 przedmiotów, brak
startowych ruin (PRD-MAP-10), brak dźwięku, brak awansu poziomu broni, brak listy pokojów.

Kolejność realizacji (uzgodniona): **L + tanie J** → **B** → **C** → **D/E** → **A** → **I** → **G/H** → **K** → **F**.

---

## A. Nowe potwory, rozmiary 32 x 32 i 64 x 64

Render (`drawCentered`) i kolizje (`radiusPx`) są rozmiarowo obojętne, więc większy sprite to
głównie praca artystyczna plus `radiusPx`, rozpychanie (`separate`) i clamp przy spawnie.
Realna robota jest w zachowaniach i w snapshocie.

| ID | Wymóg |
|---|---|
| V3-A-01 | **Wsparcie dla potworów 32 x 32 i 64 x 64**: sprite per typ w dwóch nowych rozmiarach, `radiusPx` z sprite'a, trup i plama krwi skalowane do rozmiaru, rozpychanie i clamp spawnu liczone z faktycznego promienia. Duży potwór nie może utknąć w przejściu 1-kafelkowym: pathfinding musi znać jego szerokość (kafelek przechodni tylko, gdy przechodnie są też sąsiednie w promieniu potwora). |
| V3-A-02 | **Pocisk wroga jako byt świata.** Dziś `combat.js` zna wyłącznie pociski gracza i działka (`fromTurret`). Potrzebna jest osobna lista `mobBullets` w snapshocie: trafia graczy (pełne obrażenia, nie 10%), nie trafia potworów, zatrzymuje się na hard objectach, nie da się jej zestrzelić (MOB-04). To warunek wstępny dla V3-A-03 i V3-A-04. |
| V3-A-03 | **Plujka** (MOB-04, już w `03-WAVES-DIFFICULTY.md`, nigdy nie zaimplementowana): trzyma dystans 5 kafelków, pocisk 250 px/s, zasięg 7 kafelków, co 2 s, 6 obrażeń. Pocisk nie przechodzi przez ściany. |
| V3-A-04 | **Granatnik**: jak Plujka, ale pocisk leci wolniej (ok. 180 px/s) i **wybucha w miejscu trafienia** (AoE promień 1.5 kafelka, pełne obrażenia w centrum, 50% na krawędzi). Wybuch rani też hard objecty graczy. Cień / marker miejsca upadku przez ostatnie 0.3 s lotu, żeby dało się odejść. |
| V3-A-05 | **Skradający się**: cykl `stealth` (4-6 s) / `jawny` (3-4 s). W trybie stealth porusza się **stycznie** do gracza (prostopadle do kierunku na gracza, okrążając go), jest **nietykalny** (pociski przelatują, brak błysku trafienia) i rysowany jako półprzezroczysty zarys. Po wyjściu ze stealthu idzie prosto na gracza. Stan musi być w snapshocie (`invul`), bo inaczej gracz strzela w nic bez informacji zwrotnej. Wyjście ze stealthu: wyraźny błysk i sygnał dźwiękowy (C). |
| V3-A-06 | **Tank**: duży (64 x 64), dużo HP (start: 600 na Normalnym), wolny. **Zmienia kolor wraz z utratą HP** (4 progi jak ściany: zdrowy → ciemniejszy → sine plamy → poczerniały). Po śmierci **eksploduje na N runnerów** (start: 6, skalowane trudnością) rozrzuconych promieniście. Potomstwo dolicza się do licznika `mobsLeft` i do warunku końca fali. |
| V3-A-07 | **Ninja**: średni, cykl: `wandering` (1-2 s) → **telegraf** (0.6 s: na ziemi rysowana linia / stożek trajektorii ciosu w kierunku gracza, widoczna dla wszystkich) → **szarża** po dokładnie tej trajektorii z prędkością ok. 10 kafelków/s, obrażenia przy przejściu przez gracza. Trajektoria jest ustalona w chwili telegrafu i **nie śledzi** gracza - uskok ma działać. Stan (`telegraph`, kąt, długość) w snapshocie. Potrzebny jawny kąt potwora w snapshocie: dziś klient zgaduje kąt z różnicy pozycji, co dla potwora stojącego w miejscu nie działa. |
| V3-A-08 | Wagi, koszty, progi fal i liczba kropelek dla pięciu nowych typów w `balance.json`, w tej samej konwencji co istniejące (`cost`, `weight`, `fromWave`, `drop`, `droplets`). |

## B. Obszar gry na całe okno, HUD na planszy

| ID | Wymóg |
|---|---|
| V3-B-01 | **Gra wypełnia okno w pionie** (R52): wewnętrzna rozdzielczość zostaje stała 560 x 315 (16:9), canvas skalowany **ułamkowo** do pełnej wysokości okna z zachowaniem proporcji; w poziomie zostają pasy tylko przy oknie szerszym niż 16:9. `computeScale` przestaje zaokrąglać w dół. Uchyla całkowitą krotność z PRD-MAP-05. Powód: wszyscy gracze widzą **dokładnie to samo** pole gry niezależnie od rozmiaru okna; kosztem jest niecałkowity piksel. |
| V3-B-02 | **Cały HUD leży na planszy.** Canvas HUD pokrywa się co do piksela z prostokątem gry, nic nie rysuje się na pasach. Marginesy HUD liczone od krawędzi planszy, nie okna. |
| V3-B-03 | **Pasek ULTIMATE w stylu Street Fighter Alpha 2** (research niżej): proporcje, ramka, kolor wypełnienia, licznik poziomu, animacja przy pełnym pasku. Dzisiejszy pasek (PRD-HUD-10, R47) ma już 3 segmenty, połysk i pulsowanie - to jest dociągnięcie wyglądu, nie przepisanie. |

### Research: Super Combo Gauge z SFA2 (2026-11-05)

Co jest potwierdzone w źródłach: seria Alpha wprowadziła **trzystopniowy** Super Combo Gauge;
w wersji SNES pasek siedzi **na dole ekranu, pod paskiem energii**, obok Timera i Technical
Points; ładuje się od zadawanych ciosów, specjali **i od obrywania**; **przenosi się między
rundami**, ale nie między walkami; od poziomu 1 wzwyż odblokowuje Custom Combo.

Czego w sieci **nie ma**: ripu HUD-u. Spriters Resource ma dla SNES-owej Alpha 2 tylko
postacie (Ryu, Nash, Dan) i ekran wyboru - 22 assety, zero elementów interfejsu; na forach
potwierdzają, że dla tej wersji zripowano wyłącznie Nasha i Ryu. Czyli: **nie da się
podebrać gotowych pikseli**, trzeba odwzorować ze zrzutu ekranu przy implementacji.

Wnioski dla nas (co faktycznie kopiujemy):
- pasek **poziomy, długi, niski**, z grubą ciemną ramką i jasnym wypełnieniem w gradiencie
  żółć → pomarańcz (mamy już ten gradient);
- **licznik poziomu obok paska** jako duża cyfra / rzymska liczba, która błyska w momencie
  przeskoku progu - u nas dziś jest statyczne `I / II / III`, ma **mrugnąć przy awansie**;
- przy pełnym pasku **cały pasek migocze** zamiast samego napisu;
- zgodność z ULT-06: pasek **nie resetuje się** między falami - to jest dokładnie ta sama
  zasada co "przenosi się między rundami", więc zachowanie mamy już zgodne z pierwowzorem.
- różnica świadoma: u nas pasek jest w **lewym górnym rogu** (R47), nie na dole, bo dół
  zajmuje HP i amunicja.

## C. Proceduralne SFX

| ID | Wymóg |
|---|---|
| V3-C-01 | **Research zrobiony 2026-11-05**, tabela recept niżej. |
| V3-C-02 | **Warstwa dźwięku wpięta w istniejący strumień eventów** (`onEvent` w `main.js`): `shot`, `hit`, `objHit`, `destroyed`, `explode`, `pickup`, `place`, `drop`, `deny`, `ult`, `ultDeny`, `reload`, `down`, `revive`, `death`, `droplet`, `ff`, `expire`. Zero plików audio (PRD-CON-01, TECH-01): wyłącznie Web Audio. |
| V3-C-03 | **Głośność i wyciszenie w menu pauzy** (domyka PRD-CTRL-07, dziś pauza ma tylko "wróć / pełny ekran / wyjdź"). Ustawienie trzymane w `localStorage`. Limit jednoczesnych głosów i odstęp minimalny między tym samym dźwiękiem, żeby seria z karabinu nie zrobiła piły. |
| V3-C-04 | Dźwięk przestrzenny per odległość od kamery (głośność maleje z dystansem, zero powyżej ok. 20 kafelków), żeby fala potworów z drugiego końca mapy nie zagłuszała własnego karabinu. |
| V3-C-05 | Muzyka **poza zakresem** tego etapu (zostaje w `07-BACKLOG-V2.md` B3). |

### Research: recepty syntezy (2026-11-05)

Zasady ogólne, zanim cokolwiek zabrzmi:
- **Jeden `AudioContext`, tworzony przy pierwszym geście użytkownika** (polityka autoplay
  blokuje wcześniejszy start) i `resume()` po powrocie z tła.
- Łańcuch: źródło → gain (obwiednia) → ewentualny filtr → **master gain** →
  `DynamicsCompressorNode` jako limiter → wyjście. Bez limitera seria z karabinu plus wybuch
  przesterują miks.
- **Limit głosów** (ok. 24) i **minimalny odstęp** między tym samym dźwiękiem (ok. 30 ms):
  7 strzałów/s x 4 graczy to inaczej piła tarczowa, a nie karabin.
- Bufor szumu generujemy **raz** i odtwarzamy z losowym offsetem i `playbackRate`; tworzenie
  bufora per strzał to zbędny GC.
- Każdy dźwięk dostaje **losowy detune ±5-8%** - bez tego powtórzenia brzmią mechanicznie.
- Głośność maleje z odległością od kamery, zero powyżej ok. 20 kafelków (V3-C-04).

| Zdarzenie | Recepta |
|---|---|
| `shot` (karabin) | biały szum 10-15 ms z wykładniczą obwiednią (`exp(-t/0.01)`) + square 220 → 60 Hz w 40 ms, lowpass 3.5 kHz. Krótki atak = "punch", bez ogona |
| `shot` (działko) | jak wyżej, ale lowpass 1.8 kHz i pitch niżej - ma się odróżniać od broni gracza |
| `hit` (potwór) | szum 20-25 ms przez bandpass ok. 900 Hz + sine 180 → 90 Hz; mokry, mięsisty |
| `objHit` (ściana) | szum 8-12 ms przez highpass 2 kHz + klik 2 ms; sucho, kamiennie |
| `destroyed` | brown noise 0.4 s, lowpass 800 Hz z opadającym sweepem do 200 Hz, + trzask na starcie |
| `explode` (mina, rakieta) | brown noise 0.6-0.8 s, gain ok. 0.4, lowpass 800 → 200 Hz + sine 60 → 30 Hz "thump" pod spodem. To jest wzorzec wprost z dokumentacji melonjs |
| `pickup` | sine 440 → 880 Hz w 80 ms, krótki fade |
| `place` | square 200 Hz, 40 ms + klik; twardo, "postawione" |
| `deny` | dwa impulsy square 160 Hz po 40 ms z 60 ms przerwy |
| `reload` | dwa kliki szumowe (8 ms) w odstępie ok. 120 ms, drugi niżej |
| `droplet` | triangle 1200 → 1600 Hz, 60 ms, lekka modulacja FM (indeks niski) - ma być "cyfrowo", inaczej niż reszta |
| `ult` | FM sweep 100 → 1200 Hz w 0.3 s + warstwa szumu, głośniej dla progu III |
| `down` / `death` | sine 300 → 80 Hz w 0.5 s, długi ogon |
| `revive` | trzy tony w górę (arpeggio) po 70 ms |
| `ff` (trafiony przez sojusznika) | ten sam dźwięk co `hit`, ale z krótkim, wyraźnym tonem ostrzegawczym - gracz ma wiedzieć, że to był swój |

## D. Brakujące dropy

Zaimplementowane są 3 z 9 przedmiotów z `02-ITEMS.md`. Do dopisania, z wartościami wprost z tamtych tabel:

| ID | Przedmiot | Uwagi do implementacji |
|---|---|---|
| V3-D-01 | **Głaz** (ITM-H-02), 1 x 1, 400 HP, rzut 30 | Hard object bez obrotu; reużywa całą ścieżkę ściany. |
| V3-D-02 | **Kolce** (ITM-H-03), 1 x 1, 80 HP, rzut 20 + krwawienie | **Nie blokują** ruchu ani pocisków: nowa kategoria kolizji (dziś `buildGrid` zna tylko solid / nie-solid). 8 obr./0.5 s potworom na kafelku, graczom 10%. Potwór stojący na kolcach uderza w nie co drugi atak. |
| V3-D-03 | **Działko 60 s / 90 s** (ITM-P-02, ITM-P-03) | Dziś `turret30` jest zaszyte po nazwie w 6 miejscach (`blocking`, `activate`, `updateItems`, render, HUD, `fxSprites`). Najpierw refaktor na `category`/`behavior` w `balance.json`, potem trzy warianty czasu. |
| V3-D-04 | **Platforma lecząca 30 / 60 / 90 s** (ITM-P-04..06) | 3 x 3 kafelki, +5 HP / 0.5 s, powalony na niej wstaje po 2 s bez sojusznika, nie blokuje, potwory ignorują. Pasek czasu nad nią (PRD-HUD-06). |
| V3-D-05 | **Pułapka-klatka** (ITM-P-08) | Łapie pierwszego potwora na kafelku, 8 s unieruchomienia, +50% przyjmowanych obrażeń, na bossa nie działa. |
| V3-D-06 | **Boost poziomu broni** (ITM-P-09) | Patrz punkt I - zmienia się jego działanie. |
| V3-D-07 | Wagi dropu i limity aktywnych z `02-ITEMS.md` sekcja 5 do `balance.json`; ghost i podpowiedzi HUD mają działać dla każdego nowego przedmiotu bez wyjątków w kodzie. |

## E. Czego jeszcze brakuje wobec PRD (audyt)

| ID | Luka | Źródło |
|---|---|---|
| V3-E-01 | **Startowe ruiny nie istnieją**: ani linii kodu, ani wpisu w `balance.json`. 7 kawałków ściany w pierścieniu 4-9 kafelków od spawnu, losowe orientacje i stany zniszczenia, z seedu gry. Po R53 (patrz J) ruiny są **nie do podniesienia** - zostają jako osłona. | PRD-MAP-10, R50 |
| V3-E-02 | **Rój** (MOB-05): spawnuje się trójkami, 10 HP każdy, od fali 8. | MOB-05 |
| V3-E-03 | **Boss** (MOB-06) co 5 fal: 1200 HP, atak obszarowy, wzywa ślimaki, pasek HP na górze ekranu, gwarantowany drop x3. Poza MVP decyzją R14, ale to jedyna rzecz, która domyka pętlę "co 5 fal". | MOB-06, B2 |
| V3-E-04 | **Poziom broni nie ma jak urosnąć**: `rifleStats` skaluje obrażenia, magazynek i przeładunek, ale nie ma itemu podnoszącego poziom, a przebijanie na lv3 i potrójny strzał na lv5 nie są zaimplementowane (istnieją tylko w Szale). Rozstrzyga to punkt I. | PRD-PLR-04 |
| V3-E-05 | Pasek czasu nad obiektami aktywnymi jest tylko dla działka (platform nie ma). | PRD-HUD-06 |
| V3-E-06 | **Obrażenia w przerwie nie mogą zabić**: `damagePlayer` w fazie `break` przycina HP do minimum 1. Zachowanie sensowne, ale nieopisane - dopisać do PRD albo usunąć. | brak |
| V3-E-07 | Licznik `mobsLeft` liczy kolejkę spawnu plus żywe potwory; po V3-A-06 (tank dzielący się na runnery) trzeba doliczyć potomstwo, inaczej licznik skacze w górę w trakcie fali. | PRD-HUD-02 |

## F. Sieć - quick winy

Stan: serwer autorytatywny 30 Hz, snapshoty 20 Hz **pełne, w JSON**, predykcja ruchu własnego z rekoncyliacją, interpolacja innych z opóźnieniem 100 ms, brak lag compensation.

| ID | Quick win | Dlaczego |
|---|---|---|
| V3-F-01 | **Predykcja strzału na kliencie**: pocisk rodzi się dopiero po odpowiedzi serwera, więc przez internet strzał czuć z opóźnieniem RTT. Rysować lokalny pocisk natychmiast i porzucać go, gdy przyjdzie prawdziwy. Najtańszy, najbardziej odczuwalny. |
| V3-F-02 | **Snapshot delta + binarka**: przy 60 potworach i 200 przedmiotach pełny JSON to kilka kB dwadzieścia razy na sekundę per gracz. Delta względem ostatnio potwierdzonego snapshotu plus kodowanie binarne to 5-10x mniej pasma. T3 w `06-OPEN-QUESTIONS.md` przewidywał ten krok. |
| V3-F-03 | **Area of interest**: nie wysyłać bytów dalszych niż ok. 1.5 ekranu (poza graczami i bossem). |
| V3-F-04 | **Adaptacyjny bufor interpolacji**: dziś stałe 100 ms. Dostroić do zmierzonego jitteru (60-150 ms), żeby w LAN-ie było ostrzej, a przez internet nie szarpało. |
| V3-F-05 | **Lag compensation dla pocisków**: trafienia liczone w pozycjach serwerowych, a gracz widzi stan sprzed 100 ms, więc musi wyprzedzać cel. Cofanie pozycji potworów o RTT/2 + bufor przy sprawdzaniu trafienia. Najdroższy punkt tej listy; robić dopiero, jeśli F-01..F-04 nie wystarczą. |
| V3-F-06 | `perMessageDeflate` w `ws` jest domyślnie wyłączony - włączyć po pomiarze (kompresja vs. CPU). |
| V3-F-07 | **Mierzyć, nie zgadywać**: RTT i rozmiar snapshotu w telemetrii i w overlayu debug (`~`), żeby każdy z powyższych punktów dało się ocenić liczbą. Wejście w F zaczyna się od tego punktu. |

## G. Rozkład trupów

| ID | Wymóg |
|---|---|
| V3-G-01 | Trup dostaje **znacznik fali** (dziś `gore.corpses` to `[typ, x, y, kąt]` bez czasu). Stadia: świeży → rozdęty / gnijący → kościotrup → znika. **Maks. 4 fale życia** trupa. Przejścia na granicy fali, nie w jej trakcie. |
| V3-G-02 | Sprite'y stadiów per typ potwora (dziś trup to przyciemniony sprite żywego, robiony filtrem w `render.js`). Kościotrup wspólny dla sylwetek o zbliżonym rozmiarze, żeby nie mnożyć grafiki bez potrzeby. |
| V3-G-03 | Limit 300 trupów zostaje (PRD-MAP-09); rozkład działa **po stronie klienta** z numeru fali w snapshocie, więc nie kosztuje pasma. |

## H. Krew: kałuże i ślady butów

| ID | Wymóg |
|---|---|
| V3-H-01 | **Łączenie plam w kałuże**: plamy bliżej niż ok. 6 px łączą się w jedną większą (maks. 3 stopnie wielkości), zamiast leżeć jako stos osobnych sprite'ów. Efekt: pole bitwy wygląda na coraz bardziej zarżnięte, a liczba rysowanych obiektów **maleje**. |
| V3-H-02 | **Ślady butów**: postać (gracz lub potwór), która przejdzie przez świeżą kałużę, zostawia ślady w kolorze krwi przez ok. 10-15 kroków, bladnące z każdym krokiem. Ślady są **trwałe** (jak krew), wspólny limit z plamami. |
| V3-H-03 | Całość **klientowa**, jak reszta gore. Konsekwencja: kałuże i ślady mogą się nieznacznie różnić między graczami. Przyjęte świadomie - to dekoracja, a wersja serwerowa kosztowałaby pasmo przy zerowym wpływie na rozgrywkę. |

## I. WEAPON LEVEL BOOST do końca

| ID | Wymóg |
|---|---|
| V3-I-01 | Podniesienie boostu (ITM-P-09, `R` na sobie) **zawsze podnosi poziom broni** (+1, max 5: obrażenia +30%, magazynek +10, przeładunek -0.2 s - jak dziś w `rifleStats`) **i jednocześnie losuje jeden z trzech modyfikatorów**. Modyfikator zastępuje poprzedni (nie kumulują się). |
| V3-I-02 | **Wachlarz**: 3 pociski naraz, rozrzut ok. 12 stopni, obrażenia pojedynczego pocisku x0.6. |
| V3-I-03 | **Samonaprowadzanie**: pojedynczy pocisk jak dziś, ale w locie zakręca do najbliższego potwora w stożku 25 stopni przed sobą, maks. ok. 180 stopni/s. Pocisk ma dziś prostą trajektorię z raycastem - dochodzi krok sterowania przed sprawdzeniem trafienia. |
| V3-I-04 | **Gwoździarka**: ekstremalnie szybki pocisk (ok. 900 px/s), rysowany jako cienka kreska 4-6 px, bardzo krótki odstęp między strzałami (ok. 0.05 s), obrażenia pojedynczego pocisku mocno w dół, większy rozrzut. |
| V3-I-05 | Modyfikator widoczny w HUD obok `BROŃ LV n` (ikona + nazwa) i w snapshocie, żeby sojusznicy widzieli, kto czym strzela. Przy podniesieniu: wyraźny błysk, napis i dźwięk (C). |
| V3-I-06 | **Uchyla PRD-PLR-04** w części "na poziomie 3+ pocisk przebija 1 cel, na 5 strzał potrójny" - to jest teraz domena modyfikatorów, nie poziomu. | 

## J. Drobnostki (część z nich zmienia zatwierdzone decyzje)

| ID | Wymóg | Status |
|---|---|---|
| V3-J-01 | **Numer wersji widoczny w grze** (prawy górny róg HUD, mały, przygaszony) i w `/healthz`. Źródłem jest **tag wdrożenia**: produkcja idzie wyłącznie z tagów `v*`, więc `package.json` musi być bumpowany w commicie, który dostaje tag, a `APP_VERSION` może to nadpisać. | nowe |
| V3-J-02 | **Raz postawione zostaje postawione** (R53): obiekt w stanie `POSTAWIONY` / `AKTYWNY` nie da się podnieść - stoi do zniszczenia. Dotyczy ścian graczy, startowych ruin, muru z ultimate, działek, min i kolców. Podnieść da się wyłącznie to, co leży `NA_ZIEMI`. **Kasuje ITM-GEN-08 i R27**, modyfikuje R50. Znika też podświetlanie postawionych ścian i podpowiedź `[E] podnieś` nad nimi. | zmiana decyzji |
| V3-J-03 | **Nowa logika klawiszy** (R54): `E` podnosi, a z przedmiotem w rękach **używa** (hard object: stawia; power-up: aktywuje). `R` **odkłada** na ziemię. Obrót ściany: **kółko myszy albo `Q`**. `R` z pustymi rękami nadal przeładowuje. Powód: odkładanie bez użycia jest rzadsze niż użycie. **Przepisuje sekcję 3 w `02-ITEMS.md` i PRD-CTRL-04/05 (uchyla R1).** | zmiana decyzji |
| V3-J-04 | **Lewy przycisk myszy = spacja** (strzał / rzut). Kolizja z R49 (dziś LPM/PPM przełączają obserwowanego): po śmierci przełączanie zostaje na `A` / `D` i PPM. | zmiana decyzji |
| V3-J-05 | **Łuski żyją dłużej** (dziś znikają po 2.3 s - za szybko). Nowy czas: ok. 8 s, z bladnięciem na końcu, wspólny limit podniesiony. | nowe |
| V3-J-06 | **Pierścień przeładowania bardziej przezroczysty i bardziej pixelowy**: dziś gładki `arc` w pełnym kryciu wybija się na pierwszy plan. Ma być rysowany klockami 1-2 px po okręgu, z kryciem ok. 0.45 (własny) i 0.3 (sojusznika). Modyfikuje PRD-HUD-11. | zmiana |
| V3-J-07 | **Sprite powalonego sojusznika**: leży i **macha ręką** (2 klatki), zamiast dzisiejszego odbarwionego sprite'a stojącego. | nowe |
| V3-J-08 | **Strzałka do powalonego zawsze**, z **sekundami do śmierci** przy grocie, w kolorze gracza. Dziś strzałki pokazują tylko kierunek i tylko dla sojuszników poza ekranem, bez czasu. | nowe |
| V3-J-09 | **Licznik śmierci pauzuje się w trakcie podnoszenia**: dziś `deathLeft` tyka także wtedy, gdy sojusznik stoi obok i trwa revive (`players.js`, `tickDowned`). Modyfikuje PRD-PLR-07. | błąd |

## K. Lista pokojów i nowy flow wejścia

Dziś: formularz nick + kod pokoju, brak jakiegokolwiek endpointu listującego; pokoje żyją w pamięci `Rooms`.

| ID | Wymóg |
|---|---|
| V3-K-01 | **`GET /api/rooms`**: kod, liczba graczy, `maxPlayers`, czy trwa mecz, numer fali, wiek pokoju. Bez nicków i bez czegokolwiek, co identyfikuje gracza. Tylko w trybie `ROOMS=1`; w LAN endpoint nie istnieje. |
| V3-K-02 | **Flow wejścia**: (1) ekran nicku - **tylko nick**; (2) ekran główny: lista pokojów (z informacją "mecz w toku" i "n / 4 graczy"), przycisk **Nowy pokój**, link do **leaderboardu**, przycisk **Sterowanie**. Wejście po linku `?r=KOD` dalej wchodzi prosto do pokoju. |
| V3-K-03 | **Pokój bez graczy jest DEAD**: znika z listy **natychmiast** po wyjściu ostatniego gracza i nie da się do niego dołączyć. Fizyczne skasowanie zostaje po 90 s, bo inaczej odświeżenie karty (30 s grace na reconnect) kasowałoby pokój z ludźmi w środku. |
| V3-K-04 | **Ekran "Sterowanie"**: ładny wizualnie obrazek klawiatury i myszy z opisem każdej akcji (pixel-art, generowany z kodu jak reszta grafiki). Aktualizowany razem z R54. Dostępny też z menu pauzy. |
| V3-K-05 | Lista pokojów odświeża się co ok. 5 s, gdy ekran jest otwarty, i nigdy w trakcie gry. |

## L. Magnes kropelek za mocny

| ID | Wymóg |
|---|---|
| V3-L-01 | **Osłabienie magnesu** (R55): `magnetTiles` 14 → **9**, `magnetBoostPx` 700 → **380**. Wartość kropelki zostaje **5** - tempo ładowania paska się nie zmienia, zmienia się tylko to, że kropelki trzeba zebrać, zamiast dostawać je z drugiego końca ekranu. Jeśli po pomiarze pasek nadal rośnie za szybko, drugim krokiem jest wartość kropelki 5 → 4. Modyfikuje R44 i `08-ULTIMATE.md` sekcja 1 (ULT-07). |

---

## Decyzje podjęte przy tym backlogu

| # | Pytanie | Decyzja | Data |
|---|---|---|---|
| R52 | Skalowanie widoku | Skala **ułamkowa**, stałe 560 x 315, gra wypełnia wysokość okna; HUD wyłącznie na planszy. Uchyla całkowitą krotność z PRD-MAP-05 (V3-B-01) | 2026-11-05 |
| R53 | Podnoszenie postawionych obiektów | **Nie da się**. Postawione / aktywne stoi do zniszczenia, dotyczy też ruin startowych i muru z ultimate. Kasuje ITM-GEN-08 i R27 (V3-J-02) | 2026-11-05 |
| R54 | Logika klawiszy | `E` podnosi i **używa**, `R` **odkłada**, obrót ściany kółkiem myszy lub `Q`, LPM = spacja. Uchyla R1 (V3-J-03, V3-J-04) | 2026-11-05 |
| R55 | Magnes kropelek | Zasięg 9 kafelków, boost 380 px/s, wartość kropelki bez zmian (5). Modyfikuje R44 (V3-L-01) | 2026-11-05 |
| R56 | Modyfikatory broni | Boost broni podnosi poziom **i** losuje jeden z trzech modyfikatorów (wachlarz / samonaprowadzanie / gwoździarka). Uchyla część PRD-PLR-04 o przebijaniu na lv3 i potrójnym strzale na lv5 (V3-I-01, V3-I-06) | 2026-11-05 |
