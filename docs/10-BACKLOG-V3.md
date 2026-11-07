# 10 - Backlog V3

Wersja: 0.2 (2026-11-07, dodana sekcja Q). Zgłoszone przez właściciela produktu (Piotr) po hostowaniu gry na
`obrzyn.online`. Punkty A-L to oryginalne zgłoszenie; tutaj są rozpisane na wymagania z ID,
z oznaczeniem, co już jest w kodzie, a co trzeba dopisać.

Stan kodu, do którego to się odnosi: 3 z 6 typów potworów, 3 z 9 przedmiotów, brak
startowych ruin (PRD-MAP-10), brak dźwięku, brak awansu poziomu broni, brak listy pokojów.

Kolejność realizacji: **L + tanie J** → **B** → **C** → **D/E** → **A** → **O (sieć)** → **I** → **P (krytyczne)** → **G/H** → **K** → **F-01** → **E-02/E-03 + skład fal (R60-R62)** (wszystko powyżej zrobione, ostatnie w v0.14.0) → **N** (czeka na trzy decyzje właściciela) → reszta **E** (E-01 ruiny, E-05..E-07) → **F-05** (lag compensation, tylko jeśli F-01 nie wystarczy) → **Q** (zgłoszenia 2026-11-07: Q-01/Q-02 dropy stałe, Q-03 Kamikaze, Q-04 płomień, Q-05 ciemność, Q-06 random eventy).

---

## P. KRYTYCZNE: gracz oslepa po kilkunastu sekundach (zgloszenie 2026-11-06, v0.11.0)

Zgloszenie z gry: "na jakis czas znikam ja, znikaja potwory (...) pasek zdrowia sie nie kurczy (...)
nie widac kul lecacych z karabinu mimo ze strzelam (...) w ten sposob wlasnie umarlem". Jednoczesnie
**dzwieki dzialaly**, strzal "na slepo" niszczyl mur, a trupy i plamy krwi **pojawialy sie normalnie**.

### Diagnoza (odtworzona testem, nie zgadnieta)
Ten zestaw objawow wskazuje dokladnie jedno miejsce: **wyjatek w srodku klatki renderu**. Kolejnosc
rysowania w `renderWorld` to ziemia → gore → efekty podloza → kropelki → **przedmioty** → potwory →
gracze → pociski, a `renderHud` leci po wszystkim. Skoro ziemia i gore sa, a przedmiotow, potworow,
graczy, pociskow i HUD-u nie ma, wyjatek leci przy przedmiotach.

Przyczyna: w `drawItems` `const cfg = itemDef(it.kind)` bylo zadeklarowane **wewnatrz** galezi
`placed / active`, a dodana w v0.11.0 zlota poswiata boostu (ITM-P-09) uzywa `cfg?.behavior`
w galezi `ground`. Optional chaining nie ratuje niezadeklarowanej zmiennej — leci
`ReferenceError: cfg is not defined`. Czyli: **kazdy przedmiot lezacy na ziemi w polu widzenia
wywalal cala klatke**. Stad "po ~20 sekundach" (pierwszy drop) i "trwa ~10 sekund" (do podniesienia
albo wyjscia dropu z pola widzenia). Serwer caly czas liczyl poprawnie, dlatego dzwieki i trafienia
dzialaly — zepsuty byl wylacznie obraz.

### Dlaczego to przeszlo na produkcje
`renderWorld` **nigdy nie bylo uruchomione w zadnym tescie**. `test/render.test.js` pokrywal tylko
matematyke kamery i skalowania. Testy deploya byly zielone, bo nie bylo czego zlamac.

| ID | Wymóg | Stan |
|---|---|---|
| V3-P-01 | **Poprawka**: `cfg` i `base` wyciagniete nad `if`, zeby obie galezie je widzialy. | v0.12.0 |
| V3-P-02 | **Test, ktory by to zlapal**: bezglowy harness renderu (atrapa `CanvasRenderingContext2D`, w ktorej `drawImage(undefined)` rzuca tak jak w przegladarce) przepuszczajacy pelna klatke dla **kazdego** rodzaju przedmiotu w kazdym stanie, kazdego typu potwora, trupa w kazdym stadium i pustego swiata. Zweryfikowany przez **celowe przywrocenie bledu**: 14 testow czerwonych. | v0.12.0 |
| V3-P-03 | **Obrona w glab**: (1) `blit()` i `outline()` pomijaja brakujacy sprite zamiast rzucac, bo `drawImage(undefined)` to TypeError; (2) swiat i HUD rysowane sa w osobnych `try`, wiec blad w jednym nie zabiera drugiego; (3) przy bledzie na ekranie pojawia sie czerwony pasek z trescia wyjatku, a blad trafia raz do konsoli. Gracz ma **widziec komunikat**, a nie grac na slepo i zginac. | v0.12.0 |

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
| V3-O-08 | **ZROBIONE w v0.12.0** (1 241 B -> 361 B, czyli 310 -> 90 B na gracza): statyki `id` / `nick` / `color` jada tylko w snapshocie `full` albo przy nowym graczu, reszta jako krotka jak u potworow, `seed` tylko w `full`. Rekonstrukcja w `applyPlayerDelta`, wiec render i HUD dostaja dokladnie ten sam ksztalt co wczesniej. Na laczu 6,6 -> 5,6 kB/s (deflate i tak zjadal powtarzalne klucze). Oryginalnie: **`players` to byla najwieksza sekcja** (1 173 B przy 4 graczach, ok. 290 B na gracza): dlugie klucze, a wiekszosc pol nie zmienia sie co tick. Do tego `seed` leci w kazdym snapshocie, choc jest staly, a `mobs` ida w calosci. Ta sama delta albo krotka forma tablicowa jak u potworow. | to jest **nowe** waskie gardlo po O-01..O-03 |
| V3-O-04 | **ZROBIONE w v0.12.0**: dlawienie per gracz na `ws.bufferedAmount` (nie `NetMeter`, bo ten liczy to, co wyslalismy, a nie to, czego lacze nie odebralo). Wejscie > 16 kB przez 150 ms, wyjscie < 2 kB przez 1 s, po zdlawieniu 12 Hz. Pominiecie nastepuje **przed** `snapshot(id)`, bo delta przedmiotow jest stanowa i zbudowanie snapshotu do kosza przesunieloby punkt odniesienia. `net.throttledStreams` w `/healthz`. **Progi sa zalozeniem, nie pomiarem na zywym laczu** — do sprawdzenia w O-09. | ostatnia deska ratunku dla slabego lacza |
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

## E. Czego jeszcze brakuje wobec PRD (audyt) — E-02 i E-03 ZROBIONE w v0.14.0

| ID | Luka | Źródło |
|---|---|---|
| V3-E-01 | **Startowe ruiny nie istnieją**: ani linii kodu, ani wpisu w `balance.json`. 7 kawałków ściany w pierścieniu 4-9 kafelków od spawnu, losowe orientacje i stany zniszczenia, z seedu gry. Po R53 (patrz J) ruiny są **nie do podniesienia** - zostają jako osłona. | PRD-MAP-10, R50 |
| V3-E-02 | **ZROBIONE w v0.14.0.** Rój (MOB-05): spawnuje się trójkami, 10 HP każdy, od fali 8. Jeden wpis kolejki = trzy potwory (`pack: 3`); limity grupy i `maxAliveMobs` musiały zacząć liczyć **potwory, nie wpisy** — bez tego fala 12 stawiała 105 żywych przy suficie 60 (zmierzone, nie oszacowane). | MOB-05 |
| V3-E-03 | **ZROBIONE w v0.14.0.** Boss (MOB-06) co 5 fal: 1200 HP, cios obszarowy trafiający wszystkich w promieniu 2 kafelków, wezwania ślimaków co 10 s (objęte sufitem `maxAliveMobs`), pasek HP na górze ekranu, gwarantowany drop x3, odporny na klatkę, nigdy nie obcinany przez AoI. Fala z bossem ma 60% normalnego składu — reguła była w 03 od początku, ale kod jej nie miał. | MOB-06, B2 |
| V3-E-04 | **Poziom broni nie ma jak urosnąć**: `rifleStats` skaluje obrażenia, magazynek i przeładunek, ale nie ma itemu podnoszącego poziom, a przebijanie na lv3 i potrójny strzał na lv5 nie są zaimplementowane (istnieją tylko w Szale). Rozstrzyga to punkt I. | PRD-PLR-04 |
| V3-E-05 | Pasek czasu nad obiektami aktywnymi jest tylko dla działka (platform nie ma). | PRD-HUD-06 |
| V3-E-06 | **Obrażenia w przerwie nie mogą zabić**: `damagePlayer` w fazie `break` przycina HP do minimum 1. Zachowanie sensowne, ale nieopisane - dopisać do PRD albo usunąć. | brak |
| V3-E-07 | Licznik `mobsLeft` liczy kolejkę spawnu plus żywe potwory; po V3-A-06 (tank dzielący się na runnery) trzeba doliczyć potomstwo, inaczej licznik skacze w górę w trakcie fali. | PRD-HUD-02 |

## F. Sieć - quick winy — F-01..F-04, F-06, F-07 ZROBIONE; zostaje F-05

Stan: serwer autorytatywny 30 Hz, snapshoty 20 Hz **pełne, w JSON**, predykcja ruchu własnego z rekoncyliacją, interpolacja innych z opóźnieniem 100 ms, brak lag compensation.

| ID | Quick win | Dlaczego |
|---|---|---|
| V3-F-01 | **ZROBIONE w v0.13.0.** Predykcja strzału na kliencie: `public/client/shotpred.js` odtwarza warunki `fireWeapons` (stan gracza, cooldown, magazynek, przeładowanie, modyfikator, szał) i rodzi pocisk-ducha w tym samym kroku, w którym gracz nacisnął. Duch jest **tylko obrazem**: nie trafia, ginie na ścianie, po zasięgu albo gdy przyjdzie prawdziwy strzał. **Przekazanie pałeczki jest odroczone o opóźnienie bufora interpolacji** — prawdziwy pocisk staje się widoczny dopiero tyle po odebraniu snapshotu, więc natychmiastowe skasowanie ducha zostawiałoby dziurę bez pocisku. Nie przewidujemy rozrzutu (serwerowy RNG) ani zakrętu samonaprowadzania. Zapisane jako PRD-PERF-05. |
| V3-F-02 | **ZROBIONE w ramach punktu O** (delta przedmiotów i graczy; bez kodowania binarnego — `perMessageDeflate` dał tyle, że binarka przestała się opłacać). Snapshot delta + binarka: przy 60 potworach i 200 przedmiotach pełny JSON to kilka kB dwadzieścia razy na sekundę per gracz. Delta względem ostatnio potwierdzonego snapshotu plus kodowanie binarne to 5-10x mniej pasma. T3 w `06-OPEN-QUESTIONS.md` przewidywał ten krok. |
| V3-F-03 | **ZROBIONE w ramach punktu O** (AoI z histerezą 1.5 / 1.8 ekranu). Area of interest: nie wysyłać bytów dalszych niż ok. 1.5 ekranu (poza graczami i bossem). |
| V3-F-04 | **ZROBIONE w v0.10.0** (60-150 ms z mierzonego jitteru). Adaptacyjny bufor interpolacji: dziś stałe 100 ms. Dostroić do zmierzonego jitteru (60-150 ms), żeby w LAN-ie było ostrzej, a przez internet nie szarpało. |
| V3-F-05 | **ZOSTAJE, świadomie nieruszone.** Warunek z tej listy jest spełniony dopiero teraz: F-01..F-04 weszły, więc następnym krokiem jest **zmierzyć na żywym łączu, czy to wystarcza** (razem z V3-O-09), a nie od razu cofać pozycje potworów. Lag compensation dla pocisków: trafienia liczone w pozycjach serwerowych, a gracz widzi stan sprzed 100 ms, więc musi wyprzedzać cel. Cofanie pozycji potworów o RTT/2 + bufor przy sprawdzaniu trafienia. Najdroższy punkt tej listy; robić dopiero, jeśli F-01..F-04 nie wystarczą. |
| V3-F-06 | **ZROBIONE w ramach punktu O**: `perMessageDeflate` włączony z progiem 512 B i ograniczonym oknem zlib. |
| V3-F-07 | **ZROBIONE**: NetMeter, `/healthz` i overlay F3. Mierzyć, nie zgadywać: RTT i rozmiar snapshotu w telemetrii i w overlayu debug (`~`), żeby każdy z powyższych punktów dało się ocenić liczbą. Wejście w F zaczyna się od tego punktu. |

## G. Rozkład trupów — ZROBIONE w v0.12.0

| ID | Wymóg |
|---|---|
| V3-G-01 | Trup dostaje **znacznik fali** (dziś `gore.corpses` to `[typ, x, y, kąt]` bez czasu). Stadia: świeży → rozdęty / gnijący → kościotrup → znika. **Maks. 4 fale życia** trupa. Przejścia na granicy fali, nie w jej trakcie. |
| V3-G-02 | Sprite'y stadiów per typ potwora (dziś trup to przyciemniony sprite żywego, robiony filtrem w `render.js`). Kościotrup wspólny dla sylwetek o zbliżonym rozmiarze, żeby nie mnożyć grafiki bez potrzeby. |
| V3-G-03 | Limit 300 trupów zostaje (PRD-MAP-09); rozkład działa **po stronie klienta** z numeru fali w snapshocie, więc nie kosztuje pasma. |

## H. Krew: kałuże i ślady butów — ZROBIONE w v0.12.0

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

## K. Lista pokojów i nowy flow wejścia — ZROBIONE w v0.13.0

Zapisane w PRD jako PRD-SES-08, PRD-SES-09 i PRD-CTRL-11. Czego testy **nie** sprawdziły: wyglądu
w przeglądarce (ekran sterowania i lista pokojów chodzą w testach na atrapie kontekstu 2D i atrapie DOM).


Dziś: formularz nick + kod pokoju, brak jakiegokolwiek endpointu listującego; pokoje żyją w pamięci `Rooms`.

| ID | Wymóg |
|---|---|
| V3-K-01 | **`GET /api/rooms`**: kod, liczba graczy, `maxPlayers`, czy trwa mecz, numer fali, wiek pokoju. Bez nicków i bez czegokolwiek, co identyfikuje gracza. Tylko w trybie `ROOMS=1`; w LAN endpoint nie istnieje. |
| V3-K-02 | **Flow wejścia**: (1) ekran nicku - **tylko nick**; (2) ekran główny: lista pokojów (z informacją "mecz w toku" i "n / 4 graczy"), przycisk **Nowy pokój**, link do **leaderboardu**, przycisk **Sterowanie**. Wejście po linku `?r=KOD` dalej wchodzi prosto do pokoju. |
| V3-K-03 | **Pokój bez graczy jest DEAD**: znika z listy **natychmiast** po wyjściu ostatniego gracza i nie da się do niego dołączyć. Fizyczne skasowanie zostaje po 90 s, bo inaczej odświeżenie karty (30 s grace na reconnect) kasowałoby pokój z ludźmi w środku. |
| V3-K-04 | **Ekran "Sterowanie"**: ładny wizualnie obrazek klawiatury i myszy z opisem każdej akcji (pixel-art, generowany z kodu jak reszta grafiki). Aktualizowany razem z R54. Dostępny też z menu pauzy. |
| V3-K-05 | Lista pokojów odświeża się co ok. 5 s, gdy ekran jest otwarty, i nigdy w trakcie gry. |
| V3-K-06 | **Ekran główny v2** (ZROBIONE v0.16.0, zgłoszenie 2026-11-07: „to co jest teraz to dramat"). Menu dzieje się **w arenie**: pod panelem gra żywy świat demo bez serwera (`client/demo.js`, tryb `attract`): bohater w kolorze gracza wędruje po Lissajous, 8 potworów snuje się wokół i trzyma dystans, co ~3 s seria z karabinu (ta sama geometria co w grze, przez `ShotPredictor`), trafienia, krew, trupy, respawn; ruiny ścian i boost na ziemi. Tło jest **nieme** i przyciemnione (0.42). Balans do demo z `/balance.json` statycznie, zanim przyjdzie `welcome`. Panel: (1) **logotyp pixel-art** z kodu (`client/logo.js`, glify 5x7, złoto z miedzianym dołem, obrys, cień); (2) **wizytówka**: sprite bohatera 4x, nick, „zmień nick", najdalsza fala / zabójstwa / partie z leaderboardu, głośność, wyciszenie, pełny ekran (dotąd tylko w pauzie); (3) **GRAJ**: pierwszy pokój z miejscem, bez takiego nowy pokój (LAN: dołącz), pod spodem **Nowy pokój** i **Sterowanie**; **karty pokojów** z 4 slotami (zajęty = sprite gracza w kolorze slotu), plakietka „w toku"; (4) leaderboard top 6 z podświetleniem własnego wiersza i „Ty: miejsce N" poza limitem; (5) **bestiariusz**: 10 sprite'ów z nazwą, po najechaniu jedno zdanie z tabeli prawdy 03; (6) stopka: **porada** (rotacja co 10 s), **puls serwera** z `/healthz` (online / pokoje, w obu trybach, tylko gdy ekran otwarty), wersja, „co nowego" (`client/content.js`, aktualizowane z tagiem); (7) **dźwięki interfejsu**: blip przy najechaniu, klik przy wyborze (`uiHover`, `uiClick` z syntezatora). Ekran nicku dostaje to samo tło. |
| V3-K-07 | **Sterowanie jako poligon** (ZROBIONE v0.16.0). Zamiast obrazka do czytania: **scena z gry po lewej** (ten sam `demo.js`, tryb `range`), panel z klawiaturą dokowany po prawej, bohater na środku wolnego miejsca. **Reaguje na prawdziwe klawisze**: WASD = drepcze w miejscu, mysz = celuje, Spacja / LPM = strzela prawdziwym karabinem z błyskiem lufy, odrzutem i nowym dźwiękiem (pusty magazynek = przeładowanie, R = przeładuj), **ślimak-tarcza** 7 kafli dalej pada i wraca po 2,5 s, dwie ściany na północy zatrzymują pociski. Obok leży **ściana do podniesienia**: E podnosi (z animacją), Q / kółko obraca, E stawia z zielonym/czerwonym duchem jak w grze, R odkłada, Spacja rzuca po łuku (zasięg z `throw`). F odpala pierścień fali uderzeniowej (cooldown 1 s). **Klawisz trzymany świeci na biało** na obrazku (`drawControls(ctx, pressed)`), także LPM / PPM / kółko; E/R/Q/F/G świecą 150 ms po naciśnięciu. Esc albo „Wróć" wraca. Z pauzy ten sam panel dokowany z boku, ale bez poligonu (gra trwa pod spodem). Logika poligonu bez DOM, testowana w `test/demo.test.js`. |
| V3-K-08 | **Ekran główny B2** (ZROBIONE v0.17.0, wybrany z czterech makiet offline A / B / A2 / B2; C „zakładki" i D „dwa okna" odrzucone). Uwaga właściciela: „wolałbym, żeby POKOJE to była jasno oddzielona sekcja". Układ: panel w dwóch kolumnach 340 px + reszta. **Lewa**: logo, wizytówka (sprite, nick, zmień nick, najd. fala / zabójstwa / partie), **GRAJ** z podpisem „pierwszy pokój z miejscem albo nowy", przyciski Sterowanie i **Ustawienia** (głośność, wyciszenie, pełny ekran rozwijane pod przyciskiem, nie na stałe w wizytówce), leaderboard top 6, stopka z poradą, pulsem, wersją i „co nowego". **Prawa**: sekcja **POKOJE** w złotej ramce 2 px: nagłówek z tytułem, licznikiem „N otwartych · M z miejscem" i przyciskiem „+ Nowy pokój" w nagłówku; **siatka 2 x 2** kart dwuwierszowych (kod, sloty, Wejdź albo plakietka „w toku" / „pełny"; pod spodem „n / 4 graczy · lobby · 40 s temu"), przewijanie powyżej ~6 kart; pod sekcją bestiariusz. W trybie LAN prawa kolumna ma tylko bestiariusz, GRAJ zostaje po lewej z podpisem „dołącza do gry na tym serwerze". Poniżej 900 px kolumny idą jedna pod drugą. |

## C2. Przeprojektowanie dzwieku (zgloszenia z gry, 2026-11-06) — ZROBIONE w v0.6.0 / v0.8.0 / v0.9.0

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
| V3-C-15 | **ZROBIONE v0.15.0.** **Karabin i dzialko: dzwiek wybrany z odsluchu 2026-11-07 (R63), zastepuje V3-C-10/13/14.** Wybrane z ok. 100 wariantow renderowanych offline (`tools/sfx-lab/render-rifle.mjs`, sekwencja: strzal, strzal, seria 8 co 0.14 s). Wzorce: `tools/sfx-lab/chosen/player_mech_st-max.wav` (gracz) i `tools/sfx-lab/chosen/turret_heavy_st-max.wav` (dzialko). **Gracz, suchy strzal "mech"** (5 warstw jak V3-C-10 plus klik zamka): (1) bialy szum 7 ms hp 3 kHz 0.6; (2) bialy szum 30 ms bp 1.5 kHz Q 1.4, lp 3500 -> 800 Hz, 0.4; (3) sinus 150 -> 48 Hz 70 ms 0.38; (4) **klik zamka 18 ms po strzale**: bialy szum 6 ms bp 4.2 kHz Q 6 0.3 + square 1.9 kHz 4 ms 0.1 (start 19 ms); (5) ogon szum 160 ms lp 1 kHz 0.1 od 30 ms. **Dzialko, suchy strzal "heavy"** (zastepuje dzisiejsza recepte `cannon`): (1) bialy szum 6 ms hp 2.5 kHz 0.55; (2) bialy szum 50 ms bp 700 Hz Q 1.2, lp 3000 -> 500 Hz, 0.5; (3) sinus 120 -> 38 Hz 110 ms 0.5; (4) brazowy szum 120 ms lp 400 Hz 0.45 od 4 ms; (5) bialy szum 220 ms lp 900 Hz 0.1 od 30 ms. Obwiednia warstwy: atak 2 ms, zanik wykladniczy do -60 dB na koncu `dur`; rozrzut wysokosci +/-7% zostaje. **Wspolna szyna poglosu "st-max"** (jedna IR dla obu, zamiast dzisiejszej `gun`): pre-delay **60 ms**, send **0.028 przy IR znormalizowanej do szczytu 0.5** (czyli ok. 0.035 przy dzisiejszym `IR_PEAK` 0.4; liczy sie stosunek). IR stereo 1.6 s = **ogon dyfuzyjny w 4 pasmach rozlozonych w panoramie** + **4 slapbacki ping-pong**. Ogon: cztery niezalezne szumy (osobny szum na kanal), kazdy RT60 **1.2 s** (-60 dB), start 30 ms, narastanie 80 ms (smoothstep), poziom 0.25, pasma i panorama (stala moc): **300-600 Hz pan -0.9; 600-1200 Hz pan +0.6; 1.2-2.2 kHz pan -0.5; 2.2-3.5 kHz pan +0.9**; gorna krawedz kazdego pasma gasnie wykladniczo do 1000/3500 swojej wartosci w ciagu 1.2 s (absorpcja); na kazdym pasmie wolny autopan 0.9 Hz, glebokosc 0.35, przeciwfazowo L/R. Slapbacki (krotki szum z zanikiem exp, lowpass): **0 ms srodek 1.0 lp 2.5 kHz zanik 6 ms; 130 ms pan -0.8 0.45 lp 1.6 kHz 14 ms; 310 ms pan +0.8 0.3 lp 1 kHz 25 ms; 520 ms pan -0.6 0.15 lp 800 Hz 35 ms**; pan slapbacka daje tez ITD do 0.7 ms. Zmierzona korelacja L/R ogona ok. 0 (-0.04 gracz, -0.06 dzialko): szeroko, ale mono-kompatybilne. **Dlaczego tak** (ustalone po drodze, zeby nikt nie cofal): (a) pasmo ogona **300 Hz - 3.5 kHz, ciemne** — jasne i "sopranowe" warianty (HP 1.2-3.5 kHz) odpadly w odsluchu mimo wczesniejszej hipotezy V3-C-14; (b) ogon **1.2 s**, nie 1.8 — dluzszy brzmial "za glosno" niezaleznie od sendu, bo w ciszy po strzale slychac go 40 dB pod transjentem: glosnosc poglosu to glownie jego dlugosc; (c) send bardzo niski — na starcie 0.34 (dzis w grze) i kazda kolejna polowa byla wciaz za glosna, az do 0.028; (d) szerokosc stereo z **rozlozenia pasm i odbic po bokach**, nie z podbijania side — M/S powyzej mid 0.5 / side 1.3 dawalo korelacje -0.85 i zapadanie w mono. Testy do poluzowania jak w V3-C-14. |
| V3-C-08 | **Dzwiek stereo** (zgloszenie: strzal w mur po lewej brzmi na srodku). Kazdy glos przechodzi przez `StereoPannerNode`; `pan = clamp((x_zdarzenia - x_kamery) / (szerokosc_widoku/2), -1, 1) * 0.85`. Wlasne dzwieki gracza (strzal, przeladowanie, obrazenia) zostaja **na srodku** — to informacja o sobie, nie o swiecie. Panoramowanie liczone w chwili startu dzwieku, bez sledzenia ruchu. |

## Mapowanie klawiszy: kod kontra dokumentacja (sprawdzone 2026-11-06 przy V3-K-04)

Sprawdzone klawisz po klawiszu przy rysowaniu ekranu sterowania. R54 zgadza się z kodem (`E`, `R`,
`Q`/kółko, Spacja/LPM). Rzeczy, których **nie ma w dokumentacji**, a są w kodzie, i które ekran
sterowania opisuje: `F` (ultimate), `G` (gotowość, tylko w przerwie między falami), `Tab` (tablica
wyników, na przytrzymanie), `Esc` (pauza), PPM oraz `A`/`D` po śmierci (przełączanie obserwowanego
gracza). `Q` i kółko obracają tylko przedmioty z `rotatable` — dziś wyłącznie ścianę. Rzut z
przedmiotem w rękach nie idzie osobną akcją, tylko tą samą ścieżką `fire` co strzał — PRD-CTRL-03
opisuje to poprawnie od strony gracza, więc zostaje bez zmian.

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

**ZROBIONE w v0.5.0** (zweryfikowane w kodzie 2026-11-06): `damagePlayer` wysyla `hurt` przy kazdym
zrodle obrazen, klient ma blysk, winiete, wstrzas, migniecie paska i osobne dzwieki `hurtMe` / `hurtMeLow` /
`hurtAlly`. PRD-FX-09 opisany.

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

## Q. Zgłoszenia z 2026-11-07 (po v0.17.0): dropy stałe, kamikaze, płomień, ciemność, random eventy

Sześć pomysłów właściciela produktu, zapisane jako wymagania. Wartości liczbowe poniżej to
**propozycje startowe do zbalansowania**, nie decyzje; decyzją są tylko mechanizmy. Kolejność
w tabeli to proponowana kolejność realizacji: dwa dropy to kilka linii w `balance.json` i
`items.js`, kamikaze to nowy typ potwora na istniejącym szkielecie, płomień i ciemność to nowe
byty świata i renderu, a random event na końcu jest złożeniem wszystkiego powyżej.

| ID | Wymóg |
|---|---|
| V3-Q-01 | **Drop: stały bonus HP** (nowa kategoria przedmiotu: `permanent`, nie `hard` ani `placed`). Podniesienie **na stałe** podnosi maksymalne HP gracza, który go podniósł (start: **+10 HP**, od razu doleczone o tę samą wartość), do końca partii, także po powaleniu i respawnie. Nie da się go rzucić ani odłożyć: `E` zużywa natychmiast, `R` i spacja nic nie robią. Limit skumulowany per gracz (start: **+50**), potem drop traktowany jak zebrany bez efektu, z komunikatem. Wartość `maxHp` musi stać się polem **per gracz w snapshocie**, bo dziś pasek HP zakłada jedną stałą. Waga dropu niska, `fromWave` ok. 3. |
| V3-Q-02 | **Drop: stały bonus prędkości, bardzo lekki.** Jak V3-Q-01, ale podnosi `speedTiles` gracza o **+0.15 kafelka/s** (3% z bazowych 5), limit skumulowany **+0.75** (5 sztuk, łącznie +15%). Mnożnik `carryHardSpeedMult` nakłada się na nową bazę. Prędkość gracza musi trafić do snapshotu i do predykcji ruchu po stronie klienta (`predict.js`), inaczej klient przewiduje wolniej niż serwer liczy i gracz widzi szarpnięcia. Waga dropu jeszcze niższa niż HP. Zaznaczone przez właściciela: **naprawdę lekki**; jeśli ma być odczuwalny, to dopiero po kilku sztukach. |
| V3-Q-03 | **Potwór: Kamikaze.** Mały, szybki (jak Biegacz), mało HP. Podbiega do gracza na dystans **ok. 1.5 kafelka**, **uzbraja się** (zatrzymuje się, stan `armed` w snapshocie, sprite miga na czerwono, sygnał dźwiękowy) i **po 0.3 s wybucha**: AoE promień 2 kafelki, pełne obrażenia w centrum (start: 25), 50% na krawędzi, rani też hard objecty graczy i inne potwory. Uzbrojony **nie śledzi** gracza i nie da się go już zatrzymać: zabity w trakcie 0.3 s **też wybucha** (z 50% siły), więc zestrzelenie z daleka jest jedyną czystą odpowiedzią. 0.3 s to za mało na ucieczkę piechotą z promienia 2 kafelków przy 5 kafelkach/s, więc mechanika wymusza strzelanie z dystansu, a nie uskok: to jest zamierzone. Wybuch korzysta z tej samej ścieżki co granat Granatnika (V3-A-04). Wpis w bestiariuszu (`content.js`) i w `03-WAVES-DIFFICULTY.md`. |
| V3-Q-04 | **Obiekt świata: Płomień.** Nowy byt w snapshocie (osobna lista `flames`, nie przedmiot): kafelek, na którym się pali, **siła** 1.0 → 0 malejąca liniowo w czasie (start: **8 s**), po czym znika. Zadaje obrażenia **graczom i potworom** stojącym na kafelku proporcjonalnie do siły (start: 6 obr. / 0.5 s przy sile 1.0), podpala też hard objecty na kafelku (obrażenia jak wyżej). Render: sprite ognia skalowany siłą, światło na podłodze, dym; dźwięk trzasku cichnący razem z siłą. **Wyłącznie ze źródeł wrogich**: wybuch Granatnika i Kamikaze (V3-Q-03) zostawiają płomień na kafelku trafienia, random eventy (V3-Q-06) mogą rozsiewać płomienie. Gracz nie ma żadnego przedmiotu ani ultimate, które stawia ogień: to decyzja właściciela, nie luka. |
| V3-Q-05 | **Możliwość techniczna: ciemność z zabarwieniem i światło wokół gracza.** Warstwa renderu nad światem, pod HUD: cała plansza przyciemniona i zabarwiona (parametry: `alpha` 0..1, kolor, np. 0.75 i czerwień), z **wyciętym kołem światła** wokół każdego żywego gracza (start: promień **4 kafelki**, miękka krawędź 1 kafelek, lekkie migotanie jak pochodnia). Implementacja: osobny canvas-maska rysowany raz na klatkę w rozdzielczości świata, `destination-out` na koła, potem nałożony `source-over`. Płomienie z V3-Q-04 też świecą (promień zależny od siły). Sterowane z serwera jednym polem w snapshocie (`dark: {alpha, tint, radiusTiles}` albo `null`), z płynnym przejściem 1 s po stronie klienta. To jest **narzędzie**, nie tryb gry: pierwszym klientem będzie random event (V3-Q-06), kolejnym mogą być wybrane fale albo tryb "noc". Wyłączane przy `prefers-reduced-motion` tylko migotanie, nie sama ciemność. |
| V3-Q-06 | **System random eventów na końcu fali** (szkielet, bez konkretnego wydarzenia). Po wyczyszczeniu fali, zamiast zwykłej przerwy, z prawdopodobieństwem p (start: **20%**, nigdy na fali bossa, nigdy dwa razy z rzędu, nigdy przed falą 3) serwer losuje jedno wydarzenie z listy poniżej, ważone jak potwory (`weight`, `fromWave`). Wspólny kontrakt: stan `event: {type, phase, t, ...}` w snapshocie, komunikat z nazwą wydarzenia na ekranie przez 2 s, dźwięk zapowiedzi, po zakończeniu zwykła przerwa z pełnym czasem. Każde wydarzenie to osobny moduł po stronie serwera (`server/events/<type>.js`) z funkcjami `start`, `update(dt)`, `done()` i własnym blokiem w `balance.json`. Potwory spawnowane przez wydarzenie liczą się do leaderboardu, nie do licznika fali; siła takich spawnów jest zawsze wyprowadzana z `waveBudget(n)` dla **faktycznej** fali n razy mnożnik wydarzenia. Wydarzenia nie mogą się nakładać ani przerwać fali bossa. Lista wydarzeń będzie rosła: każde nowe to jeden wiersz w tabeli poniżej. |

### Wydarzenia (V3-Q-06). Każde to osobny wiersz, numeracja V3-Q-06-NN

| ID | Wydarzenie | Przebieg |
|---|---|---|
| V3-Q-06-01 | **Trzęsienie ziemi** | (1) Wstrząs kamery i dźwięk. (2) Gracze **tracą sterowanie** i są **przyciągani do siebie** do wspólnego punktu (środek ciężkości żywych graczy, przesunięty na najbliższy wolny kafelek), aż wszyscy się spotkają, powaleni też. (3) Wokół punktu spotkania otwiera się **8 zapadni 3 x 3** (8 kierunków, środek zapadni ok. 4 kafelki od punktu spotkania). **Przedmioty i hard objecty stojące na zapadni spadają i znikają**, gracze nie mogą tam wejść. (4) Z każdej zapadni **jednocześnie wychodzi fala potworów**: budżet = `waveBudget(n)` razy mnożnik (start: 1.0), podzielony po równo na 8 zapadni, skład losowany z typów dozwolonych dla fali n. (5) Po wybiciu extra fali zapadnie zamykają się i zaczyna się zwykła przerwa. |
| V3-Q-06-02 | **Deszcz ognia** (kandydat, bez decyzji) | Ciemność z czerwonym zabarwieniem (V3-Q-05), przez 10 s na losowe kafelki spadają płomienie (V3-Q-04) z markerem upadku 0.5 s wcześniej, jak granat. Bez potworów; wydarzenie o przetrwanie, nie o walkę. |
| V3-Q-06-03 | **Armia budowniczych** | Wydarzenie pozytywne, bez potworów. (1) Gracze **tracą sterowanie** i stają w miejscu, nad każdym **emotka zdziwienia** (nowy element renderu: ikonka nad głową, reużywalna dla innych eventów). (2) Zewsząd, zza krawędzi mapy, **wbiega ok. 50 szarych "graczy"** (sprite gracza w kolorze szarym, bez nicków, bez kolizji, czysto kosmetyczni: istnieją tylko w snapshocie jako lista `builders` z pozycją i celem, klient animuje bieg). (3) Każdy budowniczy biegnie do wolnego miejsca i **stawia** przedmiot, potem biegnie do następnego: w ciągu ok. 8 s serwer rozstawia **wszystko, co da się postawić**, do pełnych limitów z `balance.json` (`limit` per typ: ściany, głazy, działka, miny, kolce, klatki, platformy lecznicze), z uwzględnieniem tego, co już stoi. Rozmieszczenie: pierścień wokół graczy w promieniu 3–8 kafelków, hard objecty od strony spawnów potworów, platformy lecznicze przy graczach, kolce i miny w przejściach, bez blokowania ścieżki całkowicie (flowfield musi nadal dochodzić do graczy, inaczej potwory utkną). Każde postawienie to zwykły `place` ze zwykłym dźwiękiem i efektem, więc fala dźwięków sama buduje "plot" 50 ludzi na placu budowy. (4) Budowniczowie wybiegają za krawędź mapy i znikają, sterowanie wraca, zaczyna się zwykła przerwa. Przedmioty zostają jako normalne, postawione (R53: nie da się ich podnieść). Waga wydarzenia niższa niż Trzęsienia, bo oddaje graczom pełne limity za darmo; nie losować, gdy więcej niż połowa limitów jest już wykorzystana (nie byłoby czego stawiać). |

Zależności: V3-Q-03 i V3-Q-04 korzystają z wybuchu AoE z V3-A-04 (zrobione). Szkielet V3-Q-06 i Trzęsienie ziemi nie potrzebują płomienia ani ciemności; Deszcz ognia wymaga V3-Q-04 i V3-Q-05.

---

## Decyzje podjęte przy tym backlogu

| # | Pytanie | Decyzja | Data |
|---|---|---|---|
| R52 | Skalowanie widoku | Skala **ułamkowa**, stałe 560 x 315, gra wypełnia wysokość okna; HUD wyłącznie na planszy. Uchyla całkowitą krotność z PRD-MAP-05 (V3-B-01) | 2026-11-05 |
| R53 | Podnoszenie postawionych obiektów | **Nie da się**. Postawione / aktywne stoi do zniszczenia, dotyczy też ruin startowych i muru z ultimate. Kasuje ITM-GEN-08 i R27 (V3-J-02) | 2026-11-05 |
| R54 | Logika klawiszy | `E` podnosi i **używa**, `R` **odkłada**, obrót ściany kółkiem myszy lub `Q`, LPM = spacja. Uchyla R1 (V3-J-03, V3-J-04) | 2026-11-05 |
| R55 | Magnes kropelek | Zasięg 9 kafelków, boost 380 px/s, wartość kropelki bez zmian (5). Modyfikuje R44 (V3-L-01) | 2026-11-05 |
| R56 | Modyfikatory broni | Boost broni podnosi poziom **i** losuje jeden z trzech modyfikatorów (wachlarz / samonaprowadzanie / gwoździarka). Uchyla część PRD-PLR-04 o przebijaniu na lv3 i potrójnym strzale na lv5 (V3-I-01, V3-I-06) | 2026-11-05 |
