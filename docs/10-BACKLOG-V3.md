# 10 - Backlog V3

Wersja: 0.1 (2026-11-05). Zgłoszone przez właściciela produktu (Piotr) po hostowaniu gry na
`obrzyn.online`. Punkty A-L to oryginalne zgłoszenie; tutaj są rozpisane na wymagania z ID,
z oznaczeniem, co już jest w kodzie, a co trzeba dopisać.

Stan kodu, do którego to się odnosi: 3 z 6 typów potworów, 3 z 9 przedmiotów, brak
startowych ruin (PRD-MAP-10), brak dźwięku, brak awansu poziomu broni, brak listy pokojów.

Kolejność realizacji: **L + tanie J** → **B** → **C** → **D/E** → **A** (zrobione) → **O (PILNE, sieć)** → **I** → **G/H** → **K** → reszta **F**.

---

## O. PILNE: gra niegrywalna przez internet powyzej ~30 potworow

Zgloszenie 2026-11-06: gracz laczacy sie z Olsztyna od fali 4 w gore ma lagi, cofanie ekranu
i nagle "przyspieszenia akcji" (klient nadrabia zalegle snapshoty). Im wiecej potworow, tym
gorzej. Wlasciciel na tym samym LAN co serwer nie odczuwa niczego.

### Pomiar (2026-11-06, nie szacunek)
Snapshot przy 4 graczach, 60 potworach, 120 dropach na ziemi i 20 pociskach:

```
SNAPSHOT: 23 221 B    mobs 2 788 B (60)    items 18 406 B (127)    players 1 125 B
na gracza:  454 kB/s = 3,72 Mbit/s     4 graczy: 14,9 Mbit/s uploadu z domowego lacza
```

**79% ruchu to przedmioty, a 120 z nich to nieruchome dropy na ziemi wysylane 20 razy na
sekunde bez zadnej zmiany.** Potwory, czyli to, co faktycznie sie rusza, to 12%. Domowy upload
nie ma 15 Mbit/s do oddania, wiec rosnie kolejka, pakiety przychodza paczkami, bufor
interpolacji raz gloduje, raz dostaje wszystko naraz — stad cofanie i nadrabianie.

| ID | Wymóg | Oczekiwany zysk |
|---|---|---|
| V3-O-01 | **Delta dla przedmiotow**: wysylac przedmiot tylko, gdy sie zmienil (nowy, zmieniony stan/HP/pozycja, usuniety). Klient trzyma slownik i nakłada roznice. To jest **jedna zmiana warta wiecej niz cala reszta razem**. | -70% do -75% ruchu |
| V3-O-02 | **`perMessageDeflate`** w `ws` (dzis wylaczone). JSON z powtarzalnymi kluczami kompresuje sie bardzo dobrze; koszt to CPU serwera, ktory mamy. **Zmierzyc przed i po**, nie wlaczac na wiare. | -60% do -80% tego, co zostanie |
| V3-O-03 | **Area of interest**: nie wysylac bytow dalszych niz ok. 1.5 ekranu. **UWAGA, pulapka**: klient buduje z `items` siatke kolizji (`buildGrid` w `main.js`), wiec **postawione sciany, glazy, kolce i dzialka musza lecieć zawsze** — inaczej predykcja ruchu rozjedzie sie z serwerem i dostaniemy gumowanie w miejscu, ktore nic z siecia nie ma wspolnego. Ciac wolno **dropy na ziemi, trupy, pociski, kropelki i dalekie potwory**. | -30% do -50% reszty |
| V3-O-04 | **Adaptacyjny snapshotHz**: przy wykrytym zatorze schodzic z 20 na 12-15 Hz dla tego jednego gracza. Interpolacja to zakryje, a to jest ostatnia deska ratunku dla slabego lacza. | liniowo |
| V3-O-05 | **Pomiar w produkcie, nie w glowie**: rozmiar snapshotu i bajty na sekunde per gracz w telemetrii i w `/healthz`, oraz overlay debug (RTT, kB/s, stan bufora interpolacji). Bez tego nie da sie powiedziec, czy naprawa zadzialala. **To jest warunek wejscia dla reszty punktu F.** | - |
| V3-O-06 | **Wygladzanie korekty pozycji**: dzis `reconcile` ustawia pozycje gracza twardo na serwerowa. Przy skoku opoznienia to jest wizualne "cofniecie ekranu". Mala korekta ma byc rozlozona na kilka klatek, duza (powyzej ok. 24 px) nadal natychmiastowa. | odczucie |
| V3-O-07 | **Adaptacyjny bufor interpolacji**: dzis staly 100 ms. Liczyc jitter i trzymac bufor 60-150 ms. Za maly bufor = szarpanie, za duzy = opoznienie sterowania. | odczucie |

### Wynik (zmierzony 2026-11-06, v0.9.0)

| Etap | Snapshot | Na gracza | 4 graczy |
|---|---|---|---|
| Przed | 25 001 B (items 20 410 B) | 500 kB/s | 16,0 Mbit/s |
| Po delcie (O-01) | 4 593 B (items **2 B**) | 91,9 kB/s | 2,9 Mbit/s |
| Po delcie i AoI (O-03) | 2 387 B | 47,7 kB/s | 1,5 Mbit/s |
| **Na lączu, z deflate (O-02)** | - | **6,5 kB/s** | **0,2 Mbit/s** |

**Spadek 77-krotny.** Mierzone `tools/measure-snapshot.mjs --wire` (bajty z prawdziwego gniazda `ws`),
nie szacowane. Scenariusz jest syntetyczny — w realnej grze potwory tloczą sie wokol graczy,
wiec AoI utnie mniej.

| ID | Co zostalo | Dlaczego warto |
|---|---|---|
| V3-O-08 | **`players` to teraz najwieksza sekcja** (1 173 B przy 4 graczach, ok. 290 B na gracza): dlugie klucze, a wiekszosc pol nie zmienia sie co tick. Do tego `seed` leci w kazdym snapshocie, choc jest staly, a `mobs` ida w calosci. Ta sama delta albo krotka forma tablicowa jak u potworow. | to jest **nowe** waskie gardlo po O-01..O-03 |
| V3-O-04 | Adaptacyjny `snapshotHz` — teraz da sie go oprzec o `bufferedAmount` albo `NetMeter.bytesPerSecond()`. | ostatnia deska ratunku dla slabego lacza |
| V3-O-09 | **Weryfikacja na zywym laczu**: po wdrozeniu sprawdzic `/healthz` pole `net.maxPlayerBytesPerSec` przy fali 4+ i zapytac gracza z Olsztyna. Zmierzylismy bajty, nie odczucie. | bez tego nie wiemy, czy problem zniknal |

Kolejnosc: **O-05 (pomiar) i O-01 (delta) razem**, potem O-02, potem O-03, na koncu O-06/O-07.
Uchyla priorytet punktu F z dolu backlogu — F-01..F-07 zostaja, ale ten punkt idzie pierwszy.

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
| V3-C-06 | **Poglos** (zgloszenie z gry 2026-11-05): karabin ma dostac **lekki** poglos (krotki, ok. 0.2-0.3 s, raczej "klaps" pomieszczenia niz hala), a **wybuchy wyrazny, dlugi** (ok. 1-1.5 s). Realizacja: `ConvolverNode` z **generowana proceduralnie** odpowiedzia impulsowa (szum z wykladniczym zanikiem) - zadnych plikow IR, bo gra ma dzialac bez internetu. Osobna szyna "wet" z regulowanym udzialem per dzwiek, zeby strzal mial go malo, a wybuch duzo. |
| V3-C-07 | **Przeladowanie slychac** (zgloszenie z gry 2026-11-05). Dotychczasowa recepta ("dwa kliki po 8 ms") jest **za cicha i za krotka** — ginie w serii z karabinu. Ma to byc **trzyczesciowa wymiana magazynka rozciagnieta na caly czas przeladowania** (1.5 s, skraca sie z poziomem broni, wiec dzwiek musi brac `reloadS` z `rifleStats`, a nie stala): (1) metaliczny klik wyjecia magazynka na starcie, (2) glebszy "thunk" wbicia nowego w ok. 60% czasu, (3) ostry szczek zamka na koniec, zgrany z zamknieciem pierscienia (PRD-HUD-11). Wlasne przeladowanie **bez tlumienia odlegloscia i glosniej** niz cudze — to jest informacja taktyczna, ma przebic sie przez walke. |

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
| V3-D-08 | **Kolce i klatka 2 x 2** (R59, zgloszenie 2026-11-06). Dzis oba sa 1 x 1, co czyni je trudnymi do trafienia i slabymi wzgledem ceny dropu. Nowy rozmiar `size: [2, 2]` dla obu. **Klatka**: aktywuje sie, gdy potwor wejdzie na **ktorykolwiek** z czterech kafelkow, i lapie **wszystko, co stoi w obrysie 2 x 2** w chwili wyzwolenia (dzis lapie dokladnie jednego) — to zmienia ja z pulapki punktowej w narzedzie na grupe. **Kolce**: zadaja obrazenia kazdemu potworowi stojacemu na dowolnym z czterech kafelkow, w tym samym rytmie 8 obr. / 0.5 s. Limity bez zmian (klatka 12). Po refaktorze z V3-D-03 rozmiar jest polem w `balance.json`, wiec kosztem sa glownie: wyzwalanie i obszar dzialania, ghost stawiania (2 x 2 musi miec cztery wolne kafelki) i sprite'y — kolce i klatka potrzebuja grafiki 32 x 32 zamiast 16 x 16. |
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

## C2. Przeprojektowanie dzwieku (zgloszenia z gry, 2026-11-06)

Po zagraniu w v0.5.0: **poglosu nie slychac**, dzwiek karabinu jest slaby, przeladowanie zle,
ultimate rozczarowujace. Ponizej diagnoza i konkretne recepty — agent implementujacy ma sie
ich trzymac, a nie wymyslac wlasne.

### Dlaczego poglosu nie slychac (diagnoza, nie domysl)
Trasa jest poprawna (`out -> send -> ConvolverNode -> master`), wiec problem jest w poziomach:
1. `ConvolverNode.normalize` jest domyslnie `true` — przeglądarka skaluje odpowiedz impulsowa
   do stalej mocy, co przy krotkim IR daje bardzo cichy ogon;
2. `DynamicsCompressor` jako limiter dociska ogon **zaraz po transjencie** (to jest dokladnie
   to, co kompresor robi), wiec resztka poglosu ginie pod progiem slyszalnosci;
3. sam dzwiek strzalu trwa 14 ms — nie ma czego pogłosić, ucho potrzebuje **ogona w samym
   dzwieku**, zeby uslyszec przestrzen.

| ID | Wymóg |
|---|---|
| V3-C-09 | **Naprawa poglosu**: `convolver.normalize = false` i jawne skalowanie IR do szczytu ok. 0.4; **pre-delay** przed konwolwerem (`DelayNode`: 12 ms pokoj, 35 ms hala) — bez niego ogon zlewa sie z transjentem; udzial wet w gore: strzal 0.45, armata 0.4, `destroyed` 0.7, `explode` 1.1, przeladowanie 0.25, ultimate 0.8; szyna wet **omija limiter albo ma wlasny makeup gain**, zeby kompresor nie zjadal ogona. Do tego kazdy glosny dzwiek dostaje **wlasny, syntezowany ogon** jako warstwa (patrz recepty nizej) — konwolwer ma dokladac przestrzen, a nie byc jedynym zrodlem ogona. |
| V3-C-10 | **Karabin od nowa, 5 warstw** (struktura z praktyki projektowania broni: transjent / body / mechanika / ogon). Dzis sa 2 warstwy i brzmi jak "pyk". Recepta: (1) **transjent** bialy szum 8 ms, highpass 3 kHz, poziom 0.9, zanik wykladniczy; (2) **body** szum pasmowy 1.2 kHz Q 1.5, 35 ms, poziom 0.6, lowpass jadacy 4000 -> 900 Hz; (3) **dol** sinus 160 -> 45 Hz, 60 ms, poziom 0.5 (to daje "kopa", dzis go nie ma); (4) **mechanika** krotki square 2.5 kHz, 3 ms, poziom 0.15 (zamek); (5) **ogon** szum 180 ms, lowpass 1.2 kHz, poziom 0.18, start 25 ms po transjencie. Rozrzut wysokosci +/-7% zostaje. |
| V3-C-11 | **Przeladowanie od nowa, 4 zdarzenia** (dzis: za cicho i za plasko). (1) **0%**: zatrzask magazynka — szum 3 ms bp 3.5 kHz + square 1.8 kHz 4 ms + cicha "sprezyna" (trojkat 900 -> 1400 Hz, 40 ms, 0.1); (2) **10%**: wysuniecie magazynka — brazowy szum 60 ms lp 1.5 kHz, 0.25; (3) **60%**: **wbicie nowego, najglosniejsze** — brazowy szum 70 ms lp 600 Hz + sinus 140 -> 50 Hz 60 ms + bialy szum 12 ms bp 2.2 kHz, lacznie ok. 0.8; (4) **koniec**: zamek — szum 25 ms hp 2.5 kHz 0.9 + square 3.2 kHz 5 ms + metaliczny "ring" (trojkat 2600 Hz, 90 ms, 0.12, zanik). Calosc rozciagana na **faktyczny** `reloadS` (V3-C-07 zostaje). |
| V3-C-12 | **ULTIMATE od nowa, 3 fazy** (dzis: krotki sweep FM, za malo jak na "wlasnie odpalilem super"). (1) **narastanie 0 -> 0.45 s**: pila 120 -> 1400 Hz przez rezonansowy lowpass jadacy w gore + szum narastajacy, glosnosc rosnaca; (2) **uderzenie na 0.45 s**: sinus 90 -> 35 Hz przez 0.5 s + brazowy szum 0.35 s lp 1500 -> 200 Hz + bialy transjent 10 ms; (3) **wybrzmienie**: trzy rozstrojone tony (akord) przez 0.6 s, zanikajace. **Prog III**: narastanie dluzsze (0.6 s), akord bogatszy, wet 0.9 — "pelny" ma byc slyszalnie wiekszy niz prog I, bo dzis roznicy nie ma. |
| V3-C-14 | **Poglos karabinu ma brzmiec jak otwarta przestrzen, nie jak kibel** (zgloszenie 2026-11-06, po v0.8.0). **Diagnoza**: dzisiejsza odpowiedz impulsowa to szum z jednobiegunowym dolnoprzepustem, ktorego wspolczynnik jedzie `0.9 -> 0.2`, czyli ogon z kazda milisekunda **ciemnieje**; do tego jest krotki (0.55 s), **monofoniczny** i zaczyna sie od razu po 40 ms. Suma tych trzech cech to definicja malego, zamknietego pomieszczenia: duzo sredniego pasma, brak gory, brak szerokosci. **Naprawa, cztery zmiany naraz**: (1) **pasmo w gore** — zamiast ciemniejacego dolnoprzepustu dac ogonowi **gorna przepustowosc od ok. 400 Hz** (to wycina "kiblowe" dolne srednie) i zachowac gore do ok. 8 kHz, lekko sciagajac dopiero powyzej; (2) **dlugosc** 0.55 s -> **1.2-1.6 s**, bo "lush" to przede wszystkim dlugi, gesty ogon; (3) **brak wczesnych odbic** — pierwsze ok. 50 ms IR prawie wyciszone plus narastanie 10-20 ms: na otwartej przestrzeni nie ma blisko czego odbic, i to jest roznica miedzy "swieze powietrze" a "lazienka"; (4) **stereo** — IR **dwukanalowe, dekorelowane** zamiast dzisiejszego mono, zeby ogon byl szeroki (dzis szyna wet jest dodatkowo zawsze na srodku, patrz V3-C-08 — to ta sama sprawa). Pre-delay 40 -> 60-70 ms. Przy okazji: istniejacy test wymusza, zeby wet wybuchu byl ponad 2x wiekszy niz strzalu, co **ogranicza strojenie strzalu z gory** (musi byc < 0.55) — poluzowac ten test, bo pilnuje projektu dzwieku zamiast regresji. |
| V3-C-13 | **Karabin: ciszej i z dluzszym, opoznionym poglosem** (zgloszenie z gry 2026-11-06, po v0.6.0). Trzy pokretla naraz: (1) **suchy strzal ciszej** — poziomy warstw w dol o ok. 30%, zeby poglos mial sie na czym przebic i zeby seria nie meczyla; (2) **dluzszy ogon** — dla strzalu osobna szyna z IR ok. 0.5-0.6 s zamiast dzisiejszego "pokoju" 0.25 s (wybuchy zostaja na hali 1.3 s); (3) **wyrazniejsze pre-delay** — 12 ms to za malo, zeby uslyszec, ze poglos "wchodzi po czasie"; celowac w 35-45 ms dla strzalu. Efekt docelowy: sucha, krotka reakcja broni, a chwile po niej slyszalne odbicie od otoczenia. Uwaga przy strojeniu: karabin strzela co 0.14 s, wiec przy ogonie 0.6 s naklada sie 4-5 ogonow — dlatego punkt (1) jest warunkiem, a nie dodatkiem. |
| V3-C-08 | **Dzwiek stereo** (zgloszenie: strzal w mur po lewej brzmi na srodku). Kazdy glos przechodzi przez `StereoPannerNode`; `pan = clamp((x_zdarzenia - x_kamery) / (szerokosc_widoku/2), -1, 1) * 0.85`. Wlasne dzwieki gracza (strzal, przeladowanie, obrazenia) zostaja **na srodku** — to informacja o sobie, nie o swiecie. Panoramowanie liczone w chwili startu dzwieku, bez sledzenia ruchu. |

## N. Krotkie partie glosowe (16-bit) [do zbadania, zgloszenie 2026-11-06]

Pomysl: komunikaty glosowe jak z konsol 16-bitowych — `RELOADING!` przy przeladowaniu, a po
kazdej zakonczonej fali **krotkie przechwalki kolejnych graczy**, awatar po awatarze, z malym
odstepem.

Problem do rozwiazania: PRD-CON-01 i PRD-CON-05 zakazuja assetow z sieci, a konsole 16-bit
robily to **probkami**, nie synteza. Mamy wiec trzy drogi i trzeba wybrac po probie:

| ID | Droga | Co to znaczy |
|---|---|---|
| V3-N-01 | ~~**Synteza formantowa**~~ — **odrzucone** (R57): daje robota, a potrzebujemy *charakteru* | Pobudzenie pila + **dwa-trzy rownolegle filtry pasmowe** jako formanty F1/F2/F3, monotonna wysokosc, segmenty samoglosek i spolglosek ustawiane w czasie. Tak dziala eSpeak (synteza formantowa dla glosek dzwiecznych). Tablica formantow: `a` ok. F1 800 / F2 1150, `i` ok. F1 300 / F2 2300; F1 odpowiada otwarciu ust, F2 pozycji jezyka. Monotonna wysokosc + filtry formantowe to **dokladnie** ten robotyczny charakter, ktory pasuje do pixel-artu. Zero plikow, pelna zgodnosc z CON-01. |
| V3-N-02 | **WYBRANE (R57): probki o niskim bitrate, zapiekane w repo** | Nie lamie CON-05 (asset powstaje u nas, nie pobrany z sieci), ale podnosi rozmiar artefaktu — a CON-03 mowi ponizej 20 MB. Kilkanascie krotkich okrzykow w niskiej probkowce zmiesci sie bez problemu, wiec to realna opcja, jesli formanty zabrzmia zbyt slabo. |
| V3-N-03 | **`speechSynthesis` przegladarki** | Dziala offline, ale glos zalezy od systemu, po polsku bywa go brak, a brzmienie jest "asystentowe", nie konsolowe. Tylko jako awaryjne. |
| V3-N-05 | **Postacie glosowe** (R57, 2026-11-06). Minimum dwie, wyraznie rozne: (1) **charczacy koks, ktory drze japę** — krzyk, zdarty glos, agresja; (2) **spokojny zabojca** — cichy, opanowany, zaraz po tamtym, np. `Another one cleared`. Kontrast miedzy nimi jest cala sola tego pomyslu, wiec przechwalki po fali leca **po kolei, awatar po awatarze**, zeby bylo go slychac. Kazdy awatar gracza ma przypisana persone glosowa. |
| V3-N-06 | **Skad probki, skoro nie wolno ich brac z sieci** (PRD-CON-01, CON-05): generujemy je **u siebie**, na bo3serverze — jest tam gotowa fabryka glosu (pocket-tts z klonowaniem barwy z pliku wav, a do wzorcow VoxCPM2 na P100). Charakter (charkot, krzyk, spokoj) robimy na etapie generowania i obrobki, nie w przegladarce. |
| V3-N-07 | **Format i budzet**: mono, ok. 8-11 kHz, celowo niski bitrate — **retro ma brzmiec retro**, wiec downsampling jest cecha, nie wada. Plik skompresowany (ogg/mp3) zamiast wav, bo przegladarka i tak dekoduje raz przez `decodeAudioData`. Twardy limit: artefakt dystrybucyjny ponizej 20 MB (PRD-CON-03) — kilkanascie krotkich okrzykow miesci sie z ogromnym zapasem. Probki ida przez **te sama szyne co reszta dzwieku**: suwak glosnosci, wyciszenie, panorama (wlasne na srodku). |
| V3-N-04 | **Tresc i reguly** | `RELOADING!` tylko dla wlasnego gracza i tylko przy **recznym** przeladowaniu albo pierwszym pustym magazynku w fali (inaczej zagada). Po fali: kolejka przechwalek, jedna linijka na gracza, odstep ok. 0.6 s, kolejnosc wg liczby zabojstw, pomijani martwi. Teksty krotkie, w duchu brudnego post-apo, **nie** wulgarne bez potrzeby. Wyciszane tym samym suwakiem co reszta (V3-C-03). |

## M. Brak reakcji na obrazenia gracza (zgloszenie z gry, 2026-11-05)

**Gracz obrywa i nie dzieje sie NIC**: nie miga, nie brzmi, ekran nie reaguje. Sprawdzone w kodzie:
`damagePlayer` w `server/players.js` wysyla zdarzenie **wylacznie dla friendly fire** (`ff`).
Cios potwora, pocisk potwora i wlasna mina nie generuja zadnego zdarzenia, wiec klient nie ma
z czego zrobic efektu. PRD-FX-03 opisuje tylko friendly fire - to jest luka w samym PRD, nie
tylko w kodzie.

| ID | Wymóg |
|---|---|
| V3-M-01 | **Zdarzenie `hurt` przy kazdym obrazeniu gracza**, niezaleznie od zrodla (`mob`, `ff`, `mine`, pocisk potwora): `id`, `amount`, `source`, pozycja. `ff` zostaje osobno, bo niesie informacje, kto strzelil. |
| V3-M-02 | **Reakcja u trafionego**: czerwony blysk sylwetki, winieta ekranu (jest juz `vignetteUntil` w `fx.js`, dzis uzywana tylko przy `ff`), **wstrzas kamery** proporcjonalny do obrazen (wylaczony przy `prefers-reduced-motion`, PRD-FX-07), **migniecie paska HP** i liczba utraconych HP. Przy HP ponizej 30% dodatkowo staly, pulsujacy obrys ekranu - gracz ma czuc, ze jest o krok od powalenia. |
| V3-M-03 | **Reakcja u pozostalych**: sylwetka trafionego sojusznika blyska czerwono (mechanizm `playerFlash` juz istnieje dla `ff`, wystarczy go wpiac w `hurt`). |
| V3-M-04 | **Dzwiek obrazen**: osobny dla "oberwales ty" i "oberwal sojusznik", wyraznie inny niz trafienie potwora. Przy niskim HP wariant bardziej alarmowy. |
| V3-M-05 | Dopisac do PRD jako **PRD-FX-09** (obrazenia gracza), bo dzis FX-03 pokrywa wylacznie friendly fire. |

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
